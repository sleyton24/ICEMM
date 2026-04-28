import type { WorkBook } from 'xlsx'
import * as XLSX from 'xlsx'

// ── Types ────────────────────────────────────────────────────────────────────

export type UnidadNegocio = {
  codigo: number
  descripcion: string
  total_uf: number
  num_filas: number
}

export type ProveedorMonto = {
  razon_social: string
  monto_uf: number
}

export type TransaccionERP = {
  unidadNegocioDescripcion: string
  num_doc: string
  mes: number
  ano: number
  fecha_contable: string
  valor_uf: number
  rut_proveedor: string
  razon_social: string
  monto_uf: number
  concepto1_codigo: number
  glosa_detalle: string
  mesKey: string
}

export type CentroCostoAgregado = {
  concepto_codigo: number
  monto_uf: number
  num_transacciones: number
  proveedores_top: ProveedorMonto[]
  glosa_frecuente: string
  /** Per-month breakdown: "YYYY-MM" → { monto_uf, num_tx } */
  porMes: Record<string, { monto_uf: number; num_tx: number }>
  /** Raw transactions for detail view */
  transacciones: TransaccionERP[]
}

export type GastoRealAgregado = {
  unidadNegocio: UnidadNegocio
  porCentroCosto: Record<number, CentroCostoAgregado>
  total_uf: number
  rango_fechas: { desde: Date; hasta: Date }
  mesesDisponibles: string[]
  warnings: string[]
}

// ── Header mapping (case-insensitive, accent-insensitive) ────────────────────

/** Canonical column names we need, mapped from messy ERP headers */
const COLUMN_MAP: Record<string, string> = {
  'codigo unidad de negocio': 'cod_unidad',
  'descripcion unidad de negocio': 'desc_unidad',
  'mes': 'mes',
  'ano': 'ano',         // after accent removal: año → ano
  'fecha contable': 'fecha_contable',
  'valor uf': 'valor_uf',
  'fecha pago factura': 'fecha_pago',
  'rut proveedor': 'rut_proveedor',
  'razon social proveedor': 'razon_social',
  'exento_detalle': 'exento_detalle',
  'exento_detalle_uf': 'exento_detalle_uf',
  'afecto_detalle': 'afecto_detalle',
  'afecto_detalle_uf': 'afecto_detalle_uf',
  'iva_detalle': 'iva_detalle',
  'total_por_documento': 'total_por_documento',
  'concepto1_codigo': 'concepto1_codigo',
  'concepto1': 'concepto1',
  'centro_de_costo': 'centro_de_costo',
  'observaciones': 'observaciones',
  'glosa encabezado comprobante': 'glosa_encabezado',
  'glosa detalle comprobante': 'glosa_detalle',
  'cuenta_contable': 'cuenta_contable',
  'tipo de comprobante': 'tipo_comprobante',
  'num_doc': 'num_doc',
  'tipo_doc': 'tipo_doc',
}

const REQUIRED_COLUMNS = ['cod_unidad', 'concepto1_codigo', 'afecto_detalle_uf', 'exento_detalle_uf']

/** Normalize a header string for matching: trim, lowercase, remove accents */
function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\s+/g, ' ')
}

function buildColumnIndex(headers: string[]): Record<string, number> {
  const index: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(String(headers[i] ?? ''))
    const canonical = COLUMN_MAP[normalized]
    if (canonical) {
      index[canonical] = i
    }
  }
  return index
}

function getRows(wb: WorkBook): any[][] {
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('El archivo no contiene hojas.')
  const sheet = wb.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][]
}

function safeFloat(val: any): number {
  if (val == null) return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const n = parseFloat(String(val))
  return isNaN(n) ? 0 : n
}

function safeInt(val: any): number {
  if (val == null) return 0
  if (typeof val === 'number') return Math.round(val)
  const n = parseInt(String(val), 10)
  return isNaN(n) ? 0 : n
}

