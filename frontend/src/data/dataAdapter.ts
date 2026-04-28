import { useProjectsStore } from '../features/projects/ProjectsStore'
import { usePlanCuentasStore } from '../features/plan-cuentas/PlanCuentasStore'
import type { MovimientoSinPartida } from '../features/projects/types'
import { mergeProyecto, type PartidaMerged } from '../features/data-upload/parser/mergeProyecto'
import {
  FAMILIAS as mockFamilias,
  type Partida,
  type SinPartida,
  type Movimiento,
  type DetallePartida,
} from './mockData'

export type { Partida, SinPartida, Movimiento, DetallePartida }

export interface DashboardData {
  partidas: Partida[]
  sinPartida: SinPartida[]
  sinPartidaEnriquecido: MovimientoSinPartida[]
  movimientos: Record<string, Movimiento[]>
  detallePartidas: Record<string, DetallePartida[]>
  familias: string[]
  fechaCorte: string
  isDemo: boolean
  projectName: string
}

/** Adapt PartidaMerged → Partida (mockData shape used by UI components) */
function toPartida(p: PartidaMerged): Partida {
  return {
    codigo: p.codigo,
    codigo2: p.codigo2,
    familia: p.familia,
    partida: p.partida,
    ud: p.ud,
    ppto_original: p.ppto_original,
    redistribuido: p.redistribuido,
    ppto_horas_extra: p.ppto_horas_extra,
    ppto_vigente: p.ppto_vigente,
    gasto_real: p.gasto_real,
    proyeccion: p.proyeccion,
    variacion_uf: p.variacion_uf,
    variacion_pct: p.variacion_pct,
    ytg: p.ytg,
    estado: p.estado,
  }
}

/** Adapt MovimientoSinPartida → SinPartida (legacy shape for backward compat) */
function toSinPartida(m: MovimientoSinPartida): SinPartida {
  return { concepto1: m.concepto_codigo, gasto_uf: m.monto_uf }
}

export function useDashboardData(): DashboardData {
  const projects = useProjectsStore(s => s.projects)
  const activeProjectId = useProjectsStore(s => s.activeProjectId)
  const plan = usePlanCuentasStore(s => s.plan)
  const activeProject = projects.find(p => p.id === activeProjectId) ?? null

  const empty: DashboardData = {
    partidas: [],
    sinPartida: [],
    sinPartidaEnriquecido: [],
    movimientos: {},
    detallePartidas: {},
    familias: mockFamilias,
    fechaCorte: new Date().toISOString().slice(0, 10),
    isDemo: false,
    projectName: activeProject?.nombre ?? 'Sin proyecto',
  }

  if (!activeProject) return empty

  const hasAnyData = activeProject.slots.presupuesto_original
    || activeProject.slots.presupuesto_redistribuido
    || activeProject.slots.ppto_horas_extra
    || activeProject.slots.gasto_real_erp
    || activeProject.slots.proyectado

  if (!hasAnyData) return empty

  const { partidas, sinPartida, familias, fechaCorte } = mergeProyecto(activeProject, plan, activeProject.cutoffMesReal ?? null)

  return {
    partidas: partidas.map(toPartida),
    sinPartida: sinPartida.map(toSinPartida),
    sinPartidaEnriquecido: sinPartida,
    movimientos: {},
    detallePartidas: {},
    familias,
    fechaCorte,
    isDemo: false,
    projectName: activeProject.nombre,
  }
}
