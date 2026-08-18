import type { EstadoPartida } from '../features/projects/types'

/** Campos mínimos para poder agregar un estado sobre un conjunto de partidas */
export interface AgregableEstado {
  ppto_original: number
  redistribuido: number
  ppto_vigente: number
  gasto_real: number
  proyeccion: number
}

/**
 * Estado de un conjunto de partidas (cuenta, familia u obra completa) a partir de sus totales.
 * Usa la misma escala que el estado por partida: la variación se mide sobre el Ppto Vigente.
 */
export function estadoAgregado(items: AgregableEstado[]): EstadoPartida {
  const vigente = items.reduce((s, x) => s + x.ppto_vigente, 0)
  const proy    = items.reduce((s, x) => s + x.proyeccion, 0)
  const real    = items.reduce((s, x) => s + x.gasto_real, 0)
  const ppto    = items.reduce((s, x) => s + x.ppto_original + x.redistribuido, 0)

  if (ppto === 0 && vigente === 0 && (real > 0 || proy > 0)) return 'SOLO REAL'
  if (vigente > 0 && real === 0 && proy === 0) return 'SIN EJECUCION'
  if (vigente === 0) return 'SIN EJECUCION'

  const pct = ((vigente - proy) / vigente) * 100
  if (pct < -10) return 'CRITICO'
  if (pct < -5)  return 'ALERTA'
  if (pct <= 5)  return 'EN CONTROL'
  return 'FAVORABLE'
}

/** Agrupa por una clave y devuelve el estado agregado de cada grupo. */
export function estadoPorGrupo<T extends AgregableEstado>(
  items: T[],
  key: (item: T) => string,
): Record<string, EstadoPartida> {
  const grupos = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const g = grupos.get(k) ?? []
    g.push(item)
    grupos.set(k, g)
  }
  const out: Record<string, EstadoPartida> = {}
  for (const [k, g] of grupos) out[k] = estadoAgregado(g)
  return out
}
