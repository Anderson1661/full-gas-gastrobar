import { app } from 'electron'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { query, queryOne, execute, withTransaction } from '../database/connection'
import { auditLog } from '../utils/audit'
import { renderPdfToFile } from '../utils/pdf'
import type { CashSession, CashMovement, CashSessionSummary } from '@shared/types/entities'
import type {
  OpenCashSessionDTO,
  CloseCashSessionDTO,
  AddCashMovementDTO,
  ApiResult,
} from '@shared/types/dtos'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function mapSession(r: Record<string, unknown>): CashSession {
  return {
    id:                r.id as number,
    openedBy:          r.opened_by as number,
    openedByName:      r.opened_by_name as string,
    closedBy:          r.closed_by as number | null,
    closedByName:      r.closed_by_name as string | null,
    openingAmount:     Number(r.opening_amount),
    closingAmountReal: r.closing_amount_real ? Number(r.closing_amount_real) : null,
    status:            r.status as 'open' | 'closed',
    notes:             r.notes as string | null,
    openedAt:          r.opened_at as string,
    closedAt:          r.closed_at as string | null,
    pdfPath:           r.pdf_path as string | null,
  }
}

export class CashService {
  async getCurrentSession(): Promise<CashSession | null> {
    const row = await queryOne(
      `SELECT cs.*, u.full_name AS opened_by_name, u2.full_name AS closed_by_name
       FROM cash_sessions cs
       JOIN users u ON u.id = cs.opened_by
       LEFT JOIN users u2 ON u2.id = cs.closed_by
       WHERE cs.status = 'open' ORDER BY cs.opened_at DESC LIMIT 1`
    )
    if (!row) return null
    return mapSession(row as Record<string, unknown>)
  }

  async open(dto: OpenCashSessionDTO, actorUsername: string): Promise<ApiResult<CashSession>> {
    const existing = await this.getCurrentSession()
    if (existing) {
      return { success: false, error: 'Ya hay una sesión de caja abierta', code: 'SESSION_OPEN' }
    }

    const { insertId } = await execute(
      `INSERT INTO cash_sessions (opened_by, opening_amount, status) VALUES (?, ?, 'open')`,
      [dto.openedBy, dto.openingAmount]
    )

    await auditLog({
      userId: dto.openedBy, username: actorUsername,
      action: 'OPEN', module: 'cash', recordId: String(insertId),
      description: `Caja abierta con base ${formatCurrency(dto.openingAmount)}`,
      newValues: { openingAmount: dto.openingAmount, openedBy: dto.openedBy },
    })

    const session = await this.getCurrentSession()
    return { success: true, data: session! }
  }

  async close(dto: CloseCashSessionDTO, actorUsername: string): Promise<ApiResult> {
    const session = await queryOne<{ id: number; status: string; opening_amount: number }>(
      'SELECT id, status, opening_amount FROM cash_sessions WHERE id = ?', [dto.sessionId]
    )
    if (!session || session.status !== 'open') {
      return { success: false, error: 'Sesión de caja no encontrada o ya cerrada', code: 'NOT_FOUND' }
    }

    const theoretical = await query<{ payment_method_id: number; total: number }>(
      `SELECT p.payment_method_id, SUM(p.amount) AS total
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE o.cash_session_id = ?
       GROUP BY p.payment_method_id`,
      [dto.sessionId]
    )

    await withTransaction(async (conn) => {
      for (const detail of dto.detailsByMethod) {
        const theo = theoretical.find(
          t => (t as unknown as { payment_method_id: number }).payment_method_id === detail.paymentMethodId
        )
        const theoreticalAmount = theo ? Number((theo as unknown as { total: number }).total) : 0
        const difference = detail.realAmount - theoreticalAmount

        await conn.execute(
          `INSERT INTO cash_closure_details
             (cash_session_id, payment_method_id, theoretical_amount, real_amount, difference)
           VALUES (?, ?, ?, ?, ?)`,
          [dto.sessionId, detail.paymentMethodId, theoreticalAmount, detail.realAmount, difference]
        )
      }

      await conn.execute(
        `UPDATE cash_sessions
         SET status = 'closed', closed_by = ?, closing_amount_real = ?, closed_at = NOW(), notes = ?
         WHERE id = ?`,
        [dto.closedBy, dto.closingAmountReal, dto.notes ?? null, dto.sessionId]
      )
    })

    await auditLog({
      userId: dto.closedBy, username: actorUsername,
      action: 'CLOSE', module: 'cash', recordId: String(dto.sessionId),
      description: `Caja cerrada. Real: ${formatCurrency(dto.closingAmountReal)}`,
      newValues: {
        closingAmountReal: dto.closingAmountReal,
        detailsByMethod: dto.detailsByMethod,
        notes: dto.notes,
      },
    })

    return { success: true }
  }

