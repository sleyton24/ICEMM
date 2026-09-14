/**
 * Códigos de rollup por familia del extracto contable: 100, 200, 300, 400, 500.
 *
 * El ERP emite, además del detalle por cuenta, unas contrapartidas agrupadas a
 * nivel de familia con signo contrario. Duplican el detalle que ya viene
 * desglosado, así que sumarlas descuadra el gasto real: en La Quebrada son
 * −22.387 UF, y el acumulado pasa de 31.208,60 a 8.822 UF.
 *
 * No son cuentas: el Plan de Cuentas va de 101 a 914 y no contiene ningún
 * múltiplo de 100. Por eso hoy no corrompen la tabla de control (no encuentran
 * cuenta y caen en "sin partida"), pero sí el total del ERP y cualquier serie
 * construida sumando el agregado por mes.
 *
 * Se descartan al leer el archivo, igual que las cuentas 900, y también en
 * mergeProyecto para los proyectos que ya quedaron cargados con ellas dentro.
 */
export const CODIGOS_ROLLUP_FAMILIA = [100, 200, 300, 400, 500] as const

export function esRollupFamilia(cc: number): boolean {
  if (!Number.isFinite(cc)) return false
  return (CODIGOS_ROLLUP_FAMILIA as readonly number[]).includes(cc)
}
