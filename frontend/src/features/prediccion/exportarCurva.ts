import * as XLSX from 'xlsx'

/**
 * Exportar a Excel la curva de costo acumulado tal como la dibuja la pantalla de
 * proyeccion. No calcula nada: recibe las mismas filas (`chartData`) y los mismos
 * textos de KPI que usa el componente.
 */

/** Una fila del grafico: exactamente lo que recibe Recharts. */
export type FilaCurva = {
  ym: string
  etiqueta: string
  proyeccion: number
  bandaBase: number
  bandaAlto: number
  real: number | null
  reancla: number | null
}

export type KpiCurva = { label: string; valor: string; sub: string }

export type DatosExportCurva = {
  obra: string
  /** Ambito mostrado: "Toda la obra", la familia o la cuenta elegida. */
  ambito: string
  /** Texto de la cabecera del grafico (ej. "11 meses observados de 33 · proyectando la obra completa"). */
  subtitulo: string
  /** Ultimo mes observado ('YYYY-MM') o null si no hay real. */
  corteReal: string | null
  /** Filtro de corte configurado en el proyecto, si lo hay. */
  cutoffMesReal: string | null
  kpis: KpiCurva[]
  /** Valores numericos de los KPI (sin redondear), para que se puedan usar en Excel. */
  cierreModeloUF: number
  cierreObraUF: number | null
  brechaUF: number | null
  duracionMeses: number
  parametros: { mesesArranque: number; sesgo: number; escenario: string }
  filas: FilaCurva[]
  fechaDescarga: Date
}

export const COLUMNAS_CURVA = [
  'Mes',
  'Mes (como en el gráfico)',
  'Real observado (UF)',
  'Proyección del modelo (UF)',
  'Re-anclada al real (UF)',
  'Banda inferior (UF)',
  'Banda superior (UF)',
  'Dispersión histórica de forma (UF)',
] as const

const FMT_UF = '#,##0.00'

export function armarLibroCurva(d: DatosExportCurva): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  // ── Hoja "Curva": una fila por mes ────────────────────────────────────────
  const filas = d.filas.map(f => [
    f.ym,
    f.etiqueta,
    f.real,
    f.proyeccion,
    f.reancla,
    f.bandaBase,
    f.bandaBase + f.bandaAlto,
    f.bandaAlto,
  ])
  const wsCurva = XLSX.utils.aoa_to_sheet([[...COLUMNAS_CURVA], ...filas])
  formatearNumeros(wsCurva, 2, 7, filas.length)
  wsCurva['!cols'] = [10, 22, 20, 26, 22, 18, 18, 32].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, wsCurva, 'Curva')

  // ── Hoja "Resumen": obra, ambito, corte y KPI tal como se muestran ───────
  const resumen: (string | number | null)[][] = [
    ['CURVA DE COSTO ACUMULADO'],
    ['Obra', d.obra],
    ['Ámbito', d.ambito],
    ['Detalle del gráfico', d.subtitulo],
    ['Último mes observado (corte)', d.corteReal ?? 'sin real'],
    ['Corte configurado en la obra', d.cutoffMesReal ?? 'todos los meses'],
    ['Fecha de descarga', fechaLocal(d.fechaDescarga)],
    [],
    ['Parámetros'],
    ['Meses de arranque', d.parametros.mesesArranque],
    ['Sesgo de curva', d.parametros.sesgo],
    ['Escenario de re-pronóstico', d.parametros.escenario],
    [],
    ['KPI (como se muestran)', 'Valor', 'Nota'],
    ...d.kpis.map(k => [k.label, k.valor, k.sub]),
    [],
    ['KPI (valores sin redondear)', 'UF / meses'],
    ['Cierre proyectado — modelo (UF)', d.cierreModeloUF],
    ['Cierre proyectado — obra (UF)', d.cierreObraUF],
    ['Brecha entre ambos (UF, modelo − obra)', d.brechaUF],
    ['Duración estimada (meses)', d.duracionMeses],
    [],
    ['Nota', 'La banda es dispersión histórica de la forma de la curva entre las obras base; no es una probabilidad ni incluye la incertidumbre del nivel.'],
  ]
  const wsRes = XLSX.utils.aoa_to_sheet(resumen)
  // Formato de miles en los valores sin redondear.
  const iniNum = resumen.findIndex(r => r[0] === 'Cierre proyectado — modelo (UF)')
  for (let r = iniNum; r < iniNum + 3; r++) {
    const c = wsRes[XLSX.utils.encode_cell({ r, c: 1 })]
    if (c && typeof c.v === 'number') c.z = FMT_UF
  }
  wsRes['!cols'] = [{ wch: 40 }, { wch: 34 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen')

  return wb
}

/** Aplica el formato de miles a las columnas numericas [c0..c1] de las filas de datos. */
function formatearNumeros(ws: XLSX.WorkSheet, c0: number, c1: number, nFilas: number) {
  for (let r = 1; r <= nFilas; r++) {
    for (let c = c0; c <= c1; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell && typeof cell.v === 'number') cell.z = FMT_UF
    }
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
function fechaLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Nombre de archivo seguro: curva-costo-<obra>-<ambito>-<AAAA-MM-DD>.xlsx */
export function nombreArchivoCurva(obra: string, ambito: string, fecha: Date): string {
  const limpiar = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const f = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
  return `curva-costo-${limpiar(obra)}-${limpiar(ambito)}-${f}.xlsx`
}

export function descargarCurva(d: DatosExportCurva): void {
  XLSX.writeFile(armarLibroCurva(d), nombreArchivoCurva(d.obra, d.ambito, d.fechaDescarga))
}
