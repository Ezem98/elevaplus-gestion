import { describe, it, expect } from "vitest";
import { renderizarPdfFactura } from "./generar";
import { generarImagenQrArca } from "./qr";

describe("renderizarPdfFactura", () => {
  it("genera un buffer de PDF válido para Factura A", async () => {
    const qrDataUrl = await generarImagenQrArca({
      fecha: "2026-09-11",
      cuit: 27226514878,
      ptoVta: 3,
      tipoCmp: 1,
      nroCmp: 42,
      importe: 181500,
      tipoDocRec: 80,
      nroDocRec: 30712345678,
      codAut: "74321234567890",
    });

    const buffer = await renderizarPdfFactura({
      tipo: "A",
      puntoVenta: 3,
      numero: 42,
      fechaEmision: "2026-09-11",
      cae: "74321234567890",
      caeVencimiento: "2026-09-21",
      periodoDesde: "2026-09-01",
      periodoHasta: "2026-09-10",
      fechaVtoPago: "2026-09-26",
      qrDataUrl,
      emisor: {
        razonSocial: "ELEVAPLUS DE CORONEL MARIANA",
        cuit: "27-22651487-8",
        condicionIva: "Responsable Inscripto",
        domicilio: "Av. Hipólito Yrigoyen 1234, Burzaco",
        iibb: "27-22651487-8",
        inicioActividades: "2020-01-01",
        cbu: "0140000000000000000000",
        aliasCbu: "ELEVA.PLUS",
        banco: "Banco Provincia",
        textoPie: "Gracias por confiar en nosotros.",
      },
      receptor: {
        razonSocial: "EMPRESA CLIENTE S.A.",
        cuit: "30-71234567-8",
        condicionIva: "Responsable Inscripto",
        domicilio: "Av. San Martín 500, Adrogué",
        condicionPago: "Cuenta corriente",
      },
      items: [
        {
          numeroServicio: 101,
          fecha: "2026-09-02",
          descripcion: "Traslado de autoelevador 2.5tn",
          monto: 100000,
          aplicaIva: true,
        },
        {
          numeroServicio: 102,
          fecha: "2026-09-05",
          descripcion: "Alquiler plataforma tijera 12m",
          monto: 50000,
          aplicaIva: true,
        },
      ],
      totales: {
        neto: 150000,
        iva: 31500,
        total: 181500,
      },
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    // Verificar encabezado PDF: %PDF-
    expect(buffer.slice(0, 4).toString()).toBe("%PDF");
  });

  it("genera un buffer de PDF válido para Factura B", async () => {
    const qrDataUrl = await generarImagenQrArca({
      fecha: "2026-09-11",
      cuit: 27226514878,
      ptoVta: 3,
      tipoCmp: 6,
      nroCmp: 15,
      importe: 24200,
      tipoDocRec: 99,
      nroDocRec: 0,
      codAut: "12345678901234",
    });

    const buffer = await renderizarPdfFactura({
      tipo: "B",
      puntoVenta: 3,
      numero: 15,
      fechaEmision: "2026-09-11",
      cae: "12345678901234",
      caeVencimiento: "2026-09-21",
      qrDataUrl,
      emisor: {
        razonSocial: "ELEVAPLUS",
        cuit: "27-22651487-8",
        condicionIva: "Responsable Inscripto",
      },
      receptor: {
        razonSocial: "Juan Pérez",
        cuit: null,
        condicionIva: "Consumidor final",
      },
      items: [
        {
          numeroServicio: 201,
          descripcion: "Servicio de grúa particular",
          monto: 20000,
          aplicaIva: true,
        },
      ],
      totales: {
        neto: 20000,
        iva: 4200,
        total: 24200,
      },
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.slice(0, 4).toString()).toBe("%PDF");
  });
});
