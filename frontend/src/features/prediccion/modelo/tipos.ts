/** Tipos del modelo de proyección de curvas de costo (v1). */

export type TipoObra =
  | 'Edificio Habitacional'
  | 'Edificio Habitacional + Locales Comerciales'
  | 'Casas Habitacionales'
  | 'Hotel'

/** Una de las 8 obras históricas que forman la base del modelo. */
export interface ObraBase {
  nombre: string
  tipo: string
  m2: number
  contrato: number
  anio_fin: number
  /** Costo real ejecutado / monto de contrato. */
  ejec: number
  /** Duración efectiva / plazo contractual. */
  ratio_dur: number
  /** Curva S normalizada sobre la grilla de 21 puntos. */
  curva_s: number[]
  fam: Record<string, { share: number; curva: number[] }>
}

export interface CurvasBase {
  grid: number[]
  familias: string[]
  obras: ObraBase[]
  quebrada: Record<string, unknown>
  backtest: Record<string, unknown>
  real: Record<string, unknown>
}

/** Lo que hay que saber de la obra a proyectar. */
export interface ObraInput {
  nombre: string
  tipo: string
  /** Superficie construida. */
  m2: number
  /** Monto de contrato en UF. Ojo: NO es el presupuesto del itemizado. */
  contrato: number
  /** Plazo contractual en meses. */
  plazo: number
  /** Primer mes con registro de costo, "YYYY-MM". */
  inicio: string
}

export type ModoPesos = 'simil' | 'recientes' | 'igual'

export interface OpcionesProyeccion {
  /** Meses de arranque previos al cruce del 1% de avance. */
  lead?: number
  /** Sesgo de la curva, [-30, 30]. */
  skew?: number
  modoPesos?: ModoPesos
  /** Ponderación por antigüedad; 1,0 por defecto. */
  kRecencia?: number
  /** Override del factor de ejecución. Sin esto se usa el ponderado histórico. */
  ejec?: number
  /** Override de duración efectiva / plazo. */
  rdur?: number
  /** Nombres de las obras base a considerar. Por defecto, todas. */
  obrasActivas?: string[]
}

export interface PuntoMensual {
  /** 1-based. */
  i: number
  /** "YYYY-MM". */
  ym: string
  /** Gasto del mes, UF. */
  mes: number
  /** Gasto acumulado, UF. */
  acum: number
  /** acum / total. Es la curva que se monetiza y se grafica. */
  pctAcum: number
  /**
   * Curva mezclada cruda, antes de reconciliar las familias contra el total.
   * NO coincide con pctAcum: difieren hasta 0,47 pp en La Quebrada. La banda
   * p10/p90 está centrada en ESTA, no en pctAcum — es así en el prototipo y se
   * reproduce tal cual. Ver docs/MODELO.md pasos 4 y 5.
   */
  curvaMezclada: number
  p10: number
  p90: number
  familias: Record<string, number>
  familiasMes: Record<string, number>
}

export interface Comparable {
  nombre: string
  peso: number
  tipo: string
  m2: number
  contrato: number
  anio_fin: number
}

export interface Proyeccion {
  obra: ObraInput
  opciones: Required<Pick<OpcionesProyeccion, 'lead' | 'skew' | 'modoPesos' | 'kRecencia'>>
  /** Costo total proyectado = contrato × ejec. */
  total: number
  ejec: number
  ejecAuto: number
  rdur: number
  rdurAuto: number
  /** Meses efectivos de obra. */
  N: number
  /** Meses con registro de costo = N + lead. */
  NT: number
  /** Dispersión del factor de ejecución entre las obras base. */
  sdE: number
  mix: Record<string, number>
  meses: PuntoMensual[]
  comparables: Comparable[]
  /**
   * Suma de exp(−d) SIN normalizar: cuánta masa de similitud real tiene esta
   * obra contra la base histórica. Los pesos se normalizan siempre, así que
   * este número es lo único que distingue "se parece a varias" de "no se
   * parece a ninguna". Ver `cercania`.
   */
  masaSimilitud: number
  advertencias: string[]
}

export type Escenario = 'plazo' | 'mixto' | 'desem'

/** Serie real mensual observada, densa y contigua desde el inicio de la obra. */
export interface SerieRealMensual {
  ym: string
  mes: number
  acum: number
}

export interface Reproyeccion extends Proyeccion {
  reproyeccion: {
    /** Mes de corte, 1-based. */
    k: number
    realAcum: number
    planAcum: number
    /** real / plan al mes de corte. */
    desempeno: number
    escenario: Escenario
    totalNuevo: number
    desvio: number
    /** Serie re-anclada: real observado en el pasado, forma de la curva en el futuro. */
    serie: { i: number; ym: string; acum: number; mes: number }[]
  }
}
