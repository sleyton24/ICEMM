import type { ObraBase, ObraInput, ModoPesos } from './tipos'

/** Agrupa los tipos de obra para la distancia: hotel / casas / edificio. */
export function grupoTipo(t: string): 'hotel' | 'casas' | 'edificio' {
  if (/Hotel/i.test(t)) return 'hotel'
  if (/Casas/i.test(t)) return 'casas'
  return 'edificio'
}

/** 0 si coinciden; 0,35 mismo grupo; 1,6 si uno es hotel; 1,0 el resto. */
export function distTipo(a: string, b: string): number {
  const ga = grupoTipo(a), gb = grupoTipo(b)
  if (a === b) return 0
  if (ga === gb) return 0.35
  if (ga === 'hotel' || gb === 'hotel') return 1.6
  return 1.0
}

export interface ResultadoPesos {
  pesos: number[]
  /** Suma de exp(−d) antes de normalizar. Señal de cercanía a la base. */
  masa: number
}

/**
 * Pesos por similitud (paso 2 de docs/MODELO.md).
 *
 *   d   = dist_tipo + |ln(m2p/m2o)| + 0,5·|ln(contratop/contratoo)|
 *         + max(0, (anio_objetivo − anio_fin)/10 · k_recencia)
 *   w_o = exp(−d), normalizados a suma 1.
 *
 * Se devuelve además la masa SIN normalizar: los pesos normalizados suman 1
 * siempre, incluso para una obra que no se parece a ninguna de las 8, así que
 * la masa es lo único que distingue una proyección apoyada en comparables de
 * una extrapolación.
 */
export function pesos(
  p: Pick<ObraInput, 'tipo' | 'm2' | 'contrato' | 'inicio'>,
  obras: ObraBase[],
  opts: { modo?: ModoPesos; kRecencia?: number; activas?: string[] } = {},
): ResultadoPesos {
  const modo = opts.modo ?? 'simil'
  const kRec = opts.kRecencia ?? 1.0
  const activas = opts.activas
  const anioObj = Number(p.inicio.slice(0, 4))

  const crudos = obras.map(o => {
    if (activas && !activas.includes(o.nombre)) return 0
    if (modo === 'igual') return 1
    if (modo === 'recientes') return o.anio_fin >= 2024 ? 1 : 0
    const dT = distTipo(p.tipo, o.tipo)
    const dM = Math.abs(Math.log(p.m2 / o.m2))
    const dP = Math.abs(Math.log(p.contrato / o.contrato)) * 0.5
    const dA = ((anioObj - o.anio_fin) / 10) * kRec
    return Math.exp(-(dT + dM + dP + Math.max(0, dA)))
  })

  const s = crudos.reduce((a, b) => a + b, 0)
  if (s > 0) return { pesos: crudos.map(x => x / s), masa: s }

  // Ninguna obra activa aporta peso: reparto uniforme entre las activas.
  const nActivas = obras.filter(o => !activas || activas.includes(o.nombre)).length
  return {
    pesos: obras.map(o => (!activas || activas.includes(o.nombre)) && nActivas > 0 ? 1 / nActivas : 0),
    masa: 0,
  }
}
