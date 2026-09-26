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

export interface RespuestaEstadoGcal {
  conectado: boolean;
  email_google: string | null;
  ultimo_sync: string | null;
  conectado_at?: string | null;
  error?: string;
}

export interface RespuestaSyncGcal {
  ok: boolean;
  conexionesProcesadas?: number;
  eventosCreados?: number;
  eventosActualizados?: number;
  eventosBorrados?: number;
  error?: string;
}

/**
 * Consulta el estado de la conexión de Google Calendar del usuario actual.
 */
export async function obtenerEstadoGcal(): Promise<RespuestaEstadoGcal> {
  const workerUrl = obtenerWorkerUrl();
  const headers = await obtenerHeadersAuth();

  try {
    const res = await fetch(`${workerUrl}/gcal/estado`, { headers });
    const json = await res.json();
    if (!res.ok) {
      return {
        conectado: false,
        email_google: null,
        ultimo_sync: null,
        error: json.error || "No se pudo consultar el estado de Google Calendar.",
      };
    }
    return json;
  } catch (err: any) {
    return {
      conectado: false,
      email_google: null,
      ultimo_sync: null,
      error: err?.message || "Error al conectar con el servidor.",
    };
  }
}

/**
 * Inicia el flujo OAuth2 de conexión con Google Calendar:
 * hace un POST /gcal/iniciar con el JWT en el header Authorization,
 * obtiene la URL de autorización de Google con el state firmado adentro,
 * y redirige al usuario sin exponer jamás el JWT en la URL.
 */
export async function iniciarConexionGcal(): Promise<void> {
  const workerUrl = obtenerWorkerUrl();
  const headers = await obtenerHeadersAuth();

  const res = await fetch(`${workerUrl}/gcal/iniciar`, {
    method: "POST",
    headers,
  });

  const json = await res.json();
  if (!res.ok || !json.url) {
    throw new Error(
      json.error || "No se pudo iniciar la conexión con Google Calendar.",
    );
  }

  window.location.href = json.url;
}

/**
 * Dispara la sincronización manual inmediata con Google Calendar.
 */
export async function sincronizarGcal(): Promise<RespuestaSyncGcal> {
  const workerUrl = obtenerWorkerUrl();
  const headers = await obtenerHeadersAuth();

  try {
    const res = await fetch(`${workerUrl}/gcal/sync`, {
      method: "POST",
      headers,
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.error || "Error al sincronizar con Google Calendar.",
      };
    }
    return json;
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "No se pudo conectar con el servidor para sincronizar.",
    };
  }
}

/**
 * Desconecta la cuenta de Google Calendar y opcionalmente elimina los eventos creados en Google.
 */
export async function desconectarGcal(
  borrarEventos: boolean = false,
): Promise<{ ok: boolean; error?: string }> {
  const workerUrl = obtenerWorkerUrl();
  const headers = await obtenerHeadersAuth();

  try {
    const res = await fetch(`${workerUrl}/gcal/desconectar`, {
      method: "POST",
      headers,
      body: JSON.stringify({ borrar_eventos: borrarEventos }),
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.error || "Error al desconectar Google Calendar.",
      };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "No se pudo conectar con el servidor para desconectar.",
    };
  }
}

let timeoutSyncGcal: ReturnType<typeof setTimeout> | null = null;

/**
 * Dispara la sincronización con Google Calendar con debounce de 1.5s
 * para evitar saturar el worker si se guardan varios vencimientos seguidos.
 */
export function dispararSyncGcalDebounced(): void {
  if (timeoutSyncGcal) {
    clearTimeout(timeoutSyncGcal);
  }
  timeoutSyncGcal = setTimeout(() => {
    sincronizarGcal().catch((err) => {
      console.warn("[GCAL-DEBOUNCE] Error en sincronización en background:", err);
    });
  }, 1500);
}

