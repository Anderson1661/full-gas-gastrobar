import { query, queryOne, execute } from '../database/connection'
import { auditLog } from '../utils/audit'
import type { Order } from '@shared/types/entities'

export interface ClosedOrderFilters {
  from:       string              // 'YYYY-MM-DD'
  to:         string              // 'YYYY-MM-DD' (inclusive)
  status:     'all' | 'paid' | 'cancelled'
  search:     string
  page:       number
  pageSize:   number
}

export interface ClosedOrderRow {
  id:           number
  tableNumber:  number
  tableName:    string | null
  waiterName:   string
  status:       string
  subtotal:     number
  serviceCharge:number
  total:        number
  totalPaid:    number
  itemCount:    number
  openedAt:     string
  closedAt:     string | null
}

export interface ClosedOrdersResult {
  rows:       ClosedOrderRow[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
  totalSales: number
}

export interface OrderCorrection {
  id:            number
  orderId:       number
  type:          'refund' | 'note'
  amount:        number
  reason:        string
  createdBy:     number
  createdByName: string
  createdAt:     string
}

export interface AddCorrectionDTO {
  type:      'refund' | 'note'
  amount:    number
  reason:    string
  createdBy: number
  username:  string
  roleName:  string
  sessionId: number
}

export class HistoryService {
  async listClosed(filters: ClosedOrderFilters): Promise<ClosedOrdersResult> {
    const { from, to, status, search, page, pageSize } = filters
    const offset = (Math.max(1, page) - 1) * pageSize

    // Build dynamic WHERE clauses
    const conditions: string[] = [
      `o.status IN (${status === 'paid' ? "'paid'" : status === 'cancelled' ? "'cancelled'" : "'paid','cancelled'"})`,
      `DATE(o.closed_at) BETWEEN ? AND ?`,
    ]
    const params: unknown[] = [from, to]

    if (search.trim()) {
      const like = `%${search.trim()}%`
      conditions.push(`(CAST(o.id AS CHAR) LIKE ? OR CAST(t.number AS CHAR) LIKE ? OR u.full_name LIKE ?)`)
      params.push(like, like, like)
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    const countRow = await queryOne<{ total: number; totalSales: number }>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total ELSE 0 END), 0) AS totalSales
       FROM orders o
       JOIN bar_tables t ON t.id = o.table_id
       JOIN users u ON u.id = o.waiter_id
       ${where}`,
      params
    )

    const total     = Number(countRow?.total ?? 0)
    const totalSales = Number(countRow?.totalSales ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    const rows = await query<{
      id: number; table_number: number; table_name: string | null
      waiter_name: string; status: string
      subtotal: number; service_charge: number; total: number; total_paid: number
      item_count: number; opened_at: string; closed_at: string | null
    }>(
      `SELECT o.id, t.number AS table_number, t.name AS table_name,
              u.full_name AS waiter_name, o.status,
              o.subtotal, o.service_charge, o.total, o.total_paid,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.status = 'active') AS item_count,
              o.opened_at, o.closed_at
       FROM orders o
       JOIN bar_tables t ON t.id = o.table_id
       JOIN users u ON u.id = o.waiter_id
       ${where}
       ORDER BY o.closed_at DESC, o.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )

    return {
      rows: rows.map((r) => ({
        id:           r.id,
        tableNumber:  r.table_number,
        tableName:    r.table_name,
        waiterName:   r.waiter_name,
        status:       r.status,
        subtotal:     Number(r.subtotal),
        serviceCharge:Number(r.service_charge),
        total:        Number(r.total),
        totalPaid:    Number(r.total_paid),
        itemCount:    Number(r.item_count),
        openedAt:     r.opened_at,
        closedAt:     r.closed_at,
      })),
      total,
      page,
      pageSize,
      totalPages,
      totalSales,
    }
  }

  async getCorrections(orderId: number): Promise<OrderCorrection[]> {
    const rows = await query<{
      id: number; order_id: number; type: string; amount: number
      reason: string; created_by: number; full_name: string; created_at: string
    }>(
      `SELECT oc.*, u.full_name
       FROM order_corrections oc
       JOIN users u ON u.id = oc.created_by
       WHERE oc.order_id = ?
       ORDER BY oc.created_at ASC`,
      [orderId]
    )
    return rows.map((r) => ({
      id:            r.id,
      orderId:       r.order_id,
      type:          r.type as 'refund' | 'note',
      amount:        Number(r.amount),
      reason:        r.reason,
      createdBy:     r.created_by,
      createdByName: r.full_name,
      createdAt:     r.created_at,
    }))
  }

  async addCorrection(
    orderId: number,
    dto: AddCorrectionDTO
  ): Promise<{ success: boolean; id?: number; error?: string }> {
    const order = await queryOne<{ id: number; status: string }>(
      'SELECT id, status FROM orders WHERE id = ?',
      [orderId]
    )
    if (!order) return { success: false, error: 'Cuenta no encontrada' }
    if (!['paid', 'cancelled'].includes(order.status)) {
      return { success: false, error: 'Solo se pueden agregar correcciones a cuentas cerradas' }
    }

    const result = await execute(
      `INSERT INTO order_corrections (order_id, type, amount, reason, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, dto.type, dto.amount, dto.reason.trim(), dto.createdBy]
    )

    await auditLog({
      userId:      dto.createdBy,
      username:    dto.username,
      roleName:    dto.roleName,
      action:      'ORDER_CORRECTION',
      module:      'history',
      entityType:  'order',
      entityId:    String(orderId),
      description: `Corrección registrada en cuenta #${orderId}: ${dto.type}`,
      sessionId:   dto.sessionId,
      details: {
        correctionId: result.insertId,
        type:         dto.type,
        amount:       dto.amount,
        reason:       dto.reason,
      },
    })

    return { success: true, id: result.insertId }
  }
}

export const historyService = new HistoryService()
