import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../../lib/api'
import { formatCurrency, today, nDaysAgo } from '../../lib/utils'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { FileDown } from 'lucide-react'
import RefreshButton from '../../components/shared/RefreshButton'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const TABS = [
  { key: 'sales',    label: 'Ventas' },
  { key: 'products', label: 'Productos' },
  { key: 'payments', label: 'Pagos' },
  { key: 'profit',   label: 'Utilidad' },
  { key: 'expenses', label: 'Gastos' },
] as const

type TabKey = (typeof TABS)[number]['key']

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899', '#06b6d4']

export default function ReportsPage(): JSX.Element {
  const [tab,  setTab]  = useState<TabKey>('sales')
  const [from, setFrom] = useState(nDaysAgo(30))
  const [to,   setTo]   = useState(today())
  const [exporting, setExporting] = useState(false)
  const hasPermission = useAuthStore((state) => state.hasPermission)
  const { notify } = useAppStore()

  const filters = { from, to }

  async function handleExportPdfPackage(): Promise<void> {
    setExporting(true)
    const result = await reportsApi.exportPdfPackage({ from, to }) as {
      success: boolean
      data?: { directory?: string }
      error?: string
    }
    setExporting(false)

    if (!result.success) {
      notify('error', result.error ?? 'No se pudo exportar el paquete PDF contable')
      return
    }

    notify('success', `PDFs contables exportados en ${result.data?.directory ?? 'la carpeta seleccionada'}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
          <p className="text-sm text-muted-foreground">Consulta ventas, pagos, gastos y utilidad por rango.</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton queryKeys={[['report-sales'], ['report-products'], ['report-payments'], ['report-profit'], ['report-expenses']]} />
          {hasPermission('reports.export_pdf') && (
            <button
              onClick={() => void handleExportPdfPackage()}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
            >
              <FileDown size={16} />
              {exporting ? 'Exportando PDFs...' : 'Exportar paquete PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Filtros de fecha */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none" />
        </div>
        {/* Shortcuts */}
        {[['Hoy', 0], ['7 días', 7], ['30 días', 30], ['90 días', 90]].map(([label, days]) => (
          <button key={label}
            onClick={() => { setFrom(nDaysAgo(days as number)); setTo(today()) }}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground">
            {label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales'    && <SalesReport    filters={filters} />}
      {tab === 'products' && <ProductsReport filters={filters} />}
      {tab === 'payments' && <PaymentsReport filters={filters} />}
      {tab === 'profit'   && <ProfitReport   filters={filters} />}
      {tab === 'expenses' && <ExpensesReport filters={filters} />}
    </div>
  )
}

function SalesReport({ filters }: { filters: { from: string; to: string } }): JSX.Element {
  const { data = [] } = useQuery({
    queryKey: ['report-sales', filters],
    queryFn:  () => reportsApi.sales(filters) as Promise<{ date: string; receipts: number; total: number }[]>
  })
  const totalSales = data.reduce((s, r) => s + Number((r as { total: number }).total ?? 0), 0)
  const totalOrders = data.reduce((s, r) => s + Number((r as { receipts: number }).receipts ?? 0), 0)
  const chartData = data.map((r) => {
    const rawDate = (r as { date?: unknown }).date
    const normalizedDate =
      typeof rawDate === 'string'
        ? rawDate
        : rawDate instanceof Date
          ? rawDate.toISOString()
          : rawDate == null
            ? ''
            : String(rawDate)

    return { ...r, date: normalizedDate.slice(5, 10) }
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-sm">Ventas totales</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-muted-foreground text-sm">Cuentas cerradas</p>
          <p className="text-2xl font-bold text-foreground">{totalOrders}</p>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-foreground mb-4">Ventas por día</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => [formatCurrency(v), 'Ventas']}
              contentStyle={{ background: '#1e2130', border: '1px solid #2d3148', borderRadius: 8 }} />
            <Bar dataKey="total" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ProductsReport({ filters }: { filters: { from: string; to: string } }): JSX.Element {
  const { data = [] } = useQuery({
    queryKey: ['report-products', filters],
    queryFn:  () => reportsApi.products(filters) as Promise<{ name: string; qty_sold: number; total_sales: number; gross_profit: number }[]>
  })
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left text-muted-foreground font-medium">Producto</th>
            <th className="px-4 py-3 text-right text-muted-foreground font-medium">Cantidad</th>
            <th className="px-4 py-3 text-right text-muted-foreground font-medium">Ventas</th>
            <th className="px-4 py-3 text-right text-muted-foreground font-medium">Utilidad bruta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((r, i) => (
            <tr key={i} className="hover:bg-secondary/40">
              <td className="px-4 py-2 text-foreground">{r.name}</td>
              <td className="px-4 py-2 text-right text-muted-foreground">{Number(r.qty_sold).toFixed(0)}</td>
              <td className="px-4 py-2 text-right font-medium text-foreground">{formatCurrency(Number(r.total_sales))}</td>
              <td className="px-4 py-2 text-right font-medium text-green-400">{formatCurrency(Number(r.gross_profit))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PaymentsReport({ filters }: { filters: { from: string; to: string } }): JSX.Element {
  const { data = [] } = useQuery({
    queryKey: ['report-payments', filters],
    queryFn:  () => reportsApi.payments(filters) as Promise<{ method: string; total: number; transactions: number }[]>
  })
  const total = data.reduce((s, r) => s + Number(r.total ?? 0), 0)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-foreground mb-4">Por método de pago</h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="method" cx="50%" cy="50%" outerRadius={80}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Método</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Transacciones</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((r, i) => (
              <tr key={i} className="hover:bg-secondary/40">
                <td className="px-4 py-2 text-foreground">{r.method}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{r.transactions}</td>
                <td className="px-4 py-2 text-right font-semibold text-foreground">{formatCurrency(Number(r.total))}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border font-bold">
              <td className="px-4 py-2 text-foreground">Total</td>
              <td />
              <td className="px-4 py-2 text-right text-primary">{formatCurrency(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProfitReport({ filters }: { filters: { from: string; to: string } }): JSX.Element {
  const { data } = useQuery({
    queryKey: ['report-profit', filters],
    queryFn:  () => reportsApi.profit(filters) as Promise<{
      totalSales: number; totalCost: number; grossProfit: number; totalExpenses: number; netProfit: number; grossMargin: number
    }>
  })

  if (!data) return <div className="text-muted-foreground">Cargando...</div>

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {[
        { label: 'Ventas brutas',   value: data.totalSales,    color: 'text-foreground' },
        { label: 'Costo productos', value: data.totalCost,     color: 'text-red-400' },
        { label: 'Utilidad bruta',  value: data.grossProfit,   color: 'text-green-400' },
        { label: 'Gastos operativos', value: data.totalExpenses, color: 'text-amber-400' },
        { label: 'Utilidad neta',   value: data.netProfit,     color: data.netProfit >= 0 ? 'text-green-400' : 'text-red-400' },
        { label: 'Margen bruto',    value: `${Number(data.grossMargin ?? 0).toFixed(1)}%`, color: 'text-blue-400', isText: true },
      ].map(item => (
        <div key={item.label} className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className={`text-2xl font-bold mt-1 ${item.color}`}>
            {item.isText ? item.value : formatCurrency(Number(item.value))}
          </p>
        </div>
      ))}
    </div>
  )
}

function ExpensesReport({ filters }: { filters: { from: string; to: string } }): JSX.Element {
  const { data = [] } = useQuery({
    queryKey: ['report-expenses', filters],
    queryFn:  () => reportsApi.expenses(filters) as Promise<{ category: string; count: number; total: number }[]>
  })
  const total = data.reduce((s, r) => s + Number(r.total ?? 0), 0)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
            <YAxis dataKey="category" type="category" tick={{ fontSize: 11, fill: '#6b7280' }} width={100} />
            <Tooltip formatter={(v: number) => [formatCurrency(v), 'Gasto']} contentStyle={{ background: '#1e2130', border: '1px solid #2d3148', borderRadius: 8 }} />
            <Bar dataKey="total" fill="#f97316" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Categoría</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Registros</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((r, i) => (
              <tr key={i} className="hover:bg-secondary/40">
                <td className="px-4 py-2 text-foreground">{r.category}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{r.count}</td>
                <td className="px-4 py-2 text-right font-semibold text-foreground">{formatCurrency(Number(r.total))}</td>
              </tr>
            ))}
            <tr className="font-bold border-t-2 border-border">
              <td className="px-4 py-2">Total</td><td />
              <td className="px-4 py-2 text-right text-primary">{formatCurrency(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
