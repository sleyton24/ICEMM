import type { PlanCuentas } from './types'

/** Familia 900 del Plan de Cuentas — Gastos de Oficina Central. */
export const FAMILIA_OFICINA_CENTRAL = 900

/**
 * Las cuentas 900 (901-914) son gasto corporativo, no costo de obra: no deben
 * entrar al informe de resultado.
 *
 * Se filtran en dos capas a propósito:
 *
 *   1. En los parsers (itemizado y ERP), para que no se carguen nunca. Es la
 *      capa que importa: lo que no entra no puede colarse después.
 *   2. En mergeProyecto, para que los proyectos ya cargados en producción —que
 *      tienen las 900 guardadas en sus slots— tampoco las muestren.
 *
 * Con el plan a mano se resuelve por familiaCodigo; sin él (los parsers son
 * funciones puras sobre el archivo) se usa el rango. Hoy los dos criterios
 * coinciden: las 14 cuentas del plan en 900-999 son todas de la familia 900,
 * y ninguna otra cuenta lo es.
 */
export function esOficinaCentral(cc: number, plan?: PlanCuentas): boolean {
  if (!Number.isFinite(cc)) return false
  if (plan) {
    const cuenta = plan.cuentas.find(c => c.codigo === cc)
    if (cuenta) return cuenta.familiaCodigo === FAMILIA_OFICINA_CENTRAL
  }
  return Math.floor(cc / 100) * 100 === FAMILIA_OFICINA_CENTRAL
}

/** Nombre canónico de la familia, para filtrar subtotales por texto. */
export const NOMBRE_FAMILIA_OFICINA_CENTRAL = 'GASTOS OFICINA CENTRAL'
