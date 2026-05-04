import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { inventoryApi, productsApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { formatDateTime } from '../../lib/utils'
import type { InventoryMovement, Product } from '@shared/types/entities'
import { AlertTriangle, Minus, Package, Plus, RotateCcw } from 'lucide-react'
import RefreshButton from '../../components/shared/RefreshButton'
import { INVENTORY_MOVEMENT_LABELS } from '@shared/constants'
import { cn } from '../../lib/utils'

export default function InventoryPage(): JSX.Element {
  const { user } = useAuthStore()
  const { notify } = useAppStore()
  const qc = useQueryClient()
  const [showAdjust, setShowAdjust] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-active'],
    queryFn: () => productsApi.list(false) as Promise<Product[]>,
  })

  const { data: lowStock = [] } = useQuery<Product[]>({
    queryKey: ['low-stock'],
    queryFn: () => inventoryApi.lowStock() as Promise<Product[]>,
  })

  const { data: movements = [] } = useQuery<InventoryMovement[]>({
    queryKey: ['inventory-movements', selectedProduct?.id],
    queryFn: () => inventoryApi.movements(selectedProduct?.id, 100) as Promise<InventoryMovement[]>,
  })

  const stockProducts = products.filter((product) => product.trackInventory)

  async function submitAdjust(data: {
    productId: number
    type: 'adjustment_in' | 'adjustment_out' | 'purchase' | 'waste'
    quantity: number
    reason: string
    adminUsername: string
    adminPassword: string
  }): Promise<void> {
    if (!user) return

    const result = await inventoryApi.adjust({ ...data, performedBy: user.id }, user.username) as { success: boolean; error?: string }
    if (!result.success) {
      notify('error', result.error ?? 'No se pudo registrar el ajuste')
      return
    }

    notify('success', 'Ajuste registrado')
    setShowAdjust(false)
    await qc.invalidateQueries({ queryKey: ['products-active'] })
    await qc.invalidateQueries({ queryKey: ['low-stock'] })
    await qc.invalidateQueries({ queryKey: ['inventory-movements'] })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Inventario</h1>
        <div className="flex items-center gap-2">
          <RefreshButton queryKeys={[['products-active'], ['low-stock'], ['inventory-movements']]} />
          <button
            onClick={() => setShowAdjust(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} />
            Ajuste protegido
          </button>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/15 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="font-semibold text-amber-400">Stock mínimo ({lowStock.length})</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {lowStock.map((product) => (
              <div key={product.id} className="rounded-lg bg-amber-500/10 px-3 py-2">
                <p className="text-sm font-medium text-foreground">{product.name}</p>
                <p className="text-xs text-amber-400">{product.stock} / {product.minStock} {product.unit}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-semibold text-foreground">Stock actual</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Producto</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Stock</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Mínimo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stockProducts.map((product) => (
                  <tr
                    key={product.id}
                    onClick={() => setSelectedProduct(product.id === selectedProduct?.id ? null : product)}
                    className={cn('cursor-pointer hover:bg-secondary/40', selectedProduct?.id === product.id && 'bg-secondary/60')}
                  >
                    <td className="px-4 py-2">
                      <p className="text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.categoryName}</p>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn('font-semibold', product.stock <= product.minStock ? 'text-amber-400' : 'text-foreground')}>
                        {product.stock} {product.unit}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{product.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-semibold text-foreground">
              {selectedProduct ? `Movimientos · ${selectedProduct.name}` : 'Últimos movimientos'}
            </h3>
          </div>
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {movements.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Sin movimientos</div>
            ) : (
              movements.map((movement) => (
                <div key={movement.id} className="flex items-center justify-between px-4 py-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <MovementIcon type={movement.type} />
                      <span className="text-sm text-foreground">{INVENTORY_MOVEMENT_LABELS[movement.type]}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {!selectedProduct && `${movement.productName} · `}{movement.performedByName} · {formatDateTime(movement.createdAt)}
                    </p>
                    {movement.reason && <p className="text-xs italic text-muted-foreground">{movement.reason}</p>}
                  </div>
                  <div className="text-right">
                    <p className={cn('text-sm font-semibold', ['sale', 'adjustment_out', 'waste'].includes(movement.type) ? 'text-red-400' : 'text-green-400')}>
                      {['sale', 'adjustment_out', 'waste'].includes(movement.type) ? '-' : '+'}{movement.quantity}
                    </p>
                    <p className="text-xs text-muted-foreground">{movement.stockAfter}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showAdjust && (
        <AdjustForm
          products={stockProducts}
          onClose={() => setShowAdjust(false)}
          onSubmit={submitAdjust}
        />
      )}
    </div>
  )
}

function MovementIcon({ type }: { type: string }): JSX.Element {
  const icons: Record<string, JSX.Element> = {
    purchase: <Plus size={12} className="text-green-400" />,
    sale: <Minus size={12} className="text-red-400" />,
    adjustment_in: <Plus size={12} className="text-blue-400" />,
    adjustment_out: <Minus size={12} className="text-amber-400" />,
    waste: <RotateCcw size={12} className="text-red-400" />,
    return: <RotateCcw size={12} className="text-green-400" />,
  }

  return <div className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary">{icons[type] ?? <Package size={12} />}</div>
}

function AdjustForm({
  products,
  onClose,
  onSubmit,
}: {
  products: Product[]
  onClose: () => void
  onSubmit: (data: {
    productId: number
    type: 'adjustment_in' | 'adjustment_out' | 'purchase' | 'waste'
    quantity: number
    reason: string
    adminUsername: string
    adminPassword: string
  }) => Promise<void>
}): JSX.Element {
  const [form, setForm] = useState({
    productId: products[0]?.id ?? 0,
    type: 'adjustment_in' as const,
    quantity: 1,
    reason: '',
    adminUsername: '',
    adminPassword: '',
  })
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold text-foreground">Ajuste de inventario</h3>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Producto</label>
          <select
            value={form.productId}
            onChange={(event) => setForm({ ...form, productId: Number(event.target.value) })}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none"
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name} (Stock: {product.stock})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Tipo</label>
          <select
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value as typeof form.type })}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none"
          >
            <option value="purchase">Entrada por compra</option>
            <option value="adjustment_in">Ajuste positivo</option>
            <option value="adjustment_out">Ajuste negativo</option>
            <option value="waste">Merma / pérdida</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Cantidad</label>
          <input
            type="number"
            min={0.001}
            step={0.001}
            value={form.quantity}
            onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Motivo</label>
          <input
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="mb-2 text-xs font-medium text-amber-400">Autorización de administrador</p>
          <div className="space-y-3">
            <input
              value={form.adminUsername}
              onChange={(event) => setForm({ ...form, adminUsername: event.target.value })}
              placeholder="Usuario admin"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="password"
              value={form.adminPassword}
              onChange={(event) => setForm({ ...form, adminPassword: event.target.value })}
              placeholder="Contraseña admin"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground">
            Cancelar
          </button>
          <button
            onClick={async () => {
              setSaving(true)
              await onSubmit(form)
              setSaving(false)
            }}
            disabled={saving || !form.reason || !form.adminUsername || !form.adminPassword || !form.quantity}
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? 'Validando...' : 'Registrar ajuste'}
          </button>
        </div>
      </div>
    </div>
  )
}
