import { query, queryOne, execute } from '../database/connection'
import { auditLog } from '../utils/audit'
import type { Product, ProductCategory } from '@shared/types/entities'
import type { CreateProductDTO, UpdateProductDTO, ApiResult } from '@shared/types/dtos'

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id:             row.id as number,
    categoryId:     row.category_id as number,
    categoryName:   row.category_name as string,
    supplierId:     row.supplier_id as number | null,
    sku:            row.sku as string | null,
    name:           row.name as string,
    description:    row.description as string | null,
    costPrice:      Number(row.cost_price),
    salePrice:      Number(row.sale_price),
    stock:          Number(row.stock),
    minStock:       Number(row.min_stock),
    unit:           row.unit as string,
    trackInventory: Boolean(row.track_inventory),
    isActive:       Boolean(row.is_active),
    imagePath:      row.image_path as string | null,
    createdAt:      row.created_at as string,
  }
}

const PRODUCT_SELECT = `
  SELECT p.*, pc.name AS category_name
  FROM products p
  JOIN product_categories pc ON pc.id = p.category_id`

export class ProductsService {
  async list(includeInactive = false): Promise<Product[]> {
    const where = includeInactive ? '' : 'WHERE p.is_active = 1'
    const rows = await query(`${PRODUCT_SELECT} ${where} ORDER BY pc.sort_order, p.name`)
    return rows.map((row) => mapProduct(row as Record<string, unknown>))
  }

  async search(term: string): Promise<Product[]> {
    const rows = await query(
      `${PRODUCT_SELECT}
       WHERE p.is_active = 1 AND (p.name LIKE ? OR p.sku LIKE ? OR pc.name LIKE ?)
       ORDER BY p.name LIMIT 30`,
      [`%${term}%`, `%${term}%`, `%${term}%`]
    )
    return rows.map((row) => mapProduct(row as Record<string, unknown>))
  }

  async getById(id: number): Promise<Product | null> {
    const row = await queryOne(`${PRODUCT_SELECT} WHERE p.id = ?`, [id])
    return row ? mapProduct(row as Record<string, unknown>) : null
  }

  async create(dto: CreateProductDTO, actorId: number, actorUsername: string): Promise<ApiResult<Product>> {
    if (dto.sku) {
      const duplicate = await queryOne('SELECT id FROM products WHERE sku = ?', [dto.sku])
      if (duplicate) {
        return { success: false, error: `El SKU "${dto.sku}" ya esta en uso`, code: 'DUPLICATE_SKU' }
      }
    }

    const { insertId } = await execute(
      `INSERT INTO products
         (category_id, supplier_id, sku, name, description, cost_price, sale_price,
          stock, min_stock, unit, track_inventory)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.categoryId,
        dto.supplierId ?? null,
        dto.sku ?? null,
        dto.name,
        dto.description ?? null,
        dto.costPrice,
        dto.salePrice,
        dto.stock ?? 0,
        dto.minStock ?? 0,
        dto.unit ?? 'und',
        dto.trackInventory !== false ? 1 : 0,
      ]
    )

    await auditLog({
      userId: actorId, username: actorUsername,
      action: 'CREATE', module: 'products', recordId: String(insertId),
      entityType: 'product', entityId: String(insertId),
      description: `Producto "${dto.name}" creado`,
      details: {
        name: dto.name,
        categoryId: dto.categoryId,
        salePrice: dto.salePrice,
        trackInventory: dto.trackInventory !== false,
      }
    })

    const product = await this.getById(insertId)
    return { success: true, data: product! }
  }

  async update(dto: UpdateProductDTO, actorId: number, actorUsername: string): Promise<ApiResult<Product>> {
    const current = await this.getById(dto.id)
    if (!current) return { success: false, error: 'Producto no encontrado', code: 'NOT_FOUND' }

    await execute(
      `UPDATE products SET
         category_id    = COALESCE(?, category_id),
         name           = COALESCE(?, name),
         description    = COALESCE(?, description),
         cost_price     = COALESCE(?, cost_price),
         sale_price     = COALESCE(?, sale_price),
         min_stock      = COALESCE(?, min_stock),
         unit           = COALESCE(?, unit),
         track_inventory= COALESCE(?, track_inventory),
         is_active      = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        dto.categoryId,
        dto.name,
        dto.description,
        dto.costPrice,
        dto.salePrice,
        dto.minStock,
        dto.unit,
        dto.trackInventory !== undefined ? (dto.trackInventory ? 1 : 0) : null,
        dto.isActive !== undefined ? (dto.isActive ? 1 : 0) : null,
        dto.id,
      ]
    )

    await auditLog({
      userId: actorId, username: actorUsername,
      action: 'UPDATE', module: 'products', recordId: String(dto.id),
      entityType: 'product', entityId: String(dto.id),
      description: `Producto "${current.name}" actualizado`,
      oldValues: { salePrice: current.salePrice, isActive: current.isActive },
      newValues: dto,
      details: { productId: dto.id, name: current.name }
    })

    const updated = await this.getById(dto.id)
    return { success: true, data: updated! }
  }

  async getCategories(): Promise<ProductCategory[]> {
    return query<ProductCategory>(
      `SELECT id, name, description, color, icon, sort_order, is_active, created_at
       FROM product_categories WHERE is_active = 1 ORDER BY sort_order, name`
    ).then((rows) => rows.map((row) => {
      const normalized = row as unknown as Record<string, unknown>
      return {
        id: normalized.id as number,
        name: normalized.name as string,
        description: normalized.description as string | null,
        color: normalized.color as string | null,
        icon: normalized.icon as string | null,
        sortOrder: normalized.sort_order as number,
        isActive: Boolean(normalized.is_active),
      }
    }))
  }

  async createCategory(
    data: { name: string; description?: string; color?: string; icon?: string },
    actorId: number,
    actorUsername: string
  ): Promise<ApiResult<ProductCategory>> {
    const existing = await queryOne('SELECT id FROM product_categories WHERE name = ?', [data.name])
    if (existing) return { success: false, error: 'Ya existe una categoria con ese nombre', code: 'DUPLICATE' }

    const { insertId } = await execute(
      'INSERT INTO product_categories (name, description, color, icon) VALUES (?, ?, ?, ?)',
      [data.name, data.description ?? null, data.color ?? null, data.icon ?? null]
    )

    await auditLog({
      userId: actorId, username: actorUsername,
      action: 'CREATE', module: 'products', recordId: String(insertId),
      entityType: 'product_category', entityId: String(insertId),
      description: `Categoria "${data.name}" creada`,
      details: { name: data.name, color: data.color ?? null, icon: data.icon ?? null }
    })

    const categories = await this.getCategories()
    return { success: true, data: categories.find((category) => category.id === insertId)! }
  }
}

export const productsService = new ProductsService()
