"""
Informe de Costos – Proyecto La Quebrada
Ejecutar: python informe_lq.py
"""

import pyodbc
import pandas as pd
from datetime import datetime
import os
import sys

# ── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
SERVER   = "BNVSOFSQL"
DATABASE = "PRESTO"
FECHA_CORTE = "2026-03-31"      # <-- ajustar si es necesario
# Para Windows Auth dejar USER/PASSWORD vacíos; para SQL Auth, llenarlos
SQL_USER = "sleyton"
SQL_PASS = "20 Lyt 25$"

# ── PLAN DE CUENTAS MAESTRO ──────────────────────────────────────────────────
# Descripciones oficiales del Maestro Materiales ICEMM.
# Se usan para cuentas que existen en RealLQ pero no en pptoLQ.
MAESTRO = {
    # 100 - Materiales
    101: "Aridos, Bases, Rellenos", 102: "Cemento, Morteros, Estucos",
    103: "Acero, Planchas, Cal", 104: "Acero A63", 105: "Hormigones",
    106: "Clavos, Tornillos, Fijaciones, Alambres, Pernos",
    107: "Ladrillos, Enchapes", 108: "Quincalleria, Numeros, Señaletica",
    109: "Malla Raschel, Arpillera", 110: "Aditivos, Desmoldantes",
    111: "Puente adherente, Anclajes quimicos, Sikadur",
    112: "Madera, Pino, Alamo, Rottosa", 113: "OSB, Trupan, Cholguan, Melamina",
    114: "Discos, Brocas, Gratas, Soldadura",
    115: "Perfiles Fe, Platinas, Mallas, Hojalateria",
    116: "Terciados para Moldajes", 117: "Plasticos, Separadores, Polietileno",
    118: "Cierros, membrana, goterones, polietileno",
    119: "Impermeabilizantes, Igol, Cave", 120: "Volcanica, Volcanita",
    121: "Internit, Permarit, Covintec",
    122: "Artefactos Electricos y Gasfiteria",
    123: "Periferica para tabiques", 124: "Aislantes, Lana, Aislapol, Tyvek",
    125: "Alfombras, Fraques, Masillos",
    126: "Ceramicas, Porcelanatos, Piedra Pizarra",
    127: "Bisagras, Baldosas, Elem Prefabricados",
    128: "Vidrios y Aluminios", 129: "Puertas, Marcos",
    130: "Molduras, Guardapolvos, Cubrejuntas, Cornizas",
    131: "Griferia, Filtros", 132: "Accesorios de baño",
    133: "Artefactos de baño", 134: "Artefactos de cocina",
    135: "Luminarias, ampolletas", 136: "Papel Mural, Rafia",
    137: "Bolsas, Juntas, Siliconas", 138: "Equipamiento Edificio",
    139: "Radieres", 140: "Piso Vinilico, Piso Flotante, Piso SPC",
    141: "Alfombra, Otros Pavimentos", 142: "Pinturas, Barnices, Sellantes",
    143: "Materiales de Proteccion, Cartones, etc.",
    # 200 - Mano de Obra
    201: "Direccion de obra", 202: "Supervision de terreno",
    203: "Trazado", 204: "Administrativos", 205: "Otros Indirectos",
    206: "Jornales", 207: "Albañileria", 208: "Carpinteria OOGG",
    209: "Moldajes", 210: "Hormigones", 211: "Enfierradura",
    212: "Carpinteria Terminaciones", 213: "Yeseros, Rematadores",
    214: "Electrica", 215: "Sanitaria", 216: "Aseo",
    217: "Guardias y Rondines", 218: "Post Entrega Municipal",
    219: "Premios de Obra",
    # 300 - Subcontratos
    301: "Demolicion", 302: "Movimientos Tierra, Excavacion",
    303: "Socalzados, Entibaciones manuales",
    304: "Anclajes, Sostenimientos",
    305: "Excavacion Manual, Preparacion Cancha", 306: "Enfierradura",
    307: "Postensados, Montajes Prefabricados",
    308: "Colocacion Hormigones, Afinado Radier y Losa",
    309: "Carpinteria Moldajes, Montaje y Desmontaje Andamios",
    310: "Sanitario, Alcantarillado",
    311: "Central Agua Caliente, Paneles Solares", 312: "Impulsion, Bombas",
    313: "Electricidad, Canalizacion Corrientes debiles",
    314: "Corrientes Debiles y Telecomunicaciones",
    315: "Sistemas de Seguridad y Combate Contra Incendio",
    316: "Calefaccion, Climatizacion", 317: "Extraccion, Presurizacion",
    318: "Basuras", 319: "Estructuras, Carpinteria Metalica",
    320: "Impermeabilizaciones", 321: "Tabiquerias",
    322: "Cielos Modulares", 323: "Aislacion Termica y Acustica",
    324: "SC Yesos", 325: "SC Estucos, Afinados y Sobrelosas",
    326: "Ventanas, Aluminios y Espejos", 327: "Ventanas de PVC",
    328: "Carpinteria Terminacion", 329: "Ceramicas, Pavimentos",
    330: "SC Piso Vinilico, Piso Flotante, Piso SPC",
    331: "SC Alfombra, Otros Pavimentos", 332: "Revestimientos Terminacion",
    333: "Papel mural", 334: "Muebles y Closet",
    335: "Cubiertas Marmol, Granito", 336: "SC Pinturas, Barnices",
    337: "Barandas Vidriadas", 338: "SC Cubiertas, Hojalateria",
    339: "SC Maquillaje, Estuco Fachada", 340: "Revestimientos Fachada",
    341: "Enchapes, Piedra, P. Pizarra", 342: "Pavimentacion, Asfalto",
    343: "Piscinas, Piletas", 344: "Ascensores, Rampas",
    345: "Señalizacion, Demarcacion, Sello Pavimentos",
    346: "SC Obras Civiles", 347: "SC Urbanizacion, OOEE, TEP",
    348: "SC Serena, IMVI, Mitigaciones", 349: "Jardines, Riego",
    350: "Otros Especializados", 351: "Compañia Electrica", 352: "SC Aseo",
    353: "Sistemas Anticaidas, Empotrachadas", 354: "SC Cierros Perimetrales",
    355: "SC MO Varios, SC Habitabilidad",
    # 400 - Gastos Generales
    401: "Ensayo de Materiales", 402: "Consumos, Agua, Luz, Gas",
    403: "Permisos, Derechos, Certificaciones", 404: "Seguros, Boletas",
    405: "Honorarios Profesionales",
    406: "Mat Electricos y Sanitarios inst.Faen.",
    407: "Tableros Faena, Extensiones", 408: "Gastos de Nomina, Multas",
    409: "Prevencion y Seguridad", 410: "Equipos y Sistemas Oficinas de Obra",
    411: "Contenedores, Oficinas, Baños IFF", 412: "Caja Chica",
    413: "Combustibles, Lubricantes",
    414: "Empalmes Provisorios y Suministros", 415: "Art. Libreria y Escritorio",
    416: "Planos, Fotocopias, Formularios", 417: "Colaciones, Movilizacion",
    418: "Camiones y Vehiculos EMM", 419: "Fletes externos",
    420: "Retiro de escombros y excedentes", 421: "GG Oficina central",
    422: "Costo financiero", 423: "Asistencia Social, Beneficios, Cursos",
    424: "Elementos de Aseo IFF", 425: "Insumos de Trazado",
    426: "Materiales Construccion Instalacion de Faenas",
    427: "Sistema de Vigilancia, Servicio Guardias",
    # 500 - Equipos y Maquinarias
    501: "Trompas, Betoneras, Servicio de Bombeo", 502: "Vibrador, Cerchas",
    503: "Minicargador, Retroexcavadora, Minexcavadora", 504: "Grua Torre",
    505: "Gruas moviles, Camion Pluma", 506: "Andamios, Plataformas",
    507: "Taladros, Esmeriles, Soldadora",
    508: "Herramientas electricas especializadas",
    509: "Moldajes, Alzaprimas", 510: "Radios",
    511: "Nivel, Taquimetro, Estacion Total", 512: "Montacargas, Elevadores",
    513: "Grupos Generadores", 514: "Rodillos, Placas, Vibropisin",
    515: "Herramientas Menores Manuales (No Electricas)",
    516: "Insumos para herramientas electricas",
    517: "Alzador de persona, Genie",
    # 600 - Otros
    601: "Polizas y Sala de Ventas", 602: "Publicidad",
    603: "Imprevistos y no considerados", 604: "Costo Post Venta",
    605: "Utilidad, Honorario Construccion", 606: "Extras y/o Modificaciones",
    607: "Costo de estudio y/o Proyectos",
    # 700 - Edificaciones Comerciales
    701: "Materiales EC", 702: "Mano de Obra EC", 703: "Subcontratos EC",
    704: "Gastos Generales EC", 705: "Equipos y Maquinarias EC",
    706: "Otros EC",
    # 900 - Gastos Oficina Central
    901: "Recursos Humanos Of Central", 902: "Uso de softwares y redes",
    903: "Cuentas de servicio", 904: "Gastos Generales Oficina",
    905: "Arriendo Oficinas", 906: "Costos Financieros", 907: "Honorarios",
    908: "Creditos / Leasing / Leaseback", 909: "Arriendo bodega central",
    910: "Asesorias, Consultorias - Estudios", 911: "Marketing y Ventas",
    912: "Costos Legales", 913: "Directorio",
    914: "Proyectos de Especialidades",
}
# ──────────────────────────────────────────────────────────────────────────


