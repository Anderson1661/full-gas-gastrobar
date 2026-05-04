import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requireSession } from './session-auth'
import { inventoryService } from '../services/inventory.service'

export function registerInventoryIpc(): void {
  ipcMain.handle(IPC_CHANNELS.INVENTORY_ADJUST, async (_, { dto, sessionToken, actorUsername }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    return inventoryService.adjust(
      { ...dto, performedBy: auth.ctx.userId },
      actorUsername ?? auth.ctx.username
    )
  })

  ipcMain.handle(IPC_CHANNELS.INVENTORY_MOVEMENTS, async (_, { productId, limit }) => {
    return inventoryService.getMovements(productId, limit)
  })

  ipcMain.handle(IPC_CHANNELS.INVENTORY_LOW_STOCK, async () => {
    return inventoryService.getLowStock()
  })
}
