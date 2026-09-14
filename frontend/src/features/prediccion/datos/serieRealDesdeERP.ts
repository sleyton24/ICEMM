import type { CargaERP } from '../../projects/types'
import type { PlanCuentas } from '../../plan-cuentas/types'
import type { SerieRealMensual } from '../modelo/tipos'
import { sumarMeses } from '../modelo/curva'
import { esOficinaCentral } from '../../plan-cuentas/oficinaCentral'
import { esRollupFamilia } from '../../plan-cuentas/rollupFamilia'

/**
 * Familia 600 (OTROS). Queda FUERA del perímetro del predictor: 605 es
 * Utilidad y 604 Provisión de Postventa, que no son costo de construcción, y
 * las 8 obras base no tienen bloque 600 — sus cinco curvas de familia suman 1.
 *
 * Consecuencia visible: el total de esta serie no coincide con el KPI
 * "Gasto Real Total" del dashboard. La diferencia va en `excluido` para que la
 * pantalla pueda declararla en vez de dejar al usuario descuadrando solo.
 */
const FAMILIA_OTROS = 600

function esFueraDePerimetro(cc: number, plan: PlanCuentas): boolean {
  if (esOficinaCentral(cc, plan) || esRollupFamilia(cc)) return true
  const cuenta = plan.cuentas.find(c => c.codigo === cc)
  const familia = cuenta ? cuenta.familiaCodigo : Math.floor(cc / 100) * 100
  return familia === FAMILIA_OTROS
}

export interface SerieRealResultado {
  serie: SerieRealMensual[]
  /** Primer mes con costo dentro del perímetro. Es el `inicio` del modelo. */
  inicio: string | null
  /** Último mes incluido. */
  corte: string | null
  /** UF dejadas fuera del perímetro, por motivo. */
  excluido: { oficinaCentral: number; rollup: number; otros: number }
  advertencias: string[]
}

/**
 * Construye la serie mensual real que consume el re-pronóstico, a partir del
 * agregado por centro de costo y mes que ya calcula ICEMM al cargar el ERP.
 *
 * Dos cosas que hay que hacer bien y son fáciles de pasar por alto:
 *
 * 1. `agregadoPorCcostoPorMes` es un mapa DISPERSO: solo tiene claves de meses
 *    con movimiento. El re-pronóstico indexa la serie por posición, así que un
 *    mes sin transacciones que simplemente no exista corre todo el tramo pasado
 *    un lugar y el re-ancla lee el real equivocado, sin ningún error visible.
 *    Acá se genera el rango completo entre inicio y corte, rellenando con 0.
 *
 * 2. El mes de ICEMM sale de "Fecha contable"; el extractor del paquete del
 *    modelo usa las columnas año/mes. Son períodos distintos y los documentos
 *    cuyo mes contable no coincide caen en otro balde. Se usa la base de ICEMM
 *    a propósito —es la que alimenta el resto de la app— y queda declarado acá.
 */
export function serieRealDesdeERP(
  erp: CargaERP,
  plan: PlanCuentas,
  opciones: { cutoffMes?: string | null } = {},
): SerieRealResultado {
  const porCcMes = erp.agregadoPorCcostoPorMes ?? {}
  const advertencias: string[] = []
  const excluido = { oficinaCentral: 0, rollup: 0, otros: 0 }

  const porMes = new Map<string, number>()

  for (const [ccStr, mesMap] of Object.entries(porCcMes)) {
    const cc = Number(ccStr)
    for (const [mes, vals] of Object.entries(mesMap)) {
      if (opciones.cutoffMes && mes > opciones.cutoffMes) continue

      if (esOficinaCentral(cc, plan)) { excluido.oficinaCentral += vals.monto_uf; continue }
      if (esRollupFamilia(cc)) { excluido.rollup += vals.monto_uf; continue }
      if (esFueraDePerimetro(cc, plan)) { excluido.otros += vals.monto_uf; continue }

      porMes.set(mes, (porMes.get(mes) ?? 0) + vals.monto_uf)
    }
  }

  if (porMes.size === 0) {
    return { serie: [], inicio: null, corte: null, excluido, advertencias }
  }

  const conMovimiento = [...porMes.keys()].sort()
  const inicio = conMovimiento[0]
  const corte = conMovimiento[conMovimiento.length - 1]

  // Rango completo, con los huecos en 0
  const serie: SerieRealMensual[] = []
  let acum = 0
  let huecos = 0
  for (let ym = inicio; ; ym = sumarMeses(ym, 1)) {
    const mes = porMes.get(ym) ?? 0
    if (!porMes.has(ym)) huecos++
    acum += mes
    serie.push({ ym, mes, acum })
    if (ym === corte) break
  }

  if (huecos > 0) {
    advertencias.push(
      `${huecos} mes(es) entre ${inicio} y ${corte} no tienen movimiento; se rellenaron con 0 ` +
      'para que la serie quede contigua.'
    )
  }
  if (excluido.rollup !== 0) {
    advertencias.push(
      `Se dejaron fuera ${excluido.rollup.toFixed(2)} UF de contrapartidas de rollup por familia. ` +
      'Si este proyecto se cargó antes del filtro, conviene volver a subir el archivo del ERP.'
    )
  }
  if (excluido.otros !== 0) {
    advertencias.push(
      `La familia OTROS (${excluido.otros.toFixed(2)} UF) queda fuera del perímetro del predictor: ` +
      'incluye Utilidad y Provisión de Postventa, que no son costo de construcción. Por eso este ' +
      'total no coincide con el KPI "Gasto Real Total".'
    )
  }

  return { serie, inicio, corte, excluido, advertencias }
}