def get_conn():
    if SQL_USER:
        cs = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={SERVER};DATABASE={DATABASE};"
            f"UID={SQL_USER};PWD={SQL_PASS};TrustServerCertificate=yes"
        )
    else:
        cs = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={SERVER};DATABASE={DATABASE};"
            "Trusted_Connection=yes;TrustServerCertificate=yes"
        )
    return pyodbc.connect(cs)


# ── PASO 0: Verificaciones previas ────────────────────────────────────────────
def verificar_schema(conn):
    print("=" * 60)
    print("VERIFICACION DE SCHEMA")
    print("=" * 60)

    # 1. Tipos de dato de las columnas de JOIN
    q_tipos = """
    SELECT
        'pptoLQ.Codigo2' AS columna,
        DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'pptoLQ' AND COLUMN_NAME = 'Código2'
    UNION ALL
    SELECT
        'RealLQ.concepto1',
        DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'RealLQ' AND COLUMN_NAME = 'concepto1'
    """
    df_tipos = pd.read_sql(q_tipos, conn)
    print("\n[JOIN] Tipos de dato:")
    print(df_tipos.to_string(index=False))

    tipo_ppto = df_tipos.loc[df_tipos['columna'].str.contains('pptoLQ'), 'DATA_TYPE'].values
    tipo_real = df_tipos.loc[df_tipos['columna'].str.contains('RealLQ'), 'DATA_TYPE'].values
    if len(tipo_ppto) and len(tipo_real):
        if tipo_ppto[0] != tipo_real[0]:
            print(f"\n  [!] ADVERTENCIA: tipos distintos ({tipo_ppto[0]} vs {tipo_real[0]})")
            print("     El JOIN usa CAST explicito - OK")
            return False
        else:
            print(f"\n  [OK] Tipos compatibles ({tipo_ppto[0]})")

    # 2. Registros con Fecha_contable NULL en RealLQ
    q_nulls = """
    SELECT COUNT(*) AS registros_null_fecha
    FROM [PRESTO].[dbo].[RealLQ]
    WHERE Fecha_contable IS NULL
    """
    df_nulls = pd.read_sql(q_nulls, conn)
    n_null = df_nulls['registros_null_fecha'].iloc[0]
    print(f"\n[FECHA] Registros con Fecha_contable NULL en RealLQ: {n_null}")
    if n_null > 0:
        print("  -> Se EXCLUIRAN del gasto real (son aperturas contables, no gastos)")

    return True


