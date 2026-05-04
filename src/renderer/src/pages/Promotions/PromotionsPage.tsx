import React, { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productsApi, promotionsApi } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import type { Product, ProductCategory, Promotion, PromotionItem } from '@shared/types/entities'
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Pencil,
  Percent,
  Plus,
  Power,
  PowerOff,
  Tag,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import RefreshButton from '../../components/shared/RefreshButton'

const TYPE_LABELS: Record<string, string> = {
  percentage: 'Porcentaje',
  fixed_amount: 'Monto fijo',
  fixed_price: 'Precio fijo',
  combo: 'Combo',
  happy_hour: 'Happy Hour',
}

const TYPE_COLORS: Record<string, string> = {
  percentage: 'text-blue-400 bg-blue-500/20',
  fixed_amount: 'text-green-400 bg-green-500/20',
  fixed_price: 'text-violet-400 bg-violet-500/20',
  combo: 'text-orange-400 bg-orange-500/20',
  happy_hour: 'text-pink-400 bg-pink-500/20',
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

const PROMOTION_TYPES = [
  { value: 'percentage', label: 'Descuento porcentual' },
  { value: 'fixed_amount', label: 'Descuento monto fijo' },
  { value: 'fixed_price', label: 'Precio fijo' },
  { value: 'combo', label: 'Combo manual' },
  { value: 'happy_hour', label: 'Happy Hour' },
]

const APPLIES_TO_OPTIONS = [
  { value: 'product', label: 'Producto' },
  { value: 'category', label: 'Categoria' },
  { value: 'order', label: 'Orden completa' },
]

const ALL_DAYS = [
  { value: '0', label: 'Dom' },
  { value: '1', label: 'Lun' },
  { value: '2', label: 'Mar' },
  { value: '3', label: 'Mie' },
  { value: '4', label: 'Jue' },
  { value: '5', label: 'Vie' },
  { value: '6', label: 'Sab' },
]

function normalizeDateInputValue(value: unknown): string {
  if (!value) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value.includes('T') ? value.slice(0, 10) : value
  return String(value)
}

function normalizeTimeInputValue(value: unknown): string {
  if (!value) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(11, 16)
  if (typeof value === 'string') return value.length >= 5 ? value.slice(0, 5) : value
  return String(value)
}

function formatDateLabel(value: unknown): string {
  return normalizeDateInputValue(value) || 'sin definir'
}

function formatDiscount(promo: Promotion): string {
  const discountValue = Number(promo.discountValue ?? 0)
  if (promo.type === 'percentage') return `${discountValue}%`
  if (promo.type === 'fixed_amount') return `$${discountValue.toLocaleString()}`
  if (promo.type === 'fixed_price') return `Precio: $${discountValue.toLocaleString()}`
  if (promo.type === 'combo') return 'Combo manual'
  if (promo.type === 'happy_hour') return `${discountValue}% Happy Hour`
  return String(discountValue)
}

function getDays(daysOfWeek: string | null): string {
  if (!daysOfWeek || typeof daysOfWeek !== 'string') return 'Todos los dias'
  return daysOfWeek.split(',').map((day) => DAY_LABELS[Number(day)] ?? day).join(', ')
}

function normalizeNumberArray(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].sort((left, right) => left - right)
}

function areArraysEqual(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

interface FormState {
  name: string
  description: string
  type: Promotion['type']
  discountValue: string
  minQuantity: string
  appliesTo: Promotion['appliesTo']
  startTime: string
  endTime: string
  validFrom: string
  validUntil: string
  isActive: boolean
  autoApply: boolean
  priority: string
  daysOfWeek: string[]
  productIds: number[]
  categoryIds: number[]
}

export default function PromotionsPage(): JSX.Element {
  const { sessionToken } = useAuthStore()
  const { notify } = useAppStore()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [showAll, setShowAll] = useState(false)

  const {
    data: promotions = [],
    isLoading,
    isError,
    error,
  } = useQuery<Promotion[]>({
    queryKey: ['promotions', showAll],
    queryFn: () =>
      promotionsApi.list(showAll, sessionToken ?? undefined).then((result) => {
        const normalized = result as { success?: boolean; data?: Promotion[] } | Promotion[]
        return Array.isArray(normalized) ? normalized : normalized.data ?? []
      }),
  })

  async function toggle(promotion: Promotion): Promise<void> {
    if (!sessionToken) return
    const result = await promotionsApi.toggle(promotion.id, sessionToken) as { success: boolean; error?: string }
    if (!result.success) {
      notify('error', result.error ?? 'Error')
      return
    }

    notify('success', `Promocion ${promotion.isActive ? 'desactivada' : 'activada'}`)
    qc.invalidateQueries({ queryKey: ['promotions'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Promociones</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Promociones diarias y reglas de descuento del gastrobar</p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton queryKeys={[['promotions']]} />
          <button
            onClick={() => setShowAll((current) => !current)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showAll ? 'Solo activas' : 'Ver todas'}
          </button>
          <button
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} /> Nueva promocion
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="py-12 text-center text-muted-foreground">Cargando...</div>
      )}

      {!isLoading && promotions.length === 0 && (
        <div className="py-16 text-center text-muted-foreground">
          <Tag size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay promociones {showAll ? '' : 'activas'}.</p>
          <p className="mt-1 text-sm">Crea tu primera promocion con el boton superior.</p>
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          No se pudo cargar el listado de promociones. {error instanceof Error ? error.message : 'Revisa los datos guardados e intenta de nuevo.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {promotions.map((promotion) => (
          <PromotionCard
            key={promotion.id}
            promotion={promotion}
            onEdit={() => {
              setEditing(promotion)
              setShowForm(true)
            }}
            onToggle={() => toggle(promotion)}
          />
        ))}
      </div>

      {showForm && (
        <PromotionForm
          promotion={editing}
          sessionToken={sessionToken ?? ''}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['promotions'] })
          }}
          notify={notify}
        />
      )}
    </div>
  )
}

