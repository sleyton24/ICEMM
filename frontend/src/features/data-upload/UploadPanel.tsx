import { useState, useCallback, useRef } from 'react'
import { FileSpreadsheet, X, Check, AlertTriangle, Database } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useProjectsStore } from '../projects/ProjectsStore'
import { parseItemizado } from './parser/parseItemizado'
import { inspeccionarERP, parsearERP, type UnidadNegocio, type GastoRealAgregado } from './parser/parseRealERP'
import UploadPreviewModal from './UploadPreviewModal'
import type { Proyecto, ParseResult, ArchivoCargado, CargaERP } from '../projects/types'

const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type ItemizadoSlot = 'presupuesto_original' | 'presupuesto_redistribuido' | 'ppto_horas_extra' | 'proyectado'

const ITEMIZADO_SLOTS: { key: ItemizadoSlot; label: string; description: string }[] = [
  { key: 'presupuesto_original', label: 'Presupuesto Original', description: 'Itemizado inicial del proyecto' },
  { key: 'presupuesto_redistribuido', label: 'Presupuesto Redistribuido', description: 'Valores ajustados tras reasignación' },
  { key: 'ppto_horas_extra', label: 'Ppto Horas Extra', description: 'Presupuesto adicional por horas extra' },
  { key: 'proyectado', label: 'Proyectado', description: 'Proyección al cierre del proyecto' },
]

interface Props {
  proyecto: Proyecto
  onClose: () => void
}

