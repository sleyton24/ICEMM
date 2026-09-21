import type { Proyecto } from '../../projects/types'
import type { PlanCuentas } from '../../plan-cuentas/types'
import type { ObraInput, SerieRealMensual } from '../modelo/tipos'
import { serieRealDesdeERP } from './serieRealDesdeERP'

export interface ParametrosObra {
  /** Listo para proyectar, o null si falta algo. */
  obra: ObraInput | null
  /** Etiquetas legibles de lo que falta capturar. */
  faltantes: string[]
  serieReal: SerieRealMensual[]
  /** La misma serie por familia del modelo, sobre el mismo rango de meses. */
  serieRealPorFamilia: Record<string, SerieRealMensual[]>
  /** Primer mes con costo dentro del perímetro. */
  inicio: string | null
  excluido: { oficinaCentral: number; rollup: number; otros: number }
  advertencias: string[]
  /**
   * Factor de ejecución que se desprende de la propia proyección de la obra:
   * Σ proyectado / monto de contrato. Es el 101% de La Quebrada contra el
   * 90,3% del modelo — la discrepancia que sigue abierta con EMM. Se ofrece
   * como override para que la pantalla muestre las dos lecturas, no una.
   */
  ejecSegunObra: number | null
}

const ETIQUETAS: Record<string, string> = {
  tipoObra: 'Tipo de obra',
  m2: 'Superficie construida (m²)',
  plazoMeses: 'Plazo contractual (meses)',
  montoContratoUF: 'Monto de contrato (UF)',
}

/**
 * Traduce un Proyecto de ICEMM a la entrada del modelo de curvas.
 *
 * Tres de los cinco parámetros obligatorios son captura manual (tipo, m²,
 * plazo) y un cuarto —el monto de contrato— también, porque NO es el total del
 * itemizado: en La Quebrada difieren en 2.399,52 UF (+0,85%), y como el modelo
 * hace total = contrato × factor_ejecución, usarlos indistintamente corre todo
 * el nivel de la proyección.
 *
 * El quinto, `inicio`, sí se deriva: es el primer mes con costo dentro del
 * perímetro, que sale del ERP ya cargado.
 */
export function parametrosObra(
  proyecto: Proyecto,
  plan: PlanCuentas,
  totalProyectadoUF?: number,
): ParametrosObra {
  const erp = proyecto.slots.gasto_real_erp
  const real = erp
    ? serieRealDesdeERP(erp, plan, { cutoffMes: proyecto.cutoffMesReal ?? null })
    : {
        serie: [], porFamilia: {}, inicio: null, corte: null,
        excluido: { oficinaCentral: 0, rollup: 0, otros: 0 }, advertencias: [],
      }

  const faltantes: string[] = []
  for (const campo of ['tipoObra', 'm2', 'plazoMeses', 'montoContratoUF'] as const) {
    if (proyecto[campo] == null) faltantes.push(ETIQUETAS[campo])
  }

  const advertencias = [...real.advertencias]
  let inicio = real.inicio
  if (!inicio) {
    faltantes.push('Gasto real del ERP (define el mes de inicio)')
    inicio = null
  }

  const obra: ObraInput | null = faltantes.length === 0 && inicio
    ? {
        nombre: proyecto.nombre,
        tipo: proyecto.tipoObra!,
        m2: proyecto.m2!,
        contrato: proyecto.montoContratoUF!,
        plazo: proyecto.plazoMeses!,
        inicio,
      }
    : null

  const ejecSegunObra =
    totalProyectadoUF && totalProyectadoUF > 0 && proyecto.montoContratoUF
      ? totalProyectadoUF / proyecto.montoContratoUF
      : null

  return {
    obra,
    faltantes,
    serieReal: real.serie,
    serieRealPorFamilia: real.porFamilia,
    inicio,
    excluido: real.excluido,
    advertencias,
    ejecSegunObra,
  }
}
