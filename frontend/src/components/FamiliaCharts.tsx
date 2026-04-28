import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
  RadialBarChart, RadialBar,
} from 'recharts'
import type { Partida, SinPartida } from '../data/dataAdapter'

const COLORES_FAMILIA: Record<string, string> = {
  'MATERIALES':               '#f59e0b',
  'MANO DE OBRA':             '#1e293b',
  'SUBCONTRATOS':             '#06b6d4',
  'GASTOS GENERALES':         '#ec4899',
  'EQUIPOS Y MAQUINARIAS':    '#8b5cf6',
  'OTROS':                    '#9ca3af',
  'EDIFICACIONES COMERCIALES':'#f97316',
  'POST VENTA':               '#10b981',
  'GASTOS OFICINA CENTRAL':   '#6366f1',
}

const NOMBRE_CORTO: Record<string, string> = {
  'MATERIALES':               'Materiales',
  'MANO DE OBRA':             'M. Obra',
  'SUBCONTRATOS':             'Subcontr.',
  'GASTOS GENERALES':         'Gtos Grales',
  'EQUIPOS Y MAQUINARIAS':    'Equip/Maq',
  'OTROS':                    'Otros',
  'EDIFICACIONES COMERCIALES':'Edif. Com.',
  'POST VENTA':               'Post Venta',
  'GASTOS OFICINA CENTRAL':   'Gtos Ofic.',
}

const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ufK = (n: number) => `${(n / 1000).toFixed(0)}k`

const CustomTooltipBar = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm space-y-1 min-w-48">
      <p className="font-semibold text-navy text-xs">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-gray-600 flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium tabular-nums">UF {uf2(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

interface Props {
  partidas: Partida[]
  sinPartida: SinPartida[]
  familias: string[]
}

