import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import {
  getAutoBackupConfig,
  saveAutoBackupConfig,
  runBackupNow,
  pickBackupFolder,
  restartAutoBackupScheduler,
} from '../services/auto-backup.service'

export function registerAutoBackupIpc(): void {
  ipcMain.handle(IPC_CHANNELS.AUTO_BACKUP_GET, () => getAutoBackupConfig())

  ipcMain.handle(IPC_CHANNELS.AUTO_BACKUP_SAVE, (_, data: Parameters<typeof saveAutoBackupConfig>[0]) => {
    try {
      const updated = saveAutoBackupConfig(data)
      restartAutoBackupScheduler()
      return { success: true, config: updated }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AUTO_BACKUP_RUN_NOW, () => runBackupNow())

  ipcMain.handle(IPC_CHANNELS.AUTO_BACKUP_PICK_FOLDER, () => pickBackupFolder())
}
