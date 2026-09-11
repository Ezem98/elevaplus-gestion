import { describe, it, expect } from "vitest";
import { generarPlantillaFactura } from "./plantillas";

describe("generarPlantillaFactura", () => {
  const paramsBase = {
    factura: {
      tipo: "A" as const,
      puntoVenta: 3,
      numero: 42,
      total: 456218,
    },
    cliente: {
      nombre: "Acme Corp S.A.",
      email: "contacto@acme.com",
    },
    empresa: {
      nombre: "ELEVAPLUS",
      razonSocial: "ELEVAPLUS S.R.L.",
      cuit: "30-71829384-9",
      banco: "Banco Galicia",
      cbu: "0070123456789012345678",
      aliasCbu: "ELEVA.PLUS.PAGOS",
      telefono: "+54 9 11 1234-5678",
      email: "facturacion@eleva-plus.com.ar",
    },
    servicios: [
      {
        id: "serv-1",
        numero: 101,
        descripcion: "Elevación de materiales piso 14",
        monto: 377039.67,
        fecha: "2026-09-10",
      },
    ],
  };

  it("debe armar el asunto con el formato exigido", () => {
    const res = generarPlantillaFactura(paramsBase);
    // Asunto: Factura A 0003-00000042 · ELEVAPLUS · $ 456.218
    expect(res.asunto).toContain("Factura A 0003-00000042");
    expect(res.asunto).toContain("ELEVAPLUS");
    expect(res.asunto).toContain("456.218");
  });

  it("debe incluir los datos bancarios en texto y en HTML", () => {
    const res = generarPlantillaFactura(paramsBase);
    expect(res.texto).toContain("Banco Galicia");
    expect(res.texto).toContain("0070123456789012345678");
    expect(res.texto).toContain("ELEVA.PLUS.PAGOS");

    expect(res.html).toContain("Banco Galicia");
    expect(res.html).toContain("0070123456789012345678");
    expect(res.html).toContain("ELEVA.PLUS.PAGOS");
  });

  it("debe listar los servicios y la leyenda de desestimación si ya pagó", () => {
    const res = generarPlantillaFactura(paramsBase);
    expect(res.texto).toContain("Elevación de materiales piso 14");
    expect(res.texto).toContain("Si ya realizaste el pago");

    expect(res.html).toContain("Elevación de materiales piso 14");
    expect(res.html).toContain("Si ya realizaste el pago");
  });

  it("debe definir el nombre de archivo PDF adjunto correcto", () => {
    const res = generarPlantillaFactura(paramsBase);
    expect(res.nombreArchivoPdf).toBe("Factura-A-0003-00000042.pdf");
  });
});
