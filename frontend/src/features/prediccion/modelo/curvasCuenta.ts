import curvasCuentaJson from './bundled/curvas-cuenta.json'
import { curvasBase } from './curvasBase'

/**
 * Curva de una cuenta individual a lo largo del ciclo de obra.
 *
 * `curvas` y `shares` están alineados al orden de `curvasBase.obras`, con
 * `null` donde esa obra no tiene la cuenta. Ese null es información, no un
 * hueco a rellenar: significa que la obra no gastó en esa cuenta, y las
 * ponderaciones del modelo deben renormalizarse sobre las que sí la tienen.
 */
export interface CuentaBase {
  codigo: string
  familia: string
  /** En cuántas de las 8 obras hay curva utilizable. */
  nObras: number
  /** Participación media en el gasto de obra, sobre las obras donde aparece. */
  shareMedio: number
  curvas: (number[] | null)[]
  shares: (number | null)[]
  media: number[]
  desv: number[]
  /**
   * Cuánto retrocede la curva acumulada en su peor punto, 0 si nunca baja.
   *
   * Una curva acumulada que baja no es un error: es un mes negativo en el
   * dato —nota de crédito, reclasificación— y está igual dentro de las curvas
   * de familia. 23 de las 125 cuentas tienen alguna. Las caídas grandes caen
   * sobre cuentas minúsculas (la 119 retrocede 48% y pesa 0,04%).
   */
  caidaMax: number
}

interface ArtefactoCuentas {
  grid: number[]
  obras: string[]
  familias: string[]
  criterio: { minMesesActivos: number; minObras: number; ventana: string }
  cuentas: Record<string, CuentaBase>
}

/**
 * Artefacto derivado del consolidado crudo de EMM por
 * `scripts/build_curvas_cuenta.py`, con la misma receta que EMM usó para las
 * curvas de familia —validada: reproduce las 40 existentes hasta el redondeo.
 *
 * 125 cuentas de las 152 del consolidado. Las 27 que quedan fuera no alcanzan
 * el mínimo de 4 meses activos o de 3 obras; entre todas son el 3,5% del gasto.
 */
export const curvasCuenta = curvasCuentaJson as unknown as ArtefactoCuentas

export const CRITERIO_CUENTAS = curvasCuenta.criterio

/** El orden de obras del artefacto debe ser el de curvasBase, o todo se desalinea. */
const ORDEN_OK =
  curvasCuenta.obras.length === curvasBase.obras.length &&
  curvasCuenta.obras.every((n, i) => n === curvasBase.obras[i].nombre)

if (!ORDEN_OK) {
  throw new Error(
    'curvas-cuenta.json está desalineado con curvas-base.json: las curvas por obra ' +
    'se indexan por posición. Regenerá el artefacto con scripts/build_curvas_cuenta.py.',
  )
}

export function cuentaBase(codigo: string): CuentaBase | null {
  return curvasCuenta.cuentas[codigo] ?? null
}

export function hayCurvaDeCuenta(codigo: string): boolean {
  return codigo in curvasCuenta.cuentas
}

/** Todas las cuentas con curva, de mayor a menor participación. */
export function cuentasConCurva(): CuentaBase[] {
  return Object.values(curvasCuenta.cuentas).sort((a, b) => b.shareMedio - a.shareMedio)
}

/** Las cuentas de una familia, de mayor a menor participación. */
export function cuentasDeFamilia(familia: string): CuentaBase[] {
  return cuentasConCurva().filter(c => c.familia === familia)
}
