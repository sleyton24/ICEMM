/**
 * Script para generar plan-cuentas.json y maestro-productos.json
 * desde el archivo MAESTRO_MATERIALES_ICEMM.xlsm
 *
 * Uso: node scripts/seed-plan-cuentas.mjs
 *
 * Input:  public/seed/MAESTRO_MATERIALES_ICEMM.xlsm
 * Output: src/features/plan-cuentas/bundled/plan-cuentas.json
 *         src/features/plan-cuentas/bundled/maestro-productos.json
 */

import XLSX from 'xlsx'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const inputPath = resolve(root, 'public/seed/MAESTRO_MATERIALES_ICEMM.xlsm')
const planOutPath = resolve(root, 'src/features/plan-cuentas/bundled/plan-cuentas.json')
const maestroOutPath = resolve(root, 'src/features/plan-cuentas/bundled/maestro-productos.json')

const FAMILIA_COLORES = {
  100: '#f59e0b', 200: '#1e293b', 300: '#06b6d4', 400: '#ec4899',
  500: '#8b5cf6', 600: '#9ca3af', 700: '#f97316', 800: '#10b981', 900: '#6366f1',
}

console.log('Reading', inputPath)
const wb = XLSX.readFile(inputPath)

// ── Plan de cuentas ──────────────────────────────────────────────────────────

const ctaSheet = wb.SheetNames.find(n => n.toUpperCase().includes('CTA CTO'))
if (!ctaSheet) throw new Error('Sheet CTA CTO ICEMM not found')

const ctaRows = XLSX.utils.sheet_to_json(wb.Sheets[ctaSheet], { header: 1, defval: null })

const familias = []
const cuentas = []

for (let i = 2; i < ctaRows.length; i++) {
  const row = ctaRows[i]
  if (!row?.[0]) continue
  const codigo = typeof row[0] === 'number' ? row[0] : parseInt(String(row[0]), 10)
  if (isNaN(codigo) || codigo <= 0) continue
  const descripcion = String(row[1] ?? '').trim()

  if (codigo % 100 === 0) {
    const letraMatch = descripcion.match(/\(([A-Z])\)\s*$/)
    const letra = letraMatch ? letraMatch[1] : '?'
    const nombre = descripcion.replace(/\s*\([A-Z]\)\s*$/, '').trim().toUpperCase()
    familias.push({ codigo, nombre, nombreOriginal: descripcion, letra, color: FAMILIA_COLORES[codigo] || '#9ca3af' })
  } else {
    const familiaCodigo = Math.floor(codigo / 100) * 100
    const familia = familias.find(f => f.codigo === familiaCodigo)
    cuentas.push({ codigo, descripcion, familiaCodigo, letra: familia?.letra ?? '?' })
  }
}

const plan = {
  version: new Date().toISOString().slice(0, 10),
  cargadoEn: new Date().toISOString(),
  origen: 'bundled',
  familias,
  cuentas,
}

writeFileSync(planOutPath, JSON.stringify(plan, null, 2), 'utf-8')
console.log(`✓ plan-cuentas.json: ${familias.length} familias, ${cuentas.length} cuentas`)

// ── Maestro de productos ─────────────────────────────────────────────────────

const maestroSheet = wb.SheetNames.find(n => n.toUpperCase().includes('MAESTRO ICEMM'))
if (!maestroSheet) throw new Error('Sheet MAESTRO ICEMM 2025 not found')

const mRows = XLSX.utils.sheet_to_json(wb.Sheets[maestroSheet], { header: 1, defval: null })

const PRODUCT_RE = /^[A-Z]\d{3}\d{5,}$/
const productos = []
const seen = new Set()

for (let i = 1; i < mRows.length; i++) {
  const row = mRows[i]
  if (!row) continue
  const rawCodigo = String(row[4] ?? '').trim()
  if (!PRODUCT_RE.test(rawCodigo) || seen.has(rawCodigo)) continue
  seen.add(rawCodigo)

  const ctaCtoRaw = row[9]
  const ctaCto = typeof ctaCtoRaw === 'number' ? ctaCtoRaw : parseInt(String(ctaCtoRaw ?? '0'), 10)

  productos.push({
    codigo: rawCodigo,
    descripcion: String(row[5] ?? '').trim(),
    unidadMedida: String(row[6] ?? '').trim(),
    ctaCto: isNaN(ctaCto) ? 0 : ctaCto,
    letra: rawCodigo[0],
  })
}

const maestro = {
  version: new Date().toISOString().slice(0, 10),
  cargadoEn: new Date().toISOString(),
  origen: 'bundled',
  productos,
}

writeFileSync(maestroOutPath, JSON.stringify(maestro), 'utf-8') // no indent — 8k items
console.log(`✓ maestro-productos.json: ${productos.length} productos`)

// By-letter summary
const byLetter = {}
for (const p of productos) { byLetter[p.letra] = (byLetter[p.letra] || 0) + 1 }
console.log('  Por letra:', Object.entries(byLetter).sort().map(([k,v]) => `${k}=${v}`).join(', '))
