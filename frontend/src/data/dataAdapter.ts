import { useProjectsStore } from '../features/projects/ProjectsStore'
import { usePlanCuentasStore } from '../features/plan-cuentas/PlanCuentasStore'
import { useInformesStore } from '../features/informes/InformesStore'
import type { MovimientoSinPartida, Proyecto } from '../features/projects/types'
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
  /** Proyección del informe anterior, por código de partida → para VAR EERR Anterior */
  proyeccionAnteriorPorCodigo: Record<string, number>
  /** Indica si estamos viendo un snapshot aprobado (read-only) */
  esVistaAprobada: boolean
  numeroInforme: number | null
}

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

function toSinPartida(m: MovimientoSinPartida): SinPartida {
  return { concepto1: m.concepto_codigo, gasto_uf: m.monto_uf }
}

/** Construye un objeto Proyecto a partir de un snapshot guardado de informe */
function snapshotToProyecto(
  baseProject: Proyecto,
  snapshot: { nombre: string; unidadNegocioCodigo?: number; cutoffMesReal?: string | null; slots: Proyecto['slots'] }
): Proyecto {
  return {
    id: baseProject.id,
    nombre: snapshot.nombre,
    unidadNegocioCodigo: snapshot.unidadNegocioCodigo,
    cutoffMesReal: snapshot.cutoffMesReal,
    fechaCreacion: baseProject.fechaCreacion,
    fechaActualizacion: baseProject.fechaActualizacion,
    slots: snapshot.slots,
  }
}

export function useDashboardData(): DashboardData {
  const projects = useProjectsStore(s => s.projects)
  const activeProjectId = useProjectsStore(s => s.activeProjectId)
  const plan = usePlanCuentasStore(s => s.plan)
  const viewPorProyecto = useInformesStore(s => s.viewPorProyecto)
  const informesPorProyecto = useInformesStore(s => s.porProyecto)
  const snapshots = useInformesStore(s => s.snapshots)
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
    proyeccionAnteriorPorCodigo: {},
    esVistaAprobada: false,
    numeroInforme: null,
  }

  if (!activeProject) return empty

  // Determinar qué proyecto usar: el actual o un snapshot aprobado
  const view = activeProjectId ? viewPorProyecto[activeProjectId] : undefined
  let proyectoEnUso: Proyecto = activeProject
  let esVistaAprobada = false
  let numeroInforme: number | null = null

  if (view?.tipo === 'aprobado') {
    proyectoEnUso = snapshotToProyecto(activeProject, view.informe.snapshot)
    esVistaAprobada = true
    numeroInforme = view.informe.numero
  }

  const hasAnyData = proyectoEnUso.slots.presupuesto_original
    || proyectoEnUso.slots.presupuesto_redistribuido
    || proyectoEnUso.slots.ppto_horas_extra
    || proyectoEnUso.slots.gasto_real_erp
    || proyectoEnUso.slots.proyectado

  if (!hasAnyData) return { ...empty, projectName: activeProject.nombre, esVistaAprobada, numeroInforme }

  const { partidas, sinPartida, familias, fechaCorte } = mergeProyecto(
    proyectoEnUso,
    plan,
    proyectoEnUso.cutoffMesReal ?? null
  )

  // Para VAR EERR Anterior: buscar el informe inmediatamente anterior al actual
  // Si estamos en borrador, "anterior" es el último aprobado (informes[0] desc).
  // Si estamos viendo Informe N°X, "anterior" es Informe N°X-1.
  const proyeccionAnteriorPorCodigo: Record<string, number> = {}
  const informes = activeProjectId ? (informesPorProyecto[activeProjectId] ?? []) : []
  let informeAnteriorId: string | undefined
  if (view?.tipo === 'aprobado') {
    const anterior = informes.find(i => i.numero === view.informe.numero - 1)
    informeAnteriorId = anterior?.id
  } else {
    informeAnteriorId = informes[0]?.id  // último aprobado
  }
  if (informeAnteriorId && snapshots[informeAnteriorId]) {
    const snapAnterior = snapshots[informeAnteriorId].snapshot
    const proyectoAnterior = snapshotToProyecto(activeProject, snapAnterior)
    const { partidas: partidasAnt } = mergeProyecto(proyectoAnterior, plan, proyectoAnterior.cutoffMesReal ?? null)
    for (const p of partidasAnt) {
      proyeccionAnteriorPorCodigo[p.codigo] = p.proyeccion
    }
  }

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
    proyeccionAnteriorPorCodigo,
    esVistaAprobada,
    numeroInforme,
  }
}
