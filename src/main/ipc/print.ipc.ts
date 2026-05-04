import { ipcMain } from 'electron'
import { printBarTicket, printReceipt } from '../utils/print'
import { settingsService } from '../services/settings.service'
import { IPC_CHANNELS } from '@shared/types/ipc'

export function registerPrintIpc(): void {
  ipcMain.handle(IPC_CHANNELS.PRINT_BAR_TICKET, async (_, { order }) => {
    try {
      await printBarTicket(order)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINT_RECEIPT, async (_, { receipt, order }) => {
    try {
      const businessName = (await settingsService.get('business_name')) ?? 'Full Gas Gastrobar'
      await printReceipt(receipt, order, businessName)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
