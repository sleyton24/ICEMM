import type { CargaERP } from '../../projects/types'
import type { PlanCuentas } from '../../plan-cuentas/types'
import type { SerieRealMensual } from '../modelo/tipos'
import { sumarMeses } from '../modelo/curva'
import { esOficinaCentral } from '../../plan-cuentas/oficinaCentral'
import { esRollupFamilia } from '../../plan-cuentas/rollupFamilia'
import { familiaDeCuenta, FAMILIAS_MODELO } from '../modelo/familias'

/**
 * Familia 600 (OTROS). No entra a la curva de la obra completa: 605 es
 * Utilidad y 604 Provisión de Postventa, y las cinco curvas de costo ya
 * suman 1. Sí se conserva por cuenta y por familia, para que el selector de
 * Proyección pueda mostrar el real de esas cuentas.
 *
 * Consecuencia visible: el total de `serie` no coincide con el KPI
 * "Gasto Real Total" del dashboard. La diferencia va en `excluido`.
 */
const FAMILIA_OTROS = 600

function esFamiliaOtros(cc: number, plan: PlanCuentas): boolean {
  const cuenta = plan.cuentas.find(c => c.codigo === cc)
  const familia = cuenta ? cuenta.familiaCodigo : Math.floor(cc / 100) * 100
  return familia === FAMILIA_OTROS
}

export interface SerieRealResultado {
  serie: SerieRealMensual[]
  /**
   * La misma serie desagregada por familia del modelo, sobre EL MISMO rango de
   * meses que `serie`. Comparten el eje: así el gráfico de una familia arranca
   * en el mismo mes que el de la obra y los meses siguen alineados por posición,
   * que es como el re-pronóstico indexa.
   */
  porFamilia: Record<string, SerieRealMensual[]>
  /**
   * Y otra vez, un nivel más abajo: por código de cuenta, sobre el mismo rango
   * de meses. Las 900 y las contrapartidas de rollup quedan afuera. La familia
   * 600 no entra al total de la obra, pero sí queda en esta serie por cuenta.
   */
  porCuenta: Record<string, SerieRealMensual[]>
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
  const porMesFamilia = new Map<string, Map<string, number>>()
  const porMesCuenta = new Map<string, Map<string, number>>()
  for (const f of FAMILIAS_MODELO) porMesFamilia.set(f.clave, new Map())

  for (const [ccStr, mesMap] of Object.entries(porCcMes)) {
    const cc = Number(ccStr)
    for (const [mes, vals] of Object.entries(mesMap)) {
      if (opciones.cutoffMes && mes > opciones.cutoffMes) continue

      if (esOficinaCentral(cc, plan)) { excluido.oficinaCentral += vals.monto_uf; continue }
      if (esRollupFamilia(cc)) { excluido.rollup += vals.monto_uf; continue }
      if (esFamiliaOtros(cc, plan)) {
        excluido.otros += vals.monto_uf
        const mf = porMesFamilia.get('otros')
        if (mf) mf.set(mes, (mf.get(mes) ?? 0) + vals.monto_uf)
        let mc = porMesCuenta.get(ccStr)
        if (!mc) { mc = new Map(); porMesCuenta.set(ccStr, mc) }
        mc.set(mes, (mc.get(mes) ?? 0) + vals.monto_uf)
        continue
      }

      porMes.set(mes, (porMes.get(mes) ?? 0) + vals.monto_uf)

      const fam = familiaDeCuenta(cc, plan)
      if (fam) {
        const m = porMesFamilia.get(fam.clave)!
        m.set(mes, (m.get(mes) ?? 0) + vals.monto_uf)
      }

      let mc = porMesCuenta.get(ccStr)
      if (!mc) { mc = new Map(); porMesCuenta.set(ccStr, mc) }
      mc.set(mes, (mc.get(mes) ?? 0) + vals.monto_uf)
    }
  }

  if (porMes.size === 0) {
    const vacio: Record<string, SerieRealMensual[]> = {}
    for (const f of FAMILIAS_MODELO) vacio[f.clave] = []
    return { serie: [], porFamilia: vacio, porCuenta: {}, inicio: null, corte: null, excluido, advertencias }
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

  // Cada familia se acumula sobre el MISMO rango de meses que la serie total.
  const porFamilia: Record<string, SerieRealMensual[]> = {}
  for (const f of FAMILIAS_MODELO) {
    const m = porMesFamilia.get(f.clave)!
    let acumF = 0
    porFamilia[f.clave] = serie.map(({ ym }) => {
      const mes = m.get(ym) ?? 0
      acumF += mes
      return { ym, mes, acum: acumF }
    })
  }

  // Cada cuenta, sobre el mismo eje. El re-pronóstico indexa por posición, así
  // que todas las series tienen que compartir el rango o se desalinean.
  const porCuenta: Record<string, SerieRealMensual[]> = {}
  for (const [cod, m] of porMesCuenta) {
    let acumC = 0
    porCuenta[cod] = serie.map(({ ym }) => {
      const mes = m.get(ym) ?? 0
      acumC += mes
      return { ym, mes, acum: acumC }
    })
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
      `La familia OTROS (${excluido.otros.toFixed(2)} UF) no entra a la curva de la obra completa: ` +
      'incluye Utilidad y Provisión de Postventa, que no son costo de construcción. Por eso este ' +
      'total no coincide con el KPI "Gasto Real Total". Las cuentas 600 se ven igual en Proyección.'
    )
  }

  return { serie, porFamilia, porCuenta, inicio, corte, excluido, advertencias }
}
