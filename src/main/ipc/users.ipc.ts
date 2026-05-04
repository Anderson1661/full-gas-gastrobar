import { ipcMain } from 'electron'
import { usersService } from '../services/users.service'
import { validateSessionToken } from '../services/session.service'
import { IPC_CHANNELS } from '@shared/types/ipc'

export function registerUsersIpc(): void {
  ipcMain.handle(IPC_CHANNELS.USERS_LIST, async () => {
    return usersService.list()
  })

  ipcMain.handle(IPC_CHANNELS.USERS_CREATE, async (_, { dto, sessionToken }: { dto: unknown; sessionToken: string }) => {
    const ctx = await validateSessionToken(sessionToken)
    if (!ctx) return { success: false, error: 'Sesión inválida', code: 'UNAUTHORIZED' }
    if (ctx.roleName !== 'admin') return { success: false, error: 'Se requiere rol administrador', code: 'FORBIDDEN' }
    return usersService.create(dto as Parameters<typeof usersService.create>[0], ctx.userId, ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.USERS_UPDATE, async (_, { dto, sessionToken }: { dto: unknown; sessionToken: string }) => {
    const ctx = await validateSessionToken(sessionToken)
    if (!ctx) return { success: false, error: 'Sesión inválida', code: 'UNAUTHORIZED' }
    if (ctx.roleName !== 'admin') return { success: false, error: 'Se requiere rol administrador', code: 'FORBIDDEN' }
    return usersService.update(dto as Parameters<typeof usersService.update>[0], ctx.userId, ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.ADMIN_UPDATE_SELF, async (_, { dto, sessionToken }: { dto: unknown; sessionToken: string }) => {
    const ctx = await validateSessionToken(sessionToken)
    if (!ctx) return { success: false, error: 'Sesión inválida', code: 'UNAUTHORIZED' }
    return usersService.updateSelf(dto as Parameters<typeof usersService.updateSelf>[0], sessionToken)
  })
}
