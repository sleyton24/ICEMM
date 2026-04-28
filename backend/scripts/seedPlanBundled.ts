/**
 * Carga el plan-cuentas.json y maestro-productos.json bundleados (del frontend) a la DB.
 * Marca como activos (origen='bundled'). Idempotente: solo crea si no hay activo.
 *
 * Uso:
 *   cd backend
 *   npx tsx scripts/seedPlanBundled.ts
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { prisma } from '../src/db.js'

const root = resolve(import.meta.dirname, '..', '..')
const planPath = resolve(root, 'frontend/src/features/plan-cuentas/bundled/plan-cuentas.json')
const maestroPath = resolve(root, 'frontend/src/features/plan-cuentas/bundled/maestro-productos.json')

const plan = JSON.parse(readFileSync(planPath, 'utf-8'))
const maestro = JSON.parse(readFileSync(maestroPath, 'utf-8'))

const existingPlan = await prisma.planCuentas.findFirst({ where: { activo: true } })
if (!existingPlan) {
  await prisma.planCuentas.create({
    data: {
      version: plan.version,
      origen: 'bundled',
      familias: plan.familias,
      cuentas: plan.cuentas,
      activo: true,
    },
  })
  console.log(`✓ Plan de cuentas: ${plan.familias.length} familias, ${plan.cuentas.length} cuentas`)
} else {
  console.log('• Plan de cuentas ya cargado, saltando.')
}

const existingMaestro = await prisma.maestroProductos.findFirst({ where: { activo: true } })
if (!existingMaestro) {
  await prisma.maestroProductos.create({
    data: {
      version: maestro.version,
      origen: 'bundled',
      productos: maestro.productos,
      activo: true,
    },
  })
  console.log(`✓ Maestro de productos: ${maestro.productos.length} productos`)
} else {
  console.log('• Maestro ya cargado, saltando.')
}

process.exit(0)
