import { describe, it, expect } from 'vitest'
import { fichaConocida, fichasConocidas, tipoValido } from './fichasConocidas'
import { curvasBase } from '../modelo/curvasBase'

describe('fichas de obra entregadas por EMM', () => {
  it('trae las 9 obras del consolidado', () => {
    expect(fichasConocidas()).toHaveLength(9)
  })

  it('cubre exactamente las 8 obras del modelo, más La Quebrada', () => {
    const enModelo = fichasConocidas().filter(f => f.enModelo).map(f => f.nombre).sort()
    const delModelo = curvasBase.obras.map(o => o.nombre).sort()
    expect(enModelo).toEqual(delModelo)

    const fuera = fichasConocidas().filter(f => !f.enModelo).map(f => f.nombre)
    expect(fuera).toEqual(['La Quebrada'])
  })

  it('todos los tipos existen en el enum de la app', () => {
    // Si EMM entrega una obra con un tipo nuevo, mejor que falle acá y no en
    // un <select> que queda mudo.
    for (const f of fichasConocidas()) {
      expect(tipoValido(f.tipo), `tipo desconocido: ${f.tipo}`).toBe(true)
    }
  })

  it('los cuatro datos que pide el formulario son usables', () => {
    for (const f of fichasConocidas()) {
      expect(f.m2, f.nombre).toBeGreaterThan(0)
      expect(f.plazoMeses, f.nombre).toBeGreaterThan(0)
      expect(f.montoContratoUF, f.nombre).toBeGreaterThan(0)
      expect(Number.isInteger(f.plazoMeses), f.nombre).toBe(true)
    }
  })

  it('La Quebrada coincide con la ficha que ya venía en curvas-base', () => {
    // curvas-base.json trae `quebrada` con exactamente los mismos campos que
    // meta_all. Son dos artefactos externos que genera el mismo script, así que
    // no los unifico: los ato con un test para que no puedan divergir sin que
    // alguien se entere.
    const q = fichaConocida('La Quebrada')!
    const yaBundleada = curvasBase.quebrada
    expect(q.tipo).toBe(yaBundleada.tipo)
    expect(q.m2).toBe(yaBundleada.m2)
    expect(q.plazoMeses).toBe(yaBundleada.plazo)
    expect(q.montoContratoUF).toBe(yaBundleada.monto_contrato)
  })

  it('La Quebrada trae la nota de que el contrato incluye Post Venta', () => {
    const q = fichaConocida('La Quebrada')
    expect(q).not.toBeNull()
    expect(q!.montoContratoUF).toBeCloseTo(282990.89, 2)
    expect(q!.plazoMeses).toBe(22)
    expect(q!.m2).toBeCloseTo(9576.96, 2)
    expect(q!.obs).toMatch(/Post Venta/i)
  })
})

describe('cruce de nombres contra los proyectos de ICEMM', () => {
  it('ignora mayúsculas, tildes y puntuación', () => {
    // El consolidado escribe "Raices"; el proyecto bien puede decir "Raíces".
    expect(fichaConocida('RAÍCES DEL TAIHUÉN')?.nombre).toBe('Raices del Taihuen')
    expect(fichaConocida('la  quebrada')?.nombre).toBe('La Quebrada')
    expect(fichaConocida('Vicente Valdés')?.nombre).toBe('Vicente Valdes')
  })

  it('acepta el nombre con prefijo, como lo escriben en la app', () => {
    expect(fichaConocida('Edificio La Quebrada')?.nombre).toBe('La Quebrada')
    expect(fichaConocida('OBRA HOTEL UGO')?.nombre).toBe('Hotel UGO')
  })

  it('no confunde una obra distinta que contiene el nombre', () => {
    // Con `includes` de substring, estos tres prellenaban el contrato de otra
    // obra —seis cifras equivocadas— sin que nada lo señalara.
    expect(fichaConocida('Manantiales de Chicureo')).toBeNull()
    expect(fichaConocida('La Quebrada II')).toBeNull()
    expect(fichaConocida('Europa Central')).toBeNull()
  })

  it('acepta solo palabras de relleno alrededor del nombre', () => {
    expect(fichaConocida('Condominio Manantial')?.nombre).toBe('Manantial')
    expect(fichaConocida('Proyecto Europa')?.nombre).toBe('Europa')
    // "Etapa 2" no es relleno: es otra obra.
    expect(fichaConocida('Manantial Etapa 2')).toBeNull()
  })

  it('no adivina cuando hay más de una candidata', () => {
    // Prellenar la obra equivocada con un contrato de seis cifras es peor que
    // no prellenar nada.
    expect(fichaConocida('Europa y Manantial')).toBeNull()
  })

  it('devuelve null para una obra que no está en el consolidado', () => {
    expect(fichaConocida('Torre Sin Datos')).toBeNull()
    expect(fichaConocida('')).toBeNull()
    expect(fichaConocida('   ')).toBeNull()
  })
})
