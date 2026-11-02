/**
 * Qué obras históricas usa el administrador para estimar la curva de una cuenta.
 *
 * Se recuerda en el navegador, por obra (proyecto) y por cuenta. La elección
 * Presto/modelo del informe vive en la base; esto es la preferencia de lectura
 * del selector, que además viaja al informe cuando se pasa la curva.
 */

const KEY = 'icemm.obrasReferencia.v1'

type Mapa = Record<string, Record<string, string[]>>

function leerMapa(): Mapa {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) as Mapa : {}
  } catch {
    return {}
  }
}

function guardarMapa(mapa: Mapa) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(mapa))
}

/** null = nunca se eligió: el panel usa todas, que es la mezcla por similitud. */
export function leerObrasReferencia(projectId: string, cuenta: string): string[] | null {
  const lista = leerMapa()[projectId]?.[cuenta]
  return Array.isArray(lista) ? lista.filter(n => typeof n === 'string') : null
}

export function guardarObrasReferencia(projectId: string, cuenta: string, obras: string[]) {
  const mapa = leerMapa()
  const delProyecto = { ...(mapa[projectId] ?? {}), [cuenta]: obras }
  guardarMapa({ ...mapa, [projectId]: delProyecto })
}

export function olvidarObrasReferencia(projectId: string, cuenta: string) {
  const mapa = leerMapa()
  const delProyecto = { ...(mapa[projectId] ?? {}) }
  delete delProyecto[cuenta]
  guardarMapa({ ...mapa, [projectId]: delProyecto })
}
