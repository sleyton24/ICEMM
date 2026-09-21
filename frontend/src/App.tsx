import { useState } from 'react'
import { useDashboardData } from './data/dataAdapter'
import KpiCards from './components/KpiCards'
import TablaControl from './components/TablaControl'
import Top5Chart from './components/Top5Chart'
import FamiliaCharts from './components/FamiliaCharts'
import SinPartidaPanel from './components/SinPartidaPanel'
import DirectorioReport from './components/DirectorioReport'
import PrediccionPanel from './features/prediccion/PrediccionPanel'
import ProjectSwitcher from './features/projects/ProjectSwitcher'
import AdminPlanCuentasPage from './features/plan-cuentas/AdminPlanCuentasPage'
import CutoffMesFilter from './features/projects/CutoffMesFilter'
import AuthGate from './features/auth/AuthGate'
import AdminUsersPage from './features/auth/AdminUsersPage'
import InformeSelector from './features/informes/InformeSelector'
import { useCurrentUser } from './features/auth/useCurrentUser'
import { esDemoMode, salirDemo } from './features/demo/demoMode'
import TemaToggle from './features/tema/TemaToggle'
import { useTemaStore } from './features/tema/TemaStore'

type Tab = 'tabla' | 'familias' | 'top5' | 'prediccion' | 'directorio'

/**
 * Pestañas del dashboard. `soloAdmin` esconde la pestaña del resto de los
 * perfiles — es una restricción de interfaz, no de autorización: los datos que
 * usa el módulo son los mismos que ya ve cualquiera con acceso al proyecto.
 */
const TABS: { id: Tab; label: string; soloAdmin?: boolean }[] = [
  { id: 'tabla',      label: 'Tabla de Control' },
  { id: 'familias',   label: 'Gráficos por Familia' },
  { id: 'top5',       label: 'Top 5 Sobrecosto' },
  { id: 'prediccion', label: 'Proyección de Curva', soloAdmin: true },
  { id: 'directorio', label: 'Directorio' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('tabla')
  const [showAdmin, setShowAdmin] = useState(false)
  const [showUsersAdmin, setShowUsersAdmin] = useState(false)
  const data = useDashboardData()
  const { user, esAdmin, esDirector } = useCurrentUser()
  const demo = esDemoMode()
  // El logo es tinta oscura + magenta sobre transparente: sobre fondo oscuro
  // desaparece. La variante clara conserva el magenta de marca.
  const temaOscuro = useTemaStore(s => s.tema) === 'oscuro'

  // Pestaña efectiva: si el perfil no tiene acceso a la que está abierta (rol
  // cambiado, sesión vieja), se muestra la primera en vez de un panel en blanco.
  // Se deriva en vez de corregir el estado, para no hacer setState en render.
  const tabActiva: Tab = TABS.some(t => t.id === tab && (!t.soloAdmin || esAdmin)) ? tab : 'tabla'

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
      <div className="h-1 bg-gradient-to-r from-cabecera via-teal to-accent" />

      {/* Header */}
      <header className="bg-panel border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={temaOscuro ? "/icemm-logo-oscuro.png" : "/icemm-logo.png"} alt="ICEMM" className="h-10 object-contain" />
            <div className="border-l border-gray-200 pl-4">
              <p className="text-[11px] font-medium text-teal-muted uppercase tracking-widest">Informe de Resultado de Obra</p>
              <p className="text-sm font-semibold text-tinta">{data.projectName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <InformeSelector esAdmin={esAdmin} esDirector={esDirector} />
            <CutoffMesFilter />
            <ProjectSwitcher />
            <TemaToggle />
            <div className="text-right">
              <p className="text-xs text-gray-400">Fecha de corte</p>
              <p className="text-sm font-semibold text-tinta tabular-nums">{data.fechaCorte}</p>
            </div>
            {user && (
              <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
                <div className="text-right">
                  <p className="text-[11px] text-gray-400">{user.nombre}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    user.rol === 'admin' ? 'bg-cabecera text-white' :
                    user.rol === 'editor' ? 'bg-teal-light text-tinta' :
                    user.rol === 'director' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{user.rol}</span>
                </div>
                <button
                  onClick={() => {
                    if (demo) { salirDemo(); return }
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

        {/* Demo banner */}
        {data.isDemo && (
          <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-700">
            <span className="font-bold uppercase tracking-wider">Modo demo</span>
            <span>
              Datos de ejemplo generados en el navegador — <strong>no</strong> son cifras reales de ninguna obra.
              No hay conexión al backend: cargar archivos y guardar comentarios no va a funcionar.
            </span>
            <button onClick={salirDemo} className="ml-auto font-medium underline hover:text-amber-900 transition-colors">
              Salir de la demo
            </button>
          </div>
        )}

        <KpiCards partidas={data.partidas} fechaCorte={data.fechaCorte} />

        {/* Tabs */}
        <div className="bg-panel rounded-xl border border-gray-200 shadow-sm">
          <nav className="flex border-b border-gray-100">
            {TABS.filter(t => !t.soloAdmin || esAdmin).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-5 py-3 text-sm font-medium transition-all relative
                  ${tabActiva === t.id
                    ? 'text-tinta after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent'
                    : 'text-gray-400 hover:text-tinta'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="p-5">
            {tabActiva === 'tabla'    && <TablaControl partidas={data.partidas} movimientos={data.movimientos} detallePartidas={data.detallePartidas} familias={data.familias} proyeccionAnteriorPorCodigo={data.proyeccionAnteriorPorCodigo} variacionAnteriorPorCodigo={data.variacionAnteriorPorCodigo} partidasAnteriorMeta={data.partidasAnteriorMeta} esVistaAprobada={data.esVistaAprobada} numeroInforme={data.numeroInforme} />}
            {tabActiva === 'familias' && <FamiliaCharts partidas={data.partidas} sinPartida={data.sinPartida} familias={data.familias} />}
            {tabActiva === 'top5'      && <Top5Chart partidas={data.partidas} />}
            {tabActiva === 'prediccion' && <PrediccionPanel />}
            {tabActiva === 'directorio' && <DirectorioReport />}
          </div>
        </div>

        {/* Sin Partida Presupuestaria */}
        {(data.sinPartida.length > 0 || data.sinPartidaEnriquecido.length > 0) && (
          <div className="bg-panel rounded-xl border border-gray-200 shadow-sm p-5">
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
