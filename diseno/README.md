# Diseño — rediseño de la app

Fuentes del rediseño que se presentó a stakeholders. Estaban en una carpeta
temporal; acá quedan versionadas junto al código que las implementa.

## maquetas/

Artboards del canvas de Claude Design (`.dc.html`) más el manifiesto de
disposición. Son la REFERENCIA de la implementación: colores, espaciados y
anatomía salen de ahí.

| Archivo | Qué es |
|---|---|
| `Main.dc.html` | Resumen de obra — la pantalla nueva, con interruptor de tema |
| `Costos.dc.html` | Tabla de control con la navegación y el tema nuevos |
| `NavSuperior.dc.html` | Alternativa de navegación elegida (barra superior) |
| `NavRiel.dc.html`, `PortadaConsola.dc.html` | Alternativas descartadas, se conservan como registro |
| `canvas.json` | Disposición y notas del canvas |

Canvas publicado: https://claude.ai/code/artifact/80ea4d25-4c93-4e23-b746-5fb8f723e3d0

## Scripts

- `capturar.py` — renderiza cada maqueta a PNG en claro y oscuro. Lee las
  paletas del propio `.dc.html` para no desincronizarse.
- `armar_ppt.py` — arma la presentación para stakeholders con esas capturas.

```bash
cd diseno/maquetas
python capturar.py && python armar_ppt.py
```