  async getSessionSummary(sessionId: number): Promise<CashSessionSummary | null> {
    const sessionRow = await queryOne(
      `SELECT cs.*, u.full_name AS opened_by_name, u2.full_name AS closed_by_name
       FROM cash_sessions cs
       JOIN users u ON u.id = cs.opened_by
       LEFT JOIN users u2 ON u2.id = cs.closed_by
       WHERE cs.id = ?`,
      [sessionId]
    )
    if (!sessionRow) return null
    const session = mapSession(sessionRow as Record<string, unknown>)

    const [totalsRow] = await query<{ orders: number; total_sales: number; total_service: number }>(
      `SELECT COUNT(DISTINCT o.id) AS orders,
              COALESCE(SUM(r.total), 0) AS total_sales,
              COALESCE(SUM(r.service_charge), 0) AS total_service
       FROM orders o
       JOIN receipts r ON r.order_id = o.id
       WHERE o.cash_session_id = ? AND r.voided = 0`,
      [sessionId]
    )

    const byMethod = await query<{ methodId: number; methodName: string; total: number }>(
      `SELECT pm.id AS methodId, pm.name AS methodName, COALESCE(SUM(p.amount), 0) AS total
       FROM payments p
       JOIN payment_methods pm ON pm.id = p.payment_method_id
       JOIN orders o ON o.id = p.order_id
       WHERE o.cash_session_id = ?
       GROUP BY pm.id, pm.name`,
      [sessionId]
    )

    const [expensesRow] = await query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE cash_session_id = ?`,
      [sessionId]
    )

    const [manualRow] = await query<{ total_in: number; total_out: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS total_in,
         COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) AS total_out
       FROM cash_movements WHERE cash_session_id = ?`,
      [sessionId]
    )

    const closureDetails = await query<{
      payment_method_id: number
      method_name: string
      theoretical_amount: number
      real_amount: number | null
      difference: number | null
    }>(
      `SELECT ccd.payment_method_id, pm.name AS method_name,
              ccd.theoretical_amount, ccd.real_amount, ccd.difference
       FROM cash_closure_details ccd
       JOIN payment_methods pm ON pm.id = ccd.payment_method_id
       WHERE ccd.cash_session_id = ?`,
      [sessionId]
    )

    const totalSales    = Number((totalsRow as Record<string, unknown>)?.total_sales ?? 0)
    const totalService  = Number((totalsRow as Record<string, unknown>)?.total_service ?? 0)
    const totalExpenses = Number((expensesRow as Record<string, unknown>)?.total ?? 0)
    const totalManualIn  = Number((manualRow as Record<string, unknown>)?.total_in ?? 0)
    const totalManualOut = Number((manualRow as Record<string, unknown>)?.total_out ?? 0)

    const cashMethodRow = (byMethod as { methodId: number; methodName: string; total: number }[])
      .find(m => m.methodName?.toLowerCase().includes('efectivo') || m.methodName?.toLowerCase().includes('cash'))
    const cashIncome = cashMethodRow ? Number(cashMethodRow.total) : 0

    const expectedCash = session.openingAmount + cashIncome - totalExpenses + totalManualIn - totalManualOut

