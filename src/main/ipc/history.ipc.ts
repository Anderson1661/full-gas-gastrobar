import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requireSession } from './session-auth'
import { historyService } from '../services/history.service'
import type { ClosedOrderFilters, AddCorrectionDTO } from '../services/history.service'

export function registerHistoryIpc(): void {
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, async (_, filters: ClosedOrderFilters) => {
    return historyService.listClosed(filters)
  })

  ipcMain.handle(IPC_CHANNELS.HISTORY_GET_CORRECTIONS, async (_, orderId: number) => {
    return historyService.getCorrections(orderId)
  })

  ipcMain.handle(IPC_CHANNELS.HISTORY_ADD_CORRECTION, async (_, { orderId, dto, sessionToken }) => {
    const auth = await requireSession(sessionToken)
    if (!auth.ok) return auth.response
    if (auth.ctx.roleName !== 'admin') {
      return { success: false, error: 'Solo los administradores pueden registrar correcciones' }
    }

    const correctionDto: AddCorrectionDTO = {
      ...dto,
      createdBy: auth.ctx.userId,
      username:  auth.ctx.username,
      roleName:  auth.ctx.roleName,
      sessionId: auth.ctx.sessionId,
    }
    return historyService.addCorrection(orderId, correctionDto)
  })
}
