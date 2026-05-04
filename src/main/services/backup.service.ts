import { app, BrowserWindow, dialog } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { getPool, query, queryOne } from '../database/connection'
import { authService } from './auth.service'
import { auditLog } from '../utils/audit'
import { escapeSqlIdentifier, splitSqlStatements, toSqlLiteral } from '../utils/sql'
import { invalidateSessionCache, type SessionContext } from './session.service'
import type { ApiResult, ExportDatabaseBackupDTO, ImportDatabaseBackupDTO } from '@shared/types/dtos'

interface BackupManifest {
  app: string
  format: 'fullgas-sql-backup'
  version: string
  createdAt: string
  database: string
  schemaVersion: string | null
  includedTables: string[]
  excludedTables: string[]
}

interface ExportBackupResult {
  path: string
  tableCount: number
  rowCountByTable: Record<string, number>
  createdAt: string
}

interface ImportBackupResult {
  path: string
  autoBackupPath: string
  importedTables: string[]
  forceLogout: true
}

const EXCLUDED_TABLES = new Set([
  'schema_migrations',
  'data_seeds',
  'user_sessions',
])

const PREFERRED_TABLE_ORDER = [
  'roles',
  'permissions',
  'role_permissions',
  'security_questions',
  'users',
  'user_security_answers',
  'password_reset_attempts',
  'table_layout_zones',
  'bar_tables',
  'suppliers',
  'product_categories',
  'products',
  'inventory_movements',
  'payment_methods',
  'cash_sessions',
  'cash_closure_details',
  'expense_categories',
  'expenses',
  'promotions',
  'promotion_items',
  'orders',
  'sub_orders',
  'order_items',
  'payments',
  'receipts',
  'receipt_sequence',
  'audit_logs',
  'system_settings',
]

function createTimestamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').trim()
}

function buildBackupFileName(suggestedName?: string, prefix = 'fullgas-backup'): string {
  const normalized = sanitizeFileName(String(suggestedName ?? '').trim())
  if (normalized) {
    return normalized.toLowerCase().endsWith('.sql') ? normalized : `${normalized}.sql`
  }
  return `${prefix}-${createTimestamp()}.sql`
}

function parseManifest(sqlText: string): BackupManifest | null {
  const match = sqlText.match(/^-- FULLGAS_BACKUP_MANIFEST (.+)$/m)
  if (!match) return null

  try {
    return JSON.parse(match[1]) as BackupManifest
  } catch {
    return null
  }
}

function chunk<T>(values: T[], size: number): T[][] {
  const output: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size))
  }
  return output
}

function normalizeComparableVersion(value: string | null): string {
  return String(value ?? '').trim()
}

export class BackupService {
  async exportSql(
    ctx: SessionContext,
    dto?: ExportDatabaseBackupDTO,
    forcedPath?: string
  ): Promise<ApiResult<ExportBackupResult>> {
    const destinationPath = forcedPath ?? await this.promptBackupSavePath(dto?.suggestedName)
    if (!destinationPath) {
      return { success: false, error: 'Exportacion cancelada por el usuario', code: 'CANCELLED' }
    }

    const createdAt = new Date().toISOString()
    const tables = await this.listExportTables()
    const manifest = await this.buildManifest(createdAt, tables)
    const rowCountByTable: Record<string, number> = {}

    const lines: string[] = [
      `-- FULLGAS_BACKUP_MANIFEST ${JSON.stringify(manifest)}`,
      '-- Full Gas Gastrobar SQL backup',
      'SET FOREIGN_KEY_CHECKS = 0;',
      '',
    ]

    for (const tableName of tables) {
      const columns = await this.getTableColumns(tableName)
      const rows = await this.getTableRows(tableName, columns)
      rowCountByTable[tableName] = rows.length

      lines.push(`-- TABLE ${tableName}`)
      lines.push(`DELETE FROM ${escapeSqlIdentifier(tableName)};`)

      if (!rows.length) {
        lines.push('')
        continue
      }

      const columnList = columns.map((column) => escapeSqlIdentifier(column)).join(', ')
      const serializedRows = rows.map((row) => (
        `(${columns.map((column) => toSqlLiteral(row[column])).join(', ')})`
      ))

      for (const serializedChunk of chunk(serializedRows, 150)) {
        lines.push(
          `INSERT INTO ${escapeSqlIdentifier(tableName)} (${columnList}) VALUES\n${serializedChunk.join(',\n')};`
        )
      }

      lines.push('')
    }

    lines.push('SET FOREIGN_KEY_CHECKS = 1;')

    await mkdir(dirname(destinationPath), { recursive: true })
    await writeFile(destinationPath, lines.join('\n'), 'utf8')

    await auditLog({
      userId: ctx.userId,
      username: ctx.username,
      roleName: ctx.roleName,
      action: 'EXPORT_BACKUP',
      module: 'backup',
      description: 'Backup SQL exportado',
      sessionId: ctx.sessionId,
      deviceInfo: ctx.deviceInfo ?? undefined,
      ipAddress: ctx.ipAddress ?? undefined,
      details: {
        fileName: basename(destinationPath),
        tableCount: tables.length,
        rowCountByTable,
        excludedTables: Array.from(EXCLUDED_TABLES),
      },
    })

    return {
      success: true,
      data: {
        path: destinationPath,
        tableCount: tables.length,
        rowCountByTable,
        createdAt,
      },
    }
  }

