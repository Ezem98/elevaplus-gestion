import { latir } from "../notificaciones/heartbeat";
import { armarResumenDiaChofer } from "../notificaciones/mensajes";
import { enviarPushDirecto } from "../notificaciones/push";
import { supabaseAdmin } from "../supabase";
import { finalizarEjecucion, registrarEjecucion } from "./idempotencia";
import { obtenerFechaHoyBA } from "./instancias";

export interface ResultadoResumenChoferes {
  ok: boolean;
  omitido?: boolean;
  choferesNotificados: number;
  totalChoferes?: number;
  error?: string;
}

/**
 * Cron 07:00 hs - Resumen del día para choferes.
 * Un push por chofer con sus viajes programados del día ("Hoy tenés 2 viajes: 08:00 Huma · 14:00 Deza").
 * Sin viajes, nada.
 * Con idempotencia en ejecuciones_worker y señal de heartbeat Better Stack.
 */
export async function resumenChoferesHoy(
  params: { forzar?: boolean } = {},
): Promise<ResultadoResumenChoferes> {
  let exito = false;
  try {
    const hoyStr = obtenerFechaHoyBA();
    const clave = `resumen-choferes:${hoyStr}`;

    const { ejecutado } = await registrarEjecucion(
      "resumen-choferes",
      clave,
      params.forzar,
    );
    if (!ejecutado) {
      exito = true;
      return {
        ok: true,
        omitido: true,
        choferesNotificados: 0,
      };
    }

    // 1. Consultar choferes activos
    const { data: choferes, error: errChoferes } = await supabaseAdmin
      .from("perfiles")
      .select("id, nombre")
      .eq("rol", "chofer")
      .eq("activo", true);

    if (errChoferes) {
      throw new Error(
        `Error al consultar perfiles de choferes: ${errChoferes.message}`,
      );
    }

    // 2. Consultar servicios programados de hoy
    const { data: servicios, error: errServicios } = await supabaseAdmin
      .from("servicios")
      .select(
        "id, numero, fecha_programada, hora_programada, estado, cliente:clientes(nombre), servicio_choferes(chofer_id)",
      )
      .eq("fecha_programada", hoyStr)
      .eq("estado", "programado")
      .order("hora_programada", { ascending: true, nullsFirst: false });

    if (errServicios) {
      throw new Error(
        `Error al consultar servicios de hoy: ${errServicios.message}`,
      );
    }

    let choferesNotificados = 0;

    for (const chofer of choferes || []) {
      const viajesChofer = (servicios || [])
        .filter((s: any) =>
          Array.isArray(s.servicio_choferes)
            ? s.servicio_choferes.some((sc: any) => sc.chofer_id === chofer.id)
            : false,
        )
        .map((s: any) => ({
          hora: s.hora_programada,
          cliente: s.cliente?.nombre || "Cliente",
        }));

      const resumen = armarResumenDiaChofer(viajesChofer);
      if (!resumen) {
        // Sin viajes, nada
        continue;
      }

      const resPush = await enviarPushDirecto({
        titulo: resumen.titulo,
        cuerpo: resumen.cuerpo,
        url: "/chofer",
        tag: `resumen-chofer:${hoyStr}`,
        destinatarios: { usuarios: [chofer.id] },
      });

      if (resPush.ok) {
        choferesNotificados++;
      }
    }

    await finalizarEjecucion("resumen-choferes", clave, {
      choferesNotificados,
      totalChoferes: choferes?.length ?? 0,
    });

    exito = true;
    return {
      ok: true,
      choferesNotificados,
      totalChoferes: choferes?.length ?? 0,
    };
  } catch (err: any) {
    console.error("[RESUMEN-CHOFERES] Error en resumenChoferesHoy:", err);
    return {
      ok: false,
      choferesNotificados: 0,
      error: err?.message || String(err),
    };
  } finally {
    if (exito) {
      await latir("choferes");
    }
  }
}
