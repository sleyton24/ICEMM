import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5177,
    strictPort: true,
    proxy: {
      // Redirige /api/* a backend del VPS (mismo origen para el browser → sin CORS).
      // Tiene que ser el host nip.io, no la IP: la IP cruda está cerrada a
      // propósito (return 444) y el certificado se emitió para este nombre.
      '/api': {
        target: 'https://icemm.187.127.29.98.nip.io',
        changeOrigin: true,
      },
    },
  },
})
