/**
 * Maestro de cuentas (plan de cuentas de costo): validación y diff de cargas Excel.
 *
 * Funciones puras (sin DB) para poder testearlas. El Excel tiene exactamente
 * las columnas de COLUMNAS_CUENTAS, en ese orden, en la primera hoja.
 * Modo "Actualizar": upsert por código, nunca borra.
 */

export type Familia = { codigo: number; nombre: string; nombreOriginal: string; letra: string; color: string }
export type Cuenta = { codigo: number; descripcion: string; familiaCodigo: number; letra: string }

export const COLUMNAS_CUENTAS = ['codigo', 'descripcion', 'familiaCodigo', 'letra'] as const
export const MAX_FILAS = 5000

export type ErrorFila = { fila: number; columna?: string; mensaje: string }

function vacia(r: unknown[]): boolean {
  return r.every(v => v === null || v === undefined || String(v).trim() === '')
}

function aEntero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return parseInt(v, 10)
  return null
}

/**
 * Valida encabezado + filas. `fila` en los errores es el número de fila del Excel
 * (encabezado = 1, primera fila de datos = 2).
 */
export function validarCargaCuentas(header: unknown[], rows: unknown[][], familias: Familia[]): { errores: ErrorFila[]; cuentas: Cuenta[] } {
  const errores: ErrorFila[] = []
  const h = (header ?? []).map(x => String(x ?? '').trim())
  while (h.length && h[h.length - 1] === '') h.pop()
  const esperado = COLUMNAS_CUENTAS.join(', ')
  if (h.length !== COLUMNAS_CUENTAS.length || h.some((c, i) => c !== COLUMNAS_CUENTAS[i])) {
    errores.push({ fila: 1, mensaje: `Columnas inválidas. Se esperan exactamente: ${esperado}. Recibidas: ${h.join(', ') || '(vacío)'}` })
    return { errores, cuentas: [] }
  }
  if (rows.length > MAX_FILAS) {
    errores.push({ fila: 0, mensaje: `Demasiadas filas (${rows.length}); máximo ${MAX_FILAS}` })
    return { errores, cuentas: [] }
  }

  const famPorCodigo = new Map(familias.map(f => [f.codigo, f]))
  const vistos = new Map<number, number>()
  const cuentas: Cuenta[] = []

  rows.forEach((r, i) => {
    const fila = i + 2
    if (!Array.isArray(r) || vacia(r)) return
    if (r.slice(COLUMNAS_CUENTAS.length).some(v => v !== null && v !== undefined && String(v).trim() !== '')) {
      errores.push({ fila, mensaje: 'Hay datos fuera de las 4 columnas' })
    }
    const [rc, rd, rf, rl] = r
    let ok = true
    const codigo = aEntero(rc)
    if (codigo === null || codigo <= 0) { errores.push({ fila, columna: 'codigo', mensaje: `Código debe ser entero positivo (valor: ${rc ?? ''})` }); ok = false }
    const descripcion = typeof rd === 'string' || typeof rd === 'number' ? String(rd).trim() : ''
    if (!descripcion) { errores.push({ fila, columna: 'descripcion', mensaje: 'Descripción vacía' }); ok = false }
    else if (descripcion.length > 200) { errores.push({ fila, columna: 'descripcion', mensaje: 'Descripción sobre 200 caracteres' }); ok = false }
    const familiaCodigo = aEntero(rf)
    const fam = familiaCodigo !== null ? famPorCodigo.get(familiaCodigo) : undefined
    if (!fam) { errores.push({ fila, columna: 'familiaCodigo', mensaje: `Familia ${rf ?? ''} no existe (válidas: ${familias.map(f => f.codigo).join(', ')})` }); ok = false }
    const letra = String(rl ?? '').trim().toUpperCase()
    if (fam && letra !== fam.letra) { errores.push({ fila, columna: 'letra', mensaje: `Letra "${letra}" no corresponde a la familia ${fam.codigo} (${fam.letra})` }); ok = false }
    if (fam && codigo !== null && Math.floor(codigo / 100) * 100 !== fam.codigo) {
      errores.push({ fila, columna: 'codigo', mensaje: `Código ${codigo} no pertenece a la familia ${fam.codigo}` }); ok = false
    }
    if (codigo !== null) {
      const prev = vistos.get(codigo)
      if (prev !== undefined) { errores.push({ fila, columna: 'codigo', mensaje: `Código ${codigo} duplicado (también en fila ${prev})` }); ok = false }
      else vistos.set(codigo, fila)
    }
    if (ok && fam && codigo !== null) cuentas.push({ codigo, descripcion, familiaCodigo: fam.codigo, letra: fam.letra })
  })

  if (!errores.length && !cuentas.length) errores.push({ fila: 2, mensaje: 'El archivo no tiene filas de datos' })
  return { errores, cuentas }
}

export type DiffCuentas = {
  nuevas: Cuenta[]
  modificadas: { antes: Cuenta; despues: Cuenta }[]
  sinCambio: number
  noIncluidas: number   // cuentas actuales que no vienen en el Excel (se mantienen)
}

export function diffCuentas(actuales: Cuenta[], entrantes: Cuenta[]): DiffCuentas {
  const act = new Map(actuales.map(c => [c.codigo, c]))
  const d: DiffCuentas = { nuevas: [], modificadas: [], sinCambio: 0, noIncluidas: 0 }
  const enExcel = new Set<number>()
  for (const c of entrantes) {
    enExcel.add(c.codigo)
    const a = act.get(c.codigo)
    if (!a) d.nuevas.push(c)
    else if (a.descripcion !== c.descripcion || a.familiaCodigo !== c.familiaCodigo || a.letra !== c.letra) d.modificadas.push({ antes: a, despues: c })
    else d.sinCambio++
  }
  d.noIncluidas = actuales.filter(c => !enExcel.has(c.codigo)).length
  return d
}

/** Upsert: aplica entrantes sobre actuales sin borrar nada. Ordenado por código. */
export function aplicarActualizar(actuales: Cuenta[], entrantes: Cuenta[]): Cuenta[] {
  const m = new Map(actuales.map(c => [c.codigo, c]))
  for (const c of entrantes) m.set(c.codigo, c)
  return [...m.values()].sort((a, b) => a.codigo - b.codigo)
}
