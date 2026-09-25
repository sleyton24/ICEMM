import { usePlanCuentasStore } from '../plan-cuentas/PlanCuentasStore'
import { useEleccionesStore } from './EleccionesStore'
import type { CurvaElegida, EleccionProyeccionDTO, FuenteProyeccion } from './aplicarEleccionProyeccion'
import type { Partida } from '../../data/mockData'

const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function cuando(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

interface Props {
  partidas: Partida[]
  elecciones: EleccionProyeccionDTO[]
  projectId: string | null
  editable: boolean
}

/**
 * Por cada cuenta que ya tiene una curva llegada desde Proyección, el
 * administrador elige Presto, la curva típica o la re-anclada al real.
 * El saldo por gastar (cierre − gastado) queda al lado, en número.
 */
export default function EleccionProyeccionInforme({ partidas, elecciones, projectId, editable }: Props) {
  const plan = usePlanCuentasStore(s => s.plan)
  const elegir = useEleccionesStore(s => s.elegir)
  const pendiente = useEleccionesStore(s => s.pendiente)
  const error = useEleccionesStore(s => s.error)

  const conSugerencia = elecciones.filter(e => e.cierreTipica != null || e.cierreReanclada != null)
  if (conSugerencia.length === 0) return null

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-cabecera">
        <h2 className="text-sm font-semibold text-white font-slab">PROYECCIÓN POR CUENTA</h2>
        <p className="text-[11px] text-white/50">
          Presto es el proyectado del archivo. El modelo es la curva llevada desde Proyección.
        </p>
      </div>
      <div className="divide-y divide-gray-100 bg-panel">
        {conSugerencia.map(e => {
          const cc = Number(e.codigoCuenta)
          const nombre = plan.cuentas.find(c => c.codigo === cc)?.descripcion ?? `Cuenta ${e.codigoCuenta}`
          const deLaCuenta = partidas.filter(p => p.codigo2 === e.codigoCuenta && !p.codigo.includes('__orig'))
          const presto = deLaCuenta.reduce((s, p) => s + (p.proyeccionPresto ?? p.proyeccion), 0)
          const saldo = deLaCuenta.reduce((s, p) => s + p.ytg, 0)
          const ocupado = pendiente === `${projectId}:${e.codigoCuenta}`
          const activa = (fuente: FuenteProyeccion, curva: CurvaElegida | null) =>
            e.fuente === fuente && (fuente === 'presto' || e.curva === curva)

          const elegirEsta = (fuente: FuenteProyeccion, curva: CurvaElegida | null) => {
            if (!editable || !projectId || ocupado) return
            if (activa(fuente, curva)) return
            void elegir(projectId, e.codigoCuenta, fuente, curva)
          }

          return (
            <div key={e.codigoCuenta} className="px-5 py-3 flex flex-wrap items-center gap-4">
              <div className="min-w-40">
                <p className="text-xs font-semibold text-tinta">
                  <span className="font-mono mr-1.5">{e.codigoCuenta}</span>
                  {nombre}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {e.elegidoPor
                    ? `Eligió ${e.elegidoPor}${e.elegidoEn ? ` · ${cuando(e.elegidoEn)}` : ''}`
                    : e.pasadoPor
                      ? `Curva pasada por ${e.pasadoPor}${e.pasadoEn ? ` · ${cuando(e.pasadoEn)}` : ''}`
                      : 'Sin elección registrada'}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Opcion
                  activa={activa('presto', null)}
                  disabled={!editable || ocupado}
                  onClick={() => elegirEsta('presto', null)}
                  titulo="Presto"
                  detalle={`UF ${uf2(presto)}`}
                />
                <Opcion
                  activa={activa('modelo', 'tipica')}
                  disabled={!editable || ocupado || e.cierreTipica == null}
                  onClick={() => elegirEsta('modelo', 'tipica')}
                  titulo="Modelo · típica"
                  detalle={e.cierreTipica != null ? `UF ${uf2(e.cierreTipica)}` : 'sin cierre'}
                />
                <Opcion
                  activa={activa('modelo', 'reanclada')}
                  disabled={!editable || ocupado || e.cierreReanclada == null}
                  onClick={() => elegirEsta('modelo', 'reanclada')}
                  titulo="Modelo · re-anclada"
                  detalle={e.cierreReanclada != null ? `UF ${uf2(e.cierreReanclada)}` : 'sin real para re-anclar'}
                />
              </div>

              <div className="ml-auto text-right">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Saldo por gastar</p>
                <p className="text-lg font-bold text-tinta tabular-nums leading-tight">UF {uf2(saldo)}</p>
                <p className="text-[10px] text-gray-400">cierre proyectado − gastado</p>
              </div>
            </div>
          )
        })}
      </div>
      {error && (
        <p className="px-5 py-2 text-xs text-red-700 bg-red-50 border-t border-red-200">{error}</p>
      )}
      {!editable && (
        <p className="px-5 py-2 text-[10px] text-gray-400 border-t border-gray-100">
          La elección la cambia el administrador de la obra, en el borrador del informe.
        </p>
      )}
    </div>
  )
}

function Opcion({ activa, disabled, onClick, titulo, detalle }: {
  activa: boolean
  disabled: boolean
  onClick: () => void
  titulo: string
  detalle: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-left px-3 py-1.5 rounded-lg border text-[11px] transition-all ${
        activa
          ? 'bg-cabecera text-white border-cabecera shadow-sm'
          : 'bg-panel text-gray-600 border-gray-200 hover:border-gray-300 hover:text-tinta'
      } ${disabled && !activa ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span className="block font-medium">{titulo}</span>
      <span className={`block tabular-nums ${activa ? 'text-white/70' : 'text-gray-400'}`}>{detalle}</span>
    </button>
  )
}
