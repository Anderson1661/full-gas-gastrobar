import { createPool } from 'mysql2/promise'
import type { Connection, Pool, PoolOptions } from 'mysql2/promise'

let pool: Pool | null = null

export function getDbConfig(): PoolOptions {
  return {
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT || '3306', 10),
    database:           process.env.DB_NAME     || 'fullgas_db',
    user:               process.env.DB_USER     || 'fullgas_user',
    password:           process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    timezone:           '-05:00',
    charset:            'utf8mb4',
    decimalNumbers:     true,
  }
}

export async function initDatabase(): Promise<Pool> {
  if (pool) return pool

  pool = createPool(getDbConfig())

  // Validar conexión al arrancar
  const conn = await pool.getConnection()
  await conn.query('SELECT 1')
  conn.release()

  console.log('[DB] Conexión a MySQL establecida')
  return pool
}

export function getPool(): Pool {
  if (!pool) throw new Error('Base de datos no inicializada. Llame initDatabase() primero.')
  return pool
}

export function sanitizeParams(params?: unknown[]): unknown[] | undefined {
  if (!params) return undefined
  return params.map((v) => (v === undefined ? null : v))
}

export function asNullableTrimmed(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized.length ? normalized : null
}

export function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  return rounded > 0 ? rounded : fallback
}

export function asPositiveNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.log('[DB] Pool cerrado')
  }
}

// Query helper con tipado
export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const [rows] = await getPool().execute(sql, sanitizeParams(params) as never)
  return rows as T[]
}

// Query que retorna primera fila
export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

// Execute sin retorno (INSERT, UPDATE, DELETE)
export async function execute(
  sql: string,
  params?: unknown[]
): Promise<{ insertId: number; affectedRows: number }> {
  const [result] = await getPool().execute(sql, sanitizeParams(params) as never)
  const r = result as { insertId: number; affectedRows: number }
  return { insertId: r.insertId, affectedRows: r.affectedRows }
}

// Transacción helper
export async function withTransaction<T>(
  fn: (conn: Connection) => Promise<T>
): Promise<T> {
  const conn = await getPool().getConnection()
  await conn.beginTransaction()
  try {
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
