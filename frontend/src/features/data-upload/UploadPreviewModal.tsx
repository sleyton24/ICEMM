import type { ParseResult } from '../projects/types'

const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  result: ParseResult
  slotLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export default function UploadPreviewModal({ result, slotLabel, onConfirm, onCancel }: Props) {
  const { partidas, subtotalesFamilia, totalGeneral, redondeo, warnings, nombreProyecto } = result

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-gray-100" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-[11px] text-teal-muted font-medium uppercase tracking-wider">{slotLabel}</p>
          <h3 className="text-lg font-bold text-navy font-slab">Preview de carga</h3>
          {nombreProyecto && <p className="text-xs text-gray-400 mt-0.5">{nombreProyecto}</p>}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface rounded-lg p-3 border border-gray-100 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Partidas</p>
              <p className="text-xl font-bold text-navy">{partidas.length}</p>
            </div>
            <div className="bg-surface rounded-lg p-3 border border-gray-100 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Familias</p>
              <p className="text-xl font-bold text-navy">{Object.keys(subtotalesFamilia).length}</p>
            </div>
            <div className="bg-surface rounded-lg p-3 border border-gray-100 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total General</p>
              <p className="text-lg font-bold text-navy">UF {uf2(totalGeneral)}</p>
            </div>
          </div>

          {/* Subtotals by family */}
          <div>
            <p className="text-[11px] font-semibold text-teal-muted uppercase tracking-wider mb-2">Subtotales por familia</p>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy">
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-white/80 uppercase tracking-wider">Familia</th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-white/80 uppercase tracking-wider">Partidas</th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-white/80 uppercase tracking-wider">Total UF</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {Object.entries(subtotalesFamilia).map(([fam, total]) => {
                    const count = partidas.filter(p => p.familia === fam).length
                    return (
                      <tr key={fam}>
                        <td className="px-3 py-2 text-gray-700 font-medium">{fam}</td>
                        <td className="px-3 py-2 text-gray-500 tabular-nums text-right">{count}</td>
                        <td className="px-3 py-2 text-navy font-medium tabular-nums text-right">{uf2(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  {redondeo !== 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-1.5 text-right text-[11px] text-gray-400 uppercase">Redondeo</td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">{uf2(redondeo)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-right text-[11px] font-bold text-gray-500 uppercase">Total</td>
                    <td className="px-3 py-2 text-right font-bold text-navy tabular-nums">{uf2(totalGeneral)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Sample partidas */}
          <div>
            <p className="text-[11px] font-semibold text-teal-muted uppercase tracking-wider mb-2">Primeras 20 partidas</p>
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase">Código</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase">C.Costo</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase">Descripción</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase">Familia</th>
                    <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase">Total UF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {partidas.slice(0, 20).map((p, i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                      <td className="px-2 py-1.5 text-gray-400 font-mono text-xs">{p.codigo}</td>
                      <td className="px-2 py-1.5 text-gray-500 text-xs">{p.codigo2}</td>
                      <td className="px-2 py-1.5 text-gray-700 text-xs truncate max-w-48">{p.descripcion}</td>
                      <td className="px-2 py-1.5 text-gray-400 text-[10px]">{p.familia}</td>
                      <td className="px-2 py-1.5 text-navy font-medium tabular-nums text-xs text-right">{uf2(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {partidas.length > 20 && (
              <p className="text-[11px] text-gray-300 mt-1">...y {partidas.length - 20} partidas más</p>
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
          <button onClick={onConfirm} className="px-5 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-light transition-colors shadow-sm">
            Confirmar carga
          </button>
        </div>
      </div>
    </div>
  )
}
