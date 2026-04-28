import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'

const router = Router()

const ITEMIZADO_SLOTS = ['presupuesto_original', 'presupuesto_redistribuido', 'ppto_horas_extra', 'proyectado'] as const
type ItemizadoSlot = typeof ITEMIZADO_SLOTS[number]

// ── List / create / read / update / delete ───────────────────────────────────

router.get('/', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { fechaActualizacion: 'desc' },
    include: { archivos: true, erp: true },
  })
  res.json(projects.map(toProyectoDTO))
})

router.post('/', async (req, res) => {
  const parsed = z.object({ nombre: z.string().min(1) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'nombre requerido' })
  const project = await prisma.project.create({
    data: { nombre: parsed.data.nombre },
    include: { archivos: true, erp: true },
  })
  res.status(201).json(toProyectoDTO(project))
})

router.get('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: { archivos: true, erp: true },
  })
  if (!project) return res.status(404).json({ error: 'No encontrado' })
  res.json(toProyectoDTO(project))
})

router.patch('/:id', async (req, res) => {
  const parsed = z.object({
    nombre: z.string().optional(),
    cutoffMesReal: z.string().nullable().optional(),
    unidadNegocioCodigo: z.number().int().nullable().optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' })

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { archivos: true, erp: true },
  })
  res.json(toProyectoDTO(project))
})

router.delete('/:id', async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } })
  res.status(204).end()
})

// ── Slot itemizado: upload / clear ───────────────────────────────────────────

const uploadSlotSchema = z.object({
  nombreArchivo: z.string(),
  partidas: z.array(z.any()),
  subtotalesFamilia: z.record(z.number()),
  totalGeneral: z.number(),
})

router.post('/:id/slots/:slot', async (req, res) => {
  const slot = req.params.slot as ItemizadoSlot
  if (!ITEMIZADO_SLOTS.includes(slot)) return res.status(400).json({ error: 'slot inválido' })

  const parsed = uploadSlotSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const projectId = req.params.id
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

  await prisma.archivoCargado.upsert({
    where: { projectId_slot: { projectId, slot } },
    create: { projectId, slot, ...parsed.data },
    update: { ...parsed.data, fechaCarga: new Date() },
  })

  await prisma.project.update({
    where: { id: projectId },
    data: { fechaActualizacion: new Date() },
  })

  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: { archivos: true, erp: true },
  })
  res.json(toProyectoDTO(updated!))
})

router.delete('/:id/slots/:slot', async (req, res) => {
  const projectId = req.params.id
  const slot = req.params.slot
  if (slot === 'gasto_real_erp') {
    await prisma.cargaERP.deleteMany({ where: { projectId } })
  } else if (ITEMIZADO_SLOTS.includes(slot as ItemizadoSlot)) {
    await prisma.archivoCargado.deleteMany({ where: { projectId, slot } })
  } else {
    return res.status(400).json({ error: 'slot inválido' })
  }
  await prisma.project.update({ where: { id: projectId }, data: { fechaActualizacion: new Date() } })
  res.status(204).end()
})

// ── ERP upload ───────────────────────────────────────────────────────────────

const uploadERPSchema = z.object({
  nombreArchivo: z.string(),
  unidadNegocioCodigo: z.number().int(),
  unidadNegocioDescripcion: z.string(),
  totalUF: z.number(),
  numTransacciones: z.number().int(),
  rangoFechas: z.object({ desde: z.string(), hasta: z.string() }),
  agregadoPorCcosto: z.record(z.any()),
  agregadoPorCcostoPorMes: z.record(z.any()),
  mesesDisponibles: z.array(z.string()),
  transaccionesPorCcosto: z.record(z.any()),
})

router.post('/:id/erp', async (req, res) => {
  const projectId = req.params.id
  const parsed = uploadERPSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const d = parsed.data
  await prisma.cargaERP.upsert({
    where: { projectId },
    create: {
      projectId,
      nombreArchivo: d.nombreArchivo,
      unidadNegocioCodigo: d.unidadNegocioCodigo,
      unidadNegocioDescripcion: d.unidadNegocioDescripcion,
      totalUF: d.totalUF,
      numTransacciones: d.numTransacciones,
      rangoFechaDesde: new Date(d.rangoFechas.desde),
      rangoFechaHasta: new Date(d.rangoFechas.hasta),
      agregadoPorCcosto: d.agregadoPorCcosto,
      agregadoPorCcostoPorMes: d.agregadoPorCcostoPorMes,
      mesesDisponibles: d.mesesDisponibles,
      transaccionesPorCcosto: d.transaccionesPorCcosto,
    },
    update: {
      nombreArchivo: d.nombreArchivo,
      unidadNegocioCodigo: d.unidadNegocioCodigo,
      unidadNegocioDescripcion: d.unidadNegocioDescripcion,
      totalUF: d.totalUF,
      numTransacciones: d.numTransacciones,
      rangoFechaDesde: new Date(d.rangoFechas.desde),
      rangoFechaHasta: new Date(d.rangoFechas.hasta),
      agregadoPorCcosto: d.agregadoPorCcosto,
      agregadoPorCcostoPorMes: d.agregadoPorCcostoPorMes,
      mesesDisponibles: d.mesesDisponibles,
      transaccionesPorCcosto: d.transaccionesPorCcosto,
      fechaCarga: new Date(),
    },
  })

  await prisma.project.update({
    where: { id: projectId },
    data: { unidadNegocioCodigo: d.unidadNegocioCodigo, fechaActualizacion: new Date() },
  })

  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: { archivos: true, erp: true },
  })
  res.json(toProyectoDTO(updated!))
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert prisma Project (with archivos + erp) → DTO matching frontend Proyecto type.
 * The frontend expects `slots: { presupuesto_original, ... }` shape.
 */
function toProyectoDTO(p: any) {
  const slots: Record<string, any> = {
    presupuesto_original: null,
    presupuesto_redistribuido: null,
    ppto_horas_extra: null,
    proyectado: null,
    gasto_real_erp: null,
  }

  for (const a of p.archivos ?? []) {
    slots[a.slot] = {
      nombreArchivo: a.nombreArchivo,
      fechaCarga: a.fechaCarga.toISOString(),
      partidas: a.partidas,
      subtotalesFamilia: a.subtotalesFamilia,
      totalGeneral: a.totalGeneral,
    }
  }

  if (p.erp) {
    slots.gasto_real_erp = {
      nombreArchivo: p.erp.nombreArchivo,
      fechaCarga: p.erp.fechaCarga.toISOString(),
      unidadNegocioCodigo: p.erp.unidadNegocioCodigo,
      unidadNegocioDescripcion: p.erp.unidadNegocioDescripcion,
      totalUF: p.erp.totalUF,
      numTransacciones: p.erp.numTransacciones,
      rangoFechas: {
        desde: p.erp.rangoFechaDesde.toISOString(),
        hasta: p.erp.rangoFechaHasta.toISOString(),
      },
      agregadoPorCcosto: p.erp.agregadoPorCcosto,
      agregadoPorCcostoPorMes: p.erp.agregadoPorCcostoPorMes,
      mesesDisponibles: p.erp.mesesDisponibles,
      transaccionesPorCcosto: p.erp.transaccionesPorCcosto,
    }
  }

  return {
    id: p.id,
    nombre: p.nombre,
    unidadNegocioCodigo: p.unidadNegocioCodigo ?? undefined,
    cutoffMesReal: p.cutoffMesReal ?? null,
    fechaCreacion: p.fechaCreacion.toISOString(),
    fechaActualizacion: p.fechaActualizacion.toISOString(),
    slots,
  }
}

export default router
