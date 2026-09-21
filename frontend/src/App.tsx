import { useState } from 'react'
import { Upload } from 'lucide-react'
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
import UploadPanel from './features/data-upload/UploadPanel'
import { useCurrentUser } from './features/auth/useCurrentUser'
import { useProjectsStore } from './features/projects/ProjectsStore'
import { esDemoMode, salirDemo } from './features/demo/demoMode'
import TemaToggle from './features/tema/TemaToggle'
import { useTemaStore } from './features/tema/TemaStore'

type Seccion = 'costos' | 'familias' | 'top5' | 'prediccion' | 'directorio'

/**
 * Secciones de la barra superior.
 *
 * `soloAdmin` esconde la sección del resto de los perfiles — es una
 * restricción de interfaz, no de autorización: los datos que usa el módulo son
 * los mismos que ya ve cualquiera con acceso al proyecto.
 */
const SECCIONES: { id: Seccion; label: string; soloAdmin?: boolean }[] = [
  { id: 'costos',     label: 'Costos' },
  { id: 'familias',   label: 'Familias' },
  { id: 'top5',       label: 'Top 5' },
  { id: 'prediccion', label: 'Proyección', soloAdmin: true },
  { id: 'directorio', label: 'Directorio' },
]

/**
 * El contenido se ensancha más que el `max-w-7xl` anterior a propósito: sacar
 * el menú lateral fue la decisión de diseño que devolvió 232 px a la tabla de
 * 174 cuentas por once columnas. Con un contenedor de 1280 px esa ganancia se
 * perdía en el camino.
 */
const ANCHO = 'max-w-[1560px] mx-auto px-8'

