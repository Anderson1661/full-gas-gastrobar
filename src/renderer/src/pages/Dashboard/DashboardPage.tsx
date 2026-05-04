import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../../lib/api'
import { formatCurrency } from '../../lib/utils'
import {
  TrendingUp, UtensilsCrossed, AlertTriangle, ShoppingBag,
  CreditCard
} from 'lucide-react'
import RefreshButton from '../../components/shared/RefreshButton'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'

interface DashboardData {
  salesToday:     number
  ordersToday:    number
  openTables:     number
  lowStockCount:  number
  topProducts:    { name: string; qty: number; total: number }[]
  salesByHour:    { hour: number; total: number }[]
  recentPayments: { method: string; amount: number }[]
}

const COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5']

export default function DashboardPage(): JSX.Element {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn:  () => reportsApi.dashboard() as Promise<DashboardData>,
    refetchInterval: 60_000
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const d = data ?? {
    salesToday: 0, ordersToday: 0, openTables: 0, lowStockCount: 0,
    topProducts: [], salesByHour: [], recentPayments: []
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Resumen del día</p>
        </div>
        <RefreshButton queryKeys={[['dashboard']]} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Ventas hoy"
          value={formatCurrency(d.salesToday)}
          icon={<TrendingUp size={20} />}
          color="primary"
        />
        <KpiCard
          title="Órdenes hoy"
          value={String(d.ordersToday)}
          icon={<ShoppingBag size={20} />}
          color="blue"
        />
        <KpiCard
          title="Mesas activas"
          value={String(d.openTables)}
          icon={<UtensilsCrossed size={20} />}
          color="green"
        />
        <KpiCard
          title="Stock mínimo"
          value={String(d.lowStockCount)}
          icon={<AlertTriangle size={20} />}
          color={d.lowStockCount > 0 ? 'amber' : 'green'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Ventas por hora */}
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-foreground mb-4">Ventas por hora</h3>
          {d.salesByHour.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              Sin ventas registradas hoy
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.salesByHour.map(x => ({ ...x, label: `${x.hour}h` }))}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), 'Ventas']}
                  contentStyle={{ background: '#1e2130', border: '1px solid #2d3148', borderRadius: 8 }}
                />
                <Bar dataKey="total" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top productos */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-foreground mb-4">Top productos</h3>
          {d.topProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin ventas hoy</p>
          ) : (
            <div className="space-y-3">
              {d.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: COLORS[i] ?? '#6b7280' }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.qty} und</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{formatCurrency(p.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pagos por método */}
      {d.recentPayments.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <CreditCard size={16} /> Pagos del día por método
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {d.recentPayments.map((p) => (
              <div key={p.method} className="bg-secondary rounded-lg px-4 py-3">
                <p className="text-xs text-muted-foreground">{p.method}</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(p.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  title, value, icon, color
}: { title: string; value: string; icon: React.ReactNode; color: string }): JSX.Element {
  const colorMap: Record<string, string> = {
    primary: 'text-orange-400 bg-orange-500/20',
    blue:    'text-blue-400 bg-blue-500/20',
    green:   'text-green-400 bg-green-500/20',
    amber:   'text-amber-400 bg-amber-500/20',
    red:     'text-red-400 bg-red-500/20',
  }
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${colorMap[color] ?? colorMap.primary}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
