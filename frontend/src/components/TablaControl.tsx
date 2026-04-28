import { useState, useMemo } from 'react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Layers, List, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { Partida, Movimiento, DetallePartida } from '../data/dataAdapter'
import { usePlanCuentasStore } from '../features/plan-cuentas/PlanCuentasStore'
import { useProjectsStore } from '../features/projects/ProjectsStore'
import CuentaDetalleModal from './CuentaDetalleModal'

const uf2 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (n: number) => `${n >= 0 ? '+' : ''}${uf2(n)}`
const pct1 = (n: number | null) => n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
const varColor = (n: number) => n > 0 ? 'text-emerald-600' : n < 0 ? 'text-accent' : 'text-gray-400'

function VarArrow({ pct }: { pct: number | null }) {
  if (pct === null) return <Minus className="h-4 w-4 text-gray-300" />
  if (pct > 5)  return <TrendingUp   className="h-4 w-4 text-emerald-500" />
  if (pct > 0)  return <TrendingUp   className="h-4 w-4 text-emerald-400" />
  if (pct >= -5) return <Minus       className="h-4 w-4 text-gray-400" />
  if (pct >= -15) return <TrendingDown className="h-4 w-4 text-amber-500" />
  return <TrendingDown className="h-4 w-4 text-accent" />
}

function familyTotals(ps: Partida[]) {
  return {
    ppto_original:     ps.reduce((s, p) => s + p.ppto_original, 0),
    redistribuido:     ps.reduce((s, p) => s + p.redistribuido, 0),
    ppto_horas_extra:  ps.reduce((s, p) => s + p.ppto_horas_extra, 0),
    ppto_vigente:      ps.reduce((s, p) => s + p.ppto_vigente, 0),
    gasto_real:        ps.reduce((s, p) => s + p.gasto_real, 0),
    proyeccion:    ps.reduce((s, p) => s + p.proyeccion, 0),
    variacion_uf:  ps.reduce((s, p) => s + p.variacion_uf, 0),
    ytg:           ps.reduce((s, p) => s + p.ytg, 0),
  }
}

interface Props {
  partidas: Partida[]
  movimientos: Record<string, Movimiento[]>
  detallePartidas: Record<string, DetallePartida[]>
  familias: string[]
}

