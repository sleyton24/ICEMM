"""
Deriva las curvas por cuenta a partir del consolidado crudo de EMM.

Es la misma receta con la que EMM construyó las curvas por familia —validada
contra `curvas-base.json`: reproduce las 40 curvas existentes exacto, hasta el
redondeo a 5 decimales del artefacto— aplicada un nivel más abajo.

Receta, por obra y por cuenta:
  1. Recortar la serie mensual a la ventana efectiva (mes_ini_ef, dur_ef).
     La ventana es de la OBRA, no de la cuenta: normalizar cada cuenta contra
     su propia ventana pondría a todas a empezar en 0 y terminar en 1 el mismo
     día, que es justo la información que se quiere conservar (la instalación
     de faenas gasta temprano; la post venta, tarde).
  2. Acumular y normalizar por el total de la cuenta en esa ventana → 0..1.
  3. Normalizar el tiempo por la duración efectiva → 0..1.
  4. Interpolar sobre la grilla de 21 puntos, anclando el (0,0).

Uso:
  python scripts/build_curvas_cuenta.py [ruta/al/consolidado_crudo.json]

Sin argumento lo lee del zip `Prediccion de curvas.zip` en la raíz del repo.
Escribe frontend/src/features/prediccion/modelo/bundled/curvas-cuenta.json
"""
import collections
import io
import json
import os
import sys
import zipfile

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(RAIZ, 'frontend/src/features/prediccion/modelo/bundled/curvas-base.json')
SALIDA = os.path.join(RAIZ, 'frontend/src/features/prediccion/modelo/bundled/curvas-cuenta.json')
ZIP = os.path.join(RAIZ, 'Prediccion de curvas.zip')

# El primer dígito del código es la familia. Verificado: las cuentas suman el
# monto de su familia con 0,000000% de discrepancia en las 40 combinaciones.
FAMILIA_POR_DIGITO = {
    '1': 'materiales',
    '2': 'mano_obra',
    '3': 'subcontratos',
    '4': 'gastos_generales',
    '5': 'equipos',
}

# Una curva con 3 puntos es una escalera, no una curva. Y una cuenta que
# aparece en 2 obras no tiene con qué promediar: el modelo pondera por
# similitud entre obras, y con dos vecinos la ponderación no discrimina.
MIN_MESES_ACTIVOS = 4
MIN_OBRAS = 3

DECIMALES = 5  # el mismo redondeo que usa curvas-base.json


def cargar_consolidado(ruta=None):
    if ruta:
        with io.open(ruta, encoding='utf-8') as f:
            return json.load(f)
    z = zipfile.ZipFile(ZIP)
    interno = zipfile.ZipFile(io.BytesIO(z.read('predictor_curvas_fase2.zip')))
    return json.loads(interno.read('handoff/data/consolidado_crudo.json'))


def curva_normalizada(serie, i0, dur, grid):
    """Curva acumulada 0..1 sobre la grilla, o None si no hay con qué."""
    seg = np.asarray(serie[i0:i0 + dur], dtype=float)
    if seg.size == 0:
        return None, 0.0, 0
    activos = int((seg > 0).sum())
    acum = np.cumsum(seg)
    total = float(acum[-1])
    if total <= 0 or activos < MIN_MESES_ACTIVOS:
        return None, total, activos
    acum = acum / total
    t = np.arange(1, len(acum) + 1) / len(acum)
    curva = np.interp(grid, np.concatenate([[0], t]), np.concatenate([[0], acum]))
    return curva, total, activos


