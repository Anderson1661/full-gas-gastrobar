import { verify as cryptoVerify, createPublicKey } from 'crypto'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// ── Clave pública embebida (solo verifica, no puede generar licencias) ────────
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAPvlZvTaLpULgmgF6FcrW38fShB5LFOCOZJn+R4zCnXY=
-----END PUBLIC KEY-----`

export type LicensePlan = 'monthly' | 'semester' | 'annual'

export const PLAN_LABELS: Record<LicensePlan, string> = {
  monthly:  'Mensual',
  semester: 'Semestral',
  annual:   'Anual',
}

export const PLAN_DAYS: Record<LicensePlan, number> = {
  monthly:  30,
  semester: 180,
  annual:   365,
}

interface LicensePayload {
  v:       1
  plan:    LicensePlan
  company: string
  email:   string
  exp:     number   // Unix seconds
  iat:     number
  id:      string
}

export type LicenseStatus =
  | {
      valid:         true
      plan:          LicensePlan
      planLabel:     string
      company:       string
      email:         string
      expiresAt:     Date
      daysRemaining: number
      expiringSoon:  boolean
      id:            string
    }
  | {
      valid:      false
      reason:     'not-found' | 'invalid-format' | 'invalid-signature' | 'expired'
      expiresAt?: Date
      plan?:      LicensePlan
      company?:   string
    }

const GRACE_DAYS          = 3
const EXPIRY_WARNING_DAYS = 7

// ── Rutas ─────────────────────────────────────────────────────────────────────
function getLicensePath(): string {
  return join(app.getPath('userData'), 'license.key')
}

export function getLicenseToken(): string | null {
  const p = getLicensePath()
  if (!existsSync(p)) return null
  const content = readFileSync(p, 'utf-8').trim()
  return content || null
}

export function saveLicenseToken(token: string): void {
  writeFileSync(getLicensePath(), token.trim(), 'utf-8')
}

export function deleteLicenseToken(): void {
  const p = getLicensePath()
  if (existsSync(p)) unlinkSync(p)
}

// ── Verificación criptográfica ────────────────────────────────────────────────
export function verifyToken(token: string): LicenseStatus {
  const parts = token.trim().split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'invalid-format' }
  }

  const [payloadB64, sigB64] = parts

  let payload: LicensePayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
    if (payload.v !== 1 || !payload.plan || !payload.exp || !payload.id) {
      return { valid: false, reason: 'invalid-format' }
    }
  } catch {
    return { valid: false, reason: 'invalid-format' }
  }

  try {
    const pubKeyObj = createPublicKey(PUBLIC_KEY)
    const ok = cryptoVerify(null, Buffer.from(payloadB64), pubKeyObj, Buffer.from(sigB64, 'base64url'))
    if (!ok) return { valid: false, reason: 'invalid-signature' }
  } catch {
    return { valid: false, reason: 'invalid-signature' }
  }

  const now          = Math.floor(Date.now() / 1000)
  const expiresAt    = new Date(payload.exp * 1000)
  const graceCutoff  = payload.exp + GRACE_DAYS * 86400

  if (now > graceCutoff) {
    return { valid: false, reason: 'expired', expiresAt, plan: payload.plan, company: payload.company }
  }

  const daysRemaining = Math.max(0, Math.ceil((payload.exp - now) / 86400))

  return {
    valid:         true,
    plan:          payload.plan,
    planLabel:     PLAN_LABELS[payload.plan] ?? payload.plan,
    company:       payload.company,
    email:         payload.email,
    expiresAt,
    daysRemaining,
    expiringSoon:  daysRemaining <= EXPIRY_WARNING_DAYS,
    id:            payload.id,
  }
}

// ── API pública ───────────────────────────────────────────────────────────────
export function checkLicense(): LicenseStatus {
  const token = getLicenseToken()
  if (!token) return { valid: false, reason: 'not-found' }
  return verifyToken(token)
}
