import { create } from 'zustand'
import { api } from '../../api/client'

export type Rol = 'admin' | 'editor' | 'viewer'

export interface CurrentUser {
  id: string
  email: string
  nombre: string
  rol: Rol
}

interface UserState {
  user: CurrentUser | null
  beta: boolean
  loaded: boolean

  fetch: () => Promise<void>
  setUser: (u: CurrentUser | null, beta: boolean) => void
  clear: () => void

  // Helpers de permisos
  esAdmin: () => boolean
  puedeEditar: () => boolean
  esLector: () => boolean
}

export const useCurrentUserStore = create<UserState>((set, get) => ({
  user: null,
  beta: false,
  loaded: false,

  fetch: async () => {
    try {
      const me = await api.get<{ beta: boolean; user: CurrentUser | null }>('/auth/me')
      set({ user: me.user, beta: me.beta, loaded: true })
    } catch {
      set({ user: null, beta: false, loaded: true })
    }
  },

  setUser: (user, beta) => set({ user, beta, loaded: true }),
  clear: () => set({ user: null, beta: false, loaded: false }),

  esAdmin: () => get().user?.rol === 'admin',
  puedeEditar: () => {
    const r = get().user?.rol
    return r === 'admin' || r === 'editor'
  },
  esLector: () => get().user?.rol === 'viewer',
}))

// Hook conveniente con métodos memoizados
export function useCurrentUser() {
  const state = useCurrentUserStore()
  return {
    user: state.user,
    beta: state.beta,
    loaded: state.loaded,
    esAdmin: state.user?.rol === 'admin',
    puedeEditar: state.user?.rol === 'admin' || state.user?.rol === 'editor',
    esLector: state.user?.rol === 'viewer',
  }
}
