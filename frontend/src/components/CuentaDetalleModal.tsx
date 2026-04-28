import { X } from 'lucide-react'
import type { TransaccionERP } from '../features/projects/types'

const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  cc: number
  cuentaNombre: string
  transacciones: TransaccionERP[]
  cutoffMes: string | null
  onClose: () => void
}

export default function CuentaDetalleModal({ cc, cuentaNombre, transacciones, cutoffMes, onClose }: Props) {
  // Apply cutoff filter
  const filtradas = cutoffMes
    ? transacciones.filter(t => !t.mesKey || t.mesKey <= cutoffMes)
    : transacciones

  const total = filtradas.reduce((s, t) => s + t.monto_uf, 0)

  // Sort by fecha contable descending (newest first)
  const ordenadas = [...filtradas].sort((a, b) => {
    if (a.mesKey !== b.mesKey) return b.mesKey.localeCompare(a.mesKey)
    return 0
  })

  return (
    <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] flex flex-col border border-gray-100" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] text-blue-500 font-medium uppercase tracking-wider">Detalle Gasto Real</p>
            <h3 className="text-lg font-bold text-navy font-slab">Cuenta {cc} — {cuentaNombre}</h3>
            <p className="text-xs text-gray-400 mt-1">
              {ordenadas.length.toLocaleString('es-CL')} transacciones · Total UF {uf2(total)}
              {cutoffMes && <span className="ml-2 text-blue-500">· Hasta {cutoffMes}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 px-6 py-4">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-navy">
                <tr>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">Unidad</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">Nº Doc</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-white/80 uppercase tracking-wider">Mes</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-white/80 uppercase tracking-wider">Año</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">Fecha Contable</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-white/80 uppercase tracking-wider">Valor UF</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">RUT</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">Razón Social</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-white/80 uppercase tracking-wider">Monto UF</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-white/80 uppercase tracking-wider">Concepto</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-white/80 uppercase tracking-wider">Glosa</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {ordenadas.map((t, i) => (
                  <tr key={i} className={`hover:bg-teal-light/20 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-2 py-1.5 text-gray-500 truncate max-w-32">{t.unidadNegocioDescripcion}</td>
                    <td className="px-2 py-1.5 text-gray-700 font-mono">{t.num_doc}</td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-500 text-right">{t.mes || '—'}</td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-500 text-right">{t.ano || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-600">{t.fecha_contable}</td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-500 text-right">{t.valor_uf ? t.valor_uf.toLocaleString('es-CL') : '—'}</td>
                    <td className="px-2 py-1.5 text-gray-500 font-mono">{t.rut_proveedor}</td>
                    <td className="px-2 py-1.5 text-gray-700 truncate max-w-48">{t.razon_social}</td>
                    <td className="px-2 py-1.5 tabular-nums font-semibold text-navy text-right">{uf2(t.monto_uf)}</td>
                    <td className="px-2 py-1.5 tabular-nums text-blue-500 font-mono text-right">{t.concepto1_codigo}</td>
                    <td className="px-2 py-1.5 text-gray-600 truncate max-w-64">{t.glosa_detalle}</td>
                  </tr>
                ))}
                {ordenadas.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-2 py-8 text-center text-gray-400 text-sm">
                      Sin transacciones {cutoffMes ? `para el periodo hasta ${cutoffMes}` : ''}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={8} className="px-2 py-2 text-right text-[11px] font-bold text-gray-500 uppercase">Total</td>
                  <td className="px-2 py-2 tabular-nums font-bold text-navy text-right">{uf2(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-light transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
