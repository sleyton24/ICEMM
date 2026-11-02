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

/**
 * Traspaso mensual a costo de venta ("COSTO DE VENTA <OBRA> <MES>"): asiento
 * que el ERP contabiliza contra los codigos de familia 100..500. A diferencia de
 * una contrapartida de rollup, es parte del reporte contable y el Excel del ERP
 * lo suma: la app debe cuadrar con ese total. Se reconoce por la glosa del
 * comprobante (detalle o encabezado), asi que funciona para cualquier mes.
 */
export function esTraspasoCostoVenta(...glosas: Array<string | null | undefined>): boolean {
  return glosas.some(g => typeof g === 'string' && /costo\s+de\s+venta/i.test(g))
}
