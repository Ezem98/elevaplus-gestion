import { config } from "../config";
import { supabaseAdmin } from "../supabase";

export interface ParametrosPushDirecto {
  titulo: string;
  cuerpo: string;
  url?: string;
  tag: string;
  destinatarios?: "oficina" | string;
}

export interface ParametrosNotificacionLote {
  facturasEmitidas: number;
  montoTotal: number;
  cantidadDescartados: number;
  error?: string | null;
}

export interface PayloadPushLote {
  titulo: string;
  cuerpo: string;
  url: string;
  tag: string;
}

export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

/**
 * Determina el mensaje push a enviar según el resultado del lote.
 * Retorna null si no corresponde notificar (lote vacío sin novedades).
 */
export function construirPayloadPushLote(
  params: ParametrosNotificacionLote,
): PayloadPushLote | null {
  const { facturasEmitidas, montoTotal, cantidadDescartados, error } = params;

  // 1. Si falló el lote completo
  if (error) {
    let detalle = error;
    if (error === "tope_superado") {
      detalle = "Se superaron los topes de emisión configurados.";
    }
    return {
      titulo: "ALERTA: falló el lote de facturación nocturno",
      cuerpo: detalle,
      url: "/facturacion",
      tag: "facturacion-lote",
    };
  }

  // 2. Si no hubo nada para emitir ni descartar: silencioso
  if (facturasEmitidas === 0 && cantidadDescartados === 0) {
    return null;
  }

  // 3. Si hubo emitidas y descartadas
  if (facturasEmitidas > 0 && cantidadDescartados > 0) {
    const textoFacturas =
      facturasEmitidas === 1 ? "1 factura" : `${facturasEmitidas} facturas`;
    return {
      titulo: `Se emitieron ${textoFacturas} por ${formatearMoneda(montoTotal)}`,
      cuerpo: `Lote de facturación: ${cantidadDescartados} servicio(s) descartados requieren atención`,
      url: "/facturacion",
      tag: "facturacion-lote",
    };
  }

  // 4. Si solo hubo emitidas
  if (facturasEmitidas > 0 && cantidadDescartados === 0) {
    const textoFacturas =
      facturasEmitidas === 1 ? "1 factura" : `${facturasEmitidas} facturas`;
    return {
      titulo: `Se emitieron ${textoFacturas} por ${formatearMoneda(montoTotal)}`,
      cuerpo: "El lote nocturno se completó con éxito.",
      url: "/facturacion",
      tag: "facturacion-lote",
    };
  }

  // 5. Si no hubo emitidas pero sí descartadas
  const textoDescartados =
    cantidadDescartados === 1
      ? "1 servicio descartado requiere atención"
      : `${cantidadDescartados} servicios descartados requieren atención`;
  return {
    titulo: "Lote de facturación nocturno",
    cuerpo: textoDescartados,
    url: "/facturacion",
    tag: "facturacion-lote",
  };
}

/**
 * Envía la notificación push a admin y oficina vía la Edge Function enviar-push.
 */
export async function notificarLotePush(
  params: ParametrosNotificacionLote,
): Promise<void> {
  const payload = construirPayloadPushLote(params);
  if (!payload) {
    return;
  }

  try {
    const { data, error } = await supabaseAdmin.functions.invoke(
      "enviar-push",
      {
        body: {
          direct: true,
          titulo: payload.titulo,
          cuerpo: payload.cuerpo,
          url: payload.url,
          tag: payload.tag,
        },
      },
    );

    if (error) {
      console.error(
        "Error al invocar Edge Function enviar-push para lote:",
        error,
      );
    } else {
      console.log("Notificación push de lote enviada con éxito.");
    }
  } catch (err) {
    console.error("Excepción al enviar notificación push de lote:", err);
  }
}

/**
 * Envía un mensaje push directo a través de EDGE_PUSH_URL (o invoke fallback).
 */
export async function enviarPushDirecto(
  params: ParametrosPushDirecto,
): Promise<{ ok: boolean; error?: string }> {
  const { titulo, cuerpo, url = "/", tag, destinatarios = "oficina" } = params;
  const payload = {
    tipo: "directo",
    titulo,
    cuerpo,
    url,
    tag,
    destinatarios,
  };

  try {
    if (
      config.EDGE_PUSH_URL &&
      config.EDGE_PUSH_URL.trim() !== "" &&
      config.WEBHOOK_SECRET &&
      config.WEBHOOK_SECRET.trim() !== ""
    ) {
      const resp = await fetch(config.EDGE_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.WEBHOOK_SECRET}`,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error(
          `[PUSH] Error al llamar a EDGE_PUSH_URL (${resp.status}):`,
          txt,
        );
        return { ok: false, error: txt };
      }

      console.log(
        `[PUSH] Notificación enviada con éxito vía EDGE_PUSH_URL (tag: ${tag})`,
      );
      return { ok: true };
    }

    // Fallback: invocar directamente la Edge Function vía supabaseAdmin
    const { data, error } = await supabaseAdmin.functions.invoke(
      "enviar-push",
      {
        body: payload,
      },
    );

    if (error) {
      console.error(
        "[PUSH] Error al invocar Edge Function enviar-push:",
        error,
      );
      return { ok: false, error: error.message };
    }

    console.log(
      `[PUSH] Notificación enviada vía supabaseAdmin.functions (tag: ${tag})`,
    );
    return { ok: true };
  } catch (err: any) {
    console.error("[PUSH] Excepción al enviar push directo:", err);
    return { ok: false, error: err?.message || String(err) };
  }
}
