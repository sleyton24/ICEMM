import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { hojaCuentas, leerHojaCuentas, filtrarCuentas, COLUMNAS_CUENTAS } from './maestroCuentasExcel'
import { planCuentasBundled } from './bundled/seed'

describe('maestro de cuentas Excel', () => {
  it('exportar → leer devuelve las mismas 188 cuentas con columnas exactas', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'otra')
    XLSX.utils.book_append_sheet(wb, hojaCuentas(planCuentasBundled.cuentas), 'cuentas')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const { header, rows } = leerHojaCuentas(XLSX.read(buf, { type: 'array' }))
    expect(header).toEqual([...COLUMNAS_CUENTAS])
    expect(rows).toHaveLength(188)
    expect(rows[0]).toEqual([planCuentasBundled.cuentas[0].codigo, planCuentasBundled.cuentas[0].descripcion, planCuentasBundled.cuentas[0].familiaCodigo, planCuentasBundled.cuentas[0].letra])
  })
  it('filtra por búsqueda, familia y letra', () => {
    const c = planCuentasBundled.cuentas
    expect(filtrarCuentas(c, {})).toHaveLength(188)
    expect(filtrarCuentas(c, { familia: 100 }).every(x => x.familiaCodigo === 100)).toBe(true)
    expect(filtrarCuentas(c, { letra: 'O' }).every(x => x.letra === 'O')).toBe(true)
    const d = c[5].descripcion.slice(0, 5).toUpperCase()
    expect(filtrarCuentas(c, { q: d }).length).toBeGreaterThan(0)
  })
})
