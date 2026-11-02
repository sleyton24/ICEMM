import { describe, it, expect } from 'vitest'
import { proyectar } from './proyectar'
import { curvasBase } from './curvasBase'
import { cuentaBase } from './curvasCuenta'
import type { ObraInput } from './tipos'

const QUEBRADA: ObraInput = {
  nombre: 'La Quebrada',
  tipo: 'Edificio Habitacional',
  m2: 9576.96,
  contrato: 282990.89,
  plazo: 22,
  inicio: '2025-11',
}

describe('proyección con obras de referencia elegidas', () => {
  it('por defecto mezcla todas las obras que tienen la cuenta', () => {
    const p = proyectar(QUEBRADA, { cuenta: '206', lead: 3 })
    expect(p.comparables).toHaveLength(8)
    expect(p.comparables.reduce((s, c) => s + c.peso, 0)).toBeCloseTo(1, 10)
  })

  it('recalcula pesos y curva cuando se deja un subconjunto', () => {
    const todas = proyectar(QUEBRADA, { cuenta: '206', lead: 3 })
    const cb = cuentaBase('206')!
    const conCuenta = curvasBase.obras
      .filter((_, i) => cb.curvas[i] !== null)
      .map(o => o.nombre)
    expect(conCuenta.length).toBeGreaterThan(2)

    const activas = conCuenta.slice(0, 2)
    const solo = proyectar(QUEBRADA, { cuenta: '206', lead: 3, obrasActivas: activas })

    expect(solo.comparables.map(c => c.nombre).sort()).toEqual([...activas].sort())
    expect(solo.comparables.reduce((s, c) => s + c.peso, 0)).toBeCloseTo(1, 10)
    for (const nombre of conCuenta.slice(2)) {
      expect(solo.comparables.some(c => c.nombre === nombre)).toBe(false)
    }

    // La duración también se recalcula: cada obra trae su ratio, así que las
    // series pueden no tener el mismo largo. Se compara el avance a mitad de camino.
    const medio = (p: { meses: { pctAcum: number }[] }) =>
      p.meses[Math.floor(p.meses.length / 2)].pctAcum
    expect(Math.abs(medio(solo) - medio(todas))).toBeGreaterThan(0.01)
    expect(solo.meses[solo.meses.length - 1].acum).toBeCloseTo(solo.total, 6)
  })

  it('una sola obra de referencia se lleva todo el peso', () => {
    const nombre = curvasBase.obras[0].nombre
    const p = proyectar(QUEBRADA, { cuenta: '206', lead: 3, obrasActivas: [nombre] })
    expect(p.comparables).toHaveLength(1)
    expect(p.comparables[0].nombre).toBe(nombre)
    expect(p.comparables[0].peso).toBeCloseTo(1, 10)
  })

  it('sin ninguna obra marcada no estima la curva', () => {
    expect(() => proyectar(QUEBRADA, { cuenta: '206', lead: 3, obrasActivas: [] }))
      .toThrow(/No hay obras de referencia seleccionadas/)
  })

  it('tres obras no es lo mismo que una, y las tres suman peso 1', () => {
    const nombres = curvasBase.obras.slice(0, 3).map(o => o.nombre)
    const tres = proyectar(QUEBRADA, { cuenta: '313', lead: 3, obrasActivas: nombres })
    const una = proyectar(QUEBRADA, { cuenta: '313', lead: 3, obrasActivas: [nombres[0]] })
    expect(tres.comparables).toHaveLength(3)
    expect(tres.comparables.reduce((s, c) => s + c.peso, 0)).toBeCloseTo(1, 10)
    expect(tres.total).not.toBeCloseTo(una.total, 0)
  })
})
