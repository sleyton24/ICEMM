import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { cuentaBase, CRITERIO_CUENTAS } from './modelo/curvasCuenta'
import { cuentasVisibles, familiaTieneCurva } from './modelo/catalogoCuentas'
import { curvasBase } from './modelo/curvasBase'
import { guardarObrasReferencia, leerObrasReferencia, olvidarObrasReferencia } from './obrasReferencia'
import { useEleccionesStore } from '../informes/EleccionesStore'
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
  // Un nivel más abajo: código de cuenta dentro de la familia elegida.
  const [cuenta, setCuenta] = useState<string | null>(null)
  const [editandoFicha, setEditandoFicha] = useState(false)
  // null = todas las obras, que es la mezcla por similitud de hoy.
  const [obrasOverride, setObrasOverride] = useState<string[] | null>(null)
  const [avisoInforme, setAvisoInforme] = useState<string | null>(null)
  const [errorInforme, setErrorInforme] = useState<string | null>(null)
  const [pasando, setPasando] = useState(false)
  const sugerir = useEleccionesStore(s => s.sugerir)

  const projectId = proyecto?.id ?? null
  const nombresObras = useMemo(() => curvasBase.obras.map(o => o.nombre), [])

  useEffect(() => {
    if (!projectId || !cuenta) {
      setObrasOverride(null)
      return
    }
    setObrasOverride(leerObrasReferencia(projectId, cuenta))
    setAvisoInforme(null)
    setErrorInforme(null)
  }, [projectId, cuenta])

  /** Cambiar de familia invalida la cuenta: son cuentas de otra familia. */
  const elegirFamilia = (f: string | null) => { setFamilia(f); setCuenta(null) }

  /** Cuentas de la familia, incluidas las que no tienen curva propia. */
  const cuentasDisponibles = useMemo(
    () => (familia ? cuentasVisibles(familia, plan) : []),
    [familia, plan],
  )

  const seleccionObras = obrasOverride ?? nombresObras
  const metaCuenta = cuenta ? cuentasDisponibles.find(c => c.codigo === cuenta) ?? null : null

  /** Descripción de una cuenta según el plan cargado. */
  const nombreCuenta = (codigo: string) =>
    plan.cuentas.find(c => c.codigo === Number(codigo))?.descripcion ?? `Cuenta ${codigo}`

  const cuentaActual = cuenta ? cuentaBase(cuenta) : null

  const totalProyectadoObra = useMemo(
    () => data.partidas.reduce((s, p) => s + p.proyeccion, 0),
    [data.partidas],
  )

  /** Lo que la obra proyecta para el ámbito elegido, para contrastar. */
  const proyectadoObraSeleccion = useMemo(() => {
    if (cuenta) {
      return data.partidas
        .filter(p => String(p.codigo2) === cuenta)
        .reduce((s, p) => s + p.proyeccion, 0)
    }
    if (!familia) return totalProyectadoObra
    const codigo = familiaPorClave(familia)?.codigo
    if (!codigo) return 0
    return data.partidas
      .filter(p => Math.floor(Number(p.codigo2) / 100) * 100 === codigo)
      .reduce((s, p) => s + p.proyeccion, 0)
  }, [familia, cuenta, data.partidas, totalProyectadoObra])

  const params = useMemo(
    () => proyecto ? parametrosObra(proyecto, plan, totalProyectadoObra) : null,
    [proyecto, plan, totalProyectadoObra],
  )

  const resultado = useMemo(() => {
    if (!params?.obra) return null
    const sinCurvaPropia = Boolean(metaCuenta && !metaCuenta.tieneCurva)
    if (familia && !familiaTieneCurva(familia) && !metaCuenta?.tieneCurva) {
      return {
        proy: null, repro: null, error: null,
        motivo: metaCuenta ? 'cuenta-sin-historia' as const : 'familia-sin-historia' as const,
      }
    }
    if (cuenta && seleccionObras.length === 0) {
      return { proy: null, repro: null, error: null, motivo: 'sin-obras' as const }
    }
    try {
      const ejec = usarEjecObra && params.ejecSegunObra ? params.ejecSegunObra : undefined
      const usarCuenta = Boolean(metaCuenta?.tieneCurva)
      const p = proyectar(params.obra, {
        lead, skew, ejec,
        familia: familia ?? undefined,
        cuenta: usarCuenta ? cuenta ?? undefined : undefined,
        obrasActivas: cuenta ? seleccionObras : undefined,
      })
      if (sinCurvaPropia && metaCuenta?.respaldoFamilia && familia) {
        const etiqueta = familiaPorClave(familia)?.etiqueta ?? familia
        p.advertencias.unshift(
          `La cuenta ${metaCuenta.codigo} no tiene historia suficiente para estimar su curva ` +
          `(hace falta aparecer en ${CRITERIO_CUENTAS.minObras} o más obras, con ` +
          `${CRITERIO_CUENTAS.minMesesActivos} o más meses de gasto). Se muestra la curva de ` +
          `${etiqueta.toLowerCase()} como respaldo: el monto es el de la familia, no el de esta cuenta.`,
        )
      }
      const real = usarCuenta && cuenta
        ? (params.serieRealPorCuenta[cuenta] ?? [])
        : familia
          ? (params.serieRealPorFamilia[familia] ?? [])
          : params.serieReal
      if (real.length === 0) return { proy: p, repro: null, error: null, motivo: null }
      const r = repronosticar(p, real, { mesCorte: real.length, escenario })
      return { proy: p, repro: r, error: null, motivo: null }
    } catch (e) {
      return {
        proy: null, repro: null,
        error: e instanceof Error ? e.message : String(e),
        motivo: 'error' as const,
      }
    }
  }, [params, lead, skew, escenario, usarEjecObra, familia, cuenta, metaCuenta, seleccionObras])

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

  const proy = resultado?.proy ?? null
  const repro = resultado?.repro ?? null
  const motivo = resultado?.motivo ?? null
  const usarCuentaPropia = Boolean(metaCuenta?.tieneCurva)
  const serieReal = usarCuentaPropia && cuenta
    ? (params.serieRealPorCuenta[cuenta] ?? [])
    : familia
      ? (params.serieRealPorFamilia[familia] ?? [])
      : params.serieReal
  const advertencias = [
    ...(proy ? (repro?.advertencias ?? proy.advertencias) : []),
    ...params.advertencias,
  ]

  const chartData = proy
    ? proy.meses.map((m, i) => ({
        ym: m.ym,
        etiqueta: m.ym.slice(2).replace('-', '/'),
        proyeccion: m.acum,
        // La banda se dibuja como base + alto, que es como Recharts apila áreas.
        bandaBase: m.p10 * proy.total,
        bandaAlto: Math.max(0, (m.p90 - m.p10) * proy.total),
        real: i < serieReal.length ? serieReal[i].acum : null,
        reancla: repro ? repro.reproyeccion.serie[i].acum : null,
      }))
    : []

  const cierreTipica = proy?.total ?? 0
  const cierreReanclada = repro ? repro.reproyeccion.totalNuevo : null
  const cierreModelo = cierreReanclada ?? cierreTipica
  const proyObra = proyectadoObraSeleccion
  const brechaObra = proy && proyObra > 0 ? cierreModelo - proyObra : null
  const famActual = familia ? familiaPorClave(familia) : null
  const ambito = cuenta
    ? `la cuenta ${cuenta} — ${nombreCuenta(cuenta).toLowerCase()}`
    : famActual ? famActual.etiqueta.toLowerCase() : 'la obra completa'
  const rotulo = cuenta
    ? `Cuenta ${cuenta}${metaCuenta && !metaCuenta.tieneCurva && metaCuenta.respaldoFamilia ? ' · respaldo de familia' : ''}`
    : famActual ? famActual.etiqueta : null
  // En modo familia o cuenta el contrato no es el divisor correcto: lo que
  // corresponde es la parte que le toca según el mix histórico.
  const claveParcial = usarCuentaPropia ? cuenta : familia
  const baseContrato = proy
    ? (claveParcial ? proy.obra.contrato * (proy.mix[claveParcial] ?? 0) : proy.obra.contrato)
    : 0

  const toggleObra = (nombre: string) => {
    if (!projectId || !cuenta) return
    const base = obrasOverride ?? nombresObras
    const next = base.includes(nombre) ? base.filter(n => n !== nombre) : [...base, nombre]
    setObrasOverride(next)
    guardarObrasReferencia(projectId, cuenta, next)
  }

  const restaurarSimilitud = () => {
    if (!projectId || !cuenta) return
    setObrasOverride(null)
    olvidarObrasReferencia(projectId, cuenta)
  }

  const llevarAlInforme = async () => {
    if (!projectId || !cuenta || !proy || !usarCuentaPropia) return
    setPasando(true)
    setErrorInforme(null)
    try {
      await sugerir(projectId, cuenta, {
        cierreTipica,
        cierreReanclada,
        obrasReferencia: seleccionObras,
        serie: proy.meses.map((m, i) => ({
          ym: m.ym,
          acumTipica: m.acum,
          acumReanclada: repro ? repro.reproyeccion.serie[i]?.acum ?? null : null,
        })),
      })
      setAvisoInforme(
        `La curva de la cuenta ${cuenta} quedó en el informe de costos. Ahí se elige entre Presto, la curva típica y la re-anclada al real.`,
      )
    } catch (e) {
      setErrorInforme(e instanceof Error ? e.message : 'No se pudo llevar la curva al informe')
    } finally {
      setPasando(false)
    }
  }

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
          onClick={() => elegirFamilia(null)}
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
              onClick={() => elegirFamilia(f.clave)}
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

      {/* ── Selector de cuenta, dentro de la familia abierta ─────────── */}
      {familia && (
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mr-1">Cuenta</span>
          <select
            value={cuenta ?? ''}
            onChange={e => setCuenta(e.target.value || null)}
            className="text-[11px] px-3 py-1.5 rounded-full border border-gray-200 bg-panel text-tinta focus:outline-none focus:ring-2 focus:ring-teal-muted/30 max-w-[30rem]"
          >
            <option value="">
              {(() => {
                const con = cuentasDisponibles.filter(c => c.tieneCurva).length
                const sin = cuentasDisponibles.length - con
                return sin === 0
                  ? `Toda la familia (${con} cuentas con curva)`
                  : `Toda la familia (${con} con curva, ${sin} sin historia)`
              })()}
            </option>
            {cuentasDisponibles.map(c => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} · {nombreCuenta(c.codigo)}
                {c.tieneCurva
                  ? ` — ${pct1(c.shareMedio)} del costo de obra`
                  : ' — sin historia suficiente'}
              </option>
            ))}
          </select>
          {cuentaActual && (
            <span className="text-[10px] text-gray-400">
              {cuentaActual.nObras} de 8 obras
              {cuentaActual.caidaMax > 0.01 && ' · la curva histórica retrocede'}
            </span>
          )}
        </div>
      )}

      {motivo === 'familia-sin-historia' && famActual && (
        <Aviso>
          La familia {famActual.codigo} ({famActual.etiqueta}) no tiene curva histórica en las 8 obras
          de referencia: el consolidado con el que se armó el modelo no trae ese bloque, y las cinco
          familias de costo de construcción ya cierran el total de la obra. Elegí una cuenta: se muestra
          igual, con este aviso, en vez de ocultarla.
        </Aviso>
      )}
      {motivo === 'cuenta-sin-historia' && cuenta && (
        <Aviso>
          La cuenta {cuenta} — {nombreCuenta(cuenta)} no tiene historia suficiente para estimar su curva
          (hace falta aparecer en {CRITERIO_CUENTAS.minObras} o más obras, con {CRITERIO_CUENTAS.minMesesActivos} o
          más meses de gasto) y la familia {famActual?.codigo} tampoco tiene curva de respaldo. No se inventa
          una proyección. La cuenta queda visible igual.
        </Aviso>
      )}
      {motivo === 'sin-obras' && (
        <Aviso>
          No hay obras de referencia seleccionadas. Marcá al menos una para estimar la curva.
        </Aviso>
      )}
      {motivo === 'error' && resultado?.error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No se pudo construir la proyección</p>
            <p className="text-xs mt-0.5">{resultado.error}</p>
          </div>
        </div>
      )}
      {avisoInforme && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-xs text-emerald-700">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>{avisoInforme}</span>
        </div>
      )}
      {errorInforme && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>{errorInforme}</span>
        </div>
      )}

      {cuenta && (
        <SelectorObras
          seleccion={seleccionObras}
          pesosPorNombre={new Map((proy?.comparables ?? []).map(c => [c.nombre, c.peso]))}
          tieneCuenta={cuentaActual
            ? curvasBase.obras.map((_, i) => cuentaActual.curvas[i] !== null)
            : null}
          personalizada={obrasOverride !== null}
          onToggle={toggleObra}
          onRestaurar={restaurarSimilitud}
          masa={proy?.masaSimilitud ?? null}
        />
      )}

      {proy && usarCuentaPropia && cuenta && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-panel px-4 py-3">
          <button
            type="button"
            onClick={() => { void llevarAlInforme() }}
            disabled={pasando}
            className="text-[11px] px-3 py-1.5 rounded-full font-medium bg-cabecera text-white shadow-sm hover:opacity-90 disabled:opacity-40"
          >
            {pasando ? 'Llevando…' : 'Llevar curva al informe'}
          </button>
          <p className="text-[11px] text-gray-500">
            Cierre típico <strong className="text-tinta tabular-nums">UF {uf0(cierreTipica)}</strong>
            {cierreReanclada != null && (
              <> · re-anclada al real <strong className="text-tinta tabular-nums">UF {uf0(cierreReanclada)}</strong></>
            )}
            . En Costos se elige cuál usar, o se deja el proyectado Presto.
          </p>
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      {proy && (<>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={rotulo ? `Cierre ${rotulo} — modelo` : 'Cierre proyectado — modelo'}
             valor={`UF ${uf0(cierreModelo)}`}
             sub={claveParcial
               ? `${pct1(proy.mix[claveParcial])} del contrato × ${proy.ejec.toFixed(3)}`
               : `contrato × ${proy.ejec.toFixed(3)}`}
             acento="#233032" />
        <Kpi label={rotulo ? `Cierre ${rotulo} — obra` : 'Cierre proyectado — obra'}
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
            CURVA DE COSTO ACUMULADO{rotulo ? ` — ${rotulo.toUpperCase()}` : ''}
          </h2>
          <p className="text-[11px] text-white/50">
            {proy.obra.nombre} · {serieReal.length} meses observados de {proy.NT} · proyectando {ambito}
            {famActual && !cuentaActual && ` (cuentas ${famActual.codigo}–${famActual.codigo + 99})`}
            {cuentaActual && ` · ${cuentaActual.nObras} de 8 obras históricas la tienen`}
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

          {famActual && !cuenta && (
            <div className="flex items-start gap-2 mt-2 text-[11px] text-gray-500 bg-surface border border-gray-200 rounded-lg px-3 py-2">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-teal-muted" />
              <span>
                Esta es la curva propia de {famActual.etiqueta.toLowerCase()}, no la de la obra
                reescalada: cada familia tiene su calendario. Con el selector de arriba se baja a
                la cuenta individual, que tiene el suyo.
              </span>
            </div>
          )}

          {cuentaActual && (
            <div className="flex items-start gap-2 mt-2 text-[11px] text-gray-500 bg-surface border border-gray-200 rounded-lg px-3 py-2">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-teal-muted" />
              <span>
                Curva propia de la cuenta {cuentaActual.codigo}, construida con las{' '}
                {cuentaActual.nObras} obras históricas que la tienen —de las 8—, con la misma
                receta que las curvas de familia. Las que no alcanzan{' '}
                {CRITERIO_CUENTAS.minMesesActivos} meses de gasto o {CRITERIO_CUENTAS.minObras} obras
                se listan igual: con la curva de la familia como respaldo, o con un aviso si la
                familia tampoco tiene historia. A este nivel la curva sirve para leer{' '}
                <strong>cuándo</strong> se gasta; el monto lo sigue mandando la proyección de la
                familia.
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
      </>)}

      {/* ── Comparables, cuando no hay selector por cuenta ───────────── */}
      {proy && !cuenta && (
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
      )}
    </div>
  )
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}

function SelectorObras({ seleccion, pesosPorNombre, tieneCuenta, personalizada, onToggle, onRestaurar, masa }: {
  seleccion: string[]
  pesosPorNombre: Map<string, number>
  /** null si la cuenta no tiene curva propia: todas las obras pueden entrar al respaldo. */
  tieneCuenta: boolean[] | null
  personalizada: boolean
  onToggle: (nombre: string) => void
  onRestaurar: () => void
  masa: number | null
}) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-cabecera flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-white/60" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-white font-slab">OBRAS DE REFERENCIA</h2>
          <p className="text-[11px] text-white/50">
            {masa != null
              ? `Masa de similitud ${masa.toFixed(2)} — marcá las obras históricas que entran a esta cuenta`
              : 'Marcá las obras históricas que entran a esta cuenta'}
          </p>
        </div>
        {personalizada && (
          <button
            type="button"
            onClick={onRestaurar}
            className="text-[11px] text-white/70 hover:text-white underline"
          >
            Volver a la similitud
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['', 'Obra', 'Peso', 'Tipo', 'm²', 'Contrato (UF)', 'Año'].map((h, i) => (
                <th key={h || 'marca'} className={`px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider ${i > 2 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-panel divide-y divide-gray-50">
            {curvasBase.obras.map((o, i) => {
              const marcada = seleccion.includes(o.nombre)
              const sinCuenta = tieneCuenta ? !tieneCuenta[i] : false
              const peso = marcada ? (pesosPorNombre.get(o.nombre) ?? 0) : 0
              return (
                <tr key={o.nombre} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => onToggle(o.nombre)}
                      aria-label={`Usar ${o.nombre}`}
                      className="accent-tinta"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-700">
                    {o.nombre}
                    {sinCuenta && <span className="ml-2 text-[10px] font-normal text-gray-400">sin esta cuenta</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 bg-gray-100 rounded-full flex-1 min-w-16 overflow-hidden">
                        <div className="h-full bg-teal-muted rounded-full" style={{ width: `${peso * 100}%` }} />
                      </div>
                      <span className="tabular-nums text-xs text-tinta font-semibold w-11 text-right">
                        {marcada ? pct1(peso) : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">{o.tipo}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-gray-600">{uf0(o.m2)}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-gray-600">{uf0(o.contrato)}</td>
                  <td className="px-3 py-2 tabular-nums text-right text-gray-500">{o.anio_fin}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
