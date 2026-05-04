import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { backupService } from '../services/backup.service'
import { requirePermissionSession } from './session-auth'

export function registerBackupIpc(): void {
  ipcMain.handle(IPC_CHANNELS.BACKUP_EXPORT_SQL, async (_, { dto, sessionToken } = {}) => {
    const auth = await requirePermissionSession(sessionToken, 'backup.manage')
    if (!auth.ok) return auth.response

    return backupService.exportSql(auth.ctx, dto)
  })

  ipcMain.handle(IPC_CHANNELS.BACKUP_IMPORT_SQL, async (_, { dto, sessionToken } = {}) => {
    const auth = await requirePermissionSession(sessionToken, 'backup.restore')
    if (!auth.ok) return auth.response

    return backupService.importSql(auth.ctx, dto)
  })
}
