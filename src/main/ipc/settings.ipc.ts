import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requireAdminSession } from './session-auth'
import { settingsService } from '../services/settings.service'
import { auditLog } from '../utils/audit'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_, key: string) => {
    return settingsService.get(key)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    return settingsService.getAll()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_, { key, value, sessionToken }) => {
    const auth = await requireAdminSession(sessionToken)
    if (!auth.ok) return auth.response

    const oldValue = await settingsService.get(key)
    await settingsService.set(key, value, auth.ctx.userId)

    await auditLog({
      userId: auth.ctx.userId,
      username: auth.ctx.username,
      roleName: auth.ctx.roleName,
      action: 'UPDATE',
      module: 'settings',
      recordId: key,
      description: `Configuracion actualizada: ${key}`,
      oldValues: { [key]: oldValue },
      newValues: { [key]: value },
      sessionId: auth.ctx.sessionId,
    })

    return { success: true }
  })
}
