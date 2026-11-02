import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { validarCargaCuentas, diffCuentas, aplicarActualizar, type Cuenta, type Familia } from '../lib/maestroCuentas.js'

const router = Router()

const familiaSchema = z.object({
  codigo: z.number().int(),
  nombre: z.string(),
  nombreOriginal: z.string(),
  letra: z.string(),
  color: z.string(),
})

const cuentaSchema = z.object({
  codigo: z.number().int(),
  descripcion: z.string(),
  familiaCodigo: z.number().int(),
  letra: z.string(),
})

const planUploadSchema = z.object({
  version: z.string(),
  familias: z.array(familiaSchema),
  cuentas: z.array(cuentaSchema),
})

const productoSchema = z.object({
  codigo: z.string(),
  descripcion: z.string(),
  unidadMedida: z.string(),
  ctaCto: z.number(),
  letra: z.string(),
})

const maestroUploadSchema = z.object({
  version: z.string(),
  productos: z.array(productoSchema),
})

// GET active plan + maestro
router.get('/', async (_req, res) => {
  const plan = await prisma.planCuentas.findFirst({
    where: { activo: true },
    orderBy: { cargadoEn: 'desc' },
  })
  const maestro = await prisma.maestroProductos.findFirst({
    where: { activo: true },
    orderBy: { cargadoEn: 'desc' },
  })
  res.json({
    plan: plan ? toPlanDTO(plan) : null,
    maestro: maestro ? toMaestroDTO(maestro) : null,
  })
})

// POST: subir nuevo plan (reemplaza activo)
router.post('/', requireRole('admin'), async (req, res) => {
  const parsed = planUploadSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  // Marca planes previos como inactivos
  await prisma.planCuentas.updateMany({ where: { activo: true }, data: { activo: false } })

  const plan = await prisma.planCuentas.create({
    data: {
      version: parsed.data.version,
      origen: 'uploaded',
      familias: parsed.data.familias,
      cuentas: parsed.data.cuentas,
      activo: true,
    },
  })
  res.status(201).json(toPlanDTO(plan))
})

// POST maestro
router.post('/maestro', requireRole('admin'), async (req, res) => {
  const parsed = maestroUploadSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  await prisma.maestroProductos.updateMany({ where: { activo: true }, data: { activo: false } })

  const maestro = await prisma.maestroProductos.create({
    data: {
      version: parsed.data.version,
      origen: 'uploaded',
      productos: parsed.data.productos,
      activo: true,
    },
  })
  res.status(201).json(toMaestroDTO(maestro))
})

// DELETE: restaurar bundled (marca todo como inactivo → cliente caerá al JSON bundleado)
router.delete('/', requireRole('admin'), async (_req, res) => {
  await prisma.planCuentas.updateMany({ where: { activo: true }, data: { activo: false } })
  await prisma.maestroProductos.updateMany({ where: { activo: true }, data: { activo: false } })
  res.status(204).end()
})


// ── Maestro de cuentas: carga Excel en modo Actualizar (solo admin) ─────────

const cargaSchema = z.object({
  header: z.array(z.unknown()).max(50),
  rows: z.array(z.array(z.unknown()).max(50)),
  baseId: z.string().nullable().optional(),
})

async function planActivo() {
  return prisma.planCuentas.findFirst({ where: { activo: true }, orderBy: { cargadoEn: 'desc' } })
}

function evaluar(body: unknown, plan: any) {
  const parsed = cargaSchema.safeParse(body)
  if (!parsed.success) return { ok: false as const, body: { error: 'Payload inválido', issues: parsed.error.issues } }
  const familias = plan.familias as Familia[]
  const actuales = plan.cuentas as Cuenta[]
  const { errores, cuentas } = validarCargaCuentas(parsed.data.header, parsed.data.rows, familias)
  const diff = diffCuentas(actuales, cuentas)
  return { ok: true as const, parsed: parsed.data, errores, cuentas, diff, actuales }
}

router.post('/cuentas/preview', requireRole('admin'), async (req, res) => {
  const plan = await planActivo()
  if (!plan) return res.status(409).json({ error: 'No hay plan activo en la base. Ejecutar seed:plan primero.' })
  const r = evaluar(req.body, plan)
  if (!r.ok) return res.status(400).json(r.body)
  res.json({ baseId: plan.id, valido: r.errores.length === 0, errores: r.errores.slice(0, 200), totalErrores: r.errores.length, filasValidas: r.cuentas.length, diff: r.diff })
})

router.post('/cuentas/aplicar', requireRole('admin'), async (req, res) => {
  const plan = await planActivo()
  if (!plan) return res.status(409).json({ error: 'No hay plan activo en la base. Ejecutar seed:plan primero.' })
  const r = evaluar(req.body, plan)
  if (!r.ok) return res.status(400).json(r.body)
  if (r.parsed.baseId && r.parsed.baseId !== plan.id) return res.status(409).json({ error: 'El plan cambió desde la vista previa. Vuelve a subir el archivo.' })
  if (r.errores.length) return res.status(400).json({ error: 'El archivo tiene errores', errores: r.errores.slice(0, 200) })
  if (!r.diff.nuevas.length && !r.diff.modificadas.length) return res.json({ sinCambios: true, nuevas: 0, modificadas: 0, plan: toPlanDTO(plan) })

  const cuentas = aplicarActualizar(r.actuales, r.cuentas)
  const quien = req.user?.email ?? 'beta'
  const nuevo = await prisma.$transaction(async tx => {
    await tx.planCuentas.updateMany({ where: { activo: true }, data: { activo: false } })
    return tx.planCuentas.create({
      data: {
        version: `${new Date().toISOString().slice(0, 10)} (Excel ${quien})`,
        origen: 'uploaded',
        familias: plan.familias as any,
        cuentas: cuentas as any,
        activo: true,
      },
    })
  })
  console.log(`[plan-cuentas] actualizar por ${quien}: +${r.diff.nuevas.length} nuevas, ${r.diff.modificadas.length} modificadas`)
  res.json({ nuevas: r.diff.nuevas.length, modificadas: r.diff.modificadas.length, plan: toPlanDTO(nuevo) })
})

// ── DTOs ─────────────────────────────────────────────────────────────────────

function toPlanDTO(p: any) {
  return {
    id: p.id,
    version: p.version,
    cargadoEn: p.cargadoEn.toISOString(),
    origen: p.origen,
    familias: p.familias,
    cuentas: p.cuentas,
  }
}
function toMaestroDTO(m: any) {
  return {
    version: m.version,
    cargadoEn: m.cargadoEn.toISOString(),
    origen: m.origen,
    productos: m.productos,
  }
}

export default router
