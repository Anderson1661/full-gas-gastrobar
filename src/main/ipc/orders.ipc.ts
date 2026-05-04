import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requireSession } from './session-auth'
import { ordersService } from '../services/orders.service'
import { settingsService } from '../services/settings.service'
import { printBarTicket } from '../utils/print'

export function registerOrdersIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ORDERS_CREATE, async (_, { dto, sessionToken }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    return ordersService.create({ ...dto, waiterId: auth.ctx.userId }, auth.ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.ORDERS_GET, async (_, id: number) => {
    return ordersService.getById(id)
  })

  ipcMain.handle(IPC_CHANNELS.ORDERS_LIST_ACTIVE, async () => {
    return ordersService.listActive()
  })

  ipcMain.handle(IPC_CHANNELS.ORDERS_CREATE_SUBORDER, async (_, { dto, sessionToken, actorUsername }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    return ordersService.createSubOrder(
      { ...dto, createdBy: auth.ctx.userId },
      actorUsername ?? auth.ctx.username
    )
  })

  ipcMain.handle(IPC_CHANNELS.ORDERS_ADD_ITEM, async (_, { dto, sessionToken, actorUsername }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    return ordersService.addItem(dto, auth.ctx.userId, actorUsername ?? auth.ctx.username)
  })

  ipcMain.handle(IPC_CHANNELS.ORDERS_CANCEL_ITEM, async (_, { dto, sessionToken, actorUsername }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    return ordersService.cancelItem(
      { ...dto, cancelledBy: auth.ctx.userId },
      auth.ctx.userId,
      actorUsername ?? auth.ctx.username
    )
  })

  ipcMain.handle(IPC_CHANNELS.ORDERS_SEND_TO_BAR, async (_, { dto, sessionToken, actorUsername }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    const orderBeforeSend = await ordersService.getById(dto.orderId)
    if (!orderBeforeSend) {
      return { success: false, error: 'Orden no encontrada', code: 'NOT_FOUND' }
    }

    const result = await ordersService.sendToBar(dto, auth.ctx.userId, actorUsername ?? auth.ctx.username)
    if (!result.success || !result.data?.length) return result

    const shouldPrint = await settingsService.getBool('print_bar_ticket')
    if (!shouldPrint) return result

    const sentIds = new Set(result.data.map((item) => item.id))
    const printableOrder = {
      ...orderBeforeSend,
      items: (orderBeforeSend.items ?? []).filter((item) => sentIds.has(item.id)),
    }

    try {
      await printBarTicket(printableOrder)
    } catch (error) {
      // Printing is non-blocking: items are already sent regardless of print outcome
      console.warn('[SEND_TO_BAR] Print failed (items remain sent):', error)
      return {
        ...result,
        printWarning: error instanceof Error ? error.message : 'Error de impresión',
      }
    }
    return result
  })

  ipcMain.handle(IPC_CHANNELS.ORDERS_REQUEST_BILL, async (_, { orderId, sessionToken }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    return ordersService.requestBill(orderId)
  })

  ipcMain.handle(IPC_CHANNELS.ORDERS_RELEASE_EMPTY, async (_, { orderId, sessionToken, actorUsername }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    return ordersService.releaseEmpty(orderId, auth.ctx.userId, actorUsername ?? auth.ctx.username)
  })
}
