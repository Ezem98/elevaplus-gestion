import { describe, it, expect } from "vitest";
import { construirPayloadPushLote } from "./push";

describe("construirPayloadPushLote", () => {
  it("debe retornar null cuando no hubo emitidas ni descartados (silencioso)", () => {
    const payload = construirPayloadPushLote({
      facturasEmitidas: 0,
      montoTotal: 0,
      cantidadDescartados: 0,
    });
    expect(payload).toBeNull();
  });

  it("debe retornar alerta cuando hubo error general o tope superado", () => {
    const payloadTope = construirPayloadPushLote({
      facturasEmitidas: 0,
      montoTotal: 0,
      cantidadDescartados: 2,
      error: "tope_superado",
    });
    expect(payloadTope?.titulo).toBe("ALERTA: falló el lote de facturación nocturno");
    expect(payloadTope?.cuerpo).toContain("topes de emisión");

    const payloadError = construirPayloadPushLote({
      facturasEmitidas: 0,
      montoTotal: 0,
      cantidadDescartados: 0,
      error: "Error de conexión con ARCA",
    });
    expect(payloadError?.titulo).toBe("ALERTA: falló el lote de facturación nocturno");
    expect(payloadError?.cuerpo).toBe("Error de conexión con ARCA");
  });

  it("debe retornar resumen con emitidas y descartadas", () => {
    const payload = construirPayloadPushLote({
      facturasEmitidas: 14,
      montoTotal: 1250000,
      cantidadDescartados: 3,
    });
    expect(payload?.titulo).toContain("14 facturas");
    expect(payload?.cuerpo).toContain("3 servicio(s) descartados requieren atención");
    expect(payload?.url).toBe("/facturacion");
  });

  it("debe retornar resumen solo con emitidas", () => {
    const payload = construirPayloadPushLote({
      facturasEmitidas: 1,
      montoTotal: 50000,
      cantidadDescartados: 0,
    });
    expect(payload?.titulo).toContain("1 factura");
    expect(payload?.cuerpo).toContain("El lote nocturno se completó con éxito");
  });

  it("debe retornar resumen si solo hubo descartadas", () => {
    const payload = construirPayloadPushLote({
      facturasEmitidas: 0,
      montoTotal: 0,
      cantidadDescartados: 2,
    });
    expect(payload?.titulo).toBe("Lote de facturación nocturno");
    expect(payload?.cuerpo).toBe("2 servicios descartados requieren atención");
  });
});
