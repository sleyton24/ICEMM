import { useState, useEffect } from 'react'
import { MessageSquare, Trash2, Send } from 'lucide-react'
import { api } from '../api/client'
import { useProjectsStore } from '../features/projects/ProjectsStore'
import { useCurrentUser } from '../features/auth/useCurrentUser'

interface Comentario {
  id: string
  projectId: string
  codigoPartida: string
  contenido: string
  autorEmail: string
  autorNombre: string
  fechaCreacion: string
}

export default function ComentariosSection({ codigo }: { codigo: string }) {
  const activeProjectId = useProjectsStore(s => s.activeProjectId)
  const { user, puedeEditar } = useCurrentUser()
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [loading, setLoading] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchComentarios = async () => {
    if (!activeProjectId) return
    setLoading(true)
    try {
      const data = await api.get<Comentario[]>(`/projects/${activeProjectId}/comentarios/${encodeURIComponent(codigo)}`)
      setComentarios(data)
    } catch (e: any) {
      setError(e.message ?? 'Error cargando comentarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchComentarios() }, [activeProjectId, codigo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevo.trim() || !activeProjectId) return
    setEnviando(true)
    setError(null)
    try {
      const c = await api.post<Comentario>(`/projects/${activeProjectId}/comentarios/${encodeURIComponent(codigo)}`, { contenido: nuevo.trim() })
      setComentarios(prev => [c, ...prev])
      setNuevo('')
    } catch (e: any) {
      setError(e.message ?? 'Error guardando comentario')
    } finally {
      setEnviando(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este comentario?')) return
    if (!activeProjectId) return
    try {
      await api.delete(`/projects/${activeProjectId}/comentarios/by-id/${id}`)
      setComentarios(prev => prev.filter(c => c.id !== id))
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    }
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-teal-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        Comentarios {comentarios.length > 0 && <span className="text-gray-400 font-normal">({comentarios.length})</span>}
      </p>

      {/* Form para agregar */}
      {puedeEditar && (
        <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
          <textarea
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            placeholder="Escribir un comentario..."
            rows={2}
            className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30 resize-none"
          />
          <button
            type="submit"
            disabled={!nuevo.trim() || enviando}
            className="flex items-center gap-1.5 px-3 py-2 bg-navy text-white text-xs font-medium rounded-lg hover:bg-navy-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-end"
          >
            <Send className="h-3.5 w-3.5" />
            {enviando ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">
          {error}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-xs text-gray-400 italic">Cargando...</p>
      ) : comentarios.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Sin comentarios en esta partida.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {comentarios.map(c => {
            const puedeEliminar = user && (user.rol === 'admin' || c.autorEmail === user.email)
            return (
              <div key={c.id} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="text-xs font-semibold text-navy">{c.autorNombre || c.autorEmail}</p>
                    <p className="text-[10px] text-gray-400">{new Date(c.fechaCreacion).toLocaleString('es-CL')}</p>
                  </div>
                  {puedeEliminar && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-gray-300 hover:text-accent transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.contenido}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
