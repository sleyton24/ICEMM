import { describe, it, expect } from 'vitest'
import {
  aplicarEleccionProyeccion,
  repartirCierre,
  type EleccionCuenta,
  type PartidaAjustable,
} from './aplicarEleccionProyeccion'

function partida(parcial: Partial<PartidaAjustable> & Pick<PartidaAjustable, 'codigo' | 'codigo2' | 'proyeccion'>): PartidaAjustable {
  const proyeccion = parcial.proyeccion
  const gasto = parcial.gasto_real ?? 0
  const vigente = parcial.ppto_vigente ?? 100
  return {
    codigo: parcial.codigo,
    codigo2: parcial.codigo2,
    ppto_original: parcial.ppto_original ?? vigente,
    redistribuido: parcial.redistribuido ?? vigente,
    ppto_vigente: vigente,
    gasto_real: gasto,
    proyeccion,
    variacion_uf: vigente - proyeccion,
    variacion_pct: vigente !== 0 ? ((vigente - proyeccion) / vigente) * 100 : null,
    ytg: proyeccion - gasto,
    estado: parcial.estado ?? 'EN CONTROL',
  }
}

const presto: EleccionCuenta = {
  codigoCuenta: '206',
  fuente: 'presto',
  curva: null,
  cierreTipica: 900,
  cierreReanclada: 800,
}

describe('elección Presto o modelo en el informe', () => {
  const partidas = [
    partida({ codigo: 'A', codigo2: '206', proyeccion: 100, gasto_real: 40, ppto_vigente: 80 }),
    partida({ codigo: 'B', codigo2: '206', proyeccion: 300, gasto_real: 10, ppto_vigente: 200 }),
    partida({ codigo: 'C', codigo2: '101', proyeccion: 50, gasto_real: 20, ppto_vigente: 40 }),
    partida({ codigo: 'A__orig206', codigo2: '206', proyeccion: 0, gasto_real: 0, ppto_vigente: 0, ppto_original: 15, redistribuido: 0 }),
  ]

  it('en Presto el informe no cambia: mismo arreglo, mismos montos', () => {
    const out = aplicarEleccionProyeccion(partidas, [presto])
    expect(out).toBe(partidas)
    expect(out.map(p => p.proyeccion)).toEqual([100, 300, 50, 0])
  })

  it('sin elecciones tampoco toca las partidas', () => {
    expect(aplicarEleccionProyeccion(partidas, [])).toBe(partidas)
  })

  it('con la curva típica la cuenta cierra en el modelo y el saldo es proyección − gastado', () => {
    const out = aplicarEleccionProyeccion(partidas, [{
      ...presto,
      fuente: 'modelo',
      curva: 'tipica',
    }])

    const deLaCuenta = out.filter(p => p.codigo2 === '206' && !p.codigo.includes('__orig'))
    expect(deLaCuenta.reduce((s, p) => s + p.proyeccion, 0)).toBeCloseTo(900, 2)
    expect(deLaCuenta.map(p => p.proyeccion)).toEqual([225, 675])
    expect(deLaCuenta.map(p => p.proyeccionPresto)).toEqual([100, 300])
    expect(deLaCuenta.map(p => p.ytg)).toEqual([185, 665])
    expect(deLaCuenta[0].variacion_uf).toBeCloseTo(80 - 225, 2)

    const otra = out.find(p => p.codigo === 'C')!
    expect(otra.proyeccion).toBe(50)
    expect(otra.proyeccionPresto).toBeUndefined()

    const fantasma = out.find(p => p.codigo === 'A__orig206')!
    expect(fantasma.proyeccion).toBe(0)
    expect(fantasma.ytg).toBe(0)
  })

  it('la curva re-anclada usa el otro cierre, no el típico', () => {
    const out = aplicarEleccionProyeccion(partidas, [{
      ...presto,
      fuente: 'modelo',
      curva: 'reanclada',
    }])
    const suma = out
      .filter(p => p.codigo2 === '206' && !p.codigo.includes('__orig'))
      .reduce((s, p) => s + p.proyeccion, 0)
    expect(suma).toBeCloseTo(800, 2)
    expect(suma).not.toBeCloseTo(900, 2)
  })

  it('si el modelo no trae cierre, se queda en Presto', () => {
    const out = aplicarEleccionProyeccion(partidas, [{
      codigoCuenta: '206',
      fuente: 'modelo',
      curva: 'reanclada',
      cierreTipica: 900,
      cierreReanclada: null,
    }])
    expect(out).toBe(partidas)
  })

  it('si Presto está en cero, el cierre cae en la partida con más gasto', () => {
    const vacias = [
      partida({ codigo: 'A', codigo2: '604', proyeccion: 0, gasto_real: 5, ppto_vigente: 0, ppto_original: 0, redistribuido: 0 }),
      partida({ codigo: 'B', codigo2: '604', proyeccion: 0, gasto_real: 40, ppto_vigente: 0, ppto_original: 0, redistribuido: 0 }),
    ]
    const out = aplicarEleccionProyeccion(vacias, [{
      codigoCuenta: '604',
      fuente: 'modelo',
      curva: 'tipica',
      cierreTipica: 100,
      cierreReanclada: null,
    }])
    expect(out.find(p => p.codigo === 'A')!.proyeccion).toBe(0)
    expect(out.find(p => p.codigo === 'B')!.proyeccion).toBe(100)
    expect(out.find(p => p.codigo === 'B')!.ytg).toBe(60)
    expect(out.find(p => p.codigo === 'B')!.estado).toBe('SOLO REAL')
  })

  it('repartirCierre cierra en centavos', () => {
    expect(repartirCierre([1, 1, 1], 10).reduce((s, n) => s + n, 0)).toBeCloseTo(10, 2)
    expect(repartirCierre([0, 0], 10, 1)).toEqual([0, 10])
  })
})
