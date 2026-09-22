import { describe, it, expect } from 'vitest'
import { proyectar } from './proyectar'
import { curvasBase } from './curvasBase'
import { curvasCuenta, cuentaBase, cuentasConCurva, cuentasDeFamilia } from './curvasCuenta'
import type { ObraInput } from './tipos'

/** La Quebrada, con la ficha que entregó EMM. */
const QUEBRADA: ObraInput = {
  nombre: 'La Quebrada',
  tipo: 'Edificio Habitacional',
  m2: 9576.96,
  contrato: 282990.89,
  plazo: 22,
  inicio: '2025-11',
}

describe('artefacto de curvas por cuenta', () => {
  it('está alineado con las obras de curvas-base', () => {
    // El módulo tira al importarse si no lo está; esto lo deja explícito.
    expect(curvasCuenta.obras).toEqual(curvasBase.obras.map(o => o.nombre))
  })

  it('trae 125 cuentas y todas cuelgan de una familia del modelo', () => {
    const todas = cuentasConCurva()
    expect(todas).toHaveLength(125)
    for (const c of todas) {
      expect(curvasBase.familias, c.codigo).toContain(c.familia)
    }
  })

  it('respeta el criterio de inclusión que declara', () => {
    const { minObras } = curvasCuenta.criterio
    for (const c of cuentasConCurva()) {
      expect(c.nObras, c.codigo).toBeGreaterThanOrEqual(minObras)
      // Tantas curvas no nulas como obras declaradas.
      expect(c.curvas.filter(x => x !== null), c.codigo).toHaveLength(c.nObras)
      expect(c.shares.filter(x => x !== null), c.codigo).toHaveLength(c.nObras)
    }
  })

  it('las curvas arrancan en 0 y cierran en 1', () => {
    for (const c of cuentasConCurva()) {
      for (const curva of c.curvas) {
        if (!curva) continue
        expect(curva[0], c.codigo).toBe(0)
        expect(curva[curva.length - 1], c.codigo).toBeCloseTo(1, 4)
      }
    }
  })

  it('caidaMax mide de verdad el retroceso de cada curva', () => {
    // Las curvas pueden bajar: un mes negativo hace retroceder el acumulado.
    // No se aplanan; se declara cuánto bajan.
    for (const c of cuentasConCurva()) {
      let peor = 0
      for (const curva of c.curvas) {
        if (!curva) continue
        let techo = curva[0]
        for (const v of curva) {
          techo = Math.max(techo, v)
          peor = Math.max(peor, techo - v)
        }
      }
      expect(c.caidaMax, c.codigo).toBeCloseTo(peor, 4)
    }
  })

  it('las caídas hondas caen sobre cuentas chicas', () => {
    // Si una cuenta que pesa de verdad retrocediera mucho, habría que mirar
    // el dato antes que el modelo.
    for (const c of cuentasConCurva()) {
      if (c.caidaMax > 0.1) {
        expect(c.shareMedio, `${c.codigo} retrocede ${c.caidaMax}`).toBeLessThan(0.01)
      }
    }
  })

  it('el código empieza con el dígito de su familia', () => {
    const digito: Record<string, string> = {
      materiales: '1', mano_obra: '2', subcontratos: '3',
      gastos_generales: '4', equipos: '5',
    }
    for (const c of cuentasConCurva()) {
      expect(c.codigo[0], c.codigo).toBe(digito[c.familia])
    }
  })
})

