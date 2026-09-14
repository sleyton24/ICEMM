import { describe, it, expect } from 'vitest'
import { proyectar } from './proyectar'
import { repronosticar } from './repronostico'
import { curvasBase } from './curvasBase'
import { sumarMeses } from './curva'
import type { SerieRealMensual } from './tipos'
import patron from './bundled/patron-prototipo.json'

/**
 * Criterio de aceptación del port: reproducir la serie mensual del prototipo
 * dentro de 1 UF en cada mes, para La Quebrada con lead=3, inicio 2025-11 y
 * parámetros automáticos.
 *
 * `bundled/patron-prototipo.json` se generó ejecutando el núcleo del prototipo
 * TAL CUAL en Node (sin reescribirlo), con los accesores del DOM simulados.
 * No es una reimplementación del modelo: es su salida.
 */

const q = curvasBase.quebrada as { tipo: string; m2: number; monto_contrato: number; plazo: number }
const real = curvasBase.real as { serie: SerieRealMensual[] }

const OBRA = {
  nombre: 'La Quebrada',
  tipo: q.tipo,
  m2: q.m2,
  contrato: q.monto_contrato,
  plazo: q.plazo,
  inicio: '2025-11',
}
const OPTS = { lead: 3, skew: 0 }

describe('paridad con el prototipo — La Quebrada, lead=3, parámetros automáticos', () => {
  const p = proyectar(OBRA, OPTS)
  const g = patron.nueva

  it('reproduce los parámetros agregados', () => {
    expect(p.ejec).toBeCloseTo(g.ejec, 9)
    expect(p.rdur).toBeCloseTo(g.rdur, 9)
    expect(p.N).toBe(g.N)
    expect(p.NT).toBe(g.NT)
    expect(p.sdE).toBeCloseTo(g.sdE, 9)
    expect(p.total).toBeCloseTo(g.total, 6)
  })

  it('reproduce los pesos por similitud de las 8 obras', () => {
    for (const c of p.comparables) {
      expect(c.peso).toBeCloseTo((g.pesos as Record<string, number>)[c.nombre], 9)
    }
  })

  it('reproduce el mix por familia', () => {
    for (const [f, v] of Object.entries(g.mix as Record<string, number>)) {
      expect(p.mix[f]).toBeCloseTo(v, 9)
    }
  })

  it('reproduce el gasto de cada mes dentro de 1 UF', () => {
    expect(p.meses).toHaveLength(g.meses.length)
    for (let i = 0; i < p.meses.length; i++) {
      expect(Math.abs(p.meses[i].mes - g.meses[i].mes)).toBeLessThan(1)
      expect(Math.abs(p.meses[i].acum - g.meses[i].acum)).toBeLessThan(1)
    }
  })

  it('reproduce la banda p10/p90', () => {
    for (let i = 0; i < p.meses.length; i++) {
      expect(p.meses[i].p10).toBeCloseTo(g.meses[i].p10, 9)
      expect(p.meses[i].p90).toBeCloseTo(g.meses[i].p90, 9)
    }
  })

  it('mantiene los invariantes: la suma cierra en el total y el acumulado no baja', () => {
    const suma = p.meses.reduce((s, m) => s + m.mes, 0)
    expect(Math.abs(suma - p.total)).toBeLessThan(1)
    for (let i = 1; i < p.meses.length; i++) {
      expect(p.meses[i].acum).toBeGreaterThanOrEqual(p.meses[i - 1].acum)
    }
  })
})

describe('paridad del re-pronóstico — 8 meses observados, escenario plazo', () => {
  const p = proyectar(OBRA, OPTS)
  const r = repronosticar(p, real.serie, { mesCorte: real.serie.length, escenario: 'plazo' })
  const g = patron.curso

  it('reproduce el diagnóstico del corte', () => {
    expect(r.reproyeccion.k).toBe(g.curso.k)
    expect(r.reproyeccion.realAcum).toBeCloseTo(g.curso.real, 6)
    expect(r.reproyeccion.planAcum).toBeCloseTo(g.curso.plan, 6)
    expect(r.reproyeccion.desempeno).toBeCloseTo(g.curso.pf, 9)
    expect(r.reproyeccion.totalNuevo).toBeCloseTo(g.curso.totalNew, 6)
  })

  it('reproduce la serie re-anclada dentro de 1 UF', () => {
    for (let i = 0; i < r.reproyeccion.serie.length; i++) {
      expect(Math.abs(r.reproyeccion.serie[i].acum - g.meses[i].rf_acum!)).toBeLessThan(1)
    }
  })

  it('usa el real observado tal cual en el tramo pasado, sin escalarlo', () => {
    for (let i = 0; i < real.serie.length; i++) {
      expect(r.reproyeccion.serie[i].acum).toBeCloseTo(real.serie[i].acum, 6)
    }
  })
})

describe('defensas que el prototipo no tiene', () => {
  const p = proyectar(OBRA, OPTS)

  it('falla si la serie real es más corta que el mes de corte', () => {
    expect(() => repronosticar(p, real.serie.slice(0, 4), { mesCorte: 8 }))
      .toThrow(/solo tiene 4 meses/)
  })

  it('falla si la serie real no arranca en el mismo mes que la proyección', () => {
    const corrida = real.serie.map(s => ({ ...s, ym: sumarMeses(s.ym, 1) }))
    expect(() => repronosticar(p, corrida, { mesCorte: 8 })).toThrow(/Tienen que arrancar/)
  })

  it('falla si la serie real tiene un hueco, en vez de correr todo el pasado', () => {
    const conHueco = real.serie.filter((_, i) => i !== 3)
    expect(() => repronosticar(p, conHueco, { mesCorte: 6 })).toThrow(/no es contigua/)
  })

  it('advierte cuando el real ya superó el total y el remanente queda negativo', () => {
    const inflada = real.serie.map((s, i) => ({ ...s, acum: s.acum + (i === real.serie.length - 1 ? 400_000 : 0) }))
    const r = repronosticar(p, inflada, { mesCorte: real.serie.length, escenario: 'plazo' })
    expect(r.advertencias.some(a => a.includes('ya supera el total proyectado'))).toBe(true)
  })

  it('advierte cuando la obra no se parece a ninguna de la base', () => {
    const torre = proyectar({ ...OBRA, m2: 60000, contrato: 1_500_000 }, OPTS)
    expect(torre.advertencias.some(a => a.includes('no se parece'))).toBe(true)
  })

  it('advierte cuando no se fijó el arranque', () => {
    const sinLead = proyectar(OBRA, { lead: 0 })
    expect(sinLead.advertencias.some(a => a.includes('Sin meses de arranque'))).toBe(true)
  })

  it('calcula el mes sin depender de la zona horaria', () => {
    expect(sumarMeses('2025-11', 0)).toBe('2025-11')
    expect(sumarMeses('2025-11', 2)).toBe('2026-01')
    expect(sumarMeses('2025-11', 14)).toBe('2027-01')
  })
})
