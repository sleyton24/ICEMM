import { useEffect, useState } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import { api, setToken } from '../../api/client'

type AuthState =
  | { status: 'loading' }
  | { status: 'beta' }                      // backend en BETA_MODE — no se requiere login
  | { status: 'authed'; user: AuthUser }
  | { status: 'login' }
  | { status: 'error'; message: string }

interface AuthUser {
  id: string
  email: string
  nombre: string
  rol: 'admin' | 'editor' | 'viewer'
}

/**
 * Envoltorio que verifica el modo del backend al iniciar:
 *   - Si BETA → renderiza children directo
 *   - Si requiere login y hay token válido → renderiza children
 *   - Si requiere login y no hay token → muestra LoginForm
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const checkAuth = async () => {
    try {
      const me = await api.get<{ beta: boolean; user: AuthUser | null }>('/auth/me')
      if (me.beta) setState({ status: 'beta' })
      else if (me.user) setState({ status: 'authed', user: me.user })
      else {
        setToken(null)
        setState({ status: 'login' })
      }
    } catch (e: any) {
      setState({ status: 'error', message: e.message ?? 'Error conectando al servidor' })
    }
  }

  useEffect(() => { checkAuth() }, [])

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex items-center gap-3 text-teal-muted">
          <div className="w-5 h-5 border-2 border-teal-muted border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Conectando...</span>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="bg-white border border-red-200 rounded-2xl shadow-lg max-w-md p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-navy font-slab mb-1">Error de conexión</h2>
          <p className="text-sm text-gray-500 mb-4">{state.message}</p>
          <button onClick={checkAuth} className="px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-light">
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (state.status === 'login') {
    return <LoginForm onSuccess={checkAuth} />
  }

  return <>{children}</>
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { token } = await api.post<{ token: string }>('/auth/login', { email, password })
      setToken(token)
      onSuccess()
    } catch (e: any) {
      setError(e.message ?? 'Credenciales inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="h-1 bg-gradient-to-r from-navy via-teal to-accent absolute top-0 left-0 right-0" />
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-gray-100 max-w-sm w-full p-7 space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-navy rounded-xl">
            <Lock className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-bold text-navy font-slab">ICEMM</h2>
          <p className="text-[11px] text-teal-muted uppercase tracking-widest">Informe de Resultado de Obra</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full px-4 py-2.5 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
