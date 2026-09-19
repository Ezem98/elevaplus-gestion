import { describe, expect, it } from "vitest";
import { diasEnMes, generarFechas } from "./vencimientos";

describe("vencimientos - generarFechas", () => {
  it("mensual: ajusta día 31 al último día en meses cortos (febrero, abril)", () => {
    const fechas = generarFechas(
      {
        frecuencia: "mensual",
        dia_del_mes: 31,
        fecha_inicio: "2026-01-31",
      },
      "2026-01-01",
      "2026-05-01",
    );

    expect(fechas).toEqual([
      "2026-01-31",
      "2026-02-28", // Febrero no bisiesto tiene 28 días
      "2026-03-31",
      "2026-04-30", // Abril tiene 30 días
    ]);
  });

  it("quincenal: días 1 y 16 por defecto", () => {
    const fechas = generarFechas(
      {
        frecuencia: "quincenal",
        fecha_inicio: "2026-09-01",
      },
      "2026-09-01",
      "2026-10-20",
    );

    expect(fechas).toEqual([
      "2026-09-01",
      "2026-09-16",
      "2026-10-01",
      "2026-10-16",
    ]);
  });

  it("quincenal: día personalizado (ej. 5 y 20)", () => {
    const fechas = generarFechas(
      {
        frecuencia: "quincenal",
        dia_del_mes: 5,
        fecha_inicio: "2026-09-05",
      },
      "2026-09-01",
      "2026-10-10",
    );

    expect(fechas).toEqual(["2026-09-05", "2026-09-20", "2026-10-05"]);
  });

  it("semanal: genera según día de la semana", () => {
    // 2026-09-01 es martes (día 2). Queremos viernes (día 5): 2026-09-04, 11, 18, 25
    const fechas = generarFechas(
      {
        frecuencia: "semanal",
        dia_semana: 5,
        fecha_inicio: "2026-09-01",
      },
      "2026-09-01",
      "2026-09-30",
    );

    expect(fechas).toEqual([
      "2026-09-04",
      "2026-09-11",
      "2026-09-18",
      "2026-09-25",
    ]);
  });

  it("bimestral: avanza cada 2 meses", () => {
    const fechas = generarFechas(
      {
        frecuencia: "bimestral",
        dia_del_mes: 15,
        fecha_inicio: "2026-01-15",
      },
      "2026-01-01",
      "2026-07-01",
    );

    expect(fechas).toEqual(["2026-01-15", "2026-03-15", "2026-05-15"]);
  });

  it("anual: mismo día y mes cada año", () => {
    const fechas = generarFechas(
      {
        frecuencia: "anual",
        fecha_inicio: "2026-03-10",
      },
      "2026-01-01",
      "2029-01-01",
    );

    expect(fechas).toEqual(["2026-03-10", "2027-03-10", "2028-03-10"]);
  });

  it("unica: genera exactamente una fecha", () => {
    const fechas = generarFechas(
      {
        frecuencia: "unica",
        fecha_inicio: "2026-09-25",
      },
      "2026-09-01",
      "2026-09-30",
    );

    expect(fechas).toEqual(["2026-09-25"]);

    const fueraRango = generarFechas(
      {
        frecuencia: "unica",
        fecha_inicio: "2026-10-05",
      },
      "2026-09-01",
      "2026-09-30",
    );
    expect(fueraRango).toEqual([]);
  });

  it("truncamiento por cuotas_total y cuotas_pagadas", () => {
    const fechas = generarFechas(
      {
        frecuencia: "mensual",
        dia_del_mes: 10,
        fecha_inicio: "2026-01-10",
        cuotas_total: 5,
        cuotas_pagadas: 3, // Quedan 2 cuotas por generar
      },
      "2026-01-01",
      "2026-12-31",
    );

    expect(fechas).toHaveLength(2);
    expect(fechas).toEqual(["2026-01-10", "2026-02-10"]);
  });

  it("truncamiento por fecha_fin", () => {
    const fechas = generarFechas(
      {
        frecuencia: "mensual",
        dia_del_mes: 15,
        fecha_inicio: "2026-01-15",
        fecha_fin: "2026-03-20",
      },
      "2026-01-01",
      "2026-12-31",
    );

    expect(fechas).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });
});

describe("diasEnMes", () => {
  it("calcula correctamente días para bisiestos y no bisiestos", () => {
    expect(diasEnMes(2026, 2)).toBe(28); // 2026 no es bisiesto
    expect(diasEnMes(2024, 2)).toBe(29); // 2024 sí es bisiesto
    expect(diasEnMes(2026, 1)).toBe(31);
    expect(diasEnMes(2026, 4)).toBe(30);
  });
});
