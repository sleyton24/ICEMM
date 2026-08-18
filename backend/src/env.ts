import 'dotenv/config'

/**
 * Configuración validada del backend.
 *
 * Este módulo se importa ANTES que cualquier otro (ver index.ts) y aborta el
 * arranque si la configuración es insegura para producción. Es la defensa de
 * los bloqueadores de Fase 0:
 *
 *   - Nunca arrancar en producción con BETA_MODE=true (auth desactivada).
 *   - Nunca firmar/verificar JWT con un secreto ausente, placeholder o débil.
 *   - Nunca permitir CORS abierto ("*") en producción.
 *
 * Preferimos fallar al arrancar (ruidoso, detectable) antes que arrancar con
 * un hueco de seguridad silencioso.
 */

function fatal(msg: string): never {
  console.error(`\n[FATAL] Configuración inválida: ${msg}\n`)
  process.exit(1)
}

const NODE_ENV = process.env.NODE_ENV ?? 'development'
const isProd = NODE_ENV === 'production'
const BETA_MODE = process.env.BETA_MODE === 'true'
// Escape hatch consciente para la demo interna en BETA sobre un server de prod.
const ALLOW_BETA_IN_PROD = process.env.ALLOW_BETA_IN_PROD === 'true'
const betaInProd = isProd && BETA_MODE && ALLOW_BETA_IN_PROD

// ── Bloqueador 1: BETA_MODE jamás en producción por accidente ────────────────
// En BETA toda la auth queda desactivada (acceso admin para cualquiera). En un
// server de producción eso solo se permite con opt-in explícito y ruidoso.
if (isProd && BETA_MODE && !ALLOW_BETA_IN_PROD) {
  fatal(
    'BETA_MODE=true con NODE_ENV=production. En BETA la API queda ABIERTA como admin ' +
      'sin login. Poné BETA_MODE=false para producción real. Si es una demo interna ' +
      'consciente (no expuesta a internet), setea ALLOW_BETA_IN_PROD=true.',
  )
}
if (betaInProd) {
  console.warn(
    '\n[ADVERTENCIA] BETA_MODE=true en producción: la API está ABIERTA como admin ' +
      'sin login (ALLOW_BETA_IN_PROD=true). Solo para demo interna — NO exponer a internet.\n',
  )
}

// ── Bloqueador 2: JWT_SECRET fuerte y presente ───────────────────────────────
const PLACEHOLDERS = new Set([
  'change-me-in-production',
  'replace-with-long-random-string',
])
const rawSecret = process.env.JWT_SECRET ?? ''

// El secreto se exige siempre que pueda usarse para firmar/verificar tokens:
// en producción siempre, y fuera de BETA en cualquier entorno.
const secretRequired = isProd || !BETA_MODE
if (secretRequired) {
  if (!rawSecret || PLACEHOLDERS.has(rawSecret) || rawSecret.length < 32) {
    fatal(
      'JWT_SECRET ausente, con valor placeholder, o de menos de 32 caracteres. ' +
        'Generá uno con:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
}

// ── Bloqueador 3: CORS explícito en producción ───────────────────────────────
// (La demo BETA es same-origin tras Nginx, así que no exigimos CORS explícito ahí.)
const corsRaw = (process.env.CORS_ORIGIN ?? '').trim()
if (isProd && !betaInProd && (corsRaw === '' || corsRaw === '*')) {
  fatal(
    'CORS_ORIGIN debe ser una lista explícita de orígenes en producción ' +
      '(p.ej. https://icemm.tudominio.com), nunca "*" ni vacío.',
  )
}

/** Orígenes CORS: "*" (solo permitido fuera de prod) o lista de orígenes. */
const corsOrigins: '*' | string[] =
  corsRaw === '' || corsRaw === '*'
    ? '*'
    : corsRaw.split(',').map((s) => s.trim()).filter(Boolean)

export const env = {
  NODE_ENV,
  isProd,
  BETA_MODE,
  PORT: Number(process.env.PORT ?? 3001),
  /** Vacío solo cuando BETA_MODE=true fuera de prod (entonces no se usa). */
  JWT_SECRET: rawSecret,
  CORS_ORIGINS: corsOrigins,
} as const