export default function FamiliaCharts({ partidas, sinPartida, familias: FAMILIAS }: Props) {
  const familiaData = useMemo(() => {
    return FAMILIAS.map(fam => {
      const ps = partidas.filter(p => p.familia === fam)
      const vigente = ps.reduce((s, p) => s + p.ppto_vigente, 0)
      const proyeccion = ps.reduce((s, p) => s + p.proyeccion, 0)
      const ejec = vigente > 0 ? (proyeccion / vigente) * 100 : 0
      const nPartidas = ps.length
      const nEjecutadas = ps.filter(p => p.proyeccion !== 0).length
      return {
        name: fam,
        nameCorto: NOMBRE_CORTO[fam] || fam.slice(0, 10),
        ppto: Math.round(vigente * 100) / 100,
        real: Math.round(proyeccion * 100) / 100,
        ejec: Math.round(ejec * 10) / 10,
        nPartidas,
        nEjecutadas,
        color: COLORES_FAMILIA[fam] || '#9ca3af',
      }
    })
  }, [partidas, FAMILIAS])

  const pieData = familiaData.map(f => ({
    name: f.nameCorto,
    value: f.ppto,
    color: f.color,
  }))

  const totalPpto = familiaData.reduce((s, f) => s + f.ppto, 0)
  const totalReal = familiaData.reduce((s, f) => s + f.real, 0)
  const realSinPartida = sinPartida.filter(s => s.gasto_uf > 0).reduce((s, p) => s + p.gasto_uf, 0)

  return (
    <div className="space-y-5">
      {/* Bar chart — horizontal for readability */}
      <div className="bg-surface rounded-lg border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-navy font-slab mb-4">Ppto Vigente vs Real + Proyección por Familia (UF)</h2>
        <ResponsiveContainer width="100%" height={Math.max(280, familiaData.length * 50)}>
          <BarChart data={familiaData} layout="vertical" margin={{ left: 10, right: 30, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={ufK} />
            <YAxis
              type="category"
              dataKey="nameCorto"
              width={90}
              tick={{ fontSize: 11, fill: '#374151' }}
              interval={0}
            />
            <Tooltip content={<CustomTooltipBar />} />
            <Legend
              content={() => (
                <div className="flex justify-center gap-6 pt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-3 rounded-sm border border-gray-400 bg-gray-400/15" />
                    Ppto Vigente
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-3 rounded-sm bg-gray-500" />
                    Real + Proyección
                  </span>
                </div>
              )}
            />
            <Bar dataKey="ppto" name="Ppto Vigente" radius={[0, 4, 4, 0]} barSize={16}>
              {familiaData.map((f, i) => (
                <Cell key={i} fill={`${f.color}25`} stroke={f.color} strokeWidth={1} />
              ))}
            </Bar>
            <Bar dataKey="real" name="Real + Proyección" radius={[0, 4, 4, 0]} barSize={16}>
              {familiaData.map((f, i) => (
                <Cell key={i} fill={f.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie + Progress bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface rounded-lg border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-navy font-slab mb-1">Distribución Ppto Vigente</h2>
          <p className="text-[11px] text-gray-400 mb-3">Total: UF {uf2(totalPpto)}</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="45%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [`UF ${uf2(v)}`, 'Ppto Vigente']} />
              <Legend
                verticalAlign="bottom"
                height={50}
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface rounded-lg border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-navy font-slab mb-1">% de Ejecución por Familia</h2>
          <p className="text-[11px] text-gray-400 mb-4">(Real + Proyección) / Ppto Vigente</p>
          <div className="space-y-4">
            {familiaData.filter(f => f.ppto > 0).map(f => (
              <div key={f.name}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-700 font-medium">{f.name}</span>
                  <span className="tabular-nums text-gray-400">
                    <span className="font-semibold" style={{ color: f.color }}>{f.ejec.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min(f.ejec, 100)}%`,
                      backgroundColor: f.color,
                      minWidth: f.real > 0 ? '4px' : '0',
                    }}
                  />
                </div>
                <p className="text-[11px] text-gray-300 mt-0.5">
                  {f.nEjecutadas}/{f.nPartidas} partidas · UF {uf2(f.real)} / {uf2(f.ppto)}
                </p>
              </div>
            ))}

            {realSinPartida > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-amber-600 font-medium">Sin partida presupuestaria</span>
                  <span className="tabular-nums text-amber-600 font-semibold">UF {uf2(realSinPartida)}</span>
                </div>
                <div className="w-full bg-amber-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-2.5 rounded-full bg-amber-400" style={{ width: '100%' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary table */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-navy">
          <h2 className="text-sm font-semibold text-white font-slab">Resumen por Familia</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Familia', 'Partidas', 'Con proy.', 'Ppto Vigente (UF)', 'Proyectado (UF)', 'Var (UF)', '% Ejec'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {familiaData.map((f, i) => {
              const varUF = f.real - f.ppto
              return (
                <tr key={f.name} className={`hover:bg-teal-light/20 transition-colors ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
                      <span className="font-medium text-gray-700 text-xs">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-500">{f.nPartidas}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-500">{f.nEjecutadas}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-700">{uf2(f.ppto)}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-700">{uf2(f.real)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className={varUF > 0 ? 'text-accent font-medium' : varUF < 0 ? 'text-emerald-600 font-medium' : 'text-gray-300'}>
                      {varUF >= 0 ? '+' : ''}{uf2(varUF)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(f.ejec, 100)}%`, backgroundColor: f.color }} />
                      </div>
                      <span className="tabular-nums text-xs font-medium" style={{ color: f.color }}>
                        {f.ejec.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr>
              <td className="px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Total</td>
              <td className="px-4 py-2.5 tabular-nums font-semibold text-navy">{partidas.length}</td>
              <td className="px-4 py-2.5 tabular-nums font-semibold text-navy">{partidas.filter(p => p.proyeccion !== 0).length}</td>
              <td className="px-4 py-2.5 tabular-nums font-bold text-navy">{uf2(totalPpto)}</td>
              <td className="px-4 py-2.5 tabular-nums font-bold text-navy">{uf2(totalReal)}</td>
              <td className="px-4 py-2.5 tabular-nums font-bold">
                <span className={totalReal - totalPpto >= 0 ? 'text-accent' : 'text-emerald-600'}>
                  {totalReal - totalPpto >= 0 ? '+' : ''}{uf2(totalReal - totalPpto)}
                </span>
              </td>
              <td className="px-4 py-2.5 tabular-nums font-bold text-navy">
                {totalPpto > 0 ? ((totalReal / totalPpto) * 100).toFixed(1) : '0.0'}%
              </td>
            </tr>
            {realSinPartida > 0 && (
              <tr className="bg-amber-50/50">
                <td colSpan={4} className="px-4 py-2 text-[11px] text-amber-600 font-medium">+ Gasto sin partida presupuestaria</td>
                <td className="px-4 py-2 tabular-nums text-amber-600 font-semibold">{uf2(realSinPartida)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  )
}
