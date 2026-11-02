// E2E contra staging (:3101). Uso: node e2e.mjs <pwd>
import * as XLSX from '/opt/icemm-staging/frontend/node_modules/xlsx/xlsx.mjs'
const B = 'http://127.0.0.1:3101/api', P = process.argv[2]
const login = async e => (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: P }) })).json()).token
const call = async (t, m, p, b) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t }, body: b && JSON.stringify(b) }); return [r.status, await r.json().catch(() => null)] }
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1 }
const A = await login('qa-admin@staging.local'), E = await login('qa-editor@staging.local')
const [, g] = await call(A, 'GET', '/plan-cuentas')
ok(g.plan?.cuentas.length === 188 && g.plan.familias.length === 9, 'GET plan desde DB: 188 cuentas / 9 familias')
const header = ['codigo', 'descripcion', 'familiaCodigo', 'letra']
const rows = g.plan.cuentas.map(c => [c.codigo, c.descripcion, c.familiaCodigo, c.letra])
// simula Excel real: escribir y leer xlsx
const ws = XLSX.utils.aoa_to_sheet([header, ...rows.slice(0, 3).map((r, i) => i === 0 ? [r[0], r[1] + ' (QA)', r[2], r[3]] : r), [199, 'Cuenta QA nueva', 100, 'M']])
const wb = XLSX.read(XLSX.write({ SheetNames: ['cuentas'], Sheets: { cuentas: ws } }, { type: 'buffer', bookType: 'xlsx' }))
const aoa = XLSX.utils.sheet_to_json(wb.Sheets.cuentas, { header: 1, raw: true, defval: null })
const body = { header: aoa[0], rows: aoa.slice(1) }
let [s] = await call(E, 'POST', '/plan-cuentas/cuentas/preview', body); ok(s === 403, `editor preview → ${s}`)
;[s] = await call(E, 'POST', '/plan-cuentas/cuentas/aplicar', body); ok(s === 403, `editor aplicar → ${s}`)
;[s] = await call(E, 'POST', '/plan-cuentas', { version: 'x', familias: [], cuentas: [] }); ok(s === 403, `editor POST / (reemplazo antiguo) → ${s}`)
let [, bad] = await call(A, 'POST', '/plan-cuentas/cuentas/preview', { header: ['codigo', 'desc', 'familiaCodigo', 'letra'], rows })
ok(bad.valido === false && bad.errores[0].fila === 1, 'columnas malas → rechazado: ' + bad.errores[0].mensaje)
;[, bad] = await call(A, 'POST', '/plan-cuentas/cuentas/preview', { header, rows: [[101, 'a', 100, 'M'], [101, 'b', 100, 'M'], [905, 'x', 950, 'M']] })
ok(bad.valido === false && bad.totalErrores === 2, 'duplicado + familia inexistente → ' + bad.errores.map(e => e.mensaje).join(' | '))
;[s] = await call(A, 'POST', '/plan-cuentas/cuentas/aplicar', { header, rows: [[101, 'a', 100, 'M'], [101, 'b', 100, 'M']] }); ok(s === 400, `aplicar con errores → ${s}`)
const [, pv] = await call(A, 'POST', '/plan-cuentas/cuentas/preview', body)
ok(pv.valido && pv.diff.nuevas.length === 1 && pv.diff.modificadas.length === 1 && pv.diff.sinCambio === 2 && pv.diff.noIncluidas === 185, `preview: +${pv.diff.nuevas.length} nuevas, ${pv.diff.modificadas.length} mod, ${pv.diff.noIncluidas} no incluidas`)
const [, g2] = await call(A, 'GET', '/plan-cuentas'); ok(g2.plan.cuentas.length === 188, 'preview no modifica la DB')
;[s] = await call(A, 'POST', '/plan-cuentas/cuentas/aplicar', { ...body, baseId: 'otro' }); ok(s === 409, `baseId desactualizado → ${s}`)
const [s2, ap] = await call(A, 'POST', '/plan-cuentas/cuentas/aplicar', { ...body, baseId: pv.baseId }); ok(s2 === 200 && ap.nuevas === 1 && ap.modificadas === 1, `aplicar → ${s2} ${JSON.stringify({ n: ap.nuevas, m: ap.modificadas })}`)
const [, g3] = await call(A, 'GET', '/plan-cuentas')
ok(g3.plan.cuentas.length === 189 && g3.plan.cuentas.find(c => c.codigo === 199) && g3.plan.cuentas[0].descripcion.endsWith('(QA)'), 'DB: 189 cuentas, nada borrado, cambio aplicado')
