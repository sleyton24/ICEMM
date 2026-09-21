import type { PlanCuentas } from '../../plan-cuentas/types'

/**
 * Las cinco familias que el modelo proyecta, con su código en el Plan de
 * Cuentas de ICEMM.
 *
 * No son "cuentas" en el sentido estricto —las cuentas son 101, 102, 305…—
 * sino los encabezados de familia. El modelo tiene una curva por familia y
 * NO por cuenta individual: eso último necesita el ítem 3 del consolidado
 * para las siete obras que faltan, que depende de EMM.
 */
export interface FamiliaModelo {
  /** Clave en curvas-base.json */
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
 * el rango. Devuelve undefined para lo que queda fuera del perímetro: las 900
 * (oficina central), las 600 (Utilidad y Postventa) y las 700/800.
 */
export function familiaDeCuenta(cc: number, plan: PlanCuentas): FamiliaModelo | undefined {
  if (!Number.isFinite(cc)) return undefined
  const cuenta = plan.cuentas.find(c => c.codigo === cc)
  const codigo = cuenta ? cuenta.familiaCodigo : Math.floor(cc / 100) * 100
  return POR_CODIGO.get(codigo)
}
