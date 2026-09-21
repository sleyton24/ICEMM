import { describe, it, expect } from 'vitest'
import { proyectar } from './proyectar'
import { repronosticar } from './repronostico'
import { curvasBase } from './curvasBase'
import { FAMILIAS_MODELO, familiaDeCuenta, familiaPorClave } from './familias'
import { planCuentasBundled } from '../../plan-cuentas/bundled/seed'
import type { SerieRealMensual } from './tipos'

const q = curvasBase.quebrada as { tipo: string; m2: number; monto_contrato: number; plazo: number }
const OBRA = {
  nombre: 'La Quebrada', tipo: q.tipo, m2: q.m2,
  contrato: q.monto_contrato, plazo: q.plazo, inicio: '2025-11',
}
const OPTS = { lead: 3, skew: 0 }

describe('familiaDeCuenta', () => {
  it('mapea las cuentas a su familia del modelo', () => {
    expect(familiaDeCuenta(105, planCuentasBundled)?.clave).toBe('materiales')
    expect(familiaDeCuenta(206, planCuentasBundled)?.clave).toBe('mano_obra')
    expect(familiaDeCuenta(308, planCuentasBundled)?.clave).toBe('subcontratos')
    expect(familiaDeCuenta(421, planCuentasBundled)?.clave).toBe('gastos_generales')
    expect(familiaDeCuenta(505, planCuentasBundled)?.clave).toBe('equipos')
  })

  it('deja fuera lo que el modelo no proyecta', () => {
    expect(familiaDeCuenta(605, planCuentasBundled)).toBeUndefined()  // Utilidad
    expect(familiaDeCuenta(604, planCuentasBundled)).toBeUndefined()  // Postventa
    expect(familiaDeCuenta(901, planCuentasBundled)).toBeUndefined()  // Oficina central
    expect(familiaDeCuenta(701, planCuentasBundled)).toBeUndefined()  // Edif. comerciales
  })
})

describe('proyectar por familia', () => {
  const obra = proyectar(OBRA, OPTS)

  it('las cinco familias suman el total de la obra', () => {
    const suma = FAMILIAS_MODELO
      .map(f => proyectar(OBRA, { ...OPTS, familia: f.clave }).total)
      .reduce((s, t) => s + t, 0)
    // Los shares no suman exactamente 1: el total de la obra se reescala.
    expect(suma / obra.total).toBeCloseTo(1, 2)
  })

  it('cada familia cierra en su parte del total', () => {
    for (const f of FAMILIAS_MODELO) {
      const p = proyectar(OBRA, { ...OPTS, familia: f.clave })
      expect(p.familia).toBe(f.clave)
      expect(p.total).toBeCloseTo(obra.total * obra.mix[f.clave], 6)
      expect(p.meses[p.NT - 1].acum).toBeCloseTo(p.total, 6)
      const suma = p.meses.reduce((s, m) => s + m.mes, 0)
      expect(Math.abs(suma - p.total)).toBeLessThan(1)
    }
  })

  it('usa la curva propia de la familia, no la de la obra reescalada', () => {
    // Materiales gasta temprano (mitad del gasto al ~39% del ciclo) y
    // Subcontratos tarde (~53%). Al mismo mes deben ir a distinto avance.
    const mat = proyectar(OBRA, { ...OPTS, familia: 'materiales' })
    const sub = proyectar(OBRA, { ...OPTS, familia: 'subcontratos' })
    const medio = Math.floor(mat.NT / 2)
    expect(mat.meses[medio].pctAcum).toBeGreaterThan(sub.meses[medio].pctAcum + 0.05)
  })

  it('la banda sale de la dispersión de esa familia entre las 8 obras', () => {
    const mat = proyectar(OBRA, { ...OPTS, familia: 'materiales' })
    const anchoFam = mat.meses[10].p90 - mat.meses[10].p10
    const anchoObra = obra.meses[10].p90 - obra.meses[10].p10
    expect(anchoFam).toBeGreaterThan(0)
    // Una sola familia dispersa distinto que el agregado: no deben coincidir.
    expect(Math.abs(anchoFam - anchoObra)).toBeGreaterThan(0.001)
  })

  it('mantiene el mismo calendario que la obra (N, NT y meses)', () => {
    const sub = proyectar(OBRA, { ...OPTS, familia: 'subcontratos' })
    expect(sub.N).toBe(obra.N)
    expect(sub.NT).toBe(obra.NT)
    expect(sub.meses.map(m => m.ym)).toEqual(obra.meses.map(m => m.ym))
  })

  it('rechaza una familia que el modelo no conoce', () => {
    expect(() => proyectar(OBRA, { ...OPTS, familia: 'otros' }))
      .toThrow(/Familia desconocida/)
  })

  it('sin familia se comporta exactamente igual que antes', () => {
    const sinOpcion = proyectar(OBRA, OPTS)
    const conNull = proyectar(OBRA, { ...OPTS, familia: undefined })
    expect(conNull.familia).toBeNull()
    expect(conNull.total).toBe(sinOpcion.total)
    expect(conNull.meses.map(m => m.acum)).toEqual(sinOpcion.meses.map(m => m.acum))
  })
})

describe('re-pronóstico sobre una familia', () => {
  it('re-ancla al real de esa familia y respeta el escenario', () => {
    const p = proyectar(OBRA, { ...OPTS, familia: 'subcontratos' })
    // Serie real inventada para la prueba: 6 meses contiguos desde el inicio.
    const real: SerieRealMensual[] = p.meses.slice(0, 6).map((m, i) => ({
      ym: m.ym, mes: 100 * (i + 1), acum: 100 * ((i + 1) * (i + 2)) / 2,
    }))
    const r = repronosticar(p, real, { mesCorte: 6, escenario: 'plazo' })

    // El pasado es el real tal cual
    for (let i = 0; i < real.length; i++) {
      expect(r.reproyeccion.serie[i].acum).toBeCloseTo(real[i].acum, 6)
    }
    // Escenario calendario: el total de la familia no se mueve
    expect(r.reproyeccion.totalNuevo).toBeCloseTo(p.total, 6)
    expect(r.familia).toBe('subcontratos')
  })
})

describe('familiaPorClave', () => {
  it('devuelve el código de plan de cuentas de cada familia', () => {
    expect(familiaPorClave('materiales')?.codigo).toBe(100)
    expect(familiaPorClave('equipos')?.codigo).toBe(500)
    expect(familiaPorClave('inexistente')).toBeUndefined()
  })
})
