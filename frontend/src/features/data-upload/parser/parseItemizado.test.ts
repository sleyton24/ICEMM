import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseItemizado } from './parseItemizado'

/**
 * Itemizado mínimo con el layout que espera el parser:
 *   fila header ["Item", ..., "Total"] → familias → ítems → TOTAL <familia> → TOTAL
 */
function construirItemizado(filasExtra: any[][] = []): ArrayBuffer {
  const filas: any[][] = [
    ['Proyecto', 'EDIFICIO DE PRUEBA'],
    [],
    ['Item', 'C. Costo', 'Descripción', 'Ud', 'Cantidad', 'Precio', 'Total'],
    [],
    ['MATERIALES'],
    ['M10100001', 101, 'Aridos, Bases, Rellenos', 'm3', 10, 100, 1000],
    ['M10200001', 102, 'Cemento', 'sc', 5, 40, 200],
    [],
    ['', '', 'TOTAL MATERIALES', '', '', '', 1200],
    [],
    ['GASTOS OFICINA CENTRAL'],
    ['I90100001', 901, 'Recursos Humanos Of Central', 'gl', 1, 500, 500],
    ['I91300001', 913, 'Directorio', 'gl', 1, 250, 250],
    ...filasExtra,
    [],
    ['', '', 'TOTAL GASTOS OFICINA CENTRAL', '', '', '', 750],
    [],
    ['', '', 'TOTAL', '', '', '', 1950],
  ]
  const ws = XLSX.utils.aoa_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Itemizado')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseItemizado — cuentas 900 (Gastos Oficina Central)', () => {
  const r = parseItemizado(construirItemizado())

  it('no carga las partidas de cuentas 900', () => {
    expect(r.partidas.map(p => p.codigo2)).toEqual([101, 102])
  })

  it('descuenta las 900 del total general para que cuadre con lo cargado', () => {
    // El archivo dice 1950; 750 son de oficina central → quedan 1200
    expect(r.totalGeneral).toBeCloseTo(1200, 2)
    expect(r.partidas.reduce((s, p) => s + p.total, 0)).toBeCloseTo(1200, 2)
  })

  it('no deja el subtotal de oficina central en subtotalesFamilia', () => {
    expect(r.subtotalesFamilia).not.toHaveProperty('GASTOS OFICINA CENTRAL')
    expect(r.subtotalesFamilia['MATERIALES']).toBeCloseTo(1200, 2)
  })

  it('avisa de lo que excluyó, con cantidad y monto', () => {
    const aviso = r.warnings.find(w => w.includes('Oficina Central'))
    expect(aviso).toBeDefined()
    expect(aviso).toMatch(/2 partida/)
    expect(aviso).toMatch(/750\.00 UF/)
  })

  it('no genera discrepancia falsa al validar subtotales contra partidas', () => {
    // Si el subtotal de las 900 sobreviviera, la validación cruzada compararía
    // suma=0 contra subtotal=750 y emitiría una discrepancia que no existe.
    expect(r.warnings.filter(w => w.includes('Discrepancia'))).toEqual([])
  })

  it('excluye filas de la sección 900 aunque vengan sin C. Costo', () => {
    const conHuerfana = parseItemizado(
      construirItemizado([['I99900001', null, 'Gasto sin cuenta', 'gl', 1, 90, 90]]),
    )
    expect(conHuerfana.partidas.map(p => p.codigo2)).toEqual([101, 102])
  })
})
