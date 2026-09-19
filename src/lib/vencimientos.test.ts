import { describe, expect, it } from "vitest";
import { diasEnMes, generarFechas } from "./vencimientos";

describe("vencimientos - generarFechas", () => {
  it("mensual: ajusta día 31 al último día en meses cortos (febrero, abril, junio, septiembre, noviembre)", () => {
    const fechas = generarFechas(
      {
        frecuencia: "mensual",
        dia_del_mes: 31,
        fecha_inicio: "2026-01-31",
      },
      "2026-01-01",
      "2026-12-31",
    );

    // 2026 no es bisiesto, febrero termina en 28
    expect(fechas).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
    ]);

    // En año bisiesto 2024, febrero termina en 29
    const fechasBisiesto = generarFechas(
      {
        frecuencia: "mensual",
        dia_del_mes: 31,
        fecha_inicio: "2024-02-01",
      },
      "2024-02-01",
      "2024-03-31",
    );
    expect(fechasBisiesto).toEqual(["2024-02-29", "2024-03-31"]);
  });

  it("quincenal: genera fechas los días 1 y 16 (o día D y D+15)", () => {
    const fechas = generarFechas(
      {
        frecuencia: "quincenal",
        dia_del_mes: 1,
        fecha_inicio: "2026-09-01",
      },
      "2026-09-01",
      "2026-10-31",
    );

    expect(fechas).toEqual([
      "2026-09-01",
      "2026-09-16",
      "2026-10-01",
      "2026-10-16",
    ]);
  });

  it("semanal: genera un vencimiento cada 7 días en el día de la semana correspondiente", () => {
    // 2026-09-14 es lunes (dia_semana: 1)
    const fechas = generarFechas(
      {
        frecuencia: "semanal",
        dia_semana: 1, // Lunes
        fecha_inicio: "2026-09-14",
      },
      "2026-09-14",
      "2026-10-05",
    );

    expect(fechas).toEqual([
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ]);
  });

  it("anual: genera una fecha por año en el mismo día y mes de inicio", () => {
    const fechas = generarFechas(
      {
        frecuencia: "anual",
        fecha_inicio: "2024-03-15",
      },
      "2024-01-01",
      "2027-12-31",
    );

    expect(fechas).toEqual([
      "2024-03-15",
      "2025-03-15",
      "2026-03-15",
      "2027-03-15",
    ]);
  });

  it("única: genera únicamente la fecha_inicio si cae dentro del rango", () => {
    const dentro = generarFechas(
      {
        frecuencia: "unica",
        fecha_inicio: "2026-09-25",
      },
      "2026-09-01",
      "2026-09-30",
    );
    expect(dentro).toEqual(["2026-09-25"]);

    const fuera = generarFechas(
      {
        frecuencia: "unica",
        fecha_inicio: "2026-08-15",
      },
      "2026-09-01",
      "2026-09-30",
    );
    expect(fuera).toEqual([]);
  });

  it("corte por fecha_fin: interrumpe la generación y no emite fechas posteriores a fecha_fin", () => {
    const fechas = generarFechas(
      {
        frecuencia: "mensual",
        dia_del_mes: 10,
        fecha_inicio: "2026-01-10",
        fecha_fin: "2026-03-20",
      },
      "2026-01-01",
      "2026-12-31",
    );

    expect(fechas).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });

  it("corte por cuotas_total y respeto de cuotas_pagadas", () => {
    // Plan de 36 cuotas, 14 pagadas -> restan 22 cuotas
    const fechas = generarFechas(
      {
        frecuencia: "mensual",
        dia_del_mes: 15,
        fecha_inicio: "2026-01-15",
        cuotas_total: 36,
        cuotas_pagadas: 33, // restan 3 cuotas
      },
      "2026-01-01",
      "2026-12-31",
    );

    expect(fechas).toHaveLength(3);
    expect(fechas).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);

    // Si ya se pagaron todas las cuotas, no genera ninguna
    const sinRestantes = generarFechas(
      {
        frecuencia: "mensual",
        dia_del_mes: 15,
        fecha_inicio: "2026-01-15",
        cuotas_total: 36,
        cuotas_pagadas: 36,
      },
      "2026-01-01",
      "2026-12-31",
    );
    expect(sinRestantes).toEqual([]);
  });

  it("helper diasEnMes devuelve la cantidad exacta de días para cada mes", () => {
    expect(diasEnMes(2026, 1)).toBe(31);
    expect(diasEnMes(2026, 2)).toBe(28);
    expect(diasEnMes(2024, 2)).toBe(29); // bisiesto
    expect(diasEnMes(2026, 4)).toBe(30);
    expect(diasEnMes(2026, 12)).toBe(31);
  });
});
