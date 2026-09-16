import { describe, it, expect } from "vitest";
import { generarUrlQrArca, generarImagenQrArca } from "./qr";

describe("generarUrlQrArca", () => {
  it("arma correctamente la URL y payload en base64", () => {
    const url = generarUrlQrArca({
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

    expect(url.startsWith("https://www.afip.gob.ar/fe/qr/?p=")).toBe(true);

    const base64 = url.replace("https://www.afip.gob.ar/fe/qr/?p=", "");
    const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

    expect(decoded.ver).toBe(1);
    expect(decoded.fecha).toBe("2026-09-11");
    expect(decoded.cuit).toBe(27226514878);
    expect(decoded.ptoVta).toBe(3);
    expect(decoded.tipoCmp).toBe(1);
    expect(decoded.nroCmp).toBe(42);
    expect(decoded.importe).toBe(181500);
    expect(decoded.moneda).toBe("PES");
    expect(decoded.ctz).toBe(1);
    expect(decoded.tipoDocRec).toBe(80);
    expect(decoded.nroDocRec).toBe(30712345678);
    expect(decoded.tipoCodAut).toBe("E");
    expect(decoded.codAut).toBe(74321234567890);
  });

  it("genera la data URL del código QR", async () => {
    const dataUrl = await generarImagenQrArca({
      fecha: "2026-09-11",
      cuit: 27226514878,
      ptoVta: 3,
      tipoCmp: 6,
      nroCmp: 10,
      importe: 25000,
      tipoDocRec: 99,
      nroDocRec: 0,
      codAut: "12345678901234",
    });

    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
