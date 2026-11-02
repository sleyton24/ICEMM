/**
 * Conciliacion de una carga del ERP: el total del archivo (suma de TODAS las
 * filas de la unidad, es decir, lo que suma el Excel) tiene que ser igual al
 * total cargado mas lo descartado, y todo lo descartado tiene que tener un motivo
 * conocido. Si no, la app se va a descuadrar contra el Excel sin que nadie lo vea.
 *
 * Es una funcion pura: no toca la UI. El resultado se registra en la consola del
 * navegador y se manda al backend, que lo deja en su log (ver README de carga ERP).
 */

export type MotivoDescarte = 'oficina_central' | 'rollup_familia'

export type DescarteConciliacion = { motivo: MotivoDescarte; filas: number; uf: number }

export type Conciliacion = {
  unidadNegocioCodigo: number
  filasArchivo: number
  /** Suma de todas las filas de la unidad en el archivo (lo que suma el Excel). */
  totalArchivoUF: number
  filasCargadas: number
  totalCargadoUF: number
  descartes: DescarteConciliacion[]
  totalDescartadoUF: number
  /** totalArchivo - (cargado + descartado). Debe ser ~0. */
  diferenciaUF: number
  /** Informativo: traspasos a costo de venta (100-500) que SI se cargaron. */
  traspasoCostoVenta: { filas: number; uf: number }
  /** Filas sin codigo de cuenta valido: se cargan, pero caen en "sin partida". */
  filasSinCodigo: number
  nivel: 'ok' | 'aviso'
  avisos: string[]
}

/** Diferencia tolerada por redondeo de punto flotante (UF). */
export const TOLERANCIA_UF = 0.05
/** Si lo descartado supera este % del total del archivo, se avisa en el log. */
export const UMBRAL_DESCARTE_PCT = 1

const r2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => r2(n).toFixed(2)

export type EntradaConciliacion = {
  unidadNegocioCodigo: number
  filasArchivo: number
  totalArchivoUF: number
  filasCargadas: number
  totalCargadoUF: number
  oficinaCentral: { filas: number; uf: number }
  rollupFamilia: { filas: number; uf: number }
  traspasoCostoVenta: { filas: number; uf: number }
  filasSinCodigo: number
}

export function construirConciliacion(e: EntradaConciliacion): Conciliacion {
  const descartes: DescarteConciliacion[] = []
  if (e.oficinaCentral.filas > 0) descartes.push({ motivo: 'oficina_central', filas: e.oficinaCentral.filas, uf: r2(e.oficinaCentral.uf) })
  if (e.rollupFamilia.filas > 0) descartes.push({ motivo: 'rollup_familia', filas: e.rollupFamilia.filas, uf: r2(e.rollupFamilia.uf) })

  const totalDescartadoUF = descartes.reduce((s, d) => s + d.uf, 0)
  const diferenciaUF = e.totalArchivoUF - (e.totalCargadoUF + totalDescartadoUF)

  const avisos: string[] = []

  if (Math.abs(diferenciaUF) > TOLERANCIA_UF) {
    avisos.push(
      `El total del archivo (${fmt(e.totalArchivoUF)} UF) no es igual a lo cargado (${fmt(e.totalCargadoUF)} UF) ` +
      `mas lo descartado (${fmt(totalDescartadoUF)} UF): faltan ${fmt(diferenciaUF)} UF de filas sin motivo conocido.`
    )
  }

  const rollup = descartes.find(d => d.motivo === 'rollup_familia')
  if (rollup) {
    avisos.push(
      `${rollup.filas} fila(s) con codigo de familia (100-500) y sin glosa "COSTO DE VENTA" se descartaron por ` +
      `${fmt(rollup.uf)} UF: el total de la app va a diferir del Excel en esa cantidad. Verificar el comprobante.`
    )
  }

  const pct = e.totalArchivoUF !== 0 ? (Math.abs(totalDescartadoUF) / Math.abs(e.totalArchivoUF)) * 100 : 0
  if (pct > UMBRAL_DESCARTE_PCT) {
    avisos.push(
      `Lo descartado (${fmt(totalDescartadoUF)} UF) es el ${pct.toFixed(1)} % del total del archivo ` +
      `(${fmt(e.totalArchivoUF)} UF), sobre el umbral de ${UMBRAL_DESCARTE_PCT} %.`
    )
  }

  if (e.filasSinCodigo > 0) {
    avisos.push(`${e.filasSinCodigo} fila(s) sin codigo de cuenta valido se cargaron como cuenta 0 (caen en "sin partida").`)
  }

  return {
    unidadNegocioCodigo: e.unidadNegocioCodigo,
    filasArchivo: e.filasArchivo,
    totalArchivoUF: r2(e.totalArchivoUF),
    filasCargadas: e.filasCargadas,
    totalCargadoUF: r2(e.totalCargadoUF),
    descartes,
    totalDescartadoUF: r2(totalDescartadoUF),
    diferenciaUF: r2(diferenciaUF),
    traspasoCostoVenta: { filas: e.traspasoCostoVenta.filas, uf: r2(e.traspasoCostoVenta.uf) },
    filasSinCodigo: e.filasSinCodigo,
    nivel: avisos.length > 0 ? 'aviso' : 'ok',
    avisos,
  }
}

/**
 * Deja la conciliacion en la consola del navegador. No muestra nada en pantalla.
 */
export function registrarConciliacion(c: Conciliacion, nombreArchivo: string): void {
  const resumen =
    `[conciliacion-erp] ${nombreArchivo} unidad ${c.unidadNegocioCodigo}: archivo ${c.totalArchivoUF} UF = ` +
    `cargado ${c.totalCargadoUF} + descartado ${c.totalDescartadoUF} (dif ${c.diferenciaUF})`
  if (c.nivel === 'aviso') console.warn(resumen, c.avisos, c.descartes)
  else console.info(resumen, c.descartes)
}
