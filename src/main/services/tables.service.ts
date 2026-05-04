import type { Connection } from 'mysql2/promise'
import { asPositiveInt, execute, query, queryOne, withTransaction } from '../database/connection'
import { auditLog } from '../utils/audit'
import type { BarTable, TableLayoutZone, TableStatus } from '@shared/types/entities'
import type {
  ApiResult,
  BulkGenerateTablesDTO,
  SaveFreeLayoutDTO,
  SaveTableLayoutDTO,
  TableLayoutZoneInputDTO,
} from '@shared/types/dtos'

interface TableRow {
  id: number
  number: number
  name: string | null
  capacity: number
  zone_id: number | null
  zone_name: string | null
  zone: string | null
  position_x: number
  position_y: number
  layout_row: number | null
  layout_col: number | null
  layout_order: number | null
  status: TableStatus
  is_active: number
  current_order_id: number | null
  current_order_total: number | null
  current_waiter: string | null
}

interface ZoneRow {
  id: number
  name: string
  zone_rows: number
  zone_cols: number
  sort_order: number
  is_active: number
}

interface ServiceResponse<T> extends ApiResult<T> {
  warnings?: string[]
}

interface ZoneRuntime {
  zoneId: number
  zoneName: string
  rows: number
  cols: number
  sortOrder: number
}

const CELL_WIDTH = 150
const CELL_HEIGHT = 130
const CELL_OFFSET_X = 40
const CELL_OFFSET_Y = 40

function mapRow(row: TableRow): BarTable {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    capacity: row.capacity,
    zoneId: row.zone_id,
    zone: row.zone_name ?? row.zone,
    positionX: row.position_x,
    positionY: row.position_y,
    layoutRow: row.layout_row,
    layoutCol: row.layout_col,
    layoutOrder: row.layout_order,
    status: row.status,
    isActive: Boolean(row.is_active),
    currentOrderId: row.current_order_id ?? undefined,
    currentOrderTotal: row.current_order_total ?? undefined,
    currentWaiter: row.current_waiter ?? undefined,
  }
}

function mapZone(row: ZoneRow): TableLayoutZone {
  return {
    id: row.id,
    name: row.name,
    rows: Number(row.zone_rows),
    cols: Number(row.zone_cols),
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
    tables: [],
  }
}

function normalizeZoneName(value: unknown): string {
  const normalized = String(value ?? '').trim()
  return normalized.length ? normalized : 'General'
}

function normalizeSortOrder(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback
}

function getLegacyPosition(layoutRow: number, layoutCol: number): { positionX: number; positionY: number } {
  return {
    positionX: CELL_OFFSET_X + (layoutCol - 1) * CELL_WIDTH,
    positionY: CELL_OFFSET_Y + (layoutRow - 1) * CELL_HEIGHT,
  }
}

async function selectRows<T>(conn: Connection | undefined, sql: string, params: unknown[] = []): Promise<T[]> {
  if (conn) {
    const [rows] = await conn.execute(sql, params as never)
    return rows as T[]
  }

  return query<T>(sql, params)
}

async function selectOne<T>(conn: Connection | undefined, sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await selectRows<T>(conn, sql, params)
  return rows[0] ?? null
}

export class TablesService {
  async list(): Promise<BarTable[]> {
    const rows = await this.fetchTables()
    return rows.map(mapRow)
  }

  async getLayout(): Promise<TableLayoutZone[]> {
    const [zones, tables] = await Promise.all([this.fetchZones(), this.list()])
    return this.composeLayout(zones, tables)
  }

  async getById(id: number): Promise<BarTable | null> {
    const row = await queryOne<TableRow>(
      `SELECT t.*,
              z.name AS zone_name,
              o.id    AS current_order_id,
              o.total AS current_order_total,
              u.full_name AS current_waiter
       FROM bar_tables t
       LEFT JOIN table_layout_zones z ON z.id = t.zone_id
       LEFT JOIN orders o ON o.table_id = t.id AND o.status IN ('open','pending_payment')
       LEFT JOIN users  u ON u.id = o.waiter_id
       WHERE t.id = ?`,
      [id]
    )

    return row ? mapRow(row) : null
  }

