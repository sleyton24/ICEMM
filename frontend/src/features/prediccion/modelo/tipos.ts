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
  /** Costo real ejecutado (cuentas 101–516 sin 421), en UF. */
  total: number
  anio_fin: number
  /** Costo real ejecutado / monto de contrato. Lo usa la mezcla por similitud. */
  ejec: number
  /**
   * Costo de construcción estudiado (columna Q, fuente roja). Ancla del total
   * de la curva característica: total = costo_construccion × ejec_cc.
   */
  costo_construccion?: number
  /** Costo real (cuentas 101–516 sin 421) / costo de construcción. */
  ejec_cc?: number
  /** Duración efectiva / plazo contractual. */
  ratio_dur: number
  /** Curva S normalizada sobre la grilla de 21 puntos. */
  curva_s: number[]
  fam: Record<string, { share: number; curva: number[] }>
}

/**
 * Ficha de la obra proyectada, tal como vino del consolidado de EMM.
 *
 * Estuvo tipada como `Record<string, unknown>` desde el principio, y por eso
 * pasó inadvertido que los cuatro datos que el formulario pedía a mano ya
 * estaban acá. Tipada de verdad, el editor los muestra.
 */
export interface FichaQuebrada {
  comuna: string
  tipo: string
  m2: number
  edificios: number | string
  subterraneos: number | string
  pisos: number | string
  unidades: number | string
  monto_contrato: number
  /** Costo de construcción estudiado (columna Q). */
  costo_construccion?: number
  plazo: number
  anios: string
  obs?: string
}

export interface CurvasBase {
  grid: number[]
  familias: string[]
  obras: ObraBase[]
  quebrada: FichaQuebrada
  backtest: Record<string, unknown>
  /**
   * Real de La Quebrada al corte. `fam_mes` está aplanado con clave
   * `"YYYY-MM|familia"` — sí, hay detalle por familia además del total.
   */
  real: {
    obra: string
    inicio: string
    corte: string
    serie: SerieRealMensual[]
    fam_mes: Record<string, number>
    total: number
    [k: string]: unknown
  }
}

/** Lo que hay que saber de la obra a proyectar. */
export interface ObraInput {
  nombre: string
  tipo: string
  /** Superficie construida. */
  m2: number
  /** Monto de contrato en UF. Ojo: NO es el presupuesto del itemizado. */
  contrato: number
  /**
   * Costo de construcción estudiado, columna Q. Si falta, la curva
   * característica usa el contrato como ancla y lo declara.
   */
  costoConstruccion?: number
  /** Plazo contractual en meses. */
  plazo: number
  /** Primer mes con registro de costo, "YYYY-MM". */
  inicio: string
}

export type ModoPesos = 'simil' | 'recientes' | 'igual'

/**
 * `caracteristica` es la curva Beta de Esteban (por defecto).
 * `similitud` es la mezcla del prototipo, conservada como modo alternativo.
 */
export type ModoModelo = 'caracteristica' | 'similitud'

/**
 * A: la forma es el costo real normalizado a 100%, y el total es CC × real/CC.
 * B: el acumulado se expresa sobre el Costo Construcción y termina en real/CC.
 */
export type LecturaCurva = 'A' | 'B'

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
  /** Override de duración efectiva / plazo. Solo lo usa la mezcla por similitud. */
  rdur?: number
  /**
   * Curva característica (Beta, duración por m²) o mezcla por similitud.
   * Sin esto, la obra completa usa la característica. Una familia o una cuenta
   * siguen por similitud: la característica no tiene curva a ese nivel.
   */
  modoModelo?: ModoModelo
  /** Cómo se normaliza el acumulado. Por defecto, la de la configuración (A). */
  lectura?: LecturaCurva
  /**
   * Detención prevista de la obra que se proyecta. Esos meses se agregan al
   * calendario, con gasto cero, y el resto de la curva se corre. No modifica
   * la duración estimada por m².
   */
  detencion?: { desde: string; meses: number }
  /** Duración en meses, si se quiere pisar la regresión por m². */
  duracionMeses?: number
  /** Nombres de las obras base a considerar. Por defecto, todas. */
  obrasActivas?: string[]
  /**
   * Proyectar una sola familia (clave de curvas-base: 'materiales',
   * 'subcontratos', …) en vez de la obra completa. Cada familia tiene su
   * propia curva y su propio calendario: Materiales gasta temprano,
   * Subcontratos tarde. Sin esto se proyecta la obra entera.
   */
  familia?: string
  /**
   * Proyectar una sola cuenta ('206', '313', …) en vez de la obra o la
   * familia. Un nivel más abajo que `familia`, con la misma lógica: la cuenta
   * tiene su propio calendario dentro del ciclo.
   *
   * No todas las cuentas están: solo las 125 que aparecen en 3 o más obras con
   * 4 o más meses de gasto. Ver `curvasCuenta.criterio`. Si se pasa junto con
   * `familia`, manda la cuenta.
   */
  cuenta?: string
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
  /** Costo real ejecutado de la obra histórica (cuentas 101–516 sin 421), en UF. */
  total: number
  anio_fin: number
}

export interface Proyeccion {
  obra: ObraInput
  opciones: Required<Pick<OpcionesProyeccion, 'lead' | 'skew' | 'modoPesos' | 'kRecencia'>> & {
    modoModelo: ModoModelo
    lectura: LecturaCurva
  }
  modoModelo: ModoModelo
  lectura: LecturaCurva
  /**
   * Monto contra el que se mide el factor de ejecución. En la curva
   * característica es el Costo Construcción; en la mezcla por similitud, el contrato.
   */
  ancla: number
  anclaOrigen: 'costo_construccion' | 'contrato'
  /** Error estándar de la duración por m², en meses. Null en la mezcla por similitud. */
  duracionError: number | null
  /**
   * Costo total proyectado. En la curva característica es ancla × real/CC;
   * en la mezcla por similitud es contrato × ejec. En modo familia es la
   * parte que le toca a esa familia.
   */
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
  /** Clave de la familia proyectada, o null si es la obra completa. */
  familia: string | null
  /** Código de la cuenta proyectada, o null si no es modo cuenta. */
  cuenta: string | null
  /**
   * En modo cuenta: sobre cuántas de las 8 obras se construyó la mezcla. Menos
   * de 8 significa que la cuenta no existe en todas y los pesos se
   * renormalizaron sobre las presentes.
   */
  obrasDeLaCuenta: number | null
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
