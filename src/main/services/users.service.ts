import bcrypt from 'bcryptjs'
import { asNullableTrimmed, execute, query, queryOne } from '../database/connection'
import { auditLog } from '../utils/audit'
import { authService } from './auth.service'
import { invalidatePermissionCache } from './permissions.service'
import { invalidateSessionCache, sessionService } from './session.service'
import type { User } from '@shared/types/entities'
import type { ApiResult, CreateUserDTO, UpdateAdminDTO, UpdateUserDTO } from '@shared/types/dtos'

function mapUser(row: Record<string, unknown>): User {
  return {
    id: row.id as number,
    username: row.username as string,
    fullName: row.full_name as string,
    email: row.email as string | null,
    roleId: row.role_id as number,
    roleName: row.role_name as User['roleName'],
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at as string | null,
    createdAt: row.created_at as string,
  }
}

function normalizeEmail(value: unknown): string | null {
  const normalized = asNullableTrimmed(value)
  return normalized ? normalized.toLowerCase() : null
}

function isValidEmail(email: string | null): boolean {
  if (!email) return true
  return /^[^\s@]+@[^\s@]+$/.test(email)
}

export class UsersService {
  async list(): Promise<User[]> {
    const rows = await query(
      `SELECT u.*, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ORDER BY u.full_name`
    )

    return rows.map((row) => mapUser(row as Record<string, unknown>))
  }