export default function TablaControl({ partidas, movimientos, detallePartidas, familias: FAMILIAS }: Props) {
  const planCuentas = usePlanCuentasStore(s => s.plan)
  const activeProject = useProjectsStore(s => s.projects.find(p => p.id === s.activeProjectId) ?? null)
  const [cuentaDetalle, setCuentaDetalle] = useState<{ cc: number; nombre: string } | null>(null)
  const [sorting, setSorting]         = useState<SortingState>([{ id: 'variacion_pct', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string>('TODOS')
  const [drilldown, setDrilldown]     = useState<Partida | null>(null)
  const [porFamilia, setPorFamilia]   = useState(true)
  const [familiasAbiertas, setFamiliasAbiertas] = useState<Set<string>>(
    new Set(Object.values(FAMILIAS))
  )
  // Track which accounts are expanded (key = "familia::codigo2")
  const [cuentasAbiertas, setCuentasAbiertas] = useState<Set<string>>(new Set())

  const toggleFamilia = (f: string) =>
    setFamiliasAbiertas(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })

  const toggleCuenta = (key: string) =>
    setCuentasAbiertas(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const expandAll = () => {
    setFamiliasAbiertas(new Set(Object.values(FAMILIAS)))
    // Expand all accounts too
    const allKeys = new Set<string>()
    for (const p of partidas) allKeys.add(`${p.familia}::${p.codigo2}`)
    setCuentasAbiertas(allKeys)
  }
  const collapseAll = () => {
    setFamiliasAbiertas(new Set())
    setCuentasAbiertas(new Set())
  }

  const datos = useMemo(() => {
    let d = partidas
    if (estadoFiltro !== 'TODOS') d = d.filter(p => p.estado === estadoFiltro)
    if (globalFilter) {
      const q = globalFilter.toLowerCase()
      d = d.filter(p => p.partida.toLowerCase().includes(q) || p.familia.toLowerCase().includes(q) || p.codigo2.includes(q))
    }
    return d
  }, [partidas, estadoFiltro, globalFilter])

  const grupos = useMemo(() => {
    const map = new Map<string, Partida[]>()
    for (const p of datos) {
      const g = map.get(p.familia) || []
      g.push(p)
      map.set(p.familia, g)
    }
    const ordered = new Map<string, Partida[]>()
    for (const f of FAMILIAS) {
      if (map.has(f)) ordered.set(f, map.get(f)!)
    }
    for (const [f, ps] of map) {
      if (!ordered.has(f)) ordered.set(f, ps)
    }
    return ordered
  }, [datos, FAMILIAS])

  const columns = useMemo<ColumnDef<Partida>[]>(() => [
    { accessorKey: 'codigo2', header: 'Cuenta', size: 80 },
    {
      accessorKey: 'partida', header: 'Recurso', size: 260,
      cell: ({ row }) => <span>{row.original.familia} — {row.original.partida}</span>,
    },
    {
      accessorKey: 'ppto_original', header: 'PPTO Inic',
      cell: ({ getValue }) => <span className="tabular-nums">{uf2(getValue() as number)}</span>,
    },
    {
      accessorKey: 'redistribuido', header: 'Redistrib.',
      cell: ({ getValue, row }) => {
        const v = getValue() as number
        const diff = v - row.original.ppto_original
        return (
          <span className={`tabular-nums ${diff !== 0 ? 'font-medium text-teal' : ''}`}>
            {uf2(v)}
            {diff !== 0 && <span className="ml-1 text-[10px] text-teal-muted">({diff > 0 ? '+' : ''}{uf2(diff)})</span>}
          </span>
        )
      },
    },
    {
      accessorKey: 'ppto_horas_extra', header: 'OO.EE.',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={`tabular-nums ${v > 0 ? 'text-violet-600 font-medium' : 'text-gray-400'}`}>{uf2(v)}</span>
      },
    },
    {
      accessorKey: 'ppto_vigente', header: 'Ppto Vigente',
      cell: ({ getValue }) => <span className="tabular-nums font-medium text-navy">{uf2(getValue() as number)}</span>,
    },
    {
      accessorKey: 'proyeccion', header: 'Proyectado',
      cell: ({ getValue, row }) => {
        const v = getValue() as number
        const diff = v - row.original.redistribuido
        return (
          <span className={`tabular-nums ${diff > 0 ? 'text-accent' : diff < 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
            {uf2(v)}
          </span>
        )
      },
    },
    {
      accessorKey: 'gasto_real', header: 'Gastado',
      cell: ({ getValue }) => <span className="tabular-nums">{uf2(getValue() as number)}</span>,
    },
    {
      accessorKey: 'ytg', header: 'Saldo',
      cell: ({ getValue }) => <span className="tabular-nums text-gray-500">{uf2(getValue() as number)}</span>,
    },
    {
      accessorKey: 'variacion_uf', header: 'Var UF',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={`tabular-nums font-medium ${varColor(v)}`}>{signed(v)}</span>
      },
    },
    {
      accessorKey: 'variacion_pct', header: 'Var %',
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        if (v === null) return <span className="text-gray-300">—</span>
        return <span className={`tabular-nums font-medium ${varColor(v)}`}>{pct1(v)}</span>
      },
      sortUndefined: 'last',
    },
    {
      id: 'estado_arrow', header: '', enableSorting: false,
      cell: ({ row }) => <VarArrow pct={row.original.variacion_pct} />,
    },
    {
      id: 'detalle', header: '', enableSorting: false,
      cell: ({ row }) => (
        <button onClick={() => setDrilldown(row.original)}
          className="text-[11px] font-medium text-teal-muted hover:text-navy transition-colors">detalle</button>
      ),
    },
  ], [])

  const table = useReactTable({
    data: datos,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const estados = ['TODOS', 'CRITICO', 'ALERTA', 'EN CONTROL', 'FAVORABLE', 'SIN EJECUCION', 'SOLO REAL']
  const headers = ['Cuenta', 'Recurso', 'PPTO Inic', 'Redistrib.', 'OO.EE.', 'Vigente', 'Proyectado', 'Gastado', 'Saldo', 'Var UF', 'Var %', '', '']

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-300" />
            <input
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              placeholder="Buscar recurso o cuenta..."
              className="pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg w-56
                focus:outline-none focus:ring-2 focus:ring-teal-muted/30 focus:border-teal-muted
                placeholder:text-gray-300"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {estados.map(e => (
              <button key={e} onClick={() => setEstadoFiltro(e)}
                className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-all
                  ${estadoFiltro === e
                    ? 'bg-navy text-white shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-navy'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setPorFamilia(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all
              ${!porFamilia ? 'bg-white shadow-sm text-navy' : 'text-gray-400 hover:text-gray-600'}`}>
            <List className="h-3.5 w-3.5" /> Plana
          </button>
          <button onClick={() => setPorFamilia(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all
              ${porFamilia ? 'bg-white shadow-sm text-navy' : 'text-gray-400 hover:text-gray-600'}`}>
            <Layers className="h-3.5 w-3.5" /> Familias
          </button>
        </div>
      </div>

      {/* FLAT VIEW */}
      {!porFamilia && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map(hg => (
                  <tr key={hg.id} className="bg-navy">
                    {hg.headers.map(h => (
                      <th key={h.id}
                        className={`px-3 py-2.5 text-left text-[11px] font-medium text-white/80 uppercase tracking-wider
                          ${h.column.getCanSort() ? 'cursor-pointer select-none hover:text-white' : ''}`}
                        onClick={h.column.getToggleSortingHandler()}>
                        <div className="flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getCanSort() && (
                            h.column.getIsSorted() === 'asc'  ? <ChevronUp className="h-3 w-3 text-accent" /> :
                            h.column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3 text-accent" /> :
                            <ChevronsUpDown className="h-3 w-3 text-white/30" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {table.getRowModel().rows.map((row, i) => (
                  <tr key={row.id}
                    onDoubleClick={() => setDrilldown(row.original)}
                    className={`hover:bg-teal-light/20 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-3 py-2 text-gray-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {table.getRowModel().rows.length === 0 && (
              <p className="text-center text-gray-300 py-10 text-sm">Sin resultados</p>
            )}
          </div>
          <p className="text-[11px] text-gray-400">{table.getRowModel().rows.length} de {partidas.length} partidas</p>
        </>
      )}

      {/* FAMILY VIEW */}
      {porFamilia && (() => {
        const totObra = familyTotals(datos)
        const obraVarPct = totObra.ppto_vigente ? (totObra.variacion_uf / totObra.ppto_vigente) * 100 : 0
        return (
        <div className="space-y-3">
          <div className="flex gap-3 text-[11px]">
            <button onClick={expandAll} className="text-teal-muted hover:text-navy font-medium transition-colors">Expandir todo</button>
            <span className="text-gray-200">|</span>
            <button onClick={collapseAll} className="text-teal-muted hover:text-navy font-medium transition-colors">Colapsar todo</button>
          </div>

          {/* Total general de la obra */}
          <div className="rounded-lg border border-navy overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[55px]" />
                <col />
                <col className="w-[88px]" />
                <col className="w-[88px]" />
                <col className="w-[75px]" />
                <col className="w-[88px]" />
                <col className="w-[88px]" />
                <col className="w-[88px]" />
                <col className="w-[88px]" />
                <col className="w-[85px]" />
                <col className="w-[70px]" />
                <col className="w-[34px]" />
                <col className="w-[45px]" />
              </colgroup>
              <thead>
                <tr className="bg-navy">
                  <th className="px-3 py-3" />
                  <th className="px-3 py-3 text-left">
                    <span className="font-bold text-white text-sm tracking-wide uppercase">TOTAL OBRA</span>
                    <span className="ml-2 text-[11px] text-white/40">{datos.length} partidas</span>
                  </th>
                  <th className="px-3 py-3 tabular-nums font-bold text-white text-right">{uf2(totObra.ppto_original)}</th>
                  <th className="px-3 py-3 tabular-nums font-bold text-teal-light text-right">{uf2(totObra.redistribuido)}</th>
                  <th className="px-3 py-3 tabular-nums font-bold text-violet-300 text-right">{uf2(totObra.ppto_horas_extra)}</th>
                  <th className="px-3 py-3 tabular-nums font-bold text-white text-right">{uf2(totObra.ppto_vigente)}</th>
                  <th className="px-3 py-3 tabular-nums font-bold text-white text-right">{uf2(totObra.proyeccion)}</th>
                  <th className="px-3 py-3 tabular-nums font-bold text-white text-right">{uf2(totObra.gasto_real)}</th>
                  <th className="px-3 py-3 tabular-nums font-medium text-white/60 text-right">{uf2(totObra.ytg)}</th>
                  <th className="px-3 py-3 tabular-nums font-bold text-right">
                    <span className={totObra.variacion_uf > 0 ? 'text-emerald-400' : totObra.variacion_uf < 0 ? 'text-red-400' : 'text-white/40'}>{signed(totObra.variacion_uf)}</span>
                  </th>
                  <th className="px-3 py-3 tabular-nums font-bold text-right">
                    <span className={obraVarPct > 0 ? 'text-emerald-400' : obraVarPct < 0 ? 'text-red-400' : 'text-white/40'}>{obraVarPct >= 0 ? '+' : ''}{obraVarPct.toFixed(1)}%</span>
                  </th>
                  <th className="px-3 py-3 text-center"><VarArrow pct={obraVarPct} /></th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
            </table>
          </div>

          {Array.from(grupos.entries()).map(([familia, ps]) => {
            const abierta = familiasAbiertas.has(familia)
            const tot = familyTotals(ps)
            const varPct = tot.ppto_vigente ? (tot.variacion_uf / tot.ppto_vigente) * 100 : 0

            return (
              <div key={familia} className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[55px]" />
                    <col />
                    <col className="w-[88px]" />
                    <col className="w-[88px]" />
                    <col className="w-[75px]" />
                    <col className="w-[88px]" />
                    <col className="w-[88px]" />
                    <col className="w-[88px]" />
                    <col className="w-[88px]" />
                    <col className="w-[85px]" />
                    <col className="w-[70px]" />
                    <col className="w-[34px]" />
                    <col className="w-[45px]" />
                  </colgroup>

                  {/* Family header */}
                  <thead>
                    <tr className="bg-navy-light cursor-pointer" onClick={() => toggleFamilia(familia)}>
                      <th className="px-3 py-2.5 text-left">
                        <ChevronRight className={`h-4 w-4 text-white/40 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                      </th>
                      <th className="px-3 py-2.5 text-left">
                        <span className="font-semibold text-white text-sm">{familia}</span>
                        <span className="ml-2 text-[11px] text-white/40">{ps.length}</span>
                      </th>
                      <th className="px-3 py-2.5 tabular-nums font-medium text-white/80 text-right">{uf2(tot.ppto_original)}</th>
                      <th className="px-3 py-2.5 tabular-nums font-medium text-teal-light text-right">{uf2(tot.redistribuido)}</th>
                      <th className="px-3 py-2.5 tabular-nums font-medium text-violet-300 text-right">{uf2(tot.ppto_horas_extra)}</th>
                      <th className="px-3 py-2.5 tabular-nums font-bold text-white text-right">{uf2(tot.ppto_vigente)}</th>
                      <th className="px-3 py-2.5 tabular-nums font-medium text-white/80 text-right">{uf2(tot.proyeccion)}</th>
                      <th className="px-3 py-2.5 tabular-nums font-medium text-white/80 text-right">{uf2(tot.gasto_real)}</th>
                      <th className="px-3 py-2.5 tabular-nums font-medium text-white/50 text-right">{uf2(tot.ytg)}</th>
                      <th className="px-3 py-2.5 tabular-nums font-bold text-right">
                        <span className={tot.variacion_uf > 0 ? 'text-emerald-400' : tot.variacion_uf < 0 ? 'text-red-400' : 'text-white/40'}>{signed(tot.variacion_uf)}</span>
                      </th>
                      <th className="px-3 py-2.5 tabular-nums font-bold text-right">
                        <span className={varPct > 0 ? 'text-emerald-400' : varPct < 0 ? 'text-red-400' : 'text-white/40'}>{varPct >= 0 ? '+' : ''}{varPct.toFixed(1)}%</span>
                      </th>
                      <th className="px-3 py-2.5 text-center"><VarArrow pct={varPct} /></th>
                      <th className="px-3 py-2.5" />
                    </tr>
                    <tr className="bg-navy-light/80">
                      {headers.map((h, i) => (
                        <th key={`${h}-${i}`} className={`px-3 py-1 text-[10px] font-medium text-white/40 uppercase tracking-wider ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>

                  {/* Detail rows grouped by collapsible account (codigo2) */}
                  {abierta && (
                    <tbody className="bg-white divide-y divide-gray-50">
                      {(() => {
                        const cuentaMap = new Map<string, Partida[]>()
                        for (const p of ps) {
                          const g = cuentaMap.get(p.codigo2) || []
                          g.push(p)
                          cuentaMap.set(p.codigo2, g)
                        }
                        const cuentas = Array.from(cuentaMap.entries()).sort(([a], [b]) => parseInt(a) - parseInt(b))

                        return cuentas.flatMap(([cc, cps]) => {
                          const ccTot = familyTotals(cps)
                          const ccVarPct = ccTot.ppto_vigente ? (ccTot.variacion_uf / ccTot.ppto_vigente) * 100 : null
                          const ccDiffRedist = ccTot.redistribuido - ccTot.ppto_original
                          const ccKey = `${familia}::${cc}`
                          const ccOpen = cuentasAbiertas.has(ccKey)

                          const rows: React.ReactNode[] = []

                          // Account header row
                          rows.push(
                            <tr key={`hdr-${cc}`}
                              onClick={() => toggleCuenta(ccKey)}
                              className="bg-gray-100/60 hover:bg-gray-100 cursor-pointer border-t border-gray-200">
                              <td className="px-3 py-2 font-mono text-xs font-bold text-navy">
                                <span className="flex items-center gap-1">
                                  <ChevronRight className={`h-3 w-3 text-gray-400 transition-transform ${ccOpen ? 'rotate-90' : ''}`} />
                                  {cc}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-[11px] font-semibold text-navy truncate">
                                {(() => {
                                  const ccNum = parseInt(cc, 10)
                                  const cuentaInfo = planCuentas.cuentas.find(c => c.codigo === ccNum)
                                  const familiaInfo = planCuentas.familias.find(f => f.codigo === ccNum)
                                  return cuentaInfo?.descripcion ?? familiaInfo?.nombre ?? `Cuenta ${cc}`
                                })()}
                                <span className="ml-1.5 text-[10px] text-gray-400 font-normal">{cps.length}</span>
                                {ccDiffRedist !== 0 && (
                                  <span className={`ml-1.5 text-[10px] font-medium ${ccDiffRedist > 0 ? 'text-teal' : 'text-accent'}`}>
                                    ({ccDiffRedist > 0 ? '+' : ''}{uf2(ccDiffRedist)})
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 tabular-nums font-semibold text-navy text-right">{uf2(ccTot.ppto_original)}</td>
                              <td className="px-3 py-2 tabular-nums font-semibold text-right">
                                <span className={ccDiffRedist !== 0 ? 'text-teal' : 'text-navy'}>{uf2(ccTot.redistribuido)}</span>
                              </td>
                              <td className="px-3 py-2 tabular-nums font-semibold text-violet-600 text-right">{uf2(ccTot.ppto_horas_extra)}</td>
                              <td className="px-3 py-2 tabular-nums font-bold text-navy text-right">{uf2(ccTot.ppto_vigente)}</td>
                              <td className="px-3 py-2 tabular-nums font-semibold text-navy text-right">{uf2(ccTot.proyeccion)}</td>
                              <td className="px-3 py-2 tabular-nums font-semibold text-navy text-right">{uf2(ccTot.gasto_real)}</td>
                              <td className="px-3 py-2 tabular-nums text-gray-500 font-semibold text-right">{uf2(ccTot.ytg)}</td>
                              <td className="px-3 py-2 tabular-nums font-semibold text-right">
                                <span className={varColor(ccTot.variacion_uf)}>{signed(ccTot.variacion_uf)}</span>
                              </td>
                              <td className="px-3 py-2 tabular-nums font-semibold text-right">
                                <span className={varColor(ccVarPct ?? 0)}>{pct1(ccVarPct)}</span>
                              </td>
                              <td className="px-3 py-2"><VarArrow pct={ccVarPct} /></td>
                              <td className="px-3 py-2 text-right">
                                {(() => {
                                  const ccNum = parseInt(cc, 10)
                                  const tx = activeProject?.slots.gasto_real_erp?.transaccionesPorCcosto?.[ccNum]
                                  if (!tx || tx.length === 0) return null
                                  const ccNombre = planCuentas.cuentas.find(c => c.codigo === ccNum)?.descripcion ?? `Cuenta ${cc}`
                                  return (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setCuentaDetalle({ cc: ccNum, nombre: ccNombre })
                                      }}
                                      className="text-[10px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
                                    >
                                      detalle
                                    </button>
                                  )
                                })()}
                              </td>
                            </tr>
                          )

                          // Detail rows
                          if (ccOpen) {
                            cps.forEach((p, i) => {
                              rows.push(
                                <tr key={p.codigo}
                                  onDoubleClick={() => setDrilldown(p)}
                                  className={`hover:bg-teal-light/20 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                                  <td className="px-3 py-1.5 text-gray-300 font-mono text-[10px] pl-8">{p.codigo2}</td>
                                  <td className="px-3 py-1.5 text-gray-600 text-xs truncate">{p.familia} — {p.partida}</td>
                                  <td className="px-3 py-1.5 tabular-nums text-gray-500 text-xs text-right">{uf2(p.ppto_original)}</td>
                                  <td className="px-3 py-1.5 tabular-nums text-xs text-right">
                                    <span className={p.redistribuido !== p.ppto_original ? 'text-teal font-medium' : 'text-gray-500'}>
                                      {uf2(p.redistribuido)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 tabular-nums text-xs text-right">
                                    <span className={p.ppto_horas_extra > 0 ? 'text-violet-600 font-medium' : 'text-gray-400'}>{uf2(p.ppto_horas_extra)}</span>
                                  </td>
                                  <td className="px-3 py-1.5 tabular-nums text-xs text-right font-medium text-navy">{uf2(p.ppto_vigente)}</td>
                                  <td className="px-3 py-1.5 tabular-nums text-xs text-right">
                                    <span className={varColor(p.proyeccion - p.redistribuido)}>{uf2(p.proyeccion)}</span>
                                  </td>
                                  <td className="px-3 py-1.5 tabular-nums text-gray-600 text-xs text-right">{uf2(p.gasto_real)}</td>
                                  <td className="px-3 py-1.5 tabular-nums text-gray-400 text-xs text-right">{uf2(p.ytg)}</td>
                                  <td className="px-3 py-1.5 tabular-nums text-xs text-right">
                                    <span className={`font-medium ${varColor(p.variacion_uf)}`}>{signed(p.variacion_uf)}</span>
                                  </td>
                                  <td className="px-3 py-1.5 tabular-nums text-xs text-right">
                                    <span className={`font-medium ${varColor(p.variacion_pct ?? 0)}`}>{pct1(p.variacion_pct)}</span>
                                  </td>
                                  <td className="px-3 py-1.5"><VarArrow pct={p.variacion_pct} /></td>
                                  <td className="px-3 py-1.5">
                                    <button onClick={() => setDrilldown(p)} className="text-[10px] text-teal-muted hover:text-navy font-medium transition-colors">detalle</button>
                                  </td>
                                </tr>
                              )
                            })
                          }
                          return rows
                        })
                      })()}
                    </tbody>
                  )}
                </table>
              </div>
            )
          })}
        </div>
        )
      })()}

      {/* Cuenta detalle modal (raw ERP transactions) */}
      {cuentaDetalle && activeProject?.slots.gasto_real_erp && (
        <CuentaDetalleModal
          cc={cuentaDetalle.cc}
          cuentaNombre={cuentaDetalle.nombre}
          transacciones={activeProject.slots.gasto_real_erp.transaccionesPorCcosto?.[cuentaDetalle.cc] ?? []}
          cutoffMes={activeProject.cutoffMesReal ?? null}
          onClose={() => setCuentaDetalle(null)}
        />
      )}

      {/* Drilldown Modal */}
      {drilldown && (() => {
        const detalle = detallePartidas[drilldown.codigo2] || []
        const movs = movimientos[drilldown.codigo2] || []
        return (
          <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDrilldown(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col border border-gray-100"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex justify-between items-start p-6 pb-4 border-b border-gray-100">
                <div>
                  <p className="text-[11px] text-teal-muted font-medium uppercase tracking-wide mb-1">{drilldown.familia}</p>
                  <h3 className="font-bold text-navy text-lg font-slab">{drilldown.codigo2} — {drilldown.partida}</h3>
                </div>
                <button onClick={() => setDrilldown(null)} className="text-gray-300 hover:text-gray-500 text-2xl leading-none ml-4 transition-colors">&times;</button>
              </div>

              {/* Mini KPIs */}
              <div className="grid grid-cols-5 gap-2 text-center text-xs px-6 py-4">
                {[
                  { label: 'PPTO Inic',   val: uf2(drilldown.ppto_original),  color: '#233032' },
                  { label: 'Redistrib.',   val: uf2(drilldown.redistribuido),  color: '#809494' },
                  { label: 'Gastado',      val: uf2(drilldown.gasto_real),     color: '#101820' },
                  { label: 'Saldo',        val: uf2(drilldown.ytg),            color: '#9DA39B' },
                  { label: 'Var (R-P)',    val: signed(drilldown.variacion_uf), color: drilldown.variacion_uf >= 0 ? '#16a34a' : '#E00544' },
                ].map(k => (
                  <div key={k.label} className="bg-surface rounded-lg p-3 border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: k.color }} />
                    <p className="text-gray-400 text-[10px] uppercase tracking-wide">{k.label}</p>
                    <p className="font-bold text-navy mt-0.5">{k.val}</p>
                  </div>
                ))}
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-5">
                <div>
                  <p className="text-[11px] font-semibold text-teal-muted uppercase tracking-wider mb-2">Composición del Presupuesto</p>
                  {detalle.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-navy">
                            <th className="px-3 py-2 text-left text-[11px] font-medium text-white/80 uppercase tracking-wider">Código</th>
                            <th className="px-3 py-2 text-left text-[11px] font-medium text-white/80 uppercase tracking-wider">Resumen</th>
                            <th className="px-3 py-2 text-center text-[11px] font-medium text-white/80 uppercase tracking-wider">Ud</th>
                            <th className="px-3 py-2 text-right text-[11px] font-medium text-white/80 uppercase tracking-wider">Cantidad</th>
                            <th className="px-3 py-2 text-right text-[11px] font-medium text-white/80 uppercase tracking-wider">P. Unit</th>
                            <th className="px-3 py-2 text-right text-[11px] font-medium text-white/80 uppercase tracking-wider">Total UF</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                          {detalle.map((d, i) => (
                            <tr key={i} className={`${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                              <td className="px-3 py-2 text-gray-400 font-mono text-xs">{d.codigo}</td>
                              <td className="px-3 py-2 text-gray-700">{d.resumen}</td>
                              <td className="px-3 py-2 text-gray-400 text-center">{d.ud}</td>
                              <td className="px-3 py-2 text-gray-600 tabular-nums text-right">{d.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 2 })}</td>
                              <td className="px-3 py-2 text-gray-600 tabular-nums text-right">{d.precio_unitario.toLocaleString('es-CL', { maximumFractionDigits: 3 })}</td>
                              <td className="px-3 py-2 text-navy font-medium tabular-nums text-right">{uf2(d.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td colSpan={5} className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase">Total</td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums text-navy">
                              {uf2(detalle.reduce((s, d) => s + d.total, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-300 py-4 text-center bg-surface rounded-lg border border-gray-100">
                      Ejecutar <code className="bg-gray-100 px-1.5 py-0.5 rounded text-navy">python exportar_detalle.py</code> para cargar sub-partidas
                    </p>
                  )}
                </div>

                {movs.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-teal-muted uppercase tracking-wider mb-2">Movimientos Contables</p>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-navy">
                            {['Fecha', 'Proveedor', 'Glosa', 'Monto UF'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-[11px] font-medium text-white/80 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                          {movs.map((m, i) => (
                            <tr key={i} className={`${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{m.fecha}</td>
                              <td className="px-3 py-2 text-gray-700">{m.proveedor}</td>
                              <td className="px-3 py-2 text-gray-500">{m.glosa}</td>
                              <td className="px-3 py-2 text-navy font-medium tabular-nums">{uf2(m.monto_uf)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
