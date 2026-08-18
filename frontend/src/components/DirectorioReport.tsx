import { Fragment, useMemo, useState } from 'react'
import { FileText, Lock, ChevronDown, Check } from 'lucide-react'
import { useProjectsStore } from '../features/projects/ProjectsStore'
import { usePlanCuentasStore } from '../features/plan-cuentas/PlanCuentasStore'
import { useInformesStore } from '../features/informes/InformesStore'
import { mergeProyecto, type PartidaMerged } from '../features/data-upload/parser/mergeProyecto'

const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (n: number) => `${n >= 0 ? '+' : ''}${uf2(n)}`

const FAMILIAS_REPORTE = [
  'MATERIALES',
  'MANO DE OBRA',
  'SUBCONTRATOS',
  'GASTOS GENERALES',
  'EQUIPOS Y MAQUINARIAS',
  'OTROS',
] as const

const esFamiliaReporte = (f: string) => (FAMILIAS_REPORTE as readonly string[]).includes(f)

function familiaTotales(partidas: PartidaMerged[]) {
  return {
    ppto_original:    partidas.reduce((s, p) => s + p.ppto_original, 0),
    redistribuido:    partidas.reduce((s, p) => s + p.redistribuido, 0),
    ppto_horas_extra: partidas.reduce((s, p) => s + p.ppto_horas_extra, 0),
    ppto_vigente:     partidas.reduce((s, p) => s + p.ppto_vigente, 0),
    proyeccion:       partidas.reduce((s, p) => s + p.proyeccion, 0),
    gasto_real:       partidas.reduce((s, p) => s + p.gasto_real, 0),
  }
}

function sumByCC(partidas: PartidaMerged[], cc: number, field: keyof PartidaMerged): number {
  return partidas
    .filter(p => Number(p.codigo2) === cc)
    .reduce((s, p) => s + (Number(p[field]) || 0), 0)
}

/** Métricas de la Tabla 2 para una obra. Todas son aditivas → el consolidado es la suma. */
interface MetricasObra {
  ventaInicial: number
  ventaOOEE: number
  ventaTotal: number
  costosTotales: number
  utilidadEstudiada: number
  ahorroPerdida: number
  utilidadTotal: number
  backOffice: number
  provisionPostventa: number
  margenOperacional: number
}

function calcularMetricas(partidas: PartidaMerged[]): MetricasObra {
  const ps = partidas.filter(p => esFamiliaReporte(p.familia))
  const ventaInicial       = ps.reduce((s, p) => s + p.ppto_original, 0)
  const ventaOOEE          = ps.reduce((s, p) => s + p.ppto_horas_extra, 0)
  const ventaTotal         = ps.reduce((s, p) => s + p.ppto_vigente, 0)
  const costosTotales      = ps.reduce((s, p) => s + p.proyeccion, 0)
  const utilidadEstudiada  = sumByCC(partidas, 605, 'ppto_original')
  const ahorroPerdida      = ventaTotal - costosTotales
  const utilidadTotal      = utilidadEstudiada + ahorroPerdida
  const backOffice         = sumByCC(partidas, 421, 'proyeccion')
  const provisionPostventa = sumByCC(partidas, 604, 'proyeccion')
  return {
    ventaInicial, ventaOOEE, ventaTotal, costosTotales,
    utilidadEstudiada, ahorroPerdida, utilidadTotal,
    backOffice, provisionPostventa,
    margenOperacional: utilidadTotal + backOffice + provisionPostventa,
  }
}

const METRICAS_CERO: MetricasObra = {
  ventaInicial: 0, ventaOOEE: 0, ventaTotal: 0, costosTotales: 0,
  utilidadEstudiada: 0, ahorroPerdida: 0, utilidadTotal: 0,
  backOffice: 0, provisionPostventa: 0, margenOperacional: 0,
}