# ── PASO 1: Query principal ───────────────────────────────────────────────────
# Notas de diseño:
#   - RealLQ trackea al nivel Codigo2 (categoria), no al detalle de partida.
#     Para evitar producto cartesiano se pre-agrega RealLQ en un CTE antes del JOIN.
#   - exento_detalle_uf esta mal calculada en origen; se reconstruye como:
#       SUM(exento_detalle) * 100.0 / AVG(ValOR_UF)
#     donde ValOR_UF almacena el precio UF x 100 (ej: 3,973,179 -> UF 39,731.79 CLP).
#   - Se agrupa pptoLQ por Codigo2 sumando TotPres, ya que multiples partidas
#     comparten el mismo Codigo2 y RealLQ no distingue entre ellas.
QUERY = """
WITH real_agg AS (
    SELECT
        concepto1,
        SUM(exento_detalle) * 100.0 / NULLIF(AVG(ValOR_UF), 0) AS gasto_uf
    FROM [PRESTO].[dbo].[RealLQ]
    WHERE Fecha_contable <= ?
    GROUP BY concepto1
)
SELECT
    p.Código2                              AS codigo2,
    MIN(p.código)                          AS codigo,
    MIN(p.resumen)                         AS partida,
    MIN(p.Ud)                              AS ud,
    SUM(p.TotPres)                         AS ppto_original,
    COALESCE(r.gasto_uf, 0)               AS gasto_real
FROM [PRESTO].[dbo].[pptoLQ] p
LEFT JOIN real_agg r
    ON CAST(p.Código2 AS VARCHAR(50)) = CAST(r.concepto1 AS VARCHAR(50))
GROUP BY
    p.Código2, r.gasto_uf
ORDER BY MIN(p.código)
"""


