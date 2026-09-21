import { useTemaStore } from './TemaStore'

/**
 * Colores para gráficos y acentos.
 *
 * Recharts y los puntos de color se pintan con hex, no con clases, así que no
 * los alcanza el cambio de variables CSS: hay que dárselos explícitamente.
 *
 * Los valores oscuros no son los claros "aclarados a ojo". Sobre #0B1116 un
 * #E00544 vibra y cansa; los tonos de estado suben en luminosidad y bajan algo
 * de saturación para conservar el mismo rol sin gritar.
 */
export interface Paleta {
  /** Estados del semáforo. Las claves son las de EstadoPartida. */
  estado: Record<string, string>
  /** Colores por familia de recursos, para los gráficos categóricos. */
  familia: Record<string, string>
  /** Acentos de las tarjetas de KPI, en el orden en que se muestran. */
  kpi: { presupuesto: string; vigente: string; real: string; proyeccion: string }
  /** Positivo / negativo para variaciones. */
  positivo: string
  negativo: string
  /** Cromo de los gráficos. */
  grilla: string
  ejeTenue: string
  ejeFuerte: string
  /** Series de la curva de proyección. */
  curva: { modelo: string; banda: string; real: string; reancla: string; corte: string }
  /** Fondo de los tooltips de Recharts. */
  tooltipFondo: string
  tooltipBorde: string
  tooltipTexto: string
}

const CLARO: Paleta = {
  estado: {
    'CRITICO': '#E00544',
    'ALERTA': '#f59e0b',
    'EN CONTROL': '#16a34a',
    'FAVORABLE': '#0ea5e9',
    'SIN EJECUCION': '#9ca3af',
    'SOLO REAL': '#8b5cf6',
  },
  familia: {
    'MATERIALES': '#f59e0b',
    'MANO DE OBRA': '#1e293b',
    'SUBCONTRATOS': '#06b6d4',
    'GASTOS GENERALES': '#ec4899',
    'EQUIPOS Y MAQUINARIAS': '#8b5cf6',
    'OTROS': '#9ca3af',
    'EDIFICACIONES COMERCIALES': '#f97316',
    'POST VENTA': '#10b981',
    'GASTOS OFICINA CENTRAL': '#6366f1',
  },
  kpi: { presupuesto: '#233032', vigente: '#809494', real: '#101820', proyeccion: '#253136' },
  positivo: '#16a34a',
  negativo: '#E00544',
  grilla: '#e5e7eb',
  ejeTenue: '#9ca3af',
  ejeFuerte: '#374151',
  curva: { modelo: '#233032', banda: '#809494', real: '#16a34a', reancla: '#E00544', corte: '#C6CFCE' },
  tooltipFondo: '#FFFFFF',
  tooltipBorde: '#e5e7eb',
  tooltipTexto: '#101820',
}

const OSCURO: Paleta = {
  estado: {
    'CRITICO': '#FF3D6E',
    'ALERTA': '#D9B45F',
    'EN CONTROL': '#6FD3A8',
    'FAVORABLE': '#6BB8DE',
    'SIN EJECUCION': '#7C8E92',
    'SOLO REAL': '#B9A5E8',
  },
  familia: {
    'MATERIALES': '#E8B860',
    'MANO DE OBRA': '#8FA8BC',
    'SUBCONTRATOS': '#5FC9D8',
    'GASTOS GENERALES': '#F080B4',
    'EQUIPOS Y MAQUINARIAS': '#B9A5E8',
    'OTROS': '#7C8E92',
    'EDIFICACIONES COMERCIALES': '#F59B6A',
    'POST VENTA': '#6FD3A8',
    'GASTOS OFICINA CENTRAL': '#8E90EC',
  },
  kpi: { presupuesto: '#8FA3A3', vigente: '#6FA3A3', real: '#DBE8E8', proyeccion: '#7C8E92' },
  positivo: '#6FD3A8',
  negativo: '#FF3D6E',
  grilla: '#1C272D',
  ejeTenue: '#7C8E92',
  ejeFuerte: '#B4C2C2',
  curva: { modelo: '#96A6A6', banda: '#96A6A6', real: '#6FD3A8', reancla: '#FF3D6E', corte: '#3A4A52' },
  tooltipFondo: '#16222A',
  tooltipBorde: '#2A3A42',
  tooltipTexto: '#FFFFFF',
}

export function usePaleta(): Paleta {
  return useTemaStore(s => s.tema) === 'oscuro' ? OSCURO : CLARO
}

/** Para código fuera de React (formateadores de Recharts, por ejemplo). */
export function paletaActual(): Paleta {
  return useTemaStore.getState().tema === 'oscuro' ? OSCURO : CLARO
}
