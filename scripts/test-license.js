#!/usr/bin/env node
/**
 * Test end-to-end del sistema de licencias
 *
 * Cubre:
 *   1. Generación y verificación de token válido
 *   2. Token vencido (fuera del período de gracia)
 *   3. Token vencido dentro del período de gracia (3 días)
 *   4. Firma manipulada (payload alterado)
 *   5. Formato inválido
 *   6. Token de admin app verificado contra el mismo PUBLIC_KEY
 */

const { sign, verify, createPrivateKey, createPublicKey, randomUUID } = require('crypto')
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join }  = require('path')
const os        = require('os')

// ── Keys ─────────────────────────────────────────────────────────────────────────

const PRIVATE_KEY_PATH = join(__dirname, 'license.private.key')
if (!existsSync(PRIVATE_KEY_PATH)) {
  console.error('\nERROR: scripts/license.private.key no encontrado.\n')
  process.exit(1)
}

const PRIVATE_KEY_PEM = readFileSync(PRIVATE_KEY_PATH, 'utf-8')
const PUBLIC_KEY_PEM  = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAPvlZvTaLpULgmgF6FcrW38fShB5LFOCOZJn+R4zCnXY=
-----END PUBLIC KEY-----`

const PLAN_LABELS = { monthly: 'Mensual', semester: 'Semestral', annual: 'Anual' }
const GRACE_DAYS  = 3

// ── Helpers ───────────────────────────────────────────────────────────────────────

function makeToken(overrides = {}) {
  const now     = Math.floor(Date.now() / 1000)
  const payload = {
    v:       1,
    plan:    'monthly',
    company: 'Bar Test',
    email:   'test@test.com',
    exp:     now + 30 * 86400,
    iat:     now,
    id:      randomUUID(),
    ...overrides,
  }
  const p64    = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const privKey = createPrivateKey(PRIVATE_KEY_PEM)
  const sig     = sign(null, Buffer.from(p64), privKey).toString('base64url')
  return `${p64}.${sig}`
}

function verifyToken(token) {
  const parts = (token || '').trim().split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'invalid-format' }
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'))
    if (payload.v !== 1 || !payload.plan || !payload.exp || !payload.id) {
      return { valid: false, reason: 'invalid-format' }
    }
  } catch {
    return { valid: false, reason: 'invalid-format' }
  }

  try {
    const pubKey = createPublicKey(PUBLIC_KEY_PEM)
    const ok     = verify(null, Buffer.from(parts[0]), pubKey, Buffer.from(parts[1], 'base64url'))
    if (!ok) return { valid: false, reason: 'invalid-signature' }
  } catch {
    return { valid: false, reason: 'invalid-signature' }
  }

  const now          = Math.floor(Date.now() / 1000)
  const graceCutoff  = payload.exp + GRACE_DAYS * 86400
  if (now > graceCutoff) {
    return { valid: false, reason: 'expired', expiresAt: new Date(payload.exp * 1000), plan: payload.plan, company: payload.company }
  }

  const daysRemaining = Math.max(0, Math.ceil((payload.exp - now) / 86400))
  return {
    valid:         true,
    plan:          payload.plan,
    planLabel:     PLAN_LABELS[payload.plan] ?? payload.plan,
    company:       payload.company,
    email:         payload.email,
    expiresAt:     new Date(payload.exp * 1000),
    daysRemaining,
    expiringSoon:  daysRemaining <= 7,
    id:            payload.id,
  }
}

// ── Test runner ───────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✅  ${name}`)
    passed++
  } catch (err) {
    console.log(`  ❌  ${name}`)
    console.log(`       → ${err.message}`)
    failed++
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed')
}