export default function UploadPanel({ proyecto, onClose }: Props) {
  const { uploadSlot, uploadERPSlot, clearSlot } = useProjectsStore()

  // Itemizado preview state
  const [preview, setPreview] = useState<{ result: ParseResult; slot: ItemizadoSlot; fileName: string } | null>(null)
  const [parsing, setParsing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ERP flow state
  const [erpWorkbook, setErpWorkbook] = useState<{ wb: XLSX.WorkBook; fileName: string } | null>(null)
  const [erpUnidades, setErpUnidades] = useState<UnidadNegocio[] | null>(null)
  const [erpPreview, setErpPreview] = useState<GastoRealAgregado | null>(null)
  const [selectedUnidad, setSelectedUnidad] = useState<number | null>(null)

  // ── Itemizado handler ──────────────────────────────────────────────────────
  const handleItemizadoFile = useCallback(async (file: File, slot: ItemizadoSlot) => {
    setError(null)
    setParsing(slot)
    try {
      const buffer = await file.arrayBuffer()
      const result = parseItemizado(buffer)
      setParsing(null)
      setPreview({ result, slot, fileName: file.name })
    } catch (e: any) {
      setParsing(null)
      setError(`Error al parsear "${file.name}": ${e.message}`)
    }
  }, [])

  const confirmItemizado = useCallback(() => {
    if (!preview) return
    const { result, slot } = preview
    const data: ArchivoCargado = {
      nombreArchivo: preview.fileName,
      fechaCarga: new Date().toISOString(),
      partidas: result.partidas,
      subtotalesFamilia: result.subtotalesFamilia,
      totalGeneral: result.totalGeneral,
    }
    uploadSlot(proyecto.id, slot, data)
    setPreview(null)
  }, [preview, proyecto.id, uploadSlot])

  // ── ERP handler ────────────────────────────────────────────────────────────
  const handleERPFile = useCallback(async (file: File) => {
    setError(null)
    setParsing('gasto_real_erp')
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const { unidades } = inspeccionarERP(wb)

      setParsing(null)

      if (unidades.length === 0) {
        setError('El archivo no contiene datos con unidad de negocio válida.')
        return
      }

      setErpWorkbook({ wb, fileName: file.name })

      if (unidades.length === 1) {
        // Auto-select single unit → go straight to preview
        const result = parsearERP(wb, unidades[0].codigo)
        setErpPreview(result)
        setSelectedUnidad(unidades[0].codigo)
        setErpUnidades(null) // skip selection modal
      } else {
        // Multiple units → show selection modal
        setErpUnidades(unidades)
        // Pre-select if project already has a saved unit
        setSelectedUnidad(proyecto.unidadNegocioCodigo ?? null)
      }
    } catch (e: any) {
      setParsing(null)
      setError(`Error al parsear "${file.name}": ${e.message}`)
    }
  }, [proyecto.unidadNegocioCodigo])

  const confirmUnidadSelection = useCallback(() => {
    if (!erpWorkbook || selectedUnidad === null) return
    try {
      const result = parsearERP(erpWorkbook.wb, selectedUnidad)
      setErpPreview(result)
      setErpUnidades(null)
    } catch (e: any) {
      setError(`Error al filtrar unidad de negocio: ${e.message}`)
      setErpUnidades(null)
    }
  }, [erpWorkbook, selectedUnidad])

  const confirmERP = useCallback(() => {
    if (!erpPreview || !erpWorkbook) return

    // Build aggregated data for storage (without the full workbook)
    const agregadoPorCcosto: Record<number, { monto_uf: number; num_tx: number }> = {}
    const agregadoPorCcostoPorMes: Record<number, Record<string, { monto_uf: number; num_tx: number }>> = {}
    const transaccionesPorCcosto: Record<number, any[]> = {}
    for (const [cc, data] of Object.entries(erpPreview.porCentroCosto)) {
      agregadoPorCcosto[Number(cc)] = { monto_uf: data.monto_uf, num_tx: data.num_transacciones }
      agregadoPorCcostoPorMes[Number(cc)] = data.porMes
      transaccionesPorCcosto[Number(cc)] = data.transacciones
    }

    const data: CargaERP = {
      fechaCarga: new Date().toISOString(),
      nombreArchivo: erpWorkbook.fileName,
      unidadNegocioCodigo: erpPreview.unidadNegocio.codigo,
      unidadNegocioDescripcion: erpPreview.unidadNegocio.descripcion,
      totalUF: erpPreview.total_uf,
      numTransacciones: erpPreview.unidadNegocio.num_filas,
      rangoFechas: {
        desde: erpPreview.rango_fechas.desde.toISOString(),
        hasta: erpPreview.rango_fechas.hasta.toISOString(),
      },
      agregadoPorCcosto,
      agregadoPorCcostoPorMes,
      mesesDisponibles: erpPreview.mesesDisponibles,
      transaccionesPorCcosto,
    }

    uploadERPSlot(proyecto.id, data)
    setErpPreview(null)
    setErpWorkbook(null)
  }, [erpPreview, erpWorkbook, proyecto.id, uploadERPSlot])

  // ── Compute warnings for ERP preview ───────────────────────────────────────
  const erpWarnings: string[] = []
  if (erpPreview && proyecto.slots.presupuesto_original) {
    const budgetCodes = new Set<number>()
    for (const p of proyecto.slots.presupuesto_original.partidas) {
      const cc = typeof p.codigo2 === 'number' ? p.codigo2 : parseInt(String(p.codigo2), 10)
      if (!isNaN(cc)) budgetCodes.add(cc)
    }
    const sinMatch: { cc: number; uf: number }[] = []
    for (const [ccStr, data] of Object.entries(erpPreview?.porCentroCosto ?? {})) {
      const cc = Number(ccStr)
      if (!budgetCodes.has(cc)) {
        sinMatch.push({ cc, uf: data.monto_uf })
      }
    }
    if (sinMatch.length > 0) {
      const totalSinMatch = sinMatch.reduce((s, x) => s + x.uf, 0)
      erpWarnings.push(
        `${sinMatch.length} concepto(s) sin partida presupuestaria (${sinMatch.map(x => x.cc).join(', ')}), ` +
        `totalizando ${uf2(totalSinMatch)} UF → aparecerán en "Sin partida presupuestaria".`
      )
    }
  }

  const erpLoaded = proyecto.slots.gasto_real_erp

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col border border-gray-100" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] text-teal-muted font-medium uppercase tracking-wider">Carga de archivos</p>
            <h3 className="text-lg font-bold text-navy font-slab">{proyecto.nombre}</h3>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-2xl leading-none transition-colors">&times;</button>
        </div>

        {/* Slots */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {/* Itemizado slots */}
          {ITEMIZADO_SLOTS.map(({ key, label, description }) => {
            const loaded = proyecto.slots[key]
            const isParsing = parsing === key
            return (
              <SlotDropZone
                key={key}
                label={label}
                description={description}
                loaded={loaded ? { nombreArchivo: loaded.nombreArchivo, detalle: `${loaded.partidas.length} partidas · UF ${uf2(loaded.totalGeneral)}`, fechaCarga: loaded.fechaCarga } : null}
                isParsing={isParsing}
                onFile={file => handleItemizadoFile(file, key)}
                onClear={() => clearSlot(proyecto.id, key)}
              />
            )
          })}

          {/* ERP slot */}
          <ERPSlotZone
            loaded={erpLoaded}
            isParsing={parsing === 'gasto_real_erp'}
            onFile={handleERPFile}
            onClear={() => clearSlot(proyecto.id, 'gasto_real_erp')}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-light transition-colors">
            Cerrar
          </button>
        </div>
      </div>

      {/* Itemizado preview modal */}
      {preview && (
        <UploadPreviewModal
          result={preview.result}
          slotLabel={ITEMIZADO_SLOTS.find(s => s.key === preview.slot)!.label}
          onConfirm={confirmItemizado}
          onCancel={() => setPreview(null)}
        />
      )}

      {/* ERP: Unit selection modal */}
      {erpUnidades && (
        <UnidadSelectionModal
          unidades={erpUnidades}
          projectName={proyecto.nombre}
          selected={selectedUnidad}
          onSelect={setSelectedUnidad}
          onConfirm={confirmUnidadSelection}
          onCancel={() => { setErpUnidades(null); setErpWorkbook(null) }}
        />
      )}

      {/* ERP: Preview modal */}
      {erpPreview && (
        <ERPPreviewModal
          data={erpPreview}
          warnings={[...erpPreview.warnings, ...erpWarnings]}
          onConfirm={confirmERP}
          onCancel={() => { setErpPreview(null); setErpWorkbook(null) }}
        />
      )}
    </div>
  )
}


