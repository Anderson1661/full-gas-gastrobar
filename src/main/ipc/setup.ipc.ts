import { app, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { IPC_CHANNELS } from '@shared/types/ipc'
import {
  isFirstRun,
  testConnection,
  createDatabaseIfNotExists,
  isDatabaseSeeded,
  runSeedFile,
  hasAdminUser,
  createAdminUser,
  saveDbConfig,
  readDbConfig,
  type DbConfig,
} from '../setup/bootstrap'
import { closeDatabase } from '../database/connection'
import { runMigrations } from '../database/migrate'
import { registerAllIpcHandlers } from './index'
import { checkLicense, PLAN_LABELS } from '../services/license.service'

function resolveSeedPath(): string {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'database', 'seeds', '001_seed.sql') : '',
    join(process.cwd(), 'database', 'seeds', '001_seed.sql'),
    join(__dirname, '../../database/seeds/001_seed.sql'),
    join(__dirname, '../../../database/seeds/001_seed.sql'),
  ].filter(Boolean)

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  throw new Error(
    `Archivo seed no encontrado. Revisados:\n${candidates.join('\n')}`
  )
}

let handlersRegistered = false

type DbState = 'pending' | 'ready' | 'error'
let dbState: DbState = 'pending'
let dbStateError = ''

function setDbState(state: 'ready' | 'error', error = ''): void {
  dbState      = state
  dbStateError = error
}

export function registerSetupIpc(
  onDbReady: () => void
): void {
  ipcMain.handle(IPC_CHANNELS.SETUP_GET_STATUS, async () => {
    return {
      needsSetup: isFirstRun(),
      dbReady:    dbState === 'ready',
      dbError:    dbState === 'error' ? dbStateError : undefined,
    }
  })

  ipcMain.handle(IPC_CHANNELS.SETUP_TEST_CONNECTION, async (_, cfg: DbConfig) => {
    return testConnection(cfg)
  })

  ipcMain.handle(IPC_CHANNELS.SETUP_INITIALIZE, async (_, cfg: DbConfig) => {
    try {
      // 1. Create database
      await createDatabaseIfNotExists(cfg)

      // 2. Persist credentials to userData/.env
      saveDbConfig(cfg)

      // 3. Inject into process.env so runMigrations uses them
      process.env['DB_HOST']              = cfg.host
      process.env['DB_PORT']              = String(cfg.port)
      process.env['DB_USER']              = cfg.user
      process.env['DB_PASSWORD']          = cfg.password
      process.env['DB_NAME']              = cfg.database
      process.env['DB_INCLUDE_BASELINE']  = 'true'

      // 4. Close any stale pool and run migrations (full schema)
      await closeDatabase()
      await runMigrations()

      // 5. Seed static data if not yet present
      if (!(await isDatabaseSeeded(cfg))) {
        const seedPath = resolveSeedPath()
        await runSeedFile(cfg, seedPath)
      }

      return { success: true }
    } catch (err) {
      console.error('[SETUP_INITIALIZE]', err)
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.SETUP_CREATE_ADMIN,
    async (_, { config: cfg, username, fullName, password }: {
      config: DbConfig | null | undefined
      username: string
      fullName: string
      password: string
    }) => {
      try {
        // config is null when called from admin-only mode (NSIS already saved .env)
        const resolvedCfg = cfg ?? readDbConfig()
        if (!resolvedCfg) {
          return { success: false, error: 'No hay configuración de base de datos guardada' }
        }
        if (await hasAdminUser(resolvedCfg)) {
          return { success: false, error: 'Ya existe un usuario administrador activo' }
        }
        await createAdminUser(resolvedCfg, username, fullName, password)
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.SETUP_COMPLETE, async () => {
    try {
      // Register all business IPC handlers once (only once)
      if (!handlersRegistered) {
        registerAllIpcHandlers()
        handlersRegistered = true
      }
      onDbReady()
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}

export async function tryNormalBoot(
  onDbReady: () => void,
  onNeedsAdmin?: () => void,
  onNeedsLicense?: () => void,
  onLicenseExpired?: (expiresAt: string, planLabel: string) => void
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Ensure the database exists before connecting the pool.
    // When NSIS wrote the .env but the DB has not been created yet, this
    // prevents "Unknown database" on the first initDatabase() call.
    const cfg = readDbConfig()
    if (cfg) await createDatabaseIfNotExists(cfg)

    await runMigrations()

    // Seed initial data on first-ever boot (tables exist but are empty).
    if (cfg && !(await isDatabaseSeeded(cfg))) {
      const seedPath = resolveSeedPath()
      await runSeedFile(cfg, seedPath)
    }

    if (!handlersRegistered) {
      registerAllIpcHandlers()
      handlersRegistered = true
    }
    setDbState('ready')

    if (cfg && !(await hasAdminUser(cfg))) {
      if (onNeedsAdmin) onNeedsAdmin()
      return { ok: true }
    }

    const licenseStatus = checkLicense()
    if (!licenseStatus.valid) {
      if (licenseStatus.reason === 'expired' && onLicenseExpired) {
        onLicenseExpired(
          licenseStatus.expiresAt?.toISOString() ?? '',
          licenseStatus.plan ? (PLAN_LABELS[licenseStatus.plan] ?? licenseStatus.plan) : ''
        )
      } else if (onNeedsLicense) {
        onNeedsLicense()
      } else {
        onDbReady()
      }
      return { ok: true }
    }

    onDbReady()
    return { ok: true }
  } catch (err) {
    const message = (err as Error).message
    setDbState('error', message)
    console.error('[Boot] DB init failed:', err)
    return { ok: false, error: message }
  }
}

// Allow external code to check if handlers have been registered
export function areHandlersRegistered(): boolean {
  return handlersRegistered
}
