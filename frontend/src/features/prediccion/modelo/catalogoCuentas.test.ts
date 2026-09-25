import { describe, it, expect } from 'vitest'
import { cuentasVisibles, familiaTieneCurva } from './catalogoCuentas'
import { planCuentasBundled } from '../../plan-cuentas/bundled/seed'
import { FAMILIAS_MODELO } from './familias'

const plan = planCuentasBundled

describe('catálogo de cuentas visibles', () => {
  it('la familia 600 entra al selector aunque ninguna cuenta tenga curva', () => {
    expect(FAMILIAS_MODELO.map(f => f.codigo)).toContain(600)
    expect(familiaTieneCurva('otros')).toBe(false)

    const lista = cuentasVisibles('otros', plan)
    expect(lista.map(c => c.codigo)).toEqual(['601', '602', '603', '604', '605', '606', '607'])
    expect(lista.every(c => c.tieneCurva === false)).toBe(true)
    expect(lista.every(c => c.respaldoFamilia === false)).toBe(true)
  })

  it('una cuenta 100–500 sin historia se muestra con la curva de su familia de respaldo', () => {
    expect(familiaTieneCurva('materiales')).toBe(true)
    const lista = cuentasVisibles('materiales', plan)
    const sin = lista.filter(c => !c.tieneCurva)
    expect(sin.map(c => c.codigo)).toEqual(['122', '138', '139', '141'])
    expect(sin.every(c => c.respaldoFamilia)).toBe(true)
    expect(lista.some(c => c.codigo === '101' && c.tieneCurva)).toBe(true)
    expect(lista[0].tieneCurva).toBe(true)
  })
})
