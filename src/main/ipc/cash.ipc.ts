import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requireAdminSession, requireSession } from './session-auth'
import { cashService } from '../services/cash.service'
import type { AddCashMovementDTO } from '@shared/types/dtos'

function handleError(context: string, err: unknown): { success: false; error: string; code: string } {
  console.error(`[${context}]`, err)
  return { success: false, error: (err as Error)?.message ?? String(err), code: 'SERVER_ERROR' }
}

export function registerCashIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CASH_CURRENT_SESSION, async (_, { sessionToken } = {}) => {
    try {
      const auth = await requireSession(sessionToken)
      if (!auth.ok) return auth.response
      return cashService.getCurrentSession()
    } catch (err) {
      return handleError('CASH_CURRENT_SESSION', err)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CASH_OPEN_SESSION, async (_, { dto, sessionToken, actorUsername }) => {
    try {
      const auth = await requireAdminSession(sessionToken)
      if (!auth.ok) return auth.response
      return cashService.open({ ...dto, openedBy: auth.ctx.userId }, actorUsername ?? auth.ctx.username)
    } catch (err) {
      return handleError('CASH_OPEN_SESSION', err)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CASH_CLOSE_SESSION, async (_, { dto, sessionToken, actorUsername }) => {
    try {
      const auth = await requireAdminSession(sessionToken)
      if (!auth.ok) return auth.response
      return cashService.close({ ...dto, closedBy: auth.ctx.userId }, actorUsername ?? auth.ctx.username)
    } catch (err) {
      return handleError('CASH_CLOSE_SESSION', err)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CASH_SESSION_SUMMARY, async (_, { sessionId, sessionToken }) => {
    try {
      const auth = await requireAdminSession(sessionToken)
      if (!auth.ok) return auth.response
      const summary = await cashService.getSessionSummary(sessionId)
      if (!summary) return { success: false, error: 'Sesión no encontrada', code: 'NOT_FOUND' }
      return { success: true, data: summary }
    } catch (err) {
      return handleError('CASH_SESSION_SUMMARY', err)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CASH_LIST_SESSIONS, async (_, { sessionToken, page, pageSize } = {}) => {
    try {
      const auth = await requireSession(sessionToken)
      if (!auth.ok) return auth.response
      const result = await cashService.listSessions({ page, pageSize })
      return { success: true, data: result }
    } catch (err) {
      return handleError('CASH_LIST_SESSIONS', err)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CASH_SESSION_DETAIL, async (_, { sessionId, sessionToken } = {}) => {
    try {
      const auth = await requireSession(sessionToken)
      if (!auth.ok) return auth.response
      const summary = await cashService.getSessionSummary(sessionId)
      if (!summary) return { success: false, error: 'Sesión no encontrada', code: 'NOT_FOUND' }
      return { success: true, data: summary }
    } catch (err) {
      return handleError('CASH_SESSION_DETAIL', err)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CASH_LIST_MOVEMENTS, async (_, { sessionId, sessionToken } = {}) => {
    try {
      const auth = await requireSession(sessionToken)
      if (!auth.ok) return auth.response
      const movements = await cashService.listMovements(sessionId)
      return { success: true, data: movements }
    } catch (err) {
      return handleError('CASH_LIST_MOVEMENTS', err)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CASH_ADD_MOVEMENT, async (_, { dto, sessionToken, actorUsername }: { dto: AddCashMovementDTO; sessionToken?: string; actorUsername?: string }) => {
    try {
      const auth = await requireAdminSession(sessionToken)
      if (!auth.ok) return auth.response
      return cashService.addManualMovement(
        { ...dto, registeredBy: auth.ctx.userId },
        actorUsername ?? auth.ctx.username
      )
    } catch (err) {
      return handleError('CASH_ADD_MOVEMENT', err)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CASH_EXPORT_PDF, async (_, { sessionId, sessionToken, actorUsername } = {}) => {
    try {
      const auth = await requireAdminSession(sessionToken)
      if (!auth.ok) return auth.response

      const result = await cashService.exportSessionPdf(
        sessionId,
        actorUsername ?? auth.ctx.username,
        auth.ctx.userId
      )

      if (result.success && result.data?.path) {
        shell.openPath(result.data.path).catch((e) => {
          console.warn('[CASH_EXPORT_PDF] shell.openPath failed:', e)
        })
      }

      return result
    } catch (err) {
      return handleError('CASH_EXPORT_PDF', err)
    }
  })
}
