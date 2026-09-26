import { config } from "../config";
import { latir } from "../notificaciones/heartbeat";
import { enviarPushDirecto } from "../notificaciones/push";
import { supabaseAdmin } from "../supabase";
import {
  asegurarCalendarioElevaplus,
  obtenerClienteCalendar,
} from "./cliente";
import {
  armarEventoGcal,
  detectarEventosABorrar,
  esErrorInvalidGrant,
  type EventoGuardado,
  type FilaAgenda,
} from "./eventos";

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface OpcionesSincronizacion {
  usuarioId?: string;
  forzar?: boolean;
}

export interface ResultadoSincronizacion {
  ok: boolean;
  conexionesProcesadas: number;
  eventosCreados: number;
  eventosActualizados: number;
  eventosBorrados: number;
  errores: string[];
}

/**
 * Sincroniza las filas de la vista 'agenda' con el calendario 'ELEVAPLUS' de Google Calendar
 * para todas las conexiones activas (o para un usuario específico).
 */
export async function sincronizarCalendario(
  opciones: OpcionesSincronizacion = {},
): Promise<ResultadoSincronizacion> {
  const resultado: ResultadoSincronizacion = {
    ok: true,
    conexionesProcesadas: 0,
    eventosCreados: 0,
    eventosActualizados: 0,
    eventosBorrados: 0,
    errores: [],
  };

  let exito = false;

  try {

  // 1. Obtener conexiones activas
  let query = supabaseAdmin
    .from("google_calendar_conexiones")
    .select("usuario_id, refresh_token, calendar_id, email_google, activo")
    .eq("activo", true);

  if (opciones.usuarioId) {
    query = query.eq("usuario_id", opciones.usuarioId);
  }

  const { data: conexiones, error: errorConexiones } = await query;

  if (errorConexiones) {
    const msg = `Error al consultar conexiones de Google Calendar: ${errorConexiones.message}`;
    console.error(`[GCAL] ${msg}`);
    resultado.ok = false;
    resultado.errores.push(msg);
    return resultado;
  }

  if (!conexiones || conexiones.length === 0) {
    console.log("[GCAL] No hay conexiones de Google Calendar activas para sincronizar.");
    exito = true;
    return resultado;
  }

  // 2. Traer filas de la agenda desde hoy a +90 días
  const hoy = new Date();
  const hoyStr = hoy.toISOString().slice(0, 10);
  const d90 = new Date(hoy);
  d90.setDate(d90.getDate() + 90);
  const hoyMas90Str = d90.toISOString().slice(0, 10);

  const { data: filasAgendaRaw, error: errorAgenda } = await supabaseAdmin
    .from("agenda")
    .select("*")
    .gte("fecha", hoyStr)
    .lte("fecha", hoyMas90Str)
    .order("fecha", { ascending: true });

  if (errorAgenda) {
    const msg = `Error al consultar la vista 'agenda': ${errorAgenda.message}`;
    console.error(`[GCAL] ${msg}`);
    resultado.ok = false;
    resultado.errores.push(msg);
    return resultado;
  }

  const filasAgenda = (filasAgendaRaw || []) as FilaAgenda[];

  // 3. Pre-cargar 'recordar_dias_antes' de vencimientos para las instancias que aparecen en agenda
  const mapaRecordarDias = new Map<string, number>();
  const idsInstancias = filasAgenda
    .filter((f) => f.clave.startsWith("vencimiento:"))
    .map((f) => f.clave.replace("vencimiento:", ""));

  if (idsInstancias.length > 0) {
    const { data: instanciasData, error: errInst } = await supabaseAdmin
      .from("vencimiento_instancias")
      .select("id, vencimientos(recordar_dias_antes)")
      .in("id", idsInstancias);

    if (!errInst && instanciasData) {
      for (const vi of instanciasData as any[]) {
        const v = Array.isArray(vi.vencimientos)
          ? vi.vencimientos[0]
          : vi.vencimientos;
        if (v && v.recordar_dias_antes != null) {
          mapaRecordarDias.set(vi.id, Number(v.recordar_dias_antes));
        }
      }
    }
  }

  // 4. Procesar cada conexión activa
  for (const conexion of conexiones) {
    resultado.conexionesProcesadas++;
    console.log(
      `[GCAL] Sincronizando calendario para usuario ${conexion.usuario_id} (${conexion.email_google || "sin email"})...`,
    );

    try {
      const { oauth2Client, calendar } = obtenerClienteCalendar(
        conexion.refresh_token,
      );

      // Asegurar que exista el calendario ELEVAPLUS
      let calendarId = conexion.calendar_id;
      if (!calendarId) {
        calendarId = await asegurarCalendarioElevaplus(calendar);
        await supabaseAdmin
          .from("google_calendar_conexiones")
          .update({ calendar_id: calendarId })
          .eq("usuario_id", conexion.usuario_id);
      }

      // Obtener eventos guardados en la tabla de derivados para este usuario
      const { data: eventosGuardadosRaw, error: errGuardados } =
        await supabaseAdmin
          .from("gcal_eventos_derivados")
          .select("clave, gcal_event_id")
          .eq("usuario_id", conexion.usuario_id);

      if (errGuardados) {
        throw new Error(
          `Error al consultar gcal_eventos_derivados: ${errGuardados.message}`,
        );
      }

      const eventosGuardados = (eventosGuardadosRaw || []) as EventoGuardado[];
      const mapaEventosGuardados = new Map<string, string>();
      for (const eg of eventosGuardados) {
        mapaEventosGuardados.set(eg.clave, eg.gcal_event_id);
      }

      // A) Detección y eliminación de eventos obsoletos
      const clavesActuales = filasAgenda.map((f) => f.clave);
      const eventosABorrar = detectarEventosABorrar(
        clavesActuales,
        eventosGuardados,
      );

      for (const itemBorrar of eventosABorrar) {
        try {
          await calendar.events.delete({
            calendarId,
            eventId: itemBorrar.gcal_event_id,
          });
          resultado.eventosBorrados++;
        } catch (errDel: any) {
          // Si Google devuelve 404, el evento ya no existía en Google: seguimos adelante sin fallar
          const codigo = errDel?.code || errDel?.response?.status;
          if (codigo !== 404) {
            console.warn(
              `[GCAL] Error al borrar evento ${itemBorrar.gcal_event_id} en Google Calendar:`,
              errDel?.message,
            );
          }
        }

        // Limpiar registro en la base de datos
        await supabaseAdmin
          .from("gcal_eventos_derivados")
          .delete()
          .eq("clave", itemBorrar.clave)
          .eq("usuario_id", conexion.usuario_id);

        if (itemBorrar.clave.startsWith("vencimiento:")) {
          const viId = itemBorrar.clave.replace("vencimiento:", "");
          await supabaseAdmin
            .from("vencimiento_instancias")
            .update({ gcal_event_id: null })
            .eq("id", viId);
        }

        // Pequeño delay de cortesía para respetar rate limits
        await esperar(40);
      }

      // B) Upsert de eventos vigentes de la agenda
      for (const fila of filasAgenda) {
        let recordarDias = 1;
        if (fila.clave.startsWith("vencimiento:")) {
          const viId = fila.clave.replace("vencimiento:", "");
          recordarDias = mapaRecordarDias.get(viId) ?? 1;
        }

        const payloadEvento = armarEventoGcal(
          fila,
          recordarDias,
          config.APP_URL,
        );
        let gcalEventId = mapaEventosGuardados.get(fila.clave);

        if (gcalEventId) {
          // Actualización de evento existente
          try {
            await calendar.events.update({
              calendarId,
              eventId: gcalEventId,
              requestBody: payloadEvento,
            });
            resultado.eventosActualizados++;
          } catch (errUpd: any) {
            const codigo = errUpd?.code || errUpd?.response?.status;
            if (codigo === 404) {
              // Si fue eliminado en Google, lo insertamos de nuevo
              const resIns = await calendar.events.insert({
                calendarId,
                requestBody: payloadEvento,
              });
              gcalEventId = resIns.data.id || undefined;
              resultado.eventosCreados++;
            } else {
              throw errUpd;
            }
          }
        } else {
          // Creación de evento nuevo
          const resIns = await calendar.events.insert({
            calendarId,
            requestBody: payloadEvento,
          });
          gcalEventId = resIns.data.id || undefined;
          resultado.eventosCreados++;
        }

        if (gcalEventId) {
          // Guardar en gcal_eventos_derivados
          await supabaseAdmin.from("gcal_eventos_derivados").upsert(
            {
              clave: fila.clave,
              gcal_event_id: gcalEventId,
              usuario_id: conexion.usuario_id,
              actualizado_at: new Date().toISOString(),
            },
            { onConflict: "clave" },
          );

          // Si es vencimiento, actualizar también la instancia
          if (fila.clave.startsWith("vencimiento:")) {
            const viId = fila.clave.replace("vencimiento:", "");
            await supabaseAdmin
              .from("vencimiento_instancias")
              .update({ gcal_event_id: gcalEventId })
              .eq("id", viId);
          }
        }

        // Delay de 40ms entre inserciones/actualizaciones para evitar rate limits
        await esperar(40);
      }

      // C) Actualizar fecha de último sync en la conexión
      await supabaseAdmin
        .from("google_calendar_conexiones")
        .update({ ultimo_sync: new Date().toISOString() })
        .eq("usuario_id", conexion.usuario_id);

      console.log(
        `[GCAL] Sincronización exitosa para usuario ${conexion.usuario_id}: ${clavesActuales.length} eventos procesados, ${eventosABorrar.length} eliminados.`,
      );
    } catch (err: any) {
      if (esErrorInvalidGrant(err)) {
        console.warn(
          `[GCAL] Refresh token revocado (invalid_grant) para usuario ${conexion.usuario_id}. Desactivando conexión...`,
        );

        // 1. Marcar activo = false en la conexión
        await supabaseAdmin
          .from("google_calendar_conexiones")
          .update({ activo: false })
          .eq("usuario_id", conexion.usuario_id);

        // 2. Avisar por push al usuario
        try {
          await enviarPushDirecto({
            titulo: "Google Calendar desconectado",
            cuerpo:
              "Se revocó el acceso a tu Google Calendar. Volvé a conectarlo desde Mi cuenta.",
            url: "/mi-cuenta",
            tag: "gcal-desconectado",
            destinatarios: conexion.usuario_id,
          });
        } catch (errPush) {
          console.error(
            "[GCAL] Error al enviar notificación push de desconexión:",
            errPush,
          );
        }

        resultado.errores.push(
          `Conexión del usuario ${conexion.usuario_id} desactivada por invalid_grant`,
        );
        // No reintentar
        continue;
      }

      const msg = `Error al sincronizar Google Calendar para usuario ${conexion.usuario_id}: ${err?.message || err}`;
      console.error(`[GCAL] ${msg}`);
      resultado.ok = false;
      resultado.errores.push(msg);
    }
  }

  exito = resultado.ok && resultado.errores.length === 0;
  return resultado;
} catch (errGlobal: any) {
  console.error("[GCAL] Error crítico global en sincronización de calendario:", errGlobal);
  resultado.ok = false;
  resultado.errores.push(errGlobal?.message || String(errGlobal));
  return resultado;
} finally {
  if (exito) {
    await latir("calendario");
  }
}
}
