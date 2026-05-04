import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface Branding {
  businessName: string
  slogan:       string
  logoDataUrl:  string | null
}

export const DEFAULT_BRANDING: Branding = {
  businessName: 'Full Gas Gastrobar',
  slogan:       'Gastrobar · Sistema de Gestión',
  logoDataUrl:  null,
}

function getBrandingPath(): string {
  return join(app.getPath('userData'), 'branding.json')
}

export function getBranding(): Branding {
  const p = getBrandingPath()
  if (!existsSync(p)) return { ...DEFAULT_BRANDING }
  try {
    const saved = JSON.parse(readFileSync(p, 'utf-8')) as Partial<Branding>
    return { ...DEFAULT_BRANDING, ...saved }
  } catch {
    return { ...DEFAULT_BRANDING }
  }
}

export function saveBranding(data: Partial<Branding>): Branding {
  const current = getBranding()
  const next    = { ...current, ...data }
  writeFileSync(getBrandingPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
