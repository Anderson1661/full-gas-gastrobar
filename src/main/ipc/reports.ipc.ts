import { ipcMain } from 'electron'
import { reportsService } from '../services/reports.service'
import { reportExportService } from '../services/report-export.service'
import { cashService } from '../services/cash.service'
import { auditLog } from '../utils/audit'
import { IPC_CHANNELS } from '@shared/types/ipc'
import { requirePermissionSession } from './session-auth'

async function auditReportAccess(
  ctx: { userId: number; username: string; roleName: string; sessionId: number } | null,
  reportName: string,
  filters: unknown
): Promise<void> {
  if (!ctx) return
  await auditLog({
    userId:      ctx.userId,
    username:    ctx.username,
    roleName:    ctx.roleName,
    action:      'VIEW_REPORT',
    module:      'reports',
    description: `Reporte consultado: ${reportName}`,
    sessionId:   ctx.sessionId,
    details:     { filters },
  })
}

export function registerReportsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.REPORTS_DASHBOARD, async () => {
    return reportsService.getDashboard()
  })

  ipcMain.handle(IPC_CHANNELS.REPORTS_SALES, async (_, filters) => {
    return reportsService.getSales(filters)
  })

  ipcMain.handle(IPC_CHANNELS.REPORTS_PRODUCTS, async (_, filters) => {
    return reportsService.getProductSales(filters)
  })

  ipcMain.handle(IPC_CHANNELS.REPORTS_PAYMENTS, async (_, filters) => {
    return reportsService.getPaymentSummary(filters)
  })

  ipcMain.handle(IPC_CHANNELS.REPORTS_PROFIT, async (_, { filters, sessionToken } = {}) => {
    if (sessionToken) {
      const ctx = await import('../services/session.service').then(m => m.validateSessionToken(sessionToken))
      await auditReportAccess(ctx as Parameters<typeof auditReportAccess>[0], 'profit', filters)
    }
    return reportsService.getProfitReport(filters)
  })

  ipcMain.handle(IPC_CHANNELS.REPORTS_EXPENSES, async (_, filters) => {
    return reportsService.getExpenseReport(filters)
  })

  ipcMain.handle(IPC_CHANNELS.REPORTS_CASH_CLOSURE, async (_, { sessionId: cashSessionId, sessionToken } = {}) => {
    if (sessionToken) {
      const ctx = await import('../services/session.service').then(m => m.validateSessionToken(sessionToken))
      await auditReportAccess(ctx as Parameters<typeof auditReportAccess>[0], 'cash_closure', { cashSessionId })
    }
    if (!cashSessionId) {
      return { success: false, error: 'Debes indicar una sesion de caja', code: 'MISSING_SESSION_ID' }
    }
    return { success: true, data: await cashService.getSessionSummary(cashSessionId) }
  })

  ipcMain.handle(IPC_CHANNELS.REPORTS_EXPORT_PDF_PACKAGE, async (_, { dto, sessionToken } = {}) => {
    const auth = await requirePermissionSession(sessionToken, 'reports.export_pdf')
    if (!auth.ok) return auth.response

    return reportExportService.exportAccountingPackage(auth.ctx, dto)
  })
}
