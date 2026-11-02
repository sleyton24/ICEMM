import type {
  ObraInput,
  OpcionesProyeccion,
  Proyeccion,
  PuntoMensual,
} from './tipos'
import { curvasBase, FAMILIAS_MODELO } from './curvasBase'
import { sumarMeses, skewT } from './curva'
import { betaCdf } from './beta'
import { modeloVigente, type LecturaCurva } from './calibrar'

/** Percentil 90 de la normal estándar. La misma convención que la mezcla por similitud. */
const Z90 = 1.2816

function interpGrid(arr: number[], t: number): number {
  const x = Math.max(0, Math.min(1, t)) * (arr.length - 1)
  const i = Math.floor(x)
  const f = x - i
  return arr[i] + (arr[Math.min(i + 1, arr.length - 1)] - arr[i]) * f
}

/**
 * Proyección con la curva característica (Beta) y la duración por m².
 *
 * El total es Costo Construcción × (real/CC) de las 8 obras. La lectura A
 * reparte ese total con F(τ). La lectura B expresa el acumulado sobre el
 * Costo Construcción, y cierra en real/CC.
 *
 * Una detención prevista se agrega al calendario: esos meses quedan en cero
 * y el resto de la curva se corre. No entra en la duración estimada.
 */
export function proyectarCaracteristica(obra: ObraInput, opciones: OpcionesProyeccion = {}): Proyeccion {
  if (!(obra.m2 > 0)) throw new Error('m2 debe ser mayor que 0')
  if (!(obra.contrato > 0)) throw new Error('El monto de contrato debe ser mayor que 0')
  if (!/^\d{4}-\d{2}$/.test(obra.inicio)) throw new Error(`inicio debe ser "YYYY-MM", se recibió "${obra.inicio}"`)

  const cal = modeloVigente()
  const lectura: LecturaCurva = opciones.lectura ?? cal.lectura
  const skew = opciones.skew ?? 0
  const tieneCC = obra.costoConstruccion != null && obra.costoConstruccion > 0
  const ancla = tieneCC ? obra.costoConstruccion! : obra.contrato
  const ejec = opciones.ejec ?? cal.ejecCC
  const estimado = cal.duracion.intercepto + cal.duracion.pendientePorMilM2 * (obra.m2 / 1000)
  const N = Math.max(1, Math.round(opciones.duracionMeses ?? estimado))

  const cierreSobreAncla = lectura === 'B' ? cal.promedioSobreCC[cal.promedioSobreCC.length - 1] : ejec
  const total = ancla * cierreSobreAncla

  const sdE = Math.sqrt(cal.obras.reduce((s, o) => s + (o.ejec_cc - cal.ejecCC) ** 2, 0) / cal.obras.length)

  const mix: Record<string, number> = {}
  for (const f of FAMILIAS_MODELO) {
    mix[f] = curvasBase.obras.reduce((s, o) => s + o.fam[f].share, 0) / curvasBase.obras.length
  }

  const det = opciones.detencion
  if (det && (!/^\d{4}-\d{2}$/.test(det.desde) || !(det.meses > 0))) {
    throw new Error('La detención prevista necesita desde "YYYY-MM" y una cantidad de meses mayor que 0.')
  }
  const detHasta = det ? sumarMeses(det.desde, det.meses) : null

  const slots: { ym: string; k: number | null }[] = []
  let ym = obra.inicio
  let producidos = 0
  let guardia = 0
  const tope = N + (det?.meses ?? 0) + 1
  while (producidos < N && guardia < tope) {
    const congelado = Boolean(det && detHasta && ym >= det.desde && ym < detHasta)
    if (congelado) slots.push({ ym, k: null })
    else slots.push({ ym, k: ++producidos })
    ym = sumarMeses(ym, 1)
    guardia++
  }

  const formaEn = (t: number): number => {
    if (lectura === 'B') {
      const sobre = interpGrid(cal.promedioSobreCC, t)
      return cierreSobreAncla > 0 ? sobre / cierreSobreAncla : 0
    }
    return betaCdf(cal.alpha, cal.beta, t)
  }

  const meses: PuntoMensual[] = []
  let tPrevio = 0
  for (let j = 0; j < slots.length; j++) {
    const slot = slots[j]
    const t = slot.k == null ? tPrevio : skewT(slot.k / N, skew)
    if (slot.k != null) tPrevio = t
    const forma = formaEn(t)
    const sd = interpGrid(cal.desviacion, t)
    meses.push({
      i: j + 1,
      ym: slot.ym,
      mes: 0,
      acum: total * forma,
      pctAcum: 0,
      curvaMezclada: forma,
      p10: Math.max(0, Math.min(1, forma - Z90 * sd)),
      p90: Math.max(0, Math.min(1, forma + Z90 * sd)),
      familias: {},
      familiasMes: {},
    })
  }
  meses.forEach((r, idx) => {
    const prev = idx ? meses[idx - 1].acum : 0
    r.mes = r.acum - prev
    // Lectura A: el % es del total proyectado (cierra en 100%).
    // Lectura B: el % es del Costo Construcción (cierra en real/CC).
    r.pctAcum = lectura === 'B' ? r.acum / ancla : r.acum / total
  })

  const advertencias: string[] = []
  if (!tieneCC) {
    advertencias.push(
      'Esta obra no tiene Costo Construcción (columna Q). El total usa el monto de contrato como ancla, ' +
      'multiplicado por el real/CC histórico.',
    )
  }
  if (det) {
    advertencias.push(
      `Se agregan ${det.meses} meses de detención desde ${det.desde}: el gasto de la curva se corre y esos meses quedan en cero.`,
    )
  }

  return {
    obra,
    opciones: {
      lead: 0,
      skew,
      modoPesos: opciones.modoPesos ?? 'simil',
      kRecencia: opciones.kRecencia ?? 1,
      modoModelo: 'caracteristica',
      lectura,
    },
    modoModelo: 'caracteristica',
    lectura,
    ancla,
    anclaOrigen: tieneCC ? 'costo_construccion' : 'contrato',
    duracionError: cal.duracion.errorEstandar,
    total,
    ejec,
    ejecAuto: cal.ejecCC,
    rdur: obra.plazo > 0 ? N / obra.plazo : 1,
    rdurAuto: obra.plazo > 0 ? estimado / obra.plazo : 1,
    N,
    NT: meses.length,
    sdE,
    mix,
    familia: null,
    cuenta: null,
    obrasDeLaCuenta: null,
    meses,
    comparables: curvasBase.obras.map(o => ({
      nombre: o.nombre,
      peso: 1 / curvasBase.obras.length,
      tipo: o.tipo,
      m2: o.m2,
      contrato: o.contrato,
      anio_fin: o.anio_fin,
    })),
    masaSimilitud: curvasBase.obras.length,
    advertencias,
  }
}