function safeString(val: any): string {
  if (val == null) return ''
  return String(val).trim()
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Inspecciona un workbook ERP y devuelve las unidades de negocio encontradas.
 * Útil para mostrar el modal de selección antes de parsear completo.
 */
export function inspeccionarERP(workbook: WorkBook): { unidades: UnidadNegocio[]; total_filas: number } {
  const rows = getRows(workbook)
  if (rows.length < 2) throw new Error('El archivo está vacío o no tiene datos.')

  const headers = rows[0]
  const colIdx = buildColumnIndex(headers.map(h => String(h ?? '')))

  // Validate required columns
  const missing = REQUIRED_COLUMNS.filter(c => colIdx[c] === undefined)
  if (missing.length > 0) {
    const readableNames: Record<string, string> = {
      cod_unidad: 'Codigo Unidad de Negocio',
      concepto1_codigo: 'concepto1_codigo',
      afecto_detalle_uf: 'afecto_detalle_uf',
      exento_detalle_uf: 'exento_detalle_uf',
    }
    throw new Error(
      `Columnas requeridas no encontradas: ${missing.map(m => readableNames[m] || m).join(', ')}. ` +
      `Verifique que el archivo sea un export SQL del ERP.`
    )
  }

  const unidadMap = new Map<number, { descripcion: string; total_uf: number; num_filas: number }>()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const codigo = safeInt(row[colIdx.cod_unidad])
    if (codigo === 0) continue // skip rows without valid unit code

    const afecto_uf = safeFloat(row[colIdx.afecto_detalle_uf])
    const exento_uf = safeFloat(row[colIdx.exento_detalle_uf])
    const monto = afecto_uf + exento_uf

    const existing = unidadMap.get(codigo)
    if (existing) {
      existing.total_uf += monto
      existing.num_filas++
    } else {
      const descripcion = colIdx.desc_unidad !== undefined
        ? safeString(row[colIdx.desc_unidad])
        : `Unidad ${codigo}`
      unidadMap.set(codigo, { descripcion, total_uf: monto, num_filas: 1 })
    }
  }

  const unidades: UnidadNegocio[] = Array.from(unidadMap.entries())
    .map(([codigo, data]) => ({
      codigo,
      descripcion: data.descripcion,
      total_uf: Math.round(data.total_uf * 100) / 100,
      num_filas: data.num_filas,
    }))
    .sort((a, b) => a.codigo - b.codigo)

  return { unidades, total_filas: rows.length - 1 }
}

/**
 * Parsea un workbook ERP filtrando por unidad de negocio.
 * Retorna gasto real agregado por centro de costo.
 */
