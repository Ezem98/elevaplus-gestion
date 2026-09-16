import QRCode from "qrcode";

export interface DatosQrArca {
  ver?: number;
  fecha: string; // YYYY-MM-DD
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda?: string;
  ctz?: number;
  tipoDocRec: number;
  nroDocRec: number;
  tipoCodAut?: "E" | "A";
  codAut: number | string;
}

/**
 * Arma la URL oficial de verificación de comprobante electrónico de ARCA
 * según las especificaciones de QR de AFIP/ARCA.
 */
export function generarUrlQrArca(datos: DatosQrArca): string {
  const objetoQr = {
    ver: datos.ver ?? 1,
    fecha: datos.fecha.slice(0, 10),
    cuit: Number(datos.cuit),
    ptoVta: Number(datos.ptoVta),
    tipoCmp: Number(datos.tipoCmp),
    nroCmp: Number(datos.nroCmp),
    importe: Number(datos.importe),
    moneda: datos.moneda || "PES",
    ctz: datos.ctz ?? 1,
    tipoDocRec: Number(datos.tipoDocRec),
    nroDocRec: Number(datos.nroDocRec),
    tipoCodAut: datos.tipoCodAut || "E",
    codAut: Number(datos.codAut),
  };

  const base64 = Buffer.from(JSON.stringify(objetoQr), "utf-8").toString("base64");
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}

/**
 * Genera el código QR en formato data:image/png;base64 para incrustar en el PDF.
 */
export async function generarImagenQrArca(datos: DatosQrArca): Promise<string> {
  const url = generarUrlQrArca(datos);
  return await QRCode.toDataURL(url, {
    margin: 1,
    width: 120,
    errorCorrectionLevel: "M",
  });
}
