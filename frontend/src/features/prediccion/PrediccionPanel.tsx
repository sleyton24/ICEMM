import { useMemo, useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { AlertTriangle, Info, TrendingUp } from 'lucide-react'
import { useProjectsStore } from '../projects/ProjectsStore'
import { usePlanCuentasStore } from '../plan-cuentas/PlanCuentasStore'
import { useDashboardData } from '../../data/dataAdapter'
import { parametrosObra } from './datos/parametrosObra'
import { proyectar } from './modelo/proyectar'
import { repronosticar } from './modelo/repronostico'
import type { Escenario } from './modelo/tipos'
import { FAMILIAS_MODELO, familiaPorClave } from './modelo/familias'
import FichaObraForm from './FichaObraForm'

const uf0 = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`

const ESCENARIOS: { id: Escenario; label: string; detalle: string }[] = [
  { id: 'plazo', label: 'Calendario', detalle: 'Atraso o adelanto de calendario — el costo total no cambia' },
  { id: 'mixto', label: 'Mixto', detalle: 'Mitad calendario, mitad costo' },
  { id: 'desem', label: 'Desempeño', detalle: 'El ritmo observado se mantiene hasta el cierre' },
]

export default function PrediccionPanel() {
  const proyecto = useProjectsStore(s => s.projects.find(p => p.id === s.activeProjectId) ?? null)
  const plan = usePlanCuentasStore(s => s.plan)
  const data = useDashboardData()

  const [lead, setLead] = useState(3)
  const [skew, setSkew] = useState(0)
  const [escenario, setEscenario] = useState<Escenario>('plazo')
  const [usarEjecObra, setUsarEjecObra] = useState(false)
  // null = la obra completa; si no, la clave de la familia del modelo.
  const [familia, setFamilia] = useState<string | null>(null)
  const [editandoFicha, setEditandoFicha] = useState(false)

  const totalProyectadoObra = useMemo(
    () => data.partidas.reduce((s, p) => s + p.proyeccion, 0),
    [data.partidas],
  )

  /** Lo que la obra proyecta para la familia elegida, para contrastar. */
  const proyectadoObraSeleccion = useMemo(() => {
    if (!familia) return totalProyectadoObra
    const codigo = familiaPorClave(familia)?.codigo
    if (!codigo) return 0
    return data.partidas
      .filter(p => Math.floor(Number(p.codigo2) / 100) * 100 === codigo)
      .reduce((s, p) => s + p.proyeccion, 0)
  }, [familia, data.partidas, totalProyectadoObra])

  const params = useMemo(
    () => proyecto ? parametrosObra(proyecto, plan, totalProyectadoObra) : null,
    [proyecto, plan, totalProyectadoObra],
  )

  const resultado = useMemo(() => {
    if (!params?.obra) return null
    try {
      const ejec = usarEjecObra && params.ejecSegunObra ? params.ejecSegunObra : undefined
      const p = proyectar(params.obra, { lead, skew, ejec, familia: familia ?? undefined })
      const real = familia ? (params.serieRealPorFamilia[familia] ?? []) : params.serieReal
      if (real.length === 0) return { proy: p, repro: null, error: null }
      const r = repronosticar(p, real, { mesCorte: real.length, escenario })
      return { proy: p, repro: r, error: null }
    } catch (e) {
      return { proy: null, repro: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [params, lead, skew, escenario, usarEjecObra, familia])

  if (!proyecto) {
    return <p className="text-center text-sm text-gray-400 py-12">Seleccioná una obra para proyectar.</p>
  }

  if (!params?.obra || editandoFicha) {
    return (
      <div className="space-y-5">
        {params && params.faltantes.length > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Falta completar la ficha para poder proyectar</p>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {params.faltantes.map(f => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-gray-200 p-5">
          <FichaObraForm proyecto={proyecto} onListo={() => setEditandoFicha(false)} />
        </div>
      </div>
    )
  }

  if (resultado?.error) {
    return (
      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">No se pudo construir la proyección</p>
          <p className="text-xs mt-0.5">{resultado.error}</p>
        </div>
      </div>
    )
  }

  const proy = resultado!.proy!
  const repro = resultado!.repro
  const serieReal = familia ? (params.serieRealPorFamilia[familia] ?? []) : params.serieReal
  const advertencias = [...(repro?.advertencias ?? proy.advertencias), ...params.advertencias]

  const chartData = proy.meses.map((m, i) => ({
    ym: m.ym,
    etiqueta: m.ym.slice(2).replace('-', '/'),
    proyeccion: m.acum,
    // La banda se dibuja como base + alto, que es como Recharts apila áreas.
    bandaBase: m.p10 * proy.total,
    bandaAlto: Math.max(0, (m.p90 - m.p10) * proy.total),
    real: i < serieReal.length ? serieReal[i].acum : null,
    reancla: repro ? repro.reproyeccion.serie[i].acum : null,
  }))

  const cierreModelo = repro ? repro.reproyeccion.totalNuevo : proy.total
  const proyObra = proyectadoObraSeleccion
  const brechaObra = proyObra > 0 ? cierreModelo - proyObra : null
  const famActual = familia ? familiaPorClave(familia) : null
  const ambito = famActual ? famActual.etiqueta.toLowerCase() : 'la obra completa'
  // En modo familia el contrato no es el divisor correcto: lo que corresponde
  // es la parte del contrato que le toca a esa familia según el mix histórico.
  const baseContrato = familia ? proy.obra.contrato * proy.mix[familia] : proy.obra.contrato

  return (
    <div className="space-y-5">
      {/* ── Advertencias ─────────────────────────────────────────────── */}
      {advertencias.length > 0 && (
        <div className="space-y-2">
          {advertencias.map((a, i) => (
            <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Selector de ámbito: obra completa o una familia ──────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mr-1">Proyectar</span>
        <button
          onClick={() => setFamilia(null)}
          className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
            familia === null
              ? 'bg-cabecera text-white shadow-sm'
              : 'bg-panel text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-tinta'}`}>
          Toda la obra
        </button>
        {FAMILIAS_MODELO.map(f => {
          const activa = familia === f.clave
          return (
            <button
              key={f.clave}
              onClick={() => setFamilia(f.clave)}
              title={`Cuentas ${f.codigo}–${f.codigo + 99}`}
              className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
                activa
                  ? 'bg-cabecera text-white shadow-sm'
                  : 'bg-panel text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-tinta'}`}>
              <span className={`tabular-nums ${activa ? 'text-white/50' : 'text-gray-300'}`}>{f.codigo}</span>
              {f.etiqueta}
            </button>
          )
        })}
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={famActual ? `Cierre ${famActual.etiqueta} — modelo` : 'Cierre proyectado — modelo'}
             valor={`UF ${uf0(cierreModelo)}`}
             sub={famActual
               ? `${pct1(proy.mix[familia!])} del contrato × ${proy.ejec.toFixed(3)}`
               : `contrato × ${proy.ejec.toFixed(3)}`}
             acento="#233032" />
        <Kpi label={famActual ? `Cierre ${famActual.etiqueta} — obra` : 'Cierre proyectado — obra'}
             valor={proyObra > 0 ? `UF ${uf0(proyObra)}` : '—'}
             sub={proyObra > 0 ? `× ${(proyObra / baseContrato).toFixed(3)} sobre esa base` : 'sin slot proyectado'}
             acento="#809494" />
        <Kpi label="Brecha entre ambos" valor={brechaObra !== null ? `UF ${uf0(Math.abs(brechaObra))}` : '—'}
             sub={brechaObra !== null ? (brechaObra < 0 ? 'el modelo proyecta menos' : 'el modelo proyecta más') : ''}
             acento={brechaObra !== null && Math.abs(brechaObra) > proy.sdE * baseContrato * 1.2816 ? '#E00544' : '#253136'} />
        <Kpi label="Duración estimada" valor={`${proy.NT} meses`}
             sub={`${proy.N} efectivos + ${proy.opciones.lead} de arranque`} acento="#101820" />
      </div>

      {/* ── Gráfico ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-cabecera">
          <h2 className="text-sm font-semibold text-white font-slab">
            CURVA DE COSTO ACUMULADO{famActual ? ` — ${famActual.etiqueta.toUpperCase()}` : ''}
          </h2>
          <p className="text-[11px] text-white/50">
            {proy.obra.nombre} · {serieReal.length} meses observados de {proy.NT} · proyectando {ambito}
            {famActual && ` (cuentas ${famActual.codigo}–${famActual.codigo + 99})`}
          </p>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => uf0(v as number)} width={70} />
              <Tooltip
                formatter={(v, n) => [typeof v === 'number' ? `UF ${uf2(v)}` : String(v ?? '—'), String(n)]}
                labelFormatter={l => `Mes ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area dataKey="bandaBase" stackId="banda" stroke="none" fill="transparent" legendType="none" name=" " />
              <Area dataKey="bandaAlto" stackId="banda" stroke="none" fill="#809494" fillOpacity={0.18}
                    name="Dispersión histórica de forma" />
              <Line dataKey="proyeccion" stroke="#233032" strokeWidth={2} dot={false} name="Proyección del modelo" />
              {repro && (
                <Line dataKey="reancla" stroke="#E00544" strokeWidth={2} strokeDasharray="5 3" dot={false}
                      name="Re-anclada al real" />
              )}
              <Line dataKey="real" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 2 }} name="Real observado"
                    connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>

          {famActual && (
            <div className="flex items-start gap-2 mt-2 text-[11px] text-gray-500 bg-surface border border-gray-200 rounded-lg px-3 py-2">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-teal-muted" />
              <span>
                Esta es la curva propia de {famActual.etiqueta.toLowerCase()}, no la de la obra
                reescalada: cada familia tiene su calendario. El modelo llega hasta este nivel —
                bajar a la cuenta individual ({famActual.codigo + 1}, {famActual.codigo + 2}…)
                necesita el costo por cuenta de las siete obras históricas que faltan en el
                consolidado.
              </span>
            </div>
          )}

          <div className="flex items-start gap-2 mt-2 text-[11px] text-gray-500 bg-surface border border-gray-200 rounded-lg px-3 py-2">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-teal-muted" />
            <span>
              La banda es <strong>dispersión histórica de la forma</strong> de la curva entre las 8 obras base,
              no una probabilidad. Con 8 observaciones el ±1,28σ es una convención de lectura y no garantiza
              cobertura. Además mide solo la forma: <strong>no incluye la incertidumbre del nivel</strong>, que es
              justamente donde está la brecha con la proyección de la obra.
            </span>
          </div>
        </div>
      </div>

      {/* ── Controles ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-tinta font-slab">Parámetros</h3>
          <button onClick={() => setEditandoFicha(true)}
                  className="text-[11px] text-teal-muted hover:text-tinta font-medium transition-colors">
            Editar ficha de obra
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              Meses de arranque · <span className="tabular-nums text-tinta font-bold">{lead}</span>
            </span>
            <input type="range" min={0} max={18} value={lead} onChange={e => setLead(+e.target.value)}
                   className="w-full mt-1 accent-tinta" />
            <span className="text-[10px] text-gray-400">
              Meses previos al cruce del 1% de avance. Sin esto el modelo se desvía hasta 39%.
            </span>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              Sesgo de curva · <span className="tabular-nums text-tinta font-bold">{skew > 0 ? '+' : ''}{skew}</span>
            </span>
            <input type="range" min={-30} max={30} value={skew} onChange={e => setSkew(+e.target.value)}
                   className="w-full mt-1 accent-tinta" />
            <span className="text-[10px] text-gray-400">
              Negativo adelanta el gasto; positivo lo atrasa.
            </span>
          </label>
        </div>

        <div>
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1.5">
            Escenario de re-pronóstico
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ESCENARIOS.map(e => (
              <button key={e.id} onClick={() => setEscenario(e.id)} title={e.detalle}
                className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
                  escenario === e.id
                    ? 'bg-cabecera text-white shadow-sm'
                    : 'bg-panel text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-tinta'}`}>
                {e.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{ESCENARIOS.find(e => e.id === escenario)!.detalle}</p>
        </div>

        {params.ejecSegunObra && (
          <label className="flex items-start gap-2 text-xs text-gray-600 bg-surface border border-gray-200 rounded-lg px-3 py-2">
            <input type="checkbox" checked={usarEjecObra} onChange={e => setUsarEjecObra(e.target.checked)}
                   className="mt-0.5 accent-tinta" />
            <span>
              Usar el factor de ejecución que proyecta la obra
              (<strong className="tabular-nums">{proy.obra.contrato ? pct1(params.ejecSegunObra) : '—'}</strong>)
              en vez del ponderado histórico (<strong className="tabular-nums">{pct1(proy.ejecAuto)}</strong>).
              <span className="block text-[10px] text-gray-400 mt-0.5">
                La diferencia entre ambos es la discusión abierta con EMM sobre el nivel de cierre. El modelo no la resuelve.
              </span>
            </span>
          </label>
        )}
      </div>

      {/* ── Comparables ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-cabecera flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-white/60" />
          <div>
            <h2 className="text-sm font-semibold text-white font-slab">DE QUÉ OBRAS SALE ESTA PROYECCIÓN</h2>
            <p className="text-[11px] text-white/50">
              Masa de similitud {proy.masaSimilitud.toFixed(2)} — cuánto se parece esta obra a la base histórica
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Obra', 'Peso', 'Tipo', 'm²', 'Contrato (UF)', 'Año'].map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-panel divide-y divide-gray-50">
              {proy.comparables.map((c, i) => (
                <tr key={c.nombre} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                  <td className="px-3 py-2 font-medium text-gray-700">{c.nombre}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 bg-gray-100 rounded-full flex-1 min-w-16 overflow-hidden">
                        <div className="h-full bg-teal-muted rounded-full" style={{ width: `${c.peso * 100}%` }} />
                      </div>
                      <span className="tabular-nums text-xs text-tinta font-semibold w-11 text-right">{pct1(c.peso)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">{c.tipo}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-gray-600">{uf0(c.m2)}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-gray-600">{uf0(c.contrato)}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-gray-500">{c.anio_fin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, valor, sub, acento }: { label: string; valor: string; sub: string; acento: string }) {
  return (
    <div className="bg-panel rounded-xl border border-gray-100 shadow-sm p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ backgroundColor: acento }} />
      <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1.5 pl-2">{label}</p>
      <p className="text-base font-bold text-tinta leading-tight pl-2 tabular-nums">{valor}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1 pl-2">{sub}</p>}
    </div>
  )
}
