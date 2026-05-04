import type mysql from 'mysql2/promise'
import { asPositiveInt, asPositiveNumber, execute, query, queryOne } from '../database/connection'
import { auditLog } from '../utils/audit'
import { authService } from './auth.service'
import type { InventoryMovement, Product } from '@shared/types/entities'
import type { AdjustInventoryDTO, ApiResult } from '@shared/types/dtos'

interface MovementInput {
  productId: number
  type: InventoryMovement['type']
  quantity: number
  unitCost?: number
  referenceId?: number
  referenceType?: string
  reason?: string
  performedBy: number
  adminVerified?: boolean
  verifiedBy?: number | null
}

async function fetchProductStock(productId: number, conn?: mysql.Connection): Promise<{ stock: number; name?: string } | null> {
  if (conn) {
    const [rows] = await conn.execute(
      'SELECT stock, name FROM products WHERE id = ? FOR UPDATE',
      [productId]
    )
    return ((rows as { stock: number; name: string }[])[0] ?? null)
  }

  return queryOne<{ stock: number; name: string }>(
    'SELECT stock, name FROM products WHERE id = ?',
    [productId]
  )
}

export class InventoryService {
  async registerMovement(input: MovementInput, conn?: mysql.Connection): Promise<void> {
    const quantity = asPositiveNumber(input.quantity)
    if (!quantity) {
      throw new Error('La cantidad del movimiento debe ser mayor a cero')
    }

    const product = await fetchProductStock(input.productId, conn)
    if (!product) throw new Error(`Producto ${input.productId} no encontrado`)

    const stockBefore = Number(product.stock)
    const isOutbound = ['sale', 'adjustment_out', 'waste'].includes(input.type)
    const stockAfter = isOutbound
      ? stockBefore - quantity
      : stockBefore + quantity

    if (stockAfter < 0) {
      throw new Error(`Stock insuficiente para ${product.name ?? `producto ${input.productId}`}`)
    }

    const params = [
      input.productId,
      input.type,
      quantity,
      input.unitCost ?? null,
      stockBefore,
      stockAfter,
      input.referenceId ?? null,
      input.referenceType ?? null,
      input.reason ?? null,
      input.performedBy,
      input.adminVerified ? 1 : 0,
      input.verifiedBy ?? null,
    ]

    if (conn) {
      await conn.execute(
        `INSERT INTO inventory_movements
           (product_id, type, quantity, unit_cost, stock_before, stock_after, reference_id, reference_type, reason, performed_by, admin_verified, verified_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params
      )
      await conn.execute('UPDATE products SET stock = ? WHERE id = ?', [stockAfter, input.productId])
      return
    }

    await execute(
      `INSERT INTO inventory_movements
         (product_id, type, quantity, unit_cost, stock_before, stock_after, reference_id, reference_type, reason, performed_by, admin_verified, verified_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    )
    await execute('UPDATE products SET stock = ? WHERE id = ?', [stockAfter, input.productId])
  }

  async adjust(dto: AdjustInventoryDTO, actorUsername: string): Promise<ApiResult> {
    const quantity = asPositiveNumber(dto.quantity)
    if (!quantity) {
      return { success: false, error: 'La cantidad debe ser mayor a cero', code: 'INVALID_QUANTITY' }
    }

    const adminAuth = await authService.verifyAdminCredentials(dto.adminUsername, dto.adminPassword)
    if (!adminAuth.success || !adminAuth.data) {
      return { success: false, error: adminAuth.error, code: adminAuth.code }
    }

    const product = await queryOne<{ name: string; stock: number }>(
      'SELECT name, stock FROM products WHERE id = ?',
      [dto.productId]
    )
    if (!product) return { success: false, error: 'Producto no encontrado', code: 'NOT_FOUND' }

    try {
      await this.registerMovement({
        productId: dto.productId,
        type: dto.type,
        quantity,
        unitCost: dto.unitCost,
        reason: dto.reason,
        referenceType: 'manual',
        performedBy: dto.performedBy,
        adminVerified: true,
        verifiedBy: adminAuth.data.id,
      })
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'No se pudo registrar el ajuste',
        code: 'INVENTORY_ADJUST_FAILED'
      }
    }

    await auditLog({
      userId: dto.performedBy,
      username: actorUsername,
      action: 'ADJUST',
      module: 'inventory',
      recordId: String(dto.productId),
      entityType: 'inventory_movement',
      entityId: String(dto.productId),
      description: `Ajuste ${dto.type} de ${quantity} en "${product.name}"`,
      details: {
        productId: dto.productId,
        productName: product.name,
        quantity,
        type: dto.type,
        reason: dto.reason,
        verifiedBy: adminAuth.data.username
      },
      oldValues: { stock: Number(product.stock) },
    })

    return { success: true }
  }

  async getMovements(productId?: number, limit = 100): Promise<InventoryMovement[]> {
    const safeLimit = asPositiveInt(limit, 100)
    const where = productId ? 'WHERE im.product_id = ?' : ''
    const params = productId ? [productId] : []

    return query<InventoryMovement>(
      `SELECT im.*, p.name AS product_name, u.full_name AS performed_by_name
       FROM inventory_movements im
       JOIN products p ON p.id = im.product_id
       JOIN users u ON u.id = im.performed_by
       ${where}
       ORDER BY im.created_at DESC
       LIMIT ${safeLimit}`,
      params
    ).then((rows) => rows.map((r) => {
      const row = r as unknown as Record<string, unknown>
      return {
        id: row.id as number,
        productId: row.product_id as number,
        productName: row.product_name as string,
        type: row.type as InventoryMovement['type'],
        quantity: Number(row.quantity),
        unitCost: row.unit_cost ? Number(row.unit_cost) : null,
        stockBefore: Number(row.stock_before),
        stockAfter: Number(row.stock_after),
        referenceId: row.reference_id as number | null,
        referenceType: row.reference_type as string | null,
        reason: row.reason as string | null,
        performedBy: row.performed_by as number,
        performedByName: row.performed_by_name as string,
        createdAt: row.created_at as string,
      }
    }))
  }

  async getLowStock(): Promise<Product[]> {
    return query<Product>(
      `SELECT p.*, pc.name AS category_name
       FROM products p
       JOIN product_categories pc ON pc.id = p.category_id
       WHERE p.track_inventory = 1 AND p.stock <= p.min_stock AND p.is_active = 1
       ORDER BY (p.stock / GREATEST(p.min_stock, 0.01)) ASC`
    ).then((rows) => rows.map((r) => {
      const row = r as unknown as Record<string, unknown>
      return {
        id: row.id as number,
        categoryId: row.category_id as number,
        categoryName: row.category_name as string,
        supplierId: row.supplier_id as number | null,
        sku: row.sku as string | null,
        name: row.name as string,
        description: row.description as string | null,
        costPrice: Number(row.cost_price),
        salePrice: Number(row.sale_price),
        stock: Number(row.stock),
        minStock: Number(row.min_stock),
        unit: row.unit as string,
        trackInventory: Boolean(row.track_inventory),
        isActive: Boolean(row.is_active),
        imagePath: row.image_path as string | null,
        createdAt: row.created_at as string,
      }
    }))
  }
}

export const inventoryService = new InventoryService()
