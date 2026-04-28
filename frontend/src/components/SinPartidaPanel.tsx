import type { MovimientoSinPartida } from '../features/projects/types'
import type { SinPartida } from '../data/dataAdapter'

const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  sinPartida: SinPartida[]
  sinPartidaEnriquecido?: MovimientoSinPartida[]
}

export default function SinPartidaPanel({ sinPartida, sinPartidaEnriquecido }: Props) {
  // Use enriched data if available, otherwise fall back to legacy format
  const items = sinPartidaEnriquecido && sinPartidaEnriquecido.length > 0
    ? sinPartidaEnriquecido
    : sinPartida.filter(s => s.gasto_uf > 0).map(s => ({
        concepto_codigo: s.concepto1,
        descripcion: '',
        monto_uf: s.gasto_uf,
        num_transacciones: 0,
        proveedores_top: [] as { razon_social: string; monto_uf: number }[],
      }))

  const positivos = items.filter(s => s.monto_uf > 0)
  const total = positivos.reduce((s, p) => s + p.monto_uf, 0)

  if (positivos.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-1">
        <h2 className="font-semibold text-amber-800 text-sm font-slab">Gasto sin Partida Presupuestaria</h2>
        <p className="text-xs text-amber-700">
          Las siguientes categorías tienen gasto contabilizado en el ERP pero
          su <code className="bg-amber-100 px-1 rounded">concepto1_codigo</code> no tiene un <code className="bg-amber-100 px-1 rounded">codigo2</code> equivalente
          en el presupuesto cargado.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy">
              {['Concepto', 'Transacciones', 'Gasto Real (UF)', 'Top Proveedores'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-white/80 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {positivos.map((s, i) => (
              <tr key={s.concepto_codigo} className={`hover:bg-teal-light/20 transition-colors ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                <td className="px-4 py-3 font-mono font-semibold text-navy">{s.concepto_codigo}</td>
                <td className="px-4 py-3 text-gray-500 tabular-nums">
                  {s.num_transacciones > 0 ? s.num_transacciones.toLocaleString('es-CL') : '—'}
                </td>
                <td className="px-4 py-3 tabular-nums font-semibold text-amber-600">{uf2(s.monto_uf)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {s.proveedores_top.length > 0
                    ? s.proveedores_top.map(p => p.razon_social).join(', ')
                    : <span className="text-[11px] bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-1 rounded-full font-medium">Requiere mapeo</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr>
              <td colSpan={2} className="px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Total sin partida</td>
              <td className="px-4 py-2.5 tabular-nums font-bold text-amber-600">UF {uf2(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="bg-surface border border-gray-200 rounded-lg p-4 text-xs text-navy space-y-1">
        <p className="font-semibold">Próximos pasos sugeridos:</p>
        <ol className="list-decimal list-inside space-y-0.5 text-gray-600">
          <li>Confirmar con el área contable si estos centros de costo corresponden a partidas existentes con otro código.</li>
          <li>Si corresponden, actualizar el presupuesto para incluir los códigos faltantes.</li>
          <li>Si son categorías sin contrapartida presupuestaria, agregarlas al presupuesto como ítem de contingencia.</li>
        </ol>
      </div>
    </div>
  )
}
