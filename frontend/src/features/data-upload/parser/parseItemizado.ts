import * as XLSX from 'xlsx'
import type { PartidaRaw, ParseResult, FamiliaCanonica } from '../../projects/types'
import { normalizeFamilia, isFamiliaHeader } from './normalizeFamilia'

/**
 * Parsea un archivo Excel de itemizado ICEMM (.xls / .xlsx).
 *
 * Layout esperado:
 *   Filas 0-9:  metadatos (nombre proyecto en fila ~4 col B)
 *   Fila 10:    headers ["Item","C. Costo","Descripción","Ud","Cantidad","Precio","Total"]
 *   Fila 11:    vacía
 *   Fila 12+:   [header familia] → [ítems] → [TOTAL FAMILIA] → (vacía) → siguiente familia
 *   Final:      TOTAL INSUMOS, REDONDEO, TOTAL
 */
export function parseItemizado(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  const warnings: string[] = []
  const partidas: PartidaRaw[] = []
  const subtotalesFamilia: Record<string, number> = {}
  let totalGeneral = 0
  let redondeo = 0

  // Extraer nombre del proyecto de metadatos (fila ~4, col B)
  let nombreProyecto = ''
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const cellA = String(rows[i]?.[0] ?? '').trim().toLowerCase()
    if (cellA.includes('proyecto')) {
      nombreProyecto = String(rows[i]?.[1] ?? '').trim()
      break
    }
    // Also check if col B has a project-like name
    const cellB = String(rows[i]?.[1] ?? '').trim()
    if (cellB.toLowerCase().includes('itemizado') || cellB.toLowerCase().includes('emm')) {
      nombreProyecto = cellB
    }
  }

  // Find header row (contains "Item" and "Total")
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const r = rows[i]
    if (!r) continue
    const a = String(r[0] ?? '').trim().toLowerCase()
    const g = String(r[6] ?? '').trim().toLowerCase()
    if ((a === 'item' || a === 'ítem') && (g === 'total' || g === 'monto')) {
      headerRowIdx = i
      break
    }
  }
  if (headerRowIdx === -1) {
    // Fallback: assume row 10
    headerRowIdx = 10
    warnings.push('No se encontró fila de headers; usando fila 10 por defecto.')
  }

  let currentFamilia: FamiliaCanonica = 'OTROS'
  const codigosSeen = new Set<string>()

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    // Check if all cells are empty
    const allEmpty = row.every((c: any) => c == null || c === '' || (typeof c === 'number' && isNaN(c)))
    if (allEmpty) continue

    const colA = row[0] != null ? String(row[0]).trim() : ''
    const colC = row[2] != null ? String(row[2]).trim() : ''
    const colG = typeof row[6] === 'number' ? row[6] : parseFloat(String(row[6] ?? ''))

    // Check if it's a familia header
    if (isFamiliaHeader(row)) {
      const { familia, matched } = normalizeFamilia(colA)
      currentFamilia = familia
      if (!matched) {
        warnings.push(`Familia no reconocida en fila ${i + 1}: "${colA}" → clasificada como OTROS`)
      }
      continue
    }

    // Check for subtotal rows (TOTAL MATERIALES, TOTAL MANO OBRA, etc.)
    const upperC = colC.toUpperCase()
    const upperA = colA.toUpperCase()
    const textToCheck = upperC || upperA

    if (textToCheck.startsWith('TOTAL ') && !textToCheck.includes('INSUMOS')) {
      // Subtotal de familia — guardar para validación
      if (!isNaN(colG)) {
        const famName = textToCheck.replace('TOTAL ', '').trim()
        const { familia } = normalizeFamilia(famName)
        // Solo guardar si no existe ya (tolerar duplicados)
        if (!subtotalesFamilia[familia]) {
          subtotalesFamilia[familia] = colG
        }
      }
      continue
    }

    if (textToCheck === 'TOTAL INSUMOS' || textToCheck === 'TOTAL') {
      if (!isNaN(colG)) totalGeneral = colG
      continue
    }

    if (textToCheck === 'REDONDEO') {
      if (!isNaN(colG)) redondeo = colG
      continue
    }

    // Check if it's a valid partida row (must have a code in col A matching pattern)
    const isItemCode = /^[A-Z]\d+/.test(colA)
    if (!isItemCode) continue

    // Parse numeric columns
    const codigo2 = row[1] != null ? (typeof row[1] === 'number' ? row[1] : parseInt(String(row[1]), 10)) : 0
    const ud = row[3] != null ? String(row[3]).trim() : ''
    const cantidad = typeof row[4] === 'number' ? row[4] : parseFloat(String(row[4] ?? '0')) || 0
    const precio = typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5] ?? '0')) || 0
    const total = !isNaN(colG) ? colG : 0

    // Duplicate check
    if (codigosSeen.has(colA)) {
      warnings.push(`Código duplicado en fila ${i + 1}: "${colA}" — se conserva el último.`)
      // Remove previous entry
      const idx = partidas.findIndex(p => p.codigo === colA)
      if (idx !== -1) partidas.splice(idx, 1)
    }
    codigosSeen.add(colA)

    partidas.push({
      codigo: colA,
      codigo2,
      descripcion: colC || colA,
      familia: currentFamilia,
      ud,
      cantidad,
      precio_unitario: precio,
      total,
    })
  }

  // Validación cruzada: suma por familia vs subtotal reportado
  const sumasFamilia: Record<string, number> = {}
  for (const p of partidas) {
    sumasFamilia[p.familia] = (sumasFamilia[p.familia] || 0) + p.total
  }
  for (const [fam, subtotal] of Object.entries(subtotalesFamilia)) {
    const suma = sumasFamilia[fam] || 0
    const diff = Math.abs(suma - subtotal)
    if (diff > 0.02) {
      warnings.push(`Discrepancia en ${fam}: suma partidas=${suma.toFixed(2)}, subtotal reportado=${subtotal.toFixed(2)}, diff=${diff.toFixed(2)} UF`)
    }
  }

  // If totalGeneral not found from TOTAL row, calculate from subtotals
  if (totalGeneral === 0 && partidas.length > 0) {
    totalGeneral = partidas.reduce((s, p) => s + p.total, 0) + redondeo
  }

  return { nombreProyecto, partidas, subtotalesFamilia, totalGeneral, redondeo, warnings }
}
