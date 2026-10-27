import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parsearERP, construirCargaERP } from './parseRealERP'
import { construirConciliacion, TOLERANCIA_UF, UMBRAL_DESCARTE_PCT } from './conciliacionErp'
import { esTraspasoCostoVenta } from '../../plan-cuentas/rollupFamilia'
import { mergeProyecto } from './mergeProyecto'
import type { Proyecto } from '../../projects/types'
import {
  FILAS_DETALLE_LQ_SEP_2026,
  FILAS_TRASPASO_LQ_SEP_2026,
  TOTAL_EXCEL_LQ_SEP_2026,
  TOTAL_TRASPASO_LQ_SEP_2026,
  TOTAL_POR_MES_EXCEL_LQ_SEP_2026,
} from './fixtures/laQuebradaSep2026'

/**
 * Estas pruebas fijan la regla "el Excel manda": el total de una carga es la suma
 * de todas las filas del archivo menos SOLO lo que se descarta a proposito, y lo
 * descartado queda explicado (ver docs/reglas-carga-erp.md).
 */

const HEADERS = [
  'Tipo de Comprobante', 'Codigo Unidad de Negocio', 'Descripción unidad de negocio', 'num_doc', 'tipo_doc',
  'mes', 'año', 'Fecha contable', 'ValOR UF', 'fecha pago factura', 'RUT proveedor', 'RazON Social Proveedor',
  'exento_detalle', 'exento_detalle_uf', 'afecto_detalle', 'afecto_detalle_uf', 'iva_detalle',
  'total_por_documento', 'concepto1_codigo', 'concepto1', 'centro_de_costo', 'observaciones',
  'Glosa encabezado comprobante', 'Glosa detalle comprobante', 'cuenta_contable',
]

type FilaIn = { unidad?: number; cc: number; mes: string; uf: number; glosaEnc?: string; glosaDet?: string; afecto?: boolean }

function fila(f: FilaIn): any[] {
  const [y, m] = f.mes.split('-')
  const unidad = f.unidad ?? 2
  const nombre = unidad === 2 ? 'LA QUEBRADA' : unidad === 3 ? 'OLA COSTANERA' : 'OF. CENTRAL ICEMM'
  return [
    'T-0', unidad, nombre, null, null, Number(m), Number(y), `28/${m}/${y} 00:00:00`, 40000, null, null, null,
    f.afecto ? null : f.uf * 40000, f.afecto ? 0 : f.uf, f.afecto ? f.uf * 40000 : null, f.afecto ? f.uf : 0, null, null,
    f.cc, f.cc, null, null, f.glosaEnc ?? 'Centralizacion', f.glosaDet ?? 'Servicio', '1-2-01-001',
  ]
}

function libro(filas: any[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...filas]), 'Sheet1')
  return wb
}

const sumaPorMes = (r: ReturnType<typeof parsearERP>) => {
  const out: Record<string, number> = {}
  for (const d of Object.values(r.porCentroCosto)) {
    for (const [mk, v] of Object.entries(d.porMes)) out[mk] = (out[mk] ?? 0) + v.monto_uf
  }
  return out
}

