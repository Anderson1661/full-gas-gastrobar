import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Vault, AlertTriangle, CheckCircle2, ArrowDownCircle, ArrowUpCircle,
  FileText, RefreshCw, Plus, Clock, ChevronLeft, ChevronRight,
  TrendingUp, Wallet, CreditCard, X
} from 'lucide-react'
import { cashApi, paymentsApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { formatCurrency, formatDate } from '../../lib/utils'
import type { CashSession, CashSessionSummary, CashMovement } from '@shared/types/entities'
import type { PaymentMethod } from '@shared/types/entities'
import RefreshButton from '../../components/shared/RefreshButton'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(dt: string | null): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function conceptLabel(concept: string): string {
  const map: Record<string, string> = {
    sale:       'Venta',
    expense:    'Gasto',
    manual_in:  'Ingreso manual',
    manual_out: 'Egreso manual',
    adjustment: 'Ajuste',
  }
  return map[concept] ?? concept
}

// ── sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Open Modal ───────────────────────────────────────────────────────────────

function OpenCashModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (session: CashSession) => void
}): JSX.Element {
  const { user } = useAuthStore()
  const { notify } = useAppStore()
  const qc = useQueryClient()

  const [amount, setAmount] = useState('')
  const [notes, setNotes]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!user || !Number.isFinite(parsed) || parsed < 0) {
      notify('error', 'Ingresa un monto inicial válido (puede ser 0)')
      return
    }

    setLoading(true)
    try {
      const result = await cashApi.open({ openingAmount: parsed, notes: notes || undefined }, user.username) as { success: boolean; data?: CashSession; error?: string }
      if (result.success && result.data) {
        notify('success', 'Caja abierta correctamente')
        qc.invalidateQueries({ queryKey: ['cash-session'] })
        qc.invalidateQueries({ queryKey: ['cash-history'] })
        onSuccess(result.data)
      } else {
        notify('error', result.error ?? 'Error al abrir la caja')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-card border border-border p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Abrir sesión de caja</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
        </div>

        <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Monto inicial (base de caja)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Observaciones (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? 'Abriendo...' : 'Abrir caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Close Modal ──────────────────────────────────────────────────────────────

function CloseCashModal({
  session,
  summary,
  methods,
  onClose,
  onSuccess,
}: {
  session: CashSession
  summary: CashSessionSummary
  methods: PaymentMethod[]
  onClose: () => void
  onSuccess: () => void
}): JSX.Element {
  const { user } = useAuthStore()
  const { notify, setCashSession } = useAppStore()
  const qc = useQueryClient()

  const [realCash, setRealCash]   = useState('')
  const [realByMethod, setRealByMethod] = useState<Record<number, string>>({})
  const [notes, setNotes]         = useState(session.notes ?? '')
  const [loading, setLoading]     = useState(false)

  const parsedRealCash = parseFloat(realCash)
  const expectedCash   = summary.expectedCash
  const difference     = Number.isFinite(parsedRealCash) ? parsedRealCash - expectedCash : null

  async function handleClose(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!user || !Number.isFinite(parsedRealCash)) {
      notify('error', 'Ingresa el efectivo contado')
      return
    }

    const detailsByMethod = summary.byMethod.map(m => ({
      paymentMethodId: m.methodId,
      realAmount: parseFloat(realByMethod[m.methodId] ?? String(m.total)) || m.total,
    }))

    setLoading(true)
    try {
      const result = await cashApi.close(
        {
          sessionId: session.id,
          closingAmountReal: parsedRealCash,
          detailsByMethod,
          notes: notes || undefined,
        },
        user.username
      ) as { success: boolean; error?: string }

      if (result.success) {
        notify('success', 'Caja cerrada correctamente')
        setCashSession(null)
        qc.invalidateQueries({ queryKey: ['cash-session'] })
        qc.invalidateQueries({ queryKey: ['cash-history'] })
        onSuccess()
      } else {
        notify('error', result.error ?? 'Error al cerrar la caja')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-card border border-border p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Cerrar sesión de caja</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
        </div>

        {/* Resumen del sistema */}
        <div className="rounded-lg border border-border bg-background/50 p-4 mb-4 space-y-2 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resumen del sistema</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Base inicial:</span><span className="font-medium">{formatCurrency(session.openingAmount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total ventas:</span><span className="font-medium text-green-400">{formatCurrency(summary.totalSales)}</span></div>
          {summary.byMethod.map(m => (
            <div key={m.methodId} className="flex justify-between pl-4 text-xs">
              <span className="text-muted-foreground">{m.methodName}:</span>
              <span>{formatCurrency(m.total)}</span>
            </div>
          ))}
          <div className="flex justify-between"><span className="text-muted-foreground">Total gastos:</span><span className="font-medium text-red-400">{formatCurrency(summary.totalExpenses)}</span></div>
          {(summary.totalManualIn > 0 || summary.totalManualOut > 0) && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Ingresos manuales:</span><span className="font-medium text-blue-400">{formatCurrency(summary.totalManualIn)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Egresos manuales:</span><span className="font-medium text-orange-400">{formatCurrency(summary.totalManualOut)}</span></div>
            </>
          )}
          <div className="flex justify-between border-t border-border pt-2 mt-1"><span className="font-medium">Efectivo esperado:</span><span className="font-bold">{formatCurrency(summary.expectedCash)}</span></div>
        </div>

        <form onSubmit={e => void handleClose(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Efectivo contado en caja</label>
            <input
              type="number" min="0" step="0.01"
              value={realCash} onChange={e => setRealCash(e.target.value)}
              placeholder="0.00" required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {difference !== null && (
              <p className={`mt-1 text-xs font-medium ${difference >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                Diferencia: {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
                {Math.abs(difference) > 0 && (difference > 0 ? ' (sobrante)' : ' (faltante)')}
              </p>
            )}
          </div>

          {methods.length > 0 && summary.byMethod.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Monto real por método (opcional)</p>
              <div className="space-y-2">
                {summary.byMethod.map(m => (
                  <div key={m.methodId} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 truncate">{m.methodName}:</span>
                    <input
                      type="number" min="0" step="0.01"
                      placeholder={String(m.total)}
                      value={realByMethod[m.methodId] ?? ''}
                      onChange={e => setRealByMethod(prev => ({ ...prev, [m.methodId]: e.target.value }))}
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Observaciones</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {difference !== null && Math.abs(difference) > 5000 && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-400">
              <AlertTriangle size={13} className="inline mr-1"/>
              La diferencia es mayor a $5,000. Verifica el conteo antes de confirmar.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
              {loading ? 'Cerrando...' : 'Confirmar cierre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Manual Movement Modal ────────────────────────────────────────────────────

function AddMovementModal({
  sessionId,
  onClose,
}: {
  sessionId: number
  onClose: () => void
}): JSX.Element {
  const { user } = useAuthStore()
  const { notify } = useAppStore()
  const qc = useQueryClient()

  const [type, setType]           = useState<'in' | 'out'>('in')
  const [amount, setAmount]       = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading]     = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!user || !Number.isFinite(parsed) || parsed <= 0) {
      notify('error', 'El monto debe ser mayor a cero')
      return
    }
    setLoading(true)
    try {
      const result = await cashApi.addMovement(
        {
          cashSessionId: sessionId,
          type,
          concept: type === 'in' ? 'manual_in' : 'manual_out',
          amount: parsed,
          description: description || undefined,
          registeredBy: user.id,
        },
        user.username
      ) as { success: boolean; error?: string }

      if (result.success) {
        notify('success', `Movimiento de ${type === 'in' ? 'ingreso' : 'egreso'} registrado`)
        qc.invalidateQueries({ queryKey: ['cash-movements', sessionId] })
        qc.invalidateQueries({ queryKey: ['cash-detail', sessionId] })
        onClose()
      } else {
        notify('error', result.error ?? 'Error al registrar movimiento')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-card border border-border p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Movimiento manual</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
        </div>

        <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
          <div className="flex gap-2">
            <button type="button"
              onClick={() => setType('in')}
              className={`flex-1 rounded border px-3 py-2 text-sm font-medium transition-colors ${type === 'in' ? 'border-green-500 bg-green-500/20 text-green-400' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
              <ArrowDownCircle size={14} className="inline mr-1"/> Ingreso
            </button>
            <button type="button"
              onClick={() => setType('out')}
              className={`flex-1 rounded border px-3 py-2 text-sm font-medium transition-colors ${type === 'out' ? 'border-red-500 bg-red-500/20 text-red-400' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
              <ArrowUpCircle size={14} className="inline mr-1"/> Egreso
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Monto</label>
            <input
              type="number" min="0.01" step="0.01"
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Descripción</label>
            <input
              type="text"
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Motivo del movimiento"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Session Detail Modal ─────────────────────────────────────────────────────

function SessionDetailModal({
  sessionId,
  onClose,
}: {
  sessionId: number
  onClose: () => void
}): JSX.Element {
  const { user } = useAuthStore()
  const { notify } = useAppStore()

  const { data: detailResult, isLoading } = useQuery({
    queryKey: ['cash-detail', sessionId],
    queryFn: () => cashApi.sessionDetail(sessionId) as Promise<{ success: boolean; data?: CashSessionSummary }>,
    enabled: !!sessionId,
  })

  const summary = detailResult?.data

  const [exporting, setExporting] = useState(false)

  async function handleExportPdf(): Promise<void> {
    if (!user || !summary) return
    setExporting(true)
    try {
      const result = await cashApi.exportPdf(sessionId, user.username) as { success: boolean; error?: string }
      if (result.success) {
        notify('success', 'PDF generado y abierto')
      } else {
        notify('error', result.error ?? 'Error al generar PDF')
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-card border border-border p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Detalle de sesión #{sessionId}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"/>
          </div>
        )}

        {summary && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <SummaryCard label="Base inicial" value={formatCurrency(summary.session.openingAmount)} />
              <SummaryCard label="Total ventas" value={formatCurrency(summary.totalSales)} sub={`${summary.totalOrders} órdenes`} />
              <SummaryCard label="Total gastos" value={formatCurrency(summary.totalExpenses)} />
              <SummaryCard label="Efectivo esperado" value={formatCurrency(summary.expectedCash)} />
              {summary.session.closingAmountReal !== null && (
                <>
                  <SummaryCard label="Efectivo contado" value={formatCurrency(summary.session.closingAmountReal)} />
                  <SummaryCard label="Diferencia" value={`${(summary.difference ?? 0) >= 0 ? '+' : ''}${formatCurrency(summary.difference ?? 0)}`} />
                </>
              )}
            </div>

            {summary.byMethod.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Por método de pago</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground">Método</th>
                        <th className="px-3 py-2 text-right text-xs text-muted-foreground">Sistema</th>
                        <th className="px-3 py-2 text-right text-xs text-muted-foreground">Real</th>
                        <th className="px-3 py-2 text-right text-xs text-muted-foreground">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.closureDetails.length > 0
                        ? summary.closureDetails.map(d => (
                            <tr key={d.paymentMethodId} className="border-t border-border">
                              <td className="px-3 py-2">{d.paymentMethodName}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(d.theoreticalAmount)}</td>
                              <td className="px-3 py-2 text-right">{d.realAmount !== null ? formatCurrency(d.realAmount) : '—'}</td>
                              <td className={`px-3 py-2 text-right font-medium ${(d.difference ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {d.difference !== null ? formatCurrency(d.difference) : '—'}
                              </td>
                            </tr>
                          ))
                        : summary.byMethod.map(m => (
                            <tr key={m.methodId} className="border-t border-border">
                              <td className="px-3 py-2">{m.methodName}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(m.total)}</td>
                              <td className="px-3 py-2 text-right">—</td>
                              <td className="px-3 py-2 text-right">—</td>
                            </tr>
                          ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {summary.session.notes && (
              <div className="mb-4 rounded border border-border bg-background/50 p-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Observaciones: </span>
                {summary.session.notes}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => void handleExportPdf()} disabled={exporting}
                className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <FileText size={14}/>
                {exporting ? 'Generando PDF...' : 'Exportar PDF'}
              </button>
              <button onClick={onClose}
                className="inline-flex items-center gap-2 rounded border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CashPage(): JSX.Element {
  const { user, isAdmin } = useAuthStore()
  const { notify, cashSessionId, setCashSession } = useAppStore()
  const qc = useQueryClient()

  const [tab,            setTab]            = useState<'current' | 'history'>('current')
  const [showOpen,       setShowOpen]       = useState(false)
  const [showClose,      setShowClose]      = useState(false)
  const [showMovement,   setShowMovement]   = useState(false)
  const [detailId,       setDetailId]       = useState<number | null>(null)
  const [historyPage,    setHistoryPage]    = useState(1)
  const [exportingPdf,   setExportingPdf]   = useState(false)

  // Current session
  const { data: currentSession, isLoading: loadingSession } = useQuery<CashSession | null>({
    queryKey: ['cash-session'],
    queryFn:  () => cashApi.current() as Promise<CashSession | null>,
    refetchInterval: 30_000,
  })

  // Sync cashSessionId in store
  React.useEffect(() => {
    setCashSession(currentSession?.id ?? null)
  }, [currentSession?.id, setCashSession])

  // Summary for current open session
  const { data: summaryResult } = useQuery({
    queryKey: ['cash-detail', currentSession?.id],
    queryFn:  () => cashApi.sessionDetail(currentSession!.id) as Promise<{ success: boolean; data?: CashSessionSummary }>,
    enabled:  !!currentSession?.id,
    refetchInterval: 60_000,
  })
  const currentSummary = summaryResult?.data

  // Movements for current session
  const { data: movementsResult } = useQuery({
    queryKey: ['cash-movements', currentSession?.id],
    queryFn:  () => cashApi.listMovements(currentSession!.id) as Promise<{ success: boolean; data: CashMovement[] }>,
    enabled:  !!currentSession?.id,
    refetchInterval: 30_000,
  })
  const movements: CashMovement[] = (movementsResult as { data?: CashMovement[] } | null)?.data ?? []

  // Payment methods (for close modal)
  const { data: methods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods'],
    queryFn:  () => paymentsApi.methods() as Promise<PaymentMethod[]>,
  })

  // History
  const HISTORY_LIMIT = 10
  const { data: historyResult } = useQuery({
    queryKey: ['cash-history', historyPage],
    queryFn:  () => cashApi.listSessions(historyPage, HISTORY_LIMIT) as Promise<{ success: boolean; data?: { data: CashSession[]; total: number } }>,
    enabled:  tab === 'history',
  })
  const historySessions = historyResult?.data?.data ?? []
  const historyTotal    = historyResult?.data?.total ?? 0
  const historyPages    = Math.ceil(historyTotal / HISTORY_LIMIT)

  async function handleExportCurrentPdf(): Promise<void> {
    if (!user || !currentSession) return
    setExportingPdf(true)
    try {
      const result = await cashApi.exportPdf(currentSession.id, user.username) as { success: boolean; error?: string }
      if (result.success) notify('success', 'PDF generado y abierto')
      else notify('error', result.error ?? 'Error al generar PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"/>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Vault size={24} className="text-primary"/>
          <div>
            <h1 className="text-xl font-bold text-foreground">Caja</h1>
            <p className="text-xs text-muted-foreground">Gestión de sesiones de caja</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton
            queryKeys={[['cash-session'], ['cash-detail', currentSession?.id ?? 0], ['cash-movements', currentSession?.id ?? 0], ['cash-history', historyPage]]}
          />
          {isAdmin() && !currentSession && (
            <button onClick={() => setShowOpen(true)}
              className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus size={15}/> Abrir caja
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['current', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t === 'current' ? 'Sesión Actual' : 'Historial'}
          </button>
        ))}
      </div>

      {/* ── TAB: Sesión actual ── */}
      {tab === 'current' && (
        <div className="space-y-6">
          {/* Status banner */}
          {currentSession ? (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 flex items-start gap-3">
              <CheckCircle2 size={20} className="text-green-400 mt-0.5 shrink-0"/>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-400">Caja abierta</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Abierta por <span className="font-medium text-foreground">{currentSession.openedByName}</span> el {formatDateTime(currentSession.openedAt)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {isAdmin() && (
                  <>
                    <button onClick={() => setShowMovement(true)}
                      className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary">
                      <Plus size={12}/> Movimiento
                    </button>
                    <button onClick={() => void handleExportCurrentPdf()} disabled={exportingPdf}
                      className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50">
                      <FileText size={12}/> {exportingPdf ? 'Generando...' : 'PDF'}
                    </button>
                    <button onClick={() => setShowClose(true)}
                      className="inline-flex items-center gap-1.5 rounded bg-destructive/90 px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive">
                      Cerrar caja
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 flex flex-col items-center gap-3 text-center">
              <AlertTriangle size={32} className="text-amber-400"/>
              <div>
                <p className="font-semibold text-amber-400">No hay sesión de caja activa</p>
                <p className="text-xs text-muted-foreground mt-1">No se pueden registrar ventas sin una caja abierta.</p>
              </div>
              {isAdmin() && (
                <button onClick={() => setShowOpen(true)}
                  className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <Plus size={15}/> Abrir sesión de caja
                </button>
              )}
            </div>
          )}

          {/* Summary cards */}
          {currentSummary && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SummaryCard label="Base inicial" value={formatCurrency(currentSummary.session.openingAmount)} />
              <SummaryCard label="Total ventas" value={formatCurrency(currentSummary.totalSales)} sub={`${currentSummary.totalOrders} órdenes`} />
              <SummaryCard label="Total gastos" value={formatCurrency(currentSummary.totalExpenses)} />
              <SummaryCard label="Efectivo esperado" value={formatCurrency(currentSummary.expectedCash)} />
            </div>
          )}

          {/* By payment method */}
          {currentSummary && currentSummary.byMethod.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ingresos por método</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {currentSummary.byMethod.map(m => (
                  <div key={m.methodId} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                    <CreditCard size={16} className="text-primary shrink-0"/>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{m.methodName}</p>
                      <p className="text-sm font-bold">{formatCurrency(m.total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Movements list */}
          {currentSession && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Movimientos recientes</h2>
              {movements.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                  No hay movimientos registrados en esta sesión.
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs text-muted-foreground">Tipo</th>
                        <th className="px-4 py-2 text-left text-xs text-muted-foreground">Concepto</th>
                        <th className="px-4 py-2 text-left text-xs text-muted-foreground">Descripción</th>
                        <th className="px-4 py-2 text-right text-xs text-muted-foreground">Monto</th>
                        <th className="px-4 py-2 text-right text-xs text-muted-foreground">Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(movements as CashMovement[]).slice(0, 50).map((mv) => (
                        <tr key={mv.id} className="border-t border-border hover:bg-secondary/30">
                          <td className="px-4 py-2">
                            {mv.type === 'in'
                              ? <span className="inline-flex items-center gap-1 text-green-400 text-xs"><ArrowDownCircle size={12}/> Ingreso</span>
                              : <span className="inline-flex items-center gap-1 text-red-400 text-xs"><ArrowUpCircle size={12}/> Egreso</span>
                            }
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{conceptLabel(mv.concept)}</td>
                          <td className="px-4 py-2 text-xs max-w-xs truncate">{mv.description ?? '—'}</td>
                          <td className={`px-4 py-2 text-right text-xs font-medium ${mv.type === 'in' ? 'text-green-400' : 'text-red-400'}`}>
                            {mv.type === 'in' ? '+' : '-'}{formatCurrency(mv.amount)}
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                            {new Date(mv.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Historial ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{historyTotal} sesiones registradas</p>
            <RefreshButton queryKeys={[['cash-history', historyPage]]} label="Actualizar historial"/>
          </div>

          {historySessions.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No hay sesiones de caja registradas.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">#</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Estado</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Apertura</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Cierre</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Abierta por</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Base</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Real</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {historySessions.map(s => (
                    <tr key={s.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-2 text-xs text-muted-foreground">#{s.id}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${s.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-secondary text-muted-foreground'}`}>
                          {s.status === 'open' ? 'Abierta' : 'Cerrada'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">{formatDateTime(s.openedAt)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{s.closedAt ? formatDateTime(s.closedAt) : '—'}</td>
                      <td className="px-4 py-2 text-xs">{s.openedByName}</td>
                      <td className="px-4 py-2 text-right text-xs font-medium">{formatCurrency(s.openingAmount)}</td>
                      <td className="px-4 py-2 text-right text-xs font-medium">
                        {s.closingAmountReal !== null ? formatCurrency(s.closingAmountReal) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setDetailId(s.id)}
                          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {historyPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-40">
                <ChevronLeft size={14}/>
              </button>
              <span className="text-xs text-muted-foreground">Página {historyPage} de {historyPages}</span>
              <button disabled={historyPage >= historyPages} onClick={() => setHistoryPage(p => p + 1)}
                className="rounded border border-border p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-40">
                <ChevronRight size={14}/>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showOpen && (
        <OpenCashModal
          onClose={() => setShowOpen(false)}
          onSuccess={(s) => { setCashSession(s.id); setShowOpen(false) }}
        />
      )}

      {showClose && currentSession && currentSummary && (
        <CloseCashModal
          session={currentSession}
          summary={currentSummary}
          methods={methods}
          onClose={() => setShowClose(false)}
          onSuccess={() => setShowClose(false)}
        />
      )}

      {showMovement && currentSession && (
        <AddMovementModal
          sessionId={currentSession.id}
          onClose={() => setShowMovement(false)}
        />
      )}

      {detailId !== null && (
        <SessionDetailModal
          sessionId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}
