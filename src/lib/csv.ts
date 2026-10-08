/**
 * Utilidades para exportación de datos a CSV con soporte de BOM UTF-8 y caracteres en español.
 */

export function escaparCampo(val: unknown): string {
  if (val == null) return "";
  let str = String(val);
  if (typeof val !== "number" && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function armarCsvVentas(facturas: any[]): string {
  const cabecera =
    "fecha,tipo,punto_venta,número,CUIT,razón social,neto,IVA,total";

  const filas = facturas.map((f) =>
    [
      escaparCampo(f.fecha),
      escaparCampo(f.tipo),
      escaparCampo(f.punto_venta),
      escaparCampo(f.numero),
      escaparCampo(f.clientes?.cuit || ""),
      escaparCampo(f.clientes?.nombre || ""),
      escaparCampo(f.neto != null ? f.neto : ""),
      escaparCampo(f.iva != null ? f.iva : ""),
      escaparCampo(f.total != null ? f.total : ""),
    ].join(","),
  );

  return [cabecera, ...filas].join("\r\n");
}

export function armarCsvCompras(movimientos: any[]): string {
  const cabecera =
    "fecha,proveedor,CUIT proveedor,tipo comprobante,número comprobante,neto,IVA,total";

  const filas = movimientos.map((m) => {
    const numComp =
      m.comprobante_punto_venta && m.comprobante_numero
        ? `${String(m.comprobante_punto_venta).padStart(4, "0")}-${String(m.comprobante_numero).padStart(8, "0")}`
        : m.comprobante_numero || "";

    return [
      escaparCampo(m.fecha),
      escaparCampo(m.proveedor || ""),
      escaparCampo(m.proveedor_cuit || ""),
      escaparCampo(m.comprobante_tipo || ""),
      escaparCampo(numComp),
      escaparCampo(m.neto != null ? m.neto : ""),
      escaparCampo(m.iva != null ? m.iva : ""),
      escaparCampo(m.monto != null ? m.monto : ""),
    ].join(",");
  });

  return [cabecera, ...filas].join("\r\n");
}

export function prepararContenidoCsvConBom(csvText: string): string {
  return "\uFEFF" + csvText;
}
