import { env } from './env.js'   // valida config y aborta el arranque si es insegura — debe ir primero
import express from 'express'
import 'express-async-errors'      // hace que los rechazos de promesa en handlers async lleguen al error handler
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { authMiddleware, softAuthMiddleware } from './middleware/auth.js'
import authRouter from './routes/auth.js'
import projectsRouter from './routes/projects.js'
import planCuentasRouter from './routes/planCuentas.js'
import usersRouter from './routes/users.js'

const app = express()
const PORT = env.PORT
const BETA_MODE = env.BETA_MODE

// Detrás de Nginx: confiar en el primer proxy para que rate-limit y logs vean la IP real.
app.set('trust proxy', 1)

app.use(helmet())
app.use(cors({
  origin: env.CORS_ORIGINS,
  credentials: true,
}))
app.use(express.json({ limit: '50mb' }))   // archivos parseados pueden ser grandes
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(morgan('tiny'))

// Rate limit general (proteger login y endpoints)
const limiter = rateLimit({ windowMs: 60_000, limit: 200, standardHeaders: true })
app.use(limiter)

import { prisma } from './db.js'

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      ok: true,
      beta: BETA_MODE,
      db: 'up',
      ts: new Date().toISOString(),
      uptime: process.uptime(),
    })
  } catch (e: any) {
    res.status(503).json({ ok: false, db: 'down', error: e.message })
  }
})

// Auth público (login/me) — login no exige auth previa.
// softAuth para que /me pueda detectar BETA_MODE y leer user si hay token.
app.use('/api/auth', softAuthMiddleware, authRouter)

// Rutas protegidas
app.use('/api/projects', authMiddleware, projectsRouter)
app.use('/api/plan-cuentas', authMiddleware, planCuentasRouter)
app.use('/api/users', authMiddleware, usersRouter)

// 404 + error handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Log completo en el servidor; al cliente solo un mensaje genérico en prod
  // para no filtrar detalles internos (queries, stack, etc.).
  console.error(err)
  if (res.headersSent) return
  res.status(500).json({ error: env.isProd ? 'Error interno' : (err.message ?? 'Error interno') })
})

app.listen(PORT, () => {
  console.log(`ICEMM API on :${PORT} | BETA_MODE=${BETA_MODE}`)
})
