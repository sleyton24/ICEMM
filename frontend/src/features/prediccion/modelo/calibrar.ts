/**
 * Calibración de la curva característica.
 *
 * Misma receta que la sección 6 del informe de Esteban y que
 * `scripts/build_curvas_base.py`: ventana 2%–98% sobre el costo real
 * (cuentas 101–516 sin 421), colas repartidas con (C − 2%) / 96%, y las
 * detenciones declaradas fuera del eje de tiempo con su gasto conservado.
 *
 * La forma por defecto (lectura A) termina en 100% del costo real. La lectura
 * B es la misma forma multiplicada por real/CC, así que termina en real/CC.
 * La Beta se ajusta siempre sobre la lectura A: es la del Excel.
 *
 * Las series salen del consolidado 12:06. Cambiar `detenciones` en
 * `curva-gasto.config.json` recalibra sin volver a leer el Excel.
 */
import configJson from './curva-gasto.config.json'
import artefacto from './bundled/curvas-caracteristica.json'
import type { LecturaCurva } from './tipos'

export type { LecturaCurva }

export interface Detencion {
  obra: string
  /** Primer mes detenido, "YYYY-MM". */
  desde: string
  meses: number
}

export interface CurvaGastoConfig {
  lectura: LecturaCurva
  umbralInicio: number
  umbralTermino: number
  cuentas: { desde: number; hasta: number; excluir: number[] }
  detenciones: Detencion[]
}

export interface SerieGasto {
  nombre: string
  sheet: string
  m2: number
  plazo: number
  contrato: number
  costo_construccion: number
  meses: string[]
  gasto: number[]
}

export interface RegresionDuracion {
  intercepto: number
  /** Meses adicionales por cada 1.000 m². */
  pendientePorMilM2: number
  r2: number
  errorEstandar: number
}

export interface ObraCalibrada {
  nombre: string
  m2: number
  ti: number
  tt: number
  /** Duración calendario entre los umbrales, en meses. */
  D: number
  /** Duración sin las detenciones que caen dentro de la ventana. */
  Da: number
  costo_real: number
  costo_construccion: number
  /** costo_real / costo_construccion. */
  ejec_cc: number
  /** Lectura A: termina en 1. */
  curva: number[]
  /** Lectura B: la misma forma, termina en real/CC. */
  curvaSobreCC: number[]
}

export interface Calibracion {
  lectura: LecturaCurva
  alpha: number
  beta: number
  /** Promedio simple de real/CC. Es el factor del total en un proyecto nuevo. */
  ejecCC: number
  grid: number[]
  /** Promedio simple de las curvas en lectura A. */
  promedio: number[]
  /** Promedio simple de las curvas en lectura B. Termina en ejecCC. */
  promedioSobreCC: number[]
  /** Desviación estándar (poblacional) de la forma A, punto a punto. */
  desviacion: number[]
  duracion: RegresionDuracion
  sinDetencion: RegresionDuracion & { durOasisPlaza: number }
  durOasisPlaza: number
  obras: ObraCalibrada[]
  detenciones: Detencion[]
}

export const configCurva = configJson as CurvaGastoConfig
const SERIES = artefacto.series as SerieGasto[]

export function grilla(n = 41): number[] {
  return Array.from({ length: n }, (_, i) => i / (n - 1))
}

function cruce(acum: number[], umbral: number): number {
  let corrido = acum[0]
  for (let j = 1; j < acum.length; j++) {
    const prev = corrido
    corrido = Math.max(corrido, acum[j])
    if (corrido >= umbral - 1e-9 && corrido > prev + 1e-12) {
      return (j - 1) + (umbral - prev) / (corrido - prev)
    }
  }
  return acum.length - 1
}

function valorEn(acum: number[], t: number): number {
  if (t <= 0) return acum[0]
  if (t >= acum.length - 1) return acum[acum.length - 1]
  const j = Math.floor(t + 1e-12)
  const f = t - j
  return acum[j] * (1 - f) + acum[j + 1] * f
}