  async create(dto: CreateUserDTO, actorId: number, actorUsername: string): Promise<ApiResult<User>> {
    const existing = await queryOne('SELECT id FROM users WHERE username = ?', [dto.username])
    if (existing) {
      return { success: false, error: 'El nombre de usuario ya existe', code: 'DUPLICATE' }
    }

    const email = normalizeEmail(dto.email)
    if (!isValidEmail(email)) {
      return { success: false, error: 'El correo debe tener un formato valido y contener @', code: 'INVALID_EMAIL' }
    }

    if (email) {
      const duplicateEmail = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email])
      if (duplicateEmail) {
        return { success: false, error: 'El correo ya esta registrado en otro usuario', code: 'DUPLICATE_EMAIL' }
      }
    }

    if (dto.password.length < 6) {
      return { success: false, error: 'La contrasena debe tener al menos 6 caracteres', code: 'WEAK_PASSWORD' }
    }

    const hash = await authService.hashPassword(dto.password)
    const { insertId } = await execute(
      `INSERT INTO users (username, full_name, email, password_hash, role_id)
       VALUES (?, ?, ?, ?, ?)`,
      [dto.username, dto.fullName, email, hash, dto.roleId]
    )

    await auditLog({
      userId: actorId,
      username: actorUsername,
      action: 'CREATE',
      module: 'users',
      recordId: String(insertId),
      description: `Usuario "${dto.username}" creado`,
    })

    const users = await this.list()
    return { success: true, data: users.find((user) => user.id === insertId)! }
  }

  async update(dto: UpdateUserDTO, actorId: number, actorUsername: string): Promise<ApiResult<User>> {
    const current = await queryOne<{ username: string }>(
      'SELECT username FROM users WHERE id = ?',
      [dto.id]
    )
    if (!current) {
      return { success: false, error: 'Usuario no encontrado', code: 'NOT_FOUND' }
    }

    const email = dto.email !== undefined ? normalizeEmail(dto.email) : undefined
    if (email !== undefined && !isValidEmail(email)) {
      return { success: false, error: 'El correo debe tener un formato valido y contener @', code: 'INVALID_EMAIL' }
    }

    if (email) {
      const duplicateEmail = await queryOne(
        'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?',
        [email, dto.id]
      )
      if (duplicateEmail) {
        return { success: false, error: 'El correo ya esta registrado en otro usuario', code: 'DUPLICATE_EMAIL' }
      }
    }

    const updates: string[] = []
    const params: unknown[] = []

    if (dto.fullName !== undefined) {
      updates.push('full_name = ?')
      params.push(dto.fullName)
    }

    if (email !== undefined) {
      updates.push('email = ?')
      params.push(email)
    }

    if (dto.roleId !== undefined) {
      updates.push('role_id = ?')
      params.push(dto.roleId)
    }

    if (dto.isActive !== undefined) {
      updates.push('is_active = ?')
      params.push(dto.isActive ? 1 : 0)
    }

    if (!updates.length) {
      return { success: false, error: 'No hay campos para actualizar', code: 'NO_CHANGES' }
    }

    params.push(dto.id)
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)

    await auditLog({
      userId: actorId,
      username: actorUsername,
      action: 'UPDATE',
      module: 'users',
      recordId: String(dto.id),
      description: `Usuario "${current.username}" actualizado`,
      newValues: dto,
    })

    if (dto.roleId !== undefined || dto.isActive !== undefined) {
      invalidatePermissionCache(dto.id)
    }

    const users = await this.list()
    return { success: true, data: users.find((user) => user.id === dto.id)! }
  }

  async getRoles() {
    return query('SELECT id, name, description FROM roles WHERE is_active = 1 ORDER BY name')
  }

  async updateSelf(dto: UpdateAdminDTO, sessionToken?: string): Promise<ApiResult<User>> {
    const user = await queryOne<{
      id: number
      password_hash: string
      username: string
      role_name: string
      is_active: number
    }>(
      `SELECT u.id, u.password_hash, u.username, r.name AS role_name, u.is_active
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`,
      [dto.adminId]
    )

    if (!user) {
      return { success: false, error: 'Usuario no encontrado', code: 'NOT_FOUND' }
    }

    const passwordValid = await bcrypt.compare(dto.currentPassword, user.password_hash)
    if (!passwordValid) {
      return { success: false, error: 'Contrasena actual incorrecta', code: 'INVALID_PASSWORD' }
    }

    const oldValues: Record<string, unknown> = {}
    const updates: string[] = []
    const params: unknown[] = []

    if (dto.username !== undefined) {
      const taken = await queryOne(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [dto.username, dto.adminId]
      )
      if (taken) {
        return { success: false, error: 'El nombre de usuario ya existe', code: 'DUPLICATE' }
      }

      oldValues.username = user.username
      updates.push('username = ?')
      params.push(dto.username)
    }

    if (dto.fullName !== undefined) {
      updates.push('full_name = ?')
      params.push(dto.fullName)
    }

    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email)
      if (!isValidEmail(email)) {
        return { success: false, error: 'El correo debe tener un formato valido y contener @', code: 'INVALID_EMAIL' }
      }

      if (email) {
        const duplicateEmail = await queryOne(
          'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?',
          [email, dto.adminId]
        )
        if (duplicateEmail) {
          return { success: false, error: 'El correo ya esta registrado en otro usuario', code: 'DUPLICATE_EMAIL' }
        }
      }

      updates.push('email = ?')
      params.push(email)
    }

    let passwordChanged = false
    if (dto.newPassword) {
      if (dto.newPassword.length < 6) {
        return { success: false, error: 'La nueva contrasena debe tener al menos 6 caracteres', code: 'WEAK_PASSWORD' }
      }

      const newHash = await bcrypt.hash(dto.newPassword, 12)
      updates.push('password_hash = ?')
      params.push(newHash)
      passwordChanged = true
    }

    if (updates.length === 0) {
      return { success: false, error: 'No hay campos para actualizar', code: 'NO_CHANGES' }
    }

    params.push(dto.adminId)
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)

    if (passwordChanged || dto.username) {
      await sessionService.revokeAllForUser(dto.adminId, 'admin_self_update')
      if (sessionToken) {
        invalidateSessionCache(sessionToken)
      }
    }
    invalidatePermissionCache(dto.adminId)

    await auditLog({
      userId: dto.adminId,
      username: user.username,
      roleName: user.role_name,
      action: 'UPDATE_SELF',
      module: 'users',
      recordId: String(dto.adminId),
      description: 'Administrador actualizo sus propios datos',
      oldValues,
      newValues: {
        username: dto.username,
        fullName: dto.fullName,
        email: dto.email,
        passwordChanged,
      },
    })

    const users = await this.list()
    return { success: true, data: users.find((item) => item.id === dto.adminId)! }
  }
}

export const usersService = new UsersService()
