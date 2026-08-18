import { describe, it, expect } from 'vitest'
import { mergeProyecto } from './mergeProyecto'
import type { Proyecto, PartidaRaw, ArchivoCargado, CargaERP } from '../../projects/types'
import { estadoAgregado } from '../../../data/estado'

function partida(codigo: string, codigo2: number, total: number): PartidaRaw {
  return {
    codigo,
    codigo2,
    descripcion: `Partida ${codigo}`,
    familia: 'MATERIALES',
    ud: 'gl',
    cantidad: 1,
    precio_unitario: total,
    total,
  }
}

function archivo(partidas: PartidaRaw[]): ArchivoCargado {
  return {
    nombreArchivo: 'test.xlsx',
    fechaCarga: '2026-01-15T00:00:00.000Z',
    partidas,
    subtotalesFamilia: {},
    totalGeneral: partidas.reduce((s, p) => s + p.total, 0),
  }
}

function proyecto(slots: Partial<Proyecto['slots']>): Proyecto {
  return {
    id: 'p1',
    nombre: 'Obra Test',
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaActualizacion: '2026-01-01T00:00:00.000Z',
    slots: {
      presupuesto_original: null,
      presupuesto_redistribuido: null,
      ppto_horas_extra: null,
      gasto_real_erp: null,
      proyectado: null,
      ...slots,
    },
  }
}

function erp(agregado: Record<number, number>): CargaERP {
  const agregadoPorCcosto: CargaERP['agregadoPorCcosto'] = {}
  for (const [cc, monto] of Object.entries(agregado)) {
    agregadoPorCcosto[Number(cc)] = { monto_uf: monto, num_tx: 1 }
  }
  return {
    fechaCarga: '2026-01-15T00:00:00.000Z',
    nombreArchivo: 'erp.xlsx',
    unidadNegocioCodigo: 1,
    unidadNegocioDescripcion: 'UN',
    totalUF: Object.values(agregado).reduce((s, v) => s + v, 0),
    numTransacciones: Object.keys(agregado).length,
    rangoFechas: { desde: '2026-01-01', hasta: '2026-01-31' },
    agregadoPorCcosto,
    agregadoPorCcostoPorMes: {},
    mesesDisponibles: ['2026-01'],
    transaccionesPorCcosto: {},
  }
}

describe('mergeProyecto — exclusión de cuentas 900 (Gastos Oficina Central)', () => {
  it('deja fuera las partidas presupuestadas en cuentas 900', () => {
    const { partidas } = mergeProyecto(proyecto({
      presupuesto_original: archivo([
        partida('M10100001', 101, 1000),
        partida('I90100001', 901, 500),
        partida('I91300001', 913, 250),
      ]),
    }))

    expect(partidas.map(p => p.codigo2)).toEqual(['101'])
  })

  it('deja fuera el gasto real ERP imputado a cuentas 900, sin mandarlo a sinPartida', () => {
    const { partidas, sinPartida } = mergeProyecto(proyecto({
      presupuesto_original: archivo([partida('M10100001', 101, 1000)]),
      gasto_real_erp: erp({ 101: 400, 905: 900, 999: 120 }),
    }))

    expect(partidas.map(p => p.codigo2)).toEqual(['101'])
    // 999 no está en el plan pero cae en el rango 900 → tampoco es huérfana
    expect(sinPartida).toEqual([])
  })

  it('no expone la familia GASTOS OFICINA CENTRAL en la lista de familias', () => {
    const { familias } = mergeProyecto(proyecto({
      presupuesto_original: archivo([
        partida('M10100001', 101, 1000),
        partida('I90100001', 901, 500),
      ]),
    }))

    expect(familias).not.toContain('GASTOS OFICINA CENTRAL')
  })

  it('conserva la fila fantasma en la cuenta de obra cuando la partida se redistribuye a una 900', () => {
    const { partidas } = mergeProyecto(proyecto({
      presupuesto_original: archivo([partida('M10100001', 101, 1000)]),
      presupuesto_redistribuido: archivo([partida('M10100001', 913, 1000)]),
    }))

    // Para la obra es una baja de presupuesto: queda el ppto original en 101 con vigente 0
    expect(partidas).toHaveLength(1)
    expect(partidas[0].codigo2).toBe('101')
    expect(partidas[0].ppto_original).toBe(1000)
    expect(partidas[0].ppto_vigente).toBe(0)
  })
})

describe('estadoAgregado', () => {
  const base = { ppto_original: 0, redistribuido: 0, ppto_vigente: 0, gasto_real: 0, proyeccion: 0 }

  it('marca CRITICO cuando el proyectado supera al vigente en más de 10%', () => {
    expect(estadoAgregado([
      { ...base, redistribuido: 100, ppto_vigente: 100, proyeccion: 115, gasto_real: 50 },
    ])).toBe('CRITICO')
  })

  it('compensa dentro del grupo: partidas críticas pueden cerrar EN CONTROL', () => {
    expect(estadoAgregado([
      { ...base, redistribuido: 100, ppto_vigente: 100, proyeccion: 130, gasto_real: 50 },
      { ...base, redistribuido: 100, ppto_vigente: 100, proyeccion: 72,  gasto_real: 40 },
    ])).toBe('EN CONTROL')
  })

  it('marca SOLO REAL cuando hay gasto sin presupuesto', () => {
    expect(estadoAgregado([{ ...base, gasto_real: 80 }])).toBe('SOLO REAL')
  })

  it('marca SIN EJECUCION cuando hay presupuesto sin gasto ni proyección', () => {
    expect(estadoAgregado([
      { ...base, redistribuido: 100, ppto_vigente: 100 },
    ])).toBe('SIN EJECUCION')
  })
})