describe('proyección por cuenta', () => {
  it('proyecta una cuenta y la etiqueta con su familia', () => {
    const p = proyectar(QUEBRADA, { cuenta: '206', lead: 3 })
    expect(p.cuenta).toBe('206')
    expect(p.familia).toBe('mano_obra')
    expect(p.obrasDeLaCuenta).toBe(8)
    expect(p.total).toBeGreaterThan(0)
  })

  it('cierra exactamente en el total de la cuenta', () => {
    const p = proyectar(QUEBRADA, { cuenta: '313', lead: 3 })
    expect(p.meses[p.meses.length - 1].acum).toBeCloseTo(p.total, 6)
    expect(p.meses[p.meses.length - 1].pctAcum).toBeCloseTo(1, 6)
  })

  it('no cambia los parámetros de obra: N, NT y ejec son los de la obra', () => {
    // Solo la curva y la participación son de la cuenta. Si proyectar una
    // cuenta moviera la duración de la obra, dos cuentas de la misma obra
    // terminarían en meses distintos.
    const obra = proyectar(QUEBRADA, { lead: 3 })
    for (const cod of ['206', '313', '105']) {
      const p = proyectar(QUEBRADA, { cuenta: cod, lead: 3 })
      expect(p.N, cod).toBe(obra.N)
      expect(p.NT, cod).toBe(obra.NT)
      expect(p.ejec, cod).toBeCloseTo(obra.ejec, 12)
      expect(p.rdur, cod).toBeCloseTo(obra.rdur, 12)
    }
  })

  it('ninguna familia es superada por la suma de sus propias cuentas', () => {
    // El artefacto cubre ~96% del gasto, así que la suma tiene que quedar por
    // DEBAJO del total de la familia. Que la supere es imposible bajo cualquier
    // lectura aditiva y delata que el nivel se está ponderando mal.
    //
    // La versión anterior de este test toleraba hasta 1,1 y dejó pasar un 1,0756
    // real: el share de cuenta se promediaba con los pesos renormalizados, lo
    // que inflaba hasta ×4 las cuentas presentes en pocas obras.
    for (const f of curvasBase.familias) {
      const fam = proyectar(QUEBRADA, { familia: f, lead: 3 })
      const suma = cuentasDeFamilia(f)
        .reduce((a, c) => a + proyectar(QUEBRADA, { cuenta: c.codigo, lead: 3 }).total, 0)
      const ratio = suma / fam.total
      expect(ratio, `${f} supera el 100% de su familia`).toBeLessThanOrEqual(1.0005)
      expect(ratio, `${f} cubre demasiado poco`).toBeGreaterThan(0.75)
    }
  })

  it('las 125 cuentas suman la cobertura declarada del artefacto, no más', () => {
    const obra = proyectar(QUEBRADA, { lead: 3 })
    const suma = cuentasConCurva()
      .reduce((a, c) => a + proyectar(QUEBRADA, { cuenta: c.codigo, lead: 3 }).total, 0)
    const ratio = suma / obra.total
    // ~96% de cobertura: por encima de 1 sería crear gasto de la nada.
    expect(ratio).toBeGreaterThan(0.93)
    expect(ratio).toBeLessThanOrEqual(1.0)
  })

  it('el monto de una cuenta no depende de en cuántas obras aparezca', () => {
    // El share es un NIVEL: que una obra no tenga la cuenta significa que ahí
    // valió 0, no que haya que saltearla. Si se renormaliza, el monto se infla
    // en 1/masa y una cuenta de 3 obras sale ×4.
    const parcial = cuentasConCurva().find(c => c.nObras <= 4)!
    const p = proyectar(QUEBRADA, { cuenta: parcial.codigo, lead: 3 })
    const esperado = proyectar(QUEBRADA, { lead: 3 }).total * parcial.shareMedio
    // shareMedio promedia solo sobre las obras presentes, así que el monto
    // correcto tiene que ser MENOR: nunca puede superarlo.
    expect(p.total).toBeLessThan(esperado * 1.0005)
  })

  it('renormaliza los pesos cuando la cuenta no está en las 8 obras', () => {
    const parcial = cuentasConCurva().find(c => c.nObras < 8)!
    const p = proyectar(QUEBRADA, { cuenta: parcial.codigo, lead: 3 })
    // Solo las obras que tienen la cuenta quedan como comparables…
    expect(p.comparables).toHaveLength(parcial.nObras)
    // …y sus pesos siguen sumando 1, o la curva saldría encogida.
    expect(p.comparables.reduce((a, c) => a + c.peso, 0)).toBeCloseTo(1, 10)
    expect(p.advertencias.join(' ')).toContain(`${parcial.nObras} de las 8`)
  })

  it('rechaza una cuenta sin curva histórica', () => {
    expect(() => proyectar(QUEBRADA, { cuenta: '999' })).toThrow(/no tiene curva histórica/)
  })

  it('la cuenta manda sobre la familia si se pasan las dos', () => {
    const p = proyectar(QUEBRADA, { cuenta: '206', familia: 'materiales', lead: 3 })
    expect(p.cuenta).toBe('206')
    expect(p.familia).toBe('mano_obra')
  })

  it('avisa cuando la cuenta es demasiado chica para pronosticar monto', () => {
    const chica = cuentasConCurva().find(c => c.shareMedio < 0.005)
    expect(chica, 'debería haber al menos una cuenta bajo 0,5%').toBeDefined()
    const p = proyectar(QUEBRADA, { cuenta: chica!.codigo, lead: 3 })
    expect(p.advertencias.join(' ')).toMatch(/calendario de gasto, no para pronosticar/)
  })

  it('cuentaBase devuelve null para un código que no existe', () => {
    expect(cuentaBase('999')).toBeNull()
    expect(cuentaBase('206')).not.toBeNull()
  })
})
