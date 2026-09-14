import { GRID } from './curvasBase'

/**
 * Interpolación lineal sobre la grilla, con anclajes en 0 y 1.
 * Para curvas acumuladas normalizadas.
 */
export function interp(curva: number[], t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return interpA(curva, t)
}

/** Interpolación lineal sin anclajes. Para series de desviación. */
export function interpA(arr: number[], t: number): number {
  const x = Math.max(0, Math.min(1, t)) * (GRID.length - 1)
  const i = Math.floor(x)
  const f = x - i
  return arr[i] + (arr[Math.min(i + 1, GRID.length - 1)] - arr[i]) * f
}

/** Sesgo: reparametriza el tiempo relativo con una potencia suave. */
export function skewT(t: number, s: number): number {
  if (!s) return t
  return Math.pow(t, Math.pow(2, s / 40))
}

/**
 * Suma "YYYY-MM" + n meses.
 *
 * Se calcula aritméticamente a propósito. El prototipo usa
 * `new Date(...).toISOString().slice(0,7)`, que convierte hora local a UTC: en
 * Chile (UTC-3) da el mes correcto, pero al este de Greenwich la medianoche
 * local cae el día anterior en UTC y todos los meses se corren uno atrás.
 */
export function sumarMeses(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const yy = Math.floor(total / 12)
  const mm = (total % 12) + 1
  return `${yy}-${String(mm).padStart(2, '0')}`
}
