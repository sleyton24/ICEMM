import { describe, it, expect } from 'vitest'
import { betaCdf } from './beta'
import { calibrar, configCurva, modeloVigente } from './calibrar'
import artefacto from './bundled/curvas-caracteristica.json'
import { proyectar } from './proyectar'

/**
 * Paridad con Curvas_Gasto_Proyectos.xlsx (Anexo A1–A3 y Tabla 6).
 * El Excel manda: diferencias bajo 0,01 meses o 0,1 puntos porcentuales.
 */

const A1: Record<string, { real: number; ti: number; tt: number; D: number; Da: number; s25: number; s50: number; s75: number; ratio: number }> = {
  'Raices del Taihuen': { real: 359318.025139, ti: 4.36022798314918, tt: 34.7637892068036, D: 30.4035612236545, Da: 30.4035612236545, s25: 0.183160237290682, s50: 0.591508669373318, s75: 0.893983851229204, ratio: 1.12259633645894 },
  'Vicente Valdes': { real: 163028.196337, ti: 1.66550352528915, tt: 29.6286974124432, D: 27.9631938871541, Da: 27.9631938871541, s25: 0.210487821579486, s50: 0.612085932121973, s75: 0.919208777990603, ratio: 0.988141930215572 },
  'Hotel UGO': { real: 312840.854817, ti: 1.92871295941457, tt: 27.6050276040641, D: 25.6763146446495, Da: 25.6763146446495, s25: 0.124003488097809, s50: 0.413846796643857, s75: 0.759349303983288, ratio: 1.1434122661957 },
  'Oasis Plaza': { real: 313279.817248, ti: 3.94844945641412, tt: 40.3275378827877, D: 36.3790884263736, Da: 32.3790884263736, s25: 0.281606234278719, s50: 0.665060075181934, s75: 0.910327479521828, ratio: 1.10047225865587 },
  'Rojas Magallanes': { real: 191225.524909, ti: 20.1449434838157, tt: 44.2058042848611, D: 24.0608608010454, Da: 24.0608608010454, s25: 0.178283204940985, s50: 0.513432939382693, s75: 0.833209332192349, ratio: 1.04006502716162 },
  Europa: { real: 189332.403358, ti: 8.50027181120228, tt: 36.609721753157, D: 28.1094499419547, Da: 28.1094499419547, s25: 0.199453839555918, s50: 0.536497396474811, s75: 0.811816865242986, ratio: 1.07615490826187 },
  Afluente: { real: 183051.150425, ti: 4.63152138567716, tt: 29.4984372959332, D: 24.8669159102561, Da: 24.8669159102561, s25: 0.23523556938647, s50: 0.564927393902414, s75: 0.833067028479769, ratio: 0.989313484125631 },
  Manantial: { real: 197366.569308, ti: 4.61119127989154, tt: 27.8002545951943, D: 23.1890633153028, Da: 23.1890633153028, s25: 0.221165495604609, s50: 0.51306085589707, s75: 0.818647325114686, ratio: 0.931624807055152 },
}

/** Tabla A2, cada 10% de la duración. Promedio de las 8 y Beta. */
const A2 = [
  { t: 0, prom: 0, beta: 0 },
  { t: 0.1, prom: 0.0554833420767644, beta: 0.0538820580702428 },
  { t: 0.2, prom: 0.152550957668916, beta: 0.15336349962812 },
  { t: 0.3, prom: 0.265524295967539, beta: 0.275633970043269 },
  { t: 0.4, prom: 0.406615551395407, beta: 0.409131999637537 },
  { t: 0.5, prom: 0.551302507372259, beta: 0.545190166636298 },
  { t: 0.6, prom: 0.687463222235866, beta: 0.676340268812636 },
  { t: 0.7, prom: 0.800908264099961, beta: 0.795536399353677 },
  { t: 0.8, prom: 0.892745977731158, beta: 0.895543597480714 },
  { t: 0.9, prom: 0.962994492296142, beta: 0.968016881643614 },
  { t: 1, prom: 1, beta: 1 },
]

describe('Anexo A1 — cada obra, con la detención de Oasis Plaza', () => {
  const cal = modeloVigente()

  it('declara la detención por defecto: Oasis Plaza desde 2020-06, 4 meses', () => {
    expect(configCurva.lectura).toBe('A')
    expect(configCurva.detenciones).toEqual([
      { obra: 'Oasis Plaza', desde: '2020-06', meses: 4 },
    ])
  })

  it('reproduce tᵢ, tₜ, D, Dₐ, S(25/50/75) y el real', () => {
    for (const o of cal.obras) {
      const e = A1[o.nombre]
      expect(o.costo_real, o.nombre).toBeCloseTo(e.real, 2)
      expect(o.ti, o.nombre).toBeCloseTo(e.ti, 2)
      expect(o.tt, o.nombre).toBeCloseTo(e.tt, 2)
      expect(o.D, o.nombre).toBeCloseTo(e.D, 2)
      expect(o.Da, o.nombre).toBeCloseTo(e.Da, 2)
      expect(o.curva[10], o.nombre).toBeCloseTo(e.s25, 4)
      expect(o.curva[20], o.nombre).toBeCloseTo(e.s50, 4)
      expect(o.curva[30], o.nombre).toBeCloseTo(e.s75, 4)
    }
  })

  it('deja a Oasis Plaza en 32,4 meses, no en los 36,4 de calendario', () => {
    expect(cal.durOasisPlaza).toBeCloseTo(32.379, 2)
    const op = cal.obras.find(o => o.nombre === 'Oasis Plaza')!
    expect(op.D - op.Da).toBeCloseTo(4, 6)
  })
})

