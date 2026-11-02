import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload, Search, Check, AlertTriangle, X } from 'lucide-react'
import { api } from '../../api/client'
import { usePlanCuentasStore } from './PlanCuentasStore'
import { useCurrentUserStore } from '../auth/useCurrentUser'
import { COLUMNAS_CUENTAS, filtrarCuentas, hojaCuentas, leerHojaCuentas } from './maestroCuentasExcel'
import type { CuentaCosto } from './types'

type Preview = {
  baseId: string
  valido: boolean
  errores: { fila: number; columna?: string; mensaje: string }[]
  totalErrores: number
  filasValidas: number
  diff: { nuevas: CuentaCosto[]; modificadas: { antes: CuentaCosto; despues: CuentaCosto }[]; sinCambio: number; noIncluidas: number }
}

export default function MaestroCuentasPanel() {
  const { plan, fetch } = usePlanCuentasStore()
  const esAdmin = useCurrentUserStore(s => s.esAdmin())
  const [q, setQ] = useState('')
  const [familia, setFamilia] = useState('')
  const [letra, setLetra] = useState('')
  const [carga, setCarga] = useState<{ nombre: string; header: unknown[]; rows: unknown[][] } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const famPorCodigo = useMemo(() => new Map(plan.familias.map(f => [f.codigo, f])), [plan.familias])
  const filas = useMemo(() => filtrarCuentas(plan.cuentas, { q, familia: familia ? Number(familia) : undefined, letra: letra || undefined }), [plan.cuentas, q, familia, letra])
  const letras = useMemo(() => [...new Set(plan.familias.map(f => f.letra))], [plan.familias])

  const exportar = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, hojaCuentas(plan.cuentas), 'cuentas')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plan.familias.map(f => ({ codigo: f.codigo, nombre: f.nombre, letra: f.letra }))), 'familias (referencia)')
    XLSX.writeFile(wb, `maestro-cuentas-icemm-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const onFile = async (file: File) => {
    setMsg(null); setPreview(null); setCarga(null); setBusy(true)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const { header, rows } = leerHojaCuentas(wb)
      const p = await api.post<Preview>('/plan-cuentas/cuentas/preview', { header, rows })
      setCarga({ nombre: file.name, header, rows }); setPreview(p)
    } catch (e: any) {
      setMsg({ ok: false, texto: e.message ?? 'No se pudo leer el archivo' })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const aplicar = async () => {
    if (!carga || !preview) return
    setBusy(true)
    try {
      const r = await api.post<{ nuevas: number; modificadas: number; sinCambios?: boolean }>('/plan-cuentas/cuentas/aplicar', { header: carga.header, rows: carga.rows, baseId: preview.baseId })
      await fetch()
      setMsg({ ok: true, texto: r.sinCambios ? 'No había cambios que aplicar.' : `Listo: ${r.nuevas} cuentas nuevas y ${r.modificadas} modificadas.` })
      setPreview(null); setCarga(null)
    } catch (e: any) {
      setMsg({ ok: false, texto: e.message ?? 'Error aplicando' })
    } finally { setBusy(false) }
  }

  const hayCambios = preview && (preview.diff.nuevas.length + preview.diff.modificadas.length) > 0

  return (
    <div className="bg-panel rounded-xl border border-gray-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-tinta font-slab">Maestro de cuentas</h2>
          <p className="text-[11px] text-gray-400">{filas.length} de {plan.cuentas.length} cuentas · versión {plan.version}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-tinta border border-gray-200 rounded-lg hover:bg-surface">
            <Download className="h-3.5 w-3.5" /> Exportar Excel / plantilla
          </button>
          {esAdmin && (
            <button disabled={busy} onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-cabecera rounded-lg hover:bg-cabecera-alt disabled:opacity-50">
              <Upload className="h-3.5 w-3.5" /> Actualizar desde Excel
            </button>
          )}
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
      </div>

      {msg && (
        <div className={`mx-5 mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {msg.ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} {msg.texto}
        </div>
      )}

      {preview && carga && (
        <div className="mx-5 mt-3 p-4 rounded-lg border border-gray-200 bg-surface text-xs space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-tinta">Vista previa: {carga.nombre}</p>
            <button onClick={() => { setPreview(null); setCarga(null) }} className="text-gray-400 hover:text-tinta"><X className="h-4 w-4" /></button>
          </div>
          {!preview.valido ? (
            <div>
              <p className="text-red-700 font-medium mb-1">{preview.totalErrores} error(es). Corrige el Excel y vuelve a subirlo; no se aplicó nada.</p>
              <ul className="max-h-48 overflow-auto list-disc pl-5 text-red-700">
                {preview.errores.map((e, i) => <li key={i}>Fila {e.fila}{e.columna ? ` · ${e.columna}` : ''}: {e.mensaje}</li>)}
              </ul>
            </div>
          ) : (
            <>
              <p className="text-gray-600">
                Modo <b>Actualizar</b> (no borra): <b>{preview.diff.nuevas.length}</b> nuevas · <b>{preview.diff.modificadas.length}</b> modificadas · {preview.diff.sinCambio} sin cambio
                {preview.diff.noIncluidas > 0 && ` · ${preview.diff.noIncluidas} cuentas actuales no vienen en el archivo y se mantienen`}
              </p>
              {preview.diff.nuevas.length > 0 && (
                <table className="w-full"><thead><tr className="text-[10px] text-gray-400 uppercase"><th className="text-left">Nueva</th><th className="text-left">Descripción</th><th>Familia</th></tr></thead>
                  <tbody>{preview.diff.nuevas.map(c => <tr key={c.codigo} className="text-emerald-700"><td className="font-mono">{c.codigo}</td><td>{c.descripcion}</td><td className="text-center">{c.familiaCodigo} {c.letra}</td></tr>)}</tbody></table>
              )}
              {preview.diff.modificadas.length > 0 && (
                <table className="w-full"><thead><tr className="text-[10px] text-gray-400 uppercase"><th className="text-left">Modificada</th><th className="text-left">Antes</th><th className="text-left">Después</th></tr></thead>
                  <tbody>{preview.diff.modificadas.map(m => <tr key={m.antes.codigo}><td className="font-mono">{m.antes.codigo}</td><td className="text-gray-400 line-through">{m.antes.descripcion}</td><td className="text-blue-700">{m.despues.descripcion}</td></tr>)}</tbody></table>
              )}
              <div className="flex gap-2">
                <button disabled={busy || !hayCambios} onClick={aplicar} className="px-4 py-2 font-medium text-white bg-cabecera rounded-lg disabled:opacity-50">
                  {hayCambios ? 'Confirmar y aplicar' : 'Sin cambios'}
                </button>
                <button onClick={() => { setPreview(null); setCarga(null) }} className="px-4 py-2 border border-gray-200 rounded-lg">Cancelar</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 px-5 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar código o descripción" className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg" />
        </div>
        <select value={familia} onChange={e => setFamilia(e.target.value)} className="px-2 py-2 text-xs border border-gray-200 rounded-lg">
          <option value="">Todas las familias</option>
          {plan.familias.map(f => <option key={f.codigo} value={f.codigo}>{f.codigo} · {f.nombre}</option>)}
        </select>
        <select value={letra} onChange={e => setLetra(e.target.value)} className="px-2 py-2 text-xs border border-gray-200 rounded-lg">
          <option value="">Todas las letras</option>
          {letras.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="max-h-[60vh] overflow-auto px-5 pb-4">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel">
            <tr className="text-[10px] text-gray-400 uppercase tracking-wider">
              {COLUMNAS_CUENTAS.map(c => <th key={c} className="px-3 py-1.5 text-left">{c}</th>)}
              <th className="px-3 py-1.5 text-left">familia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map(c => (
              <tr key={c.codigo} className="hover:bg-surface">
                <td className="px-3 py-1.5 font-mono text-tinta font-medium">{c.codigo}</td>
                <td className="px-3 py-1.5 text-gray-600">{c.descripcion}</td>
                <td className="px-3 py-1.5 text-gray-500">{c.familiaCodigo}</td>
                <td className="px-3 py-1.5 text-gray-500">{c.letra}</td>
                <td className="px-3 py-1.5 text-[11px] text-gray-400">{famPorCodigo.get(c.familiaCodigo)?.nombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <p className="text-xs text-gray-400 italic py-4 text-center">Sin resultados</p>}
      </div>
    </div>
  )
}
