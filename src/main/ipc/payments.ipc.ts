import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requireSession } from './session-auth'
import { paymentsService } from '../services/payments.service'

export function registerPaymentsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.PAYMENTS_GET_BY_ORDER, async (_, orderId: number) => {
    return paymentsService.getByOrder(orderId)
  })

  ipcMain.handle(IPC_CHANNELS.PAYMENTS_METHODS, async () => {
    return paymentsService.getPaymentMethods()
  })

  ipcMain.handle(IPC_CHANNELS.PAYMENTS_REGISTER, async (_, { dto, sessionToken, actorUsername }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    return paymentsService.registerPayment(
      { ...dto, receivedBy: auth.ctx.userId },
      actorUsername ?? auth.ctx.username
    )
  })

  ipcMain.handle(IPC_CHANNELS.PAYMENTS_CLOSE_ORDER, async (_, { dto, sessionToken, actorUsername }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response

    return paymentsService.closeOrder(
      { ...dto, closedBy: auth.ctx.userId },
      actorUsername ?? auth.ctx.username
    )
  })
}
