import { useState } from 'react'
import { ChevronDown, Plus, Trash2, FolderOpen, Upload } from 'lucide-react'
import { useProjectsStore } from './ProjectsStore'
import UploadPanel from '../data-upload/UploadPanel'

export default function ProjectSwitcher() {
  const { projects, activeProjectId, createProject, deleteProject, setActiveProject, activeProject: getActive } = useProjectsStore()
  const active = getActive()
  const [open, setOpen] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [showUpload, setShowUpload] = useState(false)

  const handleCreate = () => {
    if (!newName.trim()) return
    createProject(newName.trim())
    setNewName('')
    setShowNew(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-surface border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
      >
        <FolderOpen className="h-4 w-4 text-teal-muted" />
        <span className="text-navy font-medium max-w-40 truncate">
          {active?.nombre || 'Sin proyecto'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
            {/* Project list */}
            <div className="max-h-60 overflow-y-auto">
              {projects.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-gray-300">No hay proyectos creados</p>
              )}
              {projects.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors
                    ${p.id === activeProjectId ? 'bg-teal-light/30' : 'hover:bg-surface'}`}
                  onClick={() => { setActiveProject(p.id); setOpen(false) }}
                >
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${p.id === activeProjectId ? 'font-semibold text-navy' : 'text-gray-700'}`}>
                      {p.nombre}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {[
                        p.slots.presupuesto_original && 'Ppto',
                        p.slots.presupuesto_redistribuido && 'Redistrib',
                        p.slots.ppto_horas_extra && 'OO.EE.',
                        p.slots.gasto_real_erp && 'Real',
                        p.slots.proyectado && 'Proy',
                      ].filter(Boolean).join(' · ') || 'Sin archivos'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {p.id === activeProjectId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowUpload(true); setOpen(false) }}
                        className="p-1 text-teal-muted hover:text-navy transition-colors"
                        title="Cargar archivos"
                      >
                        <Upload className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar "${p.nombre}"?`)) deleteProject(p.id) }}
                      className="p-1 text-gray-300 hover:text-accent transition-colors"
                      title="Eliminar proyecto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Create new */}
            <div className="border-t border-gray-100 p-3">
              {showNew ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="Nombre del proyecto..."
                    className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30 placeholder:text-gray-300"
                  />
                  <button onClick={handleCreate} className="px-3 py-1.5 bg-navy text-white text-xs font-medium rounded-lg hover:bg-navy-light transition-colors">
                    Crear
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNew(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-teal-muted hover:text-navy font-medium transition-colors rounded-lg hover:bg-surface"
                >
                  <Plus className="h-4 w-4" /> Nuevo proyecto
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Upload modal */}
      {showUpload && active && (
        <UploadPanel proyecto={active} onClose={() => setShowUpload(false)} />
      )}
    </div>
  )
}
