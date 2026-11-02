# Reglas de la carga del ERP ("Reporte de costos")

Regla de fondo: **el Excel del ERP manda.** El total de gasto real de una obra en la app tiene que ser
igual a la suma de las filas de esa obra en el Excel. Solo se descarta lo que esta listado abajo, y
todo lo descartado queda registrado en un log.

## Que se carga

Todas las filas de la unidad de negocio de la obra (columna `Codigo Unidad de Negocio`), con
monto = `exento_detalle_uf` + `afecto_detalle_uf`, agrupadas por codigo de cuenta (`concepto1_codigo`) y
por mes contable.

Se incluyen, entre otras:

- Las filas con codigo **100, 200, 300, 400 o 500** cuya glosa (de detalle o de encabezado del
  comprobante) contiene **"COSTO DE VENTA"** (cualquier mayuscula/minuscula). Son el traspaso mensual
  de la obra a costo de venta (ej. comprobante "COSTO DE VENTA LA QUEBRADA AGOSTO 2026", abono en la
  cuenta 1-2-01-00x). Los montos son negativos: la contabilidad trabaja con el costo neto de ese
  traspaso, y el Excel lo suma. En pantalla aparecen como la partida "Traspaso a costo de venta".

## Que se descarta (y por que)

| Motivo | Regla | Por que |
| --- | --- | --- |
| `rollup_familia` | Codigo 100-500 **sin** glosa "COSTO DE VENTA" | Los codigos 100-500 son *familias* (Materiales, Mano de obra, Subcontratos, Gastos generales, Equipos), no cuentas. Una fila de familia que no es el traspaso es un acumulado de cuentas ya cargadas por separado: sumarla duplicaria el gasto. |
| `oficina_central` | Codigos 900-999 (familia 900: cuentas 901-914) | Gastos de oficina central, que no son costo de la obra. |
| (no se cuentan) | Filas de otra unidad de negocio | Pertenecen a otra obra. |

Si el ERP llegara a mandar otra fila 100-500 que no sea el traspaso, **el total de la app diferira del
Excel por ese monto** y la conciliacion lo avisa (ver abajo). Si hay que incluirla, se agrega su regla
en `rollupFamilia.ts` y un caso de prueba.

> Nota: el modulo de prediccion (`serieRealDesdeERP.ts`) sigue excluyendo 100-500 a proposito: sus
> series se construyen por cuenta, no por familia.

## Conciliacion al cargar

Al cargar el Excel, `parsearERP` calcula una **conciliacion** (`parser/conciliacionErp.ts`):

```
total del archivo (suma de TODAS las filas de la unidad) = cargado + descartado
```

y desglosa lo descartado por motivo. Se registra sin tocar la pantalla:

- **Consola del navegador** (`[conciliacion-erp] ...`): `console.info` si todo cuadra, `console.warn` si hay avisos.
- **Log del backend** (`[erp-conciliacion] ...`, con `pm2 logs icemm-api` como root): una linea por carga con
  archivo, total, cargado, descartado por motivo, traspaso a costo de venta y diferencia.
  Aparece `AVISO:` (como `console.warn`, queda en el log de errores de pm2) cuando:
  - la diferencia `archivo - (cargado + descartado)` supera **0,05 UF** (filas perdidas sin motivo conocido);
  - se descarto cualquier fila `rollup_familia` (el total de la app va a diferir del Excel);
  - lo descartado supera el **1 %** del total del archivo (ej. se cargo la oficina central como obra);
  - hay filas sin codigo de cuenta valido;
  - en el servidor, `totalUF` no coincide con la suma por cuenta (> 0,5 UF).
- **Nunca bloquea la carga** ni cambia lo que se guarda. No se persiste en la base (no hay columna para eso).

## Pruebas automaticas

`npm test` en `frontend/` (vitest). Las que protegen esta regla:

- `parser/conciliacionErp.test.ts`: muestra anonimizada de La Quebrada al 30-09-2026
  (`parser/fixtures/laQuebradaSep2026.ts`, solo cuenta/mes/UF sumados; sin proveedores ni RUT) que tiene
  que dar **47.010,36 UF** como el Excel, con el traspaso incluido, cada mes cuadrando, la conciliacion en
  `ok`, y lo que dibuja `mergeProyecto` igual al Excel (al 31-08 queda en 46.150,43 UF, el total del
  Informe 4). Ademas: glosa en detalle/encabezado/minusculas, rollups sin glosa descartados y explicados,
  invariante `archivo = cargado + descartado` con archivos armados al azar, y los avisos/umbral.
- `parser/parseRealERP.test.ts` y `parser/mergeProyecto.test.ts`: traspaso a costo de venta y rollups.

Si el Excel de referencia cambia de formato o aparece un nuevo tipo de fila, actualizar primero la
muestra/pruebas y despues la regla.

## Informes aprobados

Un informe aprobado guarda su propia foto (snapshot) del gasto real; recargar el ERP no lo modifica.
