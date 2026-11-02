"""
Arma la curva característica desde el consolidado vigente (12:06).

Lee `data/consolidado-2026-10-28/consolidado_1206.xlsx`:
  - gasto mensual por cuenta, 101–516 sin la 421 (familias 600/700/900 quedan fuera);
  - columna Q «Costo Construcción», la de fuente roja en INFORMACION.

La forma (lectura A, la del Excel de Esteban) es el costo real acumulado,
normalizado a 100% en la ventana 2%–98% y reescalado por 96%. El Costo
Construcción no es el denominador de esa forma: es el ancla del total,
total = CC × (real / CC).

La lectura B (normalizar sobre CC, el acumulado termina en real/CC) se
calcula con el mismo eje de tiempo y queda en el artefacto para que el
modelo la elija por configuración.

Las detenciones salen de `curva-gasto.config.json`. Por defecto Oasis Plaza
desde 2020-06, 4 meses: esos meses salen del eje y su gasto se conserva.

No reescribe las curvas de 21 puntos ni `curvas-cuenta.json`. Esa grilla es
la de la mezcla por similitud y tiene que seguir reproduciendo el prototipo.

Uso:
  python scripts/build_curvas_base.py
"""
from __future__ import annotations

import json
import math
import os
import re
from datetime import datetime

import numpy as np
from openpyxl import load_workbook

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(RAIZ, 'data/consolidado-2026-10-28/consolidado_1206.xlsx')
CONFIG = os.path.join(
    RAIZ, 'frontend/src/features/prediccion/modelo/curva-gasto.config.json',
)
BASE = os.path.join(
    RAIZ, 'frontend/src/features/prediccion/modelo/bundled/curvas-base.json',
)
FICHAS = os.path.join(
    RAIZ, 'frontend/src/features/prediccion/datos/bundled/fichas-emm.json',
)
SALIDA = os.path.join(
    RAIZ, 'frontend/src/features/prediccion/modelo/bundled/curvas-caracteristica.json',
)

# Hoja del consolidado → nombre con el que la obra vive en curvas-base.
HOJA_POR_NOMBRE = {
    'Raices del Taihuen': 'Taihuen',
    'Vicente Valdes': 'Valdes',
    'Hotel UGO': 'UGO',
    'Oasis Plaza': 'OP',
    'Rojas Magallanes': 'RM',
    'Europa': 'Europa',
    'Afluente': 'Afluente',
    'Manantial': 'Manantial',
}

# Valores de control del Excel (Gasto mensual / Curva característica).
# El script aborta si la regeneración se aparta de ellos.
CONTROL_OP_DA = 32.3790884263736
CONTROL_ALPHA = 1.58420407840753
CONTROL_BETA = 1.76751130081822


def num(celda):
    if isinstance(celda, bool) or celda is None:
        return None
    if isinstance(celda, (int, float)):
        return float(celda)
    return None


def es_rojo(celda):
    color = celda.font.color
    if color is None or color.rgb is None:
        return False
    rgb = str(color.rgb)
    return rgb.upper().endswith('FF0000')


def leer_informacion(path):
    """Columna Q solo si la fuente es roja. Devuelve filas de obra con CC."""
    valores = load_workbook(path, data_only=True)
    formulas = load_workbook(path, data_only=False)
    info_v = valores['INFORMACION']
    info_f = formulas['INFORMACION']
    obras = []
    # El bloque de costo arranca en la fila 17 (encabezado) y sigue hasta La Quebrada.
    for fila in range(18, 40):
        nombre = info_v[f'A{fila}'].value
        if not isinstance(nombre, str) or not nombre.strip():
            break
        q_f = info_f[f'Q{fila}']
        q_v = info_v[f'Q{fila}'].value
        if not es_rojo(q_f):
            raise SystemExit(f'INFORMACION!Q{fila} no tiene fuente roja; no es Costo Construcción.')
        cc = num(q_v)
        if cc is None or cc <= 0:
            raise SystemExit(f'INFORMACION!Q{fila} ({nombre}) no tiene un Costo Construcción numérico.')
        obras.append({
            'nombre': nombre.strip(),
            'm2': num(info_v[f'D{fila}'].value),
            'contrato': num(info_v[f'I{fila}'].value),
            'plazo': num(info_v[f'R{fila}'].value),
            'costo_construccion': cc,
        })
    valores.close()
    formulas.close()
    return obras


