#!/usr/bin/env node
/**
 * Full Gas Gastrobar — Generador de licencias
 *
 * Uso:
 *   node scripts/generate-license.js --plan monthly  --company "Bar La Gaviota" --email "bar@email.com"
 *   node scripts/generate-license.js --plan semester --company "Gastrobar XYZ"  --email "xyz@email.com"
 *   node scripts/generate-license.js --plan annual   --company "Restaurante ABC" --email "abc@email.com"
 *
 * Planes disponibles:
 *   monthly  → 30 días
 *   semester → 180 días
 *   annual   → 365 días
 *
 * IMPORTANTE: Mantén scripts/license.private.key en un lugar seguro.
 *             NUNCA subas la clave privada al repositorio.
 */

const { sign, createPrivateKey, randomUUID } = require('crypto')
const { readFileSync, existsSync } = require('fs')
const { join } = require('path')

// ── Clave privada ────────────────────────────────────────────────────────────
const KEY_PATH = join(__dirname, 'license.private.key')
if (!existsSync(KEY_PATH)) {
  console.error('\nERROR: No se encontró scripts/license.private.key')
  console.error('Asegúrate de tener la clave privada en esa ruta.\n')
  process.exit(1)
}
const PRIVATE_KEY = readFileSync(KEY_PATH, 'utf-8')

// ── Planes ───────────────────────────────────────────────────────────────────
const PLAN_DAYS = { monthly: 30, semester: 180, annual: 365 }
const PLAN_LABELS = { monthly: 'Mensual', semester: 'Semestral', annual: 'Anual' }

// ── Parseo de argumentos ─────────────────────────────────────────────────────
const args = process.argv.slice(2)
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }

const plan    = get('--plan')    || 'monthly'
const company = get('--company') || 'Cliente Full Gas'
const email   = get('--email')   || ''
const days    = parseInt(get('--days') || String(PLAN_DAYS[plan] || 30), 10)

if (!PLAN_DAYS[plan]) {
  console.error('\nERROR: Plan inválido. Usa: monthly, semester, annual\n')
  process.exit(1)
}

// ── Construcción del payload ─────────────────────────────────────────────────
const now = Math.floor(Date.now() / 1000)
const exp = now + days * 86400

const payload = {
  v:       1,
  plan,
  company: company.trim(),
  email:   email.trim(),
  exp,
  iat:     now,
  id:      randomUUID(),
}

const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')

// ── Firma Ed25519 ────────────────────────────────────────────────────────────
const privKeyObj = createPrivateKey(PRIVATE_KEY)
const signature  = sign(null, Buffer.from(payloadB64), privKeyObj).toString('base64url')

const token = `${payloadB64}.${signature}`

// ── Salida ───────────────────────────────────────────────────────────────────
const expiresAt = new Date(exp * 1000).toLocaleDateString('es-CO', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
})

console.log('\n╔════════════════════════════════════════════════════╗')
console.log('║         FULL GAS GASTROBAR — LICENCIA GENERADA     ║')
console.log('╚════════════════════════════════════════════════════╝')
console.log(`\n  Empresa:   ${company}`)
console.log(`  Email:     ${email || '(no especificado)'}`)
console.log(`  Plan:      ${PLAN_LABELS[plan]} (${days} días)`)
console.log(`  Vence:     ${expiresAt}`)
console.log(`  ID:        ${payload.id}`)
console.log('\n─────────────────────────────────────────────────────')
console.log('  CLAVE DE LICENCIA (copiar y entregar al cliente):')
console.log('─────────────────────────────────────────────────────\n')
console.log(token)
console.log('\n─────────────────────────────────────────────────────')
console.log('  El cliente debe pegar esta clave en la pantalla')
console.log('  de activación de Full Gas Gastrobar.')
console.log('─────────────────────────────────────────────────────\n')
