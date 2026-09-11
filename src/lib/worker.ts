import { supabase } from "./supabase";

export interface EstadoWorker {
  online: boolean;
  ambiente?: string;
}

export interface RespuestaPadronArca {
  ok: boolean;
  cuit?: string;
  razon_social?: string;
  condicion_iva?: "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final";
  domicilio?: string;
  activo?: boolean;
  error?: string;
}

export interface RespuestaEmitirArca {
  ok: boolean;
  factura_id?: string;
  tipo?: "A" | "B";
  punto_venta?: number;
  numero?: number;
  cae?: string;
  cae_vencimiento?: string;
  pdf_path?: string | null;
  error?: string;
}

export interface RespuestaLoteManual {
  ok: boolean;
  loteId?: string;
  facturasEmitidas?: number;
  montoTotal?: number;
  descartados?: any[];
  error?: string;
}

export function obtenerWorkerUrl(): string {
  const url = import.meta.env.VITE_WORKER_URL;
  if (url && typeof url === "string" && url.trim() !== "") {
    return url.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

async function obtenerHeadersAuth(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Consulta el estado de salud del worker de emisión ARCA.
 */
export async function obtenerEstadoWorker(): Promise<EstadoWorker> {
  try {
    const workerUrl = obtenerWorkerUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${workerUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { online: false };
    }

    const json = await res.json();
    return {
      online: json.status === "ok",
      ambiente: json.ambiente,
    };
  } catch {
    return { online: false };
  }
}

/**
 * Consulta la constancia de inscripción de un CUIT en ARCA.
 */
export async function consultarPadronArca(cuit: string): Promise<RespuestaPadronArca> {
  const cuitLimpio = cuit.replace(/\D/g, "");
  if (!cuitLimpio || cuitLimpio.length < 10) {
    return { ok: false, error: "El CUIT ingresado no es válido." };
  }

  const workerUrl = obtenerWorkerUrl();
  const headers = await obtenerHeadersAuth();

  try {
    const res = await fetch(`${workerUrl}/padron/${cuitLimpio}`, {
      headers,
    });

    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.error || "No se pudo consultar el CUIT en ARCA.",
      };
    }

    return json;
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "No se pudo conectar con el worker de ARCA.",
    };
  }
}

/**
 * Emite una factura electrónica en ARCA para un cliente y lista de servicios.
 */
export async function emitirFacturaArca(
  clienteId: string,
  servicioIds: string[]
): Promise<RespuestaEmitirArca> {
  const workerUrl = obtenerWorkerUrl();
  const headers = await obtenerHeadersAuth();

  try {
    const res = await fetch(`${workerUrl}/emitir`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cliente_id: clienteId,
        servicio_ids: servicioIds,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.error || "Error al emitir factura en ARCA.",
      };
    }

    return json;
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "No se pudo conectar con el servidor de emisión.",
    };
  }
}

/**
 * Reenvía la factura emitida por correo electrónico vía Resend.
 */
export async function reenviarFacturaMail(
  facturaId: string
): Promise<{ ok: boolean; destinatario?: string; error?: string }> {
  const workerUrl = obtenerWorkerUrl();
  const headers = await obtenerHeadersAuth();

  try {
    const res = await fetch(`${workerUrl}/reenviar-mail`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        factura_id: facturaId,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.error || "Error al reenviar el correo.",
      };
    }

    return json;
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Error al conectar con el servidor de correos.",
    };
  }
}

/**
 * Dispara el lote nocturno de facturación a demanda (botón 'Correr ahora').
 */
export async function correrLoteFacturacion(): Promise<RespuestaLoteManual> {
  const workerUrl = obtenerWorkerUrl();
  const headers = await obtenerHeadersAuth();

  try {
    const res = await fetch(`${workerUrl}/lote`, {
      method: "POST",
      headers,
    });

    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.error || "Error al ejecutar la corrida de facturación.",
      };
    }

    return json;
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "No se pudo conectar con el worker para correr el lote.",
    };
  }
}
