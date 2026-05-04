import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface AppTheme {
  colorScheme:    'dark' | 'light' | 'midnight'
  accentColor:    string   // HSL values, e.g. "24 100% 53%"
  animationLevel: 'full' | 'reduced' | 'none'
  borderRadius:   'sharp' | 'rounded' | 'pill'
}

export const DEFAULT_THEME: AppTheme = {
  colorScheme:    'dark',
  accentColor:    '24 100% 53%',
  animationLevel: 'full',
  borderRadius:   'rounded',
}

function getThemePath(): string {
  return join(app.getPath('userData'), 'theme.json')
}

export function getTheme(): AppTheme {
  const p = getThemePath()
  if (!existsSync(p)) return { ...DEFAULT_THEME }
  try {
    const saved = JSON.parse(readFileSync(p, 'utf-8')) as Partial<AppTheme>
    return { ...DEFAULT_THEME, ...saved }
  } catch {
    return { ...DEFAULT_THEME }
  }
}

export function saveTheme(data: Partial<AppTheme>): AppTheme {
  const current = getTheme()
  const next    = { ...current, ...data }
  writeFileSync(getThemePath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