  async create(
    data: {
      number: number
      name?: string
      capacity?: number
      zoneId?: number | null
      zone?: string
      positionX?: number
      positionY?: number
      layoutRow?: number
      layoutCol?: number
      layoutOrder?: number
    },
    actorId: number,
    actorUsername: string
  ): Promise<ApiResult<BarTable>> {
    const existing = await queryOne('SELECT id FROM bar_tables WHERE number = ?', [data.number])
    if (existing) {
      return { success: false, error: `La mesa numero ${data.number} ya existe`, code: 'DUPLICATE' }
    }

    const layoutRow = data.layoutRow ?? null
    const layoutCol = data.layoutCol ?? null
    const layoutOrder = data.layoutOrder ?? null
    const fallbackPosition = layoutRow && layoutCol ? getLegacyPosition(layoutRow, layoutCol) : null
    const zoneName = normalizeZoneName(data.zone)

    const { insertId } = await execute(
      `INSERT INTO bar_tables (
         number, name, capacity, zone_id, zone, position_x, position_y, layout_row, layout_col, layout_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.number,
        data.name ?? null,
        asPositiveInt(data.capacity, 4),
        data.zoneId ?? null,
        zoneName,
        data.positionX ?? fallbackPosition?.positionX ?? 0,
        data.positionY ?? fallbackPosition?.positionY ?? 0,
        layoutRow,
        layoutCol,
        layoutOrder,
      ]
    )

    await auditLog({
      userId: actorId,
      username: actorUsername,
      action: 'CREATE',
      module: 'tables',
      recordId: String(insertId),
      description: `Mesa ${data.number} creada`,
      newValues: {
        number: data.number,
        name: data.name ?? null,
        capacity: asPositiveInt(data.capacity, 4),
        zoneId: data.zoneId ?? null,
        zone: zoneName,
        layoutRow,
        layoutCol,
        layoutOrder,
      },
    })

    const table = await this.getById(insertId)
    return { success: true, data: table! }
  }

  async update(
    id: number,
    data: {
      name?: string
      capacity?: number
      zoneId?: number | null
      zone?: string
      positionX?: number
      positionY?: number
      layoutRow?: number
      layoutCol?: number
      layoutOrder?: number
      isActive?: boolean
    },
    actorId: number,
    actorUsername: string
  ): Promise<ApiResult<BarTable>> {
    const current = await this.getById(id)
    if (!current) return { success: false, error: 'Mesa no encontrada', code: 'NOT_FOUND' }

    const nextLayoutRow = data.layoutRow ?? current.layoutRow ?? null
    const nextLayoutCol = data.layoutCol ?? current.layoutCol ?? null
    const fallbackPosition = nextLayoutRow && nextLayoutCol ? getLegacyPosition(nextLayoutRow, nextLayoutCol) : null

    await execute(
      `UPDATE bar_tables
       SET name         = COALESCE(?, name),
           capacity     = COALESCE(?, capacity),
           zone_id      = COALESCE(?, zone_id),
           zone         = COALESCE(?, zone),
           position_x   = COALESCE(?, position_x),
           position_y   = COALESCE(?, position_y),
           layout_row   = COALESCE(?, layout_row),
           layout_col   = COALESCE(?, layout_col),
           layout_order = COALESCE(?, layout_order),
           is_active    = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        data.name,
        data.capacity,
        data.zoneId,
        data.zone ? normalizeZoneName(data.zone) : null,
        data.positionX ?? fallbackPosition?.positionX ?? null,
        data.positionY ?? fallbackPosition?.positionY ?? null,
        data.layoutRow,
        data.layoutCol,
        data.layoutOrder,
        data.isActive !== undefined ? (data.isActive ? 1 : 0) : null,
        id,
      ]
    )

    await auditLog({
      userId: actorId,
      username: actorUsername,
      action: 'UPDATE',
      module: 'tables',
      recordId: String(id),
      description: `Mesa ${current.number} actualizada`,
      oldValues: {
        name: current.name,
        capacity: current.capacity,
        zoneId: current.zoneId,
        zone: current.zone,
        layoutRow: current.layoutRow,
        layoutCol: current.layoutCol,
        layoutOrder: current.layoutOrder,
        isActive: current.isActive,
      },
      newValues: data,
    })