describe('Anexo A2 y la Beta — α ≈ 1,584 y β ≈ 1,768', () => {
  const cal = modeloVigente()

  it('ajusta α y β como el Excel, no como el redondeo de la tabla', () => {
    expect(cal.alpha).toBeCloseTo(1.58420407840753, 6)
    expect(cal.beta).toBeCloseTo(1.76751130081822, 6)
    expect(cal.alpha).toBeCloseTo(1.584, 3)
    expect(cal.beta).toBeCloseTo(1.768, 3)
  })

  it('reproduce el promedio y la Beta cada 10%', () => {
    for (const fila of A2) {
      const i = Math.round(fila.t * 40)
      expect(cal.promedio[i], `promedio ${fila.t}`).toBeCloseTo(fila.prom, 4)
      expect(betaCdf(cal.alpha, cal.beta, fila.t), `beta ${fila.t}`).toBeCloseTo(fila.beta, 4)
    }
  })

  it('coincide con la caché que escribió el generador', () => {
    const cache = artefacto.cache
    expect(cal.alpha).toBeCloseTo(cache.alpha, 8)
    expect(cal.beta).toBeCloseTo(cache.beta, 8)
    expect(cal.durOasisPlaza).toBeCloseTo(cache.durOasisPlaza, 8)
    expect(cal.duracion.r2).toBeCloseTo(cache.duracion.r2, 8)
  })
})

describe('duración por m² — Oasis Plaza antes y después de sacar la detención', () => {
  const con = modeloVigente()
  const sin = calibrar({ detenciones: [] })

  it('sin ajuste: 36,4 meses y R² 0,566', () => {
    expect(sin.durOasisPlaza).toBeCloseTo(36.379, 2)
    expect(sin.sinDetencion.r2).toBeCloseTo(0.566, 3)
    expect(sin.sinDetencion.pendientePorMilM2).toBeCloseTo(0.636, 2)
  })

  it('con los 4 meses fuera del eje: 32,4 meses y R² 0,554', () => {
    expect(con.durOasisPlaza).toBeCloseTo(32.379, 2)
    expect(con.duracion.r2).toBeCloseTo(0.553656, 4)
    expect(con.duracion.pendientePorMilM2).toBeCloseTo(0.471, 2)
    expect(con.duracion.intercepto).toBeCloseTo(21.610, 2)
    expect(con.duracion.errorEstandar).toBeCloseTo(2.316, 2)
  })
})

describe('Tabla 6 — real / Costo Construcción de la columna Q', () => {
  const cal = modeloVigente()

  it('reproduce el ratio de cada obra', () => {
    for (const o of cal.obras) {
      expect(o.ejec_cc, o.nombre).toBeCloseTo(A1[o.nombre].ratio, 4)
    }
  })

  it('el factor de un proyecto nuevo es el promedio simple de esos ratios', () => {
    const medio = cal.obras.reduce((s, o) => s + o.ejec_cc, 0) / cal.obras.length
    expect(cal.ejecCC).toBeCloseTo(medio, 10)
    expect(cal.ejecCC).toBeCloseTo(1.048973, 4)
  })
})

describe('Tabla 5 — proyecto tipo de 27 meses', () => {
  const p = proyectar(
    {
      nombre: 'Proyecto tipo',
      tipo: 'Edificio Habitacional',
      m2: 11608.21,
      contrato: 1,
      costoConstruccion: 100,
      plazo: 22,
      inicio: '2027-01',
    },
    { duracionMeses: 27, lectura: 'A' },
  )

  it('cierra en el mes 27 y el primer mes gasta cerca del 1,2%', () => {
    expect(p.N).toBe(27)
    expect(p.meses[0].pctAcum).toBeCloseTo(0.01152, 3)
    expect(p.meses[12].pctAcum).toBeCloseTo(0.52015, 3)
    expect(p.meses[26].pctAcum).toBeCloseTo(1, 6)
    const suma = p.meses.reduce((s, m) => s + m.mes, 0)
    expect(Math.abs(suma - p.total)).toBeLessThan(1e-6)
  })
})

