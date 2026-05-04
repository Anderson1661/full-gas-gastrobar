import { existsSync, readFileSync, readdirSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { config } from 'dotenv'
import { closeDatabase, getPool, initDatabase } from './connection'
import { splitSqlStatements } from '../utils/sql'

config()

function isSessionStatement(statement: string): boolean {
  return /^USE\s+/i.test(statement)
}

async function tableExists(tableName: string): Promise<boolean> {
  const pool = getPool()
  const [rows] = await pool.execute(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      LIMIT 1
    `,
    [tableName]
  )

  return (rows as unknown[]).length > 0
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const pool = getPool()
  const [rows] = await pool.execute(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
    `,
    [tableName, columnName]
  )

  return (rows as unknown[]).length > 0
}

async function isMigrationMaterialized(file: string): Promise<boolean> {
  if (file !== '002_rounds_and_fixes.sql') return false

  const checks = await Promise.all([
    tableExists('sub_orders'),
    columnExists('order_items', 'sub_order_id'),
    columnExists('payments', 'sub_order_id'),
    columnExists('payments', 'tendered_amount'),
    columnExists('payments', 'change_given'),
    columnExists('inventory_movements', 'admin_verified'),
    columnExists('inventory_movements', 'verified_by'),
    columnExists('audit_logs', 'entity_type'),
    columnExists('audit_logs', 'entity_id'),
    columnExists('audit_logs', 'details_json'),
  ])

  return checks.every(Boolean)
}

async function reconcileRoundsAndFixes(): Promise<void> {
  const pool = getPool()
  const statements = [
    `
      INSERT INTO sub_orders (order_id, round_number, label, subtotal, total_paid, balance_due, status, created_by, created_at)
      SELECT o.id,
             1,
             'Tanda 1',
             COALESCE(o.subtotal, 0),
             COALESCE(pay.total_paid, 0),
             GREATEST(0, COALESCE(o.subtotal, 0) - COALESCE(pay.total_paid, 0)),
             CASE
               WHEN GREATEST(0, COALESCE(o.subtotal, 0) - COALESCE(pay.total_paid, 0)) = 0 THEN 'paid'
               WHEN COALESCE(pay.total_paid, 0) > 0 THEN 'partial'
               ELSE 'pending'
             END,
             o.waiter_id,
             o.opened_at
      FROM orders o
      LEFT JOIN (
        SELECT order_id, COALESCE(SUM(amount), 0) AS total_paid
        FROM payments
        GROUP BY order_id
      ) pay ON pay.order_id = o.id
      LEFT JOIN sub_orders so ON so.order_id = o.id AND so.round_number = 1
      WHERE so.id IS NULL
    `,
    `
      UPDATE order_items oi
      JOIN sub_orders so ON so.order_id = oi.order_id AND so.round_number = 1
      SET oi.sub_order_id = so.id
      WHERE oi.sub_order_id IS NULL
    `,
    `
      UPDATE payments p
      JOIN sub_orders so ON so.order_id = p.order_id AND so.round_number = 1
      SET p.sub_order_id = so.id
      WHERE p.sub_order_id IS NULL
    `,
    `
      UPDATE payments
      SET tendered_amount = CASE
            WHEN tendered_amount IS NULL OR tendered_amount = 0 THEN amount
            ELSE tendered_amount
          END,
          change_given = COALESCE(change_given, 0)
    `,
    `
      UPDATE sub_orders so
      LEFT JOIN (
        SELECT sub_order_id, COALESCE(SUM(subtotal), 0) AS subtotal
        FROM order_items
        WHERE status = 'active'
        GROUP BY sub_order_id
      ) items ON items.sub_order_id = so.id
      LEFT JOIN (
        SELECT sub_order_id, COALESCE(SUM(amount), 0) AS total_paid
        FROM payments
        WHERE sub_order_id IS NOT NULL
        GROUP BY sub_order_id
      ) pay ON pay.sub_order_id = so.id
      SET so.subtotal = COALESCE(items.subtotal, 0),
          so.total_paid = COALESCE(pay.total_paid, 0),
          so.balance_due = GREATEST(0, COALESCE(items.subtotal, 0) - COALESCE(pay.total_paid, 0)),
          so.status = CASE
            WHEN GREATEST(0, COALESCE(items.subtotal, 0) - COALESCE(pay.total_paid, 0)) = 0 THEN 'paid'
            WHEN COALESCE(pay.total_paid, 0) > 0 THEN 'partial'
            ELSE 'pending'
          END,
          so.closed_at = CASE
            WHEN GREATEST(0, COALESCE(items.subtotal, 0) - COALESCE(pay.total_paid, 0)) = 0 THEN COALESCE(so.closed_at, NOW())
            ELSE NULL
          END
    `,
    `
      UPDATE orders o
      LEFT JOIN (
        SELECT order_id, COALESCE(SUM(subtotal), 0) AS subtotal
        FROM sub_orders
        GROUP BY order_id
      ) subt ON subt.order_id = o.id
      LEFT JOIN (
        SELECT order_id, COALESCE(SUM(amount), 0) AS total_paid
        FROM payments
        GROUP BY order_id
      ) pay ON pay.order_id = o.id
      SET o.subtotal = COALESCE(subt.subtotal, 0),
          o.total_paid = COALESCE(pay.total_paid, 0),
          o.service_charge = CASE WHEN o.service_accepted = 1 THEN ROUND(COALESCE(subt.subtotal, 0) * 0.05) ELSE 0 END,
          o.total = COALESCE(subt.subtotal, 0) + CASE WHEN o.service_accepted = 1 THEN ROUND(COALESCE(subt.subtotal, 0) * 0.05) ELSE 0 END,
          o.balance_due = GREATEST(
            0,
            COALESCE(subt.subtotal, 0) + CASE WHEN o.service_accepted = 1 THEN ROUND(COALESCE(subt.subtotal, 0) * 0.05) ELSE 0 END - COALESCE(pay.total_paid, 0)
          )
    `,
    `
      INSERT IGNORE INTO payment_methods (name, code, sort_order) VALUES
        ('Nequi', 'nequi', 3),
        ('Daviplata', 'daviplata', 4),
        ('Tarjeta', 'card', 5)
    `,
    `UPDATE payment_methods SET sort_order = 1 WHERE code = 'cash'`,
    `UPDATE payment_methods SET sort_order = 2 WHERE code IN ('transfer', 'nequi', 'daviplata')`,
    `UPDATE payment_methods SET sort_order = 5 WHERE code IN ('debit', 'credit', 'card')`,
  ]

  console.log('[Migration] Reconciliando datos heredados de 002_rounds_and_fixes.sql')

  for (const statement of statements) {
    await pool.query(statement)
  }
}

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool()
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

function resolveMigrationsDir(): string {
  const candidates = [
    process.env.DB_MIGRATIONS_DIR,
    // Electron packaged: extraResources land under process.resourcesPath
    process.resourcesPath ? join(process.resourcesPath, 'database', 'migrations') : '',
    join(process.cwd(), 'database', 'migrations'),
    resolve(__dirname, '../../database/migrations'),
    resolve(__dirname, '../../../database/migrations'),
    join(dirname(process.execPath), 'database', 'migrations'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(`No se encontró el directorio de migraciones. Revisados: ${candidates.join(', ')}`)
}

export async function runMigrations(): Promise<void> {
  await initDatabase()
  const pool = getPool()
  const migrationsDir = resolveMigrationsDir()

  await ensureMigrationsTable()

  const isEmptyDb = !(await tableExists('roles'))
  const includeBaseline = process.env.DB_INCLUDE_BASELINE === 'true' || isEmptyDb

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .filter((file) => includeBaseline || !file.startsWith('001_'))
    .sort()

  for (const file of files) {
    const alreadyApplied = await pool.execute(
      'SELECT id FROM schema_migrations WHERE file_name = ? LIMIT 1',
      [file]
    )
    const rows = alreadyApplied[0] as { id: number }[]
    if (rows.length > 0) {
      if (file === '002_rounds_and_fixes.sql' && await isMigrationMaterialized(file)) {
        console.log('[Migration] 002_rounds_and_fixes.sql ya registrada; se ejecutara reconciliacion segura')
        await reconcileRoundsAndFixes()
      }
      continue
    }

    if (await isMigrationMaterialized(file)) {
      if (file === '002_rounds_and_fixes.sql') {
        console.log(`[Migration] ${file} ya esta reflejada en el esquema; se reconciliaran datos antes de registrarla`)
        await reconcileRoundsAndFixes()
      } else {
        console.log(`[Migration] ${file} ya esta reflejada en el esquema; se registrara sin reejecutar`)
      }
      await pool.execute('INSERT INTO schema_migrations (file_name) VALUES (?)', [file])
      continue
    }

    const sqlPath = join(migrationsDir, file)
    if (!existsSync(sqlPath)) continue

    const statements = splitSqlStatements(readFileSync(sqlPath, 'utf-8'))
    console.log(`[Migration] Ejecutando ${file} con ${statements.length} statements`)

    // Use a single dedicated connection so MySQL session variables (SET @var /
    // PREPARE / EXECUTE) survive across all statements in the same file.
    const migrConn = await pool.getConnection()
    try {
      for (const statement of statements) {
        if (isSessionStatement(statement)) continue
        await migrConn.query(statement)
      }
    } finally {
      migrConn.release()
    }

    await pool.execute('INSERT INTO schema_migrations (file_name) VALUES (?)', [file])
  }

  console.log('[Migration] Migraciones aplicadas correctamente')
}

if (require.main === module && !process.versions.electron) {
  runMigrations()
    .then(async () => {
      await closeDatabase()
    })
    .catch(async (error) => {
      console.error('[Migration] Error fatal:', error)
      await closeDatabase()
      process.exit(1)
    })
}
