import { execute, query, queryOne, withTransaction } from '../database/connection'
import { auditLog } from '../utils/audit'
import type { Promotion, PromotionItem } from '@shared/types/entities'
import type { ApiResult, CreatePromotionDTO, UpdatePromotionDTO } from '@shared/types/dtos'

const AUTO_APPLY_SUPPORTED_TYPES = new Set<Promotion['type']>([
  'percentage',
  'fixed_amount',
  'fixed_price',
  'happy_hour',
])

function normalizeIds(values?: number[]): number[] {
  return [...new Set((values ?? []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))]
}

function normalizeDate(value: unknown): string | null {
  if (!value) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  }

  if (typeof value === 'string') {
    return value.includes('T') ? value.slice(0, 10) : value
  }

  return String(value)
}

function normalizeTime(value: unknown): string | null {
  if (!value) return null

  if (typeof value === 'string') {
    return value.length >= 5 ? value.slice(0, 5) : value
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(11, 16)
  }

  return String(value)
}

function normalizeDateTime(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  }

  return typeof value === 'string' ? value : String(value ?? '')
}

function mapPromotion(row: Record<string, unknown>): Promotion {
  return {
    id: row.id as number,
    name: row.name as string,
    description: row.description as string | null,
    type: row.type as Promotion['type'],
    discountValue: Number(row.discount_value),
    minQuantity: Number(row.min_quantity),
    appliesTo: row.applies_to as Promotion['appliesTo'],
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    daysOfWeek: row.days_of_week as string | null,
    validFrom: normalizeDate(row.valid_from),
    validUntil: normalizeDate(row.valid_until),
    isActive: Boolean(row.is_active),
    autoApply: Boolean(row.auto_apply),
    priority: Number(row.priority),
    createdBy: row.created_by as number,
    createdByName: row.created_by_name as string | null,
    updatedBy: row.updated_by as number | null,
    createdAt: normalizeDateTime(row.created_at),
  }
}

function validatePromotionInput(
  dto: Pick<
    CreatePromotionDTO,
    'name' | 'type' | 'discountValue' | 'minQuantity' | 'appliesTo' | 'startTime' | 'endTime' | 'validFrom' | 'validUntil' | 'autoApply' | 'productIds' | 'categoryIds'
  >
): ApiResult<{ productIds: number[]; categoryIds: number[] }> {
  if (!dto.name?.trim()) {
    return { success: false, error: 'El nombre de la promocion es obligatorio', code: 'MISSING_NAME' }
  }

  const discountValue = Number(dto.discountValue)
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    return { success: false, error: 'El valor de descuento debe ser mayor o igual a 0', code: 'INVALID_DISCOUNT' }
  }

  const minQuantity = Number(dto.minQuantity ?? 1)
  if (!Number.isFinite(minQuantity) || minQuantity < 1) {
    return { success: false, error: 'La cantidad minima debe ser mayor o igual a 1', code: 'INVALID_MIN_QUANTITY' }
  }

  if ((dto.type === 'percentage' || dto.type === 'happy_hour') && discountValue > 100) {
    return { success: false, error: 'Los descuentos porcentuales no pueden exceder 100%', code: 'INVALID_PERCENTAGE' }
  }

  if (dto.validFrom && dto.validUntil && dto.validFrom > dto.validUntil) {
    return { success: false, error: 'La vigencia inicial no puede ser posterior a la final', code: 'INVALID_DATE_RANGE' }
  }

  const productIds = normalizeIds(dto.productIds)
  const categoryIds = normalizeIds(dto.categoryIds)

  if (dto.appliesTo === 'product' && productIds.length === 0) {
    return { success: false, error: 'Debes seleccionar al menos un producto para la promocion', code: 'PROMOTION_TARGET_REQUIRED' }
  }

  if (dto.appliesTo === 'category' && categoryIds.length === 0) {
    return { success: false, error: 'Debes seleccionar al menos una categoria para la promocion', code: 'PROMOTION_TARGET_REQUIRED' }
  }

  if (dto.autoApply) {
    if (!AUTO_APPLY_SUPPORTED_TYPES.has(dto.type)) {
      return {
        success: false,
        error: 'La aplicacion automatica solo esta disponible para porcentaje, monto fijo, precio fijo y happy hour',
        code: 'AUTO_APPLY_UNSUPPORTED_TYPE',
      }
    }

    if (dto.appliesTo === 'order') {
      return {
        success: false,
        error: 'Las promociones automaticas para orden completa no estan soportadas por el modelo actual',
        code: 'AUTO_APPLY_UNSUPPORTED_SCOPE',
      }
    }

    if (dto.type === 'happy_hour' && !dto.startTime && !dto.endTime) {
      return {
        success: false,
        error: 'Happy Hour automatico requiere al menos una hora de inicio o fin',
        code: 'AUTO_APPLY_SCHEDULE_REQUIRED',
      }
    }
  }

  return { success: true, data: { productIds, categoryIds } }
}