export function parsearERP(workbook: WorkBook, unidadNegocioCodigo: number): GastoRealAgregado {
  const rows = getRows(workbook)
  const headers = rows[0]
  const colIdx = buildColumnIndex(headers.map(h => String(h ?? '')))
  const warnings: string[] = []

  // Validate required columns
  const missing = REQUIRED_COLUMNS.filter(c => colIdx[c] === undefined)
  if (missing.length > 0) {
    throw new Error(`Columnas requeridas no encontradas: ${missing.join(', ')}`)
  }

  // Accumulators per cost center
  const ccMap = new Map<number, {
    monto_uf: number
    num_tx: number
    proveedores: Map<string, number>  // razon_social → sum monto_uf
    glosas: Map<string, number>       // glosa → count
    porMes: Map<string, { monto_uf: number; num_tx: number }>  // "YYYY-MM" → totals
    transacciones: TransaccionERP[]
  }>()
  const mesesSet = new Set<string>()

  let total_uf = 0
  let minDate: Date | null = null
  let maxDate: Date | null = null
  let unidadDescripcion = ''
  let filasUnidad = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const codUnidad = safeInt(row[colIdx.cod_unidad])
    if (codUnidad !== unidadNegocioCodigo) continue

    filasUnidad++

    // Capture descripcion from first matching row
    if (!unidadDescripcion && colIdx.desc_unidad !== undefined) {
      unidadDescripcion = safeString(row[colIdx.desc_unidad])
    }

    const concepto = safeInt(row[colIdx.concepto1_codigo])
    const afecto_uf = safeFloat(row[colIdx.afecto_detalle_uf])
    const exento_uf = safeFloat(row[colIdx.exento_detalle_uf])
    const monto = afecto_uf + exento_uf

    total_uf += monto

    // Aggregate by cost center
    let entry = ccMap.get(concepto)
    if (!entry) {
      entry = { monto_uf: 0, num_tx: 0, proveedores: new Map(), glosas: new Map(), porMes: new Map(), transacciones: [] }
      ccMap.set(concepto, entry)
    }
    entry.monto_uf += monto
    entry.num_tx++

    // Per-month aggregation — use Fecha contable (DD/MM/YYYY) as canonical date.
    // Fallback to mes/año columns only if Fecha contable is missing/invalid.
    let mesKey: string | null = null
    if (colIdx.fecha_contable !== undefined) {
      const raw = safeString(row[colIdx.fecha_contable])
      if (raw) {
        const d = parseDateDMY(raw)
        if (d && !isNaN(d.getTime())) {
          mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        }
      }
    }
    if (!mesKey) {
      const mes = colIdx.mes !== undefined ? safeInt(row[colIdx.mes]) : 0
      const ano = colIdx.ano !== undefined ? safeInt(row[colIdx.ano]) : 0
      if (mes >= 1 && mes <= 12 && ano > 0) {
        mesKey = `${ano}-${String(mes).padStart(2, '0')}`
      }
    }
    if (mesKey) {
      mesesSet.add(mesKey)
      const mesEntry = entry.porMes.get(mesKey) ?? { monto_uf: 0, num_tx: 0 }
      mesEntry.monto_uf += monto
      mesEntry.num_tx++
      entry.porMes.set(mesKey, mesEntry)
    }

    // Store raw transaction for detail view
    entry.transacciones.push({
      unidadNegocioDescripcion: colIdx.desc_unidad !== undefined ? safeString(row[colIdx.desc_unidad]) : '',
      num_doc: colIdx.num_doc !== undefined ? safeString(row[colIdx.num_doc]) : '',
      mes: colIdx.mes !== undefined ? safeInt(row[colIdx.mes]) : 0,
      ano: colIdx.ano !== undefined ? safeInt(row[colIdx.ano]) : 0,
      fecha_contable: colIdx.fecha_contable !== undefined ? safeString(row[colIdx.fecha_contable]) : '',
      valor_uf: colIdx.valor_uf !== undefined ? safeFloat(row[colIdx.valor_uf]) : 0,
      rut_proveedor: colIdx.rut_proveedor !== undefined ? safeString(row[colIdx.rut_proveedor]) : '',
      razon_social: colIdx.razon_social !== undefined ? safeString(row[colIdx.razon_social]) : '',
      monto_uf: Math.round(monto * 100) / 100,
      concepto1_codigo: concepto,
      glosa_detalle: colIdx.glosa_detalle !== undefined ? safeString(row[colIdx.glosa_detalle]) : '',
      mesKey: mesKey ?? '',
    })

    // Track proveedores
    const razonSocial = colIdx.razon_social !== undefined ? safeString(row[colIdx.razon_social]) : ''
    if (razonSocial) {
      entry.proveedores.set(razonSocial, (entry.proveedores.get(razonSocial) ?? 0) + Math.abs(monto))
    }

    // Track glosas for description
    const glosa = colIdx.glosa_detalle !== undefined ? safeString(row[colIdx.glosa_detalle]) : ''
    if (glosa) {
      entry.glosas.set(glosa, (entry.glosas.get(glosa) ?? 0) + 1)
    }

    // Date range
    if (colIdx.fecha_contable !== undefined) {
      const raw = safeString(row[colIdx.fecha_contable])
      if (raw) {
        const d = parseDateDMY(raw)
        if (d) {
          if (!minDate || d < minDate) minDate = d
          if (!maxDate || d > maxDate) maxDate = d
        }
      }
    }
  }

  // Check for very old dates
  const currentYear = new Date().getFullYear()
  if (minDate && minDate.getFullYear() < currentYear - 2) {
    warnings.push(`Hay transacciones con fecha desde ${minDate.toLocaleDateString('es-CL')} (más de 2 años de antigüedad).`)
  }

  // Build result
  const porCentroCosto: Record<number, CentroCostoAgregado> = {}
  for (const [cc, data] of ccMap) {
    // Top 3 proveedores by absolute monto
    const proveedores_top = Array.from(data.proveedores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([razon_social, monto_uf]) => ({ razon_social, monto_uf: Math.round(monto_uf * 100) / 100 }))

    // Most frequent glosa
    let glosa_frecuente = ''
    let maxCount = 0
    for (const [g, count] of data.glosas) {
      if (count > maxCount) { maxCount = count; glosa_frecuente = g }
    }

    // Round per-month values
    const porMes: Record<string, { monto_uf: number; num_tx: number }> = {}
    for (const [mesKey, vals] of data.porMes) {
      porMes[mesKey] = { monto_uf: Math.round(vals.monto_uf * 100) / 100, num_tx: vals.num_tx }
    }

    porCentroCosto[cc] = {
      concepto_codigo: cc,
      monto_uf: Math.round(data.monto_uf * 100) / 100,
      num_transacciones: data.num_tx,
      proveedores_top,
      glosa_frecuente,
      porMes,
      transacciones: data.transacciones,
    }
  }

  return {
    unidadNegocio: {
      codigo: unidadNegocioCodigo,
      descripcion: unidadDescripcion,
      total_uf: Math.round(total_uf * 100) / 100,
      num_filas: filasUnidad,
    },
    porCentroCosto,
    total_uf: Math.round(total_uf * 100) / 100,
    rango_fechas: {
      desde: minDate ?? new Date(),
      hasta: maxDate ?? new Date(),
    },
    mesesDisponibles: Array.from(mesesSet).sort(),
    warnings,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse DD/MM/YYYY string to Date */
function parseDateDMY(s: string): Date | null {
  // Handle both DD/MM/YYYY and ISO formats
  const parts = s.split('/')
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10) - 1
    const y = parseInt(parts[2], 10)
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      return new Date(y, m, d)
    }
  }
  // Fallback: try native parse
  const date = new Date(s)
  return isNaN(date.getTime()) ? null : date
}
