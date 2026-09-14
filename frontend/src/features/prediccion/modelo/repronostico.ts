import type { Proyeccion, Reproyeccion, Escenario, SerieRealMensual } from './tipos'

const K_ESCENARIO: Record<Escenario, number> = {
  /** Atraso o adelanto de calendario: el costo total no cambia. */
  plazo: 0,
  /** Mitad calendario, mitad costo. */
  mixto: 0.5,
  /** El ritmo observado se mantiene hasta el cierre. */
  desem: 1,
}

/**
 * Re-pronóstico de obra en curso (paso 6 de docs/MODELO.md).
 *
 * Para los meses ya ejecutados usa el real observado TAL CUAL. Solo el tramo
 * futuro se deriva de la forma de la curva, repartiendo el remanente.
 *
 * Esto último fue un bug en una versión anterior del prototipo —el pasado se
 * reconstruía escalando la curva del modelo, así que el real solo anclaba el
 * mes de corte— y toda la ventaja del re-pronóstico está justamente en usar
 * bien lo observado. Acá la serie real es obligatoria y contigua: si falta un
 * mes se falla, en vez de caer al backcast proporcional que el prototipo usa
 * como fallback silencioso.
 */
export function repronosticar(
  proyeccion: Proyeccion,
  serieReal: SerieRealMensual[],
  opciones: { mesCorte?: number; escenario?: Escenario } = {},
): Reproyeccion {
  const { meses, total, NT } = proyeccion
  const escenario = opciones.escenario ?? 'plazo'

  if (serieReal.length === 0) throw new Error('La serie real está vacía: no hay nada que re-anclar.')

  const k = Math.min(NT, Math.max(1, Math.round(opciones.mesCorte ?? serieReal.length)))

  if (serieReal.length < k) {
    throw new Error(
      `El mes de corte es ${k} pero la serie real solo tiene ${serieReal.length} meses. ` +
      'Sin el real de todos los meses previos el re-ancla no se puede construir.',
    )
  }

  // La serie tiene que arrancar en el mismo mes que la proyección y ser contigua:
  // el re-ancla indexa por posición, así que un mes faltante corre todo el pasado.
  if (serieReal[0].ym !== meses[0].ym) {
    throw new Error(
      `La serie real empieza en ${serieReal[0].ym} y la proyección en ${meses[0].ym}. ` +
      'Tienen que arrancar en el mismo mes.',
    )
  }
  for (let j = 1; j < serieReal.length; j++) {
    if (serieReal[j].ym !== meses[j]?.ym) {
      throw new Error(
        `La serie real no es contigua: en la posición ${j} trae ${serieReal[j].ym} y se ` +
        `esperaba ${meses[j]?.ym ?? '(fuera de rango)'}. Rellená los meses sin movimiento con 0.`,
      )
    }
  }

  const realAcum = serieReal[k - 1].acum
  const planAcum = meses[k - 1].acum
  const desempeno = planAcum > 0 ? realAcum / planAcum : 1
  const kEsc = K_ESCENARIO[escenario]
  const totalNuevo = total * (1 + (desempeno - 1) * kEsc)

  const rest = totalNuevo - realAcum
  const baseRest = total - planAcum

  const serie = meses.map((r, j) => {
    let acum: number
    if (j < k - 1) acum = serieReal[j].acum
    else if (j === k - 1) acum = realAcum
    else acum = realAcum + (baseRest > 0 ? ((r.acum - planAcum) / baseRest) * rest : 0)
    return { i: r.i, ym: r.ym, acum, mes: 0 }
  })
  serie.forEach((r, j) => { r.mes = r.acum - (j ? serie[j - 1].acum : 0) })

  const advertencias = [...proyeccion.advertencias]
  if (rest < 0) {
    // No se recorta: un remanente negativo es información real —la obra ya
    // gastó más que el total del modelo— y aplanarlo escondería el problema.
    advertencias.push(
      `El real acumulado (${realAcum.toFixed(0)} UF) ya supera el total proyectado ` +
      `(${totalNuevo.toFixed(0)} UF) en el escenario "${escenario}". El tramo futuro queda ` +
      'en negativo: el escenario no es sostenible, hay que revisar el factor de ejecución.',
    )
  }

  return {
    ...proyeccion,
    advertencias,
    reproyeccion: {
      k, realAcum, planAcum, desempeno, escenario, totalNuevo,
      desvio: realAcum - planAcum, serie,
    },
  }
}
