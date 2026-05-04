import { existsSync, readFileSync, readdirSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { config } from 'dotenv'
import { closeDatabase, getPool, initDatabase } from '../connection'

config()

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) =>
      statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((statement) => statement.length > 0)
}

function isSessionStatement(statement: string): boolean {
  return /^USE\s+/i.test(statement)
}

function resolveSeedsDir(): string {
  const candidates = [
    process.env.DB_SEEDS_DIR,
    join(process.cwd(), 'database', 'seeds'),
    resolve(__dirname, '../../../database/seeds'),
    resolve(__dirname, '../../../../database/seeds'),
    join(dirname(process.execPath), 'database', 'seeds'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error(`No se encontro el directorio de seeds. Revisados: ${candidates.join(', ')}`)
}

async function ensureSeedsTable(): Promise<void> {
  const pool = getPool()
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS data_seeds (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

async function ensureBaselineLoaded(): Promise<void> {
  const pool = getPool()
  const [rows] = await pool.execute(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'roles'
      LIMIT 1
    `
  )

  if ((rows as unknown[]).length === 0) {
    throw new Error('El schema base no esta cargado. Importa database/migrations/001_initial.sql antes de ejecutar db:seed.')
  }
}

export async function runSeeds(): Promise<void> {
  await initDatabase()
  const pool = getPool()
  const seedsDir = resolveSeedsDir()

  await ensureBaselineLoaded()
  await ensureSeedsTable()

  const files = readdirSync(seedsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const [appliedRows] = await pool.execute(
      'SELECT id FROM data_seeds WHERE file_name = ? LIMIT 1',
      [file]
    )

    if ((appliedRows as { id: number }[]).length > 0) {
      console.log(`[Seed] ${file} ya aplicado; se omite`)
      continue
    }

    const sqlPath = join(seedsDir, file)
    const statements = splitStatements(readFileSync(sqlPath, 'utf-8'))
    console.log(`[Seed] Ejecutando ${file} con ${statements.length} statements`)

    for (const statement of statements) {
      if (isSessionStatement(statement)) continue
      await pool.query(statement)
    }

    await pool.execute('INSERT INTO data_seeds (file_name) VALUES (?)', [file])
  }

  console.log('[Seed] Seeds aplicados correctamente')
}

if (require.main === module) {
  runSeeds()
    .then(async () => {
      await closeDatabase()
    })
    .catch(async (error) => {
      console.error('[Seed] Error fatal:', error)
      await closeDatabase()
      process.exit(1)
    })
}