export class PromotionsService {
  async list(includeInactive = false): Promise<Promotion[]> {
    const where = includeInactive ? '' : 'WHERE p.is_active = 1'
    const rows = await query<Record<string, unknown>>(
      `SELECT p.*, u.full_name AS created_by_name
       FROM promotions p
       LEFT JOIN users u ON u.id = p.created_by
       ${where}
       ORDER BY p.priority DESC, p.name`
    )
    return rows.map(mapPromotion)
  }

  async get(id: number): Promise<ApiResult<Promotion>> {
    const row = await queryOne<Record<string, unknown>>(
      `SELECT p.*, u.full_name AS created_by_name
       FROM promotions p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.id = ?`,
      [id]
    )
    if (!row) return { success: false, error: 'Promocion no encontrada', code: 'NOT_FOUND' }
    return { success: true, data: mapPromotion(row) }
  }

  async listItems(promotionId: number): Promise<PromotionItem[]> {
    const rows = await query<Record<string, unknown>>(
      `SELECT pi.id, pi.promotion_id, pi.product_id, p.name AS product_name,
              pi.category_id, pc.name AS category_name
       FROM promotion_items pi
       LEFT JOIN products p ON p.id = pi.product_id
       LEFT JOIN product_categories pc ON pc.id = pi.category_id
       WHERE pi.promotion_id = ?`,
      [promotionId]
    )

    return rows.map((row) => ({
      id: row.id as number,
      promotionId: row.promotion_id as number,
      productId: row.product_id as number | null,
      productName: row.product_name as string | null,
      categoryId: row.category_id as number | null,
      categoryName: row.category_name as string | null,
    }))
  }