function sumarMetricas(ms: MetricasObra[]): MetricasObra {
  return ms.reduce<MetricasObra>((acc, m) => ({
    ventaInicial:       acc.ventaInicial + m.ventaInicial,
    ventaOOEE:          acc.ventaOOEE + m.ventaOOEE,
    ventaTotal:         acc.ventaTotal + m.ventaTotal,
    costosTotales:      acc.costosTotales + m.costosTotales,
    utilidadEstudiada:  acc.utilidadEstudiada + m.utilidadEstudiada,
    ahorroPerdida:      acc.ahorroPerdida + m.ahorroPerdida,
    utilidadTotal:      acc.utilidadTotal + m.utilidadTotal,
    backOffice:         acc.backOffice + m.backOffice,
    provisionPostventa: acc.provisionPostventa + m.provisionPostventa,
    margenOperacional:  acc.margenOperacional + m.margenOperacional,
  }), METRICAS_CERO)
}

type Variante = 'normal' | 'violeta' | 'signed' | 'destacado' | 'total'

interface FilaSpec {
  label: string
  nota: string
  get: (m: MetricasObra) => number
  variante: Variante
  filaClass?: string
}

interface BloqueSpec {
  titulo: string
  claseTitulo: string
  filas: FilaSpec[]
}

const BLOQUES: BloqueSpec[] = [
  {
    titulo: 'Ingresos (Ventas)',
    claseTitulo: 'bg-emerald-50/50 text-emerald-700',
    filas: [
      { label: 'Venta Inicial',     nota: '(1 = Total PPTO Inicial)', get: m => m.ventaInicial, variante: 'normal' },
      { label: 'Venta Obras Extra', nota: '(3 = Total PPTO OO.EE.)',  get: m => m.ventaOOEE,    variante: 'violeta' },
      { label: 'Venta Total',       nota: '(4 = Total PPTO Vigente)', get: m => m.ventaTotal,   variante: 'destacado', filaClass: 'bg-emerald-50/30' },
    ],
  },
  {
    titulo: 'Egresos (Costos)',
    claseTitulo: 'bg-amber-50/50 text-amber-700',
    filas: [
      { label: 'Costos Totales', nota: '(5 = Total PPTO Proyectado)', get: m => m.costosTotales, variante: 'normal' },
    ],
  },
  {
    titulo: 'Utilidad',
    claseTitulo: 'bg-blue-50/50 text-blue-700',
    filas: [
      { label: 'Utilidad Estudiada',        nota: '(CC 605)',           get: m => m.utilidadEstudiada, variante: 'normal' },
      { label: 'Ahorro o Pérdida',          nota: '(7 = Total EE.RR.)', get: m => m.ahorroPerdida,     variante: 'signed' },
      { label: 'Utilidad Total Proyectada', nota: '(CC 605 + 7)',       get: m => m.utilidadTotal,     variante: 'destacado', filaClass: 'bg-blue-50/30' },
    ],
  },
  {
    titulo: 'Margen Operacional (Mg Contribución)',
    claseTitulo: 'bg-purple-50/50 text-purple-700',
    filas: [
      { label: 'Utilidad Total Proyectada', nota: '(CC 605 + 7)', get: m => m.utilidadTotal,      variante: 'normal' },
      { label: 'Back Office Central',       nota: '(CC 421)',     get: m => m.backOffice,         variante: 'normal' },
      { label: 'Provisión Postventa',       nota: '(CC 604)',     get: m => m.provisionPostventa, variante: 'normal' },
      { label: 'Total Margen Operacional',  nota: '',             get: m => m.margenOperacional,  variante: 'total', filaClass: 'bg-purple-50/30 border-t-2 border-purple-200' },
    ],
  },
]

