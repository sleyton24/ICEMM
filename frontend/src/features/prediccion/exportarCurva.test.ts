import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { armarLibroCurva, nombreArchivoCurva, COLUMNAS_CURVA, type DatosExportCurva, type FilaCurva } from './exportarCurva'

const filas: FilaCurva[] = [
  { ym: '2025-11', etiqueta: '25/11', proyeccion: 10.5, bandaBase: 8, bandaAlto: 5.25, real: 11.123456, reancla: 10.9 },
  { ym: '2025-12', etiqueta: '25/12', proyeccion: 30.75, bandaBase: 20, bandaAlto: 20, real: 31, reancla: 30.1 },
  { ym: '2026-12', etiqueta: '26/12', proyeccion: 93092.43, bandaBase: 72000, bandaAlto: 43025.51, real: null, reancla: 91529.65 },
]

const datos: DatosExportCurva = {
  obra: 'LA QUEBRADA',
  ambito: 'Toda la obra',
  subtitulo: 'LA QUEBRADA · 2 meses observados de 3 · proyectando la obra completa',
  corteReal: '2025-12',
  cutoffMesReal: null,
  kpis: [
    { label: 'Cierre proyectado — modelo', valor: 'UF 257.608', sub: 'contrato × 0.903' },
    { label: 'Cierre proyectado — obra', valor: 'UF 285.786', sub: '× 1.001 sobre esa base' },
    { label: 'Brecha entre ambos', valor: 'UF 28.178', sub: 'el modelo proyecta menos' },
    { label: 'Duración estimada', valor: '33 meses', sub: '30 efectivos + 3 de arranque' },
  ],
  cierreModeloUF: 257608.4,
  cierreObraUF: 285786.2,
  brechaUF: -28177.8,
  duracionMeses: 33,
  parametros: { mesesArranque: 3, sesgo: 0, escenario: 'Calendario' },
  filas,
  fechaDescarga: new Date(2026, 9, 28, 11, 30),
}

/** Escribe y vuelve a leer el archivo, como lo haria Excel. */
function idaYVuelta(wb: XLSX.WorkBook) {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return XLSX.read(buf, { type: 'array' })
}

describe('exportarCurva — Excel de la curva de costo acumulado', () => {
  const wb = idaYVuelta(armarLibroCurva(datos))

  it('tiene la hoja Curva y la hoja Resumen', () => {
    expect(wb.SheetNames).toEqual(['Curva', 'Resumen'])
  })

  it('Curva: una fila por mes con los mismos valores que el grafico', () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Curva'])
    expect(Object.keys(rows[0])).toEqual([...COLUMNAS_CURVA])
    expect(rows).toHaveLength(filas.length)
    filas.forEach((f, i) => {
      const r = rows[i]
      expect(r['Mes']).toBe(f.ym)
      expect(r['Mes (como en el gráfico)']).toBe(f.etiqueta)
      expect(r['Proyección del modelo (UF)']).toBe(f.proyeccion)
      expect(r['Banda inferior (UF)']).toBe(f.bandaBase)
      expect(r['Banda superior (UF)']).toBeCloseTo(f.bandaBase + f.bandaAlto, 6)
      expect(r['Dispersión histórica de forma (UF)']).toBe(f.bandaAlto)
      expect(r['Re-anclada al real (UF)']).toBe(f.reancla)
      if (f.real === null) expect(r['Real observado (UF)']).toBeUndefined()
      else expect(r['Real observado (UF)']).toBe(f.real)
    })
  })

  it('el mes 26/12 trae los valores que muestra el tooltip', () => {
    const r = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Curva'])[2]
    expect(r['Proyección del modelo (UF)']).toBe(93092.43)
    expect(r['Re-anclada al real (UF)']).toBe(91529.65)
    expect(r['Dispersión histórica de forma (UF)']).toBe(43025.51)
  })

  it('Resumen: obra, ambito, corte y los KPI como se muestran', () => {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Resumen'], { header: 1 })
    const texto = aoa.map(r => (r as unknown[]).join(' | ')).join('\n')
    expect(texto).toContain('Obra | LA QUEBRADA')
    expect(texto).toContain('Ámbito | Toda la obra')
    expect(texto).toContain('Último mes observado (corte) | 2025-12')
    expect(texto).toContain('Cierre proyectado — modelo | UF 257.608 | contrato × 0.903')
    expect(texto).toContain('Brecha entre ambos | UF 28.178 | el modelo proyecta menos')
    expect(texto).toContain('Duración estimada | 33 meses')
    expect(texto).toContain('Fecha de descarga | 2026-10-28 11:30')
  })

  it('nombre de archivo sin tildes ni espacios', () => {
    expect(nombreArchivoCurva('LA QUEBRADA', 'Toda la obra', datos.fechaDescarga))
      .toBe('curva-costo-la-quebrada-toda-la-obra-2026-10-28.xlsx')
    expect(nombreArchivoCurva('Ola Costanera', '200 Mano de obra', datos.fechaDescarga))
      .toBe('curva-costo-ola-costanera-200-mano-de-obra-2026-10-28.xlsx')
  })
})