describe('Conciliacion con el Excel — muestra de LA QUEBRADA al 30-09-2026', () => {
  const filas: any[][] = []
  for (const [cc, mes, uf] of FILAS_DETALLE_LQ_SEP_2026) filas.push(fila({ cc, mes, uf }))
  for (const [cc, mes, uf] of FILAS_TRASPASO_LQ_SEP_2026) {
    filas.push(fila({ cc, mes, uf, glosaEnc: 'COSTO DE VENTA LA QUEBRADA AGOSTO 2026', glosaDet: 'COSTO DE VENTA LA QUEBRADA AGOSTO 2026' }))
  }
  // Como en el archivo real: filas de cuentas 900 con monto 0 y filas de otras obras.
  filas.push(fila({ cc: 904, mes: '2026-03', uf: 0 }), fila({ cc: 912, mes: '2026-06', uf: 0 }))
  filas.push(fila({ unidad: 3, cc: 101, mes: '2026-09', uf: 999 }), fila({ unidad: 1, cc: 901, mes: '2026-09', uf: 500 }))
  const r = parsearERP(libro(filas), 2)

  it('el total cargado es el del Excel, con el traspaso a costo de venta incluido', () => {
    expect(r.total_uf).toBeCloseTo(TOTAL_EXCEL_LQ_SEP_2026, 1)
  })

  it('las 5 filas 100-500 del traspaso estan cargadas con su monto', () => {
    for (const [cc, , uf] of FILAS_TRASPASO_LQ_SEP_2026) {
      expect(r.porCentroCosto[cc].monto_uf).toBeCloseTo(uf, 2)
    }
    const traspaso = FILAS_TRASPASO_LQ_SEP_2026.reduce((s, [, , uf]) => s + uf, 0)
    expect(traspaso).toBeCloseTo(TOTAL_TRASPASO_LQ_SEP_2026, 1)
  })

  it('cada mes cuadra con el Excel', () => {
    const porMes = sumaPorMes(r)
    for (const [mk, esperado] of Object.entries(TOTAL_POR_MES_EXCEL_LQ_SEP_2026)) {
      expect(porMes[mk]).toBeCloseTo(esperado, 1)
    }
  })

  it('la conciliacion del archivo cierra y no avisa nada (solo se descartaron filas en 0)', () => {
    const c = r.conciliacion
    expect(c.totalArchivoUF).toBeCloseTo(TOTAL_EXCEL_LQ_SEP_2026, 1)
    expect(Math.abs(c.diferenciaUF)).toBeLessThanOrEqual(TOLERANCIA_UF)
    expect(c.descartes).toEqual([{ motivo: 'oficina_central', filas: 2, uf: 0 }])
    expect(c.traspasoCostoVenta.filas).toBe(5)
    expect(c.traspasoCostoVenta.uf).toBeCloseTo(TOTAL_TRASPASO_LQ_SEP_2026, 1)
    expect(c.nivel).toBe('ok')
    expect(c.avisos).toEqual([])
  })

  it('lo que dibuja la pantalla (mergeProyecto) suma lo mismo que el Excel, al 30-09 y al 31-08', () => {
    const erp = construirCargaERP(r, 'Reporte de costos.xlsx')
    const proyecto: Proyecto = {
      id: 'lq', nombre: 'LA QUEBRADA', fechaCreacion: '', fechaActualizacion: '',
      slots: { presupuesto_original: null, presupuesto_redistribuido: null, ppto_horas_extra: null, gasto_real_erp: erp, proyectado: null },
    }
    const total = (corte: string) => {
      const m = mergeProyecto(proyecto, undefined, corte)
      return m.partidas.reduce((s, p) => s + p.gasto_real, 0) + m.sinPartida.reduce((s, p) => s + p.monto_uf, 0)
    }
    expect(total('2026-09')).toBeCloseTo(TOTAL_EXCEL_LQ_SEP_2026, 0)
    // Al 31-08 no entra el traspaso (cae en septiembre): es el total del Informe 4 aprobado.
    expect(total('2026-08')).toBeCloseTo(46150.43, 0)
  })
})

