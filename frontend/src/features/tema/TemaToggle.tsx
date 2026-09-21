import { Sun, Moon } from 'lucide-react'
import { useTemaStore } from './TemaStore'

/**
 * Par sol/luna de la barra superior. Se muestran las dos opciones en vez de un
 * solo icono que cambia: así se ve cuál está activa sin tener que interpretar
 * si el icono representa el estado actual o el que se va a aplicar.
 */
export default function TemaToggle() {
  const tema = useTemaStore(s => s.tema)
  const setTema = useTemaStore(s => s.setTema)
  const oscuro = tema === 'oscuro'

  return (
    <div
      role="group"
      aria-label="Tema de la interfaz"
      className="flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded-full p-0.5"
    >
      <button
        type="button"
        onClick={() => setTema('claro')}
        aria-pressed={!oscuro}
        title="Tema claro"
        className={`flex items-center justify-center w-7 h-6 rounded-full transition-colors ${
          oscuro ? 'text-gray-400 hover:text-gray-600' : 'bg-panel text-tinta shadow-sm'
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTema('oscuro')}
        aria-pressed={oscuro}
        title="Tema oscuro"
        className={`flex items-center justify-center w-7 h-6 rounded-full transition-colors ${
          oscuro ? 'bg-cabecera-alt text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
