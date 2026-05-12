import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ── Auto-limpieza de localStorage entre versiones ────────────────────────────
// Cada release con cambios estructurales debe BUMPear este número.
// Si el browser tiene una versión distinta guardada, limpia todo el storage
// para evitar que datos viejos rompan la app (tokens, mock users, IDs, etc.)
const SCHEMA_VERSION = '2026-05-08-2'
const STORED = localStorage.getItem('icemm.schemaVersion')
if (STORED !== SCHEMA_VERSION) {
  // Conservar el token de auth si existe (para no obligar a re-loguear sin necesidad)
  const token = localStorage.getItem('icemm.auth.token')
  localStorage.clear()
  if (token) localStorage.setItem('icemm.auth.token', token)
  localStorage.setItem('icemm.schemaVersion', SCHEMA_VERSION)
}

// Desregistrar cualquier service worker viejo (por si acaso)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister())
  }).catch(() => { /* ignore */ })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
