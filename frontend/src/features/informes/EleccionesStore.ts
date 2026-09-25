import { create } from 'zustand'
import { api } from '../../api/client'
import { esDemoMode } from '../demo/demoMode'
import { useCurrentUserStore } from '../auth/useCurrentUser'
import type { CurvaElegida, EleccionProyeccionDTO, FuenteProyeccion, PuntoCurvaInforme } from './aplicarEleccionProyeccion'

const KEY = 'icemm.eleccionesProyeccion.v1'

export const SIN_ELECCIONES: EleccionProyeccionDTO[] = []

function loadDemo(): Record<string, EleccionProyeccionDTO[]> {
  if (!esDemoMode() || typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) as Record<string, EleccionProyeccionDTO[]> : {}
  } catch {
    return {}
  }
}

function saveDemo(mapa: Record<string, EleccionProyeccionDTO[]>) {
  if (!esDemoMode() || typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(mapa))
}

function autor(): string {
  return useCurrentUserStore.getState().user?.email ?? 'demo@icemm'
}

export interface SugerenciaCurva {
  cierreTipica: number
  cierreReanclada: number | null
  serie: PuntoCurvaInforme[]
  obrasReferencia: string[]
}

interface State {
  porProyecto: Record<string, EleccionProyeccionDTO[]>
  pendiente: string | null
  error: string | null
  fetch: (projectId: string) => Promise<void>
  sugerir: (projectId: string, codigoCuenta: string, sugerencia: SugerenciaCurva) => Promise<void>
  elegir: (projectId: string, codigoCuenta: string, fuente: FuenteProyeccion, curva: CurvaElegida | null) => Promise<void>
}

function upsertLocal(
  lista: EleccionProyeccionDTO[] | undefined,
  fila: EleccionProyeccionDTO,
): EleccionProyeccionDTO[] {
  const prev = lista ?? []
  const i = prev.findIndex(e => e.codigoCuenta === fila.codigoCuenta)
  if (i < 0) return [...prev, fila].sort((a, b) => a.codigoCuenta.localeCompare(b.codigoCuenta))
  const next = prev.slice()
  next[i] = fila
  return next
}

export const useEleccionesStore = create<State>((set, get) => ({
  porProyecto: loadDemo(),
  pendiente: null,
  error: null,

  fetch: async (projectId) => {
    if (esDemoMode()) return
    try {
      const lista = await api.get<EleccionProyeccionDTO[]>(`/projects/${projectId}/elecciones-proyeccion`)
      set(s => ({ porProyecto: { ...s.porProyecto, [projectId]: lista }, error: null }))
    } catch {
      // Sin fila o sin migración todavía: el informe sigue en Presto.
    }
  },

  sugerir: async (projectId, codigoCuenta, sugerencia) => {
    set({ pendiente: `${projectId}:${codigoCuenta}`, error: null })
    try {
      if (esDemoMode()) {
        const prev = (get().porProyecto[projectId] ?? []).find(e => e.codigoCuenta === codigoCuenta)
        const ahora = new Date().toISOString()
        let fuente = prev?.fuente ?? 'presto'
        let curva = prev?.curva ?? null
        if (fuente === 'modelo') {
          const cierre = curva === 'reanclada' ? sugerencia.cierreReanclada : sugerencia.cierreTipica
          if (cierre == null) { fuente = 'presto'; curva = null }
        }
        const fila: EleccionProyeccionDTO = {
          id: prev?.id ?? crypto.randomUUID(),
          projectId,
          codigoCuenta,
          fuente,
          curva,
          cierreTipica: sugerencia.cierreTipica,
          cierreReanclada: sugerencia.cierreReanclada,
          serie: sugerencia.serie,
          obrasReferencia: sugerencia.obrasReferencia,
          pasadoPor: autor(),
          pasadoEn: ahora,
          elegidoPor: prev?.elegidoPor ?? null,
          elegidoEn: prev?.elegidoEn ?? null,
        }
        const porProyecto = {
          ...get().porProyecto,
          [projectId]: upsertLocal(get().porProyecto[projectId], fila),
        }
        saveDemo(porProyecto)
        set({ porProyecto, pendiente: null })
        return
      }
      const fila = await api.put<EleccionProyeccionDTO>(
        `/projects/${projectId}/elecciones-proyeccion/${codigoCuenta}`,
        { accion: 'sugerir', ...sugerencia },
      )
      set(s => ({
        porProyecto: { ...s.porProyecto, [projectId]: upsertLocal(s.porProyecto[projectId], fila) },
        pendiente: null,
      }))
    } catch (e) {
      set({ pendiente: null, error: e instanceof Error ? e.message : 'No se pudo llevar la curva al informe' })
      throw e
    }
  },

  elegir: async (projectId, codigoCuenta, fuente, curva) => {
    const prevLista = get().porProyecto[projectId] ?? []
    const prev = prevLista.find(e => e.codigoCuenta === codigoCuenta)
    if (!prev) return
    const optimista: EleccionProyeccionDTO = {
      ...prev,
      fuente,
      curva: fuente === 'modelo' ? curva : null,
      elegidoPor: autor(),
      elegidoEn: new Date().toISOString(),
    }
    const aplicar = (lista: EleccionProyeccionDTO[]) => {
      const porProyecto = { ...get().porProyecto, [projectId]: upsertLocal(lista, optimista) }
      if (esDemoMode()) saveDemo(porProyecto)
      set({ porProyecto, pendiente: null, error: null })
    }
    set({ pendiente: `${projectId}:${codigoCuenta}`, error: null })
    aplicar(prevLista)
    if (esDemoMode()) return
    try {
      const fila = await api.put<EleccionProyeccionDTO>(
        `/projects/${projectId}/elecciones-proyeccion/${codigoCuenta}`,
        { accion: 'elegir', fuente, curva },
      )
      set(s => ({
        porProyecto: { ...s.porProyecto, [projectId]: upsertLocal(s.porProyecto[projectId], fila) },
        pendiente: null,
      }))
    } catch (e) {
      const porProyecto = { ...get().porProyecto, [projectId]: prevLista }
      set({
        porProyecto,
        pendiente: null,
        error: e instanceof Error ? e.message : 'No se pudo guardar la elección',
      })
    }
  },
}))