def leer_serie(ws, cuentas):
    meses = []
    filas = []
    for row in ws.iter_rows(max_col=80, values_only=True):
        if not row:
            continue
        cabeza = row[0]
        if cabeza == 'C.COSTO':
            for celda in row[1:]:
                if isinstance(celda, datetime):
                    meses.append(celda.strftime('%Y-%m'))
                else:
                    break
            continue
        if isinstance(cabeza, int) and meses:
            filas.append((cabeza, [float(x or 0) for x in row[1:1 + len(meses)]]))
    if not meses:
        raise SystemExit(f'La hoja {ws.title} no tiene encabezado C.COSTO.')
    n = len(meses)
    gasto = np.zeros(n)
    desde, hasta = cuentas['desde'], cuentas['hasta']
    excluir = set(cuentas['excluir'])
    for codigo, vals in filas:
        if desde <= codigo <= hasta and codigo not in excluir:
            gasto += np.asarray(vals[:n], dtype=float)
    return meses, gasto


def cruce(acum, umbral):
    """Tiempo continuo del primer cruce, sobre el acumulado máximo corrido."""
    corrido = np.maximum.accumulate(acum)
    for j in range(1, len(corrido)):
        if corrido[j] >= umbral - 1e-9 and corrido[j] > corrido[j - 1] + 1e-12:
            return (j - 1) + (umbral - corrido[j - 1]) / (corrido[j] - corrido[j - 1])
    return float(len(acum) - 1)


def valor_en(acum, t):
    if t <= 0:
        return float(acum[0])
    if t >= len(acum) - 1:
        return float(acum[-1])
    j = int(math.floor(t + 1e-12))
    f = t - j
    return float(acum[j] * (1 - f) + acum[j + 1] * f)


