import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import type { TableLayoutZone } from '@shared/types/entities'
import { tablesApi } from '../../lib/api'
import { useAppStore } from '../../store/app.store'
import { cn } from '../../lib/utils'

// ─── Constantes del canvas ────────────────────────────────────────────────────
const CANVAS_W = 1400
const CANVAS_H = 800
const CARD_W   = 132
const CARD_H   = 92

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface DesignerZone {
  localId: string
  id?: number
  name: string
  sortOrder: number
  isActive: boolean
}

interface DesignerTable {
  localId: string
  tableId?: number
  number: number
  name: string | null
  capacity: number
  zoneLocalId: string
  positionX: number
  positionY: number
  isActive: boolean
}

interface DragState {
  localId: string
  startClientX: number
  startClientY: number
  startTableX: number
  startTableY: number
}

interface LayoutResponse {
  success: boolean
  data?: TableLayoutZone[]
  warnings?: string[]
  error?: string
}

interface TableLayoutDesignerProps {
  open: boolean
  layout: TableLayoutZone[]
  onClose: () => void
  onChanged: () => Promise<void> | void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
}

function initFromLayout(layout: TableLayoutZone[]): { zones: DesignerZone[]; tables: DesignerTable[] } {
  const zones: DesignerZone[] = layout.map((z, i) => ({
    localId: `zone-${z.id}`,
    id: z.id,
    name: z.name,
    sortOrder: z.sortOrder || i + 1,
    isActive: z.isActive,
  }))

  const tables: DesignerTable[] = layout.flatMap((z) =>
    z.tables.map((t) => ({
      localId: `table-${t.id}`,
      tableId: t.id,
      number: t.number,
      name: t.name,
      capacity: t.capacity,
      zoneLocalId: `zone-${z.id}`,
      positionX: t.positionX > 0 || t.positionY > 0
        ? t.positionX
        : 20 + ((t.layoutCol ?? 1) - 1) * (CARD_W + 16),
      positionY: t.positionX > 0 || t.positionY > 0
        ? t.positionY
        : 20 + ((t.layoutRow ?? 1) - 1) * (CARD_H + 16),
      isActive: t.isActive,
    }))
  )

  return { zones, tables }
}

function nextAvailableNumber(tables: DesignerTable[]): number {
  const used = new Set(tables.map((t) => t.number))
  let n = 1
  while (used.has(n)) n++
  return n
}

