import { describe, it, expect } from "vitest";
import {
  evaluarRecuperacionComprobante,
  formatearFechaArca,
} from "./recuperar";

describe("formatearFechaArca", () => {
  it("debe convertir YYYYMMDD a YYYY-MM-DD", () => {
    expect(formatearFechaArca("20260920")).toBe("2026-09-20");
    expect(formatearFechaArca(20260920)).toBe("2026-09-20");
  });

  it("debe mantener fechas que ya tienen guiones", () => {
    expect(formatearFechaArca("2026-09-20")).toBe("2026-09-20");
  });

  it("debe retornar undefined si es nulo o vacío", () => {
    expect(formatearFechaArca(null)).toBeUndefined();
    expect(formatearFechaArca("")).toBeUndefined();
  });
});

describe("evaluarRecuperacionComprobante", () => {
  const comprobanteValido = {
    ImpTotal: 121000,
    DocNro: 20304050607,
    CodAutorizacion: "74382910394821",
    FchVto: "20260925",
  };

  it("debe autorizar recuperación cuando importe, CUIT y CAE coinciden", () => {
    const res = evaluarRecuperacionComprobante({
      facturaTotal: 121000,
      clienteCuit: "20-30405060-7",
      comprobanteArca: comprobanteValido,
      yaExisteFacturaEmitidaConEseNumero: false,
    });

    expect(res.coincide).toBe(true);
    expect(res.cae).toBe("74382910394821");
    expect(res.caeVencimiento).toBe("2026-09-25");
  });

  it("debe rechazar si el comprobante no existe en ARCA", () => {
    const res = evaluarRecuperacionComprobante({
      facturaTotal: 121000,
      clienteCuit: "20-30405060-7",
      comprobanteArca: null,
      yaExisteFacturaEmitidaConEseNumero: false,
    });

    expect(res.coincide).toBe(false);
    expect(res.motivo).toContain("no existe en ARCA");
  });

  it("debe rechazar si ya existe otra factura emitida con ese número", () => {
    const res = evaluarRecuperacionComprobante({
      facturaTotal: 121000,
      clienteCuit: "20-30405060-7",
      comprobanteArca: comprobanteValido,
      yaExisteFacturaEmitidaConEseNumero: true,
    });

    expect(res.coincide).toBe(false);
    expect(res.motivo).toContain("ya está asignado a otra factura");
  });

  it("debe rechazar si el total difiere", () => {
    const res = evaluarRecuperacionComprobante({
      facturaTotal: 150000,
      clienteCuit: "20-30405060-7",
      comprobanteArca: comprobanteValido,
      yaExisteFacturaEmitidaConEseNumero: false,
    });

    expect(res.coincide).toBe(false);
    expect(res.motivo).toContain("no coincide");
  });

  it("debe rechazar si el CUIT del receptor difiere", () => {
    const res = evaluarRecuperacionComprobante({
      facturaTotal: 121000,
      clienteCuit: "27-99999999-4",
      comprobanteArca: comprobanteValido,
      yaExisteFacturaEmitidaConEseNumero: false,
    });

    expect(res.coincide).toBe(false);
    expect(res.motivo).toContain("CUIT del receptor");
  });

  it("debe aceptar consumidor final (DocNro 0) sin CUIT", () => {
    const comprobanteCF = {
      ImpTotal: 50000,
      DocNro: 0,
      CAE: "12345678901234",
      CAEFchVto: "20260930",
    };

    const res = evaluarRecuperacionComprobante({
      facturaTotal: 50000,
      clienteCuit: null,
      comprobanteArca: comprobanteCF,
      yaExisteFacturaEmitidaConEseNumero: false,
    });

    expect(res.coincide).toBe(true);
    expect(res.cae).toBe("12345678901234");
    expect(res.caeVencimiento).toBe("2026-09-30");
  });
});
