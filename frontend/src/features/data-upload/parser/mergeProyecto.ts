import type {
  Proyecto,
  PartidaRaw,
  EstadoPartida,
  MovimientoSinPartida,
} from '../../projects/types'
import type { PlanCuentas } from '../../plan-cuentas/types'
import { planCuentasBundled } from '../../plan-cuentas/bundled/seed'

// Re-use the dashboard Partida type from mockData (canonical shape)
export interface PartidaMerged {
  codigo: string
  codigo2: string
  familia: string
  partida: string
  ud: string
  ppto_original: number
  redistribuido: number
  ppto_horas_extra: number
  ppto_vigente: number        // redistribuido + ppto_horas_extra
  gasto_real: number
  proyeccion: number
  variacion_uf: number
  variacion_pct: number | null
  ytg: number
  estado: EstadoPartida
}

export interface MergeResult {
  partidas: PartidaMerged[]
  sinPartida: MovimientoSinPartida[]
  familias: string[]
  fechaCorte: string
}

function calcEstado(p: { ppto_original: number; redistribuido: number; ppto_vigente: number; gasto_real: number; proyeccion: number; variacion_pct: number | null }): EstadoPartida {
  if (p.ppto_original === 0 && p.redistribuido === 0 && p.ppto_vigente === 0 && (p.gasto_real > 0 || p.proyeccion > 0)) return 'SOLO REAL'
  if (p.ppto_vigente > 0 && p.gasto_real === 0 && p.proyeccion === 0) return 'SIN EJECUCION'
  const pct = p.variacion_pct
  if (pct === null) return 'SIN EJECUCION'
  // Positive = vigente > proyectado (favorable). Negative = proyectado > vigente (sobrecosto)
  if (pct < -10) return 'CRITICO'
  if (pct < -5) return 'ALERTA'
  if (pct <= 5) return 'EN CONTROL'
  return 'FAVORABLE'
}

/**
 * Resolve familia name from Plan de Cuentas by codigo2 (cost center code).
 * Falls back to the partida's own familia field if not found in the plan.
 */
function resolverFamilia(codigo2: number, fallback: string, plan: PlanCuentas): string {
  // Direct cuenta lookup
  const cuenta = plan.cuentas.find(c => c.codigo === codigo2)
  if (cuenta) {
    const fam = plan.familias.find(f => f.codigo === cuenta.familiaCodigo)
    if (fam) return fam.nombre
  }
  // Maybe it's a familia header code itself (100, 200, etc.)
  const familiaDirecta = plan.familias.find(f => f.codigo === codigo2)
  if (familiaDirecta) return familiaDirecta.nombre
  // Fallback: derive from hundreds digit
  const famCode = Math.floor(codigo2 / 100) * 100
  const famByRange = plan.familias.find(f => f.codigo === famCode)
  if (famByRange) return famByRange.nombre
  return fallback
}

/**
 * Merge presupuesto (original/redistribuido) + gasto real ERP en el modelo canónico.
 *
 * La familia de cada partida se resuelve desde el Plan de Cuentas por codigo2,
 * no desde los headers del Excel.
 *
 * El matching budget↔real es a nivel de centro de costo (codigo2 en budget = concepto1_codigo en real).
 * El gasto real se prorratea entre las partidas del mismo centro de costo según su peso presupuestario.
 */