describe('Anexo A3 — 200.000 UF, 10.000 m², desde enero 2027', () => {
  const p = proyectar(
    {
      nombre: 'Ejemplo',
      tipo: 'Edificio Habitacional',
      m2: 10000,
      contrato: 200000,
      costoConstruccion: 200000,
      plazo: 22,
      inicio: '2027-01',
    },
    { lectura: 'A' },
  )

  it('redondea la duración por m² a 26 meses y cierra en CC × real/CC', () => {
    expect(p.N).toBe(26)
    expect(p.meses[0].ym).toBe('2027-01')
    expect(p.meses[25].ym).toBe('2029-02')
    expect(p.anclaOrigen).toBe('costo_construccion')
    // El anexo suma 200.000 porque trata el presupuesto como el 100%.
    // La lectura A ancla el total en CC × real/CC; la forma igual suma ese total.
    const suma = p.meses.reduce((s, m) => s + m.mes, 0)
    expect(p.total).toBeCloseTo(200000 * modeloVigente().ejecCC, 4)
    expect(Math.abs(suma - p.total)).toBeLessThan(0.01)
    expect(p.meses[p.meses.length - 1].pctAcum).toBeCloseTo(1, 6)
  })

  it('el mes 1 y el mes 13 caen donde dice la tabla, a menos de 1 UF de la forma', () => {
    // La tabla del anexo está armada sobre el presupuesto (200.000 = 100%).
    // Acá el total es CC × real/CC, así que se compara la forma, no el peso del factor.
    const forma1 = p.meses[0].acum / p.total
    const forma13 = p.meses[12].acum / p.total
    expect(forma1).toBeCloseTo(0.01222, 3)
    expect(forma13).toBeCloseTo(0.54519, 3)
    expect(Math.abs(forma1 * 200000 - 2445)).toBeLessThan(1)
    expect(Math.abs((forma13 - p.meses[11].acum / p.total) * 200000 - 10428)).toBeLessThan(1)
  })
})

describe('lectura B — el acumulado termina en real/CC', () => {
  const cal = modeloVigente()

  it('cada obra cierra en su real/CC y el promedio, en el factor medio', () => {
    for (const o of cal.obras) {
      expect(o.curvaSobreCC[o.curvaSobreCC.length - 1], o.nombre).toBeCloseTo(o.ejec_cc, 8)
      expect(o.curvaSobreCC[20], o.nombre).toBeCloseTo(o.curva[20] * o.ejec_cc, 8)
    }
    const ultimo = cal.promedioSobreCC[cal.promedioSobreCC.length - 1]
    expect(ultimo).toBeCloseTo(cal.ejecCC, 8)
  })

  it('proyectar en B cierra el % del ancla en real/CC y el dinero igual que en A', () => {
    const obra = {
      nombre: 'Ejemplo',
      tipo: 'Edificio Habitacional',
      m2: 10000,
      contrato: 180000,
      costoConstruccion: 200000,
      plazo: 22,
      inicio: '2027-01',
    }
    const a = proyectar(obra, { lectura: 'A' })
    const b = proyectar(obra, { lectura: 'B' })
    expect(a.lectura).toBe('A')
    expect(b.lectura).toBe('B')
    expect(a.meses[a.meses.length - 1].pctAcum).toBeCloseTo(1, 6)
    expect(b.meses[b.meses.length - 1].pctAcum).toBeCloseTo(modeloVigente().ejecCC, 6)
    expect(b.total).toBeCloseTo(a.total, 6)
    expect(b.meses[0].ym).toBe('2027-01')
  })
})

describe('detención prevista en la obra que se proyecta', () => {
  const base = {
    nombre: 'Ejemplo',
    tipo: 'Edificio Habitacional',
    m2: 10000,
    contrato: 200000,
    costoConstruccion: 200000,
    plazo: 22,
    inicio: '2027-01',
  }

  it('corre la curva y deja esos meses en cero, sin cambiar el total', () => {
    const sin = proyectar(base)
    const con = proyectar(base, { detencion: { desde: '2027-03', meses: 4 } })
    expect(con.N).toBe(sin.N)
    expect(con.NT).toBe(sin.NT + 4)
    const congelados = con.meses.filter(m => m.ym >= '2027-03' && m.ym <= '2027-06')
    expect(congelados).toHaveLength(4)
    for (const m of congelados) expect(m.mes).toBe(0)
    const suma = con.meses.reduce((s, m) => s + m.mes, 0)
    expect(Math.abs(suma - con.total)).toBeLessThan(0.01)
    expect(con.meses[con.meses.length - 1].ym).toBe('2029-06')
  })
})

describe('la mezcla por similitud sigue siendo el modo alternativo', () => {
  it('el default de la obra completa es la curva característica', () => {
    const p = proyectar({
      nombre: 'La Quebrada',
      tipo: 'Edificio Habitacional',
      m2: 9576.96,
      contrato: 282990.89,
      costoConstruccion: 244825.81104912888,
      plazo: 22,
      inicio: '2025-11',
    })
    expect(p.modoModelo).toBe('caracteristica')
    expect(p.anclaOrigen).toBe('costo_construccion')
    expect(p.N).toBe(26)
    expect(p.total).toBeCloseTo(244825.81104912888 * modeloVigente().ejecCC, 4)
  })
})
