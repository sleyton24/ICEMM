/**
 * Distribución Beta por el método de momentos y su acumulada.
 *
 * Es la F(τ) = BETADIST(τ; α; β) de la planilla de Esteban. La fracción
 * incompleta regularizada sigue Numerical Recipes (Lentz); con α ≈ 1,58 y
 * β ≈ 1,77 reproduce la columna «Curva característica» del Excel.
 */

const LANCZOS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
]

function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  const zz = z - 1
  let x = LANCZOS[0]
  for (let i = 1; i < LANCZOS.length; i++) x += LANCZOS[i] / (zz + i)
  const t = zz + LANCZOS.length - 1.5
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
}

function betacf(a: number, b: number, x: number): number {
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-30) d = 1e-30
  d = 1 / d
  let h = d
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 3e-14) return h
  }
  throw new Error('La fracción continua de la Beta no convergió.')
}

/** F(x) = P(X ≤ x) para X ~ Beta(α, β). */
export function betaCdf(alpha: number, beta: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = lgamma(alpha) + lgamma(beta) - lgamma(alpha + beta)
  const front = Math.exp(alpha * Math.log(x) + beta * Math.log(1 - x) - lbeta)
  if (x < (alpha + 1) / (alpha + beta + 2)) {
    return (front / alpha) * betacf(alpha, beta, x)
  }
  return 1 - (Math.exp(beta * Math.log(1 - x) + alpha * Math.log(x) - lbeta) / beta) * betacf(beta, alpha, 1 - x)
}
