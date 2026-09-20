import { supabaseAdmin } from "../supabase";
import { generarPlantillaFactura } from "./plantillas";
import { enviarMailConResend, type ResultadoEnvioMail } from "./cliente";
import { generarYSubirPdfFactura } from "../pdf/generar";

export interface ResultadoProcesoEnvioMail {
  exito: boolean;
  destinatario?: string;
  motivo?: string;
}

/**
 * Carga los datos de una factura emitida, obtiene su PDF adjunto
 * y la envía por correo electrónico al cliente usando Resend.
 */
export async function enviarFacturaEmail(facturaId: string): Promise<ResultadoProcesoEnvioMail> {
  // 1. Obtener la factura y su cliente
  const { data: factura, error: errFactura } = await supabaseAdmin
    .from("facturas")
    .select("id, tipo, punto_venta, numero, total, cae, periodo_desde, periodo_hasta, estado_emision, pdf_path, cliente_id, clientes(id, nombre, email, email_facturacion, enviar_factura_email)")
    .eq("id", facturaId)
    .single();

  if (errFactura || !factura) {
    throw new Error(`Factura ${facturaId} no encontrada: ${errFactura?.message}`);
  }

  const cliente = factura.clientes as any;
  if (!cliente) {
    throw new Error(`Cliente asociado a la factura ${facturaId} no encontrado.`);
  }

  const emailDestino = (cliente.email_facturacion || cliente.email || "").trim();
  if (!emailDestino) {
    console.warn(`[MAIL] Cliente ${cliente.nombre} (${cliente.id}) no tiene email cargado.`);
    return {
      exito: false,
      motivo: "sin_email",
    };
  }

  // 2. Obtener datos de la empresa
  const { data: empresa, error: errEmpresa } = await supabaseAdmin
    .from("empresa")
    .select("razon_social, cuit, cbu, alias_cbu, banco, telefono, email")
    .eq("id", 1)
    .maybeSingle();

  if (errEmpresa) {
    console.error("[MAIL] Error al consultar datos de empresa:", errEmpresa);
  }

  // 3. Obtener servicios vinculados
  const { data: servicios } = await supabaseAdmin
    .from("servicios")
    .select("id, numero, descripcion, monto, fecha_programada, fecha_fin")
    .eq("factura_id", facturaId);

  // 4. Obtener el archivo PDF
  let pdfBuffer: Buffer | null = null;

  if (factura.pdf_path) {
    try {
      const { data: blobPdf, error: errStorage } = await supabaseAdmin.storage
        .from("facturas")
        .download(factura.pdf_path);

      if (!errStorage && blobPdf) {
        const arrayBuf = await blobPdf.arrayBuffer();
        pdfBuffer = Buffer.from(arrayBuf);
      }
    } catch (errDescarga) {
      console.warn(`[MAIL] No se pudo descargar el PDF existente en Storage (${factura.pdf_path}):`, errDescarga);
    }
  }

  // Si no había PDF en storage o falló la descarga, generarlo y subirlo
  if (!pdfBuffer) {
    console.log(`[MAIL] Generando PDF para la factura ${facturaId}...`);
    const resPdf = await generarYSubirPdfFactura(facturaId);
    pdfBuffer = resPdf.buffer;
  }

  if (!pdfBuffer) {
    throw new Error(`No se pudo obtener ni generar el PDF para la factura ${facturaId}.`);
  }


  // 5. Generar contenido del correo
  const contenido = generarPlantillaFactura({
    factura: {
      tipo: factura.tipo as "A" | "B",
      puntoVenta: factura.punto_venta,
      numero: factura.numero,
      total: Number(factura.total) || 0,
      cae: factura.cae,
      periodoDesde: factura.periodo_desde,
      periodoHasta: factura.periodo_hasta,
    },
    cliente: {
      nombre: cliente.nombre,
      email: cliente.email,
      emailFacturacion: cliente.email_facturacion,
    },
    empresa: {
      nombre: (empresa as any)?.razon_social || "ELEVAPLUS",
      razonSocial: (empresa as any)?.razon_social || "ELEVAPLUS",
      cuit: empresa?.cuit,
      cbu: empresa?.cbu,
      aliasCbu: empresa?.alias_cbu,
      banco: empresa?.banco,
      telefono: empresa?.telefono,
      email: empresa?.email,
    },
    servicios: (servicios || []).map((s) => ({
      id: s.id,
      numero: s.numero,
      descripcion: s.descripcion,
      monto: s.monto ? Number(s.monto) : null,
      fecha: s.fecha_fin || s.fecha_programada || null,
    })),
  });

  // 6. Enviar vía Resend
  const resEnvio: ResultadoEnvioMail = await enviarMailConResend({
    para: emailDestino,
    asunto: contenido.asunto,
    texto: contenido.texto,
    html: contenido.html,
    nombreAdjunto: contenido.nombreArchivoPdf,
    contenidoAdjunto: pdfBuffer,
    replyTo: empresa?.email || undefined,
  });

  if (resEnvio.exito) {
    // Actualizar registro en facturas
    await supabaseAdmin
      .from("facturas")
      .update({
        enviada_email_at: new Date().toISOString(),
        email_destino: resEnvio.destinatario,
      })
      .eq("id", facturaId);

    return {
      exito: true,
      destinatario: resEnvio.destinatario,
    };
  }

  return {
    exito: false,
    destinatario: resEnvio.destinatario,
    motivo: resEnvio.motivo,
  };
}
