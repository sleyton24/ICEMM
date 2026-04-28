import { describe, it, expect } from 'vitest'
import planCuentasJson from '../bundled/plan-cuentas.json'
import maestroProductosJson from '../bundled/maestro-productos.json'
import type { PlanCuentas, MaestroProductos } from '../types'

const plan = planCuentasJson as PlanCuentas
const maestro = maestroProductosJson as MaestroProductos

describe('Plan de Cuentas (bundled JSON)', () => {
  it('has exactly 9 familias', () => {
    expect(plan.familias).toHaveLength(9)
  })

  it('has exactly 188 subcuentas', () => {
    expect(plan.cuentas).toHaveLength(188)
  })

  it('familias are in order 100-900 with correct names and subcuenta counts', () => {
    const expected: [number, string, number][] = [
      [100, 'MATERIALES', 43],
      [200, 'MANO DE OBRA', 19],
      [300, 'SUBCONTRATOS', 55],
      [400, 'GASTOS GENERALES', 27],
      [500, 'EQUIPOS Y MAQUINARIAS', 17],
      [600, 'OTROS', 7],
      [700, 'EDIFICACIONES COMERCIALES', 6],
      [800, 'POST VENTA', 0],
      [900, 'GASTOS OFICINA CENTRAL', 14],
    ]

    for (const [codigo, nombre, count] of expected) {
      const familia = plan.familias.find(f => f.codigo === codigo)
      expect(familia, `Familia ${codigo}`).toBeDefined()
      expect(familia!.nombre).toBe(nombre)

      const subcuentas = plan.cuentas.filter(c => c.familiaCodigo === codigo)
      expect(subcuentas.length, `Subcuentas de ${nombre}`).toBe(count)
    }
  })

  it('each familia has a valid letra', () => {
    const validLetras = ['M', 'O', 'S', 'G', 'E', 'P', 'C', 'V', 'I']
    for (const f of plan.familias) {
      expect(validLetras).toContain(f.letra)
    }
  })

  it('cuenta 308 resolves to Subcontratos with letra S', () => {
    const cuenta = plan.cuentas.find(c => c.codigo === 308)
    expect(cuenta).toBeDefined()
    expect(cuenta!.descripcion).toContain('Colocación Hormigones')
    expect(cuenta!.familiaCodigo).toBe(300)
    expect(cuenta!.letra).toBe('S')
  })

  it('cuenta 421 resolves to Gastos Generales with letra G', () => {
    const cuenta = plan.cuentas.find(c => c.codigo === 421)
    expect(cuenta).toBeDefined()
    expect(cuenta!.descripcion).toContain('GG Oficina central')
    expect(cuenta!.familiaCodigo).toBe(400)
    expect(cuenta!.letra).toBe('G')
  })

  it('no duplicate cuenta codes', () => {
    const codes = plan.cuentas.map(c => c.codigo)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('all cuentas belong to a valid familia', () => {
    const famCodes = new Set(plan.familias.map(f => f.codigo))
    for (const c of plan.cuentas) {
      expect(famCodes.has(c.familiaCodigo), `Cuenta ${c.codigo} → familia ${c.familiaCodigo}`).toBe(true)
    }
  })

  it('origen is bundled', () => {
    expect(plan.origen).toBe('bundled')
  })
})

describe('Maestro de Productos (bundled JSON)', () => {
  it('has products (>8000)', () => {
    expect(maestro.productos.length).toBeGreaterThan(8000)
  })

  it('all product codes match pattern ^[A-Z]\\d{8,}$', () => {
    const re = /^[A-Z]\d{8,}$/
    for (const p of maestro.productos) {
      expect(re.test(p.codigo), `Invalid code: ${p.codigo}`).toBe(true)
    }
  })

  it('no duplicate product codes', () => {
    const codes = maestro.productos.map(p => p.codigo)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('product M10100001 exists with correct ctaCto', () => {
    const p = maestro.productos.find(x => x.codigo === 'M10100001')
    expect(p).toBeDefined()
    expect(p!.ctaCto).toBe(101)
    expect(p!.letra).toBe('M')
  })

  it('products by letra: M is the largest group', () => {
    const byLetter: Record<string, number> = {}
    for (const p of maestro.productos) {
      byLetter[p.letra] = (byLetter[p.letra] || 0) + 1
    }
    expect(byLetter['M']).toBeGreaterThan(3000)
    expect(byLetter['G']).toBeGreaterThan(1500)
    expect(byLetter['S']).toBeGreaterThan(1000)
  })

  it('origen is bundled', () => {
    expect(maestro.origen).toBe('bundled')
  })
})