function solapa(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

function fusionar(pausas: [number, number][]): [number, number][] {
  if (pausas.length === 0) return []
  const orden = [...pausas].sort((p, q) => p[0] - q[0])
  const out: [number, number][] = [[orden[0][0], orden[0][1]]]
  for (let i = 1; i < orden.length; i++) {
    const [a0, a1] = orden[i]
    const ult = out[out.length - 1]
    if (a0 <= ult[1]) ult[1] = Math.max(ult[1], a1)
    else out.push([a0, a1])
  }
  return out
}

function pausasDe(serie: SerieGasto, detenciones: Detencion[]): [number, number][] {
  const pausas: [number, number][] = []
  for (const det of detenciones) {
    if (det.obra !== serie.nombre) continue
    const s0 = serie.meses.indexOf(det.desde)
    if (s0 < 0) {
      throw new Error(
        `${serie.nombre} no tiene el mes ${det.desde} en el registro; no se puede aplicar la detención.`,
      )
    }
    if (!(det.meses > 0)) throw new Error(`La detención de ${det.obra} tiene que durar al menos un mes.`)
    pausas.push([s0, s0 + det.meses])
  }
  return fusionar(pausas)
}

function curvaObra(
  serie: SerieGasto,
  detenciones: Detencion[],
  a: number,
  b: number,
  ngrid: number,
): ObraCalibrada {
  const gasto = serie.gasto
  const acum = [0]
  for (const x of gasto) acum.push(acum[acum.length - 1] + x)
  const total = acum[acum.length - 1]
  if (!(total > 0)) throw new Error(`${serie.nombre} quedó con costo real 0.`)
  const ti = cruce(acum, a * total)
  const tt = cruce(acum, b * total)
  const D = tt - ti
  const pausas = pausasDe(serie, detenciones)
  const dentro = pausas.reduce((s, [p0, p1]) => s + solapa(p0, p1, ti, tt), 0)
  const Da = D - dentro
  const grid = grilla(ngrid)
  const curva = grid.map(tau => {
    let queda = tau * Da
    let cursor = ti
    let t = ti
    let corto = false
    for (const [p0, p1] of pausas) {
      if (p1 <= cursor + 1e-12) continue
      if (p0 > cursor) {
        const tramo = p0 - cursor
        if (queda <= tramo + 1e-12) {
          t = cursor + queda
          corto = true
          break
        }
        queda -= tramo
        cursor = p1
      } else {
        cursor = Math.max(cursor, p1)
      }
    }
    if (!corto) t = cursor + queda
    const bruto = (valorEn(acum, t) - a * total) / ((b - a) * total)
    return Math.min(1, Math.max(0, bruto))
  })
  const ejec_cc = total / serie.costo_construccion
  return {
    nombre: serie.nombre,
    m2: serie.m2,
    ti, tt, D, Da,
    costo_real: total,
    costo_construccion: serie.costo_construccion,
    ejec_cc,
    curva,
    curvaSobreCC: curva.map(s => s * ejec_cc),
  }
}

function trapz(y: number[], x: number[]): number {
  let s = 0
  for (let i = 1; i < y.length; i++) s += (x[i] - x[i - 1]) * (y[i] + y[i - 1]) / 2
  return s
}

function promedioDe(curvas: number[][]): number[] {
  const n = curvas.length
  return curvas[0].map((_, j) => curvas.reduce((s, c) => s + c[j], 0) / n)
}

function desviacionDe(curvas: number[][], media: number[]): number[] {
  const n = curvas.length
  return media.map((m, j) => {
    const v = curvas.reduce((s, c) => s + (c[j] - m) ** 2, 0) / n
    return Math.sqrt(v)
  })
}

export function ajustarBeta(media: number[], grid: number[]): { alpha: number; beta: number } {
  const mu = trapz(media.map(s => 1 - s), grid)
  const varianza = 2 * trapz(grid.map((t, i) => t * (1 - media[i])), grid) - mu ** 2
  const k = (mu * (1 - mu)) / varianza - 1
  return { alpha: mu * k, beta: (1 - mu) * k }
}

export function regresionDuracion(m2: number[], duraciones: number[]): RegresionDuracion {
  const x = m2.map(v => v / 1000)
  const y = duraciones
  const xm = x.reduce((s, v) => s + v, 0) / x.length
  const ym = y.reduce((s, v) => s + v, 0) / y.length
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i] - xm) ** 2
    sxy += (x[i] - xm) * (y[i] - ym)
  }
  const pendientePorMilM2 = sxy / sxx
  const intercepto = ym - pendientePorMilM2 * xm
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < y.length; i++) {
    ssTot += (y[i] - ym) ** 2
    ssRes += (y[i] - (intercepto + pendientePorMilM2 * x[i])) ** 2
  }
  return {
    intercepto,
    pendientePorMilM2,
    r2: 1 - ssRes / ssTot,
    errorEstandar: Math.sqrt(ssRes / (y.length - 2)),
  }
}

export function calibrar(opciones: { detenciones?: Detencion[]; lectura?: LecturaCurva } = {}): Calibracion {
  const detenciones = opciones.detenciones ?? configCurva.detenciones
  const lectura = opciones.lectura ?? configCurva.lectura
  const a = configCurva.umbralInicio
  const b = configCurva.umbralTermino
  const grid = grilla()
  const obras = SERIES.map(s => curvaObra(s, detenciones, a, b, grid.length))
  const sin = SERIES.map(s => curvaObra(s, [], a, b, grid.length))
  const promedio = promedioDe(obras.map(o => o.curva))
  const { alpha, beta } = ajustarBeta(promedio, grid)
  const duracion = regresionDuracion(obras.map(o => o.m2), obras.map(o => o.Da))
  const sinDet = regresionDuracion(sin.map(o => o.m2), sin.map(o => o.Da))
  const opSin = sin.find(o => o.nombre === 'Oasis Plaza')
  const op = obras.find(o => o.nombre === 'Oasis Plaza')
  if (!op || !opSin) throw new Error('Oasis Plaza no está en las series del consolidado.')
  return {
    lectura,
    alpha,
    beta,
    ejecCC: obras.reduce((s, o) => s + o.ejec_cc, 0) / obras.length,
    grid,
    promedio,
    promedioSobreCC: promedioDe(obras.map(o => o.curvaSobreCC)),
    desviacion: desviacionDe(obras.map(o => o.curva), promedio),
    duracion,
    sinDetencion: { ...sinDet, durOasisPlaza: opSin.Da },
    durOasisPlaza: op.Da,
    obras,
    detenciones,
  }
}

let vigente: Calibracion | null = null

/** Calibración con `curva-gasto.config.json`. Se calcula una vez. */
export function modeloVigente(): Calibracion {
  if (!vigente) vigente = calibrar()
  return vigente
}
