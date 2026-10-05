import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluarRecuperacionComprobante,
  formatearFechaArca,
  recuperarFacturasColgadas,
} from "./recuperar";
import { supabaseAdmin } from "../supabase";
import { config } from "../config";

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

describe("recuperarFacturasColgadas", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rechaza la recuperación en producción si empresa.cuit no coincide con config.ARCA_CUIT", async () => {
    config.ARCA_CUIT = 20999999999;

    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      if (tabla === "facturas") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "fac-colgada-1",
                    tipo: "A",
                    punto_venta: 3,
                    numero: null,
                    total: 10000,
                    cliente_id: "cli-1",
                    clientes: { cuit: "20304050607" },
                  },
                ],
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (tabla === "empresa") {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  punto_venta_ws: 3,
                  arca_ambiente: "produccion",
                  cuit: "20-11111111-2",
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    await expect(recuperarFacturasColgadas(10)).rejects.toThrow(
      "El CUIT de Configuración no coincide con ARCA_CUIT del worker",
    );
  });
});
