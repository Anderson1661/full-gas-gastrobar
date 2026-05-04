import { createPool } from 'mysql2/promise'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import bcrypt from 'bcryptjs'
import { splitSqlStatements } from '../utils/sql'

export interface DbConfig {
  host:     string
  port:     number
  user:     string
  password: string
  database: string
}

export function getEnvPath(): string {
  return join(app.getPath('userData'), '.env')
}

export function isFirstRun(): boolean {
  return !existsSync(getEnvPath())
}

export function readDbConfig(): DbConfig | null {
  const envPath = getEnvPath()
  if (!existsSync(envPath)) return null

  const env: Record<string, string> = {}
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key   = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key) env[key] = value
  }

  return {
    host:     env['DB_HOST']     ?? 'localhost',
    port:     parseInt(env['DB_PORT'] ?? '3306', 10),
    user:     env['DB_USER']     ?? '',
    password: env['DB_PASSWORD'] ?? '',
    database: env['DB_NAME']     ?? 'fullgas_db',
  }
}

export function saveDbConfig(cfg: DbConfig): void {
  const lines = [
    `DB_HOST=${cfg.host}`,
    `DB_PORT=${cfg.port}`,
    `DB_USER=${cfg.user}`,
    `DB_PASSWORD=${cfg.password}`,
    `DB_NAME=${cfg.database}`,
  ]
  writeFileSync(getEnvPath(), lines.join('\n'), 'utf-8')
}

async function withTempPool<T>(
  cfg: Omit<DbConfig, 'database'> & { database?: string },
  fn: (conn: Awaited<ReturnType<ReturnType<typeof createPool>['getConnection']>>) => Promise<T>
): Promise<T> {
  const pool = createPool({
    host:             cfg.host,
    port:             cfg.port,
    user:             cfg.user,
    password:         cfg.password,
    database:         cfg.database,
    connectionLimit:  1,
    connectTimeout:   8000,
    charset:          'utf8mb4',
  })
  try {
    const conn = await pool.getConnection()
    try {
      return await fn(conn)
    } finally {
      conn.release()
    }
  } finally {
    await pool.end().catch(() => {})
  }
}

export async function testConnection(
  cfg: DbConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Test without selecting a specific database first
    await withTempPool({ ...cfg, database: undefined }, async (conn) => {
      await conn.query('SELECT 1')
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function createDatabaseIfNotExists(cfg: DbConfig): Promise<void> {
  await withTempPool({ ...cfg, database: undefined }, async (conn) => {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
  })
}

export async function isDatabaseSeeded(cfg: DbConfig): Promise<boolean> {
  try {
    return await withTempPool(cfg, async (conn) => {
      const [rows] = await conn.query<{ cnt: number }[]>(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE table_schema = ? AND table_name = 'roles'`,
        [cfg.database]
      )
      if (!rows[0]?.cnt) return false
      const [roleRows] = await conn.query<{ cnt: number }[]>(
        'SELECT COUNT(*) AS cnt FROM roles'
      )
      return (roleRows[0]?.cnt ?? 0) > 0
    })
  } catch {
    return false
  }
}

export async function runSeedFile(cfg: DbConfig, seedPath: string): Promise<void> {
  const sql = readFileSync(seedPath, 'utf-8')
  const statements = splitSqlStatements(sql).filter(
    (s) => !/^USE\s+/i.test(s)
  )

  await withTempPool(cfg, async (conn) => {
    for (const stmt of statements) {
      try {
        await conn.query(stmt)
      } catch (err) {
        const code = (err as { code?: string }).code
        // Ignore duplicate-key errors — seed is idempotent
        if (code !== 'ER_DUP_ENTRY' && code !== 'ER_DUP_KEYNAME') throw err
      }
    }
  })
}

export async function hasAdminUser(cfg: DbConfig): Promise<boolean> {
  try {
    return await withTempPool(cfg, async (conn) => {
      const [rows] = await conn.query<{ cnt: number }[]>(
        `SELECT COUNT(*) AS cnt
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'admin' AND u.is_active = 1`
      )
      return (rows[0]?.cnt ?? 0) > 0
    })
  } catch {
    return false
  }
}

export async function createAdminUser(
  cfg: DbConfig,
  username: string,
  fullName: string,
  password: string
): Promise<void> {
  await withTempPool(cfg, async (conn) => {
    const [roleRows] = await conn.query<{ id: number }[]>(
      "SELECT id FROM roles WHERE name = 'admin' LIMIT 1"
    )
    const roleId = roleRows[0]?.id
    if (!roleId) throw new Error('Rol admin no encontrado. Ejecuta la inicialización primero.')

    const hash = await bcrypt.hash(password, 12)
    await conn.query(
      `INSERT INTO users (username, full_name, password_hash, role_id, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [username.trim(), fullName.trim(), hash, roleId]
    )

    // Ensure receipt sequence exists
    await conn.query(
      `INSERT IGNORE INTO receipt_sequence (id, prefix, last_number) VALUES (1, 'FG', 0)`
    )
  })
}