export function mergeProyecto(proyecto: Proyecto, plan?: PlanCuentas, cutoffMes?: string | null): MergeResult {
  const planActivo = plan ?? planCuentasBundled

  const original = proyecto.slots.presupuesto_original
  const redistrib = proyecto.slots.presupuesto_redistribuido
  const horasExtra = proyecto.slots.ppto_horas_extra
  const erpData = proyecto.slots.gasto_real_erp
  const proyectadoSlot = proyecto.slots.proyectado

  if (!original && !redistrib && !horasExtra && !erpData && !proyectadoSlot) {
    return { partidas: [], sinPartida: [], familias: [], fechaCorte: '' }
  }

  // ── Step 1: Build partida list from budget ────────────────────────────────
  type EntryMap = { orig: PartidaRaw | null; redist: PartidaRaw | null; hx: PartidaRaw | null; proy: PartidaRaw | null }
  const map = new Map<string, EntryMap>()

  const indexSlot = (items: PartidaRaw[] | undefined, key: keyof EntryMap) => {
    if (!items) return
    for (const p of items) {
      const entry = map.get(p.codigo) ?? { orig: null, redist: null, hx: null, proy: null }
      entry[key] = p
      map.set(p.codigo, entry)
    }
  }

  indexSlot(original?.partidas, 'orig')
  indexSlot(redistrib?.partidas, 'redist')
  indexSlot(horasExtra?.partidas, 'hx')
  indexSlot(proyectadoSlot?.partidas, 'proy')

  // ── Step 2: Compute budget totals per cost center ─────────────────────────
  // Use the redistributed codigo2 when available (redistribution can move items between accounts)
  const pptoPerCcosto = new Map<number, number>()
  const partidasByCcosto = new Map<number, string[]>()

  /** Get the effective cost center: prefer redistrib > orig > hx > proy */
  function getCc(entry: EntryMap): number {
    const raw = entry.redist?.codigo2 ?? entry.orig?.codigo2 ?? entry.hx?.codigo2 ?? entry.proy?.codigo2
    if (raw == null) return NaN
    return typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  }

  for (const [codigo, entry] of map) {
    const cc = getCc(entry)
    if (isNaN(cc)) continue

    const pptoVal = entry.redist?.total ?? entry.orig?.total ?? 0
    pptoPerCcosto.set(cc, (pptoPerCcosto.get(cc) ?? 0) + pptoVal)

    const list = partidasByCcosto.get(cc) ?? []
    list.push(codigo)
    partidasByCcosto.set(cc, list)
  }

  // ── Step 3: Build ERP gasto real lookup (filtered by cutoff month) ────────
  const gastoRealPorCc: Record<number, number> = {}
  if (erpData) {
    const porMes = erpData.agregadoPorCcostoPorMes
    // If a cutoff is set AND we have per-month data, sum only months <= cutoff
    if (cutoffMes && porMes) {
      for (const [ccStr, mesMap] of Object.entries(porMes)) {
        let sum = 0
        for (const [mes, vals] of Object.entries(mesMap)) {
          if (mes <= cutoffMes) sum += vals.monto_uf
        }
        gastoRealPorCc[Number(ccStr)] = sum
      }
    } else {
      // No cutoff or legacy data without per-month breakdown — use total
      for (const [ccStr, data] of Object.entries(erpData.agregadoPorCcosto)) {
        gastoRealPorCc[Number(ccStr)] = data.monto_uf
      }
    }
  }

  // ── Step 4: Build merged partidas ─────────────────────────────────────────
  const familiasSet = new Set<string>()
  const partidas: PartidaMerged[] = []
  const ccConsumed = new Set<number>()

  for (const [codigo, entry] of map) {
    const base = entry.orig ?? entry.redist ?? entry.hx ?? entry.proy!

    // Use redistributed cost center when available (items can move between accounts)
    const cc = getCc(entry)

    // Detect if this partida changed accounts between original and redistributed
    const ccOrig = entry.orig
      ? (typeof entry.orig.codigo2 === 'number' ? entry.orig.codigo2 : parseInt(String(entry.orig.codigo2), 10))
      : NaN
    const ccRedist = entry.redist
      ? (typeof entry.redist.codigo2 === 'number' ? entry.redist.codigo2 : parseInt(String(entry.redist.codigo2), 10))
      : NaN
    const cambioDeCC = !isNaN(ccOrig) && !isNaN(ccRedist) && ccOrig !== ccRedist

    // If the item moved accounts:
    //   ppto_original = 0 (it wasn't in this account originally)
    //   redistribuido = the value (it's now assigned here)
    const ppto_original = cambioDeCC ? 0 : (entry.orig?.total ?? 0)
    const redistribuido = entry.redist?.total ?? 0
    const ppto_horas_extra = entry.hx?.total ?? 0
    let gasto_real = 0

    if (!isNaN(cc) && gastoRealPorCc[cc] !== undefined) {
      ccConsumed.add(cc)
      const pptoCcosto = pptoPerCcosto.get(cc) ?? 0

      if (pptoCcosto === 0) {
        const n = partidasByCcosto.get(cc)?.length ?? 1
        gasto_real = gastoRealPorCc[cc] / n
      } else {
        // TODO: El prorrateo es un proxy mientras no haya asignación directa real↔partida.
        const pptoPartida = entry.redist?.total ?? entry.orig?.total ?? 0
        const peso = pptoPartida / pptoCcosto
        gasto_real = gastoRealPorCc[cc] * peso
      }
    }

    const proyeccion = entry.proy?.total ?? 0
    const vigente = redistribuido + ppto_horas_extra

    // Variación = Ppto Vigente (redist + OO.EE.) - Proyectado
    const variacion_uf = vigente - proyeccion
    const variacion_pct = vigente !== 0 ? (variacion_uf / vigente) * 100 : null
    const ytg = proyeccion - gasto_real

    // Familia resolved from Plan de Cuentas by effective cost center
    const familia = !isNaN(cc)
      ? resolverFamilia(cc, base.familia, planActivo)
      : base.familia
    familiasSet.add(familia)

    const p: PartidaMerged = {
      codigo,
      codigo2: String(isNaN(cc) ? base.codigo2 : cc),
      familia,
      partida: base.descripcion,
      ud: base.ud,
      ppto_original,
      redistribuido,
      ppto_horas_extra,
      ppto_vigente: redistribuido + ppto_horas_extra,
      gasto_real: Math.round(gasto_real * 100) / 100,
      proyeccion: Math.round(proyeccion * 100) / 100,
      variacion_uf: Math.round(variacion_uf * 100) / 100,
      variacion_pct: variacion_pct !== null ? Math.round(variacion_pct * 100) / 100 : null,
      ytg: Math.round(ytg * 100) / 100,
      estado: 'SIN EJECUCION',
    }
    p.estado = calcEstado(p)
    partidas.push(p)

    // If the partida moved accounts, also create a phantom row in the ORIGINAL account
    // showing the original budget but redistribuido=0 (it left this account)
    if (cambioDeCC && entry.orig) {
      const ppto_orig_only = entry.orig.total ?? 0
      const familiaOrig = resolverFamilia(ccOrig, entry.orig.familia, planActivo)
      familiasSet.add(familiaOrig)

      // Ghost row: vigente=0 y proyeccion=0 → variacion=0 (canonical formula)
      // Solo refleja informativamente que esta partida originalmente estuvo en otra cuenta
      const ghost: PartidaMerged = {
        codigo: `${codigo}__orig${ccOrig}`,
        codigo2: String(ccOrig),
        familia: familiaOrig,
        partida: entry.orig.descripcion,
        ud: entry.orig.ud,
        ppto_original: ppto_orig_only,
        redistribuido: 0,
        ppto_horas_extra: 0,
        ppto_vigente: 0,
        gasto_real: 0,
        proyeccion: 0,
        variacion_uf: 0,
        variacion_pct: null,
        ytg: 0,
        estado: 'SIN EJECUCION',
      }
      ghost.estado = calcEstado(ghost)
      partidas.push(ghost)
    }
  }

  // ── Step 5: ERP cost centers without budget ────────────────────────────────
  // If the cost center exists in the Plan de Cuentas → add as a normal partida
  // with ppto=0 and name from the plan. Only truly unknown codes go to sinPartida.
  const sinPartida: MovimientoSinPartida[] = []
  if (erpData) {
    for (const [ccStr, data] of Object.entries(erpData.agregadoPorCcosto)) {
      const cc = Number(ccStr)
      if (ccConsumed.has(cc)) continue

      // Use the cutoff-filtered amount (gastoRealPorCc), not the raw total.
      const gasto_real = gastoRealPorCc[cc] ?? 0
      // Skip if filter excludes everything for this cc
      if (gasto_real === 0 && data.monto_uf !== 0) continue

      const cuenta = planActivo.cuentas.find(c => c.codigo === cc)

      if (cuenta) {
        // Known cost center — add to main table with ppto=0
        const familia = resolverFamilia(cc, 'OTROS', planActivo)
        familiasSet.add(familia)

        const p: PartidaMerged = {
          codigo: `CC${cc}`,
          codigo2: String(cc),
          familia,
          partida: cuenta.descripcion,
          ud: 'gl',
          ppto_original: 0,
          redistribuido: 0,
          ppto_horas_extra: 0,
          ppto_vigente: 0,
          gasto_real: Math.round(gasto_real * 100) / 100,
          proyeccion: 0,
          variacion_uf: 0,
          variacion_pct: null,
          ytg: -Math.round(gasto_real * 100) / 100,
          estado: 'SOLO REAL',
        }
        partidas.push(p)
      } else {
        // Unknown cost center — truly orphan (use cutoff-filtered amount)
        sinPartida.push({
          concepto_codigo: cc,
          descripcion: '',
          monto_uf: gasto_real,
          num_transacciones: data.num_tx,
          proveedores_top: [],
        })
      }
    }
    sinPartida.sort((a, b) => Math.abs(b.monto_uf) - Math.abs(a.monto_uf))
  }

  // ── Step 6: Order familias from Plan de Cuentas ───────────────────────────
  const familiaOrder = planActivo.familias.map(f => f.nombre)
  const familias = familiaOrder.filter(f => familiasSet.has(f))
  for (const f of familiasSet) {
    if (!familias.includes(f)) familias.push(f)
  }

  const dates = [
    original?.fechaCarga,
    redistrib?.fechaCarga,
    horasExtra?.fechaCarga,
    erpData?.fechaCarga,
    proyectadoSlot?.fechaCarga,
  ].filter(Boolean) as string[]
  const fechaCorte = dates.length ? dates.sort().at(-1)!.slice(0, 10) : new Date().toISOString().slice(0, 10)

  return { partidas, sinPartida, familias, fechaCorte }
}

