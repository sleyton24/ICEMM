import { Calendar } from 'lucide-react'
import { useProjectsStore } from './ProjectsStore'

const MES_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatMes(mesKey: string): string {
  // "2026-04" → "Abr 2026"
  const [yyyy, mm] = mesKey.split('-')
  const idx = parseInt(mm, 10) - 1
  if (isNaN(idx) || idx < 0 || idx > 11) return mesKey
  return `${MES_LABELS[idx]} ${yyyy}`
}

export default function CutoffMesFilter() {
  const projects = useProjectsStore(s => s.projects)
  const activeProjectId = useProjectsStore(s => s.activeProjectId)
  const setCutoffMesReal = useProjectsStore(s => s.setCutoffMesReal)
  const project = projects.find(p => p.id === activeProjectId)

  if (!project) return null
  const meses = project.slots.gasto_real_erp?.mesesDisponibles ?? []
  if (meses.length === 0) return null

  const cutoff = project.cutoffMesReal ?? null
  const value = cutoff ?? '__all__'

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg bg-white">
      <Calendar className="h-3.5 w-3.5 text-teal-muted" />
      <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Real hasta</label>
      <select
        value={value}
        onChange={e => {
          const v = e.target.value
          setCutoffMesReal(project.id, v === '__all__' ? null : v)
        }}
        className="text-xs font-semibold text-navy bg-transparent border-0 focus:outline-none cursor-pointer pr-1"
      >
        <option value="__all__">Todos los meses</option>
        {meses.map(m => (
          <option key={m} value={m}>{formatMes(m)}</option>
        ))}
      </select>
    </div>
  )
}
