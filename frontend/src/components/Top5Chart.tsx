import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { Partida } from '../data/dataAdapter'

const COLORES_ESTADO: Record<string, string> = {
  'CRITICO': '#E00544',
  'ALERTA': '#f59e0b',
  'EN CONTROL': '#16a34a',
  'FAVORABLE': '#0ea5e9',
  'SIN EJECUCION': '#9ca3af',
}

export default function Top5Chart({ partidas }: { partidas: Partida[] }) {
  const top5 = [...partidas]
    .filter(p => p.variacion_uf > 0)
    .sort((a, b) => b.variacion_uf - a.variacion_uf)
    .slice(0, 5)

  const data = top5.map(p => ({
    name: p.partida.length > 28 ? p.partida.slice(0, 28) + '...' : p.partida,
    ppto: Math.round(p.ppto_original),
    real: Math.round(p.gasto_real),
    var: Math.round(p.variacion_uf),
    pct: p.variacion_pct?.toFixed(1),
    estado: p.estado,
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm space-y-1">
        <p className="font-semibold text-navy">{label}</p>
        <p className="text-gray-500">Ppto: <span className="font-medium text-gray-700">UF {d.ppto.toLocaleString('es-CL')}</span></p>
        <p className="text-gray-500">Real: <span className="font-medium text-gray-700">UF {d.real.toLocaleString('es-CL')}</span></p>
        <p className="text-accent font-medium">Sobrecosto: +UF {d.var.toLocaleString('es-CL')} ({d.pct}%)</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-navy font-slab">Top 5 Partidas con Mayor Sobrecosto</h2>

      <div className="bg-surface rounded-lg p-4 border border-gray-100">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 12, fill: '#374151' }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="ppto" name="Presupuesto" fill="#DBE8E8" radius={[0, 4, 4, 0]} barSize={14} />
            <Bar dataKey="real" name="Real" radius={[0, 4, 4, 0]} barSize={14}>
              {data.map((entry, i) => (
                <Cell key={i} fill={COLORES_ESTADO[entry.estado] || '#6b7280'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy">
              {['#', 'Partida', 'Ppto (UF)', 'Real (UF)', 'Var (UF)', 'Var (%)', 'Estado'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium text-white/80 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {top5.map((p, i) => (
              <tr key={p.codigo} className={`hover:bg-teal-light/20 transition-colors ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                <td className="px-3 py-2.5 text-gray-300 font-semibold">{i + 1}</td>
                <td className="px-3 py-2.5 text-gray-700 font-medium">{p.partida}</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-600">{p.ppto_original.toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2.5 tabular-nums text-gray-600">{p.gasto_real.toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2.5 tabular-nums text-accent font-semibold">+{p.variacion_uf.toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2.5 tabular-nums text-accent font-semibold">+{p.variacion_pct?.toFixed(1)}%</td>
                <td className="px-3 py-2.5">
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: `${COLORES_ESTADO[p.estado] || '#9ca3af'}15`,
                      color: COLORES_ESTADO[p.estado] || '#9ca3af',
                    }}>
                    {p.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
