import { describe, it, expect } from "vitest";
import { sugerirTipoFactura, calcularTotales } from "./facturacion";
import { formatearNumeroFactura } from "./formato";

describe("sugerirTipoFactura", () => {
  it("devuelve 'A' únicamente para responsable inscripto", () => {
    expect(sugerirTipoFactura("responsable_inscripto")).toBe("A");
  });

  it("devuelve 'B' para monotributo, exento, consumidor final y nulos", () => {
    expect(sugerirTipoFactura("monotributo")).toBe("B");
    expect(sugerirTipoFactura("exento")).toBe("B");
    expect(sugerirTipoFactura("consumidor_final")).toBe("B");
    expect(sugerirTipoFactura(null)).toBe("B");
    expect(sugerirTipoFactura(undefined)).toBe("B");
    expect(sugerirTipoFactura("")).toBe("B");
  });
});

describe("calcularTotales", () => {
  it("devuelve ceros para lista vacía", () => {
    expect(calcularTotales([])).toEqual({ neto: 0, iva: 0, total: 0 });
  });

  it("calcula neto, iva 21% y total con aplica_iva = true", () => {
    const servicios = [{ monto: 1000, aplica_iva: true }];
    expect(calcularTotales(servicios)).toEqual({
      neto: 1000,
      iva: 210,
      total: 1210,
    });
  });

  it("no aplica IVA si aplica_iva es false", () => {
    const servicios = [{ monto: 1000, aplica_iva: false }];
    expect(calcularTotales(servicios)).toEqual({
      neto: 1000,
      iva: 0,
      total: 1000,
    });
  });

  it("aplica IVA por defecto si aplica_iva no está definido", () => {
    const servicios = [{ monto: 500 }];
    expect(calcularTotales(servicios)).toEqual({
      neto: 500,
      iva: 105,
      total: 605,
    });
  });

  it("combina servicios con y sin IVA correctamente", () => {
    const servicios = [
      { monto: 1000, aplica_iva: true },
      { monto: 500, aplica_iva: false },
      { monto: 200, aplica_iva: true },
    ];
    // neto = 1700
    // base IVA = 1200 -> iva = 252
    // total = 1952
    expect(calcularTotales(servicios)).toEqual({
      neto: 1700,
      iva: 252,
      total: 1952,
    });
  });

  it("redondea adecuadamente a 2 decimales", () => {
    const servicios = [
      { monto: 10.33, aplica_iva: true },
      { monto: 20.55, aplica_iva: true },
    ];
    // neto = 30.88
    // iva = 30.88 * 0.21 = 6.4848 -> 6.48
    // total = 37.36
    expect(calcularTotales(servicios)).toEqual({
      neto: 30.88,
      iva: 6.48,
      total: 37.36,
    });
  });

  it("ignora o maneja valores nulos de monto", () => {
    const servicios = [
      { monto: null, aplica_iva: true },
      { monto: 100, aplica_iva: true },
    ];
    expect(calcularTotales(servicios)).toEqual({
      neto: 100,
      iva: 21,
      total: 121,
    });
  });
});

describe("formatearNumeroFactura", () => {
  it("formatea comprobantes normales con padding", () => {
    expect(formatearNumeroFactura("A", 2, 1234)).toBe("A 0002-00001234");
    expect(formatearNumeroFactura("B", 1, 5)).toBe("B 0001-00000005");
    expect(formatearNumeroFactura("C", 10, 999999)).toBe("C 0010-00999999");
  });

  it("formatea notas de crédito y débito reemplazando el guión bajo", () => {
    expect(formatearNumeroFactura("NC_A", 2, 1234)).toBe("NC A 0002-00001234");
    expect(formatearNumeroFactura("NC_B", 2, 45)).toBe("NC B 0002-00000045");
    expect(formatearNumeroFactura("ND_A", 2, 1)).toBe("ND A 0002-00000001");
  });
});
