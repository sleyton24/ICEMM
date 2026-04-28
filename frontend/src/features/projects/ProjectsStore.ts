import { create } from 'zustand'
import { api } from '../../api/client'
import type { Proyecto, ArchivoCargado, CargaERP, SlotTipo } from './types'

const ACTIVE_KEY = 'icemm.activeProjectId'

function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}
function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

type ItemizadoSlot = 'presupuesto_original' | 'presupuesto_redistribuido' | 'ppto_horas_extra' | 'proyectado'

interface ProjectsState {
  projects: Proyecto[]
  activeProjectId: string | null
  loading: boolean
  error: string | null

  // Derived
  activeProject: () => Proyecto | null

  // Actions (todas async — hablan al backend)
  fetchProjects: () => Promise<void>
  createProject: (nombre: string) => Promise<Proyecto>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string | null) => void
  uploadSlot: (projectId: string, slot: ItemizadoSlot, data: ArchivoCargado) => Promise<void>
  uploadERPSlot: (projectId: string, data: CargaERP) => Promise<void>
  clearSlot: (projectId: string, slot: SlotTipo) => Promise<void>
  setCutoffMesReal: (projectId: string, cutoff: string | null) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  activeProjectId: loadActiveId(),
  loading: false,
  error: null,

  activeProject: () => {
    const { projects, activeProjectId } = get()
    return projects.find(p => p.id === activeProjectId) ?? null
  },

  fetchProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await api.get<Proyecto[]>('/projects')
      set({ projects, loading: false })
      // Si activeProjectId no existe en el server, limpiar
      const { activeProjectId } = get()
      if (activeProjectId && !projects.find(p => p.id === activeProjectId)) {
        saveActiveId(projects[0]?.id ?? null)
        set({ activeProjectId: projects[0]?.id ?? null })
      }
    } catch (e: any) {
      set({ error: e.message ?? 'Error cargando proyectos', loading: false })
    }
  },

  createProject: async (nombre: string) => {
    const proyecto = await api.post<Proyecto>('/projects', { nombre })
    saveActiveId(proyecto.id)
    set(state => ({ projects: [proyecto, ...state.projects], activeProjectId: proyecto.id }))
    return proyecto
  },

  deleteProject: async (id: string) => {
    await api.delete(`/projects/${id}`)
    set(state => {
      const projects = state.projects.filter(p => p.id !== id)
      const activeProjectId = state.activeProjectId === id
        ? (projects[0]?.id ?? null)
        : state.activeProjectId
      saveActiveId(activeProjectId)
      return { projects, activeProjectId }
    })
  },

  setActiveProject: (id: string | null) => {
    saveActiveId(id)
    set({ activeProjectId: id })
  },

  uploadSlot: async (projectId: string, slot: ItemizadoSlot, data: ArchivoCargado) => {
    const updated = await api.post<Proyecto>(`/projects/${projectId}/slots/${slot}`, {
      nombreArchivo: data.nombreArchivo,
      partidas: data.partidas,
      subtotalesFamilia: data.subtotalesFamilia,
      totalGeneral: data.totalGeneral,
    })
    set(state => ({
      projects: state.projects.map(p => p.id === projectId ? updated : p),
    }))
  },

  uploadERPSlot: async (projectId: string, data: CargaERP) => {
    const updated = await api.post<Proyecto>(`/projects/${projectId}/erp`, {
      nombreArchivo: data.nombreArchivo,
      unidadNegocioCodigo: data.unidadNegocioCodigo,
      unidadNegocioDescripcion: data.unidadNegocioDescripcion,
      totalUF: data.totalUF,
      numTransacciones: data.numTransacciones,
      rangoFechas: data.rangoFechas,
      agregadoPorCcosto: data.agregadoPorCcosto,
      agregadoPorCcostoPorMes: data.agregadoPorCcostoPorMes,
      mesesDisponibles: data.mesesDisponibles,
      transaccionesPorCcosto: data.transaccionesPorCcosto,
    })
    set(state => ({
      projects: state.projects.map(p => p.id === projectId ? updated : p),
    }))
  },

  clearSlot: async (projectId: string, slot: SlotTipo) => {
    await api.delete(`/projects/${projectId}/slots/${slot}`)
    // Refetch para reflejar el cambio
    const updated = await api.get<Proyecto>(`/projects/${projectId}`)
    set(state => ({
      projects: state.projects.map(p => p.id === projectId ? updated : p),
    }))
  },

  setCutoffMesReal: async (projectId: string, cutoff: string | null) => {
    const updated = await api.patch<Proyecto>(`/projects/${projectId}`, { cutoffMesReal: cutoff })
    set(state => ({
      projects: state.projects.map(p => p.id === projectId ? updated : p),
    }))
  },
}))

// Hidratar al cargar
useProjectsStore.getState().fetchProjects()