    const updated = await this.getById(id)
    return { success: true, data: updated! }
  }

  async bulkGenerate(
    dto: BulkGenerateTablesDTO,
    actorId: number,
    actorUsername: string
  ): Promise<ServiceResponse<TableLayoutZone[]>> {
    const warnings: string[] = []

    if (!dto.zones.length) {
      return { success: false, error: 'Debes conservar al menos una zona para organizar las mesas', code: 'NO_ZONES' }
    }

    await withTransaction(async (conn) => {
      const maxNumberRow = await selectOne<{ next_number: number }>(
        conn,
        'SELECT COALESCE(MAX(number), 0) + 1 AS next_number FROM bar_tables'
      )
      let nextNumber = Number(maxNumberRow?.next_number ?? 1)
      const keptZones: ZoneRuntime[] = []

      for (const [index, zoneInput] of dto.zones.entries()) {
        const zoneName = normalizeZoneName(zoneInput.name)
        const rows = asPositiveInt(zoneInput.rows, 1)
        const cols = asPositiveInt(zoneInput.cols, 1)
        const desiredCount = Math.max(0, Math.trunc(Number(zoneInput.desiredCount ?? 0)))
        const sortOrder = normalizeSortOrder(zoneInput.sortOrder, index + 1)

        if (desiredCount > rows * cols) {
          throw new Error(`La zona "${zoneName}" requiere una matriz mayor para ${desiredCount} mesas`)
        }

        const zoneId = await this.upsertZone(conn, { ...zoneInput, name: zoneName, rows, cols, sortOrder })
        keptZones.push({ zoneId, zoneName, rows, cols, sortOrder })
        const existingTables = await selectRows<TableRow>(
          conn,
          `SELECT t.*, z.name AS zone_name, NULL AS current_order_id, NULL AS current_order_total, NULL AS current_waiter
           FROM bar_tables t
           LEFT JOIN table_layout_zones z ON z.id = t.zone_id
           WHERE t.zone_id = ?
           ORDER BY COALESCE(t.layout_order, 9999), t.number`,
          [zoneId]
        )

        const occupiedSlots = existingTables.length
        const targetCount = desiredCount

        // Null positions before reassigning to prevent UNIQUE constraint violations
        // on (zone_id, layout_row, layout_col) when tables need to move to cells
        // currently occupied by other tables in the same zone.
        if (existingTables.length) {
          await conn.execute(
            `UPDATE bar_tables SET layout_row = NULL, layout_col = NULL, layout_order = NULL
             WHERE id IN (${existingTables.map(() => '?').join(',')})`,
            existingTables.map((t) => t.id) as never
          )
        }

        for (let slot = 1; slot <= targetCount; slot += 1) {
          const layoutRow = Math.floor((slot - 1) / cols) + 1
          const layoutCol = ((slot - 1) % cols) + 1
          const layoutOrder = slot
          const position = getLegacyPosition(layoutRow, layoutCol)
          const existingTable = existingTables[slot - 1]

          if (existingTable) {
            await conn.execute(
              `UPDATE bar_tables
               SET zone_id = ?, zone = ?, layout_row = ?, layout_col = ?, layout_order = ?,
                   position_x = ?, position_y = ?, is_active = 1
               WHERE id = ?`,
              [zoneId, zoneName, layoutRow, layoutCol, layoutOrder, position.positionX, position.positionY, existingTable.id]
            )
            continue
          }

          await conn.execute(
            `INSERT INTO bar_tables (
               number, name, capacity, zone_id, zone, position_x, position_y, layout_row, layout_col, layout_order, is_active
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [nextNumber, `Mesa ${nextNumber}`, 4, zoneId, zoneName, position.positionX, position.positionY, layoutRow, layoutCol, layoutOrder]
          )
          nextNumber += 1
        }

        if (targetCount < occupiedSlots) {
          for (let slot = occupiedSlots; slot > targetCount; slot -= 1) {
            const table = existingTables[slot - 1]
            if (!table) continue

            const openOrder = await selectOne<{ count: number }>(
              conn,
              `SELECT COUNT(*) AS count
               FROM orders
               WHERE table_id = ?
                 AND status IN ('open', 'pending_payment')`,
              [table.id]
            )

            if (Number(openOrder?.count ?? 0) > 0) {
              warnings.push(`La mesa #${table.number} sigue activa porque tiene una orden abierta`)
              continue
            }

            await conn.execute(
              `UPDATE bar_tables
               SET is_active = 0,
                   layout_row = ?,
                   layout_col = ?,
                   layout_order = ?,
                   zone_id = ?,
                   zone = ?
               WHERE id = ?`,
              [
                Math.floor((slot - 1) / cols) + 1,
                ((slot - 1) % cols) + 1,
                slot,
                zoneId,
                zoneName,
                table.id,
              ]
            )
          }
        }
      }

      await this.reconcileRemovedZones(conn, keptZones, warnings)
    })

    const layout = await this.getLayout()

    await auditLog({
      userId: actorId,
      username: actorUsername,
      action: 'TABLE_BULK_GENERATE',
      module: 'tables',
      description: 'Generacion o ajuste masivo de mesas por zona',
      newValues: dto,
      details: { warnings },
    })

    return { success: true, data: layout, warnings }
  }

  async saveLayout(
    dto: SaveTableLayoutDTO,
    actorId: number,
    actorUsername: string
  ): Promise<ServiceResponse<TableLayoutZone[]>> {
    const warnings: string[] = []

    if (!dto.zones.length) {
      return { success: false, error: 'Debes conservar al menos una zona para organizar las mesas', code: 'NO_ZONES' }
    }

    await withTransaction(async (conn) => {
      const zoneIds = new Map<string, number>()
      const keptZones: ZoneRuntime[] = []

      for (const [index, zoneInput] of dto.zones.entries()) {
        const zoneName = normalizeZoneName(zoneInput.name)
        const rows = asPositiveInt(zoneInput.rows, 1)
        const cols = asPositiveInt(zoneInput.cols, 1)
        const sortOrder = normalizeSortOrder(zoneInput.sortOrder, index + 1)
        const zoneId = await this.upsertZone(conn, { ...zoneInput, name: zoneName, rows, cols, sortOrder })
        zoneIds.set(`id:${zoneInput.id ?? zoneId}`, zoneId)
        zoneIds.set(`name:${zoneName}`, zoneId)
        keptZones.push({ zoneId, zoneName, rows, cols, sortOrder })
      }

      const seenOrders = new Set<string>()
      const seenCells = new Set<string>()

      for (const table of dto.tables) {
        const zone = dto.zones.find((item) => item.id === table.zoneId)
        const effectiveZoneId = zoneIds.get(`id:${table.zoneId}`) ?? table.zoneId
        const owningZone = zone ?? dto.zones.find((item) => zoneIds.get(`name:${normalizeZoneName(item.name)}`) === effectiveZoneId)
        const rows = asPositiveInt(owningZone?.rows, 1)
        const cols = asPositiveInt(owningZone?.cols, 1)
        const layoutRow = asPositiveInt(table.layoutRow, 1)
        const layoutCol = asPositiveInt(table.layoutCol, 1)
        const layoutOrder = asPositiveInt(table.layoutOrder, 1)

        if (layoutRow > rows || layoutCol > cols) {
          throw new Error(`La mesa ${table.tableId} excede la matriz configurada para su zona`)
        }

        const orderKey = `${effectiveZoneId}:${layoutOrder}`
        const cellKey = `${effectiveZoneId}:${layoutRow}:${layoutCol}`
        if (seenCells.has(cellKey) || seenOrders.has(orderKey)) {
          throw new Error('Hay posiciones u ordenes duplicadas en el layout de mesas')
        }
        seenCells.add(cellKey)
        seenOrders.add(orderKey)
      }

      if (dto.tables.length) {
        await conn.execute(
          `UPDATE bar_tables
           SET layout_row = NULL, layout_col = NULL, layout_order = NULL
           WHERE id IN (${dto.tables.map(() => '?').join(',')})`,
          dto.tables.map((table) => table.tableId) as never
        )
      }

      for (const tableUpdate of dto.tables) {
        const zone = dto.zones.find((item) => item.id === tableUpdate.zoneId)
        if (!zone) {
          throw new Error(`No se encontro la zona ${tableUpdate.zoneId} para guardar el layout`)
        }

        const current = await selectOne<{ id: number; number: number; status: TableStatus; is_active: number }>(
          conn,
          'SELECT id, number, status, is_active FROM bar_tables WHERE id = ? LIMIT 1',
          [tableUpdate.tableId]
        )
        if (!current) {
          throw new Error(`No se encontro la mesa ${tableUpdate.tableId}`)
        }

        if (tableUpdate.isActive === false && !Boolean(current.is_active)) {
          warnings.push(`La mesa #${current.number} ya estaba inactiva`)
        }

        if (tableUpdate.isActive === false && ['occupied', 'pending_payment'].includes(current.status)) {
          warnings.push(`La mesa #${current.number} no se desactivo porque tiene una orden activa`)
          continue
        }

        const layoutRow = asPositiveInt(tableUpdate.layoutRow, 1)
        const layoutCol = asPositiveInt(tableUpdate.layoutCol, 1)
        const layoutOrder = asPositiveInt(tableUpdate.layoutOrder, 1)
        const position = getLegacyPosition(layoutRow, layoutCol)

        await conn.execute(
          `UPDATE bar_tables
           SET zone_id = ?,
               zone = ?,
               name = ?,
               capacity = ?,
               layout_row = ?,
               layout_col = ?,
               layout_order = ?,
               position_x = ?,
               position_y = ?,
               is_active = ?
           WHERE id = ?`,
          [
            tableUpdate.zoneId,
            normalizeZoneName(zone.name),
            tableUpdate.name === undefined ? null : tableUpdate.name,
            asPositiveInt(tableUpdate.capacity, 4),
            layoutRow,
            layoutCol,
            layoutOrder,
            position.positionX,
            position.positionY,
            tableUpdate.isActive === false ? 0 : 1,
            tableUpdate.tableId,
          ]
        )
      }

      await this.reconcileRemovedZones(conn, keptZones, warnings)
    })

    const layout = await this.getLayout()

    await auditLog({
      userId: actorId,
      username: actorUsername,
      action: 'TABLE_LAYOUT_UPDATE',
      module: 'tables',
      description: 'Layout de mesas actualizado',
      newValues: dto,
      details: { warnings },
    })

    return { success: true, data: layout, warnings }
  }

  async saveFreeLayout(
    dto: SaveFreeLayoutDTO,
    actorId: number,
    actorUsername: string
  ): Promise<ServiceResponse<TableLayoutZone[]>> {
    const warnings: string[] = []

    if (!dto.zones.length) {
      return { success: false, error: 'Debe existir al menos una zona', code: 'NO_ZONES' }
    }

    const dtoNumbers = dto.tables.map((t) => t.number)
    if (new Set(dtoNumbers).size !== dtoNumbers.length) {
      return { success: false, error: 'Hay numeros de mesa duplicados en el diseno', code: 'DUPLICATE_NUMBER' }
    }

    for (const n of dtoNumbers) {
      if (!Number.isInteger(n) || n <= 0 || n > 59999) {
        return { success: false, error: `El numero de mesa "${n}" no es valido`, code: 'INVALID_NUMBER' }
      }
    }

    await withTransaction(async (conn) => {
      // 1. Upsert zones – rows/cols 100 satisface el constraint sin imponer cuadrícula
      const zoneNameToId = new Map<string, number>()
      const keptZones: ZoneRuntime[] = []

      for (const [index, zoneInput] of dto.zones.entries()) {
        const zoneName = normalizeZoneName(zoneInput.name)
        const sortOrder = normalizeSortOrder(zoneInput.sortOrder, index + 1)
        const zoneId = await this.upsertZone(conn, {
          id: zoneInput.id,
          name: zoneName,
          rows: 100,
          cols: 100,
          sortOrder,
          isActive: zoneInput.isActive,
        })
        zoneNameToId.set(zoneName, zoneId)
        keptZones.push({ zoneId, zoneName, rows: 100, cols: 100, sortOrder })
      }

      // 2. Cargar estado actual de tablas existentes
      const existingItems = dto.tables.filter((t) => t.tableId !== undefined)
      const existingIds = existingItems.map((t) => t.tableId!)

      const currentRows = existingIds.length
        ? await selectRows<{ id: number; number: number; status: TableStatus; is_active: number }>(
            conn,
            `SELECT id, number, status, is_active FROM bar_tables
             WHERE id IN (${existingIds.map(() => '?').join(',')})`,
            existingIds
          )
        : []

      const currentMap = new Map(currentRows.map((r) => [r.id, r]))

      // 3. Validar conflictos de número contra mesas fuera de este DTO
      for (const tableItem of dto.tables) {
        const current = tableItem.tableId !== undefined ? currentMap.get(tableItem.tableId) : undefined
        if (current && current.number === tableItem.number) continue

        const notInClause = existingIds.length
          ? `AND id NOT IN (${existingIds.map(() => '?').join(',')})`
          : ''
        const params: unknown[] = [tableItem.number, ...existingIds]

        const [conflictRows] = await conn.execute(
          `SELECT id FROM bar_tables WHERE number = ? ${notInClause} LIMIT 1`,
          params as never
        ) as [Array<{ id: number }>, unknown]

        if (conflictRows.length) {
          throw new Error(`El numero de mesa ${tableItem.number} ya esta en uso por otra mesa`)
        }
      }

      // 4. Fase 1: pasar números que cambian a valores temporales (evita conflictos UNIQUE)
      for (const tableItem of existingItems) {
        const current = currentMap.get(tableItem.tableId!)
        if (!current || current.number === tableItem.number) continue
        await conn.execute(
          'UPDATE bar_tables SET number = ? WHERE id = ?',
          [60000 + tableItem.tableId!, tableItem.tableId!] as never
        )
      }

      // 5. Actualizar mesas existentes
      for (const tableItem of existingItems) {
        const current = currentMap.get(tableItem.tableId!)
        if (!current) {
          warnings.push(`Mesa ID ${tableItem.tableId} no encontrada, omitida`)
          continue
        }

        if (!tableItem.isActive && ['occupied', 'pending_payment'].includes(current.status)) {
          warnings.push(`Mesa #${current.number} no se desactivo porque tiene una orden activa`)
          continue
        }

        const zoneName = tableItem.zoneName ? normalizeZoneName(tableItem.zoneName) : null
        const zoneId = zoneName ? (zoneNameToId.get(zoneName) ?? null) : null

        await conn.execute(
          `UPDATE bar_tables
           SET number       = ?,
               name         = ?,
               capacity     = ?,
               zone_id      = ?,
               zone         = ?,
               position_x   = ?,
               position_y   = ?,
               layout_row   = NULL,
               layout_col   = NULL,
               layout_order = NULL,
               is_active    = ?
           WHERE id = ?`,
          [
            tableItem.number,
            tableItem.name ?? null,
            asPositiveInt(tableItem.capacity, 4),
            zoneId,
            zoneName,
            Math.max(0, Math.round(tableItem.positionX)),
            Math.max(0, Math.round(tableItem.positionY)),
            tableItem.isActive ? 1 : 0,
            tableItem.tableId!,
          ] as never
        )
      }

      // 6. Crear mesas nuevas
      for (const tableItem of dto.tables.filter((t) => t.tableId === undefined)) {
        const zoneName = tableItem.zoneName ? normalizeZoneName(tableItem.zoneName) : null
        const zoneId = zoneName ? (zoneNameToId.get(zoneName) ?? null) : null

        await conn.execute(
          `INSERT INTO bar_tables (number, name, capacity, zone_id, zone, position_x, position_y, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            tableItem.number,
            tableItem.name ?? null,
            asPositiveInt(tableItem.capacity, 4),
            zoneId,
            zoneName,
            Math.max(0, Math.round(tableItem.positionX)),
            Math.max(0, Math.round(tableItem.positionY)),
          ] as never
        )
      }

      await this.reconcileRemovedZones(conn, keptZones, warnings)
    })

    const layout = await this.getLayout()

    await auditLog({
      userId: actorId,
      username: actorUsername,
      action: 'TABLE_FREE_LAYOUT_SAVE',
      module: 'tables',
      description: `Diseno libre guardado: ${dto.zones.length} zonas, ${dto.tables.length} mesas`,
      newValues: { zonesCount: dto.zones.length, tablesCount: dto.tables.length },
      details: { warnings },
    })

    return { success: true, data: layout, warnings }
  }

  async updateStatus(id: number, status: TableStatus): Promise<void> {
    await execute('UPDATE bar_tables SET status = ? WHERE id = ?', [status, id])
  }

  private async fetchTables(conn?: Connection): Promise<TableRow[]> {
    return selectRows<TableRow>(
      conn,
      `SELECT t.*,
              z.name AS zone_name,
              o.id   AS current_order_id,
              o.total AS current_order_total,
              u.full_name AS current_waiter
       FROM bar_tables t
       LEFT JOIN table_layout_zones z ON z.id = t.zone_id
       LEFT JOIN (
         SELECT table_id, id, total, waiter_id
         FROM (
           SELECT table_id, id, total, waiter_id,
                  ROW_NUMBER() OVER (PARTITION BY table_id ORDER BY id DESC) AS rn
           FROM orders
           WHERE status IN ('open', 'pending_payment')
         ) ranked
         WHERE rn = 1
       ) o ON o.table_id = t.id
       LEFT JOIN users u ON u.id = o.waiter_id
       ORDER BY COALESCE(z.sort_order, 9999), COALESCE(t.layout_order, 9999), t.number`
    )
  }

  private async fetchZones(conn?: Connection): Promise<TableLayoutZone[]> {
    const rows = await selectRows<ZoneRow>(
      conn,
      `SELECT id, name, \`rows\` AS zone_rows, \`cols\` AS zone_cols, sort_order, is_active
       FROM table_layout_zones
       ORDER BY sort_order, name`
    )
    return rows.map(mapZone)
  }

  private composeLayout(zones: TableLayoutZone[], tables: BarTable[]): TableLayoutZone[] {
    const byId = new Map<number, TableLayoutZone>()
    for (const zone of zones) {
      byId.set(zone.id, { ...zone, tables: [] })
    }

    for (const table of tables) {
      const zoneName = table.zone ?? 'General'
      const fallbackId = table.zoneId ?? 0
      if (!byId.has(fallbackId)) {
        byId.set(fallbackId, {
          id: fallbackId,
          name: zoneName,
          rows: Math.max(table.layoutRow ?? 1, 1),
          cols: Math.max(table.layoutCol ?? 1, 1),
          sortOrder: 9999,
          isActive: true,
          tables: [],
        })
      }

      const zone = byId.get(fallbackId)!
      zone.rows = Math.max(zone.rows, table.layoutRow ?? zone.rows)
      zone.cols = Math.max(zone.cols, table.layoutCol ?? zone.cols)
      zone.tables.push(table)
    }

    return Array.from(byId.values())
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map((zone) => ({
        ...zone,
        tables: zone.tables.sort((left, right) => {
          const leftOrder = left.layoutOrder ?? Number.MAX_SAFE_INTEGER
          const rightOrder = right.layoutOrder ?? Number.MAX_SAFE_INTEGER
          return leftOrder - rightOrder || left.number - right.number
        }),
      }))
  }

  private async upsertZone(conn: Connection, zone: TableLayoutZoneInputDTO): Promise<number> {
    const zoneName = normalizeZoneName(zone.name)
    const rows = asPositiveInt(zone.rows, 1)
    const cols = asPositiveInt(zone.cols, 1)
    const sortOrder = normalizeSortOrder(zone.sortOrder, 1)

    if (zone.id) {
      await conn.execute(
        `UPDATE table_layout_zones
         SET name = ?, \`rows\` = ?, \`cols\` = ?, sort_order = ?, is_active = ?
         WHERE id = ?`,
        [zoneName, rows, cols, sortOrder, zone.isActive === false ? 0 : 1, zone.id]
      )
      return zone.id
    }

    const existing = await selectOne<{ id: number }>(
      conn,
      'SELECT id FROM table_layout_zones WHERE name = ? LIMIT 1',
      [zoneName]
    )
    if (existing) {
      await conn.execute(
        `UPDATE table_layout_zones
         SET \`rows\` = ?, \`cols\` = ?, sort_order = ?, is_active = ?
         WHERE id = ?`,
        [rows, cols, sortOrder, zone.isActive === false ? 0 : 1, existing.id]
      )
      return existing.id
    }

    const [result] = await conn.execute(
      `INSERT INTO table_layout_zones (name, \`rows\`, \`cols\`, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [zoneName, rows, cols, sortOrder, zone.isActive === false ? 0 : 1]
    )
    return (result as { insertId: number }).insertId
  }

  private async reconcileRemovedZones(
    conn: Connection,
    keptZones: ZoneRuntime[],
    warnings: string[]
  ): Promise<void> {
    if (!keptZones.length) return

    const sortedKeptZones = [...keptZones].sort((left, right) => left.sortOrder - right.sortOrder || left.zoneId - right.zoneId)
    const fallbackZone = sortedKeptZones[0]
    const keptZoneIds = sortedKeptZones.map((zone) => zone.zoneId)
    const placeholders = keptZoneIds.map(() => '?').join(',')

    const removedZones = await selectRows<{ id: number; name: string }>(
      conn,
      `SELECT id, name
       FROM table_layout_zones
       WHERE id NOT IN (${placeholders})
       ORDER BY sort_order, id`,
      keptZoneIds
    )

    if (!removedZones.length) return

    const removedZoneIds = removedZones.map((zone) => zone.id)
    const removedPlaceholders = removedZoneIds.map(() => '?').join(',')
    const tablesToReassign = await selectRows<{
      id: number
      number: number
      layout_order: number | null
      is_active: number
      status: TableStatus
    }>(
      conn,
      `SELECT id, number, layout_order, is_active, status
       FROM bar_tables
       WHERE zone_id IN (${removedPlaceholders})
       ORDER BY zone_id, COALESCE(layout_order, 9999), number`,
      removedZoneIds
    )

    if (tablesToReassign.length) {
      const maxOrderRow = await selectOne<{ max_order: number }>(
        conn,
        'SELECT COALESCE(MAX(layout_order), 0) AS max_order FROM bar_tables WHERE zone_id = ?',
        [fallbackZone.zoneId]
      )
      let nextOrder = Number(maxOrderRow?.max_order ?? 0)

      for (const table of tablesToReassign) {
        nextOrder += 1
        const layoutRow = Math.floor((nextOrder - 1) / fallbackZone.cols) + 1
        const layoutCol = ((nextOrder - 1) % fallbackZone.cols) + 1
        const position = getLegacyPosition(layoutRow, layoutCol)

        await conn.execute(
          `UPDATE bar_tables
           SET zone_id = ?,
               zone = ?,
               layout_row = ?,
               layout_col = ?,
               layout_order = ?,
               position_x = ?,
               position_y = ?
           WHERE id = ?`,
          [
            fallbackZone.zoneId,
            fallbackZone.zoneName,
            layoutRow,
            layoutCol,
            nextOrder,
            position.positionX,
            position.positionY,
            table.id,
          ]
        )
      }

      const requiredRows = Math.max(fallbackZone.rows, Math.ceil(nextOrder / fallbackZone.cols))
      if (requiredRows > fallbackZone.rows) {
        await conn.execute(
          'UPDATE table_layout_zones SET `rows` = ? WHERE id = ?',
          [requiredRows, fallbackZone.zoneId]
        )
        fallbackZone.rows = requiredRows
      }

      warnings.push(
        `Se reasignaron ${tablesToReassign.length} mesa(s) desde zonas eliminadas a ${fallbackZone.zoneName}`
      )
    }

    await conn.execute(
      `DELETE FROM table_layout_zones
       WHERE id IN (${removedPlaceholders})`,
      removedZoneIds as never
    )

    warnings.push(
      `Se eliminaron ${removedZones.length} zona(s): ${removedZones.map((zone) => zone.name).join(', ')}`
    )
  }
}

export const tablesService = new TablesService()
