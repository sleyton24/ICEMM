import type {
  ObraInput,
  OpcionesProyeccion,
  Proyeccion,
  PuntoMensual,
  Comparable,
} from './tipos'
import { curvasBase, GRID, FAMILIAS_MODELO } from './curvasBase'
import { pesos } from './similitud'
import { interp, interpA, skewT, sumarMeses } from './curva'

/** Percentil 90 de la normal estándar. Ver la nota sobre la banda, más abajo. */
const Z90 = 1.2816

/** Bajo esta masa de similitud, la obra no se parece a nada de la base. */
const MASA_MINIMA = 0.6

/**
 * Proyecta la curva de costo mes a mes (pasos 2 a 5 de docs/MODELO.md).
 *
 * Es un port fiel del prototipo: reproduce su serie mensual dentro de 1 UF,
 * verificado en paridad.test.ts contra un patrón generado ejecutando el núcleo
 * original. Las únicas diferencias deliberadas están comentadas donde ocurren.
 */
export function proyectar(obra: ObraInput, opciones: OpcionesProyeccion = {}): Proyeccion {
  if (!(obra.m2 > 0)) throw new Error('m2 debe ser mayor que 0')
  if (!(obra.contrato > 0)) throw new Error('El monto de contrato debe ser mayor que 0')
  if (!(obra.plazo > 0)) throw new Error('El plazo debe ser mayor que 0')
  if (!/^\d{4}-\d{2}$/.test(obra.inicio)) throw new Error(`inicio debe ser "YYYY-MM", se recibió "${obra.inicio}"`)

  const lead = Math.max(0, Math.round(opciones.lead ?? 0))
  const skew = opciones.skew ?? 0
  const modoPesos = opciones.modoPesos ?? 'simil'
  const kRecencia = opciones.kRecencia ?? 1.0

  const familia = opciones.familia ?? null
  if (familia && !FAMILIAS_MODELO.includes(familia)) {
    throw new Error(
      `Familia desconocida "${familia}". El modelo solo tiene curva para: ${FAMILIAS_MODELO.join(', ')}.`,
    )
  }

  const OB = curvasBase.obras
  const { pesos: w, masa } = pesos(obra, OB, {
    modo: modoPesos,
    kRecencia,
    activas: opciones.obrasActivas,
  })

  /** Promedio ponderado sobre las obras base. */
  const acum = (f: (o: typeof OB[number], i: number) => number) =>
    OB.reduce((a, o, i) => a + w[i] * f(o, i), 0)

  // ── Paso 3: parámetros agregados ────────────────────────────────────────
  const ejecAuto = acum(o => o.ejec)
  const rdurAuto = acum(o => o.ratio_dur)
  const ejec = opciones.ejec ?? ejecAuto
  const rdur = opciones.rdur ?? rdurAuto

  const N = Math.max(2, Math.round(obra.plazo * rdur))
  const NT = N + lead
  const total = obra.contrato * ejec

  const sdE = Math.sqrt(acum(o => Math.pow(o.ejec - ejecAuto, 2)))

  // ── Paso 4: curva mezclada y dispersión ─────────────────────────────────
  // En modo familia se usan la curva y la dispersión DE ESA FAMILIA, que el
  // artefacto trae por obra. No es la curva de la obra reescalada: cada
  // familia tiene su propio calendario (Materiales gasta al 39% del ciclo,
  // Subcontratos al 53%), y ese desfase es justamente lo que se quiere ver.
  const curvaDe = (o: typeof OB[number]) => (familia ? o.fam[familia].curva : o.curva_s)
  const cs = GRID.map((_, g) => acum(o => curvaDe(o)[g]))
  const sd = GRID.map((_, g) => Math.sqrt(acum(o => Math.pow(curvaDe(o)[g] - cs[g], 2))))

  const mix: Record<string, number> = {}
  const fcur: Record<string, number[]> = {}
  for (const f of FAMILIAS_MODELO) {
    mix[f] = acum(o => o.fam[f].share)
    fcur[f] = GRID.map((_, g) => acum(o => o.fam[f].curva[g]))
  }

  // El total a repartir: la obra entera, o lo que le toca a la familia.
  const totalCurva = familia ? total * mix[familia] : total
  // En modo familia solo se recorre esa clave, así no hay que reconciliar nada.
  const clavesFamilia = familia ? [familia] : FAMILIAS_MODELO

  // ── Paso 5: serie mensual ───────────────────────────────────────────────
  // El arranque efectivo se define como el cruce del 1% de avance, así que los
  // meses previos reparten linealmente ese primer 1% en vez de quedar en cero.
  const b0 = lead > 0 ? 0.01 : 0
  const ramp = (j: number) =>
    j <= lead ? b0 * (j / lead) : b0 + (1 - b0) * interp(cs, skewT((j - lead) / N, skew))

  const meses: PuntoMensual[] = []
  for (let j = 1; j <= NT; j++) {
    const t = j <= lead ? 0 : skewT((j - lead) / N, skew)
    const familias: Record<string, number> = {}
    let acumTotal = 0
    for (const f of clavesFamilia) {
      const v = j <= lead ? b0 * (j / lead) : b0 + (1 - b0) * interp(fcur[f], t)
      familias[f] = total * mix[f] * v
      acumTotal += familias[f]
    }
    meses.push({
      i: j,
      ym: sumarMeses(obra.inicio, j - 1),
      mes: 0,
      acum: acumTotal,
      pctAcum: 0,
      curvaMezclada: ramp(j),
      // La banda rodea la curva mezclada, NO la serie que se monetiza. Es así
      // en el prototipo y se reproduce; la diferencia llega a 0,47 pp en La
      // Quebrada, un 37% del semiancho. La UI debe rotularlo.
      p10: Math.max(0, Math.min(1, ramp(j) - Z90 * interpA(sd, t))),
      p90: Math.max(0, Math.min(1, ramp(j) + Z90 * interpA(sd, t))),
      familias,
      familiasMes: {},
    })
  }

  // Las cinco curvas de familia no cierran exactamente en `total`: se reescala.
  // En modo familia hay una sola curva y cierra sola, así que el factor da 1.
  const cierre = meses[NT - 1].acum || 1
  const k = totalCurva / cierre
  for (const r of meses) {
    for (const f of clavesFamilia) r.familias[f] *= k
    r.acum *= k
  }
  meses.forEach((r, idx) => {
    const prev = idx ? meses[idx - 1] : null
    r.mes = r.acum - (prev ? prev.acum : 0)
    r.pctAcum = r.acum / totalCurva
    for (const f of clavesFamilia) {
      r.familiasMes[f] = r.familias[f] - (prev ? prev.familias[f] : 0)
    }
  })

  const comparables: Comparable[] = OB
    .map((o, i) => ({
      nombre: o.nombre, peso: w[i], tipo: o.tipo,
      m2: o.m2, contrato: o.contrato, anio_fin: o.anio_fin,
    }))
    .filter(c => c.peso > 0)
    .sort((a, b) => b.peso - a.peso)

  const advertencias: string[] = []
  if (modoPesos === 'simil' && masa < MASA_MINIMA) {
    advertencias.push(
      `Esta obra no se parece a ninguna de las ${OB.length} históricas (masa de similitud ` +
      `${masa.toFixed(2)}, referencia ${MASA_MINIMA}). Los pesos se normalizan igual, así que ` +
      `la banda sale igual de angosta que para una obra con comparables reales: es una ` +
      `extrapolación, no una interpolación.`
    )
  }
  if (lead === 0) {
    advertencias.push(
      'Sin meses de arranque (lead = 0). En La Quebrada omitir el arranque desvía la ' +
      'proyección un 39%: conviene fijarlo antes de leer el resultado.'
    )
  }

  return {
    obra,
    opciones: { lead, skew, modoPesos, kRecencia },
    total: totalCurva, ejec, ejecAuto, rdur, rdurAuto, N, NT, sdE, mix,
    familia, meses, comparables, masaSimilitud: masa, advertencias,
  }
}
