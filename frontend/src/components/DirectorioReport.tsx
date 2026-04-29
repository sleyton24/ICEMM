import { useMemo, useState, useEffect } from 'react'
import { useProjectsStore } from '../features/projects/ProjectsStore'
import { usePlanCuentasStore } from '../features/plan-cuentas/PlanCuentasStore'
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

interface VentasProyecto {
  ventaInicial: number
  ventaObrasExtra: number
}

const VENTAS_KEY = 'icemm.ventas.v1'
function loadVentas(): Record<string, VentasProyecto> {
  try {
    const raw = localStorage.getItem(VENTAS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function saveVentas(v: Record<string, VentasProyecto>) {
  localStorage.setItem(VENTAS_KEY, JSON.stringify(v))
}

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

export default function DirectorioReport() {
  const proyectos = useProjectsStore(s => s.projects)
  const activeProjectId = useProjectsStore(s => s.activeProjectId)
  const plan = usePlanCuentasStore(s => s.plan)
  const [ventas, setVentas] = useState<Record<string, VentasProyecto>>(loadVentas())

  useEffect(() => { saveVentas(ventas) }, [ventas])

  // Merge cada proyecto con su cutoff
  const datosProyectos = useMemo(() => {
    return proyectos.map(p => ({
      proyecto: p,
      partidas: mergeProyecto(p, plan, p.cutoffMesReal ?? null).partidas,
    }))
  }, [proyectos, plan])

  // ── Tabla 1: Plan de Cuentas del proyecto activo ────────────────────────────
  const proyectoActivo = datosProyectos.find(d => d.proyecto.id === activeProjectId)
  const filasFamilia = proyectoActivo
    ? FAMILIAS_REPORTE.map(fam => {
        const ps = proyectoActivo.partidas.filter(p => p.familia === fam)
        return { familia: fam, totales: familiaTotales(ps) }
      })
    : []

  const totalesTabla1 = proyectoActivo
    ? familiaTotales(
        proyectoActivo.partidas.filter(p =>
          (FAMILIAS_REPORTE as readonly string[]).includes(p.familia)
        )
      )
    : null

  const updateVenta = (projectId: string, field: keyof VentasProyecto, value: number) => {
    setVentas(prev => ({
      ...prev,
      [projectId]: { ...(prev[projectId] ?? { ventaInicial: 0, ventaObrasExtra: 0 }), [field]: value },
    }))
  }

  return (
    <div className="space-y-8">
      {/* ════════════════════════════════════════════════════════════════
          TABLA 1: VISION DE PLAN DE CUENTAS DE OBRA
          ════════════════════════════════════════════════════════════════ */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-navy">
          <h2 className="text-sm font-semibold text-white font-slab">VISIÓN DE PLAN DE CUENTAS DE OBRA</h2>
          {proyectoActivo && (
            <p className="text-[11px] text-white/50">{proyectoActivo.proyecto.nombre}</p>
          )}
        </div>

        {!proyectoActivo ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Seleccioná un proyecto para ver el reporte.
          </div>
        ) : (
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
              {totalesTabla1 && (
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
              )}
            </table>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TABLA 2: VISION DE VENTAS Y RESULTADO DE OBRA
          ════════════════════════════════════════════════════════════════ */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-navy">
          <h2 className="text-sm font-semibold text-white font-slab">VISIÓN DE VENTAS Y RESULTADO DE OBRA</h2>
          <p className="text-[11px] text-white/50">{datosProyectos.length} proyecto{datosProyectos.length !== 1 ? 's' : ''} consolidado{datosProyectos.length !== 1 ? 's' : ''}</p>
        </div>

        {datosProyectos.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Sin proyectos cargados.
          </div>
        ) : (
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
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {/* INGRESOS */}
                <tr className="bg-emerald-50/50">
                  <td colSpan={datosProyectos.length + 1} className="px-3 py-1.5 text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Ingresos (Ventas)</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 pl-6 text-gray-600 text-xs">Venta Inicial <span className="text-gray-300">(1)</span></td>
                  {datosProyectos.map(d => {
                    const v = ventas[d.proyecto.id]?.ventaInicial ?? 0
                    return (
                      <td key={d.proyecto.id} className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={v || ''}
                          onChange={e => updateVenta(d.proyecto.id, 'ventaInicial', parseFloat(e.target.value) || 0)}
                          placeholder="0,00"
                          className="w-28 text-right tabular-nums text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-muted/40"
                        />
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <td className="px-3 py-2 pl-6 text-gray-600 text-xs">Venta Obras Extra <span className="text-gray-300">(3)</span></td>
                  {datosProyectos.map(d => {
                    const v = ventas[d.proyecto.id]?.ventaObrasExtra ?? 0
                    return (
                      <td key={d.proyecto.id} className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={v || ''}
                          onChange={e => updateVenta(d.proyecto.id, 'ventaObrasExtra', parseFloat(e.target.value) || 0)}
                          placeholder="0,00"
                          className="w-28 text-right tabular-nums text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-muted/40"
                        />
                      </td>
                    )
                  })}
                </tr>
                <tr className="bg-emerald-50/30">
                  <td className="px-3 py-2 pl-6 font-semibold text-gray-700 text-xs">Venta Total <span className="text-gray-300">(4)</span></td>
                  {datosProyectos.map(d => {
                    const ventaInicial = ventas[d.proyecto.id]?.ventaInicial ?? 0
                    const ventaExtra = ventas[d.proyecto.id]?.ventaObrasExtra ?? 0
                    const total = ventaInicial + ventaExtra
                    return <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right font-semibold text-navy">{uf2(total)}</td>
                  })}
                </tr>

                {/* EGRESOS */}
                <tr className="bg-amber-50/50">
                  <td colSpan={datosProyectos.length + 1} className="px-3 py-1.5 text-[11px] font-bold text-amber-700 uppercase tracking-wider">Egresos (Costos)</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 pl-6 font-medium text-gray-700 text-xs">Costos Totales <span className="text-gray-300">(5)</span></td>
                  {datosProyectos.map(d => {
                    const totalProy = d.partidas.reduce((s, p) => s + p.proyeccion, 0)
                    return <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right text-gray-700">{uf2(totalProy)}</td>
                  })}
                </tr>

                {/* UTILIDAD */}
                <tr className="bg-blue-50/50">
                  <td colSpan={datosProyectos.length + 1} className="px-3 py-1.5 text-[11px] font-bold text-blue-700 uppercase tracking-wider">Utilidad</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 pl-6 text-gray-600 text-xs">Utilidad Estudiada <span className="text-gray-300">(CC 605)</span></td>
                  {datosProyectos.map(d => {
                    const v = sumByCC(d.partidas, 605, 'ppto_original')
                    return <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right text-gray-600">{uf2(v)}</td>
                  })}
                </tr>
                <tr>
                  <td className="px-3 py-2 pl-6 text-gray-600 text-xs">Ahorro o Pérdida <span className="text-gray-300">(7)</span></td>
                  {datosProyectos.map(d => {
                    const vigente = d.partidas.reduce((s, p) => s + p.ppto_vigente, 0)
                    const proy = d.partidas.reduce((s, p) => s + p.proyeccion, 0)
                    const ahorro = vigente - proy
                    return (
                      <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right">
                        <span className={ahorro >= 0 ? 'text-emerald-600 font-medium' : 'text-accent font-medium'}>
                          {signed(ahorro)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
                <tr className="bg-blue-50/30">
                  <td className="px-3 py-2 pl-6 font-semibold text-gray-700 text-xs">Utilidad Total Proyectada <span className="text-gray-300">(CC 605 + 7)</span></td>
                  {datosProyectos.map(d => {
                    const cc605 = sumByCC(d.partidas, 605, 'ppto_original')
                    const vigente = d.partidas.reduce((s, p) => s + p.ppto_vigente, 0)
                    const proy = d.partidas.reduce((s, p) => s + p.proyeccion, 0)
                    const utilTotal = cc605 + (vigente - proy)
                    return <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right font-semibold text-navy">{uf2(utilTotal)}</td>
                  })}
                </tr>

                {/* MARGEN OPERACIONAL */}
                <tr className="bg-purple-50/50">
                  <td colSpan={datosProyectos.length + 1} className="px-3 py-1.5 text-[11px] font-bold text-purple-700 uppercase tracking-wider">Margen Operacional (Mg Contribución)</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 pl-6 text-gray-600 text-xs">Utilidad Total Proyectada <span className="text-gray-300">(CC 605 + 7)</span></td>
                  {datosProyectos.map(d => {
                    const cc605 = sumByCC(d.partidas, 605, 'ppto_original')
                    const vigente = d.partidas.reduce((s, p) => s + p.ppto_vigente, 0)
                    const proy = d.partidas.reduce((s, p) => s + p.proyeccion, 0)
                    const utilTotal = cc605 + (vigente - proy)
                    return <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right text-gray-600">{uf2(utilTotal)}</td>
                  })}
                </tr>
                <tr>
                  <td className="px-3 py-2 pl-6 text-gray-600 text-xs">Back Office Central <span className="text-gray-300">(CC 421)</span></td>
                  {datosProyectos.map(d => {
                    const v = sumByCC(d.partidas, 421, 'proyeccion')
                    return <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right text-gray-600">{uf2(v)}</td>
                  })}
                </tr>
                <tr>
                  <td className="px-3 py-2 pl-6 text-gray-600 text-xs">Provisión Postventa <span className="text-gray-300">(CC 604)</span></td>
                  {datosProyectos.map(d => {
                    const v = sumByCC(d.partidas, 604, 'proyeccion')
                    return <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right text-gray-600">{uf2(v)}</td>
                  })}
                </tr>
                <tr className="bg-purple-50/30 border-t-2 border-purple-200">
                  <td className="px-3 py-2 pl-6 font-bold text-purple-900 text-xs uppercase">Total Margen Operacional</td>
                  {datosProyectos.map(d => {
                    const cc605 = sumByCC(d.partidas, 605, 'ppto_original')
                    const vigente = d.partidas.reduce((s, p) => s + p.ppto_vigente, 0)
                    const proy = d.partidas.reduce((s, p) => s + p.proyeccion, 0)
                    const utilTotal = cc605 + (vigente - proy)
                    const cc421 = sumByCC(d.partidas, 421, 'proyeccion')
                    const cc604 = sumByCC(d.partidas, 604, 'proyeccion')
                    const total = utilTotal + cc421 + cc604
                    return (
                      <td key={d.proyecto.id} className="px-3 py-2 tabular-nums text-right font-bold">
                        <span className={total >= 0 ? 'text-emerald-700' : 'text-accent'}>{uf2(total)}</span>
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
