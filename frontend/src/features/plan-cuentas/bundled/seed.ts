import type { PlanCuentas, MaestroProductos } from '../types'
import planCuentasJson from './plan-cuentas.json'
import maestroProductosJson from './maestro-productos.json'

export const planCuentasBundled: PlanCuentas = planCuentasJson as PlanCuentas
export const maestroProductosBundled: MaestroProductos = maestroProductosJson as MaestroProductos
