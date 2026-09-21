import { create } from 'zustand'

export type Tema = 'claro' | 'oscuro'

const CLAVE = 'icemm.tema'

/** Lo que el sistema operativo del usuario prefiere, si no eligió nada. */
function temaDelSistema(): Tema {
  if (typeof window === 'undefined' || !window.matchMedia) return 'claro'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

function temaGuardado(): Tema | null {
  try {
    const v = localStorage.getItem(CLAVE)
    return v === 'claro' || v === 'oscuro' ? v : null
  } catch {
    // Ventana privada o cookies bloqueadas: se sigue sin preferencia guardada.
    return null
  }
}

/** El tema es un atributo en <html>; el CSS redefine las variables debajo. */
function aplicar(tema: Tema) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-tema', tema)
  }
}

interface TemaState {
  tema: Tema
  /** true si el usuario eligió explícitamente; false si viene del sistema. */
  elegido: boolean
  setTema: (t: Tema) => void
  alternar: () => void
}

const inicial = temaGuardado()
aplicar(inicial ?? temaDelSistema())

export const useTemaStore = create<TemaState>((set, get) => ({
  tema: inicial ?? temaDelSistema(),
  elegido: inicial !== null,

  setTema: (t: Tema) => {
    aplicar(t)
    try { localStorage.setItem(CLAVE, t) } catch { /* sin persistencia */ }
    set({ tema: t, elegido: true })
  },

  alternar: () => get().setTema(get().tema === 'claro' ? 'oscuro' : 'claro'),
}))

// Mientras el usuario no haya elegido, seguir al sistema si cambia.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (useTemaStore.getState().elegido) return
    const t: Tema = e.matches ? 'oscuro' : 'claro'
    aplicar(t)
    useTemaStore.setState({ tema: t })
  })
}
