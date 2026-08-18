import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../env.js'
import { prisma } from '../db.js'

/**
 * Auth middleware con dos modos:
 *
 *   BETA_MODE=true   → acceso libre (gerencia probando, sin login)
 *   BETA_MODE=false  → requiere Bearer JWT firmado con JWT_SECRET
 *
 * Adjunta `req.user` cuando hay sesión real.
 *
 * Nota: env.ts ya garantizó al arrancar que JWT_SECRET es válido siempre que
 * pueda usarse (prod, o fuera de BETA), y que NODE_ENV=production nunca corre
 * en BETA. Acá no hay fallback de secreto.
 */

export interface AuthUser {
  id: string
  email: string
  nombre: string
  rol: 'admin' | 'editor' | 'viewer' | 'director'
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
    isBeta?: boolean
  }
}

const BETA_MODE = env.BETA_MODE
const JWT_SECRET = env.JWT_SECRET

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

/**
 * Autorización a nivel de recurso: exige que el usuario tenga acceso al
 * proyecto identificado por `req.params.id` (o el `:id` del router padre).
 *
 *   - BETA_MODE       → pasa (no hay usuarios reales).
 *   - admin           → pasa (ve todos los proyectos).
 *   - editor/viewer   → solo si existe el vínculo UserProject.
 *
 * Cierra el IDOR: sin esto, el filtro por proyecto asignado solo se aplicaba
 * al listado (GET /), y cualquiera con un UUID podía leer/mutar proyectos
 * ajenos vía GET/PATCH/:id, slots, ERP, informes y comentarios.
 *
 * Devuelve 404 (no 403) cuando no hay acceso para no revelar la existencia
 * del proyecto a quien no debería verlo.
 */
export async function assertProjectAccess(req: Request, res: Response, next: NextFunction) {
  if (req.isBeta) return next()
  if (!req.user) return res.status(401).json({ error: 'No autenticado' })
  if (req.user.rol === 'admin') return next()

  const projectId = req.params.id
  if (!projectId) return res.status(400).json({ error: 'projectId requerido' })

  const link = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: req.user.id, projectId } },
    select: { userId: true },
  })
  if (!link) return res.status(404).json({ error: 'No encontrado' })
  next()
}

export function signToken(user: AuthUser, expiresIn: string = '7d'): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn } as jwt.SignOptions)
}