function PromotionCard({
  promotion,
  onEdit,
  onToggle,
}: {
  promotion: Promotion
  onEdit: () => void
  onToggle: () => void
}): JSX.Element {
  return (
    <div className={cn('space-y-3 rounded-xl border border-border bg-card p-4', !promotion.isActive && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{promotion.name}</p>
          {promotion.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{promotion.description}</p>}
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TYPE_COLORS[promotion.type])}>
          {TYPE_LABELS[promotion.type]}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Percent size={14} className="text-primary" />
          {formatDiscount(promotion)}
        </div>
        <div className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {promotion.autoApply ? 'Automatica' : 'Manual'}
        </div>
        {promotion.priority > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Tag size={12} />
            Prioridad {promotion.priority}
          </div>
        )}
      </div>

      {(promotion.startTime || promotion.endTime || promotion.daysOfWeek) && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {(promotion.startTime || promotion.endTime) && (
            <div className="flex items-center gap-1">
              <Clock size={11} />
              {promotion.startTime ?? '--:--'} - {promotion.endTime ?? '--:--'}
            </div>
          )}
          <div className="flex items-center gap-1">
            <Calendar size={11} />
            {getDays(promotion.daysOfWeek)}
          </div>
        </div>
      )}

      {(promotion.validFrom || promotion.validUntil) && (
        <p className="text-xs text-muted-foreground">
          Vigencia: {formatDateLabel(promotion.validFrom)} a {promotion.validUntil ? formatDateLabel(promotion.validUntil) : 'sin fin'}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Pencil size={12} /> Editar
        </button>
        <button
          onClick={onToggle}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs',
            promotion.isActive
              ? 'border-destructive/50 text-destructive/80 hover:bg-destructive/10'
              : 'border-green-500/50 text-green-500 hover:bg-green-500/10'
          )}
        >
          {promotion.isActive ? <PowerOff size={12} /> : <Power size={12} />}
          {promotion.isActive ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>
  )
}

