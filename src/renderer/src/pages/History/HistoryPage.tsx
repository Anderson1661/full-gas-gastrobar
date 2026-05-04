import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { historyApi, ordersApi, paymentsApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { cn, formatCurrency } from '../../lib/utils'
import type { Order, OrderItem, Payment } from '@shared/types/entities'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClosedOrderRow {
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

interface ClosedOrdersResult {
  rows:       ClosedOrderRow[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
  totalSales: number
}

interface OrderCorrection {
  id:            number
  orderId:       number
  type:          'refund' | 'note'
  amount:        number
  reason:        string
  createdBy:     number
  createdByName: string
  createdAt:     string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function todayStr(): string   { return toDateStr(new Date()) }
function offsetDay(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n); return toDateStr(d)
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return iso }
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type RangePreset = 'today' | 'week' | 'month' | 'custom'
type StatusFilter = 'all' | 'paid' | 'cancelled'

export default function HistoryPage(): JSX.Element {
  const [rangePreset, setRangePreset]     = useState<RangePreset>('today')
  const [customFrom,  setCustomFrom]      = useState(todayStr)
  const [customTo,    setCustomTo]        = useState(todayStr)
  const [statusFilter,setStatusFilter]    = useState<StatusFilter>('all')
  const [search,      setSearch]          = useState('')
  const [page,        setPage]            = useState(1)
  const [selectedId,  setSelectedId]      = useState<number | null>(null)

  const debouncedSearch = useDebounce(search, 350)

  // Resolve from/to based on preset
  const { from, to } = useMemo(() => {
    if (rangePreset === 'today')  return { from: todayStr(),       to: todayStr() }
    if (rangePreset === 'week')   return { from: offsetDay(-6),    to: todayStr() }
    if (rangePreset === 'month')  return { from: offsetDay(-29),   to: todayStr() }
    return { from: customFrom, to: customTo }
  }, [rangePreset, customFrom, customTo])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [from, to, statusFilter, debouncedSearch])

  const queryKey = ['history', from, to, statusFilter, debouncedSearch, page]
  const { data, isLoading, isError, refetch } = useQuery<ClosedOrdersResult>({
    queryKey,
    queryFn: () => historyApi.list({ from, to, status: statusFilter, search: debouncedSearch, page, pageSize: 20 }) as Promise<ClosedOrdersResult>,
    placeholderData: (prev) => prev,
  })

  const PRESETS: { id: RangePreset; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'week',  label: '7 días' },
    { id: 'month', label: '30 días' },
    { id: 'custom',label: 'Personalizado' },
  ]

  const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
    { id: 'all',       label: 'Todas' },
    { id: 'paid',      label: 'Pagadas' },
    { id: 'cancelled', label: 'Canceladas' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Historial de cuentas</h1>
          <p className="text-sm text-muted-foreground">Consulta y corrige cuentas cerradas</p>
        </div>
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>

      {/* Date range presets */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border overflow-hidden">
          {PRESETS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setRangePreset(id)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                rangePreset === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {rangePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground text-sm">—</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={todayStr()}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
      </div>

      {/* Filters + stats row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por #cuenta, mesa o mesero..."
            className="w-full rounded-lg border border-border bg-secondary py-2 pl-9 pr-4 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden">
          {STATUS_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setStatusFilter(id)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                statusFilter === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {data && (
          <div className="flex items-center gap-4 ml-auto text-sm">
            <span className="text-muted-foreground">{data.total} cuenta{data.total !== 1 ? 's' : ''}</span>
            {statusFilter !== 'cancelled' && (
              <span className="font-semibold text-foreground">{formatCurrency(data.totalSales)}</span>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <AlertCircle size={32} className="text-destructive" />
            <p className="text-sm">Error al cargar el historial</p>
            <button onClick={() => void refetch()} className="text-xs text-primary hover:underline">
              Reintentar
            </button>
          </div>
        ) : isLoading && !data ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Mesa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Mesero</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Cerrada</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Items</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-border', isLoading && 'opacity-60')}>
                {(data?.rows ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-sm text-muted-foreground">
                      No hay cuentas en este período
                    </td>
                  </tr>
                ) : (
                  (data?.rows ?? []).map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className="hover:bg-secondary/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{row.id}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        #{row.tableNumber}
                        {row.tableName && <span className="ml-1 text-xs text-muted-foreground">· {row.tableName}</span>}
                      </td>
                      <td className="px-4 py-3 text-foreground">{row.waiterName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="text-foreground">{formatTime(row.closedAt)}</span>
                        <span className="ml-1 text-xs">{formatDate(row.closedAt)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{row.itemCount}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(row.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          row.status === 'paid'
                            ? 'bg-green-500/15 text-green-400'
                            : 'bg-red-500/15 text-red-400'
                        )}>
                          {row.status === 'paid' ? 'Pagada' : 'Cancelada'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {(data?.totalPages ?? 1) > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-40 hover:bg-secondary"
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                <span className="text-xs text-muted-foreground">
                  Página {page} de {data?.totalPages ?? 1}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data?.totalPages ?? 1, p + 1))}
                  disabled={page >= (data?.totalPages ?? 1)}
                  className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-40 hover:bg-secondary"
                >
                  Siguiente <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {selectedId !== null && (
        <OrderDetailModal
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function OrderDetailModal({ orderId, onClose }: { orderId: number; onClose: () => void }): JSX.Element {
  const { isAdmin } = useAuthStore()
  const { notify }  = useAppStore()
  const qc = useQueryClient()

  const [showCorrectionForm, setShowCorrectionForm] = useState(false)
  const [corrType,   setCorrType]   = useState<'refund' | 'note'>('note')
  const [corrAmount, setCorrAmount] = useState('')
  const [corrReason, setCorrReason] = useState('')
  const [corrSaving, setCorrSaving] = useState(false)

  const { data: order, isLoading: loadingOrder } = useQuery<Order | null>({
    queryKey: ['order-detail', orderId],
    queryFn: () => ordersApi.get(orderId) as Promise<Order | null>,
  })

  const { data: payments = [], isLoading: loadingPayments } = useQuery<Payment[]>({
    queryKey: ['order-payments', orderId],
    queryFn: () => paymentsApi.getByOrder(orderId) as Promise<Payment[]>,
  })

  const { data: corrections = [], isLoading: loadingCorrections } = useQuery<OrderCorrection[]>({
    queryKey: ['order-corrections', orderId],
    queryFn: () => historyApi.getCorrections(orderId) as Promise<OrderCorrection[]>,
  })

  const loading = loadingOrder || loadingPayments || loadingCorrections

  async function submitCorrection(): Promise<void> {
    if (!corrReason.trim()) { notify('warning', 'El motivo es obligatorio'); return }
    const amount = corrType === 'refund' ? Number(corrAmount) : 0
    if (corrType === 'refund' && (!corrAmount || isNaN(amount) || amount <= 0)) {
      notify('warning', 'Ingresa un monto válido para el reembolso')
      return
    }

    setCorrSaving(true)
    try {
      const res = await historyApi.addCorrection(orderId, { type: corrType, amount, reason: corrReason }) as { success: boolean; error?: string }
      if (res.success) {
        notify('success', 'Corrección registrada')
        void qc.invalidateQueries({ queryKey: ['order-corrections', orderId] })
        setShowCorrectionForm(false)
        setCorrReason('')
        setCorrAmount('')
        setCorrType('note')
      } else {
        notify('error', res.error ?? 'No se pudo registrar la corrección')
      }
    } catch {
      notify('error', 'Error al registrar la corrección')
    } finally {
      setCorrSaving(false)
    }
  }

  const allItems = order?.items ?? []
  const activeItems    = allItems.filter((i) => i.status === 'active')
  const cancelledItems = allItems.filter((i) => i.status === 'cancelled')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <ReceiptText size={18} className="text-primary" />
            <div>
              <h2 className="font-semibold text-foreground">
                Cuenta #{orderId}
                {order && ` · Mesa #${order.tableNumber}`}
              </h2>
              {order && (
                <p className="text-xs text-muted-foreground">
                  {order.waiterName} · {formatDateTime(order.closedAt)}
                  {order.status === 'paid' && <span className="ml-2 text-green-400 font-medium">Pagada</span>}
                  {order.status === 'cancelled' && <span className="ml-2 text-red-400 font-medium">Cancelada</span>}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Modal body */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : !order ? (
          <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">No se pudo cargar la cuenta</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-border">

              {/* Left: items */}
              <div className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Productos</h3>

                {activeItems.length === 0 && cancelledItems.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin productos</p>
                )}

                {activeItems.length > 0 && (
                  <div className="space-y-1">
                    {activeItems.map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                  </div>
                )}

                {cancelledItems.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground mt-3 mb-1">Cancelados</p>
                    {cancelledItems.map((item) => (
                      <ItemRow key={item.id} item={item} cancelled />
                    ))}
                  </div>
                )}

                {/* Totals */}
                <div className="border-t border-border pt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCurrency(order.subtotal)}</span>
                  </div>
                  {order.serviceAccepted && order.serviceCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Servicio</span>
                      <span>{formatCurrency(order.serviceCharge)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-foreground">
                    <span>Total</span>
                    <span>{formatCurrency(order.total)}</span>
                  </div>
                  <div className="flex justify-between text-green-400">
                    <span>Pagado</span>
                    <span>{formatCurrency(order.totalPaid)}</span>
                  </div>
                </div>
              </div>

              {/* Right: payments + corrections */}
              <div className="p-5 space-y-5">
                {/* Payments */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Pagos</h3>
                  {payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin pagos registrados</p>
                  ) : (
                    <div className="space-y-1.5">
                      {payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-sm rounded-lg bg-secondary/40 px-3 py-2">
                          <div>
                            <p className="text-foreground font-medium">{p.paymentMethodName}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.receivedByName}
                              {p.changeGiven > 0 && ` · cambio ${formatCurrency(p.changeGiven)}`}
                              {p.reference && ` · ${p.reference}`}
                            </p>
                          </div>
                          <span className="font-semibold text-foreground">{formatCurrency(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Corrections */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-foreground">Correcciones</h3>
                    {isAdmin() && !showCorrectionForm && (
                      <button
                        onClick={() => setShowCorrectionForm(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        + Agregar
                      </button>
                    )}
                  </div>

                  {corrections.length === 0 && !showCorrectionForm && (
                    <p className="text-sm text-muted-foreground">Sin correcciones</p>
                  )}

                  {corrections.map((c) => (
                    <div key={c.id} className={cn(
                      'rounded-lg border px-3 py-2 mb-1.5 text-sm',
                      c.type === 'refund'
                        ? 'border-amber-500/30 bg-amber-500/10'
                        : 'border-border bg-secondary/40'
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className={cn(
                            'text-xs font-semibold mr-2',
                            c.type === 'refund' ? 'text-amber-400' : 'text-muted-foreground'
                          )}>
                            {c.type === 'refund' ? 'REEMBOLSO' : 'NOTA'}
                          </span>
                          {c.type === 'refund' && (
                            <span className="text-amber-400 font-bold">{formatCurrency(c.amount)}</span>
                          )}
                          <p className="text-foreground mt-0.5">{c.reason}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.createdByName} · {formatDateTime(c.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Correction form */}
                  {showCorrectionForm && (
                    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3 mt-2">
                      <p className="text-sm font-medium text-foreground">Nueva corrección</p>

                      <div className="flex gap-2">
                        {(['note', 'refund'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setCorrType(t)}
                            className={cn(
                              'flex-1 py-2 text-xs font-medium rounded-lg border transition-all',
                              corrType === t
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-muted-foreground'
                            )}
                          >
                            {t === 'note' ? 'Nota' : 'Reembolso'}
                          </button>
                        ))}
                      </div>

                      {corrType === 'refund' && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Monto a reembolsar</p>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={corrAmount}
                            onChange={(e) => setCorrAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      )}

                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Motivo *</p>
                        <textarea
                          value={corrReason}
                          onChange={(e) => setCorrReason(e.target.value)}
                          rows={2}
                          placeholder={corrType === 'refund' ? 'Ej: Cobro duplicado en cerveza' : 'Ej: Cliente aclaró que el jugo no fue consumido'}
                          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowCorrectionForm(false); setCorrReason(''); setCorrAmount('') }}
                          className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => void submitCorrection()}
                          disabled={corrSaving}
                          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                        >
                          {corrSaving ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Opened at */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 border-t border-border">
                  <Clock size={12} />
                  Abierta: {formatDateTime(order.openedAt)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, cancelled = false }: { item: OrderItem; cancelled?: boolean }): JSX.Element {
  return (
    <div className={cn(
      'flex items-center justify-between py-1.5 px-2 rounded-lg text-sm',
      cancelled ? 'opacity-50' : 'hover:bg-secondary/30'
    )}>
      <div className={cn('min-w-0 flex-1', cancelled && 'line-through')}>
        <span className="text-foreground">{item.quantity}× {item.productName}</span>
        <span className="ml-2 text-xs text-muted-foreground">{item.categoryName}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {item.discountAmount > 0 && (
          <span className="text-xs text-green-400">-{formatCurrency(item.discountAmount)}</span>
        )}
        <span className={cn('font-medium', cancelled ? 'text-muted-foreground' : 'text-foreground')}>
          {formatCurrency(item.subtotal)}
        </span>
      </div>
    </div>
  )
}
