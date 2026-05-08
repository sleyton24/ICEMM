import { create } from 'zustand'
import { api } from '../../api/client'
import type { InformeListItem, InformeFull, InformeView } from './types'

interface InformesState {
  /** Por proyecto: lista de informes aprobados */
  porProyecto: Record<string, InformeListItem[]>
  /** Cache de snapshots completos */
  snapshots: Record<string, InformeFull>
  /** Vista actual por proyecto: borrador (default) o un informe aprobado */
  viewPorProyecto: Record<string, InformeView>

  fetchInformes: (projectId: string) => Promise<void>
  fetchSnapshot: (projectId: string, informeId: string) => Promise<InformeFull>
  aprobar: (projectId: string, comentario?: string) => Promise<InformeListItem>
  eliminar: (projectId: string, informeId: string) => Promise<void>

  /** Cambia la vista (borrador / aprobado) para un proyecto */
  setView: (projectId: string, view: InformeView) => void
  getView: (projectId: string) => InformeView
}

const VIEW_STORAGE = 'icemm.informeView.v1'
function loadViews(): Record<string, InformeView> {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function saveViews(v: Record<string, InformeView>) {
  localStorage.setItem(VIEW_STORAGE, JSON.stringify(v))
}

export const useInformesStore = create<InformesState>((set, get) => ({
  porProyecto: {},
  snapshots: {},
  viewPorProyecto: loadViews(),

  fetchInformes: async (projectId: string) => {
    const informes = await api.get<InformeListItem[]>(`/projects/${projectId}/informes`)
    set(state => ({
      porProyecto: { ...state.porProyecto, [projectId]: informes },
    }))
  },

  fetchSnapshot: async (projectId: string, informeId: string) => {
    const cached = get().snapshots[informeId]
    if (cached) return cached
    const snap = await api.get<InformeFull>(`/projects/${projectId}/informes/${informeId}`)
    set(state => ({ snapshots: { ...state.snapshots, [informeId]: snap } }))
    return snap
  },

  aprobar: async (projectId: string, comentario?: string) => {
    const nuevo = await api.post<InformeListItem>(`/projects/${projectId}/informes/aprobar`, { comentario })
    // Refrescar listado
    await get().fetchInformes(projectId)
    return nuevo
  },

  eliminar: async (projectId: string, informeId: string) => {
    await api.delete(`/projects/${projectId}/informes/${informeId}`)
    set(state => {
      const filtered = (state.porProyecto[projectId] ?? []).filter(i => i.id !== informeId)
      const { [informeId]: _drop, ...rest } = state.snapshots
      return {
        porProyecto: { ...state.porProyecto, [projectId]: filtered },
        snapshots: rest,
      }
    })
  },

  setView: (projectId, view) => {
    set(state => {
      const next = { ...state.viewPorProyecto, [projectId]: view }
      saveViews(next)
      return { viewPorProyecto: next }
    })
  },

  getView: (projectId) => {
    return get().viewPorProyecto[projectId] ?? { tipo: 'borrador' }
  },
}))
