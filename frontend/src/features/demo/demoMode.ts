/**
 * Modo demo: se activa con ?demo=1 en la URL.
 *
 * No toca el backend ni el flujo normal de login — si el parámetro no está,
 * la app se comporta exactamente igual que antes. Sirve para mostrar la
 * herramienta sin credenciales de producción y sin base de datos local.
 */

const PARAM = 'demo'

/** Compilado con VITE_DEMO=true: toda la app arranca en demo (ver `npm run dev:demo`). */
const DEMO_POR_ENTORNO = (import.meta.env.VITE_DEMO as string | undefined) === 'true'

export function esDemoMode(): boolean {
  if (DEMO_POR_ENTORNO) return true
  if (typeof window === 'undefined') return false
  const v = new URLSearchParams(window.location.search).get(PARAM)
  return v === '1' || v === 'true'
}

export type RolDemo = 'admin' | 'editor' | 'viewer' | 'director'
const ROLES: RolDemo[] = ['admin', 'editor', 'viewer', 'director']

/**
 * Rol con el que corre la demo: ?demo=1&rol=viewer
 *
 * Sirve para revisar qué ve cada perfil sin tener que crear usuarios. Por
 * defecto admin, que es lo que se quiere al mostrar la herramienta completa.
 */
export function rolDemo(): RolDemo {
  if (typeof window === 'undefined') return 'admin'
  const v = new URLSearchParams(window.location.search).get('rol') as RolDemo | null
  return v && ROLES.includes(v) ? v : 'admin'
}

/** Sale del modo demo recargando en la URL limpia. */
export function salirDemo() {
  const url = new URL(window.location.href)
  url.searchParams.delete(PARAM)
  window.location.href = url.toString()
}
