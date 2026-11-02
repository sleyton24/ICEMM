import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validarCargaCuentas, diffCuentas, aplicarActualizar, COLUMNAS_CUENTAS } from './maestroCuentas.js'

const plan = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../frontend/src/features/plan-cuentas/bundled/plan-cuentas.json'), 'utf-8'))
const H = [...COLUMNAS_CUENTAS]
const filasPlan = () => plan.cuentas.map((c: any) => [c.codigo, c.descripcion, c.familiaCodigo, c.letra])

test('plan bundleado: 9 familias, 188 cuentas, se valida sin errores y sin cambios', () => {
  assert.equal(plan.familias.length, 9)
  assert.equal(plan.cuentas.length, 188)
  const { errores, cuentas } = validarCargaCuentas(H, filasPlan(), plan.familias)
  assert.deepEqual(errores, [])
  const d = diffCuentas(plan.cuentas, cuentas)
  assert.equal(d.sinCambio, 188); assert.equal(d.nuevas.length, 0); assert.equal(d.modificadas.length, 0)
})

test('rechaza columnas distintas, faltantes o en otro orden', () => {
  for (const h of [['codigo', 'descripcion', 'familiaCodigo'], ['descripcion', 'codigo', 'familiaCodigo', 'letra'], ['Codigo', 'descripcion', 'familiaCodigo', 'letra'], [...H, 'extra']]) {
    const r = validarCargaCuentas(h, filasPlan(), plan.familias)
    assert.equal(r.errores.length, 1); assert.equal(r.errores[0].fila, 1); assert.equal(r.cuentas.length, 0)
  }
})

test('tipos, familia inexistente, letra y rango', () => {
  const r = validarCargaCuentas(H, [
    ['abc', 'X', 100, 'M'],      // código no entero
    [101.5, 'X', 100, 'M'],      // decimal
    [150, '', 100, 'M'],         // descripción vacía
    [1050, 'X', 1000, 'Z'],      // familia no existe
    [151, 'X', 100, 'O'],        // letra no calza
    [251, 'X', 100, 'M'],        // código fuera de familia
  ], plan.familias)
  const cols = r.errores.map(e => `${e.fila}:${e.columna}`)
  assert.deepEqual(cols, ['2:codigo', '3:codigo', '4:descripcion', '5:familiaCodigo', '6:letra', '7:codigo'])
  assert.equal(r.cuentas.length, 0)
})

test('duplicados en el archivo', () => {
  const r = validarCargaCuentas(H, [[150, 'A', 100, 'M'], [150, 'B', 100, 'M']], plan.familias)
  assert.equal(r.errores.length, 1); assert.match(r.errores[0].mensaje, /duplicado.*fila 2/)
})

test('acepta códigos como texto, letra en minúscula e ignora filas vacías', () => {
  const r = validarCargaCuentas(H, [['150', ' Nueva ', '100', 'm'], [null, '', undefined, '']], plan.familias)
  assert.deepEqual(r.errores, [])
  assert.deepEqual(r.cuentas, [{ codigo: 150, descripcion: 'Nueva', familiaCodigo: 100, letra: 'M' }])
})

test('archivo sin datos es error', () => {
  assert.equal(validarCargaCuentas(H, [], plan.familias).errores.length, 1)
})

test('Actualizar: upsert sin borrar', () => {
  const primera = plan.cuentas[0]
  const entrantes = [{ ...primera, descripcion: 'Cambiada' }, { codigo: 199, descripcion: 'Nueva', familiaCodigo: 100, letra: 'M' }]
  const d = diffCuentas(plan.cuentas, entrantes)
  assert.equal(d.nuevas.length, 1); assert.equal(d.modificadas.length, 1); assert.equal(d.noIncluidas, 187)
  const res = aplicarActualizar(plan.cuentas, entrantes)
  assert.equal(res.length, 189)
  assert.equal(res.find(c => c.codigo === primera.codigo)!.descripcion, 'Cambiada')
  for (const c of plan.cuentas) assert.ok(res.some(x => x.codigo === c.codigo))
  assert.deepEqual(res.map(c => c.codigo), [...res.map(c => c.codigo)].sort((a, b) => a - b))
})
