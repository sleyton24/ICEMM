import type { CurvasBase } from './tipos'
import curvasBaseJson from './bundled/curvas-base.json'

/**
 * Artefacto del modelo: 8 obras históricas normalizadas sobre una grilla de 21
 * puntos, con su mix y sus curvas por familia. Se embebe igual que el Plan de
 * Cuentas — son 15,7 KB y no cambian salvo que EMM entregue obras nuevas.
 */
export const curvasBase = curvasBaseJson as unknown as CurvasBase

export const GRID = curvasBase.grid
export const FAMILIAS_MODELO = curvasBase.familias
