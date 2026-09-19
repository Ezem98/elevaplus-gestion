export type FrecuenciaVencimiento =
  | "unica"
  | "semanal"
  | "quincenal"
  | "mensual"
  | "bimestral"
  | "anual";

export interface VencimientoParaGeneracion {
  frecuencia: FrecuenciaVencimiento;
  dia_del_mes?: number | null;
  dia_semana?: number | null;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin?: string | null; // YYYY-MM-DD
  cuotas_total?: number | null;
  cuotas_pagadas?: number;
}

/**
 * Devuelve la cantidad de días en un mes determinado de un año dado.
 * month es 1-indexed (1=Enero, 12=Diciembre).
 */
export function diasEnMes(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatearIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Función pura que calcula las fechas de vencimiento de una regla recurrente
 * comprendidas en el rango [desde, hasta].
 *
 * Es compartida entre el frontend y el worker de tareas programadas.
 */
export function generarFechas(
  vencimiento: VencimientoParaGeneracion,
  desde: string,
  hasta: string,
): string[] {
  const {
    frecuencia,
    dia_del_mes,
    dia_semana,
    fecha_inicio,
    fecha_fin,
    cuotas_total,
    cuotas_pagadas = 0,
  } = vencimiento;

  const cuotasRestantes =
    cuotas_total != null
      ? Math.max(0, cuotas_total - cuotas_pagadas)
      : Infinity;

  if (cuotasRestantes <= 0) {
    return [];
  }

  const resultados: string[] = [];
  let cuotasGeneradas = 0;

  if (frecuencia === "unica") {
    if (
      fecha_inicio >= desde &&
      fecha_inicio <= hasta &&
      (!fecha_fin || fecha_inicio <= fecha_fin)
    ) {
      return [fecha_inicio];
    }
    return [];
  }

  if (frecuencia === "semanal") {
    const [yIni, mIni, dIni] = fecha_inicio.split("-").map(Number);
    const cursor = new Date(Date.UTC(yIni, mIni - 1, dIni));
    const targetDay = dia_semana ?? cursor.getUTCDay();

    // Avanzar cursor hasta el primer día de la semana que coincide con dia_semana
    while (cursor.getUTCDay() !== targetDay) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    while (true) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth() + 1;
      const d = cursor.getUTCDate();
      const cand = formatearIso(y, m, d);

      if (fecha_fin && cand > fecha_fin) break;
      if (cand > hasta) break;

      cuotasGeneradas++;
      if (cuotasGeneradas > cuotasRestantes) break;

      if (cand >= desde) {
        resultados.push(cand);
      }

      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    return resultados;
  }

  if (frecuencia === "quincenal") {
    const d1 = dia_del_mes
      ? dia_del_mes > 15
        ? dia_del_mes - 15
        : dia_del_mes
      : 1;
    const d2 = d1 + 15;

    const [yIni, mIni] = fecha_inicio.split("-").map(Number);
    let y = yIni;
    let m = mIni;

    outerLoop: while (true) {
      const maxDias = diasEnMes(y, m);
      const diaA = Math.min(d1, maxDias);
      const diaB = Math.min(d2, maxDias);

      const candidatos = [formatearIso(y, m, diaA), formatearIso(y, m, diaB)];

      for (const cand of candidatos) {
        if (cand < fecha_inicio) continue;
        if (fecha_fin && cand > fecha_fin) break outerLoop;
        if (cand > hasta) break outerLoop;

        cuotasGeneradas++;
        if (cuotasGeneradas > cuotasRestantes) break outerLoop;

        if (cand >= desde) {
          resultados.push(cand);
        }
      }

      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }

    return resultados;
  }

  if (frecuencia === "mensual" || frecuencia === "bimestral") {
    const pasoMeses = frecuencia === "bimestral" ? 2 : 1;
    const diaBase = dia_del_mes ?? parseInt(fecha_inicio.slice(8, 10), 10);

    const [yIni, mIni] = fecha_inicio.split("-").map(Number);
    let y = yIni;
    let m = mIni;

    while (true) {
      const maxDias = diasEnMes(y, m);
      const actualDia = Math.min(diaBase, maxDias);
      const cand = formatearIso(y, m, actualDia);

      if (cand >= fecha_inicio) {
        if (fecha_fin && cand > fecha_fin) break;
        if (cand > hasta) break;

        cuotasGeneradas++;
        if (cuotasGeneradas > cuotasRestantes) break;

        if (cand >= desde) {
          resultados.push(cand);
        }
      }

      m += pasoMeses;
      while (m > 12) {
        m -= 12;
        y++;
      }
    }

    return resultados;
  }

  if (frecuencia === "anual") {
    const [, mIni, dIni] = fecha_inicio.split("-").map(Number);
    const diaBase = dia_del_mes ?? dIni;
    const mesBase = mIni;

    let y = parseInt(fecha_inicio.slice(0, 4), 10);

    while (true) {
      const maxDias = diasEnMes(y, mesBase);
      const actualDia = Math.min(diaBase, maxDias);
      const cand = formatearIso(y, mesBase, actualDia);

      if (cand >= fecha_inicio) {
        if (fecha_fin && cand > fecha_fin) break;
        if (cand > hasta) break;

        cuotasGeneradas++;
        if (cuotasGeneradas > cuotasRestantes) break;

        if (cand >= desde) {
          resultados.push(cand);
        }
      }

      y++;
    }

    return resultados;
  }

  return resultados;
}