// ── Slot components ──────────────────────────────────────────────────────────

function SlotDropZone({ label, description, loaded, isParsing, onFile, onClear }: {
  label: string
  description: string
  loaded: { nombreArchivo: string; detalle: string; fechaCarga: string } | null
  isParsing: boolean
  onFile: (file: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  if (loaded) {
    return (
      <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Check className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-navy">{label}</p>
            <p className="text-[11px] text-gray-400">{loaded.nombreArchivo} · {loaded.detalle}</p>
            <p className="text-[10px] text-gray-300">{new Date(loaded.fechaCarga).toLocaleString('es-CL')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => inputRef.current?.click()} className="text-[11px] px-3 py-1.5 text-teal-muted hover:text-navy font-medium border border-gray-200 rounded-lg hover:bg-surface transition-colors">
            Reemplazar
          </button>
          <button onClick={onClear} className="text-[11px] px-3 py-1.5 text-gray-400 hover:text-accent font-medium border border-gray-200 rounded-lg hover:bg-red-50 transition-colors">
            Quitar
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleChange} />
      </div>
    )
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !isParsing && inputRef.current?.click()}
      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all
        ${dragOver ? 'border-navy bg-teal-light/20' : 'border-gray-200 hover:border-teal-muted hover:bg-surface'}
        ${isParsing ? 'pointer-events-none opacity-60' : ''}`}
    >
      {isParsing ? (
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-teal-muted border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-teal-muted font-medium">Procesando archivo...</span>
        </div>
      ) : (
        <>
          <div className="p-3 bg-surface rounded-xl mb-3">
            <FileSpreadsheet className="h-6 w-6 text-teal-muted" />
          </div>
          <p className="text-sm font-medium text-navy">{label}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>
          <p className="text-[10px] text-gray-300 mt-2">Arrastra un .xls o .xlsx aquí, o haz clic para seleccionar</p>
        </>
      )}
      <input ref={inputRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleChange} />
    </div>
  )
}


function ERPSlotZone({ loaded, isParsing, onFile, onClear }: {
  loaded: CargaERP | null
  isParsing: boolean
  onFile: (file: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  if (loaded) {
    return (
      <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Database className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-navy">Gasto Real (ERP)</p>
            <p className="text-[11px] text-gray-400">
              {loaded.nombreArchivo} · {loaded.unidadNegocioDescripcion} · {loaded.numTransacciones.toLocaleString('es-CL')} tx · UF {uf2(loaded.totalUF)}
            </p>
            <p className="text-[10px] text-gray-300">{new Date(loaded.fechaCarga).toLocaleString('es-CL')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => inputRef.current?.click()} className="text-[11px] px-3 py-1.5 text-teal-muted hover:text-navy font-medium border border-gray-200 rounded-lg hover:bg-surface transition-colors">
            Reemplazar
          </button>
          <button onClick={onClear} className="text-[11px] px-3 py-1.5 text-gray-400 hover:text-accent font-medium border border-gray-200 rounded-lg hover:bg-red-50 transition-colors">
            Quitar
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleChange} />
      </div>
    )
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !isParsing && inputRef.current?.click()}
      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all
        ${dragOver ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/10'}
        ${isParsing ? 'pointer-events-none opacity-60' : ''}`}
    >
      {isParsing ? (
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-blue-500 font-medium">Procesando export ERP...</span>
        </div>
      ) : (
        <>
          <div className="p-3 bg-blue-50 rounded-xl mb-3">
            <Database className="h-6 w-6 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-navy">Gasto Real (ERP)</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Export SQL del sistema contable</p>
          <p className="text-[10px] text-gray-300 mt-2">Arrastra un .xls o .xlsx aquí, o haz clic para seleccionar</p>
        </>
      )}
      <input ref={inputRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleChange} />
    </div>
  )
}


