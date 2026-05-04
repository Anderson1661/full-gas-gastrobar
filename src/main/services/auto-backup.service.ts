import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'
import { backupService } from './backup.service'

export interface AutoBackupConfig {
  enabled:        boolean
  intervalHours:  number        // 1 | 6 | 12 | 24
  folderPath:     string
  maxKeepFiles:   number
  lastBackupAt:   string | null
}

const DEFAULT_CONFIG: AutoBackupConfig = {
  enabled:       false,
  intervalHours: 24,
  folderPath:    join(app.getPath('documents'), 'FullGas-Backups'),
  maxKeepFiles:  7,
  lastBackupAt:  null,
}

let intervalHandle: ReturnType<typeof setInterval> | null = null
let dbIsReady = false

function getConfigPath(): string {
  return join(app.getPath('userData'), 'auto-backup.json')
}

export function getAutoBackupConfig(): AutoBackupConfig {
  const p = getConfigPath()
  if (!existsSync(p)) return { ...DEFAULT_CONFIG }
  try {
    const saved = JSON.parse(readFileSync(p, 'utf-8')) as Partial<AutoBackupConfig>
    return { ...DEFAULT_CONFIG, ...saved }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveAutoBackupConfig(data: Partial<AutoBackupConfig>): AutoBackupConfig {
  const next = { ...getAutoBackupConfig(), ...data }
  writeFileSync(getConfigPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function pruneOldBackups(folderPath: string, maxKeep: number): void {
  try {
    const files = readdirSync(folderPath)
      .filter((f) => f.startsWith('auto-backup-') && f.endsWith('.sql'))
      .sort()
    while (files.length > maxKeep) {
      const oldest = files.shift()!
      try { unlinkSync(join(folderPath, oldest)) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

async function runBackup(): Promise<void> {
  if (!dbIsReady) return
  const cfg = getAutoBackupConfig()
  if (!cfg.enabled) return
  try {
    mkdirSync(cfg.folderPath, { recursive: true })
    const destPath = join(cfg.folderPath, `auto-backup-${timestamp()}.sql`)
    await backupService.exportToPath(destPath)
    pruneOldBackups(cfg.folderPath, cfg.maxKeepFiles)
    saveAutoBackupConfig({ lastBackupAt: new Date().toISOString() })
    console.log(`[AutoBackup] Guardado en ${destPath}`)
  } catch (error) {
    console.error('[AutoBackup] Error:', error)
  }
}

function scheduleInterval(): void {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null }
  const cfg = getAutoBackupConfig()
  if (!cfg.enabled) return
  intervalHandle = setInterval(() => { void runBackup() }, cfg.intervalHours * 3600 * 1000)
}

export function startAutoBackupScheduler(): void {
  dbIsReady = true
  scheduleInterval()
}

export function restartAutoBackupScheduler(): void {
  scheduleInterval()
}

export function stopAutoBackupScheduler(): void {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null }
}

export async function runBackupNow(): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!dbIsReady) return { success: false, error: 'La base de datos no está disponible aún' }
  const cfg = getAutoBackupConfig()
  try {
    mkdirSync(cfg.folderPath, { recursive: true })
    const destPath = join(cfg.folderPath, `auto-backup-${timestamp()}.sql`)
    await backupService.exportToPath(destPath)
    pruneOldBackups(cfg.folderPath, cfg.maxKeepFiles)
    const updated = saveAutoBackupConfig({ lastBackupAt: new Date().toISOString() })
    return { success: true, path: destPath, ...{ config: updated } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' }
  }
}

export async function pickBackupFolder(): Promise<string | null> {
  const { dialog, BrowserWindow } = await import('electron')
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  const result = await dialog.showOpenDialog(win ?? undefined, {
    title: 'Seleccionar carpeta para backups automáticos',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: getAutoBackupConfig().folderPath,
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}
