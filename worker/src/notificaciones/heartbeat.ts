import { config } from "../config";

export type NombreHeartbeat =
  | "instancias"
  | "recordatorios"
  | "lote"
  | "semanal"
  | "calendario"
  | "choferes";

const MAPA_HEARTBEATS: Record<NombreHeartbeat, string> = {
  instancias: "HEARTBEAT_INSTANCIAS",
  recordatorios: "HEARTBEAT_RECORDATORIOS",
  lote: "HEARTBEAT_LOTE",
  semanal: "HEARTBEAT_SEMANAL",
  calendario: "HEARTBEAT_CALENDARIO",
  choferes: "HEARTBEAT_CHOFERES",
};

export const logger = {
  warn: (...args: unknown[]) => console.warn(...args),
};

/**
 * Envía una señal de latido (heartbeat) HTTP GET al servicio de monitoreo (Better Stack).
 * - Lee la URL de la variable de entorno correspondiente.
 * - Timeout estricto de 5 segundos.
 * - Si la variable no está configurada, sale en silencio.
 * - Nunca lanza excepciones: captura errores y los registra mediante logger.warn.
 */
export async function latir(nombre: NombreHeartbeat): Promise<void> {
  const variable = MAPA_HEARTBEATS[nombre];
  const url =
    ((config as Record<string, unknown>)[variable] as string | undefined) ??
    process.env[variable];

  if (!url || typeof url !== "string" || url.trim() === "") {
    return;
  }

  const urlDestino = url.trim();

  try {
    const res = await fetch(urlDestino, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn(
        `[HEARTBEAT] Falló el latido '${nombre}': ${res.status} ${res.statusText}`,
      );
    }
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : String(err);
    logger.warn(`[HEARTBEAT] Falló el latido '${nombre}': ${mensaje}`);
  }
}