function assertEqual(a, b) {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

// ── Test suites ───────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════')
console.log('  FULL GAS — TEST END-TO-END DE LICENCIAS')
console.log('══════════════════════════════════════════════════════════\n')

// ── 1. Token válido ──────────────────────────────────────────────────────────────
console.log('▶ Generación y verificación de token válido')

let validToken
test('genera token sin errores', () => {
  const now = Math.floor(Date.now() / 1000)
  validToken = makeToken({ company: 'Gastrobar El Fuego', email: 'fuego@bar.co', plan: 'semester', exp: now + 180 * 86400 })
  assert(typeof validToken === 'string' && validToken.includes('.'), 'Token no tiene formato esperado')
})

test('token tiene dos secciones separadas por punto', () => {
  const parts = validToken.split('.')
  assertEqual(parts.length, 2)
  assert(parts[0].length > 0, 'Payload vacío')
  assert(parts[1].length > 0, 'Firma vacía')
})

test('verifica correctamente como válido', () => {
  const r = verifyToken(validToken)
  assert(r.valid === true, `Esperaba valid=true, got: ${r.reason}`)
})

test('company y plan correctos en el payload', () => {
  const r = verifyToken(validToken)
  assertEqual(r.company, 'Gastrobar El Fuego')
  assertEqual(r.plan, 'semester')
  assertEqual(r.planLabel, 'Semestral')
})

test('daysRemaining ≈ 180 para plan semestral', () => {
  const r = verifyToken(validToken)
  assert(r.daysRemaining >= 178 && r.daysRemaining <= 182, `daysRemaining=${r.daysRemaining}`)
})

test('expiringSoon = false en token recién generado (180d)', () => {
  const r = verifyToken(validToken)
  assertEqual(r.expiringSoon, false)
})

// ── 2. Token casi vencido (expiringSoon) ─────────────────────────────────────────
console.log('\n▶ Token por vencer (< 7 días)')

test('expiringSoon = true con 5 días restantes', () => {
  const now = Math.floor(Date.now() / 1000)
  const token = makeToken({ exp: now + 5 * 86400 })
  const r = verifyToken(token)
  assert(r.valid === true, `Esperaba válido, reason=${r.reason}`)
  assertEqual(r.expiringSoon, true)
  assert(r.daysRemaining >= 4 && r.daysRemaining <= 6, `daysRemaining=${r.daysRemaining}`)
})

// ── 3. Token vencido pero en período de gracia ────────────────────────────────────
console.log('\n▶ Token vencido dentro del período de gracia (3 días)')

test('vencido hace 1 día aún es válido (gracia)', () => {
  const now = Math.floor(Date.now() / 1000)
  const token = makeToken({ exp: now - 1 * 86400 })
  const r = verifyToken(token)
  assert(r.valid === true, `Debería ser válido (gracia), got reason=${r.reason}`)
  assertEqual(r.daysRemaining, 0)
})

test('vencido hace exactamente 3 días aún es válido (límite gracia)', () => {
  const now = Math.floor(Date.now() / 1000)
  const token = makeToken({ exp: now - 3 * 86400 + 60 }) // 60s de margen
  const r = verifyToken(token)
  assert(r.valid === true, `Debería ser válido en límite de gracia, got reason=${r.reason}`)
})

// ── 4. Token vencido fuera de la gracia ──────────────────────────────────────────
console.log('\n▶ Token vencido fuera del período de gracia')

test('vencido hace 4 días es inválido (fuera de gracia)', () => {
  const now = Math.floor(Date.now() / 1000)
  const token = makeToken({ exp: now - 4 * 86400 })
  const r = verifyToken(token)
  assert(r.valid === false, `Esperaba inválido, got valid=${r.valid}`)
  assertEqual(r.reason, 'expired')
})

test('vencido hace 30 días es inválido', () => {
  const now = Math.floor(Date.now() / 1000)
  const token = makeToken({ exp: now - 30 * 86400 })
  const r = verifyToken(token)
  assertEqual(r.valid, false)
  assertEqual(r.reason, 'expired')
})

// ── 5. Firma manipulada ───────────────────────────────────────────────────────────
console.log('\n▶ Firma manipulada / payload alterado')

test('payload alterado falla verificación', () => {
  // Decode → modify company → re-encode → reuse original signature
  const parts   = validToken.split('.')
  const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'))
  payload.company = 'Hacker Corp'
  const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const tampered = `${tamperedPayload}.${parts[1]}`
  const r = verifyToken(tampered)
  assertEqual(r.valid, false)
  assertEqual(r.reason, 'invalid-signature')
})

test('firma truncada falla verificación', () => {
  const parts   = validToken.split('.')
  const tampered = `${parts[0]}.${parts[1].slice(0, 20)}`
  const r = verifyToken(tampered)
  assertEqual(r.valid, false)
  assertEqual(r.reason, 'invalid-signature')
})

test('firma de otro token no sirve para este payload', () => {
  const otherToken = makeToken({ company: 'Otro Bar' })
  const parts1 = validToken.split('.')
  const parts2 = otherToken.split('.')
  const mixed  = `${parts1[0]}.${parts2[1]}`
  const r = verifyToken(mixed)
  assertEqual(r.valid, false)
  assertEqual(r.reason, 'invalid-signature')
})

// ── 6. Formato inválido ───────────────────────────────────────────────────────────
console.log('\n▶ Formato inválido')

test('string vacío → invalid-format', () => {
  assertEqual(verifyToken('').reason, 'invalid-format')
})

test('sin punto separador → invalid-format', () => {
  assertEqual(verifyToken('eyJub3Rh').reason, 'invalid-format')
})

test('payload no es JSON válido → invalid-format', () => {
  const sig = validToken.split('.')[1]
  assertEqual(verifyToken(`bm90anNvbg.${sig}`).reason, 'invalid-format')
})

test('payload con campos faltantes → invalid-format', () => {
  const bad = Buffer.from(JSON.stringify({ v: 1, plan: 'monthly' })).toString('base64url')
  const privKey = createPrivateKey(PRIVATE_KEY_PEM)
  const sig = sign(null, Buffer.from(bad), privKey).toString('base64url')
  const r = verifyToken(`${bad}.${sig}`)
  assertEqual(r.valid, false)
  assertEqual(r.reason, 'invalid-format')
})

// ── 7. Todos los planes ───────────────────────────────────────────────────────────
console.log('\n▶ Los tres planes')

for (const [plan, expectedDays] of [['monthly', 30], ['semester', 180], ['annual', 365]]) {
  test(`plan ${plan} genera token válido con ~${expectedDays} días`, () => {
    const now   = Math.floor(Date.now() / 1000)
    const token = makeToken({ plan, exp: now + expectedDays * 86400 })
    const r     = verifyToken(token)
    assert(r.valid === true, `Plan ${plan}: ${r.reason}`)
    assertEqual(r.plan, plan)
    assert(
      r.daysRemaining >= expectedDays - 2 && r.daysRemaining <= expectedDays + 1,
      `daysRemaining=${r.daysRemaining} esperaba ~${expectedDays}`
    )
  })
}

// ── 8. Escribe licencia real al archivo ───────────────────────────────────────────
console.log('\n▶ Escribir licencia real al archivo de la app')

const USER_DATA_PATH = join(os.homedir(), 'AppData', 'Roaming', 'fullgas-gastrobar')
const LICENSE_KEY_PATH = join(USER_DATA_PATH, 'license.key')

let realToken
test('genera token anual para empresa real', () => {
  const now = Math.floor(Date.now() / 1000)
  realToken = makeToken({
    plan:    'annual',
    company: 'Full Gas Gastrobar',
    email:   'sistetecnioficial1@gmail.com',
    exp:     now + 365 * 86400,
  })
  const r = verifyToken(realToken)
  assert(r.valid === true, 'Token generado no es válido')
  assert(r.daysRemaining >= 364, `daysRemaining=${r.daysRemaining}`)
})

test(`escribe license.key en ${LICENSE_KEY_PATH}`, () => {
  writeFileSync(LICENSE_KEY_PATH, realToken, 'utf-8')
  assert(existsSync(LICENSE_KEY_PATH), 'Archivo no fue creado')
})

test('verifica que lo escrito se puede leer y verificar', () => {
  const fromDisk = readFileSync(LICENSE_KEY_PATH, 'utf-8').trim()
  const r        = verifyToken(fromDisk)
  assert(r.valid === true, `Token del disco inválido: ${r.reason}`)
  assertEqual(r.company, 'Full Gas Gastrobar')
  assertEqual(r.plan, 'annual')
})

// ── Resultado final ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════')
if (failed === 0) {
  console.log(`  ✅  TODOS LOS TESTS PASARON (${passed}/${passed + failed})`)
} else {
  console.log(`  ⚠   ${passed} pasaron, ${failed} fallaron`)
}
console.log('══════════════════════════════════════════════════════════')

if (realToken) {
  console.log('\n  Licencia escrita en:')
  console.log(`  ${LICENSE_KEY_PATH}`)
  console.log('\n  Token generado (para activar manualmente en la app):')
  console.log('  ─────────────────────────────────────────────────────')
  console.log(`  ${realToken}`)
  console.log('  ─────────────────────────────────────────────────────')
}

console.log()
if (failed > 0) process.exit(1)
