import type { Proyecto } from '../projects/types'
import type { EleccionProyeccionDTO } from './aplicarEleccionProyeccion'

export interface InformeListItem {
  id: string
  numero: number
  estado: 'aprobado'
  fechaAprobacion: string
  aprobadoPor: string
  comentario: string | null
}

export interface InformeFull extends InformeListItem {
  /** Snapshot completo del proyecto al momento de aprobar (tiene la misma forma que un Proyecto) */
  snapshot: Pick<Proyecto, 'nombre' | 'unidadNegocioCodigo' | 'cutoffMesReal' | 'slots'> & {
    fechaCorte: string
    /** Ausente en informes aprobados antes de esta elección: se leen como Presto. */
    eleccionesProyeccion?: EleccionProyeccionDTO[]
  }
}

/** Estado de visualización: en qué informe estamos parados */
export type InformeView =
  | { tipo: 'borrador' }                  // proyecto activo (datos del Project)
  | { tipo: 'aprobado'; informe: InformeFull }
