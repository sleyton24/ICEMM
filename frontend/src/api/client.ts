/**
 * Cliente HTTP para hablar con el backend ICEMM.
 *
 * VITE_API_URL define el origen:
 *   - dev:  http://localhost:3001/api
 *   - prod: /api  (Nginx proxy_pass)
 *
 * En modo BETA el backend ignora el token; en producción se usa JWT guardado en localStorage.
 */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api'
const TOKEN_KEY = 'icemm.auth.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...init, headers })

  if (res.status === 204) return undefined as T

  let body: unknown = null
  try { body = await res.json() } catch { /* ignore */ }

  if (!res.ok) {
    const msg = (body as { error?: string })?.error ?? res.statusText
    throw new ApiError(res.status, msg, body)
  }
  return body as T
}

export const api = {
  get:    <T>(p: string) => request<T>(p),
  post:   <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch:  <T>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
}
