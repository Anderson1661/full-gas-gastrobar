import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { checkForUpdates, downloadUpdate, quitAndInstall, getAppVersion, applyUpdaterFeed } from '../services/updater.service'
import { readUpdaterConfig, saveUpdaterConfig } from '../services/updater-config.service'
import type { UpdaterConfig } from '../services/updater-config.service'

export function registerUpdaterIpc(): void {
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK,       () => checkForUpdates())
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD,    () => downloadUpdate())
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL,     () => quitAndInstall())
  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_VERSION, () => getAppVersion())

  ipcMain.handle(IPC_CHANNELS.UPDATE_CONFIG_GET, () => {
    return readUpdaterConfig()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_CONFIG_SAVE, (_, cfg: UpdaterConfig) => {
    try {
      saveUpdaterConfig({
        enabled: Boolean(cfg.enabled),
        owner:   String(cfg.owner  ?? '').trim(),
        repo:    String(cfg.repo   ?? '').trim(),
        token:   String(cfg.token  ?? '').trim(),
      })
      applyUpdaterFeed(cfg)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
