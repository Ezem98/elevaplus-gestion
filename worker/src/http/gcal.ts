import { Router, type Request, type Response } from "express";
import { config } from "../config";
import {
  asegurarCalendarioElevaplus,
  firmarStateOAuth,
  generarUrlAutorizacion,
  intercambiarCodigoPorTokens,
  obtenerClienteCalendar,
  obtenerEmailGoogle,
  revocarTokenGoogle,
  verificarStateOAuth,
} from "../gcal/cliente";
import { sincronizarCalendario } from "../gcal/sincronizar";
import { supabaseAdmin } from "../supabase";
import { requerirAdminUOficina, requerirWorkerSecretOAdmin } from "./auth";

export const gcalRouter = Router();

/**
 * POST /gcal/iniciar
 * Valida el JWT del header Authorization, genera un state firmado y devuelve la URL de Google OAuth.
 */
gcalRouter.post("/iniciar", requerirAdminUOficina, (req: Request, res: Response) => {
  const usuarioId = req.usuario?.id;
  if (!usuarioId) {
    res.status(401).json({ error: "Usuario no autenticado." });
    return;
  }

  try {
    const state = firmarStateOAuth(usuarioId);
    const url = generarUrlAutorizacion(state);
    res.status(200).json({ url });
  } catch (err: any) {
    console.error("[GCAL-INICIAR] Error al generar URL de autorización:", err);
    res.status(500).json({ error: "Error al generar la URL de autorización." });
  }
});

/**
 * GET /gcal/callback?code=...&state=...
 * Valida el state, intercambia el código, asegura el calendario ELEVAPLUS y guarda el refresh_token.
 */
gcalRouter.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const errorParam = req.query.error as string | undefined;

  const urlBaseApp = config.APP_URL.replace(/\/$/, "");

  if (errorParam || !code || !state) {
    console.warn(
      "[GCAL-CALLBACK] Falló autorización de Google o usuario canceló:",
      errorParam,
    );
    res.redirect(`${urlBaseApp}/mi-cuenta?gcal=error`);
    return;
  }

  const verificacion = verificarStateOAuth(state);
  if (!verificacion.valido || !verificacion.usuarioId) {
    console.warn("[GCAL-CALLBACK] State inválido o expirado.");
    res.redirect(`${urlBaseApp}/mi-cuenta?gcal=error`);
    return;
  }

  const usuarioId = verificacion.usuarioId;

  try {
    const tokens = await intercambiarCodigoPorTokens(code);
    let refreshToken = tokens.refresh_token;

    // Si Google no devuelve refresh_token (caso raro con prompt: consent), intentamos recuperar el existente
    if (!refreshToken) {
      const { data: existente } = await supabaseAdmin
        .from("google_calendar_conexiones")
        .select("refresh_token")
        .eq("usuario_id", usuarioId)
        .single();

      if (existente?.refresh_token) {
        refreshToken = existente.refresh_token;
      }
    }

    if (!refreshToken) {
      console.error(
        "[GCAL-CALLBACK] Google no devolvió refresh_token y no había uno previo guardado.",
      );
      res.redirect(`${urlBaseApp}/mi-cuenta?gcal=error`);
      return;
    }

    const { oauth2Client, calendar } = obtenerClienteCalendar(refreshToken);
    const emailGoogle = await obtenerEmailGoogle(oauth2Client);
    const calendarId = await asegurarCalendarioElevaplus(calendar);

    // Guardar en la base de datos (service role: el refresh_token jamás se expone al cliente)
    const { error: errUpsert } = await supabaseAdmin
      .from("google_calendar_conexiones")
      .upsert(
        {
          usuario_id: usuarioId,
          refresh_token: refreshToken,
          calendar_id: calendarId,
          email_google: emailGoogle,
          conectado_at: new Date().toISOString(),
          activo: true,
        },
        { onConflict: "usuario_id" },
      );

    if (errUpsert) {
      console.error(
        "[GCAL-CALLBACK] Error al guardar conexión en Supabase:",
        errUpsert,
      );
      res.redirect(`${urlBaseApp}/mi-cuenta?gcal=error`);
      return;
    }

    // Sincronización inicial en background
    sincronizarCalendario({ usuarioId }).catch((errSync) => {
      console.error(
        "[GCAL-CALLBACK] Error en sincronización inicial en background:",
        errSync,
      );
    });

    res.redirect(`${urlBaseApp}/mi-cuenta?gcal=ok`);
  } catch (err: any) {
    console.error("[GCAL-CALLBACK] Excepción al procesar callback:", err);
    res.redirect(`${urlBaseApp}/mi-cuenta?gcal=error`);
  }
});

/**
 * GET /gcal/estado
 * Consulta si el usuario tiene conexión activa, el email y la fecha de último sync.
 * NUNCA devuelve el refresh_token.
 */