def main():
    consolidado = cargar_consolidado(sys.argv[1] if len(sys.argv) > 1 else None)
    with io.open(BASE, encoding='utf-8') as f:
        base = json.load(f)

    grid = np.asarray(base['grid'], dtype=float)
    nombres_obra = [o['nombre'] for o in base['obras']]

    # acumulado[codigo][obra] = (curva, share)
    acumulado = collections.defaultdict(dict)
    descartes = collections.Counter()

    for meta in base['obras']:
        obra = consolidado['obras'][meta['nombre']]
        i0 = obra['meses'].index(meta['mes_ini_ef'])
        dur = meta['dur_ef']
        # El denominador del share tiene que ser el MISMO que usan las familias
        # en curvas-base.json: el total de obra completo, sobre la serie entera
        # y no sobre la ventana efectiva.
        #
        # Es lo que hace build_modelo.py para las familias
        # (sum(familias[f].monto) / total_obra, sin recortar), y proyectar.py
        # multiplica los dos niveles por el mismo `total = contrato x ejec`.
        # Con denominadores distintos, una cuenta que gasta fuera de la ventana
        # —post venta, por ejemplo— quedaba subvaluada: la 348 de Vicente
        # Valdés gasta UF 736,9 fuera de la ventana y salía un 17,5% baja.
        #
        # La curva SÍ se recorta a la ventana: es una forma, y la ventana
        # efectiva es lo que define el ciclo. Forma y nivel se miden distinto.
        total_obra = float(obra['total_obra'])

        for codigo, serie in obra['cuentas'].items():
            if codigo[0] not in FAMILIA_POR_DIGITO:
                descartes['familia desconocida'] += 1
                continue
            curva, total, activos = curva_normalizada(serie, i0, dur, grid)
            if curva is None:
                descartes['sin gasto' if total <= 0 else 'menos de %d meses activos' % MIN_MESES_ACTIVOS] += 1
                continue
            total_completo = float(np.asarray(serie, dtype=float).sum())
            acumulado[codigo][meta['nombre']] = (curva, total_completo / total_obra)

    cuentas = collections.OrderedDict()
    for codigo in sorted(acumulado):
        por_obra = acumulado[codigo]
        if len(por_obra) < MIN_OBRAS:
            descartes['presente en menos de %d obras' % MIN_OBRAS] += 1
            continue
        # Alineado al orden de curvas-base.obras; null donde la obra no la tiene.
        curvas = [
            [round(float(x), DECIMALES) for x in por_obra[n][0]] if n in por_obra else None
            for n in nombres_obra
        ]
        shares = [round(por_obra[n][1], 6) if n in por_obra else None for n in nombres_obra]
        presentes = np.array([c for c in curvas if c is not None], dtype=float)
        # Las curvas pueden BAJAR. Un mes negativo —nota de crédito,
        # reclasificación— hace retroceder el acumulado. No se aplanan a
        # monótonas: eso inflaría el tramo temprano y escondería un hecho
        # contable que también está dentro de las curvas de familia. Se mide la
        # caída máxima para que la UI pueda declararlo.
        caida = float(np.max(np.maximum.accumulate(presentes, axis=1) - presentes)) if presentes.size else 0.0
        cuentas[codigo] = {
            'codigo': codigo,
            'familia': FAMILIA_POR_DIGITO[codigo[0]],
            'nObras': len(por_obra),
            'shareMedio': round(float(np.mean([s for s in shares if s is not None])), 6),
            'curvas': curvas,
            'shares': shares,
            'media': [round(float(x), DECIMALES) for x in presentes.mean(axis=0)],
            'desv': [round(float(x), DECIMALES) for x in presentes.std(axis=0)],
            'caidaMax': round(caida, DECIMALES),
        }

    salida = collections.OrderedDict()
    salida['grid'] = base['grid']
    salida['obras'] = nombres_obra
    salida['familias'] = base['familias']
    salida['criterio'] = {
        'minMesesActivos': MIN_MESES_ACTIVOS,
        'minObras': MIN_OBRAS,
        'ventana': 'efectiva de la obra (mes_ini_ef, dur_ef)',
    }
    salida['cuentas'] = cuentas

    with io.open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')

    # Cobertura honesta: por obra, qué fracción de SU gasto en ventana quedó
    # cubierta por las cuentas incluidas. Promediar `shareMedio` sobre cuentas
    # da más de 100%, porque el share de una cuenta presente en 3 obras está
    # promediado sobre 3, no sobre 8.
    coberturas = []
    for i, nombre in enumerate(nombres_obra):
        cubierto = sum(
            c['shares'][i] for c in cuentas.values() if c['shares'][i] is not None
        )
        coberturas.append(cubierto)
    print('escrito %s' % os.path.relpath(SALIDA, RAIZ))
    print('  %d cuentas · %.1f KB' % (len(cuentas), os.path.getsize(SALIDA) / 1024))
    print('  cobertura del gasto en ventana, por obra:')
    for nombre, cob in zip(nombres_obra, coberturas):
        print('    %-24s %5.1f%%' % (nombre, cob * 100))
    print('    %-24s %5.1f%%' % ('PROMEDIO', float(np.mean(coberturas)) * 100))
    print('  descartes:')
    for motivo, n in descartes.most_common():
        print('    %-40s %4d' % (motivo, n))


if __name__ == '__main__':
    main()