    const realCash = session.closingAmountReal
    const difference = realCash !== null ? realCash - expectedCash : null

    return {
      session,
      totalOrders:   Number((totalsRow as Record<string, unknown>)?.orders ?? 0),
      totalSales,
      totalService,
      totalExpenses,
      totalManualIn,
      totalManualOut,
      byMethod: (byMethod as { methodId: number; methodName: string; total: number }[]).map(m => ({
        methodId:   Number(m.methodId),
        methodName: String(m.methodName),
        total:      Number(m.total),
      })),
      closureDetails: (closureDetails as {
        payment_method_id: number
        method_name: string
        theoretical_amount: number
        real_amount: number | null
        difference: number | null
      }[]).map(d => ({
        paymentMethodId:   d.payment_method_id,
        paymentMethodName: d.method_name,
        theoreticalAmount: Number(d.theoretical_amount),
        realAmount:        d.real_amount !== null ? Number(d.real_amount) : null,
        difference:        d.difference !== null ? Number(d.difference) : null,
      })),
      expectedCash,
      difference,
    }
  }

  async listSessions(
    filters?: { page?: number; pageSize?: number }
  ): Promise<{ data: CashSession[]; total: number }> {
    const DEFAULT_PAGE = 1
    const DEFAULT_PAGE_SIZE = 50
    const MAX_PAGE_SIZE = 200

    const rawPage = Number(filters?.page ?? DEFAULT_PAGE)
    const rawPageSize = Number(filters?.pageSize ?? DEFAULT_PAGE_SIZE)

    const page =
      Number.isInteger(rawPage) && rawPage > 0 ? rawPage : DEFAULT_PAGE
    const pageSize =
      Number.isInteger(rawPageSize) && rawPageSize > 0
        ? Math.min(rawPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE

    const limit = pageSize
    const offset = (page - 1) * pageSize

    const [countRow] = await query<{ total: number }>('SELECT COUNT(*) AS total FROM cash_sessions')
    const total = Number((countRow as Record<string, unknown>)?.total ?? 0)

    const rows = await query(
      `SELECT cs.*, u.full_name AS opened_by_name, u2.full_name AS closed_by_name
       FROM cash_sessions cs
       JOIN users u ON u.id = cs.opened_by
       LEFT JOIN users u2 ON u2.id = cs.closed_by
       ORDER BY cs.opened_at DESC
       LIMIT ${limit} OFFSET ${offset}`
    )

    return {
      total,
      data: (rows as Record<string, unknown>[]).map(mapSession),
    }
  }

  async listMovements(sessionId: number): Promise<CashMovement[]> {
    const payments = await query<Record<string, unknown>>(
      `SELECT
         CONCAT('pay_', p.id)  AS id,
         o.cash_session_id     AS cashSessionId,
         'in'                  AS type,
         'sale'                AS concept,
         p.amount              AS amount,
         CONCAT(pm.name, ' - Mesa ', bt.number) AS description,
         p.received_by         AS registeredBy,
         u.full_name           AS registeredByName,
         p.created_at          AS createdAt
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       JOIN payment_methods pm ON pm.id = p.payment_method_id
       JOIN bar_tables bt ON bt.id = o.table_id
       JOIN users u ON u.id = p.received_by
       WHERE o.cash_session_id = ?`,
      [sessionId]
    )

    const expenses = await query<Record<string, unknown>>(
      `SELECT
         CONCAT('exp_', e.id)  AS id,
         e.cash_session_id     AS cashSessionId,
         'out'                 AS type,
         'expense'             AS concept,
         e.amount              AS amount,
         e.description         AS description,
         e.registered_by       AS registeredBy,
         u.full_name           AS registeredByName,
         e.created_at          AS createdAt
       FROM expenses e
       JOIN users u ON u.id = e.registered_by
       WHERE e.cash_session_id = ?`,
      [sessionId]
    )

    const manuals = await query<Record<string, unknown>>(
      `SELECT
         CONCAT('mov_', m.id)  AS id,
         m.cash_session_id     AS cashSessionId,
         m.type,
         m.concept,
         m.amount,
         m.description,
         m.registered_by       AS registeredBy,
         u.full_name           AS registeredByName,
         m.created_at          AS createdAt
       FROM cash_movements m
       JOIN users u ON u.id = m.registered_by
       WHERE m.cash_session_id = ?`,
      [sessionId]
    )

    const all = [...payments, ...expenses, ...manuals] as Record<string, unknown>[]
    all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))

    return all.map(r => ({
      id:              r.id as string,
      cashSessionId:   Number(r.cashSessionId),
      type:            r.type as 'in' | 'out',
      concept:         r.concept as CashMovement['concept'],
      amount:          Number(r.amount),
      description:     r.description as string | null,
      registeredBy:    r.registeredBy ? Number(r.registeredBy) : null,
      registeredByName:r.registeredByName as string | null,
      createdAt:       r.createdAt as string,
    }))
  }

  async addManualMovement(dto: AddCashMovementDTO, actorUsername: string): Promise<ApiResult<{ id: number }>> {
    const session = await queryOne<{ id: number; status: string }>(
      'SELECT id, status FROM cash_sessions WHERE id = ? AND status = ?',
      [dto.cashSessionId, 'open']
    )
    if (!session) {
      return { success: false, error: 'No hay sesión de caja activa para registrar el movimiento', code: 'NO_SESSION' }
    }

    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
      return { success: false, error: 'El monto debe ser mayor a cero', code: 'INVALID_AMOUNT' }
    }

    const { insertId } = await execute(
      `INSERT INTO cash_movements (cash_session_id, type, concept, amount, description, registered_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dto.cashSessionId, dto.type, dto.concept, dto.amount, dto.description ?? null, dto.registeredBy]
    )

    await auditLog({
      userId: dto.registeredBy, username: actorUsername,
      action: dto.type === 'in' ? 'MANUAL_IN' : 'MANUAL_OUT',
      module: 'cash', recordId: String(insertId),
      description: `Movimiento manual ${dto.type === 'in' ? 'ingreso' : 'egreso'}: ${formatCurrency(dto.amount)} - ${dto.description ?? ''}`,
      newValues: { type: dto.type, concept: dto.concept, amount: dto.amount },
    })

    return { success: true, data: { id: insertId } }
  }

  async exportSessionPdf(sessionId: number, actorUsername: string, actorUserId: number): Promise<ApiResult<{ path: string }>> {
    const summary = await this.getSessionSummary(sessionId)
    if (!summary) {
      return { success: false, error: 'Sesión de caja no encontrada', code: 'NOT_FOUND' }
    }

    const { session } = summary
    const isOpen = session.status === 'open'

    const byMethodRows = summary.byMethod.map(m => [
      escapeHtml(m.methodName),
      formatCurrency(m.total),
    ])

    const detailRows = summary.closureDetails.length > 0
      ? summary.closureDetails.map(d => [
          escapeHtml(d.paymentMethodName),
          formatCurrency(d.theoreticalAmount),
          d.realAmount !== null ? formatCurrency(d.realAmount) : '—',
          d.difference !== null
            ? `<span style="color:${d.difference >= 0 ? 'green' : 'red'}">${formatCurrency(d.difference)}</span>`
            : '—',
        ])
      : byMethodRows.map(r => [...r, '—', '—'])

    const openedAt  = new Date(session.openedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
    const closedAt  = session.closedAt ? new Date(session.closedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'En curso'
    const generatedAt = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <style>
    :root { color-scheme: light; --accent: #b45309; --text: #111827; --muted: #6b7280; --border: #d1d5db; --soft: #f9fafb; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px 32px; font-family: "Segoe UI", Arial, sans-serif; color: var(--text); background: white; }
    header { border-bottom: 2px solid var(--accent); padding-bottom: 12px; margin-bottom: 20px; }
    h1 { margin: 0 0 4px; font-size: 22px; color: var(--accent); }
    .subtitle { color: var(--muted); font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .card { border: 1px solid var(--border); background: var(--soft); border-radius: 10px; padding: 12px; }
    .card-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
    .card-value { font-size: 17px; font-weight: 700; }
    h2 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th { background: #f3f4f6; border-bottom: 1px solid var(--border); padding: 7px; text-align: left; }
    tbody td { border-bottom: 1px solid #e5e7eb; padding: 7px; }
    footer { margin-top: 20px; font-size: 11px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 8px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-open { background: #dcfce7; color: #166534; }
    .badge-closed { background: #f1f5f9; color: #475569; }
  </style>
</head>
<body>
  <header>
    <h1>Full Gas Gastrobar &mdash; Cierre de Caja ${isOpen ? '<span class="badge badge-open">EN CURSO</span>' : '<span class="badge badge-closed">CERRADA</span>'}</h1>
    <div class="subtitle">Sesión #${session.id} &bull; Apertura: ${openedAt} &bull; Cierre: ${closedAt}</div>
  </header>

  <div class="grid">
    <div class="card">
      <div class="card-label">Base inicial</div>
      <div class="card-value">${formatCurrency(session.openingAmount)}</div>
    </div>
    <div class="card">
      <div class="card-label">Total ventas</div>
      <div class="card-value">${formatCurrency(summary.totalSales)}</div>
    </div>
    <div class="card">
      <div class="card-label">Total gastos</div>
      <div class="card-value">${formatCurrency(summary.totalExpenses)}</div>
    </div>
    <div class="card">
      <div class="card-label">Movimientos manuales (+)</div>
      <div class="card-value">${formatCurrency(summary.totalManualIn)}</div>
    </div>
    <div class="card">
      <div class="card-label">Movimientos manuales (-)</div>
      <div class="card-value">${formatCurrency(summary.totalManualOut)}</div>
    </div>
    <div class="card">
      <div class="card-label">Efectivo esperado</div>
      <div class="card-value">${formatCurrency(summary.expectedCash)}</div>
    </div>
    ${session.closingAmountReal !== null ? `
    <div class="card">
      <div class="card-label">Efectivo contado</div>
      <div class="card-value">${formatCurrency(session.closingAmountReal)}</div>
    </div>
    <div class="card">
      <div class="card-label">Diferencia</div>
      <div class="card-value" style="color:${(summary.difference ?? 0) >= 0 ? 'green' : 'red'}">${formatCurrency(summary.difference ?? 0)}</div>
    </div>` : ''}
  </div>

  <h2>Ingresos por método de pago</h2>
  <table>
    <thead><tr><th>Método</th><th>Sistema</th><th>Real</th><th>Diferencia</th></tr></thead>
    <tbody>
      ${detailRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>

  ${session.notes ? `<h2>Observaciones</h2><p style="font-size:13px">${escapeHtml(session.notes)}</p>` : ''}

  <footer>Generado: ${generatedAt} &bull; Por: ${escapeHtml(actorUsername)} &bull; Full Gas Gastrobar POS</footer>
</body>
</html>`

    try {
      const reportsDir = join(app.getPath('userData'), 'reports', 'cash')
      await mkdir(reportsDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename  = `caja_${sessionId}_${timestamp}.pdf`
      const filePath  = join(reportsDir, filename)

      await renderPdfToFile(filePath, html)

      await execute(
        `UPDATE cash_sessions SET pdf_path = ? WHERE id = ?`,
        [filePath, sessionId]
      )

      await auditLog({
        userId: actorUserId, username: actorUsername,
        action: 'EXPORT_PDF', module: 'cash', recordId: String(sessionId),
        description: `PDF de cierre de caja exportado: sesión #${sessionId}`,
        details: { path: filePath },
      })

      return { success: true, data: { path: filePath } }
    } catch (err) {
      return { success: false, error: String((err as Error).message), code: 'PDF_ERROR' }
    }
  }
}

export const cashService = new CashService()
