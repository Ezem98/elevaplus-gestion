import { describe, it, expect } from "vitest";
import {
  proximoCuartoDeHora,
  formatearMes,
  parsearMonto,
  formatearMontoEntrada,
  formatearTextoMonto,
} from "./formato";

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

describe("parsearMonto", () => {
  it("maneja caso borde vacío o espacios", () => {
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto("   ")).toBeNull();
    expect(parsearMonto(null)).toBeNull();
    expect(parsearMonto(undefined)).toBeNull();
  });

  it("maneja caso borde solo coma", () => {
    expect(parsearMonto(",")).toBeNull();
    expect(parsearMonto(",,")).toBeNull();
  });

  it("maneja caso borde 0", () => {
    expect(parsearMonto("0")).toBe(0);
    expect(parsearMonto("0,")).toBe(0);
    expect(parsearMonto("0,0")).toBe(0);
    expect(parsearMonto("0,00")).toBe(0);
  });

  it("parsea número grande con decimales 1234567,89", () => {
    expect(parsearMonto("1234567,89")).toBe(1234567.89);
    expect(parsearMonto("1.234.567,89")).toBe(1234567.89);
  });

  it("maneja pegar formato completo con signo pesos: $ 1.234,50", () => {
    expect(parsearMonto("$ 1.234,50")).toBe(1234.5);
    expect(parsearMonto("$1.234,50")).toBe(1234.5);
    expect(parsearMonto("$ 100.000")).toBe(100000);
  });

  it("limita a 2 decimales", () => {
    expect(parsearMonto("1500,555")).toBe(1500.55);
  });

  it("soporta número que empieza con coma", () => {
    expect(parsearMonto(",5")).toBe(0.5);
    expect(parsearMonto(",75")).toBe(0.75);
  });
});

describe("formatearMontoEntrada", () => {
  it("retorna string vacío para null, undefined o NaN", () => {
    expect(formatearMontoEntrada(null)).toBe("");
    expect(formatearMontoEntrada(undefined)).toBe("");
    expect(formatearMontoEntrada(NaN)).toBe("");
  });

  it("formatea 0 correctamente", () => {
    expect(formatearMontoEntrada(0)).toBe("0");
  });

  it("formatea enteros con separador de miles", () => {
    expect(formatearMontoEntrada(100000)).toBe("100.000");
    expect(formatearMontoEntrada(1000000)).toBe("1.000.000");
    expect(formatearMontoEntrada(1500)).toBe("1.500");
  });

  it("formatea números con decimales sin ceros innecesarios al final", () => {
    expect(formatearMontoEntrada(1500.5)).toBe("1.500,5");
    expect(formatearMontoEntrada(1234567.89)).toBe("1.234.567,89");
    expect(formatearMontoEntrada(0.5)).toBe("0,5");
  });
});

describe("formatearTextoMonto (formateo en vivo)", () => {
  it("formatea 100000 a 100.000", () => {
    expect(formatearTextoMonto("100000")).toBe("100.000");
  });

  it("formatea 1500,5 a 1.500,5", () => {
    expect(formatearTextoMonto("1500,5")).toBe("1.500,5");
  });

  it("preserva coma final mientras se escribe", () => {
    expect(formatearTextoMonto("1500,")).toBe("1.500,");
  });

  it("ignora puntos tipeados", () => {
    expect(formatearTextoMonto("1500.5")).toBe("15.005");
    expect(formatearTextoMonto("1.0.0.0.0.0")).toBe("100.000");
  });

  it("soporta iniciar con coma", () => {
    expect(formatearTextoMonto(",5")).toBe("0,5");
    expect(formatearTextoMonto(",")).toBe("0,");
  });

  it("soporta pegar $ 1.234,50", () => {
    expect(formatearTextoMonto("$ 1.234,50")).toBe("1.234,50");
  });
});

