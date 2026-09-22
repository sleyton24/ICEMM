import type { TipoObra } from '../../projects/types'
import { TIPOS_OBRA } from '../../projects/types'
import fichasJson from './bundled/fichas-emm.json'

/**
 * Ficha de una obra tal como la entregó EMM en el consolidado.
 *
 * Son los mismos cuatro datos que el formulario pedía a mano —tipo, m², plazo
 * y monto de contrato— más el contexto que ayuda a reconocer la obra. Salen de
 * `meta_all` del consolidado crudo, que cubre las 8 obras del modelo **y** La
 * Quebrada. Que La Quebrada esté acá y no en el modelo es correcto: es la obra
 * que se proyecta, y meterla entre las históricas sería fuga.
 */
export interface FichaConocida {
  nombre: string
  comuna: string
  tipo: TipoObra
  m2: number
  plazoMeses: number
  montoContratoUF: number
  unidades: number | string
  anios: string
  /** Nota de EMM sobre el monto; en La Quebrada aclara que incluye Post Venta. */
  obs?: string
  /** Si aporta curva al modelo. La obra proyectada no debe aportarla. */
  enModelo: boolean
}

const FICHAS = fichasJson as unknown as Record<string, FichaConocida>

/** Sin tildes, sin mayúsculas, sin espacios de más. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const tokens = (s: string): string[] => normalizar(s).split(' ').filter(Boolean)

/**
 * Palabras que un proyecto puede agregar al nombre de la obra sin cambiar de
 * qué obra habla. Cualquier otra palabra extra —"II", "etapa", "Chicureo"—
 * significa que es otra cosa, y ahí no se prellena nada.
 */
const GENERICAS = new Set([
  'edificio', 'edificios', 'obra', 'proyecto', 'condominio', 'torre', 'parque',
  'el', 'la', 'los', 'las', 'de', 'del', 'y',
])

/** Índice de la ficha desde `i`, si sus tokens aparecen seguidos en `enTokens`. */
function posicionDe(aguja: string[], enTokens: string[]): number {
  for (let i = 0; i + aguja.length <= enTokens.length; i++) {
    let ok = true
    for (let j = 0; j < aguja.length; j++) {
      if (enTokens[i + j] !== aguja[j]) { ok = false; break }
    }
    if (ok) return i
  }
  return -1
}

const INDICE = new Map<string, FichaConocida>()
for (const f of Object.values(FICHAS)) INDICE.set(normalizar(f.nombre), f)

/**
 * Busca la ficha de EMM que corresponde al nombre de un proyecto de ICEMM.
 *
 * Los nombres no coinciden carácter a carácter: el consolidado dice "Raices del
 * Taihuen" y el proyecto puede decir "Raíces del Taihuén" o "EDIFICIO LA
 * QUEBRADA". Se compara por PALABRAS, no por substring.
 *
 * La diferencia importa: con `String.includes` un proyecto llamado "Manantiales
 * de Chicureo" contenía "manantial" y se prellenaba con el contrato de
 * Manantial —UF 241.520 de otra obra—, y "La Quebrada II" tomaba los datos de
 * la etapa anterior. Acá los tokens de la ficha tienen que aparecer seguidos y
 * completos, y todo lo que sobre tiene que ser una palabra genérica.
 *
 * Ante cualquier duda devuelve null: que el usuario cargue la ficha a mano
 * cuesta cuatro campos; prellenar el monto de contrato equivocado se propaga a
 * toda la proyección sin que nada lo señale.
 */
export function fichaConocida(nombreProyecto: string): FichaConocida | null {
  const n = normalizar(nombreProyecto)
  if (!n) return null

  const exacta = INDICE.get(n)
  if (exacta) return exacta

  const tp = tokens(nombreProyecto)
  const candidatas = [...INDICE.values()].filter(f => {
    const tf = tokens(f.nombre)
    const i = posicionDe(tf, tp)
    if (i < 0) return false
    // Lo que sobra a los lados tiene que ser relleno, no otra obra.
    const sobra = [...tp.slice(0, i), ...tp.slice(i + tf.length)]
    return sobra.every(t => GENERICAS.has(t))
  })
  return candidatas.length === 1 ? candidatas[0] : null
}

/** Todas las fichas, para pantallas de referencia. */
export function fichasConocidas(): FichaConocida[] {
  return Object.values(FICHAS)
}

/**
 * Los tipos del consolidado y el enum de la app se escribieron juntos, pero el
 * JSON es un artefacto externo: si EMM entrega una obra con un tipo nuevo, es
 * mejor enterarse por un test que por un `<select>` que queda en blanco.
 */
export function tipoValido(t: string): t is TipoObra {
  return (TIPOS_OBRA as readonly string[]).includes(t)
}
