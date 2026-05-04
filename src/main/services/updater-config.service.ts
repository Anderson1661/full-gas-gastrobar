import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface UpdaterConfig {
  enabled: boolean
  owner:   string
  repo:    string
  token:   string
}

const DEFAULTS: UpdaterConfig = {
  enabled: false,
  owner:   '',
  repo:    '',
  token:   '',
}

function configPath(): string {
  return join(app.getPath('userData'), 'updater.json')
}

export function readUpdaterConfig(): UpdaterConfig {
  try {
    const p = configPath()
    if (!existsSync(p)) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(readFileSync(p, 'utf-8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveUpdaterConfig(cfg: UpdaterConfig): void {
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8')
}

export function isUpdaterConfigured(cfg: UpdaterConfig): boolean {
  return cfg.enabled && cfg.owner.trim() !== '' && cfg.repo.trim() !== ''
}
