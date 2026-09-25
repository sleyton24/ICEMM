import { describe, it, expect } from 'vitest'
import { serieRealDesdeERP } from './serieRealDesdeERP'
import { planCuentasBundled } from '../../plan-cuentas/bundled/seed'
import type { CargaERP } from '../../projects/types'

function erp(porCcMes: Record<number, Record<string, number>>): CargaERP {
  const agregadoPorCcostoPorMes: CargaERP['agregadoPorCcostoPorMes'] = {}
  const agregadoPorCcosto: CargaERP['agregadoPorCcosto'] = {}
  for (const [cc, meses] of Object.entries(porCcMes)) {
    agregadoPorCcostoPorMes[Number(cc)] = {}
    let tot = 0
    for (const [m, uf] of Object.entries(meses)) {
      agregadoPorCcostoPorMes[Number(cc)][m] = { monto_uf: uf, num_tx: 1 }
      tot += uf
    }
    agregadoPorCcosto[Number(cc)] = { monto_uf: tot, num_tx: Object.keys(meses).length }
  }
  return {
    fechaCarga: '2026-07-01T00:00:00.000Z', nombreArchivo: 'erp.xlsx',
    unidadNegocioCodigo: 2, unidadNegocioDescripcion: 'LA QUEBRADA',
    totalUF: 0, numTransacciones: 0,
    rangoFechas: { desde: '2025-11-01', hasta: '2026-06-30' },
    agregadoPorCcosto, agregadoPorCcostoPorMes,
    mesesDisponibles: [], transaccionesPorCcosto: {},
  }
}

const plan = planCuentasBundled

describe('serieRealDesdeERP', () => {
  it('rellena los meses sin movimiento para que la serie quede contigua', () => {
    // Marzo no existe como clave: si no se rellena, abril se corre a su lugar
    const r = serieRealDesdeERP(erp({ 101: { '2026-01': 100, '2026-02': 200, '2026-04': 400 } }), plan)
    expect(r.serie.map(s => s.ym)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(r.serie.map(s => s.mes)).toEqual([100, 200, 0, 400])
    expect(r.serie.map(s => s.acum)).toEqual([100, 300, 300, 700])
    expect(r.advertencias.some(a => a.includes('no tienen movimiento'))).toBe(true)
  })

  it('deja fuera las cuentas 900 y las contrapartidas de rollup', () => {
    const r = serieRealDesdeERP(erp({
      101: { '2026-01': 1000 },
      100: { '2026-01': -900 },   // rollup
      901: { '2026-01': 500 },    // oficina central
    }), plan)
    expect(r.serie).toHaveLength(1)
    expect(r.serie[0].mes).toBe(1000)
    expect(r.excluido.rollup).toBe(-900)
    expect(r.excluido.oficinaCentral).toBe(500)
  })

  it('deja fuera la familia OTROS del total de obra y lo declara', () => {
    const r = serieRealDesdeERP(erp({
      101: { '2026-01': 1000 },
      605: { '2026-01': 12400 },  // Utilidad
      604: { '2026-01': 940 },    // Provisión postventa
    }), plan)
    expect(r.serie[0].mes).toBe(1000)
    expect(r.excluido.otros).toBe(13340)
    expect(r.advertencias.some(a => a.includes('OTROS'))).toBe(true)
  })

  it('conserva el real de las cuentas 600 para el selector, fuera del total', () => {
    const r = serieRealDesdeERP(erp({
      101: { '2026-01': 1000 },
      604: { '2026-01': 940 },
    }), plan)
    expect(r.serie[0].mes).toBe(1000)
    expect(r.porCuenta['604'][0].mes).toBe(940)
    expect(r.porFamilia.otros[0].mes).toBe(940)
    expect(r.porFamilia.otros[0].acum).toBe(940)
  })

  it('respeta el corte de mes', () => {
    const r = serieRealDesdeERP(
      erp({ 101: { '2026-01': 100, '2026-02': 200, '2026-03': 300 } }),
      plan,
      { cutoffMes: '2026-02' },
    )
    expect(r.serie.map(s => s.ym)).toEqual(['2026-01', '2026-02'])
    expect(r.corte).toBe('2026-02')
  })

  it('devuelve serie vacía si no queda nada dentro del perímetro', () => {
    const r = serieRealDesdeERP(erp({ 901: { '2026-01': 500 } }), plan)
    expect(r.serie).toEqual([])
    expect(r.inicio).toBeNull()
  })

  it('el inicio es el primer mes con costo del perímetro, no el del archivo', () => {
    // El rollup de diciembre no debe adelantar el inicio a 2025-12
    const r = serieRealDesdeERP(erp({
      100: { '2025-12': -50 },
      101: { '2026-01': 100 },
    }), plan)
    expect(r.inicio).toBe('2026-01')
  })
})
