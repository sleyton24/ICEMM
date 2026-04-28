export type FamiliaCanonica =
  | 'MATERIALES'
  | 'MANO DE OBRA'
  | 'SUBCONTRATOS'
  | 'GASTOS GENERALES'
  | 'EQUIPOS Y MAQUINARIAS'
  | 'OTROS'
  | 'EDIFICACIONES COMERCIALES'
  | 'POST VENTA'
  | 'GASTOS OFICINA CENTRAL'

export type EstadoPartida = 'CRITICO' | 'ALERTA' | 'EN CONTROL' | 'FAVORABLE' | 'SIN EJECUCION' | 'SOLO REAL'

export type SlotTipo = 'presupuesto_original' | 'presupuesto_redistribuido' | 'ppto_horas_extra' | 'gasto_real_erp' | 'proyectado'

/** Partida raw extraída del parser (sin merge) */
export interface PartidaRaw {
  codigo: string          // col A — Item
  codigo2: number | string // col B — C. Costo
  descripcion: string     // col C
  familia: FamiliaCanonica
  ud: string              // col D
  cantidad: number        // col E
  precio_unitario: number // col F
  total: number           // col G
}

/** Resultado del parseo de un archivo itemizado */
export interface ParseResult {
  nombreProyecto: string
  partidas: PartidaRaw[]
  subtotalesFamilia: Record<string, number>
  totalGeneral: number
  redondeo: number
  warnings: string[]
}

/** Archivo cargado en un slot de itemizado (presupuesto original/redistribuido) */
export interface ArchivoCargado {
  nombreArchivo: string
  fechaCarga: string      // ISO string
  partidas: PartidaRaw[]
  subtotalesFamilia: Record<string, number>
  totalGeneral: number
}

/** Una transacción individual del ERP (raw) */
export interface TransaccionERP {
  unidadNegocioDescripcion: string  // col C
  num_doc: string                    // col D
  mes: number                        // col F
  ano: number                        // col G
  fecha_contable: string             // col H "DD/MM/YYYY"
  valor_uf: number                   // col I
  rut_proveedor: string              // col K
  razon_social: string               // col L
  monto_uf: number                   // calculated: afecto_uf + exento_uf
  concepto1_codigo: number           // col S
  glosa_detalle: string              // col X
  /** Mes key "YYYY-MM" para filtrado por cutoff */
  mesKey: string
}

/** Datos cargados desde el export SQL del ERP */
export interface CargaERP {
  fechaCarga: string        // ISO string
  nombreArchivo: string
  unidadNegocioCodigo: number
  unidadNegocioDescripcion: string
  totalUF: number
  numTransacciones: number
  rangoFechas: { desde: string; hasta: string }
  agregadoPorCcosto: Record<number, { monto_uf: number; num_tx: number }>
  /** Per-month breakdown: cc → "YYYY-MM" → { monto_uf, num_tx } */
  agregadoPorCcostoPorMes: Record<number, Record<string, { monto_uf: number; num_tx: number }>>
  /** All months present in the file, sorted ascending (e.g. ["2026-01", "2026-02", ...]) */
  mesesDisponibles: string[]
  /** Transacciones agrupadas por centro de costo */
  transaccionesPorCcosto: Record<number, TransaccionERP[]>
}

/** Movimiento sin partida presupuestaria (para SinPartidaPanel) */
export interface MovimientoSinPartida {
  concepto_codigo: number
  descripcion: string
  monto_uf: number
  num_transacciones: number
  proveedores_top: { razon_social: string; monto_uf: number }[]
}

/** Proyecto completo */
export interface Proyecto {
  id: string
  nombre: string
  unidadNegocioCodigo?: number      // se setea al primer upload de ERP
  /** Filtro de fecha para gasto real: "YYYY-MM" mostrando hasta ese mes inclusive. null = todos */
  cutoffMesReal?: string | null
  fechaCreacion: string
  fechaActualizacion: string
  slots: {
    presupuesto_original: ArchivoCargado | null
    presupuesto_redistribuido: ArchivoCargado | null
    ppto_horas_extra: ArchivoCargado | null
    gasto_real_erp: CargaERP | null
    proyectado: ArchivoCargado | null
  }
}
