import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { getBranding, saveBranding } from '../services/branding.service'
import type { Branding } from '../services/branding.service'

export function registerBrandingIpc(
  onBrandingChanged?: (b: Branding) => void
): void {
  ipcMain.handle(IPC_CHANNELS.BRANDING_GET, () => getBranding())

  ipcMain.handle(IPC_CHANNELS.BRANDING_SAVE, (_, data: Partial<Branding>) => {
    try {
      const updated = saveBranding(data)
      onBrandingChanged?.(updated)
      return { success: true, branding: updated }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
