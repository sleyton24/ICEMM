import type { Partida } from '../data/dataAdapter'

const uf = (n: number) =>
  `UF ${n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Props {
  partidas: Partida[]
  fechaCorte: string
}

export default function KpiCards({ partidas, fechaCorte }: Props) {
  const ppto       = partidas.reduce((s, p) => s + p.ppto_original, 0)
  const real       = partidas.reduce((s, p) => s + p.gasto_real, 0)
  const vigente    = partidas.reduce((s, p) => s + p.ppto_vigente, 0)
  const proyeccion = partidas.reduce((s, p) => s + p.proyeccion, 0)

  const varTotal    = vigente - proyeccion
  const varTotalPct = vigente ? (varTotal / vigente) * 100 : 0
  const ejecPct     = vigente ? (real / vigente) * 100 : 0

  const conteos = partidas.reduce<Record<string, number>>((acc, p) => {
    acc[p.estado] = (acc[p.estado] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Presupuesto Original" value={uf(ppto)}        sub={`${partidas.length} partidas`}         accent="#233032" />
        <KpiCard label="Ppto Vigente"         value={uf(vigente)}    sub="redistrib + OO.EE."                     accent="#809494" />
        <KpiCard label="Gasto Real Total"     value={uf(real)}       sub={`${ejecPct.toFixed(1)}% ejecución`}     accent="#101820" />
        <KpiCard label="Proyección"           value={uf(proyeccion)} sub="costo final estimado"                   accent="#253136" />
        <KpiCard
          label="Variación (R-P)"
          value={uf(varTotal)}
          sub={`${varTotalPct >= 0 ? '+' : ''}${varTotalPct.toFixed(1)}%`}
          accent={varTotal >= 0 ? '#16a34a' : '#E00544'}
        />
      </div>

      {/* Estado badges */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <EstadoBadge label="Crítico"       count={conteos['CRITICO']      || 0} dot="#E00544"  />
        <EstadoBadge label="Alerta"        count={conteos['ALERTA']       || 0} dot="#f59e0b"  />
        <EstadoBadge label="En Control"    count={conteos['EN CONTROL']   || 0} dot="#16a34a"  />
        <EstadoBadge label="Favorable"     count={conteos['FAVORABLE']    || 0} dot="#0ea5e9"  />
        <EstadoBadge label="Sin Ejecución" count={conteos['SIN EJECUCION']|| 0} dot="#9ca3af"  />
        <EstadoBadge label="Solo Real"     count={conteos['SOLO REAL']    || 0} dot="#8b5cf6"  />
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub: string; accent: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ backgroundColor: accent }} />
      <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1.5 pl-2">{label}</p>
      <p className="text-base font-bold text-navy leading-tight pl-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1 pl-2">{sub}</p>}
    </div>
  )
}

function EstadoBadge({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm flex items-center justify-between px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
        <span className="text-xs text-gray-600 font-medium">{label}</span>
      </div>
      <span className="text-lg font-bold text-navy">{count}</span>
    </div>
  )
}