function PromotionForm({
  promotion,
  sessionToken,
  onClose,
  onSaved,
  notify,
}: {
  promotion: Promotion | null
  sessionToken: string
  onClose: () => void
  onSaved: () => void
  notify: (type: 'success' | 'error', message: string) => void
}): JSX.Element {
  const [form, setForm] = useState<FormState>({
    name: promotion?.name ?? '',
    description: promotion?.description ?? '',
    type: promotion?.type ?? 'percentage',
    discountValue: String(promotion?.discountValue ?? ''),
    minQuantity: String(promotion?.minQuantity ?? '1'),
    appliesTo: promotion?.appliesTo ?? 'product',
    startTime: normalizeTimeInputValue(promotion?.startTime),
    endTime: normalizeTimeInputValue(promotion?.endTime),
    validFrom: normalizeDateInputValue(promotion?.validFrom),
    validUntil: normalizeDateInputValue(promotion?.validUntil),
    isActive: promotion?.isActive ?? true,
    autoApply: promotion?.autoApply ?? false,
    priority: String(promotion?.priority ?? '0'),
    daysOfWeek: typeof promotion?.daysOfWeek === 'string' ? promotion.daysOfWeek.split(',').filter(Boolean) : [],
    productIds: [],
    categoryIds: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-promotion-form'],
    queryFn: () => productsApi.list(true) as Promise<Product[]>,
  })

  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ['categories'],
    queryFn: () => productsApi.categories() as Promise<ProductCategory[]>,
  })

  const { data: targetItems = [] } = useQuery<PromotionItem[]>({
    queryKey: ['promotion-items', promotion?.id],
    enabled: Boolean(promotion?.id),
    queryFn: () =>
      promotionsApi.listItems(promotion!.id).then((result) => {
        const normalized = result as { success?: boolean; data?: PromotionItem[] } | PromotionItem[]
        return Array.isArray(normalized) ? normalized : normalized.data ?? []
      }),
  })

  useEffect(() => {
    if (!promotion) return

    const nextProductIds = normalizeNumberArray(targetItems.flatMap((item) => item.productId ? [item.productId] : []))
    const nextCategoryIds = normalizeNumberArray(targetItems.flatMap((item) => item.categoryId ? [item.categoryId] : []))

    setForm((current) => (
      areArraysEqual(current.productIds, nextProductIds) && areArraysEqual(current.categoryIds, nextCategoryIds)
        ? current
        : { ...current, productIds: nextProductIds, categoryIds: nextCategoryIds }
    ))
  }, [promotion, targetItems])

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleDay(day: string): void {
    setForm((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((value) => value !== day)
        : [...current.daysOfWeek, day].sort(),
    }))
  }

  function toggleTarget(key: 'productIds' | 'categoryIds', id: number): void {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((value) => value !== id)
        : [...current[key], id].sort((left, right) => left - right),
    }))
  }

  async function save(): Promise<void> {
    if (!form.name.trim()) {
      setError('El nombre es obligatorio')
      return
    }

    const discountValue = Number(form.discountValue)
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      setError('El valor del descuento debe ser valido')
      return
    }

    if ((form.type === 'percentage' || form.type === 'happy_hour') && discountValue > 100) {
      setError('Los descuentos porcentuales no pueden exceder 100%')
      return
    }

    if (form.validFrom && form.validUntil && form.validFrom > form.validUntil) {
      setError('La vigencia inicial no puede ser posterior a la final')
      return
    }

    if (form.appliesTo === 'product' && form.productIds.length === 0) {
      setError('Selecciona al menos un producto objetivo')
      return
    }

    if (form.appliesTo === 'category' && form.categoryIds.length === 0) {
      setError('Selecciona al menos una categoria objetivo')
      return
    }

    if (form.autoApply && (form.type === 'combo' || form.appliesTo === 'order')) {
      setError('La aplicacion automatica solo esta disponible para producto o categoria con tipos soportados')
      return
    }

    if (form.autoApply && form.type === 'happy_hour' && !form.startTime && !form.endTime) {
      setError('Happy Hour automatico requiere al menos una hora de inicio o fin')
      return
    }

    setSaving(true)
    setError(null)

    const dto = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      discountValue,
      minQuantity: Number(form.minQuantity) || 1,
      appliesTo: form.appliesTo,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      daysOfWeek: form.daysOfWeek.length ? form.daysOfWeek.join(',') : undefined,
      validFrom: form.validFrom || undefined,
      validUntil: form.validUntil || undefined,
      isActive: form.isActive,
      autoApply: form.autoApply,
      priority: Number(form.priority) || 0,
      productIds: form.appliesTo === 'product' ? form.productIds : [],
      categoryIds: form.appliesTo === 'category' ? form.categoryIds : [],
    }

    try {
      const result = promotion
        ? await promotionsApi.update({ ...dto, id: promotion.id }, sessionToken)
        : await promotionsApi.create(dto, sessionToken)

      const normalized = result as { success: boolean; error?: string }
      if (!normalized.success) {
        setError(normalized.error ?? 'Error guardando')
        return
      }

      notify('success', promotion ? 'Promocion actualizada' : 'Promocion creada')
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ocurrio un error inesperado guardando la promocion')
    } finally {
      setSaving(false)
    }
  }

  const inputClassName = 'w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary'
  const labelClassName = 'mb-1 block text-xs text-muted-foreground'
  const isAutoApplyUnsupported = form.autoApply && (form.type === 'combo' || form.appliesTo === 'order')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <h3 className="font-semibold text-foreground">{promotion ? 'Editar promocion' : 'Nueva promocion'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">x</button>
        </div>

        <div className="space-y-5 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClassName}>Nombre *</label>
              <input className={inputClassName} value={form.name} onChange={(event) => setField('name', event.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClassName}>Descripcion</label>
              <textarea
                rows={2}
                className={inputClassName}
                value={form.description}
                onChange={(event) => setField('description', event.target.value)}
              />
            </div>
            <div>
              <label className={labelClassName}>Tipo de promocion *</label>
              <select className={inputClassName} value={form.type} onChange={(event) => setField('type', event.target.value as Promotion['type'])}>
                {PROMOTION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClassName}>{form.type === 'percentage' || form.type === 'happy_hour' ? 'Descuento (%)' : 'Valor ($)'}</label>
              <input
                type="number"
                min="0"
                className={inputClassName}
                value={form.discountValue}
                onChange={(event) => setField('discountValue', event.target.value)}
              />
            </div>
            <div>
              <label className={labelClassName}>Aplica a</label>
              <select className={inputClassName} value={form.appliesTo} onChange={(event) => setField('appliesTo', event.target.value as Promotion['appliesTo'])}>
                {APPLIES_TO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClassName}>Cantidad minima</label>
              <input
                type="number"
                min="1"
                className={inputClassName}
                value={form.minQuantity}
                onChange={(event) => setField('minQuantity', event.target.value)}
              />
            </div>
          </div>

          {form.appliesTo === 'product' && (
            <TargetChecklist
              title="Productos incluidos"
              emptyMessage="No hay productos disponibles"
              rows={products.map((product) => ({
                id: product.id,
                label: product.name,
                meta: product.categoryName,
                checked: form.productIds.includes(product.id),
                onToggle: () => toggleTarget('productIds', product.id),
              }))}
            />
          )}

          {form.appliesTo === 'category' && (
            <TargetChecklist
              title="Categorias incluidas"
              emptyMessage="No hay categorias disponibles"
              rows={categories.map((category) => ({
                id: category.id,
                label: category.name,
                meta: category.description ?? null,
                checked: form.categoryIds.includes(category.id),
                onToggle: () => toggleTarget('categoryIds', category.id),
              }))}
            />
          )}

          {form.appliesTo === 'order' && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              El modelo actual permite registrar promociones de orden completa, pero su aplicacion automatica queda desactivada para evitar descuentos inconsistentes.
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Horario y dias</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className={labelClassName}>Hora inicio</label>
                <input type="time" className={inputClassName} value={form.startTime} onChange={(event) => setField('startTime', event.target.value)} />
              </div>
              <div>
                <label className={labelClassName}>Hora fin</label>
                <input type="time" className={inputClassName} value={form.endTime} onChange={(event) => setField('endTime', event.target.value)} />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {ALL_DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    form.daysOfWeek.includes(day.value)
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {day.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setField('daysOfWeek', [])}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={labelClassName}>Valida desde</label>
              <input type="date" className={inputClassName} value={form.validFrom} onChange={(event) => setField('validFrom', event.target.value)} />
            </div>
            <div>
              <label className={labelClassName}>Valida hasta</label>
              <input type="date" className={inputClassName} value={form.validUntil} onChange={(event) => setField('validUntil', event.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className={labelClassName}>Prioridad</label>
              <input type="number" min="0" className={inputClassName} value={form.priority} onChange={(event) => setField('priority', event.target.value)} />
            </div>
            <label className="flex items-center gap-2 pt-6 text-sm text-foreground">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setField('isActive', event.target.checked)} className="accent-primary" />
              Activa
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-foreground">
              <input type="checkbox" checked={form.autoApply} onChange={(event) => setField('autoApply', event.target.checked)} className="accent-primary" />
              Aplicar automaticamente
            </label>
          </div>

          <div className={cn(
            'rounded-xl border p-4 text-sm',
            isAutoApplyUnsupported
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              : form.autoApply
                ? 'border-green-500/30 bg-green-500/10 text-green-200'
                : 'border-border bg-secondary/30 text-muted-foreground'
          )}>
            {form.autoApply
              ? isAutoApplyUnsupported
                ? 'Esta combinacion quedara registrada, pero la aplicacion automatica no esta soportada con el modelo actual. Cambia el alcance o el tipo, o dejala como manual.'
                : 'La promocion se evaluara y aplicara desde backend al agregar items a la orden.'
              : 'La promocion quedara en administracion y no se aplicara automaticamente en las ventas.'}
          </div>

          {error && (
            <div className="rounded border border-destructive/30 bg-destructive/15 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving && <DollarSign size={14} className="animate-spin" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TargetChecklist({
  title,
  emptyMessage,
  rows,
}: {
  title: string
  emptyMessage: string
  rows: Array<{ id: number; label: string; meta: string | null; checked: boolean; onToggle: () => void }>
}): JSX.Element {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-foreground">{title}</p>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-secondary/20">
        {rows.length === 0 && (
          <div className="px-4 py-6 text-sm text-muted-foreground">{emptyMessage}</div>
        )}

        {rows.map((row) => (
          <label
            key={row.id}
            className="flex cursor-pointer items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-sm last:border-0"
          >
            <div>
              <p className="text-foreground">{row.label}</p>
              {row.meta && <p className="text-xs text-muted-foreground">{row.meta}</p>}
            </div>
            <input type="checkbox" checked={row.checked} onChange={row.onToggle} className="accent-primary" />
          </label>
        ))}
      </div>
    </div>
  )
}
