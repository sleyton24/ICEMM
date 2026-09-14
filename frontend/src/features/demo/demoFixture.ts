import type {
  Proyecto,
  PartidaRaw,
  ArchivoCargado,
  CargaERP,
  FamiliaCanonica,
  TransaccionERP,
  TipoObra,
} from '../projects/types'
import { partidas as cuentasMaestro } from '../../data/mockData'

/**
 * Datos de demostración.
 *
 * Construye dos obras completas a partir del maestro de 188 cuentas de
 * mockData, y las inyecta en ProjectsStore como proyectos normales. La clave
 * es que NO son números pre-cocinados: se cargan en los mismos slots que un
 * Excel real (original / redistribuido / OO.EE. / proyectado / ERP) y pasan
 * por mergeProyecto igual que los datos de producción. Así la demo ejercita
 * el código de verdad — incluida la exclusión de las cuentas 900 y el estado
 * agregado por familia.
 *
 * Todo es determinista (hash del código de cuenta, sin Math.random): la demo
 * se ve idéntica en cada recarga, que es lo que uno quiere al proyectar.
 */

/** Hash FNV-1a → [0,1). Determinista, para variar montos sin azar. */
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Desvío objetivo de cada familia = proyectado / ppto vigente.
 *
 * La variación que colorea el semáforo es (vigente - proyectado) / vigente,
 * así que un factor > 1 es sobrecosto. Elegidos para que el contador por
 * familia muestre un abanico completo en vez de un bloque monocorde:
 *
 *   1.14 → -14% → CRITICO      1.07 → -7% → ALERTA
 *   1.03 → -3%  → EN CONTROL   0.90 → +10% → FAVORABLE
 */
const DESVIO_FAMILIA: Record<string, number> = {
  'MATERIALES':            1.14,
  'MANO DE OBRA':          1.07,
  'SUBCONTRATOS':          1.01,
  'GASTOS GENERALES':      0.90,
  'EQUIPOS Y MAQUINARIAS': 1.03,
  'OTROS':                 1.00,
}

/**
 * Dispersión por partida dentro de la familia.
 *
 * SUBCONTRATOS va alto a propósito: sus partidas se van fuerte para ambos
 * lados y aun así la familia cierra EN CONTROL. Es justamente lo que hace
 * visible el cambio del contador — a nivel partida hay rojos, a nivel
 * familia no hay problema.
 */
const DISPERSION_FAMILIA: Record<string, number> = {
  'SUBCONTRATOS': 0.38,
  'MATERIALES':   0.12,
}
const DISPERSION_DEFAULT = 0.06

/** Cuentas que el Directorio lee puntualmente y conviene que tengan monto. */
const CUENTAS_DIRECTORIO: Record<string, { nombre: string; familia: FamiliaCanonica; monto: number }> = {
  '421': { nombre: 'Back Office Central',     familia: 'GASTOS GENERALES', monto: 1850.0 },
  '604': { nombre: 'Provisión Postventa',     familia: 'OTROS',            monto: 940.0 },
  '605': { nombre: 'Utilidad, Honorario Construccion', familia: 'OTROS',   monto: 12400.0 },
}

/** Montos para las cuentas 900 — existen en los datos para que se vea que el filtro las saca. */
const MONTO_OFICINA_CENTRAL = 620.0

interface CuentaBase {
  codigo2: string
  nombre: string
  familia: string
  base: number
}

/** Universo de cuentas de la demo: el maestro real, con montos garantizados. */
function construirUniverso(): CuentaBase[] {
  const universo: CuentaBase[] = cuentasMaestro.map(p => {
    const cc = Number(p.codigo2)
    let base = p.ppto_original

    // Las 900 tienen que traer plata para que la exclusión sea demostrable.
    if (cc >= 900 && cc < 1000) {
      base = r2(MONTO_OFICINA_CENTRAL * (0.4 + hash01(p.codigo2) * 1.6))
    } else if (base === 0) {
      // El maestro trae muchas cuentas en cero; les damos un monto plausible
      // para que las tablas tengan cuerpo en vez de filas vacías.
      base = r2(120 + hash01(p.codigo2) * 2400)
    }

    const forzada = CUENTAS_DIRECTORIO[p.codigo2]
    if (forzada) base = forzada.monto

    return { codigo2: p.codigo2, nombre: p.partida, familia: p.familia, base }
  })

  // Garantizar que las cuentas que lee el Directorio existan aunque el maestro cambie
  for (const [codigo2, info] of Object.entries(CUENTAS_DIRECTORIO)) {
    if (!universo.some(c => c.codigo2 === codigo2)) {
      universo.push({ codigo2, nombre: info.nombre, familia: info.familia, base: info.monto })
    }
  }

  return universo.sort((a, b) => Number(a.codigo2) - Number(b.codigo2))
}

const UNIVERSO = construirUniverso()

function partidaRaw(c: CuentaBase, total: number): PartidaRaw {
  return {
    codigo: `D${c.codigo2}`,
    codigo2: Number(c.codigo2),
    descripcion: c.nombre,
    familia: c.familia as FamiliaCanonica,
    ud: 'gl',
    cantidad: 1,
    precio_unitario: r2(total),
    total: r2(total),
  }
}

