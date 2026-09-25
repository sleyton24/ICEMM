import type { PlanCuentas } from '../../plan-cuentas/types'

/**
 * Familias que el selector de proyección ofrece, con su código en el Plan de
 * Cuentas de ICEMM.
 *
 * Las cinco primeras (100 a 500) tienen curva histórica en las 8 obras base.
 * La 600 (Otros: utilidad, postventa, imprevistos) entra al selector igual:
 * el consolidado no trae bloque 600, así que sus cuentas se muestran con aviso
 * en vez de ocultarse. No se suma a la curva de la obra completa —esas cinco
 * ya cierran el costo de construcción.
 */
export interface FamiliaModelo {
  /** Clave en curvas-base.json, o `otros` para la familia 600 sin curva base. */
  clave: string
  /** Código de familia del Plan de Cuentas */
  codigo: number
  etiqueta: string
}

export const FAMILIAS_MODELO: FamiliaModelo[] = [
  { clave: 'materiales',       codigo: 100, etiqueta: 'Materiales' },
  { clave: 'mano_obra',        codigo: 200, etiqueta: 'Mano de obra' },
  { clave: 'subcontratos',     codigo: 300, etiqueta: 'Subcontratos' },
  { clave: 'gastos_generales', codigo: 400, etiqueta: 'Gastos generales' },
  { clave: 'equipos',          codigo: 500, etiqueta: 'Equipos y maquinarias' },
  { clave: 'otros',            codigo: 600, etiqueta: 'Otros' },
]

const POR_CODIGO = new Map(FAMILIAS_MODELO.map(f => [f.codigo, f]))
const POR_CLAVE = new Map(FAMILIAS_MODELO.map(f => [f.clave, f]))

export function familiaPorClave(clave: string): FamiliaModelo | undefined {
  return POR_CLAVE.get(clave)
}

/**
 * Familia del modelo a la que pertenece un centro de costo.
 *
 * Se resuelve por el Plan de Cuentas y, si la cuenta no está en el plan, por
 * el rango. Devuelve undefined para lo que queda fuera del selector: las 900
 * (oficina central) y las 700/800. La 600 sí entra, como familia `otros`.
 */
export function familiaDeCuenta(cc: number, plan: PlanCuentas): FamiliaModelo | undefined {
  if (!Number.isFinite(cc)) return undefined
  const cuenta = plan.cuentas.find(c => c.codigo === cc)
  const codigo = cuenta ? cuenta.familiaCodigo : Math.floor(cc / 100) * 100
  return POR_CODIGO.get(codigo)
}