QUERY_SIN_PARTIDA = """
SELECT
    r.concepto1,
    SUM(r.exento_detalle) * 100.0 / NULLIF(AVG(r.ValOR_UF), 0) AS gasto_uf
FROM [PRESTO].[dbo].[RealLQ] r
WHERE r.Fecha_contable <= ?
  AND NOT EXISTS (
      SELECT 1 FROM [PRESTO].[dbo].[pptoLQ] p
      WHERE CAST(p.Código2 AS VARCHAR(50)) = CAST(r.concepto1 AS VARCHAR(50))
  )
GROUP BY r.concepto1
HAVING SUM(r.exento_detalle) <> 0
ORDER BY gasto_uf DESC
"""


def cargar_datos(conn):
    df = pd.read_sql(QUERY, conn, params=[FECHA_CORTE])
    df['ppto_original'] = pd.to_numeric(df['ppto_original'], errors='coerce').fillna(0)
    df['gasto_real']    = pd.to_numeric(df['gasto_real'],    errors='coerce').fillna(0)

    df_sin = pd.read_sql(QUERY_SIN_PARTIDA, conn, params=[FECHA_CORTE])
    df_sin['gasto_uf'] = pd.to_numeric(df_sin['gasto_uf'], errors='coerce').fillna(0)

    # Integrar cuentas sin partida en pptoLQ a la tabla principal con ppto=0
    # usando las descripciones del plan de cuentas maestro
    if len(df_sin) > 0:
        filas_nuevas = []
        for _, row in df_sin.iterrows():
            cod = int(row['concepto1'])
            desc = MAESTRO.get(cod, f"Cuenta {cod} (sin descripcion)")
            filas_nuevas.append({
                'codigo2': cod,
                'codigo': str(cod),
                'partida': desc,
                'ud': '-',
                'ppto_original': 0.0,
                'gasto_real': row['gasto_uf'],
            })
        df_extras = pd.DataFrame(filas_nuevas)
        df = pd.concat([df, df_extras], ignore_index=True)

    # Ordenar por codigo2 numerico
    df['codigo2_num'] = pd.to_numeric(df['codigo2'], errors='coerce').fillna(0)
    df = df.sort_values('codigo2_num').drop(columns=['codigo2_num']).reset_index(drop=True)

    return df


