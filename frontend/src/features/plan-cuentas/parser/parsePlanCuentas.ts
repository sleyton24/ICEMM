import * as XLSX from 'xlsx'
import type { FamiliaMacro, CuentaCosto, PlanCuentas } from '../types'

const FAMILIA_COLORES: Record<number, string> = {
  100: '#f59e0b', // amber — Materiales
  200: '#1e293b', // slate-dark — Mano de Obra
  300: '#06b6d4', // cyan — Subcontratos
  400: '#ec4899', // pink — Gastos Generales
  500: '#8b5cf6', // violet — Equipos
  600: '#9ca3af', // gray — Otros
  700: '#f97316', // orange — Edificaciones
  800: '#10b981', // emerald — Post Venta
  900: '#6366f1', // indigo — Oficina Central
}

/**
 * Parsea la hoja "CTA CTO ICEMM" de un workbook .xlsm/.xlsx.
 * Retorna el PlanCuentas con familias y subcuentas.
 */
export function parsePlanCuentas(wb: XLSX.WorkBook): PlanCuentas {
  const sheetName = wb.SheetNames.find(n => n.toUpperCase().includes('CTA CTO'))
  if (!sheetName) {
    throw new Error('No se encontró la hoja "CTA CTO ICEMM" en el archivo.')
  }

  const ws = wb.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  const familias: FamiliaMacro[] = []
  const cuentas: CuentaCosto[] = []
  let currentFamilia: FamiliaMacro | null = null

  // Data starts at row index 2 (0=title, 1=empty)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const rawCode = row[0]
    if (rawCode == null) continue

    const codigo = typeof rawCode === 'number' ? rawCode : parseInt(String(rawCode), 10)
    if (isNaN(codigo) || codigo <= 0) continue

    const descripcion = String(row[1] ?? '').trim()

    if (codigo % 100 === 0) {
      // Familia macro header
      const letraMatch = descripcion.match(/\(([A-Z])\)\s*$/)
      const letra = letraMatch ? letraMatch[1] : '?'
      const nombre = descripcion
        .replace(/\s*\([A-Z]\)\s*$/, '')
        .trim()
        .toUpperCase()

      currentFamilia = {
        codigo,
        nombre,
        nombreOriginal: descripcion,
        letra,
        color: FAMILIA_COLORES[codigo] || '#9ca3af',
      }
      familias.push(currentFamilia)
    } else {
      // Subcuenta
      const familiaCodigo = Math.floor(codigo / 100) * 100
      const familia = familias.find(f => f.codigo === familiaCodigo)

      cuentas.push({
        codigo,
        descripcion,
        familiaCodigo,
        letra: familia?.letra ?? '?',
      })
    }
  }

  return {
    version: new Date().toISOString().slice(0, 10),
    cargadoEn: new Date().toISOString(),
    origen: 'uploaded',
    familias,
    cuentas,
  }
}

/**
 * Validates that a parsed PlanCuentas meets the expected structure.
 * Returns an array of error messages (empty = valid).
 */
export function validarPlanCuentas(plan: PlanCuentas): string[] {
  const errors: string[] = []

  const expectedFamilias = [100, 200, 300, 400, 500, 600, 700, 800, 900]
  const foundCodes = new Set(plan.familias.map(f => f.codigo))
  for (const code of expectedFamilias) {
    if (!foundCodes.has(code)) {
      errors.push(`Familia macro ${code} no encontrada.`)
    }
  }

  // Check for duplicate cuenta codes
  const cuentaCodes = new Set<number>()
  for (const c of plan.cuentas) {
    if (cuentaCodes.has(c.codigo)) {
      errors.push(`Cuenta duplicada: ${c.codigo}`)
    }
    cuentaCodes.add(c.codigo)
  }

  // Check all cuentas belong to a valid familia
  for (const c of plan.cuentas) {
    if (!foundCodes.has(c.familiaCodigo)) {
      errors.push(`Cuenta ${c.codigo} pertenece a familia ${c.familiaCodigo} que no existe.`)
    }
  }

  return errors
}
