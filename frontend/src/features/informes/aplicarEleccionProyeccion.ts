import type { EstadoPartida } from '../projects/types'

export type FuenteProyeccion = 'presto' | 'modelo'
export type CurvaElegida = 'tipica' | 'reanclada'

/**
 * Lo mínimo que el informe necesita para reemplazar el proyectado de una cuenta.
 * La fila completa (cierres, serie, autor) vive en `EleccionProyeccion`.
 */
export interface EleccionCuenta {
  codigoCuenta: string
  fuente: FuenteProyeccion
  curva: CurvaElegida | null
  cierreTipica: number | null
  cierreReanclada: number | null
}

export interface PuntoCurvaInforme {
  ym: string
  acumTipica: number
  acumReanclada: number | null
}

/** Fila persistida. Sin fila, o con fuente Presto, el informe no cambia. */
export interface EleccionProyeccionDTO extends EleccionCuenta {
  id: string
  projectId: string
  serie: PuntoCurvaInforme[] | null
  obrasReferencia: string[]
  pasadoPor: string | null
  pasadoEn: string | null
  elegidoPor: string | null
  elegidoEn: string | null
}

export interface PartidaAjustable {
  codigo: string
  codigo2: string
  ppto_original: number
  redistribuido: number
  ppto_vigente: number
  gasto_real: number
  proyeccion: number
  variacion_uf: number
  variacion_pct: number | null
  ytg: number
  estado: EstadoPartida
  /** Proyectado Presto, presente solo en las partidas que el modelo reemplazó. */
  proyeccionPresto?: number
}

function calcEstado(p: {
  ppto_original: number
  redistribuido: number
  ppto_vigente: number
  gasto_real: number
  proyeccion: number
  variacion_pct: number | null
}): EstadoPartida {
  if (p.ppto_original === 0 && p.redistribuido === 0 && p.ppto_vigente === 0 && (p.gasto_real > 0 || p.proyeccion > 0)) {
    return 'SOLO REAL'
  }
  if (p.ppto_vigente > 0 && p.gasto_real === 0 && p.proyeccion === 0) return 'SIN EJECUCION'
  const pct = p.variacion_pct
  if (pct === null) return 'SIN EJECUCION'
  if (pct < -10) return 'CRITICO'
  if (pct < -5) return 'ALERTA'
  if (pct <= 5) return 'EN CONTROL'
  return 'FAVORABLE'
}

function cierreElegido(e: EleccionCuenta): number | null {
  if (e.fuente !== 'modelo') return null
  const n = e.curva === 'reanclada' ? e.cierreReanclada : e.cierreTipica
  return n != null && Number.isFinite(n) ? n : null
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Reparte `objetivo` en proporción a `montos`. El último tramo absorbe el
 * redondeo para que la suma cierre exactamente en centavos.
 * Si todo es 0, el monto cae en `indiceResidual` (la partida con más gasto).
 */
export function repartirCierre(montos: number[], objetivo: number, indiceResidual = 0): number[] {
  const obj = r2(objetivo)
  const suma = montos.reduce((s, n) => s + n, 0)
  if (!(suma > 0)) {
    return montos.map((_, i) => (i === indiceResidual ? obj : 0))
  }
  const factor = obj / suma
  const out: number[] = []
  let acum = 0
  montos.forEach((m, i) => {
    if (i === montos.length - 1) out.push(r2(obj - acum))
    else {
      const v = r2(m * factor)
      acum += v
      out.push(v)
    }
  })
  return out
}

function conDerivados<T extends PartidaAjustable>(p: T, proyeccion: number): T {
  const variacion_uf = r2(p.ppto_vigente - proyeccion)
  const variacion_pct = p.ppto_vigente !== 0 ? r2((variacion_uf / p.ppto_vigente) * 100) : null
  const ytg = r2(proyeccion - p.gasto_real)
  const next = {
    ...p,
    proyeccion,
    proyeccionPresto: p.proyeccion,
    variacion_uf,
    variacion_pct,
    ytg,
    estado: p.estado,
  }
  next.estado = calcEstado(next)
  return next
}

/**
 * Si la cuenta está en Presto —o no hay elección— devuelve el mismo arreglo:
 * el informe queda idéntico al de hoy. Si está en el modelo, las partidas de
 * esa cuenta pasan a sumar el cierre elegido y se recalculan variación y
 * saldo por gastar (proyección − gastado). El resto de las cuentas no se toca.
 */
export function aplicarEleccionProyeccion<T extends PartidaAjustable>(
  partidas: T[],
  elecciones: EleccionCuenta[],
): T[] {
  const porCuenta = new Map<string, number>()
  for (const e of elecciones) {
    const cierre = cierreElegido(e)
    if (cierre != null) porCuenta.set(e.codigoCuenta, cierre)
  }
  if (porCuenta.size === 0) return partidas

  const grupos = new Map<string, number[]>()
  partidas.forEach((p, i) => {
    if (p.codigo.includes('__orig')) return
    if (!porCuenta.has(p.codigo2)) return
    const g = grupos.get(p.codigo2) ?? []
    g.push(i)
    grupos.set(p.codigo2, g)
  })
  if (grupos.size === 0) return partidas

  const out = partidas.slice()
  for (const [cc, idxs] of grupos) {
    const objetivo = porCuenta.get(cc)!
    let residual = 0
    for (let k = 1; k < idxs.length; k++) {
      if (out[idxs[k]].gasto_real > out[idxs[residual]].gasto_real) residual = k
    }
    const montos = repartirCierre(idxs.map(i => out[i].proyeccion), objetivo, residual)
    idxs.forEach((i, k) => {
      out[i] = conDerivados(out[i], montos[k])
    })
  }
  return out
}
