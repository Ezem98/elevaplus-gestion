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

export function escaparHtml(texto: string): string {
  if (texto == null) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

export function formatearComprobante(
  tipo: string,
  pv: number,
  numero: number,
): string {
  return `${tipo} ${String(pv).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}

export function generarPlantillaFactura(params: {
  factura: DatosFacturaMail;
  cliente: DatosClienteMail;
  empresa: DatosEmpresaMail;
  servicios: ServicioItemMail[];
}): ContenidoMailFactura {
  const { factura, cliente, empresa, servicios } = params;

  const nroComprobante = formatearComprobante(
    factura.tipo,
    factura.puntoVenta,
    factura.numero,
  );
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

    lineasServiciosTexto.push(
      `- ${fecha ? `[${fecha}] ` : ""}${desc}${monto ? ` (${monto})` : ""}`,
    );

    filasServiciosHtml.push(`
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #374151;">
          ${fecha ? `<span style="color: #6b7280; font-size: 12px; display: block;">${escaparHtml(fecha)}</span>` : ""}
          ${escaparHtml(desc)}
        </td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 500; text-align: right; color: #111827;">
          ${escaparHtml(monto)}
        </td>
      </tr>
    `);
  }

  // Datos de pago
  const tieneDatosPago = Boolean(
    empresa.cbu || empresa.aliasCbu || empresa.banco,
  );
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
  <title>${escaparHtml(asunto)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #1f2937;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #111827; padding: 20px 24px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.5px;">${escaparHtml(nombreEmpresa)}</h1>
      <p style="color: #9ca3af; margin: 4px 0 0 0; font-size: 13px;">Facturación electrónica</p>
    </div>

    <div style="padding: 24px;">
      <p style="font-size: 15px; margin-top: 0; color: #374151;">Hola <strong>${escaparHtml(cliente.nombre)}</strong>,</p>
      <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
        Te enviamos adjunta la <strong>Factura ${escaparHtml(nroComprobante)}</strong> por los siguientes servicios realizados:
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
              Total: ${escaparHtml(totalFormateado)}
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
          ${empresa.banco ? `<strong>Banco:</strong> ${escaparHtml(empresa.banco)}<br>` : ""}
          ${empresa.cbu ? `<strong>CBU:</strong> ${escaparHtml(empresa.cbu)}<br>` : ""}
          ${empresa.aliasCbu ? `<strong>Alias:</strong> ${escaparHtml(empresa.aliasCbu)}<br>` : ""}
          ${empresa.razonSocial ? `<strong>Titular:</strong> ${escaparHtml(empresa.razonSocial)}<br>` : ""}
          ${empresa.cuit ? `<strong>CUIT:</strong> ${escaparHtml(empresa.cuit)}` : ""}
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
      ${escaparHtml(nombreEmpresa)}${empresa.telefono ? ` · Tel: ${escaparHtml(empresa.telefono)}` : ""}${empresa.email ? ` · ${escaparHtml(empresa.email)}` : ""}
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

export interface ItemAgendaSemanalMail {
  fecha: string;
  titulo: string;
  monto?: number | null;
  sentido: "ingreso" | "egreso" | "info";
  detalle?: string | null;
}

export interface ChequeSemanalMail {
  id: string;
  numero?: string | null;
  banco?: string | null;
  monto: number;
  tipo: "recibido" | "emitido";
  fechaPago: string;
  contraparte: string;
}

export interface ProyeccionDiaMail {
  fecha: string;
  ingresos: number;
  egresos: number;
  saldoProyectado: number;
}

export interface DatosResumenSemanalMail {
  rangoTexto: string;
  itemsAgenda: ItemAgendaSemanalMail[];
  chequesCobrar: ChequeSemanalMail[];
  chequesCubrir: ChequeSemanalMail[];
  proyeccion: ProyeccionDiaMail[];
  alertaDescubierto: boolean;
}

export interface ContenidoMailResumenSemanal {
  asunto: string;
  texto: string;
  html: string;
}

export function generarPlantillaResumenSemanal(
  datos: DatosResumenSemanalMail,
): ContenidoMailResumenSemanal {
  const {
    rangoTexto,
    itemsAgenda,
    chequesCobrar,
    chequesCubrir,
    proyeccion,
    alertaDescubierto,
  } = datos;

  const asunto = `ELEVAPLUS · ${rangoTexto}`;

  // 1. Versión texto plano
  const lineasTexto: string[] = [];
  lineasTexto.push(`ELEVAPLUS — Resumen Semanal`);
  lineasTexto.push(rangoTexto);
  lineasTexto.push("----------------------------------------");

  if (alertaDescubierto) {
    lineasTexto.push(
      "⚠️ ATENCIÓN: Se proyecta saldo negativo o descubierto durante esta semana.",
    );
    lineasTexto.push("----------------------------------------");
  }

  lineasTexto.push("\nCOMPROMISOS Y AGENDA DE LA SEMANA:");
  if (itemsAgenda.length === 0) {
    lineasTexto.push("No hay compromisos agendados para esta semana.");
  } else {
    for (const it of itemsAgenda) {
      const montoTxt =
        it.monto != null ? ` (${formatearMoneda(Number(it.monto))})` : "";
      lineasTexto.push(
        `- [${it.fecha}] ${it.titulo}${montoTxt}${it.detalle ? ` · ${it.detalle}` : ""}`,
      );
    }
  }

  lineasTexto.push("\nCHEQUES A COBRAR:");
  if (chequesCobrar.length === 0) {
    lineasTexto.push("Sin cheques a cobrar.");
  } else {
    for (const ch of chequesCobrar) {
      lineasTexto.push(
        `- [${ch.fechaPago}] ${ch.banco || "Cheque"} N° ${ch.numero || "s/n"} · ${ch.contraparte}: ${formatearMoneda(ch.monto)}`,
      );
    }
  }

  lineasTexto.push("\nCHEQUES A CUBRIR:");
  if (chequesCubrir.length === 0) {
    lineasTexto.push("Sin cheques a cubrir.");
  } else {
    for (const ch of chequesCubrir) {
      lineasTexto.push(
        `- [${ch.fechaPago}] ${ch.banco || "Cheque propio"} N° ${ch.numero || "s/n"} · ${ch.contraparte}: ${formatearMoneda(ch.monto)}`,
      );
    }
  }

  lineasTexto.push("\nPROYECCIÓN DE CAJA (7 DÍAS):");
  for (const p of proyeccion) {
    lineasTexto.push(
      `[${p.fecha}] Saldo: ${formatearMoneda(p.saldoProyectado)} (Ingresos: ${formatearMoneda(p.ingresos)}, Egresos: ${formatearMoneda(p.egresos)})`,
    );
  }

  lineasTexto.push("\nAccedé a la agenda completa en:");
  lineasTexto.push("https://gestion.eleva-plus.com.ar/agenda");

  const texto = lineasTexto.join("\n");

  // 2. Versión HTML simple
  // Agrupar ítems de agenda por fecha
  const filasAgendaHtml =
    itemsAgenda.length === 0
      ? `<tr><td colspan="2" style="padding: 10px; font-size: 13px; color: #6b7280; text-align: center;">No hay compromisos agendados para esta semana.</td></tr>`
      : itemsAgenda
          .map((it) => {
            const esIngreso = it.sentido === "ingreso";
            const colorMonto = esIngreso ? "#15803d" : "#111827";
            const signo = esIngreso ? "+" : "";
            const montoTxt =
              it.sentido === "info" || it.monto == null
                ? `<span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 500; border-radius: 9999px; background: #e6edf9; color: #1e4fa8;">Informativo</span>`
                : `<span style="font-weight: 600; color: ${colorMonto};">${signo}${escaparHtml(formatearMoneda(Number(it.monto)))}</span>`;

            return `
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">
                  <strong style="color: #4b5563; font-size: 12px; display: block;">${escaparHtml(it.fecha)}</strong>
                  ${escaparHtml(it.titulo)}${it.detalle ? ` <span style="color: #6b7280; font-size: 12px;">· ${escaparHtml(it.detalle)}</span>` : ""}
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right;">
                  ${montoTxt}
                </td>
              </tr>
            `;
          })
          .join("");

  const filasCobrarHtml =
    chequesCobrar.length === 0
      ? `<tr><td colspan="2" style="padding: 8px; font-size: 13px; color: #6b7280;">Sin cheques a cobrar.</td></tr>`
      : chequesCobrar
          .map(
            (ch) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">
            <span style="color: #4b5563; font-size: 12px;">${escaparHtml(ch.fechaPago)}</span> · <strong>${escaparHtml(ch.banco || "Cheque")} N° ${escaparHtml(ch.numero || "s/n")}</strong> (${escaparHtml(ch.contraparte)})
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; font-weight: 600; color: #15803d; text-align: right;">
            +${escaparHtml(formatearMoneda(ch.monto))}
          </td>
        </tr>
      `,
          )
          .join("");

  const filasCubrirHtml =
    chequesCubrir.length === 0
      ? `<tr><td colspan="2" style="padding: 8px; font-size: 13px; color: #6b7280;">Sin cheques a cubrir.</td></tr>`
      : chequesCubrir
          .map(
            (ch) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #1f2937;">
            <span style="color: #4b5563; font-size: 12px;">${escaparHtml(ch.fechaPago)}</span> · <strong>${escaparHtml(ch.banco || "Cheque propio")} N° ${escaparHtml(ch.numero || "s/n")}</strong> (${escaparHtml(ch.contraparte)})
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; font-weight: 600; color: #111827; text-align: right;">
            ${escaparHtml(formatearMoneda(ch.monto))}
          </td>
        </tr>
      `,
          )
          .join("");

  const filasProyeccionHtml = proyeccion
    .map((p) => {
      const esNegativo = p.saldoProyectado < 0;
      const colorSaldo = esNegativo ? "#b91c1c" : "#111827";
      const bgFila = esNegativo ? "background-color: #fef2f2;" : "";

      return `
        <tr style="${bgFila}">
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${escaparHtml(p.fecha)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right; color: #15803d;">+${escaparHtml(formatearMoneda(p.ingresos))}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right; color: #4b5563;">${escaparHtml(formatearMoneda(p.egresos))}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right; font-weight: 600; color: ${colorSaldo};">
            ${esNegativo ? `−${escaparHtml(formatearMoneda(Math.abs(p.saldoProyectado)))}` : escaparHtml(formatearMoneda(p.saldoProyectado))}
          </td>
        </tr>
      `;
    })
    .join("");

  const alertaHtml = alertaDescubierto
    ? `
      <div style="background-color: #fdf0e0; border-left: 4px solid #b45309; padding: 14px 16px; border-radius: 6px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #b45309;">⚠️ Atención: Alerta de descubierto</h3>
        <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.5;">
          Se proyecta saldo negativo o fondos insuficientes durante esta semana. Revisá la proyección y los compromisos a cubrir.
        </p>
      </div>
    `
    : "";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escaparHtml(asunto)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 24px 12px;">
  <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
    <!-- Cabecera -->
    <div style="background-color: #1e4fa8; padding: 20px 24px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em;">ELEVAPLUS</h1>
      <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">Resumen Semanal · ${escaparHtml(rangoTexto)}</p>
    </div>

    <div style="padding: 24px;">
      ${alertaHtml}

      <!-- Agenda de la semana -->
      <h2 style="font-size: 15px; font-weight: 600; color: #111827; margin: 0 0 12px 0;">Compromisos y agenda de la semana</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tbody>
          ${filasAgendaHtml}
        </tbody>
      </table>

      <!-- Cheques de la semana -->
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 15px; font-weight: 600; color: #111827; margin: 0 0 12px 0;">Cheques de la semana</h2>
        
        <h3 style="font-size: 13px; font-weight: 600; color: #15803d; margin: 0 0 8px 0;">A cobrar</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tbody>
            ${filasCobrarHtml}
          </tbody>
        </table>

        <h3 style="font-size: 13px; font-weight: 600; color: #4b5563; margin: 0 0 8px 0;">A cubrir</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tbody>
            ${filasCubrirHtml}
          </tbody>
        </table>
      </div>

      <!-- Proyección de caja -->
      <h2 style="font-size: 15px; font-weight: 600; color: #111827; margin: 0 0 12px 0;">Proyección de caja (próximos 7 días)</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f9fafb;">
            <th style="padding: 8px 12px; font-size: 12px; text-align: left; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Fecha</th>
            <th style="padding: 8px 12px; font-size: 12px; text-align: right; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Ingresos</th>
            <th style="padding: 8px 12px; font-size: 12px; text-align: right; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Egresos</th>
            <th style="padding: 8px 12px; font-size: 12px; text-align: right; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${filasProyeccionHtml}
        </tbody>
      </table>

      <!-- Enlace al sistema -->
      <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <a href="https://gestion.eleva-plus.com.ar/agenda" style="display: inline-block; background-color: #1e4fa8; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px;">
          Abrir Agenda en el sistema →
        </a>
      </div>
    </div>

    <!-- Pie -->
    <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
      ELEVAPLUS Gestión · Mensaje automático generado por el worker
    </div>
  </div>
</body>
</html>`;

  return {
    asunto,
    texto,
    html,
  };
}
