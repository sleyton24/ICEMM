import { useState, useEffect, useRef } from 'react'
import { FileText, Check, ChevronDown, Lock, Plus } from 'lucide-react'
import { useProjectsStore } from '../projects/ProjectsStore'
import { useInformesStore } from './InformesStore'

/**
 * Selector compacto de informes en el header del proyecto.
 *
 * - Vista por defecto: "Borrador" (datos del proyecto activo, editables)
 * - Cuando hay informes aprobados: dropdown con cada uno (read-only)
 * - Botón "Aprobar como Informe N°X" para guardar snapshot del estado actual
 */
export default function InformeSelector({ esAdmin = true }: { esAdmin?: boolean }) {
  const activeProjectId = useProjectsStore(s => s.activeProjectId)
  const { porProyecto, viewPorProyecto, fetchInformes, fetchSnapshot, aprobar, eliminar, setView } = useInformesStore()
  const [open, setOpen] = useState(false)
  const [aprobando, setAprobando] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeProjectId) return
    fetchInformes(activeProjectId).catch(() => { /* ignore */ })
  }, [activeProjectId, fetchInformes])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!activeProjectId) return null

  const informes = porProyecto[activeProjectId] ?? []
  const view = viewPorProyecto[activeProjectId] ?? { tipo: 'borrador' as const }
  const proximoNumero = (informes[0]?.numero ?? 0) + 1

  const handleSelectBorrador = () => {
    setView(activeProjectId, { tipo: 'borrador' })
    setOpen(false)
  }

  const handleSelectInforme = async (informeId: string) => {
    try {
      const snap = await fetchSnapshot(activeProjectId, informeId)
      setView(activeProjectId, { tipo: 'aprobado', informe: snap })
      setOpen(false)
    } catch (e) {
      console.error('Error cargando informe', e)
    }
  }

  const handleAprobar = async () => {
    if (!confirm(`¿Aprobar el estado actual como Informe N°${proximoNumero}? Esta acción es irreversible.`)) return
    setAprobando(true)
    try {
      await aprobar(activeProjectId)
      alert(`Informe N°${proximoNumero} aprobado correctamente.`)
    } catch (e: any) {
      alert(`Error: ${e.message ?? 'no se pudo aprobar'}`)
    } finally {
      setAprobando(false)
    }
  }

  const handleEliminar = async (informeId: string, numero: number) => {
    if (!confirm(`¿Eliminar Informe N°${numero}? Esta acción es irreversible.`)) return
    try {
      await eliminar(activeProjectId, informeId)
      // Si estábamos viendo ese informe, volver a borrador
      if (view.tipo === 'aprobado' && view.informe.id === informeId) {
        setView(activeProjectId, { tipo: 'borrador' })
      }
    } catch (e: any) {
      alert(`Error: ${e.message ?? 'no se pudo eliminar'}`)
    }
  }

  const labelActual = view.tipo === 'borrador'
    ? 'Borrador'
    : `Informe N°${view.informe.numero}`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs transition-colors
          ${view.tipo === 'aprobado'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-gray-200 bg-white text-navy hover:bg-surface'}`}
      >
        {view.tipo === 'aprobado' ? <Lock className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5 text-teal-muted" />}
        <span className="font-medium">{labelActual}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-72 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
          {/* Borrador */}
          <button
            onClick={handleSelectBorrador}
            className={`w-full flex items-start gap-2 px-4 py-3 text-left border-b border-gray-100 hover:bg-surface
              ${view.tipo === 'borrador' ? 'bg-teal-light/30' : ''}`}
          >
            <FileText className="h-4 w-4 text-teal-muted flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-navy">Borrador (editable)</p>
              <p className="text-[11px] text-gray-400">Estado actual del proyecto</p>
            </div>
            {view.tipo === 'borrador' && <Check className="h-4 w-4 text-teal-muted flex-shrink-0" />}
          </button>

          {/* Informes aprobados */}
          {informes.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-gray-400 italic">No hay informes aprobados aún</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {informes.map(i => {
                const isActive = view.tipo === 'aprobado' && view.informe.id === i.id
                return (
                  <div key={i.id} className={`flex items-start gap-2 px-4 py-3 hover:bg-surface border-b border-gray-50 last:border-b-0 ${isActive ? 'bg-emerald-50' : ''}`}>
                    <button onClick={() => handleSelectInforme(i.id)} className="flex items-start gap-2 flex-1 text-left min-w-0">
                      <Lock className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-navy">Informe N°{i.numero}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {new Date(i.fechaAprobacion).toLocaleDateString('es-CL')} · {i.aprobadoPor}
                        </p>
                      </div>
                      {isActive && <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />}
                    </button>
                    {esAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEliminar(i.id, i.numero) }}
                        className="text-[10px] text-gray-300 hover:text-accent transition-colors flex-shrink-0"
                        title="Eliminar informe"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Aprobar */}
          {esAdmin && (
            <button
              onClick={handleAprobar}
              disabled={aprobando}
              className="w-full flex items-center gap-2 px-4 py-3 border-t-2 border-navy/10 bg-navy text-white text-xs font-medium hover:bg-navy-light transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {aprobando ? 'Aprobando...' : `Aprobar como Informe N°${proximoNumero}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
