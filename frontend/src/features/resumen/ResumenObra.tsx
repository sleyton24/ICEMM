import { useMemo } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { TrendingDown, ArrowRight } from 'lucide-react'
import type { Partida } from '../../data/dataAdapter'
import { estadoAgregado } from '../../data/estado'
import { usePaleta } from '../tema/paleta'
import { useProjectsStore } from '../projects/ProjectsStore'
import { usePlanCuentasStore } from '../plan-cuentas/PlanCuentasStore'
import { parametrosObra } from '../prediccion/datos/parametrosObra'
import { proyectar } from '../prediccion/modelo/proyectar'
import { repronosticar } from '../prediccion/modelo/repronostico'

const uf0 = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct1 = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`

/**
 * Mayúscula solo en la inicial. `capitalize` de CSS la pone en cada palabra y
 * deja cosas como "Mano De Obra"; las familias vienen en mayúsculas del plan.
 */
const enFrase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

const ORDEN_ESTADO: Record<string, number> = {
  'CRITICO': 0, 'ALERTA': 1, 'SOLO REAL': 2, 'EN CONTROL': 3, 'FAVORABLE': 4, 'SIN EJECUCION': 5,
}

interface Props {
  partidas: Partida[]
  fechaCorte: string
  /** El módulo de proyección es solo para admin. */
  conProyeccion: boolean
  onIrACostos: () => void
}

export default function ResumenObra({ partidas, fechaCorte, conProyeccion, onIrACostos }: Props) {
  const paleta = usePaleta()
  const proyecto = useProjectsStore(s => s.projects.find(p => p.id === s.activeProjectId) ?? null)
  const plan = usePlanCuentasStore(s => s.plan)

  // ── Totales de la obra ──────────────────────────────────────────────
  const t = useMemo(() => {
    const suma = (f: (p: Partida) => number) => partidas.reduce((s, p) => s + f(p), 0)
    const vigente = suma(p => p.ppto_vigente)
    const proyeccion = suma(p => p.proyeccion)
    const gastado = suma(p => p.gasto_real)
    return {
      vigente, proyeccion, gastado,
      resultado: vigente - proyeccion,
      pctResultado: vigente ? (vigente - proyeccion) / vigente : 0,
      pctEjecucion: vigente ? gastado / vigente : 0,
    }
  }, [partidas])

  // ── Semáforo y prioridades por familia ──────────────────────────────
  const familias = useMemo(() => {
    const grupos = new Map<string, Partida[]>()
    for (const p of partidas) {
      const g = grupos.get(p.familia) ?? []
      g.push(p)
      grupos.set(p.familia, g)
    }
    return [...grupos.entries()].map(([nombre, ps]) => {
      const vigente = ps.reduce((s, p) => s + p.ppto_vigente, 0)
      const variacion = ps.reduce((s, p) => s + p.variacion_uf, 0)
      // La cuenta que más aporta a la desviación, para decir dónde mirar.
      const porCuenta = new Map<string, { nombre: string; variacion: number }>()
      for (const p of ps) {
        const e = porCuenta.get(p.codigo2) ?? { nombre: p.partida, variacion: 0 }
        e.variacion += p.variacion_uf
        porCuenta.set(p.codigo2, e)
      }
      const peor = [...porCuenta.entries()].sort((a, b) => a[1].variacion - b[1].variacion)[0]
      return {
        nombre, vigente, variacion,
        pct: vigente ? variacion / vigente : 0,
        estado: estadoAgregado(ps),
        cuentas: ps.length,
        peorCuenta: peor && peor[1].variacion < 0 ? { codigo: peor[0], ...peor[1] } : null,
      }
    }).sort((a, b) => a.variacion - b.variacion)
  }, [partidas])

  const conteos = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of familias) c[f.estado] = (c[f.estado] ?? 0) + 1
    return c
  }, [familias])

  const prioridades = familias.filter(f => f.variacion < 0).slice(0, 3)

  // ── Curva, si el perfil y los datos lo permiten ─────────────────────
  const curva = useMemo(() => {
    if (!conProyeccion || !proyecto) return null
    try {
      const params = parametrosObra(proyecto, plan, t.proyeccion)
      if (!params.obra) return { faltan: params.faltantes, datos: null, cierre: null }
      const p = proyectar(params.obra, { lead: 3 })
      const real = params.serieReal
      const r = real.length ? repronosticar(p, real, { mesCorte: real.length, escenario: 'plazo' }) : null
      return {
        faltan: null,
        datos: p.meses.map((m, i) => ({
          etiqueta: m.ym.slice(2).replace('-', '/'),
          modelo: m.acum,
          bandaBase: m.p10 * p.total,
          bandaAlto: Math.max(0, (m.p90 - m.p10) * p.total),
          real: i < real.length ? real[i].acum : null,
          reancla: r ? r.reproyeccion.serie[i].acum : null,
        })),
        cierre: { modelo: r ? r.reproyeccion.totalNuevo : p.total, obra: t.proyeccion, meses: p.NT, observados: real.length },
      }
    } catch {
      return null
    }
  }, [conProyeccion, proyecto, plan, t.proyeccion])

  if (partidas.length === 0) {
    return (
      <div className="bg-panel rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-400">Cargá los archivos de la obra para ver el resumen.</p>
      </div>
    )
  }

  const negativo = t.resultado < 0

  return (
    <div className="space-y-5">

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-medium text-tinta font-slab tracking-tight">Resumen de obra</h1>
        <span className="text-[11px] text-gray-400">
          Corte {fechaCorte} · {partidas.length} partidas en {familias.length} familias
        </span>
      </div>

      {/* ── Resultado, ejecución y semáforo ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        <div className="lg:col-span-5 flex flex-col gap-3 bg-panel border border-gray-200 rounded-xl p-6">
          <span className="text-[10px] tracking-widest text-gray-400 uppercase">Resultado proyectado</span>
          <div className="flex items-baseline gap-3">
            <span
              className="text-[44px] leading-none font-bold font-slab tracking-tight tabular-nums"
              style={{ color: negativo ? paleta.negativo : paleta.positivo }}
            >
              {negativo ? '−' : '+'}{uf0(Math.abs(t.resultado))}
            </span>
            <span className="text-base text-gray-400 font-slab">UF</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-xs font-medium"
              style={{ color: negativo ? paleta.negativo : paleta.positivo }}
            >
              <TrendingDown className={`h-3.5 w-3.5 ${negativo ? '' : 'rotate-180'}`} />
              {pct1(t.pctResultado)}
            </span>
            <span className="text-xs text-gray-500">sobre el presupuesto vigente</span>
          </div>
          <div className="h-px bg-gray-200 my-1" />
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Venta total <span className="text-gray-400">(ppto vigente)</span></span>
            <span className="tabular-nums font-medium text-tinta">{uf2(t.vigente)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Costo proyectado</span>
            <span className="tabular-nums font-medium text-tinta">{uf2(t.proyeccion)}</span>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col justify-between bg-panel border border-gray-200 rounded-xl p-6">
          <span className="text-[10px] tracking-widest text-gray-400 uppercase">Ejecutado</span>
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] leading-none font-medium text-tinta font-slab tracking-tight tabular-nums">
                {(t.pctEjecucion * 100).toFixed(1)}
              </span>
              <span className="text-base text-gray-400 font-slab">%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, t.pctEjecucion * 100)}%`, background: paleta.kpi.presupuesto }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-gray-500">
              <span className="tabular-nums">{uf2(t.gastado)} UF</span>
              {curva?.cierre && <span>mes {curva.cierre.observados} de {curva.cierre.meses}</span>}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4 bg-panel border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] tracking-widest text-gray-400 uppercase">Semáforo por familia</span>
            <span className="text-[10px] text-gray-400 tabular-nums">{familias.length}</span>
          </div>
          <div className="flex gap-1 h-1.5">
            {[...familias].sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]).map(f => (
              <div key={f.nombre} className="flex-1 rounded-full" style={{ background: paleta.estado[f.estado] }} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
            {Object.entries(ORDEN_ESTADO)
              .sort((a, b) => a[1] - b[1])
              .filter(([e]) => conteos[e])
              .map(([e]) => (
                <div key={e} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: paleta.estado[e] }} />
                  <span className="text-xs text-gray-500">{enFrase(e)}</span>
                  <span className="ml-auto text-[13px] font-bold text-tinta tabular-nums">{conteos[e]}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* ── Curva y prioridades ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        <div className="lg:col-span-8 bg-panel border border-gray-200 rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium text-tinta font-slab">Curva de costo acumulado</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {curva?.cierre
                  ? `${curva.cierre.observados} meses observados de ${curva.cierre.meses}`
                  : conProyeccion
                    ? 'Completá la ficha de obra para proyectar la curva'
                    : 'La proyección es un módulo de administrador'}
              </p>
            </div>
            {curva?.datos && (
              <div className="flex gap-4 text-[11px] text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-0.5" style={{ background: paleta.curva.modelo }} />Modelo</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-0.5" style={{ background: paleta.curva.real }} />Real</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: paleta.curva.reancla }} />Re-anclada</span>
              </div>
            )}
          </div>

          {curva?.datos ? (
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={curva.datos} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={paleta.grilla} vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 9, fill: paleta.ejeTenue }} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: paleta.grilla }} />
                <YAxis tick={{ fontSize: 9, fill: paleta.ejeTenue }} tickFormatter={v => uf0(v as number)} width={58} tickLine={false} axisLine={false} />
                <Area dataKey="bandaBase" stackId="b" stroke="none" fill="transparent" />
                <Area dataKey="bandaAlto" stackId="b" stroke="none" fill={paleta.curva.banda} fillOpacity={0.14} />
                <Line dataKey="modelo" stroke={paleta.curva.modelo} strokeWidth={2} dot={false} />
                <Line dataKey="reancla" stroke={paleta.curva.reancla} strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
                <Line dataKey="real" stroke={paleta.curva.real} strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[210px] flex items-center justify-center text-xs text-gray-400">
              {curva?.faltan?.length
                ? `Falta: ${curva.faltan.join(' · ')}`
                : 'Sin proyección disponible'}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 flex flex-col bg-panel border border-gray-200 rounded-xl p-6">
          <span className="text-[10px] tracking-widest text-gray-400 uppercase mb-4">Qué mirar primero</span>
          <div className="flex flex-col gap-3.5">
            {prioridades.length === 0 && (
              <p className="text-xs text-gray-500">Ninguna familia se proyecta sobre el presupuesto vigente.</p>
            )}
            {prioridades.map(f => (
              <div key={f.nombre} className="flex gap-3">
                <span className="w-[3px] rounded-full flex-shrink-0" style={{ background: paleta.estado[f.estado] }} />
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium text-tinta">{enFrase(f.nombre)}</span>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: paleta.estado[f.estado] }}>
                      {pct1(f.pct)}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-500 leading-relaxed">
                    {uf0(Math.abs(f.variacion))} UF sobre lo vigente
                    {f.peorCuenta && <> · la cuenta {f.peorCuenta.codigo} concentra {uf0(Math.abs(f.peorCuenta.variacion))}</>}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={onIrACostos}
            className="flex items-center gap-1.5 mt-auto pt-4 text-xs font-medium text-tinta hover:text-accent transition-colors"
          >
            Ver las {partidas.length} partidas
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Las dos lecturas del cierre ───────────────────────────────── */}
      {curva?.cierre && (
        <div className="flex flex-col sm:flex-row items-stretch bg-panel border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex-1 p-5">
            <p className="text-[10px] tracking-widest text-gray-400 uppercase">Cierre según el modelo</p>
            <p className="text-[22px] font-medium text-tinta font-slab tabular-nums mt-1">{uf0(curva.cierre.modelo)} <span className="text-xs text-gray-400">UF</span></p>
            <p className="text-[11px] text-gray-500 mt-0.5">mezcla de 8 obras históricas</p>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="flex-1 p-5">
            <p className="text-[10px] tracking-widest text-gray-400 uppercase">Cierre según la obra</p>
            <p className="text-[22px] font-medium text-tinta font-slab tabular-nums mt-1">{uf0(curva.cierre.obra)} <span className="text-xs text-gray-400">UF</span></p>
            <p className="text-[11px] text-gray-500 mt-0.5">suma del slot proyectado</p>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="flex-1 p-5 bg-red-50">
            <p className="text-[10px] tracking-widest uppercase" style={{ color: paleta.negativo }}>Brecha a resolver</p>
            <p className="text-[22px] font-bold font-slab tabular-nums mt-1" style={{ color: paleta.negativo }}>
              {uf0(Math.abs(curva.cierre.modelo - curva.cierre.obra))} <span className="text-xs font-normal">UF</span>
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: paleta.negativo }}>
              el modelo proyecta {curva.cierre.modelo < curva.cierre.obra ? 'menos' : 'más'} que la obra
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
