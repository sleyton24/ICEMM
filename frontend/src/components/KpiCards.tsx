import type { Partida } from '../data/dataAdapter'
import { estadoPorGrupo } from '../data/estado'
import { usePaleta } from '../features/tema/paleta'

const uf = (n: number) =>
  `UF ${n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Props {
  partidas: Partida[]
  fechaCorte: string
}

export default function KpiCards({ partidas }: Props) {
  const paleta = usePaleta()
  const ppto       = partidas.reduce((s, p) => s + p.ppto_original, 0)
  const real       = partidas.reduce((s, p) => s + p.gasto_real, 0)
  const vigente    = partidas.reduce((s, p) => s + p.ppto_vigente, 0)
  const proyeccion = partidas.reduce((s, p) => s + p.proyeccion, 0)

  const varTotal    = vigente - proyeccion
  const varTotalPct = vigente ? (varTotal / vigente) * 100 : 0
  const ejecPct     = vigente ? (real / vigente) * 100 : 0

  // El semaforo se evalua a nivel de familia: una familia puede tener partidas
  // criticas y aun asi cerrar en control, que es lo que le importa a la obra.
  const estadosFamilia = estadoPorGrupo(partidas, p => p.familia)
  const conteos = Object.values(estadosFamilia).reduce<Record<string, number>>((acc, e) => {
    acc[e] = (acc[e] || 0) + 1
    return acc
  }, {})
  const totalFamilias = Object.keys(estadosFamilia).length

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Presupuesto Original" value={uf(ppto)}        sub={`${partidas.length} partidas`}         accent={paleta.kpi.presupuesto} />
        <KpiCard label="Ppto Vigente"         value={uf(vigente)}    sub="redistrib + OO.EE."                     accent={paleta.kpi.vigente} />
        <KpiCard label="Gasto Real Total"     value={uf(real)}       sub={`${ejecPct.toFixed(1)}% ejecución`}     accent={paleta.kpi.real} />
        <KpiCard label="Proyección"           value={uf(proyeccion)} sub="costo final estimado"                   accent={paleta.kpi.proyeccion} />
        <KpiCard
          label="Variación (R-P)"
          value={uf(varTotal)}
          sub={`${varTotalPct >= 0 ? '+' : ''}${varTotalPct.toFixed(1)}%`}
          accent={varTotal >= 0 ? paleta.positivo : paleta.negativo}
        />
      </div>

      {/* Estado badges — agregados por familia */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">
          Estado por familia
          <span className="ml-1.5 text-gray-300 normal-case tracking-normal">
            {totalFamilias} familia{totalFamilias !== 1 ? 's' : ''}
          </span>
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <EstadoBadge label="Crítico"       count={conteos['CRITICO']      || 0} dot={paleta.estado['CRITICO']}  />
          <EstadoBadge label="Alerta"        count={conteos['ALERTA']       || 0} dot={paleta.estado['ALERTA']}  />
          <EstadoBadge label="En Control"    count={conteos['EN CONTROL']   || 0} dot={paleta.estado['EN CONTROL']}  />
          <EstadoBadge label="Favorable"     count={conteos['FAVORABLE']    || 0} dot={paleta.estado['FAVORABLE']}  />
          <EstadoBadge label="Sin Ejecución" count={conteos['SIN EJECUCION']|| 0} dot={paleta.estado['SIN EJECUCION']}  />
          <EstadoBadge label="Solo Real"     count={conteos['SOLO REAL']    || 0} dot={paleta.estado['SOLO REAL']}  />
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub: string; accent: string
}) {
  return (
    <div className="bg-panel rounded-xl border border-gray-100 shadow-sm p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ backgroundColor: accent }} />
      <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1.5 pl-2">{label}</p>
      <p className="text-base font-bold text-tinta leading-tight pl-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1 pl-2">{sub}</p>}
    </div>
  )
}

function EstadoBadge({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <div className="bg-panel rounded-lg border border-gray-100 shadow-sm flex items-center justify-between px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
        <span className="text-xs text-gray-600 font-medium">{label}</span>
      </div>
      <span className="text-lg font-bold text-tinta">{count}</span>
    </div>
  )
}
