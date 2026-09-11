import { describe, it, expect } from "vitest";
import { mapearFacturaAComprobanteArca } from "./mapear";

describe("mapearFacturaAComprobanteArca", () => {
  it("mapea correctamente Factura A para Responsable Inscripto", () => {
    const payload = mapearFacturaAComprobanteArca({
      tipo: "A",
      puntoDeVenta: 3,
      numeroComprobante: 42,
      fechaEmision: "2026-09-11",
      periodoDesde: "2026-09-01",
      periodoHasta: "2026-09-10",
      cliente: {
        cuit: "30-71234567-8",
        condicion_iva: "responsable_inscripto",
        dias_pago: 30,
      },
      servicios: [
        { id: "1", monto: 100000, aplica_iva: true },
        { id: "2", monto: 50000, aplica_iva: true },
      ],
    });

    expect(payload.CantReg).toBe(1);
    expect(payload.PtoVta).toBe(3);
    expect(payload.CbteTipo).toBe(1); // Factura A
    expect(payload.Concepto).toBe(2); // Servicios
    expect(payload.DocTipo).toBe(80); // CUIT
    expect(payload.DocNro).toBe(30712345678);
    expect(payload.CbteDesde).toBe(42);
    expect(payload.CbteHasta).toBe(42);
    expect(payload.CbteFch).toBe(20260911);
    expect(payload.FchServDesde).toBe(20260901);
    expect(payload.FchServHasta).toBe(20260910);
    expect(payload.FchVtoPago).toBe(20261011); // +30 días
    expect(payload.ImpNeto).toBe(150000);
    expect(payload.ImpIVA).toBe(31500); // 21%
    expect(payload.ImpTotal).toBe(181500);
    expect(payload.CondicionIVAReceptorId).toBe(1); // RI
    expect(payload.Iva).toEqual([
      { Id: 5, BaseImp: 150000, Importe: 31500 },
    ]);
  });

  it("mapea correctamente Factura B para Consumidor Final sin documento", () => {
    const payload = mapearFacturaAComprobanteArca({
      tipo: "B",
      puntoDeVenta: 3,
      numeroComprobante: 10,
      fechaEmision: "2026-09-11",
      cliente: {
        cuit: null,
        condicion_iva: "consumidor_final",
      },
      servicios: [
        { id: "1", monto: 20000, aplica_iva: true, fecha_programada: "2026-09-05" },
      ],
    });

    expect(payload.CbteTipo).toBe(6); // Factura B
    expect(payload.DocTipo).toBe(99); // Consumidor final
    expect(payload.DocNro).toBe(0);
    expect(payload.CondicionIVAReceptorId).toBe(5); // Consumidor final
    expect(payload.ImpNeto).toBe(20000);
    expect(payload.ImpIVA).toBe(4200);
    expect(payload.ImpTotal).toBe(24200);
    expect(payload.FchVtoPago).toBe(20260911); // mismo día si dias_pago = 0
  });

  it("mapea Factura B para Monotributista con CUIT", () => {
    const payload = mapearFacturaAComprobanteArca({
      tipo: "B",
      puntoDeVenta: 3,
      numeroComprobante: 15,
      fechaEmision: "2026-09-11",
      cliente: {
        cuit: "20-33445566-9",
        condicion_iva: "monotributo",
        dias_pago: 10,
      },
      servicios: [
        { id: "1", monto: 50000, aplica_iva: true },
      ],
    });

    expect(payload.CbteTipo).toBe(6);
    expect(payload.DocTipo).toBe(80);
    expect(payload.DocNro).toBe(20334455669);
    expect(payload.CondicionIVAReceptorId).toBe(6); // Monotributo
    expect(payload.FchVtoPago).toBe(20260921);
  });
});