# ── PASO 2: Calculos ─────────────────────────────────────────────────────────
def calcular_variaciones(df):
    df['variacion_uf'] = df['gasto_real'] - df['ppto_original']
    df['variacion_pct'] = df.apply(
        lambda r: (r['variacion_uf'] / r['ppto_original'] * 100)
        if r['ppto_original'] != 0 else None,
        axis=1
    )

    def estado(row):
        if row['gasto_real'] == 0:
            return 'SIN EJECUCION'
        if row['variacion_pct'] is None:
            return 'SOLO REAL'
        v = row['variacion_pct']
        if v > 15:
            return 'CRITICO'
        elif v > 5:
            return 'ALERTA'
        elif v >= -5:
            return 'EN CONTROL'
        else:
            return 'FAVORABLE'

    df['estado'] = df.apply(estado, axis=1)
    return df


# ── PASO 3: Generacion del informe Markdown ───────────────────────────────────
def generar_informe(df):
    hoy = datetime.today().strftime('%Y-%m-%d')
    ppto_total = df['ppto_original'].sum()
    real_total = df['gasto_real'].sum()
    var_total  = real_total - ppto_total
    var_pct    = var_total / ppto_total * 100 if ppto_total else 0
    ejec_pct   = real_total / ppto_total * 100 if ppto_total else 0

    # Cuentas que solo tienen gasto real (sin ppto)
    df_solo_real = df[df['estado'] == 'SOLO REAL']
    n_solo_real = len(df_solo_real)
    monto_solo_real = df_solo_real['gasto_real'].sum()

    conteos = df['estado'].value_counts()
    top5 = df[df['variacion_uf'] > 0].nlargest(5, 'variacion_uf')

    lines = []
    lines.append("# Informe de Costos - Proyecto La Quebrada")
    lines.append(f"**Fecha de corte:** {FECHA_CORTE}  |  **Generado:** {hoy}\n")

    if n_solo_real > 0:
        lines.append(f"> **Nota:** {n_solo_real} cuentas tienen gasto real (UF {monto_solo_real:,.2f}) sin presupuesto asignado en pptoLQ.")
        lines.append("> Se muestran en la tabla de control con ppto = 0 y estado SOLO REAL.\n")

    # KPIs
    lines.append("---")
    lines.append("## 1. KPIs Generales\n")
    lines.append("| Indicador | Valor |")
    lines.append("|-----------|-------|")
    lines.append(f"| Presupuesto original total | UF {ppto_total:,.2f} |")
    lines.append(f"| Gasto real total | UF {real_total:,.2f} |")
    lines.append(f"| Variacion total (UF) | UF {var_total:+,.2f} |")
    lines.append(f"| Variacion total (%) | {var_pct:+.1f}% |")
    lines.append(f"| % de ejecucion | {ejec_pct:.1f}% |")
    lines.append(f"| Partidas CRITICO | {conteos.get('CRITICO', 0)} |")
    lines.append(f"| Partidas ALERTA | {conteos.get('ALERTA', 0)} |")
    lines.append(f"| Partidas EN CONTROL | {conteos.get('EN CONTROL', 0)} |")
    lines.append(f"| Partidas FAVORABLE | {conteos.get('FAVORABLE', 0)} |")
    lines.append(f"| Partidas SIN EJECUCION | {conteos.get('SIN EJECUCION', 0)} |")
    lines.append(f"| Partidas SOLO REAL (sin ppto) | {conteos.get('SOLO REAL', 0)} |")

    # Tabla control
    lines.append("\n---")
    lines.append("## 2. Tabla de Control por Partida\n")
    lines.append("| Codigo | Partida | Ud | Ppto (UF) | Real (UF) | Var (UF) | Var (%) | Estado |")
    lines.append("|--------|---------|-----|-----------|-----------|----------|---------|--------|")
    for _, r in df.iterrows():
        var_str  = f"{r['variacion_uf']:+,.2f}"  if pd.notna(r['variacion_uf'])  else "-"
        vpct_str = f"{r['variacion_pct']:+.1f}%" if pd.notna(r['variacion_pct']) else "-"
        lines.append(
            f"| {r['codigo2']} | {r['partida']} | {r['ud']} "
            f"| {r['ppto_original']:,.2f} | {r['gasto_real']:,.2f} "
            f"| {var_str} | {vpct_str} | {r['estado']} |"
        )

    # Top 5
    lines.append("\n---")
    lines.append("## 3. Top 5 Partidas con Mayor Sobrecosto\n")
    if len(top5) == 0:
        lines.append("_Sin partidas con sobrecosto al corte._")
    else:
        lines.append("| # | Partida | Ppto (UF) | Real (UF) | Var (UF) | Var (%) | Observacion |")
        lines.append("|---|---------|-----------|-----------|----------|---------|-------------|")
        for i, (_, r) in enumerate(top5.iterrows(), 1):
            vpct = f"{r['variacion_pct']:+.1f}%" if pd.notna(r['variacion_pct']) else "-"
            obs = generar_observacion(r)
            lines.append(
                f"| {i} | {r['partida']} "
                f"| {r['ppto_original']:,.2f} | {r['gasto_real']:,.2f} "
                f"| {r['variacion_uf']:+,.2f} | {vpct} | {obs} |"
            )

    lines.append("\n---")
    lines.append("*Informe generado automaticamente. Valores en UF.*")
    return "\n".join(lines)


