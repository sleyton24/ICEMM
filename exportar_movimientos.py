"""
Exporta los movimientos individuales de RealLQ agrupados por concepto1 (codigo2)
y genera el diccionario 'movimientos' para mockData.ts

Ejecutar: python exportar_movimientos.py
Salida:   movimientos_export.ts  (copiar contenido a mockData.ts)
"""

import pyodbc
import pandas as pd
import json

# ── CONFIGURACION ─────────────────────────────────────────────────────────────
SERVER   = "BNVSOFSQL"
DATABASE = "PRESTO"
FECHA_CORTE = "2026-03-31"
SQL_USER = "sleyton"
SQL_PASS = "20 Lyt 25$"


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


# Primero exploremos las columnas disponibles en RealLQ
QUERY_COLUMNS = """
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'RealLQ'
ORDER BY ORDINAL_POSITION
"""

# Detalle de movimientos por concepto1
QUERY_MOVIMIENTOS = """
SELECT
    concepto1,
    Fecha_contable,
    proveedor,
    glosa,
    exento_detalle * 100.0 / NULLIF(ValOR_UF, 0) AS monto_uf
FROM [PRESTO].[dbo].[RealLQ]
WHERE Fecha_contable <= ?
  AND Fecha_contable IS NOT NULL
ORDER BY concepto1, Fecha_contable
"""

# Fallback si las columnas proveedor/glosa no existen
QUERY_MOVIMIENTOS_SIMPLE = """
SELECT
    concepto1,
    Fecha_contable,
    exento_detalle * 100.0 / NULLIF(ValOR_UF, 0) AS monto_uf
FROM [PRESTO].[dbo].[RealLQ]
WHERE Fecha_contable <= ?
  AND Fecha_contable IS NOT NULL
ORDER BY concepto1, Fecha_contable
"""


def main():
    print(f"Conectando a {SERVER}\\{DATABASE}...")
    conn = get_conn()

    # 1. Explorar columnas
    print("\n== Columnas de RealLQ ==")
    df_cols = pd.read_sql(QUERY_COLUMNS, conn)
    print(df_cols.to_string(index=False))

    col_names = set(df_cols['COLUMN_NAME'].str.lower())

    # 2. Determinar que columnas usar
    has_proveedor = 'proveedor' in col_names
    has_glosa = 'glosa' in col_names

    # Buscar columnas alternativas para proveedor y glosa
    prov_col = None
    glosa_col = None
    for c in df_cols['COLUMN_NAME']:
        cl = c.lower()
        if cl in ('proveedor', 'nombre_proveedor', 'razon_social', 'rut_proveedor'):
            prov_col = c
        if cl in ('glosa', 'descripcion', 'detalle', 'concepto', 'texto'):
            glosa_col = c

    print(f"\nColumna proveedor: {prov_col or '(no encontrada)'}")
    print(f"Columna glosa: {glosa_col or '(no encontrada)'}")

    # 3. Construir query dinamica
    select_parts = ["concepto1", "Fecha_contable"]
    if prov_col:
        select_parts.append(f"[{prov_col}] AS proveedor")
    if glosa_col:
        select_parts.append(f"[{glosa_col}] AS glosa")
    select_parts.append("exento_detalle * 100.0 / NULLIF(ValOR_UF, 0) AS monto_uf")

    query = f"""
    SELECT {', '.join(select_parts)}
    FROM [PRESTO].[dbo].[RealLQ]
    WHERE Fecha_contable <= ?
      AND Fecha_contable IS NOT NULL
    ORDER BY concepto1, Fecha_contable
    """

    print("\nCargando movimientos...")
    df = pd.read_sql(query, conn, params=[FECHA_CORTE])
    df['monto_uf'] = pd.to_numeric(df['monto_uf'], errors='coerce').fillna(0)
    print(f"  {len(df)} movimientos cargados")

    # 4. Agrupar por concepto1
    movimientos = {}
    for concepto1, group in df.groupby('concepto1'):
        key = str(int(concepto1)) if pd.notna(concepto1) else str(concepto1)
        items = []
        for _, row in group.iterrows():
            fecha = row['Fecha_contable']
            fecha_str = fecha.strftime('%Y-%m-%d') if pd.notna(fecha) else ''
            item = {
                'fecha': fecha_str,
                'proveedor': str(row.get('proveedor', '-')) if prov_col else '-',
                'glosa': str(row.get('glosa', '-')) if glosa_col else '-',
                'monto_uf': round(float(row['monto_uf']), 2),
            }
            items.append(item)
        movimientos[key] = items

    print(f"  {len(movimientos)} cuentas con movimientos")

    conn.close()

    # 5. Generar archivo TypeScript
    ts_lines = [
        "// Generado por exportar_movimientos.py",
        "// Copiar este contenido y reemplazar 'movimientos' en mockData.ts",
        "",
        "import type { Movimiento } from './mockData'",
        "",
        "export const movimientos: Record<string, Movimiento[]> = {",
    ]

    for key in sorted(movimientos.keys(), key=lambda k: int(k)):
        items = movimientos[key]
        ts_lines.append(f"  '{key}': [")
        for item in items:
            prov = item['proveedor'].replace("'", "\\'")
            glosa = item['glosa'].replace("'", "\\'")
            ts_lines.append(f"    {{ fecha: '{item['fecha']}', proveedor: '{prov}', glosa: '{glosa}', monto_uf: {item['monto_uf']} }},")
        ts_lines.append("  ],")

    ts_lines.append("}")
    ts_lines.append("")

    output_path = "frontend/src/data/movimientos_export.ts"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(ts_lines))

    print(f"\n-> Exportado a {output_path}")
    print("   Copiar el contenido al diccionario 'movimientos' en mockData.ts")


if __name__ == "__main__":
    main()
