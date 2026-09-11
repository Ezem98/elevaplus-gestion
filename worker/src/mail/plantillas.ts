export interface DatosFacturaMail {
  tipo: "A" | "B";
  puntoVenta: number;
  numero: number;
  total: number;
  cae?: string | null;
  periodoDesde?: string | null;
  periodoHasta?: string | null;
}

export interface DatosClienteMail {
  nombre: string;
  email?: string | null;
  emailFacturacion?: string | null;
}

export interface DatosEmpresaMail {
  nombre?: string | null;
  razonSocial?: string | null;
  cuit?: string | null;
  cbu?: string | null;
  aliasCbu?: string | null;
  banco?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export interface ServicioItemMail {
  id: string;
  numero: number;
  descripcion?: string | null;
  monto?: number | null;
  fecha?: string | null;
}

export interface ContenidoMailFactura {
  asunto: string;
  texto: string;
  html: string;
  nombreArchivoPdf: string;
}

export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

export function formatearComprobante(tipo: string, pv: number, numero: number): string {
  return `${tipo} ${String(pv).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}

export function generarPlantillaFactura(params: {
  factura: DatosFacturaMail;
  cliente: DatosClienteMail;
  empresa: DatosEmpresaMail;
  servicios: ServicioItemMail[];
}): ContenidoMailFactura {
  const { factura, cliente, empresa, servicios } = params;

  const nroComprobante = formatearComprobante(factura.tipo, factura.puntoVenta, factura.numero);
  const totalFormateado = formatearMoneda(factura.total);
  const nombreEmpresa = empresa.nombre || "ELEVAPLUS";
  const nombreArchivoPdf = `Factura-${factura.tipo}-${String(factura.puntoVenta).padStart(4, "0")}-${String(factura.numero).padStart(8, "0")}.pdf`;

  // Asunto: Factura A 0003-00000042 · ELEVAPLUS · $ 456.218
  const asunto = `Factura ${nroComprobante} · ${nombreEmpresa} · ${totalFormateado}`;

  // Lista de servicios para texto y HTML
  const lineasServiciosTexto: string[] = [];
  const filasServiciosHtml: string[] = [];

  for (const s of servicios) {
    const fecha = s.fecha ? s.fecha.slice(0, 10) : "";
    const desc = s.descripcion || `Servicio #${s.numero}`;
    const monto = s.monto ? formatearMoneda(Number(s.monto)) : "";

    lineasServiciosTexto.push(`- ${fecha ? `[${fecha}] ` : ""}${desc}${monto ? ` (${monto})` : ""}`);

    filasServiciosHtml.push(`
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #374151;">
          ${fecha ? `<span style="color: #6b7280; font-size: 12px; display: block;">${fecha}</span>` : ""}
          ${desc}
        </td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 500; text-align: right; color: #111827;">
          ${monto}
        </td>
      </tr>
    `);
  }

  // Datos de pago
  const tieneDatosPago = Boolean(empresa.cbu || empresa.aliasCbu || empresa.banco);
  let bloquePagoTexto = "";
  if (tieneDatosPago) {
    bloquePagoTexto = `
Datos para realizar la transferencia:
${empresa.banco ? `Banco: ${empresa.banco}\n` : ""}${empresa.cbu ? `CBU: ${empresa.cbu}\n` : ""}${empresa.aliasCbu ? `Alias: ${empresa.aliasCbu}\n` : ""}${empresa.razonSocial ? `Titular: ${empresa.razonSocial}\n` : ""}${empresa.cuit ? `CUIT: ${empresa.cuit}\n` : ""}`;
  }

  // Cuerpo Texto Plano
  const texto = `Hola ${cliente.nombre},

Te enviamos adjunta la factura ${nroComprobante} correspondiente a los siguientes servicios:

${lineasServiciosTexto.join("\n")}

Total a abonar: ${totalFormateado}
${bloquePagoTexto}
Si ya realizaste el pago, por favor ignorá este mensaje.

Muchas gracias.
${nombreEmpresa}${empresa.telefono ? ` · Tel: ${empresa.telefono}` : ""}`;

  // Cuerpo HTML Simple y Limpio
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${asunto}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #111827; padding: 20px 24px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.5px;">${nombreEmpresa}</h1>
      <p style="color: #9ca3af; margin: 4px 0 0 0; font-size: 13px;">Facturación electrónica</p>
    </div>

    <div style="padding: 24px;">
      <p style="font-size: 15px; margin-top: 0; color: #374151;">Hola <strong>${cliente.nombre}</strong>,</p>
      <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
        Te enviamos adjunta la <strong>Factura ${nroComprobante}</strong> por los siguientes servicios realizados:
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #fcfcfd; border: 1px solid #e5e7eb; border-radius: 6px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 10px 12px; font-size: 12px; font-weight: 600; text-align: left; color: #4b5563; text-transform: uppercase;">Servicio</th>
            <th style="padding: 10px 12px; font-size: 12px; font-weight: 600; text-align: right; color: #4b5563; text-transform: uppercase;">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${filasServiciosHtml.join("")}
          <tr>
            <td style="padding: 12px; font-size: 15px; font-weight: 700; color: #111827; text-align: right;" colspan="2">
              Total: ${totalFormateado}
            </td>
          </tr>
        </tbody>
      </table>

      ${
        tieneDatosPago
          ? `
      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 4px; margin: 24px 0;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #1e293b;">Datos para realizar el pago:</h3>
        <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.6;">
          ${empresa.banco ? `<strong>Banco:</strong> ${empresa.banco}<br>` : ""}
          ${empresa.cbu ? `<strong>CBU:</strong> ${empresa.cbu}<br>` : ""}
          ${empresa.aliasCbu ? `<strong>Alias:</strong> ${empresa.aliasCbu}<br>` : ""}
          ${empresa.razonSocial ? `<strong>Titular:</strong> ${empresa.razonSocial}<br>` : ""}
          ${empresa.cuit ? `<strong>CUIT:</strong> ${empresa.cuit}` : ""}
        </p>
      </div>
      `
          : ""
      }

      <p style="font-size: 13px; color: #6b7280; font-style: italic; margin: 20px 0 0 0;">
        Si ya realizaste el pago de esta factura, por favor ignorá este mensaje.
      </p>
    </div>

    <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
      ${nombreEmpresa}${empresa.telefono ? ` · Tel: ${empresa.telefono}` : ""}${empresa.email ? ` · ${empresa.email}` : ""}
    </div>
  </div>
</body>
</html>`;

  return {
    asunto,
    texto,
    html,
    nombreArchivoPdf,
  };
}