function Celda({ valor, variante }: { valor: number; variante: Variante }) {
  switch (variante) {
    case 'violeta':
      return <span className="text-violet-600">{uf2(valor)}</span>
    case 'signed':
      return <span className={valor >= 0 ? 'text-emerald-600 font-medium' : 'text-accent font-medium'}>{signed(valor)}</span>
    case 'destacado':
      return <span className="font-semibold text-navy">{uf2(valor)}</span>
    case 'total':
      return <span className={`font-bold ${valor >= 0 ? 'text-emerald-700' : 'text-accent'}`}>{uf2(valor)}</span>
    default:
      return <span className="text-gray-700">{uf2(valor)}</span>
  }
}

export default function DirectorioReport() {
  const proyectos = useProjectsStore(s => s.projects)
  const activeProjectId = useProjectsStore(s => s.activeProjectId)
  const plan = usePlanCuentasStore(s => s.plan)
  const viewsAll = useInformesStore(s => s.viewPorProyecto)

  // null = el usuario todavía no eligió → cae en la obra activa. Así no se mezclan
  // obras cerradas con obras en curso sin que lo pida explícitamente.
  const [seleccionManual, setSeleccionManual] = useState<string[] | null>(null)
  const [abierto, setAbierto] = useState(false)

  const seleccionadas = useMemo(() => {
    const ids = new Set(proyectos.map(p => p.id))
    if (seleccionManual) return seleccionManual.filter(id => ids.has(id))
    return activeProjectId && ids.has(activeProjectId) ? [activeProjectId] : []
  }, [seleccionManual, proyectos, activeProjectId])

  const toggleObra = (id: string) => {
    const actual = new Set(seleccionadas)
    if (actual.has(id)) actual.delete(id)
    else actual.add(id)
    // Se preserva el orden de la lista de proyectos
    setSeleccionManual(proyectos.filter(p => actual.has(p.id)).map(p => p.id))
  }

  const datosProyectos = useMemo(() => {
    return proyectos
      .filter(p => seleccionadas.includes(p.id))
      .map(p => {
        // Si para este proyecto la vista activa es un informe aprobado, usar su snapshot
        const v = viewsAll[p.id]
        const proyectoEnUso = v?.tipo === 'aprobado'
          ? { ...p, nombre: v.informe.snapshot.nombre, unidadNegocioCodigo: v.informe.snapshot.unidadNegocioCodigo, cutoffMesReal: v.informe.snapshot.cutoffMesReal, slots: v.informe.snapshot.slots }
          : p
        const partidas = mergeProyecto(proyectoEnUso, plan, proyectoEnUso.cutoffMesReal ?? null).partidas
        return { proyecto: p, vista: v, partidas, metricas: calcularMetricas(partidas) }
      })
  }, [proyectos, plan, viewsAll, seleccionadas])

  const consolidado = useMemo(
    () => sumarMetricas(datosProyectos.map(d => d.metricas)),
    [datosProyectos],
  )

  const multiObra = datosProyectos.length > 1
  const numColumnas = datosProyectos.length + (multiObra ? 1 : 0)

  const etiquetaSelector = datosProyectos.length === 0
    ? 'Sin obras seleccionadas'
    : datosProyectos.length === 1
      ? datosProyectos[0].proyecto.nombre
      : `${datosProyectos.length} obras`

  return (
    <div className="space-y-8">
      {/* ── Selector de obras ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <button
            onClick={() => setAbierto(!abierto)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
          >
            <span className="text-[11px] font-medium text-teal-muted uppercase tracking-wider">Obras</span>
            <span className="text-navy font-medium max-w-56 truncate">{etiquetaSelector}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </button>

          {abierto && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
              <div className="absolute left-0 top-full mt-1 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-surface">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Seleccioná una o varias
                  </span>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      onClick={() => setSeleccionManual(proyectos.map(p => p.id))}
                      className="text-teal-muted hover:text-navy font-medium transition-colors"
                    >
                      Todas
                    </button>
                    <span className="text-gray-200">|</span>
                    <button
                      onClick={() => setSeleccionManual([])}
                      className="text-teal-muted hover:text-navy font-medium transition-colors"
                    >
                      Ninguna
                    </button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {proyectos.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-gray-300">No hay obras cargadas</p>
                  )}
                  {proyectos.map(p => {
                    const marcada = seleccionadas.includes(p.id)
                    const v = viewsAll[p.id]
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleObra(p.id)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                          ${marcada ? 'bg-teal-light/30' : 'hover:bg-surface'}`}
                      >
                        <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0
                          ${marcada ? 'bg-navy border-navy' : 'border-gray-300 bg-white'}`}>
                          {marcada && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm truncate ${marcada ? 'font-semibold text-navy' : 'text-gray-700'}`}>
                            {p.nombre}
                          </span>
                          <span className="block text-[10px] text-gray-400">
                            {v?.tipo === 'aprobado' ? `Informe N°${v.informe.numero} (aprobado)` : 'Borrador (estado actual)'}
                          </span>
                        </span>
                        {p.id === activeProjectId && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-teal-muted flex-shrink-0">activa</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Estado del informe de cada obra seleccionada */}
        <div className="flex flex-wrap items-center gap-2">
          {datosProyectos.map(d => {
            const vista = d.vista
            const aprobado = vista?.tipo === 'aprobado'
            return (
              <span
                key={d.proyecto.id}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] border ${
                  aprobado
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}
              >
                {aprobado ? <Lock className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                <span className="font-semibold max-w-40 truncate">{d.proyecto.nombre}</span>
                <span className="opacity-75">
                  {vista?.tipo === 'aprobado' ? `Informe N°${vista.informe.numero}` : 'Borrador'}
                </span>
              </span>
            )
          })}
        </div>
      </div>

      {datosProyectos.length === 0 && (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
          Seleccioná al menos una obra para ver el reporte.
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TABLA 1: VISIÓN PLAN DE CUENTAS DE OBRA — una por obra
          ════════════════════════════════════════════════════════════════ */}
      {datosProyectos.map(d => {
        const filasFamilia = FAMILIAS_REPORTE.map(fam => ({
          familia: fam,
          totales: familiaTotales(d.partidas.filter(p => p.familia === fam)),
        }))
        const totalesTabla1 = familiaTotales(d.partidas.filter(p => esFamiliaReporte(p.familia)))

        return (
          <div key={d.proyecto.id} className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-navy">
              <h2 className="text-sm font-semibold text-white font-slab">VISIÓN DE PLAN DE CUENTAS DE OBRA</h2>
              <p className="text-[11px] text-white/50">{d.proyecto.nombre}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Familia de Recursos</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PPTO Inicial<div className="text-[9px] text-gray-300">(1)</div></th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PPTO Redistrib.<div className="text-[9px] text-gray-300">(2)</div></th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PPTO OO.EE.<div className="text-[9px] text-gray-300">(3)</div></th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PPTO Vigente<div className="text-[9px] text-gray-300">(4=2+3)</div></th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">PPTO Proyectado<div className="text-[9px] text-gray-300">(5)</div></th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Gastado<div className="text-[9px] text-gray-300">(6)</div></th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Saldo a Gastar<div className="text-[9px] text-gray-300">(5-6)</div></th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">EE.RR. Proyectado<div className="text-[9px] text-gray-300">(7=4-5)</div></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {filasFamilia.map(({ familia, totales }, i) => {
                    const saldo = totales.proyeccion - totales.gasto_real
                    const eerr = totales.ppto_vigente - totales.proyeccion
                    return (
                      <tr key={familia} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                        <td className="px-3 py-2 font-medium text-gray-700">{familia}</td>
                        <td className="px-3 py-2 tabular-nums text-right text-gray-600">{uf2(totales.ppto_original)}</td>
                        <td className="px-3 py-2 tabular-nums text-right text-gray-600">{uf2(totales.redistribuido)}</td>
                        <td className="px-3 py-2 tabular-nums text-right text-violet-600">{uf2(totales.ppto_horas_extra)}</td>
                        <td className="px-3 py-2 tabular-nums text-right font-semibold text-navy">{uf2(totales.ppto_vigente)}</td>
                        <td className="px-3 py-2 tabular-nums text-right text-gray-700">{uf2(totales.proyeccion)}</td>
                        <td className="px-3 py-2 tabular-nums text-right text-gray-700">{uf2(totales.gasto_real)}</td>
                        <td className="px-3 py-2 tabular-nums text-right text-gray-500">{uf2(saldo)}</td>
                        <td className="px-3 py-2 tabular-nums text-right">
                          <span className={eerr > 0 ? 'text-emerald-600 font-medium' : eerr < 0 ? 'text-accent font-medium' : 'text-gray-400'}>
                            {signed(eerr)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-navy/5 border-t-2 border-navy/20">
                  <tr>
                    <td className="px-3 py-2.5 font-bold text-navy uppercase text-xs">Total</td>
                    <td className="px-3 py-2.5 tabular-nums text-right font-bold text-navy">{uf2(totalesTabla1.ppto_original)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right font-bold text-navy">{uf2(totalesTabla1.redistribuido)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right font-bold text-violet-700">{uf2(totalesTabla1.ppto_horas_extra)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right font-bold text-navy">{uf2(totalesTabla1.ppto_vigente)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right font-bold text-navy">{uf2(totalesTabla1.proyeccion)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right font-bold text-navy">{uf2(totalesTabla1.gasto_real)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right font-bold text-navy">{uf2(totalesTabla1.proyeccion - totalesTabla1.gasto_real)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right font-bold">
                      <span className={totalesTabla1.ppto_vigente - totalesTabla1.proyeccion >= 0 ? 'text-emerald-600' : 'text-accent'}>
                        {signed(totalesTabla1.ppto_vigente - totalesTabla1.proyeccion)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}

      {/* ════════════════════════════════════════════════════════════════
          TABLA 2: VISIÓN DE VENTAS Y RESULTADO DE OBRA
          ════════════════════════════════════════════════════════════════ */}
      {datosProyectos.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-navy">
            <h2 className="text-sm font-semibold text-white font-slab">VISIÓN DE VENTAS Y RESULTADO DE OBRA</h2>
            <p className="text-[11px] text-white/50">
              {datosProyectos.length} obra{datosProyectos.length !== 1 ? 's' : ''} seleccionada{datosProyectos.length !== 1 ? 's' : ''}
              {multiObra && ' · con consolidado'}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-72">Concepto</th>
                  {datosProyectos.map(d => (
                    <th key={d.proyecto.id} className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider min-w-32">
                      {d.proyecto.nombre}
                    </th>
                  ))}
                  {multiObra && (
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold text-navy uppercase tracking-wider min-w-32 bg-navy/5 border-l-2 border-navy/20">
                      Consolidado
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {BLOQUES.map(bloque => (
                  <Fragment key={bloque.titulo}>
                    <tr className={bloque.claseTitulo}>
                      <td colSpan={numColumnas + 1} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider">
                        {bloque.titulo}
                      </td>
                    </tr>
                    {bloque.filas.map(fila => (
                      <tr key={fila.label} className={fila.filaClass ?? ''}>
                        <td className={`px-3 py-2 pl-6 text-xs ${
                          fila.variante === 'total'
                            ? 'font-bold text-purple-900 uppercase'
                            : fila.variante === 'destacado'
                              ? 'font-semibold text-gray-700'
                              : 'text-gray-600'
                        }`}>
                          {fila.label}
                          {fila.nota && <span className="ml-1 text-gray-300">{fila.nota}</span>}
                        </td>
                        {datosProyectos.map(d => (
                          <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right">
                            <Celda valor={fila.get(d.metricas)} variante={fila.variante} />
                          </td>
                        ))}
                        {multiObra && (
                          <td className="px-3 py-2 tabular-nums text-right bg-navy/5 border-l-2 border-navy/20">
                            <Celda valor={fila.get(consolidado)} variante={fila.variante} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
