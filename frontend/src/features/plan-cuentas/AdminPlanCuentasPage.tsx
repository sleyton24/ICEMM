import { useState, useRef, useMemo } from 'react'
import { ChevronDown, ChevronRight, Upload, RotateCcw, Search, FileSpreadsheet, Check, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { usePlanCuentasStore } from './PlanCuentasStore'
import { parsePlanCuentas, validarPlanCuentas } from './parser/parsePlanCuentas'
import { parseMaestroProductos } from './parser/parseMaestroProductos'
import type { PlanCuentas, MaestroProductos } from './types'

const uf2 = (n: number) => n.toLocaleString('es-CL')

export default function AdminPlanCuentasPage({ onBack }: { onBack: () => void }) {
  const { plan, maestro, uploadPlan, uploadMaestro, restaurarBundled } = usePlanCuentasStore()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [searchProducto, setSearchProducto] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<{ plan: PlanCuentas; maestro: MaestroProductos; errors: string[] } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const toggleFamilia = (codigo: number) => {
    const next = new Set(expanded)
    if (next.has(codigo)) next.delete(codigo)
    else next.add(codigo)
    setExpanded(next)
  }

  const expandAll = () => setExpanded(new Set(plan.familias.map(f => f.codigo)))
  const collapseAll = () => setExpanded(new Set())

  // Product search
  const filteredProductos = useMemo(() => {
    if (searchProducto.length < 2) return []
    const q = searchProducto.toLowerCase()
    return maestro.productos
      .filter(p => p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q))
      .slice(0, 50)
  }, [searchProducto, maestro.productos])

  // Upload handler
  const handleFile = async (file: File) => {
    setUploadError(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const parsedPlan = parsePlanCuentas(wb)
      const errors = validarPlanCuentas(parsedPlan)

      let parsedMaestro: MaestroProductos
      try {
        parsedMaestro = parseMaestroProductos(wb)
      } catch {
        parsedMaestro = { version: parsedPlan.version, cargadoEn: parsedPlan.cargadoEn, origen: 'uploaded', productos: [] }
      }

      parsedPlan.origen = 'uploaded'
      parsedMaestro.origen = 'uploaded'

      setUploadPreview({ plan: parsedPlan, maestro: parsedMaestro, errors })
    } catch (e: any) {
      setUploadError(e.message)
    }
  }

  const confirmUpload = async () => {
    if (!uploadPreview) return
    try {
      await uploadPlan(uploadPreview.plan)
      if (uploadPreview.maestro.productos.length > 0) {
        await uploadMaestro(uploadPreview.maestro)
      }
      setUploadPreview(null)
      setShowUpload(false)
    } catch (e: any) {
      setUploadError(e.message ?? 'Error subiendo plan')
    }
  }

  const handleRestore = () => {
    if (confirm('¿Restaurar el plan de cuentas a la versión bundleada? Se perderá cualquier archivo subido.')) {
      restaurarBundled()
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="h-1 bg-gradient-to-r from-navy via-teal to-accent" />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <button onClick={onBack} className="text-xs text-teal-muted hover:text-navy transition-colors mb-1">&larr; Volver al dashboard</button>
            <h1 className="text-lg font-bold text-navy font-slab">Plan de Cuentas ICEMM</h1>
            <p className="text-[11px] text-gray-400">
              {plan.familias.length} familias · {plan.cuentas.length} cuentas · {maestro.productos.length > 0 ? `${uf2(maestro.productos.length)} productos` : 'sin maestro'}
              {' · '}
              <span className={plan.origen === 'uploaded' ? 'text-blue-500 font-medium' : 'text-gray-400'}>
                {plan.origen === 'uploaded' ? 'Subido manualmente' : 'Versión bundleada'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {plan.origen === 'uploaded' && (
              <button onClick={handleRestore} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-surface transition-colors">
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar bundleada
              </button>
            )}
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-navy rounded-lg hover:bg-navy-light transition-colors">
              <Upload className="h-3.5 w-3.5" /> Subir nueva versión
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* Plan de cuentas */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-navy font-slab">Cuentas de Costo</h2>
            <div className="flex gap-2 text-[11px]">
              <button onClick={expandAll} className="text-teal-muted hover:text-navy transition-colors">Expandir todo</button>
              <span className="text-gray-200">|</span>
              <button onClick={collapseAll} className="text-teal-muted hover:text-navy transition-colors">Colapsar</button>
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {plan.familias.map(fam => {
              const isOpen = expanded.has(fam.codigo)
              const subcuentas = plan.cuentas.filter(c => c.familiaCodigo === fam.codigo)
              return (
                <div key={fam.codigo}>
                  <button
                    onClick={() => toggleFamilia(fam.codigo)}
                    className="flex items-center gap-3 w-full px-5 py-3 text-left hover:bg-surface transition-colors"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <span className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: fam.color }}>
                      {fam.letra}
                    </span>
                    <span className="text-sm font-semibold text-navy">{fam.codigo}</span>
                    <span className="text-sm text-gray-700 flex-1">{fam.nombre}</span>
                    <span className="text-[11px] text-gray-400 tabular-nums">{subcuentas.length} cuentas</span>
                  </button>

                  {isOpen && subcuentas.length > 0 && (
                    <div className="bg-gray-50/50 px-5 pb-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] text-gray-400 uppercase tracking-wider">
                            <th className="px-3 py-1.5 text-left w-20">Código</th>
                            <th className="px-3 py-1.5 text-left">Descripción</th>
                            <th className="px-3 py-1.5 text-center w-16">Letra</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {subcuentas.map(c => (
                            <tr key={c.codigo} className="hover:bg-white/50">
                              <td className="px-3 py-1.5 font-mono text-navy font-medium">{c.codigo}</td>
                              <td className="px-3 py-1.5 text-gray-600">{c.descripcion}</td>
                              <td className="px-3 py-1.5 text-center text-gray-400">{c.letra}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {isOpen && subcuentas.length === 0 && (
                    <p className="px-12 pb-3 text-xs text-gray-400 italic">Sin subcuentas</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Maestro de productos */}
        {maestro.productos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-navy font-slab">Maestro de Productos</h2>
              <p className="text-[11px] text-gray-400">{uf2(maestro.productos.length)} productos</p>
            </div>
            <div className="p-5">
              {/* Summary by letter */}
              <div className="flex flex-wrap gap-2 mb-4">
                {plan.familias.map(fam => {
                  const count = maestro.productos.filter(p => p.letra === fam.letra).length
                  if (count === 0) return null
                  return (
                    <span key={fam.letra} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-gray-200">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: fam.color }} />
                      {fam.letra}: {uf2(count)}
                    </span>
                  )
                })}
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input
                  type="text"
                  placeholder="Buscar por código o descripción (mín. 2 caracteres)..."
                  value={searchProducto}
                  onChange={e => setSearchProducto(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-muted/30 placeholder:text-gray-300"
                />
              </div>

              {filteredProductos.length > 0 && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-navy">
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">Código</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">Descripción</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">Ud</th>
                        <th className="px-3 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">Cta Cto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredProductos.map((p, i) => (
                        <tr key={p.codigo} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                          <td className="px-3 py-1.5 font-mono text-xs text-navy">{p.codigo}</td>
                          <td className="px-3 py-1.5 text-gray-600 text-xs truncate max-w-xs">{p.descripcion}</td>
                          <td className="px-3 py-1.5 text-gray-400 text-xs">{p.unidadMedida}</td>
                          <td className="px-3 py-1.5 text-gray-500 text-xs">{p.ctaCto}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredProductos.length >= 50 && (
                    <p className="px-3 py-2 text-[11px] text-gray-300 bg-gray-50">Mostrando primeros 50 resultados</p>
                  )}
                </div>
              )}

              {searchProducto.length >= 2 && filteredProductos.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Sin resultados para "{searchProducto}"</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onFile={handleFile}
          error={uploadError}
          preview={uploadPreview}
          onConfirm={confirmUpload}
          onCancel={() => { setShowUpload(false); setUploadPreview(null); setUploadError(null) }}
        />
      )}

      <input ref={inputRef} type="file" accept=".xlsm,.xlsx" className="hidden" />
    </div>
  )
}


function UploadModal({ onFile, error, preview, onConfirm, onCancel }: {
  onFile: (file: File) => void
  error: string | null
  preview: { plan: PlanCuentas; maestro: MaestroProductos; errors: string[] } | null
  onConfirm: () => void
  onCancel: () => void
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

  const hasBlockingErrors = preview && preview.errors.length > 0

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-gray-100" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-[11px] text-teal-muted font-medium uppercase tracking-wider">Plan de Cuentas</p>
          <h3 className="text-lg font-bold text-navy font-slab">Subir nueva versión</h3>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!preview && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all
                ${dragOver ? 'border-navy bg-teal-light/20' : 'border-gray-200 hover:border-teal-muted hover:bg-surface'}`}
            >
              <FileSpreadsheet className="h-8 w-8 text-teal-muted mb-3" />
              <p className="text-sm font-medium text-navy">MAESTRO_MATERIALES_ICEMM.xlsm</p>
              <p className="text-[11px] text-gray-400 mt-1">Arrastra el archivo aquí o haz clic para seleccionar</p>
              <input ref={inputRef} type="file" accept=".xlsm,.xlsx" className="hidden" onChange={handleChange} />
            </div>
          )}

          {preview && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface rounded-lg p-3 border border-gray-100 text-center">
                  <p className="text-[10px] text-gray-400 uppercase">Familias</p>
                  <p className="text-xl font-bold text-navy">{preview.plan.familias.length}</p>
                </div>
                <div className="bg-surface rounded-lg p-3 border border-gray-100 text-center">
                  <p className="text-[10px] text-gray-400 uppercase">Cuentas</p>
                  <p className="text-xl font-bold text-navy">{preview.plan.cuentas.length}</p>
                </div>
                <div className="bg-surface rounded-lg p-3 border border-gray-100 text-center">
                  <p className="text-[10px] text-gray-400 uppercase">Productos</p>
                  <p className="text-xl font-bold text-navy">{preview.maestro.productos.length.toLocaleString('es-CL')}</p>
                </div>
              </div>

              {/* Familias detail */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy">
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-white/80 uppercase">Código</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-white/80 uppercase">Familia</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-white/80 uppercase">Letra</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-white/80 uppercase">Cuentas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.plan.familias.map((f, i) => {
                      const count = preview.plan.cuentas.filter(c => c.familiaCodigo === f.codigo).length
                      return (
                        <tr key={f.codigo} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                          <td className="px-3 py-2 font-mono font-semibold text-navy">{f.codigo}</td>
                          <td className="px-3 py-2 text-gray-700">{f.nombre}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-block w-5 h-5 rounded text-[10px] font-bold text-white leading-5 text-center" style={{ backgroundColor: f.color }}>
                              {f.letra}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{count}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Validation errors */}
              {hasBlockingErrors && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">Errores de validación (bloqueantes):</p>
                  {preview.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}

              {!hasBlockingErrors && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-emerald-700 font-medium">Validación exitosa — listo para confirmar</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
            Cancelar
          </button>
          {preview && !hasBlockingErrors && (
            <button onClick={onConfirm} className="px-5 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-light transition-colors shadow-sm">
              Confirmar carga
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
