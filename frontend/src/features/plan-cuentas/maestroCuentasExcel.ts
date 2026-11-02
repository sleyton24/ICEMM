import * as XLSX from 'xlsx'
import type { CuentaCosto } from './types'

/** Columnas exactas del Excel del maestro de cuentas (deben calzar con el backend). */
export const COLUMNAS_CUENTAS = ['codigo', 'descripcion', 'familiaCodigo', 'letra'] as const

export function hojaCuentas(cuentas: CuentaCosto[]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([[...COLUMNAS_CUENTAS], ...cuentas.map(c => [c.codigo, c.descripcion, c.familiaCodigo, c.letra])])
}

/** Lee la hoja "cuentas" (o la primera) como encabezado + filas crudas; la validación la hace el backend. */
export function leerHojaCuentas(wb: XLSX.WorkBook): { header: unknown[]; rows: unknown[][] } {
  const nombre = wb.SheetNames.find(n => n.trim().toLowerCase() === 'cuentas') ?? wb.SheetNames[0]
  if (!nombre) throw new Error('El archivo no tiene hojas')
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: true })
  if (!aoa.length) throw new Error(`La hoja "${nombre}" está vacía`)
  const [header, ...rows] = aoa
  return { header: (header ?? []).slice(0, 50), rows: rows.map(r => (r ?? []).slice(0, 50)) }
}

export function filtrarCuentas(cuentas: CuentaCosto[], f: { q?: string; familia?: number; letra?: string }): CuentaCosto[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return cuentas.filter(c =>
    (f.familia === undefined || c.familiaCodigo === f.familia) &&
    (!f.letra || c.letra === f.letra) &&
    (!q || String(c.codigo).includes(q) || c.descripcion.toLowerCase().includes(q)))
}
