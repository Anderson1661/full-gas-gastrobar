import React, { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ordersApi, paymentsApi, printApi, productsApi, settingsApi, tablesApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { cn, formatCurrency } from '../../lib/utils'
import type {
  BarTable,
  Order,
  Payment,
  PaymentMethod,
  Product,
  ProductCategory,
  SubOrder,
  TableLayoutZone,
} from '@shared/types/entities'
import {
  CheckCircle,
  ChevronDown,
  DollarSign,
  LayoutGrid,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  SplitSquareHorizontal,
  X,
} from 'lucide-react'
import { TABLE_STATUS_COLORS, TABLE_STATUS_LABELS } from '@shared/constants'
import TableLayoutDesigner from './TableLayoutDesigner'
import RefreshButton from '../../components/shared/RefreshButton'

type View = 'map' | 'order' | 'payment'

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

async function invalidateTablesQueries(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['tables'] }),
    queryClient.invalidateQueries({ queryKey: ['tables-layout'] }),
  ])
}

export default function TablesPage(): JSX.Element {
  const queryClient = useQueryClient()
  const { user, isAdmin } = useAuthStore()
  const { notify } = useAppStore()
  const [view, setView] = useState<View>('map')
  const [selectedTable, setSelectedTable] = useState<BarTable | null>(null)
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [showDesigner, setShowDesigner] = useState(false)

  const {
    data: layout = [],
    isLoading,
    refetch,
  } = useQuery<TableLayoutZone[]>({
    queryKey: ['tables-layout'],
    queryFn: () => tablesApi.getLayout() as Promise<TableLayoutZone[]>,
    refetchInterval: 30_000,
  })

  const tables = useMemo(
    () => layout.flatMap((zone) => zone.tables),
    [layout]
  )
  const activeTables = useMemo(
    () => tables.filter((table) => table.isActive),
    [tables]
  )
  const occupiedTables = useMemo(
    () => activeTables.filter((table) => !['available', 'inactive'].includes(table.status)),
    [activeTables]
  )

  async function reloadOrder(orderId: number): Promise<void> {
    const updated = await ordersApi.get(orderId) as Order
    setActiveOrder(updated)
    await invalidateTablesQueries(queryClient)
  }

  async function refreshLayout(): Promise<void> {
    await invalidateTablesQueries(queryClient)
    await refetch()
  }

  async function openTable(table: BarTable): Promise<void> {
    if (!user) return

    if (['available', 'reserved'].includes(table.status)) {
      const result = await ordersApi.create({ tableId: table.id, waiterId: user.id }) as {
        success: boolean
        data?: Order
        error?: string
      }

      if (!result.success || !result.data) {
        notify('error', result.error ?? 'No se pudo abrir la mesa')
        return
      }

      setSelectedTable(table)
      setActiveOrder(result.data)
      setView('order')
      await refreshLayout()
      return
    }

    if (table.currentOrderId) {
      const order = await ordersApi.get(table.currentOrderId) as Order | null
      if (!order) {
        notify('error', 'No se pudo cargar la orden activa de esta mesa')
        await refreshLayout()
        return
      }
      setSelectedTable(table)
      setActiveOrder(order)
      setView(table.status === 'pending_payment' ? 'payment' : 'order')
    }
  }

  async function toggleReservation(table: BarTable): Promise<void> {
    if (!user) return
    if (!['available', 'reserved'].includes(table.status)) return

    const nextStatus = table.status === 'reserved' ? 'available' : 'reserved'
    const result = await tablesApi.updateStatus(table.id, nextStatus) as { success?: boolean; error?: string }

    if (result?.success === false) {
      notify('error', result.error ?? 'No se pudo actualizar la reserva')
      return
    }

    notify('success', nextStatus === 'reserved' ? `Mesa #${table.number} reservada` : `Mesa #${table.number} liberada`)
    await refreshLayout()
  }

  if (view === 'order' && selectedTable && activeOrder) {
    return (
      <OrderView
        table={selectedTable}
        order={activeOrder}
        onReload={reloadOrder}
        onGoToPayment={() => setView('payment')}
        onBack={() => {
          setView('map')
          void refreshLayout()
        }}
      />
    )
  }

  if (view === 'payment' && selectedTable && activeOrder) {
    return (
      <PaymentView
        table={selectedTable}
        order={activeOrder}
        onReload={reloadOrder}
        onBack={() => {
          setView('map')
          void refreshLayout()
        }}
        onViewOrder={() => setView('order')}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mesas</h1>
          <p className="text-sm text-muted-foreground">
            {occupiedTables.length} ocupadas de {activeTables.length} activas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <RefreshButton queryKeys={[['tables-layout'], ['active-orders']]} />
          {isAdmin() && (
            <button
              onClick={() => setShowDesigner(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-secondary"
            >
              <LayoutGrid size={14} />
              Disenar mesas
            </button>
          )}
          <button
            onClick={() => void refreshLayout()}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RefreshCw size={14} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {Object.entries(TABLE_STATUS_LABELS)
          .filter(([status]) => status !== 'inactive')
          .map(([status, label]) => (
            <div key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-3 w-3 rounded-full" style={{ background: TABLE_STATUS_COLORS[status] }} />
              {label}
            </div>
          ))}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {layout
            .filter((zone) => zone.isActive)
            .map((zone) => {
              const activeZoneTables = zone.tables.filter((table) => table.isActive)

              // Resolver posición libre o posición legacy desde layout_row/col
              const canvasW = Math.max(680, ...activeZoneTables.map(
                (t) => (t.positionX > 0 || t.positionY > 0 ? t.positionX : 20 + ((t.layoutCol ?? 1) - 1) * 150) + 148
              ))
              const canvasH = Math.max(220, ...activeZoneTables.map(
                (t) => (t.positionX > 0 || t.positionY > 0 ? t.positionY : 20 + ((t.layoutRow ?? 1) - 1) * 112) + 104
              ))

              return (
                <section key={zone.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">{zone.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {activeZoneTables.length} mesa{activeZoneTables.length !== 1 ? 's' : ''} activa{activeZoneTables.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div
                    className="overflow-auto rounded-xl"
                    style={{
                      backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                      backgroundColor: 'rgba(0,0,0,0.15)',
                    }}
                  >
                    <div className="relative" style={{ width: canvasW, height: canvasH, minWidth: '100%', minHeight: 220 }}>
                      {activeZoneTables.map((table) => {
                        const x = table.positionX > 0 || table.positionY > 0
                          ? table.positionX
                          : 20 + ((table.layoutCol ?? 1) - 1) * 150
                        const y = table.positionX > 0 || table.positionY > 0
                          ? table.positionY
                          : 20 + ((table.layoutRow ?? 1) - 1) * 112

                        return (
                          <div
                            key={table.id}
                            onClick={() => void openTable(table)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                void openTable(table)
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            style={{ position: 'absolute', left: x, top: y, width: 132, minHeight: 88 }}
                            className={cn(
                              'rounded-xl border-2 p-3 text-left transition-all hover:scale-[1.02] hover:shadow-lg',
                              table.status === 'available' && 'table-available',
                              table.status === 'occupied' && 'table-occupied',
                              table.status === 'pending_payment' && 'table-pending',
                              table.status === 'reserved' && 'table-reserved'
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <span className="text-base font-bold text-foreground leading-none">#{table.number}</span>
                              <div className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: TABLE_STATUS_COLORS[table.status] }} />
                            </div>
                            {table.name && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">{table.name}</p>
                            )}
                            <p className="mt-1 text-[11px] text-muted-foreground">{TABLE_STATUS_LABELS[table.status]}</p>
                            {table.currentOrderTotal !== undefined && table.currentOrderTotal > 0 && (
                              <p className="mt-1 text-sm font-bold text-foreground">{formatCurrency(table.currentOrderTotal)}</p>
                            )}
                            {table.currentWaiter && (
                              <p className="truncate text-[11px] text-muted-foreground">{table.currentWaiter}</p>
                            )}
                            {['available', 'reserved'].includes(table.status) && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void toggleReservation(table)
                                }}
                                className="mt-2 rounded border border-border bg-card/60 px-2 py-0.5 text-[11px] text-foreground hover:bg-card"
                              >
                                {table.status === 'reserved' ? 'Liberar' : 'Reservar'}
                              </button>
                            )}
                          </div>
                        )
                      })}

                      {activeZoneTables.length === 0 && (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Sin mesas activas en esta zona
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )
            })}
        </div>
      )}

      <TableLayoutDesigner
        open={showDesigner}
        layout={layout}
        onClose={() => setShowDesigner(false)}
        onChanged={refreshLayout}
      />
    </div>
  )
}

interface OrderViewProps {
  table: BarTable
  order: Order
  onReload: (orderId: number) => Promise<void>
  onGoToPayment: () => void
  onBack: () => void
}

function OrderView({ table, order, onReload, onGoToPayment, onBack }: OrderViewProps): JSX.Element {
  const { user } = useAuthStore()
  const { notify } = useAppStore()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [selectedSubOrderId, setSelectedSubOrderId] = useState<number | null>(order.subOrders?.[0]?.id ?? null)
  const [cancelTarget, setCancelTarget] = useState<number | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ['categories'],
    queryFn: () => productsApi.categories() as Promise<ProductCategory[]>,
  })

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products-active'],
    queryFn: () => productsApi.list(false) as Promise<Product[]>,
  })

  const filteredProducts = useMemo(
    () => allProducts.filter((product) => {
      const normalizedSearch = normalizeSearchText(search)
      const matchesCategory = !selectedCategory || product.categoryId === selectedCategory
      const matchesSearch = !normalizedSearch || normalizeSearchText(product.name).includes(normalizedSearch)
      return matchesCategory && matchesSearch
    }),
    [allProducts, search, selectedCategory]
  )

  const subOrders = order.subOrders ?? []
  const selectedSubOrder = subOrders.find((subOrder) => subOrder.id === selectedSubOrderId) ?? subOrders[subOrders.length - 1] ?? null
  const activeItems = (selectedSubOrder?.items ?? []).filter((item) => item.status === 'active')
  const hasActiveItems = (order.items ?? []).some((item) => item.status === 'active')
  const canReleaseEmptyOrder = !hasActiveItems && order.totalPaid <= 0 && order.subtotal <= 0

  function getProductQuantity(productId: number): number {
    const raw = quantities[productId]
    const parsed = Number(raw ?? '1')
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  }

  async function handleAddItem(product: Product): Promise<void> {
    if (!user || !selectedSubOrder) return
    const quantity = getProductQuantity(product.id)
    setLoading(true)
    const result = await ordersApi.addItem(
      { orderId: order.id, subOrderId: selectedSubOrder.id, productId: product.id, quantity },
      user.id,
      user.username
    ) as { success: boolean; error?: string }
    setLoading(false)

    if (!result.success) {
      notify('error', result.error ?? 'No se pudo agregar el producto')
      return
    }

    setQuantities((current) => ({ ...current, [product.id]: '1' }))
    await onReload(order.id)
  }

  async function handleCreateSubOrder(): Promise<void> {
    if (!user) return
    const result = await ordersApi.createSubOrder(
      { orderId: order.id, createdBy: user.id },
      user.id,
      user.username
    ) as { success: boolean; data?: SubOrder; error?: string }

    if (!result.success || !result.data) {
      notify('error', result.error ?? 'No se pudo crear la tanda')
      return
    }

    await onReload(order.id)
    setSelectedSubOrderId(result.data.id)
  }

  async function handleCancelItem(): Promise<void> {
    if (!user || !cancelTarget || !cancelReason.trim()) return
    const result = await ordersApi.cancelItem(
      { orderItemId: cancelTarget, reason: cancelReason, cancelledBy: user.id },
      user.id,
      user.username
    ) as { success: boolean; error?: string }

    if (!result.success) {
      notify('error', result.error ?? 'No se pudo cancelar el item')
      return
    }

    setCancelTarget(null)
    setCancelReason('')
    await onReload(order.id)
  }

  async function handleSendToBar(): Promise<void> {
    if (!user) return
    const pendingIds = activeItems.filter((item) => !item.sentToBar).map((item) => item.id)
    const result = await ordersApi.sendToBar({ orderId: order.id, itemIds: pendingIds }, user.id, user.username) as {
      success: boolean
      error?: string
      printWarning?: string
    }
    if (!result.success) {
      notify('error', result.error ?? 'No se pudo enviar a barra')
      return
    }

    await onReload(order.id)
    if (result.printWarning) {
      notify('warning', `Tanda enviada, pero la impresión falló: ${result.printWarning}`)
    } else {
      notify('success', 'Tanda enviada a barra')
    }
  }

  async function handleRequestBill(): Promise<void> {
    const result = await ordersApi.requestBill(order.id) as { success: boolean; error?: string }
    if (!result.success) {
      notify('error', result.error ?? 'No se pudo pasar a cobro')
      return
    }

    await onReload(order.id)
    onGoToPayment()
  }

  async function handleReleaseEmptyOrder(): Promise<void> {
    if (!user || !canReleaseEmptyOrder) return
    const result = await ordersApi.releaseEmpty(order.id, user.id, user.username) as { success: boolean; error?: string }
    if (!result.success) {
      notify('error', result.error ?? 'No se pudo liberar la mesa')
      return
    }

    notify('success', 'Mesa liberada')
    onBack()
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
          <div>
            <h2 className="font-semibold text-foreground">Mesa #{table.number}</h2>
            <p className="text-xs text-muted-foreground">{order.waiterName}</p>
          </div>
        </div>

        <div className="border-b border-border px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {subOrders.map((subOrder) => (
                <button
                  key={subOrder.id}
                  onClick={() => setSelectedSubOrderId(subOrder.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    selectedSubOrder?.id === subOrder.id
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                  )}
                >
                  {subOrder.label ?? `Tanda ${subOrder.roundNumber}`} · {formatCurrency(subOrder.balanceDue)}
                </button>
              ))}
            </div>
            <button
              onClick={() => void handleCreateSubOrder()}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Plus size={14} />
              Nueva tanda
            </button>
          </div>

          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto..."
              className="w-full rounded-lg border border-border bg-secondary py-2 pl-9 pr-4 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                !selectedCategory ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'
              )}
            >
              Todos
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id === selectedCategory ? null : category.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  selectedCategory === category.id ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-4 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="rounded-lg border border-border bg-secondary p-3 transition-colors hover:border-primary/50"
            >
              <p className="text-sm font-medium text-foreground">{product.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{product.categoryName}</p>
              {product.trackInventory && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Quedan: {product.stock} {product.unit}
                </p>
              )}
              <p className="mt-2 text-base font-bold text-primary">{formatCurrency(product.salePrice)}</p>
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantities[product.id] ?? '1'}
                  onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value }))}
                  className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={() => void handleAddItem(product)}
                  disabled={!selectedSubOrder || loading}
                  className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  Agregar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-96 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-semibold text-foreground">{selectedSubOrder?.label ?? 'Sin tanda'}</h3>
          <p className="text-xs text-muted-foreground">{activeItems.length} item(s) activos</p>
        </div>

        <div className="flex-1 divide-y divide-border overflow-y-auto">
          {activeItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Sin productos en esta tanda</div>
          ) : (
            activeItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatCurrency(item.unitPrice)} {item.sentToBar ? '· enviado' : '· pendiente'}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(item.subtotal)}</p>
                <button onClick={() => setCancelTarget(item.id)} className="text-muted-foreground hover:text-destructive">
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-1 border-t border-border px-4 py-3">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Tanda</span>
            <span>{formatCurrency(selectedSubOrder?.subtotal ?? 0)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Total orden</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
          <div className="flex justify-between text-sm text-green-400">
            <span>Pagado</span>
            <span>{formatCurrency(order.totalPaid)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-foreground">
            <span>Saldo</span>
            <span>{formatCurrency(order.balanceDue)}</span>
          </div>
        </div>

        <div className="space-y-2 px-4 pb-4">
          {canReleaseEmptyOrder && (
            <button
              onClick={() => void handleReleaseEmptyOrder()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium text-foreground"
            >
              <X size={14} />
              Liberar mesa
            </button>
          )}
          <button
            onClick={() => void handleSendToBar()}
            disabled={activeItems.filter((item) => !item.sentToBar).length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium text-foreground disabled:opacity-40"
          >
            <Send size={14} />
            Enviar tanda
          </button>
          <button
            onClick={() => void handleRequestBill()}
            disabled={(order.items ?? []).filter((item) => item.status === 'active').length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Receipt size={14} />
            Pasar a cobro
          </button>
        </div>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
            <h3 className="mb-3 font-semibold text-foreground">Cancelar item</h3>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={3}
              placeholder="Motivo de la cancelacion"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  setCancelTarget(null)
                  setCancelReason('')
                }}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground"
              >
                Cancelar
              </button>
              <button onClick={() => void handleCancelItem()} className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-white">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface PaymentViewProps {
  table: BarTable
  order: Order
  onReload: (orderId: number) => Promise<void>
  onBack: () => void
  onViewOrder: () => void
}

function PaymentView({ table, order, onReload, onBack, onViewOrder }: PaymentViewProps): JSX.Element {
  const { user } = useAuthStore()
  const { notify } = useAppStore()
  const queryClient = useQueryClient()
  const [methodId, setMethodId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [serviceAccepted, setServiceAccepted] = useState<boolean | null>(order.serviceAccepted)
  const [paymentTarget, setPaymentTarget] = useState<'order' | number>('order')
  const [loading, setLoading] = useState(false)
  const [showSplit, setShowSplit] = useState(false)
  const [splitPeople, setSplitPeople] = useState(2)

  const { data: methods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods'],
    queryFn: () => paymentsApi.methods() as Promise<PaymentMethod[]>,
  })

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ['payments', order.id],
    queryFn: () => paymentsApi.getByOrder(order.id) as Promise<Payment[]>,
  })

  const { data: serviceChargeSetting } = useQuery<string | null>({
    queryKey: ['settings', 'service_charge_pct'],
    queryFn: () => settingsApi.get('service_charge_pct') as Promise<string | null>,
  })

  const subOrders = order.subOrders ?? []
  const subtotal = order.subtotal
  const serviceChargePct = Number(serviceChargeSetting ?? '5')
  const normalizedServiceChargePct = Number.isFinite(serviceChargePct) && serviceChargePct >= 0 ? serviceChargePct : 5
  const serviceCharge = serviceAccepted ? roundMoney((subtotal * normalizedServiceChargePct) / 100) : 0
  const totalPreview = subtotal + serviceCharge
  const targetSubOrder = typeof paymentTarget === 'number'
    ? subOrders.find((subOrder) => subOrder.id === paymentTarget) ?? null
    : null
  const targetBalance = targetSubOrder ? targetSubOrder.balanceDue : Math.max(0, totalPreview - order.totalPaid)
  const receivedAmount = Number(amount)
  const changePreview = Number.isFinite(receivedAmount) ? Math.max(0, receivedAmount - targetBalance) : 0

  async function registerPayment(): Promise<void> {
    if (!user || !methodId || !amount) return
    setLoading(true)
    const result = await paymentsApi.register({
      orderId: order.id,
      subOrderId: typeof paymentTarget === 'number' ? paymentTarget : undefined,
      paymentMethodId: methodId,
      amount: Number(amount),
      serviceAccepted,
      reference: reference || undefined,
      receivedBy: user.id,
    }, user.username) as {
      success: boolean
      data?: { order: { changeGiven: number } }
      error?: string
    }
    setLoading(false)

    if (!result.success) {
      notify('error', result.error ?? 'No se pudo registrar el pago')
      return
    }

    notify('success', `Pago registrado${result.data?.order.changeGiven ? ` · cambio ${formatCurrency(result.data.order.changeGiven)}` : ''}`)
    setAmount('')
    setReference('')
    await onReload(order.id)
    await queryClient.invalidateQueries({ queryKey: ['payments', order.id] })
  }

  async function closeOrder(): Promise<void> {
    if (!user || serviceAccepted === null) {
      notify('warning', 'Debes confirmar el servicio antes de cerrar')
      return
    }
    setLoading(true)
    const result = await paymentsApi.closeOrder({
      orderId: order.id,
      serviceAccepted,
      closedBy: user.id,
    }, user.username) as { success: boolean; data?: unknown; error?: string }
    setLoading(false)

    if (!result.success) {
      notify('error', result.error ?? 'No se pudo cerrar la cuenta')
      return
    }

    if (result.data) {
      try {
        await printApi.receipt(result.data, { ...order, serviceAccepted, serviceCharge, total: totalPreview })
        notify('success', 'Cuenta cerrada')
      } catch (error) {
        notify(
          'warning',
          error instanceof Error
            ? `Cuenta cerrada, pero no se pudo imprimir el comprobante: ${error.message}`
            : 'Cuenta cerrada, pero no se pudo imprimir el comprobante'
        )
      }
    } else {
      notify('success', 'Cuenta cerrada')
    }

    onBack()
    await invalidateTablesQueries(queryClient)
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button onClick={onViewOrder} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
          <div>
            <h2 className="font-semibold text-foreground">Cobro · Mesa #{table.number}</h2>
            <p className="text-xs text-muted-foreground">{order.waiterName}</p>
          </div>
        </div>

        <div className="border-b border-border px-4 py-3">
          <p className="mb-2 text-sm font-medium text-foreground">Destino del pago</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPaymentTarget('order')}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                paymentTarget === 'order' ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground'
              )}
            >
              Orden completa · {formatCurrency(Math.max(0, totalPreview - order.totalPaid))}
            </button>
            {subOrders.map((subOrder) => (
              <button
                key={subOrder.id}
                onClick={() => setPaymentTarget(subOrder.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs',
                  paymentTarget === subOrder.id ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground'
                )}
              >
                {subOrder.label ?? `Tanda ${subOrder.roundNumber}`} · {formatCurrency(subOrder.balanceDue)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 rounded-xl border border-border bg-secondary/30 p-4">
            <p className="text-sm font-medium text-foreground">Servicio {normalizedServiceChargePct}%</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setServiceAccepted(true)}
                className={cn('flex-1 rounded-lg py-2 text-sm', serviceAccepted === true ? 'bg-green-500/15 text-green-400' : 'bg-secondary text-muted-foreground')}
              >
                Si
              </button>
              <button
                onClick={() => setServiceAccepted(false)}
                className={cn('flex-1 rounded-lg py-2 text-sm', serviceAccepted === false ? 'bg-red-500/15 text-red-400' : 'bg-secondary text-muted-foreground')}
              >
                No
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-semibold text-foreground">Historial de pagos</h3>
            </div>
            <div className="divide-y divide-border">
              {payments.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Sin pagos registrados</div>
              ) : (
                payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <div>
                      <p className="text-foreground">{payment.paymentMethodName}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.subOrderLabel ?? 'Orden general'} {payment.changeGiven > 0 ? `· cambio ${formatCurrency(payment.changeGiven)}` : ''}
                      </p>
                    </div>
                    <p className="font-semibold text-foreground">{formatCurrency(payment.amount)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1 border-t border-border px-4 py-3">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Servicio</span>
            <span>{formatCurrency(serviceCharge)}</span>
          </div>
          <div className="flex justify-between text-sm text-green-400">
            <span>Pagado</span>
            <span>{formatCurrency(order.totalPaid)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-foreground">
            <span>Saldo objetivo</span>
            <span>{formatCurrency(targetBalance)}</span>
          </div>
        </div>
      </div>

      <div className="flex w-80 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-semibold text-foreground">Registrar pago</h3>
        </div>

        <div className="flex-1 space-y-4 p-4">
          {/* Split bill helper */}
          <div className="rounded-xl border border-border bg-secondary/40">
            <button
              onClick={() => setShowSplit(!showSplit)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2 text-muted-foreground font-medium">
                <SplitSquareHorizontal size={14} />
                Dividir cuenta
              </span>
              <ChevronDown
                size={14}
                className={cn('text-muted-foreground transition-transform', showSplit && 'rotate-180')}
              />
            </button>
            {showSplit && (
              <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSplitPeople(Math.max(2, splitPeople - 1))}
                    className="w-8 h-8 rounded-lg border border-border text-foreground hover:bg-secondary flex items-center justify-center text-base font-bold"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-sm font-medium text-foreground">
                    {splitPeople} personas
                  </span>
                  <button
                    onClick={() => setSplitPeople(Math.min(20, splitPeople + 1))}
                    className="w-8 h-8 rounded-lg border border-border text-foreground hover:bg-secondary flex items-center justify-center text-base font-bold"
                  >
                    +
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cada persona paga:</span>
                  <span className="font-bold text-primary">
                    {formatCurrency(roundMoney(targetBalance / splitPeople))}
                  </span>
                </div>
                <button
                  onClick={() => setAmount(String(roundMoney(targetBalance / splitPeople)))}
                  className="text-xs text-primary hover:underline w-full text-right"
                >
                  Usar este monto →
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {methods.map((method) => (
              <button
                key={method.id}
                onClick={() => setMethodId(method.id)}
                className={cn(
                  'rounded-lg border py-2 text-xs font-medium',
                  methodId === method.id ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground'
                )}
              >
                {method.name}
              </button>
            ))}
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">Monto recibido</p>
            <input
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={String(targetBalance)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-lg font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">Referencia</p>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">Cambio a devolver</p>
            <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-semibold text-foreground">
              {formatCurrency(changePreview)}
            </div>
          </div>
        </div>

        <div className="space-y-2 px-4 pb-4">
          <button
            onClick={() => void registerPayment()}
            disabled={!methodId || !amount || loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium text-foreground disabled:opacity-40"
          >
            <DollarSign size={14} />
            Registrar pago
          </button>
          <button
            onClick={() => void closeOrder()}
            disabled={Math.max(0, totalPreview - order.totalPaid) > 0 || loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Cerrar cuenta
          </button>
        </div>
      </div>
    </div>
  )
}
