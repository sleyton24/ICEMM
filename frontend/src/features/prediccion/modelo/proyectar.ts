import type {
  ObraInput,
  OpcionesProyeccion,
  Proyeccion,
  PuntoMensual,
  Comparable,
} from './tipos'
import { curvasBase, GRID, FAMILIAS_MODELO } from './curvasBase'
import { cuentaBase, CRITERIO_CUENTAS } from './curvasCuenta'
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

  // La cuenta manda sobre la familia: es el nivel más específico que se pidió.
  const cuenta = opciones.cuenta ?? null
  const cb = cuenta ? cuentaBase(cuenta) : null
  if (cuenta && !cb) {
    throw new Error(
      `La cuenta "${cuenta}" no tiene curva histórica. Solo las hay para las que ` +
      `aparecen en ${CRITERIO_CUENTAS.minObras} o más obras con ` +
      `${CRITERIO_CUENTAS.minMesesActivos} o más meses de gasto.`,
    )
  }

  const OB = curvasBase.obras
  const { pesos: w0, masa } = pesos(obra, OB, {
    modo: modoPesos,
    kRecencia,
    activas: opciones.obrasActivas,
  })

  // En modo cuenta los pesos se renormalizan sobre las obras que tienen esa
  // cuenta. Dejar el peso de una obra ausente valiendo cero sin renormalizar
  // encogería la curva mezclada hacia el origen —el promedio ponderado ya no
  // sumaría 1— y la proyección saldría sistemáticamente baja.
  const presente = cb ? cb.curvas.map(c => c !== null) : null
  const w = (() => {
    if (!presente) return w0
    const masaCuenta = w0.reduce((a, x, i) => a + (presente[i] ? x : 0), 0)
    if (!(masaCuenta > 0)) {
      throw new Error(
        `Ninguna de las obras comparables tiene la cuenta "${cuenta}". ` +
        `Probá con menos filtros de obra o proyectá la familia completa.`,
      )
    }
    return w0.map((x, i) => (presente[i] ? x / masaCuenta : 0))
  })()

  /** Promedio ponderado sobre las obras base. */
  const acum = (f: (o: typeof OB[number], i: number) => number) =>
    OB.reduce((a, o, i) => a + w[i] * f(o, i), 0)

  /**
   * Los parámetros de obra (ejec, ratio de duración) se promedian siempre
   * sobre las 8: son propiedades de la obra, no de la cuenta. Solo la curva y
   * la participación usan los pesos renormalizados.
   */
  const acumObra = (f: (o: typeof OB[number], i: number) => number) =>
    OB.reduce((a, o, i) => a + w0[i] * f(o, i), 0)

  // ── Paso 3: parámetros agregados ────────────────────────────────────────
  const ejecAuto = acumObra(o => o.ejec)
  const rdurAuto = acumObra(o => o.ratio_dur)
  const ejec = opciones.ejec ?? ejecAuto
  const rdur = opciones.rdur ?? rdurAuto

  const N = Math.max(2, Math.round(obra.plazo * rdur))
  const NT = N + lead
  const total = obra.contrato * ejec

  const sdE = Math.sqrt(acumObra(o => Math.pow(o.ejec - ejecAuto, 2)))

  // ── Paso 4: curva mezclada y dispersión ─────────────────────────────────
  // En modo familia se usan la curva y la dispersión DE ESA FAMILIA, que el
  // artefacto trae por obra. No es la curva de la obra reescalada: cada
  // familia tiene su propio calendario (Materiales gasta al 39% del ciclo,
  // Subcontratos al 53%), y ese desfase es justamente lo que se quiere ver.
  // En modo cuenta la curva es la de esa cuenta en cada obra que la tiene.
  // Donde falta va una curva de ceros, no un null: `acum` evalúa el callback
  // para las 8 obras aunque el peso sea 0, así que no alcanza con confiar en
  // que el peso anule el término.
  const CERO = GRID.map(() => 0)
  const curvaDe = (o: typeof OB[number], i: number) =>
    cb ? (cb.curvas[i] ?? CERO) : familia ? o.fam[familia].curva : o.curva_s
  const cs = GRID.map((_, g) => acum((o, i) => curvaDe(o, i)[g]))
  const sd = GRID.map((_, g) => Math.sqrt(acum((o, i) => Math.pow(curvaDe(o, i)[g] - cs[g], 2))))

  const mix: Record<string, number> = {}
  const fcur: Record<string, number[]> = {}
  for (const f of FAMILIAS_MODELO) {
    mix[f] = acumObra(o => o.fam[f].share)
    fcur[f] = GRID.map((_, g) => acumObra(o => o.fam[f].curva[g]))
  }

  // La cuenta entra al mismo mecanismo que una familia, con su código como
  // clave: participación ponderada y curva propia. Así el reparto mensual, el
  // reescalado de cierre y la serie por clave funcionan sin caso especial.
  if (cb) {
    // El share va con w0, NO con los pesos renormalizados.
    //
    // La curva y el share son cosas distintas: la curva es una FORMA, ya
    // normalizada a 1, y promediarla sobre obras que no tienen la cuenta la
    // encogería —por eso usa `acum`. El share es un NIVEL, y que una obra no
    // tenga la cuenta no es un hueco a saltear: es el dato de que ahí esa
    // cuenta valió 0.
    //
    // Renormalizar el nivel infla el monto en 1/masa: la cuenta 311, presente
    // en 3 de 8 obras, salía UF 3.913 en vez de UF 959 (×4,08), y las cuentas
    // de subcontratos sumaban el 107,6% de su propia familia. El artefacto
    // cubre el 96,5% del gasto, así que la suma tiene que dar algo por DEBAJO
    // de 1, nunca por encima.
    mix[cb.codigo] = acumObra((_o, i) => cb.shares[i] ?? 0)
    fcur[cb.codigo] = cs
  }

  // El total a repartir: la obra entera, o lo que le toca a la familia/cuenta.
  const claveParcial = cb ? cb.codigo : familia
  const totalCurva = claveParcial ? total * mix[claveParcial] : total
  // Con una sola clave no hay que reconciliar nada entre curvas.
  const clavesFamilia = claveParcial ? [claveParcial] : FAMILIAS_MODELO

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
  if (cb && cb.nObras < OB.length) {
    advertencias.push(
      `La cuenta ${cb.codigo} solo aparece en ${cb.nObras} de las ${OB.length} obras ` +
      `históricas. La mezcla se arma con esas ${cb.nObras} y los pesos se renormalizan; ` +
      `es una base más angosta que la de la familia completa.`,
    )
  }
  if (cb && cb.caidaMax > 0.05) {
    advertencias.push(
      `La curva histórica de la cuenta ${cb.codigo} retrocede hasta ` +
      `${(cb.caidaMax * 100).toFixed(1)} puntos: hay meses con monto negativo ` +
      `—notas de crédito o reclasificaciones— en el dato de origen. La proyección ` +
      `los arrastra, así que puede mostrar meses en negativo.`,
    )
  }
  if (cb && cb.shareMedio < 0.005) {
    advertencias.push(
      `La cuenta ${cb.codigo} pesa en promedio ${(cb.shareMedio * 100).toFixed(2)}% del ` +
      `costo de obra. A esa escala, el error de la proyección de la obra completa la ` +
      `tapa: sirve para ver el calendario de gasto, no para pronosticar el monto.`,
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
    familia: cb ? cb.familia : familia,
    cuenta: cb ? cb.codigo : null,
    obrasDeLaCuenta: cb ? cb.nObras : null,
    meses, comparables, masaSimilitud: masa, advertencias,
  }
}
