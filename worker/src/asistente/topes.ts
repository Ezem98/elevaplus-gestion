import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { enviarPushDirecto } from "../notificaciones/push";
import { obtenerFechaHoyArgentina } from "./sesion";

const MENSAJES_MAXIMOS_POR_DIA = 60;
const RATE_LIMIT_MENSAJES_POR_MINUTO = 10;
const MENSAJE_TOPE_SUPERADO = "Por hoy llegué al límite; seguimos mañana";

// Registro en memoria de timestamps de mensajes recientes por usuario (para rate limit de 1 min)
const historialPorMinuto = new Map<string, number[]>();

// Registro en memoria de alertas push enviadas a admin por usuario y fecha (para enviar solo 1 vez por día)
const alertasPushEnviadas = new Map<string, string>();

/**
 * Función auxiliar para limpiar estados en memoria (útil para tests unitarios).
 */
export function _resetearTopesMemoria(): void {
  historialPorMinuto.clear();
  alertasPushEnviadas.clear();
}

export interface ResultadoVerificacionTopes {
  superado: boolean;
  motivo?: "rate_limit" | "mensajes_diarios" | "costo_diario";
  mensaje?: string;
}

/**
 * Verifica si el usuario superó los límites de uso del asistente:
 * 1. Rate limit en memoria (10 mensajes por minuto).
 * 2. Tope diario de 60 mensajes por usuario.
 * 3. Tope diario de gasto en USD (ASISTENTE_TOPE_DIARIO_USD).
 *
 * Si se supera cualquier tope, avisa por push al admin (máximo 1 vez por día)
 * y retorna superado: true con el mensaje correspondiente.
 */
export async function verificarTopes(
  usuarioId: string,
  supabase: SupabaseClient,
  fechaReferencia?: Date,
): Promise<ResultadoVerificacionTopes> {
  const ahora = Date.now();
  const hoyStr = obtenerFechaHoyArgentina(fechaReferencia);
  const inicioDiaIso = `${hoyStr}T00:00:00-03:00`;

  // 1. Rate limit en memoria: 10 mensajes en los últimos 60 segundos
  const marcas = historialPorMinuto.get(usuarioId) || [];
  const marcasRecientes = marcas.filter((ts) => ahora - ts < 60_000);
  if (marcasRecientes.length >= RATE_LIMIT_MENSAJES_POR_MINUTO) {
    await dispararAvisoPushAdminSiCorresponde(usuarioId, hoyStr, "rate limit por minuto");
    return {
      superado: true,
      motivo: "rate_limit",
      mensaje: MENSAJE_TOPE_SUPERADO,
    };
  }

  // 2. Consultar conversaciones del usuario para revisar actividad de hoy
  const { data: convs, error: errorConvs } = await supabase
    .from("asistente_conversaciones")
    .select("id")
    .eq("usuario_id", usuarioId);

  if (errorConvs) {
    console.error(
      `[ASISTENTE] Error al consultar conversaciones para topes (${usuarioId}):`,
      errorConvs.message,
    );
  }

  const convIds = (convs || []).map((c) => c.id);

  if (convIds.length > 0) {
    // 2.a Contar mensajes del usuario de hoy
    const { count, error: errorCount } = await supabase
      .from("asistente_mensajes")
      .select("id", { count: "exact", head: true })
      .in("conversacion_id", convIds)
      .eq("rol", "usuario")
      .gte("created_at", inicioDiaIso);

    if (errorCount) {
      console.error(
        `[ASISTENTE] Error al contar mensajes diarios (${usuarioId}):`,
        errorCount.message,
      );
    } else if (count != null && count >= MENSAJES_MAXIMOS_POR_DIA) {
      await dispararAvisoPushAdminSiCorresponde(
        usuarioId,
        hoyStr,
        `tope diario de ${MENSAJES_MAXIMOS_POR_DIA} mensajes`,
      );
      return {
        superado: true,
        motivo: "mensajes_diarios",
        mensaje: MENSAJE_TOPE_SUPERADO,
      };
    }

    // 2.b Sumar costo en USD de hoy
    const topeUsd = config.ASISTENTE_TOPE_DIARIO_USD ?? 1;
    const { data: mensajesCosto, error: errorCosto } = await supabase
      .from("asistente_mensajes")
      .select("costo_usd")
      .in("conversacion_id", convIds)
      .gte("created_at", inicioDiaIso)
      .not("costo_usd", "is", null);

    if (errorCosto) {
      console.error(
        `[ASISTENTE] Error al calcular costo diario (${usuarioId}):`,
        errorCosto.message,
      );
    } else if (mensajesCosto && mensajesCosto.length > 0) {
      const costoTotalHoy = mensajesCosto.reduce(
        (acum, m) => acum + Number(m.costo_usd || 0),
        0,
      );
      if (costoTotalHoy >= topeUsd) {
        await dispararAvisoPushAdminSiCorresponde(
          usuarioId,
          hoyStr,
          `tope diario de gasto ($ ${topeUsd} USD)`,
        );
        return {
          superado: true,
          motivo: "costo_diario",
          mensaje: MENSAJE_TOPE_SUPERADO,
        };
      }
    }
  }

  // Registrar este intento en el historial del minuto
  marcasRecientes.push(ahora);
  historialPorMinuto.set(usuarioId, marcasRecientes);

  return { superado: false };
}

/**
 * Notifica por push al rol admin si el usuario superó un límite,
 * garantizando que no se envíe más de una alerta por día por usuario.
 */
async function dispararAvisoPushAdminSiCorresponde(
  usuarioId: string,
  hoyStr: string,
  detalleTope: string,
): Promise<void> {
  const clave = `${usuarioId}:${hoyStr}`;
  if (alertasPushEnviadas.has(clave)) {
    return;
  }

  alertasPushEnviadas.set(clave, hoyStr);

  try {
    await enviarPushDirecto({
      titulo: "Chimuelo: límite de uso alcanzado",
      cuerpo: `El usuario alcanzó el ${detalleTope}.`,
      tag: `asistente-tope-${usuarioId}-${hoyStr}`,
      destinatarios: { roles: ["admin"] },
    });
  } catch (err: any) {
    console.error("[ASISTENTE] Error al enviar notificación push de tope al admin:", err);
  }
}