function findFreePosition(existing: DesignerTable[]): { x: number; y: number } {
  const GAP = 16
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 10; col++) {
      const x = 20 + col * (CARD_W + GAP)
      const y = 20 + row * (CARD_H + GAP)
      const collides = existing.some(
        (t) => Math.abs(t.positionX - x) < CARD_W && Math.abs(t.positionY - y) < CARD_H
      )
      if (!collides) return { x, y }
    }
  }
  const last = existing[existing.length - 1]
  return last ? { x: Math.min(CANVAS_W - CARD_W, last.positionX + CARD_W + GAP), y: last.positionY } : { x: 20, y: 20 }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TableLayoutDesigner({
  open,
  layout,
  onClose,
  onChanged,
}: TableLayoutDesignerProps): JSX.Element | null {
  const { notify } = useAppStore()
  const [zones, setZones] = useState<DesignerZone[]>([])
  const [tables, setTables] = useState<DesignerTable[]>([])
  const [selectedZoneLocalId, setSelectedZoneLocalId] = useState<string | null>(null)
  const [selectedTableLocalId, setSelectedTableLocalId] = useState<string | null>(null)
  const [editingZoneLocalId, setEditingZoneLocalId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Ref para drag sin stale closures
  const dragRef = useRef<DragState | null>(null)
  const setTablesRef = useRef(setTables)
  setTablesRef.current = setTables

  // ── Inicializar desde layout ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const { zones: z, tables: t } = initFromLayout(layout)
    setZones(z)
    setTables(t)
    setSelectedZoneLocalId(z[0]?.localId ?? null)
    setSelectedTableLocalId(null)
    setEditingZoneLocalId(null)
  }, [open, layout])

  // ── Drag & Drop global ─────────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent): void {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startClientX
      const dy = e.clientY - d.startClientY
      const newX = Math.max(0, Math.min(CANVAS_W - CARD_W, d.startTableX + dx))
      const newY = Math.max(0, Math.min(CANVAS_H - CARD_H, d.startTableY + dy))
      setTablesRef.current((prev) =>
        prev.map((t) => (t.localId === d.localId ? { ...t, positionX: newX, positionY: newY } : t))
      )
    }

    function onUp(): void {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Computed ───────────────────────────────────────────────────────────────
  const sortedZones = useMemo(
    () => [...zones].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [zones]
  )

  const selectedZone = useMemo(
    () => zones.find((z) => z.localId === selectedZoneLocalId) ?? null,
    [zones, selectedZoneLocalId]
  )

  const selectedTable = useMemo(
    () => tables.find((t) => t.localId === selectedTableLocalId) ?? null,
    [tables, selectedTableLocalId]
  )

  const canvasTables = useMemo(
    () => tables.filter((t) => t.zoneLocalId === selectedZoneLocalId),
    [tables, selectedZoneLocalId]
  )

  if (!open) return null

  // ── Actualizadores ────────────────────────────────────────────────────────
  function updateZone(localId: string, patch: Partial<DesignerZone>): void {
    setZones((prev) => prev.map((z) => (z.localId === localId ? { ...z, ...patch } : z)))
  }

  function updateTable(localId: string, patch: Partial<DesignerTable>): void {
    setTables((prev) => prev.map((t) => (t.localId === localId ? { ...t, ...patch } : t)))
  }

  // ── Zonas ─────────────────────────────────────────────────────────────────
  function addZone(): void {
    const newLocalId = makeLocalId('zone-new')
    const newZone: DesignerZone = {
      localId: newLocalId,
      name: `Zona ${zones.length + 1}`,
      sortOrder: zones.length + 1,
      isActive: true,
    }
    setZones((prev) => [...prev, newZone])
    setSelectedZoneLocalId(newLocalId)
    setEditingZoneLocalId(newLocalId)
    setSelectedTableLocalId(null)
  }

  function removeZone(localId: string): void {
    if (zones.length <= 1) {
      notify('warning', 'Debe existir al menos una zona.')
      return
    }

    const zoneTables = tables.filter((t) => t.zoneLocalId === localId)

    // Mover mesas de la zona eliminada a la primera zona restante
    const remaining = sortedZones.filter((z) => z.localId !== localId)
    const fallback = remaining[0]
    if (!fallback) return

    if (zoneTables.length) {
      const fallbackTables = tables.filter((t) => t.zoneLocalId === fallback.localId)
      setTables((prev) =>
        prev.map((t) => {
          if (t.zoneLocalId !== localId) return t
          const { x, y } = findFreePosition([...fallbackTables, ...prev.filter((p) => p.zoneLocalId === fallback.localId)])
          return { ...t, zoneLocalId: fallback.localId, positionX: x, positionY: y }
        })
      )
      notify('info', `Las mesas de "${zones.find((z) => z.localId === localId)?.name}" se movieron a "${fallback.name}".`)
    }

    setZones((prev) => prev.filter((z) => z.localId !== localId))
    if (selectedZoneLocalId === localId) setSelectedZoneLocalId(fallback.localId)
    if (editingZoneLocalId === localId) setEditingZoneLocalId(null)
    setSelectedTableLocalId(null)
  }

  // ── Mesas ─────────────────────────────────────────────────────────────────
  function addTable(): void {
    if (!selectedZoneLocalId) return
    const zoneTablesList = canvasTables
    const newLocalId = makeLocalId('new')
    const number = nextAvailableNumber(tables)
    const { x, y } = findFreePosition(zoneTablesList)

    const newTable: DesignerTable = {
      localId: newLocalId,
      tableId: undefined,
      number,
      name: null,
      capacity: 4,
      zoneLocalId: selectedZoneLocalId,
      positionX: x,
      positionY: y,
      isActive: true,
    }

    setTables((prev) => [...prev, newTable])
    setSelectedTableLocalId(newLocalId)
  }

  function deleteTable(localId: string): void {
    const table = tables.find((t) => t.localId === localId)
    if (!table) return

    if (table.tableId === undefined) {
      // Mesa nueva sin guardar: eliminar directamente
      setTables((prev) => prev.filter((t) => t.localId !== localId))
    } else {
      // Mesa existente: marcar inactiva
      updateTable(localId, { isActive: false })
    }

    setSelectedTableLocalId(null)
  }

  // ── Drag ──────────────────────────────────────────────────────────────────
  function startDrag(e: React.MouseEvent, table: DesignerTable): void {
    e.preventDefault()
    e.stopPropagation()
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    setSelectedTableLocalId(table.localId)
    dragRef.current = {
      localId: table.localId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTableX: table.positionX,
      startTableY: table.positionY,
    }
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function handleSave(): Promise<void> {
    const dtoZones = sortedZones.map((z) => ({
      id: z.id,
      name: z.name.trim() || 'General',
      sortOrder: z.sortOrder,
      isActive: z.isActive,
    }))

    const dtoTables = tables.map((t) => {
      const zone = zones.find((z) => z.localId === t.zoneLocalId)
      return {
        tableId: t.tableId,
        number: t.number,
        name: t.name,
        capacity: t.capacity,
        zoneName: zone?.name.trim() || null,
        positionX: Math.max(0, Math.round(t.positionX)),
        positionY: Math.max(0, Math.round(t.positionY)),
        isActive: t.isActive,
      }
    })

    setLoading(true)
    const result = await tablesApi.saveFreeLayout({ zones: dtoZones, tables: dtoTables }) as LayoutResponse
    setLoading(false)

    if (!result.success || !result.data) {
      notify('error', result.error ?? 'No se pudo guardar el diseno')
      return
    }

    if (result.warnings?.length) {
      notify('warning', result.warnings.join(' | '))
    } else {
      notify('success', 'Diseno de mesas guardado')
    }

    await onChanged()
    onClose()
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Disenar mesas</h2>
            <p className="text-sm text-muted-foreground">
              Arrastra las mesas libremente. Los cambios se guardan al hacer clic en Guardar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {loading ? 'Guardando...' : 'Guardar diseno'}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[268px,1fr]">

          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <aside className="flex flex-col gap-0 overflow-y-auto border-r border-border">

            {/* Zonas */}
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Zonas</h3>
                <button
                  onClick={addZone}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-foreground hover:bg-secondary"
                >
                  <Plus size={12} />
                  Agregar
                </button>
              </div>

              <div className="space-y-1">
                {sortedZones.map((zone) => (
                  <div key={zone.localId}>
                    {editingZoneLocalId === zone.localId ? (
                      <div className="rounded-lg border border-primary/40 bg-secondary/30 p-2">
                        <input
                          autoFocus
                          value={zone.name}
                          onChange={(e) => updateZone(zone.localId, { name: e.target.value })}
                          onBlur={() => setEditingZoneLocalId(null)}
                          onKeyDown={(e) => { if (e.key === 'Enter') setEditingZoneLocalId(null) }}
                          className="w-full rounded border border-border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={zone.isActive}
                            onChange={(e) => updateZone(zone.localId, { isActive: e.target.checked })}
                          />
                          Zona activa
                        </label>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedZoneLocalId(zone.localId)
                          setSelectedTableLocalId(null)
                        }}
                        className={cn(
                          'group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          selectedZoneLocalId === zone.localId
                            ? 'bg-primary/15 text-primary'
                            : 'text-foreground hover:bg-secondary'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', zone.isActive ? 'bg-green-400' : 'bg-muted-foreground')} />
                          <span className="truncate font-medium">{zone.name}</span>
                          {!zone.id && (
                            <span className="flex-shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">nueva</span>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); setEditingZoneLocalId(zone.localId) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setEditingZoneLocalId(zone.localId) } }}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            ✎
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); removeZone(zone.localId) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeZone(zone.localId) } }}
                            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                          >
                            <X size={12} />
                          </span>
                        </div>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mx-4 border-t border-border" />

            {/* Editor de mesa */}
            <div className="flex-1 p-4">
              {selectedTable ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Mesa #{selectedTable.number}
                    </h3>
                    {!selectedTable.isActive && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactiva</span>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Numero</label>
                    <input
                      type="number"
                      min="1"
                      max="59999"
                      value={selectedTable.number}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isInteger(n) && n > 0) updateTable(selectedTable.localId, { number: n })
                      }}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Nombre / alias</label>
                    <input
                      value={selectedTable.name ?? ''}
                      onChange={(e) => updateTable(selectedTable.localId, { name: e.target.value || null })}
                      placeholder={`Mesa ${selectedTable.number}`}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Capacidad</label>
                    <input
                      type="number"
                      min="1"
                      value={selectedTable.capacity}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isInteger(n) && n > 0) updateTable(selectedTable.localId, { capacity: n })
                      }}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Zona</label>
                    <select
                      value={selectedTable.zoneLocalId}
                      onChange={(e) => updateTable(selectedTable.localId, { zoneLocalId: e.target.value })}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {zones.map((z) => (
                        <option key={z.localId} value={z.localId}>{z.name}</option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={selectedTable.isActive}
                      onChange={(e) => updateTable(selectedTable.localId, { isActive: e.target.checked })}
                    />
                    Mesa activa
                  </label>

                  <button
                    onClick={() => deleteTable(selectedTable.localId)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 py-2 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={13} />
                    {selectedTable.tableId ? 'Desactivar mesa' : 'Eliminar mesa'}
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Haz clic en una mesa del canvas para editar sus datos.
                </div>
              )}
            </div>
          </aside>

          {/* ── Canvas principal ─────────────────────────────────────────── */}
          <section className="flex min-h-0 flex-col overflow-hidden">
            {!selectedZone ? (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                Selecciona una zona para empezar a disenar.
              </div>
            ) : (
              <>
                {/* Tabs de zona */}
                <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-2">
                  {sortedZones.map((zone) => (
                    <button
                      key={zone.localId}
                      onClick={() => {
                        setSelectedZoneLocalId(zone.localId)
                        setSelectedTableLocalId(null)
                      }}
                      className={cn(
                        'flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                        selectedZoneLocalId === zone.localId
                          ? 'bg-primary text-white'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      )}
                    >
                      {zone.name}
                      <span className="ml-2 text-xs opacity-60">
                        ({tables.filter((t) => t.zoneLocalId === zone.localId && t.isActive).length})
                      </span>
                    </button>
                  ))}
                </div>

                {/* Canvas */}
                <div
                  className="flex-1 overflow-auto"
                  style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                  }}
                  onClick={() => setSelectedTableLocalId(null)}
                >
                  <div
                    className="relative"
                    style={{ width: CANVAS_W, height: CANVAS_H, minWidth: '100%', minHeight: 480 }}
                  >
                    {canvasTables.map((table) => (
                      <div
                        key={table.localId}
                        onMouseDown={(e) => startDrag(e, table)}
                        onClick={(e) => { e.stopPropagation(); setSelectedTableLocalId(table.localId) }}
                        style={{
                          position: 'absolute',
                          left: table.positionX,
                          top: table.positionY,
                          width: CARD_W,
                          height: CARD_H,
                          cursor: 'grab',
                        }}
                        className={cn(
                          'select-none rounded-xl border-2 p-3 transition-shadow',
                          !table.isActive
                            ? 'border-border bg-secondary/40 opacity-50'
                            : selectedTableLocalId === table.localId
                            ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                            : 'border-border bg-card hover:border-primary/50 hover:shadow-md'
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <span className="text-base font-bold text-foreground leading-none">
                            #{table.number}
                          </span>
                          {!table.isActive && (
                            <span className="text-[10px] text-muted-foreground">off</span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {table.name || `Mesa ${table.number}`}
                        </p>
                        <p className="mt-auto pt-2 text-xs text-muted-foreground">
                          👤 {table.capacity}
                          {!table.tableId && (
                            <span className="ml-2 rounded bg-amber-500/20 px-1 text-amber-400">nueva</span>
                          )}
                        </p>
                      </div>
                    ))}

                    {canvasTables.length === 0 && (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <p className="text-sm">Esta zona esta vacia.</p>
                          <p className="mt-1 text-xs">Haz clic en &quot;Agregar mesa&quot; para comenzar.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer del canvas */}
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {canvasTables.filter((t) => t.isActive).length} mesas activas en {selectedZone.name}
                  </p>
                  <button
                    onClick={addTable}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary/80"
                  >
                    <Plus size={14} />
                    Agregar mesa
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
