import { useState } from 'react'
import { AlertTriangle, FileDown } from 'lucide-react'
import { useProjectsStore, type FichaObra } from '../projects/ProjectsStore'
import { TIPOS_OBRA, type Proyecto, type TipoObra } from '../projects/types'
import { fichaConocida, tipoValido } from './datos/fichasConocidas'

interface Props {
  proyecto: Proyecto
  onListo?: () => void
}

/**
 * Captura de la ficha de obra. Son los datos que el predictor necesita y que
 * no están en ningún archivo: tipo, superficie, plazo y monto de contrato.
 */
export default function FichaObraForm({ proyecto, onListo }: Props) {
  const actualizarFicha = useProjectsStore(s => s.actualizarFicha)
  const [tipoObra, setTipoObra] = useState<TipoObra | ''>(proyecto.tipoObra ?? '')
  const [m2, setM2] = useState(proyecto.m2?.toString() ?? '')
  const [plazo, setPlazo] = useState(proyecto.plazoMeses?.toString() ?? '')
  const [contrato, setContrato] = useState(proyecto.montoContratoUF?.toString() ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ficha que EMM ya entregó en el consolidado, si esta obra es una de las 9.
  const emm = fichaConocida(proyecto.nombre)
  const aplicarEmm = () => {
    if (!emm) return
    if (tipoValido(emm.tipo)) setTipoObra(emm.tipo)
    setM2(emm.m2.toString())
    setPlazo(emm.plazoMeses.toString())
    setContrato(emm.montoContratoUF.toString())
    setError(null)
  }
  // Solo se ofrece si aporta algo: si los cuatro campos ya coinciden, no.
  const emmAportaAlgo =
    !!emm &&
    (tipoObra !== emm.tipo ||
      parseFloat(m2) !== emm.m2 ||
      parseInt(plazo, 10) !== emm.plazoMeses ||
      parseFloat(contrato) !== emm.montoContratoUF)

  const totalItemizado = proyecto.slots.presupuesto_original?.totalGeneral ?? null
  const contratoNum = parseFloat(contrato)
  const difItemizado =
    totalItemizado && Number.isFinite(contratoNum) && contratoNum > 0
      ? ((totalItemizado - contratoNum) / contratoNum) * 100
      : null

  const guardar = async () => {
    setError(null)
    const ficha: FichaObra = {
      tipoObra: tipoObra || null,
      m2: m2 ? parseFloat(m2) : null,
      plazoMeses: plazo ? parseInt(plazo, 10) : null,
      montoContratoUF: contrato ? parseFloat(contrato) : null,
    }
    if (ficha.m2 != null && !(ficha.m2 > 0)) return setError('La superficie debe ser mayor que 0.')
    if (ficha.plazoMeses != null && !(ficha.plazoMeses > 0)) return setError('El plazo debe ser mayor que 0.')
    if (ficha.montoContratoUF != null && !(ficha.montoContratoUF > 0)) return setError('El monto de contrato debe ser mayor que 0.')

    setGuardando(true)
    try {
      await actualizarFicha(proyecto.id, ficha)
      onListo?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la ficha.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-tinta font-slab">Ficha de obra</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {emm
            ? 'El predictor necesita estos cuatro datos. EMM ya los entregó para esta obra en el consolidado.'
            : 'El predictor necesita estos cuatro datos y no están en ningún archivo cargado.'}
        </p>
      </div>

      {emm && (
        <div className="bg-teal-muted/5 border border-teal-muted/25 rounded-lg px-3 py-2.5 space-y-2">
          <div className="flex items-start gap-2">
            <FileDown className="h-3.5 w-3.5 text-teal-muted flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-tinta">
                Ficha de EMM · {emm.nombre}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {emm.comuna} · {emm.anios} · {emm.unidades} unidades
                {emm.enModelo
                  ? ' · aporta curva al modelo'
                  : ' · es la obra proyectada, no aporta curva'}
              </p>
            </div>
            {emmAportaAlgo && (
              <button
                type="button"
                onClick={aplicarEmm}
                className="flex-shrink-0 px-2.5 py-1 text-[11px] font-medium text-tinta border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                Usar estos datos
              </button>
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
            {([
              ['Tipo', emm.tipo],
              ['m²', emm.m2.toLocaleString('es-CL', { maximumFractionDigits: 2 })],
              ['Plazo', `${emm.plazoMeses} meses`],
              ['Contrato', `UF ${emm.montoContratoUF.toLocaleString('es-CL', { maximumFractionDigits: 2 })}`],
            ] as const).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-gray-400 uppercase tracking-wider text-[9px]">{k}</dt>
                <dd className="text-tinta tabular-nums truncate" title={v}>{v}</dd>
              </div>
            ))}
          </dl>

          {emm.obs && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Nota de EMM sobre el contrato: <strong>{emm.obs}</strong>
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">Tipo de obra</span>
          <select
            value={tipoObra}
            onChange={e => setTipoObra(e.target.value as TipoObra | '')}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-panel focus:outline-none focus:ring-2 focus:ring-teal-muted/30"
          >
            <option value="">Seleccioná…</option>
            {TIPOS_OBRA.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">Superficie construida (m²)</span>
          <input
            type="number" min="1" step="0.01" value={m2} onChange={e => setM2(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30 tabular-nums"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">Plazo contractual (meses)</span>
          <input
            type="number" min="1" step="1" value={plazo} onChange={e => setPlazo(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30 tabular-nums"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider block mb-1">Monto de contrato (UF)</span>
          <input
            type="number" min="1" step="0.01" value={contrato} onChange={e => setContrato(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30 tabular-nums"
          />
          <span className="block text-[10px] text-gray-400 mt-1">
            No es el total del itemizado.
            {difItemizado !== null && (
              <> El presupuesto inicial cargado difiere un{' '}
                <strong className={Math.abs(difItemizado) > 5 ? 'text-accent' : 'text-gray-500'}>
                  {difItemizado >= 0 ? '+' : ''}{difItemizado.toFixed(2)}%
                </strong>.
              </>
            )}
          </span>
        </label>
      </div>

      <button
        onClick={guardar}
        disabled={guardando}
        className="px-4 py-2 bg-cabecera text-white text-sm font-medium rounded-lg hover:bg-cabecera-alt transition-colors disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar ficha'}
      </button>
    </div>
  )
}