gcalRouter.get("/estado", requerirAdminUOficina, async (req: Request, res: Response) => {
  const usuarioId = req.usuario?.id;
  if (!usuarioId) {
    res.status(401).json({ error: "Usuario no autenticado." });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("google_calendar_conexiones")
      .select("activo, email_google, ultimo_sync, conectado_at")
      .eq("usuario_id", usuarioId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("[GCAL] Error al consultar estado:", error.message);
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data || !data.activo) {
      res.status(200).json({
        conectado: false,
        email_google: null,
        ultimo_sync: null,
      });
      return;
    }

    res.status(200).json({
      conectado: true,
      email_google: data.email_google,
      ultimo_sync: data.ultimo_sync,
      conectado_at: data.conectado_at,
    });
  } catch (err: any) {
    console.error("[GCAL] Excepción al consultar estado:", err);
    res.status(500).json({ error: err?.message || "Error al consultar estado." });
  }
});

/**
 * POST /gcal/sync
 * Sincroniza la agenda con Google Calendar. Acepta WORKER_SECRET o JWT de admin/oficina.
 */
gcalRouter.post("/sync", requerirWorkerSecretOAdmin, async (req: Request, res: Response) => {
  try {
    const usuarioId =
      req.usuario?.id && req.usuario.id !== "worker_secret"
        ? req.usuario.id
        : undefined;

    const resultado = await sincronizarCalendario({ usuarioId });

    res.status(200).json({
      ...resultado,
    });
  } catch (err: any) {
    console.error("[GCAL] Error en POST /gcal/sync:", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Error al sincronizar con Google Calendar.",
    });
  }
});

/**
 * POST /gcal/desconectar
 * Revoca el token en Google, borra la conexión y opcionalmente los eventos ya creados.
 */
gcalRouter.post("/desconectar", requerirAdminUOficina, async (req: Request, res: Response) => {
  const usuarioId = req.usuario?.id;
  if (!usuarioId) {
    res.status(401).json({ error: "Usuario no autenticado." });
    return;
  }

  const borrarEventos =
    req.body?.borrar_eventos === true || req.body?.borrarEventos === true;

  try {
    // 1. Obtener conexión actual
    const { data: conexion, error: errCon } = await supabaseAdmin
      .from("google_calendar_conexiones")
      .select("refresh_token, calendar_id")
      .eq("usuario_id", usuarioId)
      .single();

    if (errCon && errCon.code !== "PGRST116") {
      res.status(500).json({ error: errCon.message });
      return;
    }

    let eventosBorrados = 0;

    if (conexion) {
      // 2. Si se solicitó borrar los eventos ya creados
      if (borrarEventos && conexion.calendar_id && conexion.refresh_token) {
        try {
          const { calendar } = obtenerClienteCalendar(conexion.refresh_token);
          const { data: eventosDerivados } = await supabaseAdmin
            .from("gcal_eventos_derivados")
            .select("gcal_event_id")
            .eq("usuario_id", usuarioId);

          if (eventosDerivados && eventosDerivados.length > 0) {
            for (const ed of eventosDerivados) {
              try {
                await calendar.events.delete({
                  calendarId: conexion.calendar_id,
                  eventId: ed.gcal_event_id,
                });
                eventosBorrados++;
              } catch (delErr: any) {
                // 404 es normal si ya fue borrado en Google
                if (delErr?.code !== 404 && delErr?.response?.status !== 404) {
                  console.warn(
                    `[GCAL] Error al borrar evento ${ed.gcal_event_id} en Google:`,
                    delErr?.message,
                  );
                }
              }
            }
          }
        } catch (errBorrado: any) {
          console.warn(
            "[GCAL] No se pudieron borrar todos los eventos al desconectar:",
            errBorrado?.message,
          );
        }
      }

      // 3. Revocar el token en Google
      if (conexion.refresh_token) {
        await revocarTokenGoogle(conexion.refresh_token);
      }

      // 4. Limpiar datos en la base
      await supabaseAdmin
        .from("gcal_eventos_derivados")
        .delete()
        .eq("usuario_id", usuarioId);

      await supabaseAdmin
        .from("google_calendar_conexiones")
        .delete()
        .eq("usuario_id", usuarioId);

      // Limpiar vinculación en vencimiento_instancias
      await supabaseAdmin
        .from("vencimiento_instancias")
        .update({ gcal_event_id: null })
        .not("gcal_event_id", "is", null);
    }

    res.status(200).json({
      ok: true,
      mensaje: "Google Calendar desconectado correctamente.",
      eventosBorrados,
    });
  } catch (err: any) {
    console.error("[GCAL] Error al desconectar Google Calendar:", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Error al desconectar Google Calendar.",
    });
  }
});