function archivo(nombreArchivo: string, fechaCarga: string, partidas: PartidaRaw[]): ArchivoCargado {
  return {
    nombreArchivo,
    fechaCarga,
    partidas,
    subtotalesFamilia: partidas.reduce<Record<string, number>>((acc, p) => {
      acc[p.familia] = r2((acc[p.familia] ?? 0) + p.total)
      return acc
    }, {}),
    totalGeneral: r2(partidas.reduce((s, p) => s + p.total, 0)),
  }
}

interface ConfigObra {
  id: string
  nombre: string
  /** Ficha de obra: entradas del predictor de curvas. */
  tipoObra: TipoObra
  m2: number
  plazoMeses: number
  montoContratoUF: number
  escala: number
  /**
   * Fracción del proyectado ya gastada. Tiene que ser coherente con cuántos
   * meses de ERP trae la obra: el modelo proyecta ~34 meses de ciclo, así que
   * una obra con 6 meses cargados no puede ir 62% ejecutada sin que la curva
   * real se despegue de cualquier comparable histórico.
   */
  avance: number
  cutoffMesReal: string
  meses: string[]
  fechaCarga: string
}

function construirObra(cfg: ConfigObra): Proyecto {
  const { escala, avance } = cfg

  // ── Presupuesto original ───────────────────────────────────────────────
  const original = UNIVERSO.map(c => ({ c, total: r2(c.base * escala) }))

  // ── Redistribuido: mueve plata entre cuentas sin cambiar mucho el total ──
  const redistribuido = original.map(({ c, total }) => {
    const ajuste = 1 + (hash01(c.codigo2 + cfg.id) - 0.5) * 0.16
    return { c, total: r2(total * ajuste) }
  })

  // ── OO.EE.: solo algunas cuentas tienen obras extra ─────────────────────
  const horasExtra = redistribuido
    .filter(({ c }) => hash01('ooee' + c.codigo2 + cfg.id) > 0.78)
    .map(({ c, total }) => ({ c, total: r2(total * (0.04 + hash01('m' + c.codigo2) * 0.12)) }))

  const ooeePorCuenta = new Map(horasExtra.map(({ c, total }) => [c.codigo2, total]))

  // ── Proyectado: desvío objetivo por familia, con dispersión por partida ──
  // Se reescala dentro de cada familia para que el total caiga exactamente en
  // el objetivo; si no, la dispersión correría el agregado y el semáforo de
  // familia quedaría al azar.
  const vigentePorCuenta = new Map(
    redistribuido.map(({ c, total }) => [c.codigo2, total + (ooeePorCuenta.get(c.codigo2) ?? 0)]),
  )

  const porFamilia = new Map<string, CuentaBase[]>()
  for (const { c } of redistribuido) {
    const g = porFamilia.get(c.familia) ?? []
    g.push(c)
    porFamilia.set(c.familia, g)
  }

  const proyectadoPorCuenta = new Map<string, number>()
  for (const [familia, cuentas] of porFamilia) {
    const desvio = DESVIO_FAMILIA[familia] ?? 1.0
    const dispersion = DISPERSION_FAMILIA[familia] ?? DISPERSION_DEFAULT

    const crudos = cuentas.map(c => {
      const vig = vigentePorCuenta.get(c.codigo2) ?? 0
      const jitter = 1 + (hash01('p' + c.codigo2 + cfg.id) - 0.5) * 2 * dispersion
      return { c, valor: vig * desvio * jitter }
    })

    const vigFamilia = cuentas.reduce((s, c) => s + (vigentePorCuenta.get(c.codigo2) ?? 0), 0)
    const objetivo = vigFamilia * desvio
    const sumaCruda = crudos.reduce((s, x) => s + x.valor, 0)
    const factor = sumaCruda > 0 ? objetivo / sumaCruda : 1

    for (const { c, valor } of crudos) {
      proyectadoPorCuenta.set(c.codigo2, r2(valor * factor))
    }
  }

  // ── Gasto real ERP: fracción del proyectado según el avance de la obra ──
  const agregadoPorCcosto: CargaERP['agregadoPorCcosto'] = {}
  const agregadoPorCcostoPorMes: CargaERP['agregadoPorCcostoPorMes'] = {}
  const transaccionesPorCcosto: Record<number, TransaccionERP[]> = {}
  let totalUF = 0
  let numTx = 0

  for (const { c } of redistribuido) {
    const proy = proyectadoPorCuenta.get(c.codigo2) ?? 0
    const factorAvance = avance * (0.75 + hash01('r' + c.codigo2 + cfg.id) * 0.5)
    const real = r2(proy * Math.min(factorAvance, 1.08))
    if (real <= 0) continue

    const cc = Number(c.codigo2)
    const tx = 3 + Math.floor(hash01('n' + c.codigo2) * 12)
    agregadoPorCcosto[cc] = { monto_uf: real, num_tx: tx }
    totalUF += real
    numTx += tx

    // Reparto por mes, para que el filtro de corte tenga con qué trabajar
    const porMes: Record<string, { monto_uf: number; num_tx: number }> = {}
    const pesos = cfg.meses.map((m, i) => 0.5 + hash01(c.codigo2 + m + i))
    const sumaPesos = pesos.reduce((s, p) => s + p, 0)
    cfg.meses.forEach((mes, i) => {
      porMes[mes] = {
        monto_uf: r2((real * pesos[i]) / sumaPesos),
        num_tx: Math.max(1, Math.round((tx * pesos[i]) / sumaPesos)),
      }
    })
    agregadoPorCcostoPorMes[cc] = porMes

    // Transacciones de detalle para las cuentas más pesadas (modal "detalle")
    if (real > 400) {
      const proveedores = ['CONSTRUMART SA', 'SODIMAC SA', 'MELON HORMIGONES', 'CINTAC SA', 'PROVEEDOR REGIONAL LTDA']
      transaccionesPorCcosto[cc] = cfg.meses.slice(0, 4).map((mes, i) => {
        const [ano, mm] = mes.split('-')
        const monto = r2((real / 4) * (0.7 + hash01(c.codigo2 + 'tx' + i) * 0.6))
        return {
          unidadNegocioDescripcion: cfg.nombre,
          num_doc: `F-${100000 + Math.floor(hash01(c.codigo2 + i) * 899999)}`,
          mes: Number(mm),
          ano: Number(ano),
          fecha_contable: `15/${mm}/${ano}`,
          valor_uf: 39150,
          rut_proveedor: `76.${100 + i}.${200 + i}-K`,
          razon_social: proveedores[i % proveedores.length],
          monto_uf: monto,
          concepto1_codigo: cc,
          glosa_detalle: `${c.nombre} — ${mes}`,
          mesKey: mes,
        }
      })
    }
  }

  const erp: CargaERP = {
    fechaCarga: cfg.fechaCarga,
    nombreArchivo: `export_erp_${cfg.id}.xlsx`,
    unidadNegocioCodigo: cfg.id === 'demo-obra-1' ? 101 : 102,
    unidadNegocioDescripcion: cfg.nombre,
    totalUF: r2(totalUF),
    numTransacciones: numTx,
    rangoFechas: { desde: `${cfg.meses[0]}-01`, hasta: `${cfg.meses.at(-1)}-28` },
    agregadoPorCcosto,
    agregadoPorCcostoPorMes,
    mesesDisponibles: cfg.meses,
    transaccionesPorCcosto,
  }

  return {
    id: cfg.id,
    nombre: cfg.nombre,
    unidadNegocioCodigo: erp.unidadNegocioCodigo,
    cutoffMesReal: cfg.cutoffMesReal,
    tipoObra: cfg.tipoObra,
    m2: cfg.m2,
    plazoMeses: cfg.plazoMeses,
    montoContratoUF: cfg.montoContratoUF,
    fechaCreacion: '2026-01-05T09:00:00.000Z',
    fechaActualizacion: cfg.fechaCarga,
    slots: {
      presupuesto_original: archivo('itemizado_original.xlsx', cfg.fechaCarga, original.map(({ c, total }) => partidaRaw(c, total))),
      presupuesto_redistribuido: archivo('itemizado_redistribuido.xlsx', cfg.fechaCarga, redistribuido.map(({ c, total }) => partidaRaw(c, total))),
      ppto_horas_extra: archivo('obras_extra.xlsx', cfg.fechaCarga, horasExtra.map(({ c, total }) => partidaRaw(c, total))),
      proyectado: archivo('proyeccion_cierre.xlsx', cfg.fechaCarga, UNIVERSO.map(c => partidaRaw(c, proyectadoPorCuenta.get(c.codigo2) ?? 0))),
      gasto_real_erp: erp,
    },
  }
}

const MESES_2026 = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']

/** Las dos obras de la demo. Distinto tamaño y distinto avance, a propósito. */
export function crearProyectosDemo(): Proyecto[] {
  return [
    construirObra({
      id: 'demo-obra-1',
      nombre: 'Edificio Vista Poniente',
      tipoObra: 'Edificio Habitacional',
      m2: 9576.96,
      plazoMeses: 22,
      montoContratoUF: 310000,
      escala: 1.0,
      avance: 0.12,
      cutoffMesReal: '2026-06',
      meses: MESES_2026.slice(0, 6),
      fechaCarga: '2026-07-08T11:30:00.000Z',
    }),
    construirObra({
      id: 'demo-obra-2',
      nombre: 'Condominio Los Almendros',
      tipoObra: 'Casas Habitacionales',
      m2: 5800,
      plazoMeses: 18,
      montoContratoUF: 212000,
      escala: 0.68,
      avance: 0.24,
      cutoffMesReal: '2026-08',
      meses: MESES_2026,
      fechaCarga: '2026-08-22T16:45:00.000Z',
    }),
  ]
}

export const USUARIO_DEMO = {
  id: 'demo-user',
  email: 'demo@icemm',
  nombre: 'Demo',
  rol: 'admin' as const,
}
