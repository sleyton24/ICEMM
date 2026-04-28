"""
Exporta el detalle de sub-partidas de pptoLQ agrupadas por Código2
y genera el diccionario 'detallePartidas' para mockData.ts

Ejecutar: python exportar_detalle.py
Salida:   stdout con el TypeScript para copiar a mockData.ts
"""

import pyodbc
import pandas as pd

# ── CONFIGURACION ─────────────────────────────────────────────────────────────
SERVER   = "BNVSOFSQL"
DATABASE = "PRESTO"
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


QUERY = """
SELECT
    código      AS codigo,
    Código2     AS codigo2,
    resumen,
    Ud          AS ud,
    CanTotPres  AS cantidad,
    Pres        AS precio_unitario,
    TotPres     AS total
FROM [PRESTO].[dbo].[pptoLQ]
ORDER BY Código2, código
"""


def main():
    print(f"Conectando a {SERVER}\\{DATABASE}...", flush=True)
    conn = get_conn()

    print("Cargando detalle pptoLQ...", flush=True)
    df = pd.read_sql(QUERY, conn)
    conn.close()

    for col in ['cantidad', 'precio_unitario', 'total']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    print(f"  {len(df)} filas cargadas", flush=True)

    # Agrupar por codigo2
    groups = {}
    for codigo2, grp in df.groupby('codigo2'):
        key = str(int(codigo2)) if pd.notna(codigo2) else str(codigo2)
        items = []
        for _, row in grp.iterrows():
            items.append({
                'codigo': str(row['codigo']).strip(),
                'resumen': str(row['resumen']).strip(),
                'ud': str(row['ud']).strip() if pd.notna(row['ud']) else '-',
                'cantidad': round(float(row['cantidad']), 3),
                'precio_unitario': round(float(row['precio_unitario']), 3),
                'total': round(float(row['total']), 2),
            })
        groups[key] = items

    print(f"  {len(groups)} codigos con sub-partidas", flush=True)

    # Generar TypeScript
    lines = []
    lines.append("// Generado por exportar_detalle.py — pegar en mockData.ts reemplazando detallePartidas")
    lines.append("export const detallePartidas: Record<string, DetallePartida[]> = {")

    for key in sorted(groups.keys(), key=lambda k: int(k)):
        items = groups[key]
        lines.append(f"  '{key}': [")
        for item in items:
            res = item['resumen'].replace("'", "\\'")
            cod = item['codigo'].replace("'", "\\'")
            lines.append(
                f"    {{ codigo: '{cod}', resumen: '{res}', ud: '{item['ud']}', "
                f"cantidad: {item['cantidad']}, precio_unitario: {item['precio_unitario']}, "
                f"total: {item['total']} }},"
            )
        lines.append("  ],")

    lines.append("}")

    output_path = "frontend/src/data/detalle_export.ts"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\n-> Exportado a {output_path}")
    print("   Copiar el contenido de detallePartidas a mockData.ts")


if __name__ == "__main__":
    main()