describe('Conciliacion — reglas de descarte', () => {
  const traspaso = (cc: number, extra: Partial<FilaIn> = {}) =>
    fila({ cc, mes: '2026-09', uf: -100, glosaDet: 'COSTO DE VENTA LA QUEBRADA AGOSTO 2026', ...extra })

  it('filas 100-500 con glosa COSTO DE VENTA (detalle o encabezado, cualquier formato) se incluyen', () => {
    const r = parsearERP(libro([
      fila({ cc: 101, mes: '2026-08', uf: 1000 }),
      traspaso(100),
      fila({ cc: 200, mes: '2026-09', uf: -50, glosaDet: 'Traspaso', glosaEnc: 'Costo de  venta La Quebrada Septiembre 2026' }),
      fila({ cc: 300, mes: '2026-09', uf: -25, glosaDet: 'costo de venta' }),
    ]), 2)
    expect(r.porCentroCosto[100].monto_uf).toBe(-100)
    expect(r.porCentroCosto[200].monto_uf).toBe(-50)
    expect(r.porCentroCosto[300].monto_uf).toBe(-25)
    expect(r.total_uf).toBeCloseTo(825, 2)
    expect(r.conciliacion.traspasoCostoVenta).toEqual({ filas: 3, uf: -175 })
  })

  it('rollups de familia sin esa glosa se descartan y quedan explicados', () => {
    const r = parsearERP(libro([
      fila({ cc: 101, mes: '2026-08', uf: 1000 }),
      fila({ cc: 100, mes: '2026-08', uf: -400, glosaEnc: 'Rollup familia 100', glosaDet: 'Rollup familia 100' }),
      fila({ cc: 400, mes: '2026-08', uf: -80, glosaEnc: 'Centralizacion', glosaDet: 'Servicio' }),
    ]), 2)
    expect(r.porCentroCosto[100]).toBeUndefined()
    expect(r.porCentroCosto[400]).toBeUndefined()
    expect(r.total_uf).toBeCloseTo(1000, 2)
    expect(r.conciliacion.descartes).toEqual([{ motivo: 'rollup_familia', filas: 2, uf: -480 }])
    expect(r.conciliacion.totalArchivoUF).toBeCloseTo(520, 2)
    expect(r.conciliacion.nivel).toBe('aviso')
    expect(r.conciliacion.avisos.join(' ')).toMatch(/sin glosa "COSTO DE VENTA"/)
  })

  it('total del archivo = total cargado + descartado, y solo se descarta lo conocido', () => {
    const r = parsearERP(libro([
      fila({ cc: 101, mes: '2026-08', uf: 700 }),
      fila({ cc: 201, mes: '2026-08', uf: 300, afecto: true }),
      traspaso(100),
      fila({ cc: 500, mes: '2026-08', uf: -60, glosaEnc: 'Rollup', glosaDet: 'Rollup' }),
      fila({ cc: 905, mes: '2026-08', uf: 40 }),
      fila({ unidad: 3, cc: 101, mes: '2026-08', uf: 5000 }), // otra obra: ni se cuenta
    ]), 2)
    const c = r.conciliacion
    expect(c.filasArchivo).toBe(5)
    expect(c.totalArchivoUF).toBeCloseTo(700 + 300 - 100 - 60 + 40, 2)
    expect(c.totalCargadoUF + c.totalDescartadoUF).toBeCloseTo(c.totalArchivoUF, 2)
    expect(c.diferenciaUF).toBeCloseTo(0, 2)
    expect(c.descartes.map(d => d.motivo).sort()).toEqual(['oficina_central', 'rollup_familia'])
  })

  it('invariante con archivos mezclados al azar: el total del archivo siempre cierra', () => {
    let seed = 12345
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let i = 0; i < 25; i++) {
      const filas: any[][] = []
      for (let k = 0; k < 40; k++) {
        const tipo = Math.floor(rnd() * 5)
        const uf = Math.round((rnd() * 2000 - 600) * 100) / 100
        if (tipo === 0) filas.push(fila({ cc: 100 + Math.floor(rnd() * 5) * 100, mes: '2026-09', uf, glosaDet: 'COSTO DE VENTA OBRA' }))
        else if (tipo === 1) filas.push(fila({ cc: 100 + Math.floor(rnd() * 5) * 100, mes: '2026-09', uf, glosaDet: 'Rollup' }))
        else if (tipo === 2) filas.push(fila({ cc: 901 + Math.floor(rnd() * 13), mes: '2026-09', uf }))
        else if (tipo === 3) filas.push(fila({ unidad: 3, cc: 101, mes: '2026-09', uf }))
        else filas.push(fila({ cc: 101 + Math.floor(rnd() * 400), mes: '2026-0' + (1 + Math.floor(rnd() * 9)), uf, afecto: rnd() > 0.5 }))
      }
      const c = parsearERP(libro(filas), 2).conciliacion
      expect(Math.abs(c.diferenciaUF)).toBeLessThanOrEqual(TOLERANCIA_UF)
      expect(c.totalCargadoUF + c.totalDescartadoUF).toBeCloseTo(c.totalArchivoUF, 1)
    }
  })

  it('esTraspasoCostoVenta reconoce la glosa en cualquier posicion y formato', () => {
    expect(esTraspasoCostoVenta('COSTO DE VENTA LA QUEBRADA AGOSTO 2026')).toBe(true)
    expect(esTraspasoCostoVenta('x', 'Costo  de   Venta ola')).toBe(true)
    expect(esTraspasoCostoVenta('Rollup familia 100')).toBe(false)
    expect(esTraspasoCostoVenta(null, undefined, '')).toBe(false)
  })
})

describe('construirConciliacion — avisos en el log (nunca bloquean la carga)', () => {
  const base = {
    unidadNegocioCodigo: 2, filasArchivo: 10, totalArchivoUF: 1000, filasCargadas: 10, totalCargadoUF: 1000,
    oficinaCentral: { filas: 0, uf: 0 }, rollupFamilia: { filas: 0, uf: 0 }, traspasoCostoVenta: { filas: 0, uf: 0 }, filasSinCodigo: 0,
  }

  it('sin descartes y cerrando: ok', () => {
    const c = construirConciliacion(base)
    expect(c.nivel).toBe('ok')
    expect(c.diferenciaUF).toBe(0)
  })

  it('una diferencia sin motivo conocido avisa', () => {
    const c = construirConciliacion({ ...base, totalCargadoUF: 900 })
    expect(c.nivel).toBe('aviso')
    expect(c.avisos[0]).toMatch(/sin motivo conocido/)
  })

  it('descartar mas del umbral del total avisa, aunque el motivo sea conocido', () => {
    const uf = (UMBRAL_DESCARTE_PCT / 100) * 1000 + 50
    const c = construirConciliacion({ ...base, totalCargadoUF: 1000 - uf, oficinaCentral: { filas: 3, uf } })
    expect(c.nivel).toBe('aviso')
    expect(c.avisos.join(' ')).toMatch(/umbral/)
  })

  it('un descarte chico de oficina central no avisa', () => {
    const c = construirConciliacion({ ...base, totalCargadoUF: 995, oficinaCentral: { filas: 1, uf: 5 } })
    expect(c.nivel).toBe('ok')
  })

  it('filas sin codigo de cuenta avisan', () => {
    expect(construirConciliacion({ ...base, filasSinCodigo: 2 }).nivel).toBe('aviso')
  })
})
