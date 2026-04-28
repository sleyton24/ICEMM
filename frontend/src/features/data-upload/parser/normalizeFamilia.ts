import type { FamiliaCanonica } from '../../projects/types'

/**
 * Mapeo de nombres de familia tal como aparecen en los Excel de ICEMM
 * al naming canónico (alineado al Plan de Cuentas oficial).
 */
const FAMILIA_MAP: Record<string, FamiliaCanonica> = {
  'MATERIALES':                'MATERIALES',
  'MATERIAL':                  'MATERIALES',
  'MANO OBRA':                 'MANO DE OBRA',
  'MANO DE OBRA':              'MANO DE OBRA',
  'EQUIPOS MAQUINARIA':        'EQUIPOS Y MAQUINARIAS',
  'EQUIPOS Y MAQUINARIAS':     'EQUIPOS Y MAQUINARIAS',
  'EQUIPOS Y MAQUINARIA':      'EQUIPOS Y MAQUINARIAS',
  'EQUIPAMIENTO Y MAQUINARIA': 'EQUIPOS Y MAQUINARIAS',
  'SUBCONTRATOS':              'SUBCONTRATOS',
  'SUBCONTRATO':               'SUBCONTRATOS',
  'GASTOS GENERALES':          'GASTOS GENERALES',
  'OTROS':                     'OTROS',
  'EDIFICACIONES COMERCIALES': 'EDIFICACIONES COMERCIALES',
  'POST VENTA':                'POST VENTA',
  'GASTOS OFICINA':            'GASTOS OFICINA CENTRAL',
  'GASTOS OFICINA CENTRAL':    'GASTOS OFICINA CENTRAL',
}

export function normalizeFamilia(raw: string): { familia: FamiliaCanonica; matched: boolean } {
  const key = raw.trim().toUpperCase()
  const found = FAMILIA_MAP[key]
  if (found) return { familia: found, matched: true }

  // Fuzzy: check if any key is contained in the raw string
  for (const [k, v] of Object.entries(FAMILIA_MAP)) {
    if (key.includes(k)) return { familia: v, matched: true }
  }

  return { familia: 'OTROS', matched: false }
}

/**
 * Detecta si una fila es un header de familia.
 * En el Excel, los headers de familia tienen texto en col A y el resto vacío.
 */
export function isFamiliaHeader(row: any[]): boolean {
  if (!row[0] || typeof row[0] !== 'string') return false
  const txt = String(row[0]).trim()
  // Must be all uppercase, no digits, length > 3
  if (txt.length < 4) return false
  if (/\d/.test(txt)) return false
  if (txt !== txt.toUpperCase()) return false
  // Cols B-G should be empty/null/0
  for (let i = 1; i <= 6; i++) {
    if (row[i] != null && row[i] !== '' && row[i] !== 0) return false
  }
  return true
}