// ── Unidad de Negocio Selection Modal ────────────────────────────────────────

function UnidadSelectionModal({ unidades, projectName, selected, onSelect, onConfirm, onCancel }: {
  unidades: UnidadNegocio[]
  projectName: string
  selected: number | null
  onSelect: (codigo: number) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full flex flex-col border border-gray-100" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-[11px] text-blue-500 font-medium uppercase tracking-wider">Gasto Real (ERP)</p>
          <h3 className="text-lg font-bold text-navy font-slab">Seleccionar Unidad de Negocio</h3>
          <p className="text-xs text-gray-400 mt-1">
            El archivo contiene {unidades.length} unidades de negocio. ¿Cuál corresponde al proyecto "{projectName}"?
          </p>
        </div>

        <div className="p-6 space-y-2">
          {unidades.map(u => (
            <label
              key={u.codigo}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all
                ${selected === u.codigo
                  ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'}`}
              onClick={() => onSelect(u.codigo)}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                ${selected === u.codigo ? 'border-blue-500' : 'border-gray-300'}`}>
                {selected === u.codigo && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-navy">
                  {String(u.codigo).padStart(2, '0')} — {u.descripcion}
                </p>
                <p className="text-[11px] text-gray-400">
                  {u.num_filas.toLocaleString('es-CL')} filas · UF {uf2(u.total_uf)}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={selected === null}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  )
}


// ── ERP Preview Modal ────────────────────────────────────────────────────────

function ERPPreviewModal({ data, warnings, onConfirm, onCancel }: {
  data: GastoRealAgregado
  warnings: string[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const conceptos = Object.values(data.porCentroCosto)
    .sort((a, b) => Math.abs(b.monto_uf) - Math.abs(a.monto_uf))

  const filasEnCero = Object.values(data.porCentroCosto)
    .filter(c => c.monto_uf === 0).length

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-gray-100" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-[11px] text-blue-500 font-medium uppercase tracking-wider">Gasto Real (ERP)</p>
          <h3 className="text-lg font-bold text-navy font-slab">Preview de carga</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {data.unidadNegocio.descripcion} (Unidad {String(data.unidadNegocio.codigo).padStart(2, '0')})
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Gasto Real</p>
              <p className="text-lg font-bold text-navy">UF {uf2(data.total_uf)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Transacciones</p>
              <p className="text-xl font-bold text-navy">{data.unidadNegocio.num_filas.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Conceptos únicos</p>
              <p className="text-xl font-bold text-navy">{conceptos.length}</p>
            </div>
          </div>

          {filasEnCero > 0 && (
            <p className="text-[11px] text-gray-400">
              {filasEnCero} concepto(s) con monto UF = 0 (provisiones/documentos internos sin monto).
            </p>
          )}

          {/* Top 10 conceptos */}
          <div>
            <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider mb-2">Top 10 conceptos por monto</p>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy">
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-white/80 uppercase tracking-wider">Concepto</th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-white/80 uppercase tracking-wider">Transacciones</th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-white/80 uppercase tracking-wider">Monto UF</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-white/80 uppercase tracking-wider">Top Proveedor</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {conceptos.slice(0, 10).map((c, i) => (
                    <tr key={c.concepto_codigo} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                      <td className="px-3 py-2 font-mono font-semibold text-navy">{c.concepto_codigo}</td>
                      <td className="px-3 py-2 text-gray-500 tabular-nums text-right">{c.num_transacciones}</td>
                      <td className="px-3 py-2 text-navy font-medium tabular-nums text-right">{uf2(c.monto_uf)}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-40">
                        {c.proveedores_top[0]?.razon_social ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-right text-[11px] font-bold text-gray-500 uppercase">Total</td>
                    <td className="px-3 py-2 text-right font-bold text-navy tabular-nums">{uf2(data.total_uf)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {conceptos.length > 10 && (
              <p className="text-[11px] text-gray-300 mt-1">...y {conceptos.length - 10} conceptos más</p>
            )}
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-2">Advertencias ({warnings.length})</p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700">{w}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            Confirmar carga
          </button>
        </div>
      </div>
    </div>
  )
}
