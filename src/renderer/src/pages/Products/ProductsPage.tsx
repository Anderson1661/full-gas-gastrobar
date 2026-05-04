import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productsApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore }  from '../../store/app.store'
import { formatCurrency } from '../../lib/utils'
import { cn } from '../../lib/utils'
import type { Product, ProductCategory } from '@shared/types/entities'
import { Plus, Pencil, Search, AlertTriangle, ToggleLeft, ToggleRight } from 'lucide-react'
import RefreshButton from '../../components/shared/RefreshButton'

export default function ProductsPage(): JSX.Element {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const { notify } = useAppStore()

  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<Product | null>(null)

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-all'],
    queryFn:  () => productsApi.list(true) as Promise<Product[]>
  })

  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ['categories'],
    queryFn:  () => productsApi.categories() as Promise<ProductCategory[]>
  })

  const filtered = products.filter(p => {
    const s = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const c = !catFilter || p.categoryId === catFilter
    return s && c
  })

  async function toggleActive(p: Product): Promise<void> {
    if (!user) return
    const result = await productsApi.update(
      { id: p.id, isActive: !p.isActive }, user.id, user.username
    ) as { success: boolean; error?: string }
    if (result.success) {
      qc.invalidateQueries({ queryKey: ['products-all'] })
      notify('success', `Producto ${p.isActive ? 'desactivado' : 'activado'}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Productos</h1>
        <div className="flex items-center gap-2">
          <RefreshButton queryKeys={[['products-all'], ['categories']]} />
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={catFilter ?? ''}
          onChange={e => setCatFilter(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none"
        >
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Producto</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Categoría</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Costo</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Precio</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Stock</th>
              <th className="px-4 py-3 text-center text-muted-foreground font-medium">Estado</th>
              <th className="px-4 py-3 text-center text-muted-foreground font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(p => (
              <tr key={p.id} className={cn('hover:bg-secondary/40', !p.isActive && 'opacity-50')}>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{p.name}</p>
                  {p.sku && <p className="text-xs text-muted-foreground">{p.sku}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.categoryName}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(p.costPrice)}</td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(p.salePrice)}</td>
                <td className="px-4 py-3 text-right">
                  {p.trackInventory ? (
                    <span className={cn(p.stock <= p.minStock ? 'text-amber-400' : 'text-foreground')}>
                      {p.stock} {p.unit}
                      {p.stock <= p.minStock && <AlertTriangle size={12} className="inline ml-1" />}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    p.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  )}>
                    {p.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => { setEditing(p); setShowForm(true) }}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                    >
                      {p.isActive ? <ToggleRight size={15} className="text-green-400" /> : <ToggleLeft size={15} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No se encontraron productos
          </div>
        )}
      </div>

      {showForm && (
        <ProductForm
          product={editing}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['products-all'] }) }}
        />
      )}
    </div>
  )
}

function ProductForm({
  product, categories, onClose, onSaved
}: {
  product: Product | null
  categories: ProductCategory[]
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const { user } = useAuthStore()
  const { notify } = useAppStore()

  const [form, setForm] = useState({
    name:        product?.name        ?? '',
    categoryId:  product?.categoryId  ?? (categories[0]?.id ?? 0),
    costPrice:   product?.costPrice   ?? 0,
    salePrice:   product?.salePrice   ?? 0,
    minStock:    product?.minStock    ?? 0,
    unit:        product?.unit        ?? 'und',
    trackInventory: product?.trackInventory ?? true,
    description: product?.description ?? '',
    sku:         product?.sku         ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    if (!user || !form.name || !form.categoryId) return
    setSaving(true)

    const result = product
      ? await productsApi.update({ id: product.id, ...form }, user.id, user.username)
      : await productsApi.create(form, user.id, user.username)

    setSaving(false)
    const r = result as { success: boolean; error?: string }

    if (r.success) {
      notify('success', product ? 'Producto actualizado' : 'Producto creado')
      onSaved()
    } else {
      notify('error', r.error ?? 'Error guardando producto')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">{product ? 'Editar producto' : 'Nuevo producto'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Plus size={16} className="rotate-45" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Nombre *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Categoría *</label>
              <select value={form.categoryId} onChange={e => setForm({...form, categoryId: Number(e.target.value)})}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none">
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Unidad</label>
              <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none">
                {['und','bot','ml','l','kg','g'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Precio costo</label>
              <input type="number" value={form.costPrice} onChange={e => setForm({...form, costPrice: Number(e.target.value)})}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Precio venta *</label>
              <input type="number" value={form.salePrice} onChange={e => setForm({...form, salePrice: Number(e.target.value)})}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Stock mínimo</label>
              <input type="number" value={form.minStock} onChange={e => setForm({...form, minStock: Number(e.target.value)})}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="trackInv" checked={form.trackInventory}
                onChange={e => setForm({...form, trackInventory: e.target.checked})}
                className="rounded" />
              <label htmlFor="trackInv" className="text-sm text-foreground">Control de inventario</label>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
          <button onClick={save} disabled={saving || !form.name || !form.salePrice}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
