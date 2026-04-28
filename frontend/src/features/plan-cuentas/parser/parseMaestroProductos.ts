import * as XLSX from 'xlsx'
import type { ProductoMaestro, MaestroProductos } from '../types'

const PRODUCT_CODE_RE = /^[A-Z]\d{3}\d{5,}$/

/**
 * Parsea la hoja "MAESTRO ICEMM 2025" del workbook .xlsm/.xlsx.
 * Retorna el catálogo de productos.
 */
export function parseMaestroProductos(wb: XLSX.WorkBook): MaestroProductos {
  const sheetName = wb.SheetNames.find(n => n.toUpperCase().includes('MAESTRO ICEMM'))
  if (!sheetName) {
    throw new Error('No se encontró la hoja "MAESTRO ICEMM 2025" en el archivo.')
  }

  const ws = wb.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  const productos: ProductoMaestro[] = []
  const codigosSeen = new Set<string>()

  // Header is at row 0 (index 0): cols B-K → array indices 1-10
  // Data starts at row 1 (index 1)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const rawCodigo = String(row[4] ?? '').trim()  // col E (index 4)
    if (!PRODUCT_CODE_RE.test(rawCodigo)) continue  // skip subgroup headers
    if (codigosSeen.has(rawCodigo)) continue         // skip duplicates
    codigosSeen.add(rawCodigo)

    const descripcion = String(row[5] ?? '').trim()  // col F
    const unidadMedida = String(row[6] ?? '').trim()  // col G
    const ctaCtoRaw = row[9]                           // col J (index 9)
    const ctaCto = typeof ctaCtoRaw === 'number'
      ? ctaCtoRaw
      : parseInt(String(ctaCtoRaw ?? '0'), 10)

    productos.push({
      codigo: rawCodigo,
      descripcion,
      unidadMedida,
      ctaCto: isNaN(ctaCto) ? 0 : ctaCto,
      letra: rawCodigo[0],
    })
  }

  return {
    version: new Date().toISOString().slice(0, 10),
    cargadoEn: new Date().toISOString(),
    origen: 'uploaded',
    productos,
  }
}