export default function App() {
  const [seccion, setSeccion] = useState<Seccion>('costos')
  const [showAdmin, setShowAdmin] = useState(false)
  const [showUsersAdmin, setShowUsersAdmin] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const data = useDashboardData()
  const { user, esAdmin, esDirector, puedeEditar } = useCurrentUser()
  const proyectoActivo = useProjectsStore(s => s.projects.find(p => p.id === s.activeProjectId) ?? null)
  const demo = esDemoMode()
  // El logo es tinta oscura + magenta sobre transparente: sobre fondo oscuro
  // desaparece. La variante clara conserva el magenta de marca.
  const temaOscuro = useTemaStore(s => s.tema) === 'oscuro'

  // Sección efectiva: si el perfil no tiene acceso a la que está abierta (rol
  // cambiado, sesión vieja), se muestra la primera en vez de un panel en blanco.
  // Se deriva en vez de corregir el estado, para no hacer setState en render.
  const activa: Seccion = SECCIONES.some(s => s.id === seccion && (!s.soloAdmin || esAdmin))
    ? seccion
    : 'costos'

  if (showAdmin) {
    return <AuthGate><AdminPlanCuentasPage onBack={() => setShowAdmin(false)} /></AuthGate>
  }
  if (showUsersAdmin) {
    return <AuthGate><AdminUsersPage onBack={() => setShowUsersAdmin(false)} /></AuthGate>
  }

  return (
    <AuthGate>
    <div className="min-h-screen bg-surface">
      <div className="h-1 bg-gradient-to-r from-cabecera via-teal to-accent" />

      {/* ══ Barra superior ══════════════════════════════════════════════ */}
      <header className="bg-panel border-b border-gray-200">

        {/* Fila 1 — identidad y contexto de la obra */}
        <div className={`${ANCHO} flex items-center gap-5 py-3`}>
          <img
            src={temaOscuro ? '/icemm-logo-oscuro.png' : '/icemm-logo.png'}
            alt="ICEMM"
            className="h-8 object-contain flex-shrink-0"
          />
          <div className="w-px h-7 bg-gray-200" />

          {/* La obra no es una sección más: es el contexto de todo lo demás. */}
          <ProjectSwitcher />
          <InformeSelector esAdmin={esAdmin} esDirector={esDirector} />

          <div className="flex items-center gap-4 ml-auto">
            <CutoffMesFilter />
            <div className="text-right leading-tight">
              <p className="text-[9px] text-gray-400 uppercase tracking-wider">Corte</p>
              <p className="text-xs font-medium text-tinta tabular-nums">{data.fechaCorte}</p>
            </div>
            <div className="w-px h-7 bg-gray-200" />
            <TemaToggle />
            {user && (
              <div className="flex items-center gap-2.5">
                <div className="text-right leading-tight">
                  <p className="text-[11px] font-medium text-tinta">{user.nombre}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">{user.rol}</p>
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

        {/* Fila 2 — secciones */}
        <div className={`${ANCHO} flex items-center gap-1`}>
          {SECCIONES.filter(s => !s.soloAdmin || esAdmin).map(s => {
            const esActiva = activa === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSeccion(s.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors relative
                  ${esActiva
                    ? 'text-tinta after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent'
                    : 'text-gray-500 hover:text-tinta'}`}
              >
                {s.label}
                {s.id === 'costos' && data.partidas.length > 0 && (
                  <span className="tabular-nums text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-px">
                    {data.partidas.length}
                  </span>
                )}
                {s.soloAdmin && (
                  <span className="text-[8px] tracking-wider text-teal-muted border border-gray-200 rounded px-1 py-px">
                    ADMIN
                  </span>
                )}
              </button>
            )
          })}

          {puedeEditar && proyectoActivo && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 ml-auto mb-1.5 px-3 py-2 text-xs text-gray-500 hover:text-tinta border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Cargar archivos
            </button>
          )}
        </div>
      </header>

      {/* ══ Contenido ═══════════════════════════════════════════════════ */}
      <div className={`${ANCHO} py-6 space-y-5`}>

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

        {/* El contenido va directo sobre la superficie: cada sección trae sus
            propios paneles y la tarjeta que los envolvía sumaba un borde de más. */}
        {activa === 'costos'     && <TablaControl partidas={data.partidas} movimientos={data.movimientos} detallePartidas={data.detallePartidas} familias={data.familias} proyeccionAnteriorPorCodigo={data.proyeccionAnteriorPorCodigo} variacionAnteriorPorCodigo={data.variacionAnteriorPorCodigo} partidasAnteriorMeta={data.partidasAnteriorMeta} esVistaAprobada={data.esVistaAprobada} numeroInforme={data.numeroInforme} />}
        {activa === 'familias'   && <div className="bg-panel rounded-xl border border-gray-200 p-5"><FamiliaCharts partidas={data.partidas} sinPartida={data.sinPartida} familias={data.familias} /></div>}
        {activa === 'top5'       && <div className="bg-panel rounded-xl border border-gray-200 p-5"><Top5Chart partidas={data.partidas} /></div>}
        {activa === 'prediccion' && <PrediccionPanel />}
        {activa === 'directorio' && <DirectorioReport />}

        {(data.sinPartida.length > 0 || data.sinPartidaEnriquecido.length > 0) && (
          <div className="bg-panel rounded-xl border border-gray-200 p-5">
            <SinPartidaPanel sinPartida={data.sinPartida} sinPartidaEnriquecido={data.sinPartidaEnriquecido} />
          </div>
        )}

        <footer className="text-center py-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 tracking-wide">
            ICEMM · {data.projectName} · Informe de Resultado de Obra · Corte {data.fechaCorte}
          </p>
          {esAdmin && (
            <div className="flex justify-center gap-3 mt-1">
              <button
                onClick={() => setShowAdmin(true)}
                className="text-[10px] text-gray-400 hover:text-teal-muted transition-colors"
              >
                Plan de Cuentas
              </button>
              <span className="text-[10px] text-gray-300">·</span>
              <button
                onClick={() => setShowUsersAdmin(true)}
                className="text-[10px] text-gray-400 hover:text-teal-muted transition-colors"
              >
                Usuarios
              </button>
            </div>
          )}
        </footer>
      </div>

      {showUpload && proyectoActivo && (
        <UploadPanel proyecto={proyectoActivo} onClose={() => setShowUpload(false)} />
      )}
    </div>
    </AuthGate>
  )
}
