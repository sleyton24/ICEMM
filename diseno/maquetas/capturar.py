"""
Captura las vistas del rediseño a PNG, para la presentación.

Los .dc.html no se pueden abrir solos: el runtime del canvas resuelve los
{{holes}} y reemplaza <x-dc>. Así que acá se arma un HTML autónomo por vista y
tema, sustituyendo la paleta. Las paletas se LEEN del propio .dc.html en vez de
copiarlas, para que una no quede vieja cuando la otra cambie.
"""
import io, re, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).parent
SALIDA = BASE / 'capturas'
SALIDA.mkdir(exist_ok=True)

VISTAS = [
    ('Main.dc.html', 'resumen', 1440, 1040),
    ('Costos.dc.html', 'costos', 1440, 1000),
]


def paleta(fuente: str, nombre: str) -> dict:
    """Extrae `const <nombre> = { clave: 'valor', ... };` del bloque de lógica."""
    m = re.search(r'const\s+' + nombre + r'\s*=\s*\{(.*?)\n    \};', fuente, re.S)
    if not m:
        raise SystemExit(f'No se encontró la paleta "{nombre}"')
    return dict(re.findall(r"(\w+):\s*'([^']*)'", m.group(1)))


def autonomo(fuente: str, tokens: dict) -> str:
    estilo = re.search(r'<helmet>(.*?)</helmet>', fuente, re.S).group(1)
    cuerpo = re.search(r'</helmet>(.*?)</x-dc>', fuente, re.S).group(1)

    # onClick del interruptor: no hay runtime, se saca
    cuerpo = re.sub(r'\s*onClick="\{\{[^}]+\}\}"', '', cuerpo)

    faltantes = set()
    def sub(m):
        clave = m.group(1)
        if clave not in tokens:
            faltantes.add(clave)
            return m.group(0)
        return tokens[clave]
    cuerpo = re.sub(r'\{\{t\.(\w+)\}\}', sub, cuerpo)

    # El alto fijo del artboard deja aire muerto abajo cuando el contenido es
    # mas corto. Para la presentacion se recorta al contenido real.
    cuerpo, n = re.subn(r'(width: 1440px;) height: \d+px;', lambda m: m.group(1), cuerpo, count=1)
    if n != 1:
        raise SystemExit('No se pudo quitar el alto fijo del artboard raiz')

    if faltantes:
        raise SystemExit(f'Tokens sin valor en la paleta: {sorted(faltantes)}')
    sobrantes = re.findall(r'\{\{[^}]+\}\}', cuerpo)
    if sobrantes:
        raise SystemExit(f'Quedaron holes sin resolver: {sorted(set(sobrantes))}')

    return f'<!doctype html><html><head><meta charset="utf-8">{estilo}</head><body>{cuerpo}</body></html>'


def main():
    generados = []
    for archivo, slug, w, h in VISTAS:
        fuente = io.open(BASE / archivo, encoding='utf-8').read()
        for tema, nombre_paleta in [('claro', 'claro'), ('oscuro', 'oscuroT')]:
            html = autonomo(fuente, paleta(fuente, nombre_paleta))
            destino = SALIDA / f'{slug}-{tema}.html'
            io.open(destino, 'w', encoding='utf-8').write(html)
            generados.append((destino, SALIDA / f'{slug}-{tema}.png', w, h))

    with sync_playwright() as p:
        b = p.chromium.launch()
        for origen, png, w, h in generados:
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2)
            errores = []
            pg.on('pageerror', lambda e: errores.append(str(e)))
            pg.goto(origen.as_uri(), wait_until='networkidle', timeout=60000)
            pg.wait_for_timeout(2200)   # que carguen las fuentes de Google
            alto = pg.evaluate('document.body.scrollHeight')
            pg.screenshot(path=str(png), full_page=True)
            # full_page nunca captura menos que el alto del viewport: si el
            # contenido es mas corto queda una banda del fondo del body abajo,
            # que en una lamina se ve como un recuadro blanco pegado.
            from PIL import Image
            im = Image.open(png)
            esperado = alto * 2   # device_scale_factor
            if im.height > esperado:
                im.crop((0, 0, im.width, esperado)).save(png)
                recorte = f'  (recortado {im.height - esperado}px)'
            else:
                recorte = ''
            print(f'  {png.name}  {w}x{alto}@2x{recorte}'
                  + (f'  ERRORES: {errores[:2]}' if errores else ''))
            pg.close()
        b.close()


if __name__ == '__main__':
    main()