  async importSql(
    ctx: SessionContext,
    dto: ImportDatabaseBackupDTO
  ): Promise<ApiResult<ImportBackupResult>> {
    const passwordCheck = await authService.verifyUserPassword(ctx.userId, dto.currentPassword)
    if (!passwordCheck.success) {
      return { success: false, error: passwordCheck.error, code: passwordCheck.code }
    }

    const sourcePath = await this.promptBackupImportPath()
    if (!sourcePath) {
      return { success: false, error: 'Importacion cancelada por el usuario', code: 'CANCELLED' }
    }

    const restoreChecks = await this.ensureRestoreAllowed(ctx.sessionId)
    if (!restoreChecks.success) {
      return restoreChecks
    }

    const sqlText = await readFile(sourcePath, 'utf8')
    if (!sqlText.trim()) {
      return { success: false, error: 'El archivo de backup esta vacio', code: 'EMPTY_FILE' }
    }

    const manifest = parseManifest(sqlText)
    if (!manifest || manifest.format !== 'fullgas-sql-backup') {
      return { success: false, error: 'El archivo no es un backup SQL valido generado por la aplicacion', code: 'INVALID_BACKUP' }
    }

    const currentSchemaVersion = await this.getCurrentSchemaVersion()
    if (
      normalizeComparableVersion(manifest.schemaVersion) &&
      normalizeComparableVersion(currentSchemaVersion) &&
      normalizeComparableVersion(manifest.schemaVersion) > normalizeComparableVersion(currentSchemaVersion)
    ) {
      return {
        success: false,
        error: 'El backup fue generado con una version de esquema mas nueva que esta instalacion',
        code: 'INCOMPATIBLE_SCHEMA',
      }
    }

    const currentTables = new Set(await this.listCurrentTables())
    const missingTables = manifest.includedTables.filter((tableName) => !currentTables.has(tableName))
    if (missingTables.length) {
      return {
        success: false,
        error: `El backup requiere tablas no disponibles en esta instalacion: ${missingTables.join(', ')}`,
        code: 'MISSING_TABLES',
      }
    }

    const autoBackupPath = join(dirname(sourcePath), `pre-restore-${createTimestamp()}.sql`)
    const preRestoreBackup = await this.exportSql(ctx, { suggestedName: basename(autoBackupPath) }, autoBackupPath)
    if (!preRestoreBackup.success) {
      return {
        success: false,
        error: preRestoreBackup.error ?? 'No se pudo generar el backup preventivo antes de restaurar',
        code: preRestoreBackup.code ?? 'PRE_BACKUP_FAILED',
      }
    }

    const statements = splitSqlStatements(sqlText)
    if (!statements.length) {
      return { success: false, error: 'El backup no contiene sentencias SQL ejecutables', code: 'EMPTY_BACKUP' }
    }

    const conn = await getPool().getConnection()
    try {
      await conn.beginTransaction()

      for (const statement of statements) {
        await conn.query(statement)
      }

      await conn.execute(
        `INSERT INTO audit_logs (
           user_id, username, role_name, action, module,
           record_id, entity_type, entity_id,
           description, details_json, old_values, new_values,
           session_id, device_info, ip_address, result, reason
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ctx.userId,
          ctx.username,
          ctx.roleName,
          'IMPORT_BACKUP',
          'backup',
          null,
          'backup',
          null,
          'Backup SQL importado',
          JSON.stringify({
            fileName: basename(sourcePath),
            autoBackupFileName: basename(autoBackupPath),
            importedTables: manifest.includedTables,
            schemaVersion: manifest.schemaVersion,
          }),
          null,
          null,
          ctx.sessionId,
          ctx.deviceInfo ?? null,
          ctx.ipAddress ?? null,
          'success',
          null,
        ]
      )

      await conn.query('DELETE FROM user_sessions')
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      await auditLog({
        userId: ctx.userId,
        username: ctx.username,
        roleName: ctx.roleName,
        action: 'IMPORT_BACKUP',
        module: 'backup',
        description: 'Fallo la importacion de backup SQL',
        sessionId: ctx.sessionId,
        deviceInfo: ctx.deviceInfo ?? undefined,
        ipAddress: ctx.ipAddress ?? undefined,
        result: 'failure',
        reason: error instanceof Error ? error.message : 'unknown_error',
        details: {
          fileName: basename(sourcePath),
          autoBackupFileName: basename(autoBackupPath),
        },
      })

      throw error
    } finally {
      conn.release()
    }

    invalidateSessionCache()

    return {
      success: true,
      data: {
        path: sourcePath,
        autoBackupPath,
        importedTables: manifest.includedTables,
        forceLogout: true,
      },
    }
  }

  private async promptBackupSavePath(suggestedName?: string): Promise<string | null> {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    const response = await dialog.showSaveDialog(targetWindow ?? undefined, {
      title: 'Exportar backup SQL',
      defaultPath: join(app.getPath('documents'), buildBackupFileName(suggestedName)),
      filters: [{ name: 'SQL', extensions: ['sql'] }],
    })

    if (response.canceled || !response.filePath) return null
    return response.filePath
  }

  private async promptBackupImportPath(): Promise<string | null> {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    const response = await dialog.showOpenDialog(targetWindow ?? undefined, {
      title: 'Importar backup SQL',
      properties: ['openFile'],
      filters: [{ name: 'SQL', extensions: ['sql'] }],
    })

    if (response.canceled || !response.filePaths[0]) return null
    return response.filePaths[0]
  }

  private async listCurrentTables(): Promise<string[]> {
    const rows = await query<{ table_name: string }>(
      `SELECT TABLE_NAME AS table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_type = 'BASE TABLE'`
    )
    return rows.map((row) => row.table_name)
  }

  private async listExportTables(): Promise<string[]> {
    const allTables = await this.listCurrentTables()
    const included = allTables.filter((tableName) => !EXCLUDED_TABLES.has(tableName))
    const weights = new Map(PREFERRED_TABLE_ORDER.map((tableName, index) => [tableName, index]))

    return included.sort((left, right) => {
      const leftWeight = weights.get(left) ?? Number.MAX_SAFE_INTEGER
      const rightWeight = weights.get(right) ?? Number.MAX_SAFE_INTEGER
      return leftWeight - rightWeight || left.localeCompare(right)
    })
  }

  private async getTableColumns(tableName: string): Promise<string[]> {
    const rows = await query<{ column_name: string }>(
      `SELECT COLUMN_NAME AS column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
       ORDER BY ORDINAL_POSITION`,
      [tableName]
    )
    return rows.map((row) => row.column_name)
  }

  private async getTableRows(
    tableName: string,
    columns: string[]
  ): Promise<Record<string, unknown>[]> {
    const hasIdColumn = columns.includes('id')
    const orderClause = hasIdColumn ? ` ORDER BY ${escapeSqlIdentifier('id')}` : ''
    return query<Record<string, unknown>>(
      `SELECT * FROM ${escapeSqlIdentifier(tableName)}${orderClause}`
    )
  }

  private async buildManifest(createdAt: string, tables: string[]): Promise<BackupManifest> {
    const [databaseRow, schemaVersion] = await Promise.all([
      queryOne<{ database_name: string }>('SELECT DATABASE() AS database_name'),
      this.getCurrentSchemaVersion(),
    ])

    return {
      app: 'Full Gas Gastrobar',
      format: 'fullgas-sql-backup',
      version: app.getVersion(),
      createdAt,
      database: databaseRow?.database_name ?? 'unknown',
      schemaVersion,
      includedTables: tables,
      excludedTables: Array.from(EXCLUDED_TABLES),
    }
  }

  private async getCurrentSchemaVersion(): Promise<string | null> {
    const row = await queryOne<{ file_name: string }>(
      `SELECT file_name
       FROM schema_migrations
       ORDER BY id DESC
       LIMIT 1`
    )
    return row?.file_name ?? null
  }

  async exportToPath(destPath: string): Promise<void> {
    const createdAt = new Date().toISOString()
    const tables = await this.listExportTables()
    const manifest = await this.buildManifest(createdAt, tables)

    const lines: string[] = [
      `-- FULLGAS_BACKUP_MANIFEST ${JSON.stringify(manifest)}`,
      '-- Full Gas Gastrobar SQL backup (auto)',
      'SET FOREIGN_KEY_CHECKS = 0;',
      '',
    ]

    for (const tableName of tables) {
      const columns = await this.getTableColumns(tableName)
      const rows = await this.getTableRows(tableName, columns)

      lines.push(`-- TABLE ${tableName}`)
      lines.push(`DELETE FROM ${escapeSqlIdentifier(tableName)};`)

      if (!rows.length) { lines.push(''); continue }

      const columnList = columns.map((c) => escapeSqlIdentifier(c)).join(', ')
      const serializedRows = rows.map((row) => (
        `(${columns.map((c) => toSqlLiteral(row[c])).join(', ')})`
      ))
      for (const serializedChunk of chunk(serializedRows, 150)) {
        lines.push(
          `INSERT INTO ${escapeSqlIdentifier(tableName)} (${columnList}) VALUES\n${serializedChunk.join(',\n')};`
        )
      }
      lines.push('')
    }

    lines.push('SET FOREIGN_KEY_CHECKS = 1;')
    await mkdir(dirname(destPath), { recursive: true })
    await writeFile(destPath, lines.join('\n'), 'utf8')
  }

  private async ensureRestoreAllowed(currentSessionId: number): Promise<ApiResult> {
    const [openOrders, openCashSession, otherActiveSessions] = await Promise.all([
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM orders
         WHERE status IN ('open', 'pending_payment')`
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM cash_sessions
         WHERE status = 'open'`
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM user_sessions
         WHERE is_active = 1
           AND revoked_at IS NULL
           AND expires_at > NOW()
           AND id <> ?`,
        [currentSessionId]
      ),
    ])

    if (Number(openOrders?.count ?? 0) > 0) {
      return {
        success: false,
        error: 'No se puede restaurar mientras existan ordenes abiertas o pendientes de cobro',
        code: 'OPEN_ORDERS_PRESENT',
      }
    }

    if (Number(openCashSession?.count ?? 0) > 0) {
      return {
        success: false,
        error: 'No se puede restaurar mientras exista una caja abierta',
        code: 'OPEN_CASH_PRESENT',
      }
    }

    if (Number(otherActiveSessions?.count ?? 0) > 0) {
      return {
        success: false,
        error: 'Debes cerrar las demas sesiones activas antes de restaurar un backup',
        code: 'OTHER_ACTIVE_SESSIONS',
      }
    }

    return { success: true }
  }
}

export const backupService = new BackupService()
