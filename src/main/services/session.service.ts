import crypto from 'crypto'
import { query, queryOne, execute } from '../database/connection'
import { settingsService } from './settings.service'
import { auditLog } from '../utils/audit'

interface SessionRow {
  id: number
  user_id: number
  session_token: string
  device_info: string | null
  ip_address: string | null
  created_at: string
  expires_at: string
  last_used_at: string
  revoked_at: string | null
  revoke_reason: string | null
  is_active: number
  username: string
  full_name: string
  role_name: string
}

export interface SessionContext {
  sessionId: number
  userId: number
  username: string
  fullName: string
  roleName: string
  deviceInfo: string | null
  ipAddress: string | null
}

export class SessionService {
  async create(
    userId: number,
    deviceInfo?: string,
    ipAddress?: string
  ): Promise<{ sessionId: number; token: string; expiresAt: string }> {
    const token = crypto.randomBytes(32).toString('hex')
    const maxHours = await settingsService.getNumber('session_max_hours') || 24
    const expiresAt = new Date(Date.now() + maxHours * 3600 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ')

    const { insertId } = await execute(
      `INSERT INTO user_sessions (user_id, session_token, device_info, ip_address, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, token, deviceInfo ?? null, ipAddress ?? null, expiresAt]
    )

    return { sessionId: insertId, token, expiresAt }
  }

  async validate(token: string): Promise<SessionContext | null> {
    if (!token) return null
    const maxIdleMinutes = await settingsService.getNumber('session_timeout_minutes') || 480

    const row = await queryOne<SessionRow>(
      `SELECT s.id, s.user_id, s.session_token, s.device_info, s.ip_address,
              s.created_at, s.expires_at, s.last_used_at, s.revoked_at, s.revoke_reason, s.is_active,
              u.username, u.full_name, r.name AS role_name
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE s.session_token = ?
         AND s.is_active = 1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND TIMESTAMPDIFF(MINUTE, s.last_used_at, NOW()) < ?
         AND u.is_active = 1
       LIMIT 1`,
      [token, maxIdleMinutes]
    )

    if (!row) return null

    // Refresh last_used_at
    await execute(
      'UPDATE user_sessions SET last_used_at = NOW() WHERE id = ?',
      [row.id]
    )

    return {
      sessionId: row.id,
      userId:    row.user_id,
      username:  row.username,
      fullName:  row.full_name,
      roleName:  row.role_name,
      deviceInfo: row.device_info,
      ipAddress:  row.ip_address,
    }
  }

  async revoke(
    sessionId: number,
    reason: string,
    actorId?: number,
    actorUsername?: string
  ): Promise<void> {
    await execute(
      `UPDATE user_sessions
       SET is_active = 0, revoked_at = NOW(), revoke_reason = ?
       WHERE id = ?`,
      [reason, sessionId]
    )

    if (actorId && actorUsername) {
      await auditLog({
        userId: actorId, username: actorUsername,
        action: 'SESSION_REVOKE', module: 'sessions',
        recordId: String(sessionId),
        description: `Sesión ${sessionId} revocada: ${reason}`
      })
    }
  }

  async revokeAllForUser(userId: number, reason: string): Promise<void> {
    await execute(
      `UPDATE user_sessions
       SET is_active = 0, revoked_at = NOW(), revoke_reason = ?
       WHERE user_id = ? AND is_active = 1`,
      [reason, userId]
    )
    invalidateSessionCache()
  }

  async listActive(userId?: number) {
    const where = userId ? 'WHERE s.user_id = ? AND s.is_active = 1 AND s.revoked_at IS NULL AND s.expires_at > NOW()' : 'WHERE s.is_active = 1 AND s.revoked_at IS NULL AND s.expires_at > NOW()'
    const params = userId ? [userId] : []
    return query(
      `SELECT s.id, s.user_id, u.username, u.full_name, s.device_info, s.ip_address,
              s.created_at, s.expires_at, s.last_used_at
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       ${where}
       ORDER BY s.last_used_at DESC`,
      params
    )
  }

  async cleanupExpired(): Promise<number> {
    const result = await execute(
      `UPDATE user_sessions
       SET is_active = 0, revoke_reason = 'expired'
       WHERE is_active = 1 AND expires_at <= NOW()`
    )
    return result.affectedRows
  }
}

export const sessionService = new SessionService()

// In-memory store for the active session token received from the renderer
// The renderer sends the token on every IPC call; we validate it here
const activeSessionMap = new Map<string, SessionContext>()

export async function validateSessionToken(token: string): Promise<SessionContext | null> {
  if (!token) return null
  const cached = activeSessionMap.get(token)
  if (cached) return cached

  const ctx = await sessionService.validate(token)
  if (ctx) {
    activeSessionMap.set(token, ctx)
    // Evict after 30 s to avoid stale cache
    setTimeout(() => activeSessionMap.delete(token), 30_000)
  }
  return ctx
}

export function invalidateSessionCache(token?: string): void {
  if (token) {
    activeSessionMap.delete(token)
  } else {
    activeSessionMap.clear()
  }
}
