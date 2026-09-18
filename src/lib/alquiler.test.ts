import { describe, expect, it } from "vitest";
import {
  calcularCantidadAlquiler,
  calcularDiasAlquiler,
  calcularRangoRenovacion,
} from "./alquiler";
import { ETIQUETA_UNIDAD_ALQUILER, formatearUnidadPlural } from "./tipos";

describe("cálculos de alquiler", () => {
  it("calcula correctamente la cantidad de días inclusivos (diferencia + 1)", () => {
    expect(calcularDiasAlquiler("2026-09-01", "2026-09-01")).toBe(1);
    expect(calcularDiasAlquiler("2026-09-01", "2026-09-07")).toBe(7);
    expect(calcularDiasAlquiler("2026-09-01", "2026-09-15")).toBe(15);
    expect(calcularDiasAlquiler("2026-09-01", "2026-09-30")).toBe(30);
  });

  it("devuelve 0 si la fecha hasta es anterior a la fecha desde", () => {
    expect(calcularDiasAlquiler("2026-09-10", "2026-09-01")).toBe(0);
  });

  it("calcula cantidad según unidad: días", () => {
    expect(calcularCantidadAlquiler(1, "dia")).toBe(1);
    expect(calcularCantidadAlquiler(5, "dia")).toBe(5);
  });

  it("calcula cantidad según unidad: semanas = ceil(días/7)", () => {
    expect(calcularCantidadAlquiler(1, "semana")).toBe(1);
    expect(calcularCantidadAlquiler(7, "semana")).toBe(1);
    expect(calcularCantidadAlquiler(8, "semana")).toBe(2);
    expect(calcularCantidadAlquiler(14, "semana")).toBe(2);
    expect(calcularCantidadAlquiler(15, "semana")).toBe(3);
    expect(calcularCantidadAlquiler(21, "semana")).toBe(3);
  });

  it("calcula cantidad según unidad: quincenas = ceil(días/15)", () => {
    expect(calcularCantidadAlquiler(1, "quincena")).toBe(1);
    expect(calcularCantidadAlquiler(15, "quincena")).toBe(1);
    expect(calcularCantidadAlquiler(16, "quincena")).toBe(2);
    expect(calcularCantidadAlquiler(30, "quincena")).toBe(2);
    expect(calcularCantidadAlquiler(31, "quincena")).toBe(3);
  });

  it("calcula cantidad según unidad: meses = ceil(días/30)", () => {
    expect(calcularCantidadAlquiler(1, "mes")).toBe(1);
    expect(calcularCantidadAlquiler(30, "mes")).toBe(1);
    expect(calcularCantidadAlquiler(31, "mes")).toBe(2);
    expect(calcularCantidadAlquiler(60, "mes")).toBe(2);
    expect(calcularCantidadAlquiler(61, "mes")).toBe(3);
  });

  it("formatea etiquetas y plurales correctamente", () => {
    expect(ETIQUETA_UNIDAD_ALQUILER.dia).toBe("Día");
    expect(ETIQUETA_UNIDAD_ALQUILER.semana).toBe("Semana");
    expect(ETIQUETA_UNIDAD_ALQUILER.quincena).toBe("Quincena");
    expect(ETIQUETA_UNIDAD_ALQUILER.mes).toBe("Mes");

    expect(formatearUnidadPlural("dia", 1)).toBe("día");
    expect(formatearUnidadPlural("dia", 2)).toBe("días");
    expect(formatearUnidadPlural("semana", 1)).toBe("semana");
    expect(formatearUnidadPlural("semana", 3)).toBe("semanas");
    expect(formatearUnidadPlural("quincena", 1)).toBe("quincena");
    expect(formatearUnidadPlural("quincena", 2)).toBe("quincenas");
    expect(formatearUnidadPlural("mes", 1)).toBe("mes");
    expect(formatearUnidadPlural("mes", 2)).toBe("meses");
  });

  it("calcula correctamente el rango de renovación (Desde = hasta + 1, misma duración)", () => {
    // Alquiler mensual de 30 días
    const res1 = calcularRangoRenovacion("2026-09-01", "2026-09-30");
    expect(res1.nuevaDesde).toBe("2026-10-01");
    expect(res1.nuevaHasta).toBe("2026-10-30");
    expect(calcularDiasAlquiler(res1.nuevaDesde, res1.nuevaHasta)).toBe(30);

    // Alquiler semanal de 7 días
    const res2 = calcularRangoRenovacion("2026-09-10", "2026-09-16");
    expect(res2.nuevaDesde).toBe("2026-09-17");
    expect(res2.nuevaHasta).toBe("2026-09-23");
    expect(calcularDiasAlquiler(res2.nuevaDesde, res2.nuevaHasta)).toBe(7);

    // Alquiler diario de 1 día
    const res3 = calcularRangoRenovacion("2026-09-15", "2026-09-15");
    expect(res3.nuevaDesde).toBe("2026-09-16");
    expect(res3.nuevaHasta).toBe("2026-09-16");
    expect(calcularDiasAlquiler(res3.nuevaDesde, res3.nuevaHasta)).toBe(1);
  });
});
