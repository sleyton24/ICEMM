import type { PlanCuentas } from '../../plan-cuentas/types'
import { curvasBase } from './curvasBase'
import { cuentaBase, cuentasDeFamilia } from './curvasCuenta'
import { familiaPorClave } from './familias'

/**
 * Una cuenta tal como la ofrece el selector.
 *
 * `tieneCurva` es la curva propia, armada con el criterio del artefacto.
 * Si no la hay pero la familia sí tiene curva histórica, `respaldoFamilia`
 * permite mostrar esa forma en vez de esconder la cuenta. La familia 600 no
 * tiene curva base: sus cuentas quedan visibles igual, solo con el aviso.
 */
export interface CuentaVisible {
  codigo: string
  tieneCurva: boolean
  respaldoFamilia: boolean
  nObras: number
  shareMedio: number
}

export function familiaTieneCurva(clave: string): boolean {
  return curvasBase.familias.includes(clave)
}

/** Cuentas de la familia, con curva primero y el resto del plan después. */
export function cuentasVisibles(familiaClave: string, plan: PlanCuentas): CuentaVisible[] {
  const fam = familiaPorClave(familiaClave)
  if (!fam) return []

  const respaldo = familiaTieneCurva(familiaClave)
  const conCurva = new Map(
    cuentasDeFamilia(familiaClave).map(c => [c.codigo, c]),
  )
  const codigos = new Set<string>(conCurva.keys())
  for (const c of plan.cuentas) {
    if (c.familiaCodigo === fam.codigo) codigos.add(String(c.codigo))
  }

  const lista: CuentaVisible[] = []
  for (const codigo of codigos) {
    const cb = conCurva.get(codigo) ?? cuentaBase(codigo)
    if (cb && cb.familia === familiaClave) {
      lista.push({
        codigo,
        tieneCurva: true,
        respaldoFamilia: false,
        nObras: cb.nObras,
        shareMedio: cb.shareMedio,
      })
    } else {
      lista.push({
        codigo,
        tieneCurva: false,
        respaldoFamilia: respaldo,
        nObras: 0,
        shareMedio: 0,
      })
    }
  }

  return lista.sort((a, b) => {
    if (a.tieneCurva !== b.tieneCurva) return a.tieneCurva ? -1 : 1
    if (a.tieneCurva && a.shareMedio !== b.shareMedio) return b.shareMedio - a.shareMedio
    return Number(a.codigo) - Number(b.codigo)
  })
}
