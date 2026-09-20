import React from "react";
import { pdf } from "@react-pdf/renderer";
import { supabaseAdmin } from "../supabase";
import { generarImagenQrArca } from "./qr";
import { FacturaDocumento, type FacturaPDFProps, type ItemFacturaPDF } from "./FacturaPDF";

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Genera el documento PDF de una factura y lo retorna como Buffer.
 */
export async function renderizarPdfFactura(props: FacturaPDFProps): Promise<Buffer> {
  const elemento = React.createElement(FacturaDocumento, props);
  const stream = await pdf(elemento as any).toBuffer();
  return await streamToBuffer(stream as any);
}

/**
 * Genera el PDF completo con QR, lo sube a Supabase Storage y actualiza facturas.pdf_path.
 */
export async function generarYSubirPdfFactura(facturaId: string): Promise<{
  buffer: Buffer;
  pdfPath: string;
}> {
  // 1. Obtener factura con datos del cliente
  const { data: factura, error: errorFactura } = await supabaseAdmin
    .from("facturas")
    .select(`
      *,
      clientes (*)
    `)
    .eq("id", facturaId)
    .single();

  if (errorFactura || !factura) {
    throw new Error(`Factura ${facturaId} no encontrada.`);
  }

  // 2. Obtener servicios asociados a la factura
  const { data: servicios } = await supabaseAdmin
    .from("servicios")
    .select("id, numero, descripcion, monto, aplica_iva, fecha_programada, fecha_fin")
    .eq("factura_id", facturaId);

  // 3. Obtener configuración de empresa
  const { data: empresa, error: errEmpresa } = await supabaseAdmin
    .from("empresa")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (errEmpresa) {
    console.error("[PDF] Error al consultar datos de empresa:", errEmpresa);
  }

  // 4. Generar QR de ARCA
  const cuitEmisorLimpio = Number((empresa?.cuit || "27226514878").replace(/\D/g, ""));
  const cuitReceptorLimpio = Number((factura.clientes?.cuit || "0").replace(/\D/g, ""));
  const tipoCbte = factura.tipo === "A" ? 1 : 6;
  const tipoDocRec = cuitReceptorLimpio > 0 ? 80 : 99;

  const qrDataUrl = await generarImagenQrArca({
    fecha: factura.emitida_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    cuit: cuitEmisorLimpio,
    ptoVta: factura.punto_venta,
    tipoCmp: tipoCbte,
    nroCmp: factura.numero || 0,
    importe: Number(factura.total),
    tipoDocRec,
    nroDocRec: cuitReceptorLimpio,
    codAut: factura.cae || "0",
  });

  // 5. Mapear items
  const items: ItemFacturaPDF[] = (servicios || []).map((s) => ({
    numeroServicio: s.numero,
    fecha: s.fecha_fin || s.fecha_programada,
    descripcion: s.descripcion || `Servicio #${s.numero}`,
    monto: Number(s.monto) || 0,
    aplicaIva: s.aplica_iva !== false,
  }));

  const props: FacturaPDFProps = {
    tipo: factura.tipo,
    puntoVenta: factura.punto_venta,
    numero: factura.numero || 0,
    fechaEmision: factura.emitida_at || new Date().toISOString(),
    cae: factura.cae || "—",
    caeVencimiento: factura.cae_vencimiento || "—",
    periodoDesde: factura.periodo_desde,
    periodoHasta: factura.periodo_hasta,
    fechaVtoPago: factura.fecha_vto_pago,
    qrDataUrl,
    emisor: {
      razonSocial: empresa?.razon_social || "ELEVAPLUS",
      cuit: empresa?.cuit || "27-22651487-8",
      condicionIva: "Responsable Inscripto",
      domicilio: empresa?.domicilio || (empresa as any)?.direccion || "Buenos Aires, Argentina",
      iibb: empresa?.iibb || null,
      inicioActividades: empresa?.inicio_actividades || null,
      cbu: empresa?.cbu || null,
      aliasCbu: empresa?.alias_cbu || null,
      banco: empresa?.banco || null,
      textoPie: empresa?.texto_pie_factura || null,
    },
    receptor: {
      razonSocial: factura.clientes?.nombre || "Consumidor Final",
      cuit: factura.clientes?.cuit || null,
      condicionIva: factura.clientes?.condicion_iva || null,
      domicilio: factura.clientes?.direccion || null,
      condicionPago: factura.clientes?.condicion_pago || null,
    },
    items,
    totales: {
      neto: Number(factura.neto),
      iva: Number(factura.iva),
      total: Number(factura.total),
    },
  };

  // 6. Renderizar a buffer
  const buffer = await renderizarPdfFactura(props);

  // 7. Subir a Storage en bucket facturas
  const nombreArchivo = `${factura.tipo}-${String(factura.punto_venta).padStart(4, "0")}-${String(factura.numero || 0).padStart(8, "0")}.pdf`;
  const storagePath = `${factura.id}/${nombreArchivo}`;

  const { error: errorStorage } = await supabaseAdmin.storage
    .from("facturas")
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (errorStorage) {
    console.error("Error al subir PDF a Storage:", errorStorage);
  }

  // 8. Actualizar facturas.pdf_path
  await supabaseAdmin
    .from("facturas")
    .update({ pdf_path: storagePath })
    .eq("id", factura.id);

  return { buffer, pdfPath: storagePath };
}