  async create(
    dto: CreatePromotionDTO,
    actorId: number,
    actorUsername: string,
    roleName?: string,
    sessionId?: number
  ): Promise<ApiResult<Promotion>> {
    const normalized = validatePromotionInput(dto)
    if (!normalized.success || !normalized.data) return normalized

    const result = await withTransaction(async (conn) => {
      const [res] = await conn.execute(
        `INSERT INTO promotions (
           name, description, type, discount_value, min_quantity, applies_to,
           start_time, end_time, days_of_week, valid_from, valid_until,
           is_active, auto_apply, priority, created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dto.name.trim(),
          dto.description?.trim() ?? null,
          dto.type ?? 'percentage',
          Number(dto.discountValue),
          Number(dto.minQuantity ?? 1),
          dto.appliesTo ?? 'product',
          dto.startTime ?? null,
          dto.endTime ?? null,
          dto.daysOfWeek ?? null,
          dto.validFrom ?? null,
          dto.validUntil ?? null,
          dto.isActive !== false ? 1 : 0,
          dto.autoApply ? 1 : 0,
          Number(dto.priority ?? 0),
          actorId,
          actorId,
        ]
      )
      const id = (res as { insertId: number }).insertId

      for (const productId of normalized.data.productIds) {
        await conn.execute(
          'INSERT IGNORE INTO promotion_items (promotion_id, product_id) VALUES (?, ?)',
          [id, productId]
        )
      }

      for (const categoryId of normalized.data.categoryIds) {
        await conn.execute(
          'INSERT IGNORE INTO promotion_items (promotion_id, category_id) VALUES (?, ?)',
          [id, categoryId]
        )
      }

      return id
    })

    await auditLog({
      userId: actorId,
      username: actorUsername,
      roleName,
      action: 'CREATE',
      module: 'promotions',
      recordId: String(result),
      description: `Promocion "${dto.name}" creada`,
      newValues: {
        ...dto,
        productIds: normalized.data.productIds,
        categoryIds: normalized.data.categoryIds,
      },
      sessionId,
    })

    return this.get(result)
  }

  async update(
    dto: UpdatePromotionDTO,
    actorId: number,
    actorUsername: string,
    roleName?: string,
    sessionId?: number
  ): Promise<ApiResult<Promotion>> {
    const existing = await this.get(dto.id)
    if (!existing.success || !existing.data) {
      return { success: false, error: 'Promocion no encontrada', code: 'NOT_FOUND' }
    }

    const existingItems = await this.listItems(dto.id)
    const merged: CreatePromotionDTO = {
      name: dto.name?.trim() ?? existing.data.name,
      description: dto.description ?? existing.data.description ?? undefined,
      type: dto.type ?? existing.data.type,
      discountValue: dto.discountValue ?? existing.data.discountValue,
      minQuantity: dto.minQuantity ?? existing.data.minQuantity,
      appliesTo: dto.appliesTo ?? existing.data.appliesTo,
      startTime: dto.startTime ?? existing.data.startTime ?? undefined,
      endTime: dto.endTime ?? existing.data.endTime ?? undefined,
      daysOfWeek: dto.daysOfWeek ?? existing.data.daysOfWeek ?? undefined,
      validFrom: dto.validFrom ?? existing.data.validFrom ?? undefined,
      validUntil: dto.validUntil ?? existing.data.validUntil ?? undefined,
      isActive: dto.isActive ?? existing.data.isActive,
      autoApply: dto.autoApply ?? existing.data.autoApply,
      priority: dto.priority ?? existing.data.priority,
      productIds: dto.productIds ?? existingItems.flatMap((item) => item.productId ? [item.productId] : []),
      categoryIds: dto.categoryIds ?? existingItems.flatMap((item) => item.categoryId ? [item.categoryId] : []),
    }

    const normalized = validatePromotionInput(merged)
    if (!normalized.success || !normalized.data) return normalized

    const updates: string[] = []
    const params: unknown[] = []
    const shouldUpdateItems = dto.productIds !== undefined || dto.categoryIds !== undefined

    const fields: Array<[string, unknown]> = [
      ['name', dto.name?.trim()],
      ['description', dto.description],
      ['type', dto.type],
      ['discount_value', dto.discountValue],
      ['min_quantity', dto.minQuantity],
      ['applies_to', dto.appliesTo],
      ['start_time', dto.startTime],
      ['end_time', dto.endTime],
      ['days_of_week', dto.daysOfWeek],
      ['valid_from', dto.validFrom],
      ['valid_until', dto.validUntil],
      ['is_active', dto.isActive],
      ['auto_apply', dto.autoApply],
      ['priority', dto.priority],
    ]

    for (const [column, value] of fields) {
      if (value === undefined) continue
      if (column === 'is_active' || column === 'auto_apply') {
        updates.push(`${column} = ?`)
        params.push(value ? 1 : 0)
      } else {
        updates.push(`${column} = ?`)
        params.push(value ?? null)
      }
    }

    if (updates.length === 0 && !shouldUpdateItems) {
      return { success: false, error: 'No hay campos para actualizar', code: 'NO_CHANGES' }
    }

    updates.push('updated_by = ?')
    params.push(actorId)
    params.push(dto.id)

    await execute(`UPDATE promotions SET ${updates.join(', ')} WHERE id = ?`, params)

    if (shouldUpdateItems) {
      await execute('DELETE FROM promotion_items WHERE promotion_id = ?', [dto.id])

      for (const productId of normalized.data.productIds) {
        await execute('INSERT IGNORE INTO promotion_items (promotion_id, product_id) VALUES (?, ?)', [dto.id, productId])
      }

      for (const categoryId of normalized.data.categoryIds) {
        await execute('INSERT IGNORE INTO promotion_items (promotion_id, category_id) VALUES (?, ?)', [dto.id, categoryId])
      }
    }

    await auditLog({
      userId: actorId,
      username: actorUsername,
      roleName,
      action: 'UPDATE',
      module: 'promotions',
      recordId: String(dto.id),
      description: `Promocion "${existing.data.name}" actualizada`,
      oldValues: {
        ...existing.data,
        productIds: existingItems.flatMap((item) => item.productId ? [item.productId] : []),
        categoryIds: existingItems.flatMap((item) => item.categoryId ? [item.categoryId] : []),
      },
      newValues: {
        ...merged,
        productIds: normalized.data.productIds,
        categoryIds: normalized.data.categoryIds,
      },
      sessionId,
    })

    return this.get(dto.id)
  }

  async toggle(
    id: number,
    actorId: number,
    actorUsername: string,
    roleName?: string,
    sessionId?: number
  ): Promise<ApiResult<Promotion>> {
    const existing = await this.get(id)
    if (!existing.success || !existing.data) {
      return { success: false, error: 'Promocion no encontrada', code: 'NOT_FOUND' }
    }

    const newState = !existing.data.isActive
    await execute('UPDATE promotions SET is_active = ?, updated_by = ? WHERE id = ?', [newState ? 1 : 0, actorId, id])

    await auditLog({
      userId: actorId,
      username: actorUsername,
      roleName,
      action: newState ? 'ACTIVATE' : 'DEACTIVATE',
      module: 'promotions',
      recordId: String(id),
      description: `Promocion "${existing.data.name}" ${newState ? 'activada' : 'desactivada'}`,
      oldValues: { isActive: existing.data.isActive },
      newValues: { isActive: newState },
      sessionId,
    })

    return this.get(id)
  }
}

export const promotionsService = new PromotionsService()