def generar_observacion(row):
    v = row['variacion_pct'] if pd.notna(row['variacion_pct']) else 0
    if row['ppto_original'] == 0:
        return "Gasto sin presupuesto asignado. Revisar clasificacion."
    if v > 50:
        return "Gasto supera en mas del 50% el presupuesto. Requiere revision urgente."
    elif v > 25:
        return "Sobrecosto significativo. Verificar causas y proyeccion al cierre."
    else:
        return "Gasto por encima del presupuesto. Monitorear evolucion."


# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    if SERVER == "TU_SERVER":
        print("ERROR: Debes configurar SERVER en las primeras lineas del script.")
        sys.exit(1)

    print(f"Conectando a {SERVER}\\{DATABASE}...")
    try:
        conn = get_conn()
    except Exception as e:
        print(f"ERROR de conexion: {e}")
        sys.exit(1)

    verificar_schema(conn)

    print("\nCargando datos...")
    df = cargar_datos(conn)
    print(f"  {len(df)} partidas cargadas (incluye cuentas solo con gasto real).")

    df = calcular_variaciones(df)

    n_solo = len(df[df['estado'] == 'SOLO REAL'])
    if n_solo > 0:
        print(f"  {n_solo} cuentas con gasto real sin presupuesto (integradas con ppto=0)")

    informe_md = generar_informe(df)

    os.makedirs("informes", exist_ok=True)
    fecha_archivo = FECHA_CORTE.replace("-", "")
    ruta = f"informes/informe_costos_LQ_{fecha_archivo}.md"
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(informe_md)

    print(f"\n-> Informe generado: {ruta}")
    conn.close()


if __name__ == "__main__":
    main()