def solapa(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def fusionar(pausas):
    if not pausas:
        return []
    orden = sorted(pausas)
    out = [list(orden[0])]
    for a0, a1 in orden[1:]:
        if a0 <= out[-1][1]:
            out[-1][1] = max(out[-1][1], a1)
        else:
            out.append([a0, a1])
    return [tuple(p) for p in out]


def curva_de(gasto, pausas, a, b, lectura, costo_construccion, ngrid=41):
    """Curva S en la grilla. Lectura A termina en 1; lectura B, en real/CC."""
    acum = np.zeros(len(gasto) + 1)
    acum[1:] = np.cumsum(gasto)
    total = float(acum[-1])
    if total <= 0:
        raise SystemExit('Una obra quedó con costo real 0.')
    ti = cruce(acum, a * total)
    tt = cruce(acum, b * total)
    duracion = tt - ti
    pausas = fusionar(pausas)
    dentro = sum(solapa(p0, p1, ti, tt) for p0, p1 in pausas)
    da = duracion - dentro
    grilla = np.linspace(0, 1, ngrid)
    forma = np.empty(ngrid)
    for i, tau in enumerate(grilla):
        queda = float(tau * da)
        cursor = ti
        t = ti
        for p0, p1 in pausas:
            if p1 <= cursor + 1e-12:
                continue
            if p0 > cursor:
                tramo = p0 - cursor
                if queda <= tramo + 1e-12:
                    t = cursor + queda
                    queda = 0
                    break
                queda -= tramo
                cursor = p1
            else:
                cursor = max(cursor, p1)
        else:
            t = cursor + queda
        bruto = (valor_en(acum, t) - a * total) / ((b - a) * total)
        forma[i] = min(1.0, max(0.0, bruto))
    if lectura == 'B':
        forma = forma * (total / costo_construccion)
    return {
        'costo_real': total,
        'ti': ti,
        'tt': tt,
        'D': duracion,
        'Da': da,
        'curva': forma,
    }


def pausas_de(nombre, meses, detenciones):
    pausas = []
    for det in detenciones:
        if det['obra'] != nombre:
            continue
        if det['desde'] not in meses:
            raise SystemExit(
                f'{nombre} no tiene el mes {det["desde"]} en el registro; no se puede aplicar la detención.',
            )
        s0 = meses.index(det['desde'])
        pausas.append((s0, s0 + int(det['meses'])))
    return pausas


def ajustar_beta(curvas, grilla):
    media = np.mean(curvas, axis=0)
    mu = float(np.trapz(1 - media, grilla))
    varianza = float(2 * np.trapz(grilla * (1 - media), grilla) - mu ** 2)
    k = mu * (1 - mu) / varianza - 1
    return mu * k, (1 - mu) * k, media


def regresion(m2, duraciones):
    x = np.asarray(m2, dtype=float) / 1000
    y = np.asarray(duraciones, dtype=float)
    xm, ym = x.mean(), y.mean()
    pendiente = float(((x - xm) * (y - ym)).sum() / ((x - xm) ** 2).sum())
    intercepto = float(ym - pendiente * xm)
    residuo = y - (intercepto + pendiente * x)
    ss_tot = float(((y - ym) ** 2).sum())
    ss_res = float((residuo ** 2).sum())
    r2 = 1 - ss_res / ss_tot
    error = math.sqrt(ss_res / (len(y) - 2))
    return {
        'intercepto': intercepto,
        'pendientePorMilM2': pendiente,
        'r2': r2,
        'errorEstandar': error,
    }


def insertar_en_linea(texto, ancla, extra):
    """Inserta campos JSON justo después de un literal único, sin reformatear el resto."""
    if ancla not in texto:
        raise SystemExit(f'No está en el archivo: {ancla}')
    patron = re.escape(ancla) + r'(?:,"costo_construccion":[0-9.eE+-]+)?(?:"ejec_cc":[0-9.eE+-]+,)?'
    # El ancla de la ficha ya trae la coma final. El de curvas-base no.
    return texto.replace(ancla, ancla + extra, 1)


def main():
    with open(CONFIG, encoding='utf-8') as f:
        config = json.load(f)
    meta = leer_informacion(XLSX)
    por_nombre = {o['nombre']: o for o in meta}
    faltan = [n for n in HOJA_POR_NOMBRE if n not in por_nombre]
    if faltan or 'La Quebrada' not in por_nombre:
        raise SystemExit(f'Faltan obras en INFORMACION: {faltan}')

    libro = load_workbook(XLSX, data_only=True, read_only=True)
    series = []
    for nombre, hoja in HOJA_POR_NOMBRE.items():
        meses, gasto = leer_serie(libro[hoja], config['cuentas'])
        ficha = por_nombre[nombre]
        series.append({
            'nombre': nombre,
            'sheet': hoja,
            'm2': ficha['m2'],
            'plazo': ficha['plazo'],
            'contrato': ficha['contrato'],
            'costo_construccion': ficha['costo_construccion'],
            'meses': meses,
            'gasto': [float(x) for x in gasto],
        })
    libro.close()

    a = float(config['umbralInicio'])
    b = float(config['umbralTermino'])
    detenciones = config['detenciones']

    def calibrar(dets, lectura):
        obras = []
        for serie in series:
            pausas = pausas_de(serie['nombre'], serie['meses'], dets)
            curva = curva_de(
                np.asarray(serie['gasto'], dtype=float),
                pausas, a, b, lectura, serie['costo_construccion'],
            )
            curva['nombre'] = serie['nombre']
            curva['m2'] = serie['m2']
            curva['ejec_cc'] = curva['costo_real'] / serie['costo_construccion']
            curva['costo_construccion'] = serie['costo_construccion']
            obras.append(curva)
        return obras

    obras_a = calibrar(detenciones, 'A')
    obras_b = calibrar(detenciones, 'B')
    obras_sin = calibrar([], 'A')
    grilla = np.linspace(0, 1, 41)
    alpha, beta, media = ajustar_beta([o['curva'] for o in obras_a], grilla)
    reg = regresion([o['m2'] for o in obras_a], [o['Da'] for o in obras_a])
    reg_sin = regresion([o['m2'] for o in obras_sin], [o['Da'] for o in obras_sin])
    op = next(o for o in obras_a if o['nombre'] == 'Oasis Plaza')
    op_sin = next(o for o in obras_sin if o['nombre'] == 'Oasis Plaza')

    if abs(op['Da'] - CONTROL_OP_DA) > 1e-6:
        raise SystemExit(f'Duración de Oasis Plaza {op["Da"]} ≠ {CONTROL_OP_DA}')
    if abs(alpha - CONTROL_ALPHA) > 1e-6 or abs(beta - CONTROL_BETA) > 1e-6:
        raise SystemExit(f'Beta {alpha}, {beta} no reproduce el Excel.')

    def compactar(obra, curva_b):
        return {
            'nombre': obra['nombre'],
            'ti': obra['ti'],
            'tt': obra['tt'],
            'D': obra['D'],
            'Da': obra['Da'],
            'costo_real': obra['costo_real'],
            'costo_construccion': obra['costo_construccion'],
            'ejec_cc': obra['ejec_cc'],
            'm2': obra['m2'],
            'curva': [float(x) for x in obra['curva']],
            'curvaSobreCC': [float(x) for x in curva_b],
        }

    por_b = {o['nombre']: o['curva'] for o in obras_b}
    cache_obras = [compactar(o, por_b[o['nombre']]) for o in obras_a]
    ejec_cc = float(np.mean([o['ejec_cc'] for o in obras_a]))

    artefacto = {
        'fuente': 'data/consolidado-2026-10-28/consolidado_1206.xlsx',
        'config': config,
        'series': series,
        'cache': {
            'alpha': alpha,
            'beta': beta,
            'ejecCC': ejec_cc,
            'grid': [float(x) for x in grilla],
            'promedio': [float(x) for x in media],
            'duracion': reg,
            'sinDetencion': {
                **reg_sin,
                'durOasisPlaza': op_sin['Da'],
            },
            'durOasisPlaza': op['Da'],
            'obras': cache_obras,
        },
    }
    with open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump(artefacto, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')

    with open(BASE, encoding='utf-8') as f:
        base_txt = f.read()
    base_txt = actualizar_base(base_txt, obras_a, por_nombre['La Quebrada']['costo_construccion'])
    with open(BASE, 'w', encoding='utf-8') as f:
        f.write(base_txt)

    with open(FICHAS, encoding='utf-8') as f:
        fichas_txt = f.read()
    fichas_txt = actualizar_fichas(fichas_txt, por_nombre)
    with open(FICHAS, 'w', encoding='utf-8') as f:
        f.write(fichas_txt)

    print(f'alpha {alpha:.6f}  beta {beta:.6f}')
    print(f'Oasis Plaza  antes {op_sin["Da"]:.2f} meses  R² {reg_sin["r2"]:.4f}')
    print(f'Oasis Plaza  después {op["Da"]:.2f} meses  R² {reg["r2"]:.4f}')
    print(f'ejecCC medio {ejec_cc:.6f}')
    print(f'escribió {os.path.relpath(SALIDA, RAIZ)}')


def actualizar_base(texto, obras, cc_quebrada):
    for obra in obras:
        # El contrato ya está en el JSON, con el literal que haya quedado.
        patron = rf'("nombre":"{re.escape(obra["nombre"])}".{{0,400}}?"contrato":)([0-9.eE+-]+)'
        encontrado = re.search(patron, texto)
        if not encontrado:
            raise SystemExit(f'No encontré el contrato de {obra["nombre"]} en curvas-base.json')
        literal = encontrado.group(2)
        ancla = f'"contrato":{literal}'
        extra = f',"costo_construccion":{json.dumps(obra["costo_construccion"])},"ejec_cc":{json.dumps(obra["ejec_cc"])}'
        texto = reemplazar_una_vez(texto, ancla, extra)
    ancla_q = None
    m = re.search(r'"monto_contrato":([0-9.eE+-]+)', texto)
    if not m:
        raise SystemExit('curvas-base.json no tiene monto_contrato de La Quebrada')
    texto = reemplazar_una_vez(texto, f'"monto_contrato":{m.group(1)}', f',"costo_construccion":{json.dumps(cc_quebrada)}')
    # Validar que sigue siendo JSON.
    json.loads(texto)
    return texto


def reemplazar_una_vez(texto, ancla, extra):
    patron = re.escape(ancla) + r'(?:,"costo_construccion":[0-9.eE+-]+(?:,"ejec_cc":[0-9.eE+-]+)?)?'
    nuevo, n = re.subn(patron, ancla + extra, texto, count=1)
    if n != 1:
        raise SystemExit(f'No pude insertar junto a {ancla}')
    return nuevo


def actualizar_fichas(texto, por_nombre):
    data = json.loads(texto)
    for nombre, ficha in data.items():
        if nombre not in por_nombre:
            raise SystemExit(f'La ficha {nombre} no está en el consolidado.')
        ficha['costoConstruccionUF'] = por_nombre[nombre]['costo_construccion']
    return json.dumps(data, ensure_ascii=False, indent=1) + '\n'


if __name__ == '__main__':
    main()
