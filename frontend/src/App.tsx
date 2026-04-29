import { useState } from 'react'
import { useDashboardData } from './data/dataAdapter'
import KpiCards from './components/KpiCards'
import TablaControl from './components/TablaControl'
import Top5Chart from './components/Top5Chart'
import FamiliaCharts from './components/FamiliaCharts'
import SinPartidaPanel from './components/SinPartidaPanel'
import DirectorioReport from './components/DirectorioReport'
import ProjectSwitcher from './features/projects/ProjectSwitcher'
import AdminPlanCuentasPage from './features/plan-cuentas/AdminPlanCuentasPage'
import CutoffMesFilter from './features/projects/CutoffMesFilter'
import AuthGate from './features/auth/AuthGate'

type Tab = 'tabla' | 'familias' | 'top5' | 'directorio'

export default function App() {
  const [tab, setTab] = useState<Tab>('tabla')
  const [showAdmin, setShowAdmin] = useState(false)
  const data = useDashboardData()

  if (showAdmin) {
    return <AuthGate><AdminPlanCuentasPage onBack={() => setShowAdmin(false)} /></AuthGate>
  }

  return (
    <AuthGate>
    <div className="min-h-screen bg-surface">
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-navy via-teal to-accent" />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/icemm-logo.png" alt="ICEMM" className="h-10 object-contain" />
            <div className="border-l border-gray-200 pl-4">
              <p className="text-[11px] font-medium text-teal-muted uppercase tracking-widest">Informe de Resultado de Obra</p>
              <p className="text-sm font-semibold text-navy">{data.projectName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <CutoffMesFilter />
            <ProjectSwitcher />
            <div className="text-right">
              <p className="text-xs text-gray-400">Fecha de corte</p>
              <p className="text-sm font-semibold text-navy tabular-nums">{data.fechaCorte}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Demo banner */}
        {data.isDemo && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-700">
            <span className="font-bold">Demo</span> — Datos de ejemplo. Crea un proyecto y carga un archivo Excel para datos reales.
          </div>
        )}

        <KpiCards partidas={data.partidas} fechaCorte={data.fechaCorte} />

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <nav className="flex border-b border-gray-100">
            {([
              { id: 'tabla',     label: 'Tabla de Control' },
              { id: 'familias',  label: 'Gráficos por Familia' },
              { id: 'top5',      label: 'Top 5 Sobrecosto' },
              { id: 'directorio', label: 'Directorio' },
            ] as { id: Tab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-5 py-3 text-sm font-medium transition-all relative
                  ${tab === t.id
                    ? 'text-navy after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent'
                    : 'text-gray-400 hover:text-navy'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="p-5">
            {tab === 'tabla'    && <TablaControl partidas={data.partidas} movimientos={data.movimientos} detallePartidas={data.detallePartidas} familias={data.familias} />}
            {tab === 'familias' && <FamiliaCharts partidas={data.partidas} sinPartida={data.sinPartida} familias={data.familias} />}
            {tab === 'top5'      && <Top5Chart partidas={data.partidas} />}
            {tab === 'directorio' && <DirectorioReport />}
          </div>
        </div>

        {/* Sin Partida Presupuestaria */}
        {(data.sinPartida.length > 0 || data.sinPartidaEnriquecido.length > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <SinPartidaPanel sinPartida={data.sinPartida} sinPartidaEnriquecido={data.sinPartidaEnriquecido} />
          </div>
        )}

        {/* Footer */}
        <footer className="text-center py-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-300 tracking-wide">
            ICEMM · {data.projectName} · Informe de Resultado de Obra · Corte {data.fechaCorte}
          </p>
          <button
            onClick={() => setShowAdmin(true)}
            className="text-[10px] text-gray-300 hover:text-teal-muted transition-colors mt-1"
          >
            Plan de Cuentas
          </button>
        </footer>
      </div>
    </div>
    </AuthGate>
  )
}
