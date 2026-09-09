import { describe, it, expect } from "vitest";
import { proximoCuartoDeHora, formatearMes } from "./formato";

describe("proximoCuartoDeHora", () => {
  it("redondea 14:07 al próximo cuarto de hora (14:15)", () => {
    const fecha = new Date(2026, 8, 8, 14, 7, 0);
    expect(proximoCuartoDeHora(fecha)).toBe("14:15");
  });

  it("redondea 14:52 al próximo cuarto de hora (15:00)", () => {
    const fecha = new Date(2026, 8, 8, 14, 52, 0);
    expect(proximoCuartoDeHora(fecha)).toBe("15:00");
  });

  it("mantiene la hora si ya está exactamente en el cuarto de hora sin segundos", () => {
    const fecha1 = new Date(2026, 8, 8, 14, 0, 0, 0);
    expect(proximoCuartoDeHora(fecha1)).toBe("14:00");

    const fecha2 = new Date(2026, 8, 8, 14, 15, 0, 0);
    expect(proximoCuartoDeHora(fecha2)).toBe("14:15");

    const fecha3 = new Date(2026, 8, 8, 14, 30, 0, 0);
    expect(proximoCuartoDeHora(fecha3)).toBe("14:30");

    const fecha4 = new Date(2026, 8, 8, 14, 45, 0, 0);
    expect(proximoCuartoDeHora(fecha4)).toBe("14:45");
  });

  it("avanza al siguiente cuarto de hora si tiene segundos pasados", () => {
    const fecha = new Date(2026, 8, 8, 14, 15, 1);
    expect(proximoCuartoDeHora(fecha)).toBe("14:30");
  });

  it("hace rollover correctamente a las 00:00 al final del día", () => {
    const fecha = new Date(2026, 8, 8, 23, 52, 0);
    expect(proximoCuartoDeHora(fecha)).toBe("00:00");
  });
});

describe("formatearMes", () => {
  it("formatea correctamente un período YYYY-MM en español", () => {
    expect(formatearMes("2026-09")).toBe("Septiembre 2026");
    expect(formatearMes("2026-01")).toBe("Enero 2026");
    expect(formatearMes("2026-12")).toBe("Diciembre 2026");
  });

  it("devuelve raya si es null o undefined", () => {
    expect(formatearMes(null)).toBe("—");
    expect(formatearMes(undefined)).toBe("—");
  });
});
