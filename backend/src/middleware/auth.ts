import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

/**
 * Auth middleware con dos modos:
 *
 *   BETA_MODE=true   → acceso libre (gerencia probando, sin login)
 *   BETA_MODE=false  → requiere Bearer JWT firmado con JWT_SECRET
 *
 * Adjunta `req.user` cuando hay sesión real.
 */

export interface AuthUser {
  id: string
  email: string
  nombre: string
  rol: 'admin' | 'editor' | 'viewer'
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
    isBeta?: boolean
  }
}

const BETA_MODE = process.env.BETA_MODE === 'true'
const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (BETA_MODE) {
    req.isBeta = true
    return next()
  }

  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' })
  }
  const token = auth.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

/**
 * Middleware "soft": setea req.isBeta y req.user si hay token válido,
 * pero NO bloquea si no hay credenciales. Para endpoints públicos (ej: /auth/me).
 */
export function softAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (BETA_MODE) {
    req.isBeta = true
    return next()
  }
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET) as AuthUser
      req.user = payload
    } catch { /* ignore — sin user */ }
  }
  next()
}

/** Permite acción solo a roles indicados. En BETA_MODE deja pasar todo. */
export function requireRole(...roles: AuthUser['rol'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.isBeta) return next()
    if (!req.user) return res.status(401).json({ error: 'No autenticado' })
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Permiso insuficiente' })
    }
    next()
  }
}

export function signToken(user: AuthUser, expiresIn: string = '7d'): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn } as jwt.SignOptions)
}
