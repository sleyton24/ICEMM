import { Router, type Request } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router({ mergeParams: true })

function params(req: Request): { id: string; codigo?: string } {
  return req.params as unknown as { id: string; codigo?: string }
}

function autor(req: Request): string {
  return req.user?.email ?? 'beta-mode'
}

const puntoSchema = z.object({
  ym: z.string().min(1).max(10),
  acumTipica: z.number().finite(),
  acumReanclada: z.number().finite().nullable(),
})

const sugerirSchema = z.object({
  accion: z.literal('sugerir'),
  cierreTipica: z.number().finite().nonnegative(),
  cierreReanclada: z.number().finite().nonnegative().nullable(),
  serie: z.array(puntoSchema).max(240).optional(),
  obrasReferencia: z.array(z.string().min(1).max(120)).max(30),
})

const elegirSchema = z.object({
  accion: z.literal('elegir'),
  fuente: z.enum(['presto', 'modelo']),
  curva: z.enum(['tipica', 'reanclada']).nullable().optional(),
})

const bodySchema = z.discriminatedUnion('accion', [sugerirSchema, elegirSchema])

function aDTO(e: {
  id: string
  projectId: string
  codigoCuenta: string
  fuente: string
  curva: string | null
  cierreTipica: number | null
  cierreReanclada: number | null
  serie: unknown
  obrasReferencia: string[]
  pasadoPor: string | null
  pasadoEn: Date | null
  elegidoPor: string | null
  elegidoEn: Date | null
}) {
  return {
    id: e.id,
    projectId: e.projectId,
    codigoCuenta: e.codigoCuenta,
    fuente: e.fuente === 'modelo' ? 'modelo' : 'presto',
    curva: e.curva === 'tipica' || e.curva === 'reanclada' ? e.curva : null,
    cierreTipica: e.cierreTipica,
    cierreReanclada: e.cierreReanclada,
    serie: e.serie ?? null,
    obrasReferencia: e.obrasReferencia,
    pasadoPor: e.pasadoPor,
    pasadoEn: e.pasadoEn?.toISOString() ?? null,
    elegidoPor: e.elegidoPor,
    elegidoEn: e.elegidoEn?.toISOString() ?? null,
  }
}

/**
 * GET /api/projects/:id/elecciones-proyeccion
 * Elecciones de proyección por cuenta. Vacío = el informe sigue en Presto.
 */
router.get('/', async (req, res) => {
  const filas = await prisma.eleccionProyeccion.findMany({
    where: { projectId: params(req).id },
    orderBy: { codigoCuenta: 'asc' },
  })
  res.json(filas.map(aDTO))
})

/**
 * PUT /api/projects/:id/elecciones-proyeccion/:codigo
 *
 * accion "sugerir": deja los cierres del modelo disponibles en el informe.
 *   No cambia la fuente si ya había una elección, salvo que el cierre elegido
 *   deje de existir.
 * accion "elegir": el administrador elige Presto, la curva típica o la
 *   re-anclada. Queda registrado quién y cuándo.
 */
router.put('/:codigo', requireRole('admin'), async (req, res) => {
  const codigo = params(req).codigo ?? ''
  if (!/^\d{3,4}$/.test(codigo)) {
    return res.status(400).json({ error: 'Código de cuenta inválido' })
  }
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })
  }

  const projectId = params(req).id
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

  const actual = await prisma.eleccionProyeccion.findUnique({
    where: { projectId_codigoCuenta: { projectId, codigoCuenta: codigo } },
  })

  const body = parsed.data
  if (body.accion === 'sugerir') {
    let fuente = actual?.fuente ?? 'presto'
    let curva = actual?.curva ?? null
    if (fuente === 'modelo') {
      const cierre = curva === 'reanclada' ? body.cierreReanclada : body.cierreTipica
      if (cierre == null) {
        fuente = 'presto'
        curva = null
      }
    }
    const fila = await prisma.eleccionProyeccion.upsert({
      where: { projectId_codigoCuenta: { projectId, codigoCuenta: codigo } },
      create: {
        projectId,
        codigoCuenta: codigo,
        fuente: 'presto',
        cierreTipica: body.cierreTipica,
        cierreReanclada: body.cierreReanclada,
        serie: body.serie ?? undefined,
        obrasReferencia: body.obrasReferencia,
        pasadoPor: autor(req),
        pasadoEn: new Date(),
      },
      update: {
        fuente,
        curva,
        cierreTipica: body.cierreTipica,
        cierreReanclada: body.cierreReanclada,
        serie: body.serie ?? undefined,
        obrasReferencia: body.obrasReferencia,
        pasadoPor: autor(req),
        pasadoEn: new Date(),
      },
    })
    return res.json(aDTO(fila))
  }

  if (!actual || actual.cierreTipica == null) {
    return res.status(400).json({
      error: 'No hay curva del modelo para esta cuenta. Pasala desde Proyección.',
    })
  }
  if (body.fuente === 'modelo') {
    const curva = body.curva
    if (curva !== 'tipica' && curva !== 'reanclada') {
      return res.status(400).json({ error: 'Elegí la curva típica o la re-anclada al real.' })
    }
    if (curva === 'reanclada' && actual.cierreReanclada == null) {
      return res.status(400).json({
        error: 'Esta cuenta no tiene curva re-anclada al real. Elegí la típica o Presto.',
      })
    }
    const fila = await prisma.eleccionProyeccion.update({
      where: { id: actual.id },
      data: {
        fuente: 'modelo',
        curva,
        elegidoPor: autor(req),
        elegidoEn: new Date(),
      },
    })
    return res.json(aDTO(fila))
  }

  const fila = await prisma.eleccionProyeccion.update({
    where: { id: actual.id },
    data: {
      fuente: 'presto',
      curva: null,
      elegidoPor: autor(req),
      elegidoEn: new Date(),
    },
  })
  res.json(aDTO(fila))
})

export default router
