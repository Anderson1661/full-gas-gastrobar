import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { getTheme, saveTheme } from '../services/theme.service'
import type { AppTheme } from '../services/theme.service'

export function registerThemeIpc(): void {
  ipcMain.handle(IPC_CHANNELS.THEME_GET,  () => getTheme())
  ipcMain.handle(IPC_CHANNELS.THEME_SAVE, (_, data: Partial<AppTheme>) => {
    try {
      const updated = saveTheme(data)
      return { success: true, theme: updated }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
