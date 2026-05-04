import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { readUpdaterConfig, isUpdaterConfigured } from './updater-config.service'
import type { UpdaterConfig } from './updater-config.service'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateInfo {
  version:      string
  releaseNotes: string | null
  releaseDate:  string
}

export interface ProgressInfo {
  percent:           number
  bytesPerSecond:    number
  transferred:       number
  total:             number
}

type Listener = (event: string, payload?: unknown) => void

let _emit: Listener = () => {}
let _listenersRegistered = false

export function onUpdateEvent(listener: Listener): void {
  _emit = listener
}

export function setupAutoUpdater(): void {
  if (is.dev) return
  if (_listenersRegistered) return
  _listenersRegistered = true

  autoUpdater.autoDownload         = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    _emit('checking')
  })

  autoUpdater.on('update-available', (info) => {
    _emit('available', {
      version:      info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
      releaseDate:  info.releaseDate,
    } satisfies UpdateInfo)
  })

  autoUpdater.on('update-not-available', () => {
    _emit('not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    _emit('progress', {
      percent:        Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred:    progress.transferred,
      total:          progress.total,
    } satisfies ProgressInfo)
  })

  autoUpdater.on('update-downloaded', (info) => {
    _emit('downloaded', {
      version:      info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
      releaseDate:  info.releaseDate,
    } satisfies UpdateInfo)
  })

  autoUpdater.on('error', (err) => {
    _emit('error', err.message)
  })

  // Apply feed URL from persisted config (if already configured)
  applyUpdaterFeed()
}

export function applyUpdaterFeed(cfg?: UpdaterConfig): void {
  if (is.dev) return
  const resolved = cfg ?? readUpdaterConfig()
  if (!isUpdaterConfigured(resolved)) return
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner:    resolved.owner.trim(),
      repo:     resolved.repo.trim(),
      token:    resolved.token.trim() || undefined,
    } as Parameters<typeof autoUpdater.setFeedURL>[0])
  } catch { /* ignore invalid config */ }
}

export function checkForUpdates(): void {
  if (is.dev) return
  if (!isUpdaterConfigured(readUpdaterConfig())) return
  autoUpdater.checkForUpdates().catch((err) => {
    _emit('error', (err as Error).message)
  })
}

export function downloadUpdate(): void {
  if (is.dev) return
  autoUpdater.downloadUpdate().catch((err) => {
    _emit('error', (err as Error).message)
  })
}

export function quitAndInstall(): void {
  if (is.dev) return
  autoUpdater.quitAndInstall(false, true)
}

export function getAppVersion(): string {
  return autoUpdater.currentVersion?.version ?? '1.0.0'
}
