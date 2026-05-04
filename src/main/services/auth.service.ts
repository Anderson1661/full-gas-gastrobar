import bcrypt from 'bcryptjs'
import { query, queryOne, execute } from '../database/connection'
import { auditLog } from '../utils/audit'
import { sessionService, invalidateSessionCache } from './session.service'
import type { LoginDTO, AuthResponse, ChangePasswordDTO, ApiResult } from '@shared/types/dtos'

interface UserRow {
  id: number
  username: string
  full_name: string
  email: string | null
  password_hash: string
  role_id: number
  role_name: string
  is_active: number
  last_login_at: string | null
}

interface PermissionRow {
  name: string
}

export class AuthService {
  async login(
    dto: LoginDTO,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<ApiResult<AuthResponse & { sessionToken: string }>> {
    const user = await queryOne<UserRow>(
      `SELECT u.id, u.username, u.full_name, u.email, u.password_hash,
              u.role_id, r.name AS role_name, u.is_active, u.last_login_at
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.username = ? LIMIT 1`,
      [dto.username]
    )

    if (!user) {
      await auditLog({
        userId: 0, username: dto.username,
        action: 'LOGIN_FAILED', module: 'auth',
        description: 'Usuario no encontrado',
        result: 'failure', reason: 'user_not_found',
        deviceInfo, ipAddress
      })
      return { success: false, error: 'Usuario o contraseña incorrectos', code: 'INVALID_CREDENTIALS' }
    }

    if (!user.is_active) {
      return { success: false, error: 'Usuario inactivo. Contacte al administrador.', code: 'USER_INACTIVE' }
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password_hash)
    if (!passwordValid) {
      await auditLog({
        userId: user.id, username: user.username,
        action: 'LOGIN_FAILED', module: 'auth',
        description: 'Contraseña incorrecta',
        result: 'failure', reason: 'wrong_password',
        deviceInfo, ipAddress
      })
      return { success: false, error: 'Usuario o contraseña incorrectos', code: 'INVALID_CREDENTIALS' }
    }

    const permissions = await query<PermissionRow>(
      `SELECT p.name
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?`,
      [user.role_id]
    )

    await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])

    // Create persistent session
    const { sessionId, token, expiresAt } = await sessionService.create(user.id, deviceInfo, ipAddress)

    await auditLog({
      userId: user.id, username: user.username, roleName: user.role_name,
      action: 'LOGIN', module: 'auth',
      recordId: String(user.id), description: 'Inicio de sesión exitoso',
      sessionId, deviceInfo, ipAddress
    })

    return {
      success: true,
      data: {
        user: {
          id:          user.id,
          username:    user.username,
          fullName:    user.full_name,
          roleName:    user.role_name,
          permissions: permissions.map((p) => p.name)
        },
        token:        token,
        sessionToken: token,
        sessionId,
        expiresAt,
      } as AuthResponse & { sessionToken: string }
    }
  }

  async logout(sessionToken: string): Promise<ApiResult> {
    const { sessionService: svc } = await import('./session.service')
    const ctx = await svc.validate(sessionToken)
    if (!ctx) return { success: true }

    await sessionService.revoke(ctx.sessionId, 'logout', ctx.userId, ctx.username)
    invalidateSessionCache(sessionToken)

    await auditLog({
      userId: ctx.userId, username: ctx.username, roleName: ctx.roleName,
      action: 'LOGOUT', module: 'auth',
      recordId: String(ctx.userId), description: 'Cierre de sesión',
      sessionId: ctx.sessionId
    })

    return { success: true }
  }

  async changePassword(
    dto: ChangePasswordDTO,
    sessionToken?: string
  ): Promise<ApiResult> {
    const user = await queryOne<{ id: number; password_hash: string; username: string; role_name: string }>(
      `SELECT u.id, u.password_hash, u.username, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.is_active = 1`,
      [dto.userId]
    )

    if (!user) return { success: false, error: 'Usuario no encontrado', code: 'NOT_FOUND' }

    const valid = await bcrypt.compare(dto.currentPassword, user.password_hash)
    if (!valid) {
      return { success: false, error: 'Contraseña actual incorrecta', code: 'INVALID_PASSWORD' }
    }

    if (dto.newPassword.length < 6) {
      return { success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres', code: 'WEAK_PASSWORD' }
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12)
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, dto.userId])

    // Revocar todas las sesiones del usuario excepto la actual
    await sessionService.revokeAllForUser(dto.userId, 'password_changed')
    if (sessionToken) invalidateSessionCache(sessionToken)

    await auditLog({
      userId: dto.userId, username: user.username, roleName: user.role_name,
      action: 'CHANGE_PASSWORD', module: 'auth',
      recordId: String(dto.userId), description: 'Cambio de contraseña'
    })

    return { success: true }
  }

  async verifyAdminCredentials(
    username: string,
    password: string
  ): Promise<ApiResult<{ id: number; username: string; fullName: string }>> {
    const normalizedUsername = String(username ?? '').trim()
    const normalizedPassword = String(password ?? '')

    if (!normalizedUsername || !normalizedPassword) {
      return { success: false, error: 'Credenciales de administrador requeridas', code: 'ADMIN_AUTH_REQUIRED' }
    }

    const user = await queryOne<UserRow>(
      `SELECT u.id, u.username, u.full_name, u.email, u.password_hash,
              u.role_id, r.name AS role_name, u.is_active, u.last_login_at
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.username = ? LIMIT 1`,
      [normalizedUsername]
    )

    if (!user || !user.is_active || user.role_name !== 'admin') {
      return { success: false, error: 'Administrador no autorizado', code: 'ADMIN_INVALID' }
    }

    const passwordValid = await bcrypt.compare(normalizedPassword, user.password_hash)
    if (!passwordValid) {
      return { success: false, error: 'Contraseña de administrador incorrecta', code: 'ADMIN_INVALID_PASSWORD' }
    }

    return {
      success: true,
      data: { id: user.id, username: user.username, fullName: user.full_name }
    }
  }

  async verifyUserPassword(
    userId: number,
    password: string
  ): Promise<ApiResult<{ id: number; username: string; fullName: string; roleName: string }>> {
    const normalizedPassword = String(password ?? '')
    if (!normalizedPassword) {
      return { success: false, error: 'Debes confirmar tu contrasena actual', code: 'PASSWORD_REQUIRED' }
    }

    const user = await queryOne<UserRow>(
      `SELECT u.id, u.username, u.full_name, u.email, u.password_hash,
              u.role_id, r.name AS role_name, u.is_active, u.last_login_at
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? LIMIT 1`,
      [userId]
    )

    if (!user || !user.is_active) {
      return { success: false, error: 'Usuario no disponible para reautenticacion', code: 'USER_UNAVAILABLE' }
    }

    const passwordValid = await bcrypt.compare(normalizedPassword, user.password_hash)
    if (!passwordValid) {
      return { success: false, error: 'Contrasena actual incorrecta', code: 'INVALID_PASSWORD' }
    }

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        roleName: user.role_name,
      },
    }
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12)
  }
}

export const authService = new AuthService()
