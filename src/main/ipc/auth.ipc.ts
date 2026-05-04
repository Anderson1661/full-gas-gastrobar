import { ipcMain } from 'electron'
import { authService } from '../services/auth.service'
import { sessionService } from '../services/session.service'
import { IPC_CHANNELS } from '@shared/types/ipc'
import type { LoginDTO, ChangePasswordDTO } from '@shared/types/dtos'
import { requireSession } from './session-auth'

export function registerAuthIpc(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_, dto: LoginDTO & { deviceInfo?: string }) => {
    return authService.login(dto, dto.deviceInfo)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (_, { sessionToken }: { sessionToken: string }) => {
    return authService.logout(sessionToken)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_CHANGE_PASSWORD, async (_, { dto, sessionToken }: { dto: ChangePasswordDTO; sessionToken?: string }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response
    if (auth.ctx.userId !== dto.userId && auth.ctx.roleName !== 'admin') {
      return { success: false, error: 'Solo puedes cambiar tu propia contraseña', code: 'FORBIDDEN' }
    }

    return authService.changePassword(dto, sessionToken)
  })

  ipcMain.handle(IPC_CHANNELS.SESSIONS_LIST, async (_, { sessionToken, userId }: { sessionToken: string; userId?: number }) => {
    const ctx = await import('../services/session.service').then(m => m.validateSessionToken(sessionToken))
    if (!ctx || ctx.roleName !== 'admin') return { success: false, error: 'No autorizado', code: 'UNAUTHORIZED' }
    const sessions = await sessionService.listActive(userId)
    return { success: true, data: sessions }
  })

  ipcMain.handle(IPC_CHANNELS.SESSIONS_REVOKE, async (_, { sessionToken, targetSessionId, reason }: { sessionToken: string; targetSessionId: number; reason: string }) => {
    const ctx = await import('../services/session.service').then(m => m.validateSessionToken(sessionToken))
    if (!ctx || ctx.roleName !== 'admin') return { success: false, error: 'No autorizado', code: 'UNAUTHORIZED' }
    await sessionService.revoke(targetSessionId, reason ?? 'admin_revoke', ctx.userId, ctx.username)
    return { success: true }
  })
}
