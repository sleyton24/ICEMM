import { useState, useEffect } from 'react'
import { Users, UserPlus, Trash2, X, AlertTriangle, Check, Pencil, FolderOpen } from 'lucide-react'
import { api } from '../../api/client'

interface ProjectMini {
  id: string
  nombre: string
}

interface UserRow {
  id: string
  email: string
  nombre: string
  rol: 'admin' | 'editor' | 'viewer'
  activo: boolean
  fechaCreacion: string
}

interface Props {
  onBack: () => void
}

export default function AdminUsersPage({ onBack }: Props) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [creating, setCreating] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<UserRow[]>('/users')
      setUsers(data)
    } catch (e: any) {
      setError(e.message ?? 'Error cargando usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const handleDelete = async (u: UserRow) => {
    if (!confirm(`¿Eliminar a "${u.nombre}" (${u.email})? Esta acción es irreversible.`)) return
    try {
      await api.delete(`/users/${u.id}`)
      await fetchUsers()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    }
  }

  const handleToggleActivo = async (u: UserRow) => {
    try {
      await api.patch(`/users/${u.id}`, { activo: !u.activo })
      await fetchUsers()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="h-1 bg-gradient-to-r from-navy via-teal to-accent" />

      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <button onClick={onBack} className="text-xs text-teal-muted hover:text-navy transition-colors mb-1">
              &larr; Volver al dashboard
            </button>
            <h1 className="text-lg font-bold text-navy font-slab flex items-center gap-2">
              <Users className="h-5 w-5" /> Administración de Usuarios
            </h1>
            <p className="text-[11px] text-gray-400">{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white text-xs font-medium rounded-lg hover:bg-navy-light transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" /> Crear usuario
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Creado</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Cargando...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No hay usuarios. Crear el primero.</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className={`hover:bg-surface ${!u.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-navy">{u.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      u.rol === 'admin' ? 'bg-navy text-white' :
                      u.rol === 'editor' ? 'bg-teal-light text-navy' :
                      'bg-gray-100 text-gray-500'
                    }`}>{u.rol}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActivo(u)}
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
                        u.activo
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(u.fechaCreacion).toLocaleDateString('es-CL')}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(u)}
                        className="p-1.5 text-gray-400 hover:text-navy rounded hover:bg-surface transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        className="p-1.5 text-gray-400 hover:text-accent rounded hover:bg-red-50 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <UserFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); fetchUsers() }}
        />
      )}
      {editing && (
        <UserFormModal
          mode="edit"
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchUsers() }}
        />
      )}
    </div>
  )
}

// ── Modal de crear/editar ────────────────────────────────────────────────────

interface FormProps {
  mode: 'create' | 'edit'
  user?: UserRow
  onClose: () => void
  onSaved: () => void
}

function UserFormModal({ mode, user, onClose, onSaved }: FormProps) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [nombre, setNombre] = useState(user?.nombre ?? '')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<'admin' | 'editor' | 'viewer'>(user?.rol ?? 'viewer')
  const [activo, setActivo] = useState(user?.activo ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Proyectos accesibles (no aplica a admin — admin ve todos por definición)
  const [allProjects, setAllProjects] = useState<ProjectMini[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Cargar lista de todos los proyectos
    api.get<ProjectMini[]>('/projects').then(ps => setAllProjects(ps.map(p => ({ id: p.id, nombre: p.nombre }))))
    // Si editamos un user existente, traer sus asignaciones
    if (mode === 'edit' && user) {
      api.get<string[]>(`/users/${user.id}/projects`).then(ids => setAssignedIds(new Set(ids)))
    }
  }, [mode, user])

  const toggleProject = (id: string) => {
    setAssignedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      let userId: string
      if (mode === 'create') {
        const created = await api.post<{ id: string }>('/users', { email, nombre, password, rol, activo })
        userId = created.id
      } else {
        const payload: Record<string, unknown> = { nombre, rol, activo }
        if (password) payload.password = password
        await api.patch(`/users/${user!.id}`, payload)
        userId = user!.id
      }
      // Guardar asignaciones de proyectos (irrelevante si rol=admin pero se guarda igual sin efecto)
      if (rol !== 'admin') {
        await api.put(`/users/${userId}/projects`, { projectIds: Array.from(assignedIds) })
      } else {
        // Limpiar asignaciones explícitas: admin ve todos
        await api.put(`/users/${userId}/projects`, { projectIds: [] })
      }
      onSaved()
    } catch (e: any) {
      setError(e.message ?? 'Error guardando usuario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-navy font-slab">
            {mode === 'create' ? 'Crear nuevo usuario' : `Editar ${user?.nombre}`}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">Email / Usuario</label>
            <input
              type="text"
              required
              disabled={mode === 'edit'}
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">Nombre</label>
            <input
              type="text"
              required
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">
              Contraseña {mode === 'edit' && <span className="text-gray-300 normal-case">(dejar vacío para no cambiar)</span>}
            </label>
            <input
              type="password"
              required={mode === 'create'}
              minLength={4}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'edit' ? 'Sin cambios' : 'Mínimo 4 caracteres'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">Rol</label>
            <select
              value={rol}
              onChange={e => setRol(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30 bg-white"
            >
              <option value="admin">Admin — control total</option>
              <option value="editor">Editor — carga archivos y edita</option>
              <option value="viewer">Viewer — solo lectura</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={activo}
              onChange={e => setActivo(e.target.checked)}
              className="rounded border-gray-300"
            />
            Usuario activo
          </label>

          {/* Proyectos accesibles — solo visible si rol != admin */}
          {rol !== 'admin' && (
            <div className="pt-3 border-t border-gray-100">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <FolderOpen className="h-3.5 w-3.5" />
                Proyectos accesibles
              </label>
              {allProjects.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">No hay proyectos para asignar.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1 bg-gray-50/50">
                  {allProjects.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1 text-sm text-gray-700 hover:bg-white cursor-pointer rounded">
                      <input
                        type="checkbox"
                        checked={assignedIds.has(p.id)}
                        onChange={() => toggleProject(p.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="truncate">{p.nombre}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-1">
                Si no asignás ninguno, el usuario no podrá ver ningún proyecto.
              </p>
            </div>
          )}
          {rol === 'admin' && (
            <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <strong>Admin</strong> ve todos los proyectos automáticamente.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-light transition-colors disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
