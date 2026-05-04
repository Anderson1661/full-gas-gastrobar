import type { ApiResult } from '@shared/types/dtos'
import { validateSessionToken } from '../services/session.service'
import type { SessionContext } from '../services/session.service'
import { userHasPermission } from '../services/permissions.service'

type AuthOutcome =
  | { ok: true; ctx: SessionContext }
  | { ok: false; response: ApiResult }

export async function requireSession(sessionToken?: string): Promise<AuthOutcome> {
  if (!sessionToken) {
    return { ok: false, response: { success: false, error: 'Sesion requerida', code: 'UNAUTHORIZED' } }
  }

  const ctx = await validateSessionToken(sessionToken)
  if (!ctx) {
    return { ok: false, response: { success: false, error: 'Sesion invalida o expirada', code: 'UNAUTHORIZED' } }
  }

  return { ok: true, ctx }
}

export async function requireAdminSession(sessionToken?: string): Promise<AuthOutcome> {
  const auth = await requireSession(sessionToken)
  if (!auth.ok) return auth

  if (auth.ctx.roleName !== 'admin') {
    return { ok: false, response: { success: false, error: 'Se requiere rol administrador', code: 'FORBIDDEN' } }
  }

  return auth
}

export async function requirePermissionSession(
  sessionToken: string | undefined,
  permission: string
): Promise<AuthOutcome> {
  const auth = await requireSession(sessionToken)
  if (!auth.ok) return auth

  const allowed = await userHasPermission(auth.ctx.userId, permission, auth.ctx.roleName)
  if (!allowed) {
    return { ok: false, response: { success: false, error: `Se requiere permiso ${permission}`, code: 'FORBIDDEN' } }
  }

  return auth
}
