import { describe, expect, it } from "vitest";
import { netoSeguro } from "./seguro";

describe("netoSeguro", () => {
  it("con IVA: 30.000 da exactamente 24.793,39", () => {
    const neto = netoSeguro(30000, true);
    expect(neto).toBe(24793.39);
  });

  it("con IVA: neto + 21% de IVA vuelve exactamente a 30.000,00", () => {
    const importeSeguro = 30000;
    const neto = netoSeguro(importeSeguro, true);
    expect(neto).toBe(24793.39);

    const iva = Math.round((neto * 0.21 + Number.EPSILON) * 100) / 100;
    expect(iva).toBe(5206.61);

    const total = Math.round((neto + iva + Number.EPSILON) * 100) / 100;
    expect(total).toBe(30000.0);
  });

  it("sin IVA: 30.000 queda igual a 30.000", () => {
    const neto = netoSeguro(30000, false);
    expect(neto).toBe(30000);
  });

  it("sin IVA: respeta decimales cargados si los hubiera", () => {
    expect(netoSeguro(15420.5, false)).toBe(15420.5);
  });

  it("con IVA: otros montos con redondeo a 2 decimales", () => {
    // 12.100 / 1.21 = 10.000 exactos
    expect(netoSeguro(12100, true)).toBe(10000);
    // 10.000 / 1.21 = 8264.4628... -> 8264.46
    expect(netoSeguro(10000, true)).toBe(8264.46);
  });

  it("retorna 0 ante importes nulos, indefinidos, NaN o no positivos", () => {
    expect(netoSeguro(null, true)).toBe(0);
    expect(netoSeguro(undefined, true)).toBe(0);
    expect(netoSeguro(NaN, true)).toBe(0);
    expect(netoSeguro(0, true)).toBe(0);
    expect(netoSeguro(-5000, true)).toBe(0);
  });
});
