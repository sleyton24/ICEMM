import { useState } from 'react'
import { useDashboardData } from './data/dataAdapter'
import { useProjectsStore } from './features/projects/ProjectsStore'
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
import AdminUsersPage from './features/auth/AdminUsersPage'
import InformeSelector from './features/informes/InformeSelector'
import { useCurrentUser } from './features/auth/useCurrentUser'

type Tab = 'tabla' | 'familias' | 'top5' | 'directorio'

export default function App() {
  const [tab, setTab] = useState<Tab>('tabla')
  const [showAdmin, setShowAdmin] = useState(false)
  const [showUsersAdmin, setShowUsersAdmin] = useState(false)
  const data = useDashboardData()
  const { user, esAdmin } = useCurrentUser()
  const projects = useProjectsStore(s => s.projects)
  const projectsError = useProjectsStore(s => s.error)
  const projectsLoading = useProjectsStore(s => s.loading)
  const [showDebug, setShowDebug] = useState(false)

  if (showAdmin) {
    return <AuthGate><AdminPlanCuentasPage onBack={() => setShowAdmin(false)} /></AuthGate>
  }
  if (showUsersAdmin) {
    return <AuthGate><AdminUsersPage onBack={() => setShowUsersAdmin(false)} /></AuthGate>
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
          <div className="flex items-center gap-3">
            <InformeSelector esAdmin={esAdmin} />
            <CutoffMesFilter />
            <ProjectSwitcher />
            <div className="text-right">
              <p className="text-xs text-gray-400">Fecha de corte</p>
              <p className="text-sm font-semibold text-navy tabular-nums">{data.fechaCorte}</p>
            </div>
            {user && (
              <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
                <div className="text-right">
                  <p className="text-[11px] text-gray-400">{user.nombre}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    user.rol === 'admin' ? 'bg-navy text-white' :
                    user.rol === 'editor' ? 'bg-teal-light text-navy' :
                    'bg-gray-100 text-gray-500'
                  }`}>{user.rol}</span>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem('icemm.mock.user')
                    localStorage.removeItem('icemm.auth.token')
                    window.location.reload()
                  }}
                  className="text-[10px] text-gray-400 hover:text-accent transition-colors"
                  title="Cerrar sesión"
                >
                  Salir
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Debug panel — toggleable */}
        <div className="bg-gray-900 text-gray-100 rounded-lg overflow-hidden text-xs font-mono">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="w-full px-4 py-2 text-left text-gray-400 hover:bg-gray-800 transition-colors flex items-center justify-between"
          >
            <span>🔍 Debug — click para ver estado de sesión y proyectos</span>
            <span>{showDebug ? '▼' : '▶'}</span>
          </button>
          {showDebug && (
            <div className="px-4 py-3 space-y-2 border-t border-gray-700">
              <div className="grid grid-cols-2 gap-x-4">
                <div>
                  <span className="text-gray-400">User logueado:</span>{' '}
                  {user ? `${user.email} (${user.rol})` : <span className="text-red-400">NO HAY USER</span>}
                </div>
                <div>
                  <span className="text-gray-400">esAdmin:</span>{' '}
                  <span className={esAdmin ? 'text-emerald-400' : 'text-red-400'}>{String(esAdmin)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Proyectos cargados:</span>{' '}
                  <span className={projects.length > 0 ? 'text-emerald-400' : 'text-amber-400'}>{projects.length}</span>
                </div>
                <div>
                  <span className="text-gray-400">Loading:</span>{' '}
                  {String(projectsLoading)}
                </div>
              </div>
              {projectsError && (
                <div className="bg-red-900/50 border border-red-700 rounded px-2 py-1 text-red-200">
                  ❌ Error: {projectsError}
                </div>
              )}
              {projects.length > 0 && (
                <div className="text-gray-300">
                  <span className="text-gray-400">IDs:</span>{' '}
                  {projects.map(p => `${p.nombre} (${p.id.slice(0, 8)})`).join(' · ')}
                </div>
              )}
              <div className="text-gray-400">
                Token: {localStorage.getItem('icemm.auth.token') ? '✓ presente' : '✗ NO HAY TOKEN'}
                {' · '}
                ActiveProjectId: {localStorage.getItem('icemm.activeProjectId') || '(ninguno)'}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { localStorage.clear(); location.reload() }}
                  className="text-[10px] px-2 py-1 bg-red-900/50 hover:bg-red-900 rounded text-red-200"
                >
                  Limpiar localStorage y recargar
                </button>
                <button
                  onClick={() => useProjectsStore.getState().fetchProjects()}
                  className="text-[10px] px-2 py-1 bg-blue-900/50 hover:bg-blue-900 rounded text-blue-200"
                >
                  Reintentar fetch proyectos
                </button>
              </div>
            </div>
          )}
        </div>

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
            {tab === 'tabla'    && <TablaControl partidas={data.partidas} movimientos={data.movimientos} detallePartidas={data.detallePartidas} familias={data.familias} proyeccionAnteriorPorCodigo={data.proyeccionAnteriorPorCodigo} esVistaAprobada={data.esVistaAprobada} numeroInforme={data.numeroInforme} />}
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
          {esAdmin && (
            <div className="flex justify-center gap-3 mt-1">
              <button
                onClick={() => setShowAdmin(true)}
                className="text-[10px] text-gray-300 hover:text-teal-muted transition-colors"
              >
                Plan de Cuentas
              </button>
              <span className="text-[10px] text-gray-200">·</span>
              <button
                onClick={() => setShowUsersAdmin(true)}
                className="text-[10px] text-gray-300 hover:text-teal-muted transition-colors"
              >
                Usuarios
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
    </AuthGate>
  )
}
