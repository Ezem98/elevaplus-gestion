import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";
import { autorizar } from "./auth.ts";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: any;
  old_record: any;
}

Deno.serve(async (req: Request) => {
  // 1. Verificación del header Authorization contra WEBHOOK_SECRET o SUPABASE_SERVICE_ROLE_KEY
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");
  const apiKeyHeader = req.headers.get("apikey");

  const estadoAuth = autorizar({
    webhookSecret,
    serviceRoleKey,
    authHeader,
    apiKeyHeader,
  });

  if (estadoAuth === "sin_credenciales") {
    console.error("Función sin credenciales configuradas en el entorno");
    return new Response(
      JSON.stringify({ error: "Función sin credenciales configuradas" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (estadoAuth === "no_autorizado") {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let notificacionId: string | null = null;

  try {
    const payload: any = await req.json();

    let titulo = "";
    let cuerpo = "";
    let url = "";
    let tag = "";
    let usuarioExcluido: string | null = null;
    let destinatariosPersonalizados: any = null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey =
      serviceRoleKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error(
        "Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY",
      );
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Variables de entorno de Supabase faltantes",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Caso directo (llamado explícito desde worker o backend)
    if (payload.tipo === "directo") {
      titulo = payload.titulo;
      cuerpo = payload.cuerpo;
      url = payload.url || "/";
      tag = payload.tag || "general";
      usuarioExcluido = payload.usuarioExcluido || null;
    } else if (payload.direct || (payload.titulo && payload.cuerpo)) {
      titulo = payload.titulo;
      cuerpo = payload.cuerpo;
      url = payload.url || "/facturacion";
      tag = payload.tag || "facturacion";
      usuarioExcluido = payload.usuarioExcluido || null;
    } else {
      const { type, table, record } = payload;

      const esEventoValido = type === "INSERT" && record;

      if (!esEventoValido) {
        return new Response(
          JSON.stringify({
            ok: true,
            ignorado: true,
            motivo: "Tipo de evento o tabla no procesable",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Caso 1: INSERT en servicio_eventos con estado_nuevo in ('terminado', 'en_curso')
      if (table === "servicio_eventos" && type === "INSERT") {
        if (
          record.estado_nuevo !== "terminado" &&
          record.estado_nuevo !== "en_curso"
        ) {
          return new Response(
            JSON.stringify({
              ok: true,
              ignorado: true,
              motivo: "Estado no procesable",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        usuarioExcluido = record.usuario_id || null;

        const [{ data: servicio }, { data: usuarioPerfil }] = await Promise.all(
          [
            supabaseAdmin
              .from("servicios")
              .select(
                "id, numero, tipo, origen, destino, cliente:clientes(nombre)",
              )
              .eq("id", record.servicio_id)
              .maybeSingle(),
            record.usuario_id
              ? supabaseAdmin
                  .from("perfiles")
                  .select("nombre")
                  .eq("id", record.usuario_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ],
        );

        const nombreUsuario = usuarioPerfil?.nombre || "Un chofer";
        const numServ = servicio?.numero != null ? `#${servicio.numero}` : "";
        const clienteNombre = (servicio?.cliente as any)?.nombre || "Cliente";

        let detalleTrayecto = "";
        if (servicio?.origen && servicio?.destino) {
          const prefijoTipo = servicio.tipo === "traslado" ? "Traslado " : "";
          detalleTrayecto = `${prefijoTipo}${servicio.origen} → ${servicio.destino}`;
        }

        const accion =
          record.estado_nuevo === "terminado" ? "terminó" : "inició";
        titulo = `${nombreUsuario} ${accion} el servicio ${numServ}`.trim();
        cuerpo = detalleTrayecto
          ? `${clienteNombre} · ${detalleTrayecto}`
          : clienteNombre;
        url = `/servicios/${record.servicio_id}`;
        tag = `servicio-${record.servicio_id}`;
      }
      // Caso 2: INSERT en servicios con no_planificado = true
      else if (table === "servicios" && type === "INSERT") {
        if (!record.no_planificado) {
          return new Response(
            JSON.stringify({
              ok: true,
              ignorado: true,
              motivo: "No es servicio no planificado",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        usuarioExcluido = record.creado_por || null;

        const [{ data: usuarioPerfil }, { data: cliente }] = await Promise.all([
          record.creado_por
            ? supabaseAdmin
                .from("perfiles")
                .select("nombre")
                .eq("id", record.creado_por)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          record.cliente_id
            ? supabaseAdmin
                .from("clientes")
                .select("nombre")
                .eq("id", record.cliente_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const nombreChofer = usuarioPerfil?.nombre || "un chofer";
        const clienteNombre = cliente?.nombre || "Cliente";

        let detalleTrayecto = "";
        if (record.origen && record.destino) {
          const prefijoTipo = record.tipo === "traslado" ? "Traslado " : "";
          detalleTrayecto = `${prefijoTipo}${record.origen} → ${record.destino}`;
        }

        titulo = `Servicio no planificado cargado por ${nombreChofer}`;
        cuerpo = detalleTrayecto
          ? `${clienteNombre} · ${detalleTrayecto}`
          : clienteNombre;
        url = `/servicios/${record.id}`;
        tag = `servicio-${record.id}`;
      }
      // Caso 3: INSERT en notificaciones
      else if (table === "notificaciones" && type === "INSERT") {
        titulo = record.titulo;
        cuerpo = record.cuerpo;
        url = record.url || "/chofer";
        tag = record.tag || `notif-${record.id}`;
        destinatariosPersonalizados = { usuarios: [record.usuario_id] };
        notificacionId = record.id;
      } else {
        return new Response(
          JSON.stringify({
            ok: true,
            ignorado: true,
            motivo: "Tabla o evento no configurado para push",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // 2. Obtener usuarios destino según destinatarios (por defecto admin y oficina)
    let idsDestino: string[] = [];
    const dest = destinatariosPersonalizados || payload.destinatarios;

    if (dest && typeof dest === "object" && !Array.isArray(dest)) {
      if (Array.isArray(dest.usuarios) && dest.usuarios.length > 0) {
        idsDestino.push(...dest.usuarios);
      }
      if (
        dest.roles &&
        (Array.isArray(dest.roles) ? dest.roles.length > 0 : true)
      ) {
        const rolesABuscar = Array.isArray(dest.roles)
          ? dest.roles
          : [dest.roles];
        const { data: perfilesRol, error: errPerfiles } = await supabaseAdmin
          .from("perfiles")
          .select("id")
          .in("rol", rolesABuscar);

        if (errPerfiles) {
          console.error("Error consultando perfiles por rol:", errPerfiles);
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Error consultando destinatarios",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (perfilesRol) {
          idsDestino.push(...perfilesRol.map((p: { id: string }) => p.id));
        }
      }
    } else {
      const rolesDestino =
        dest === "oficina"
          ? ["admin", "oficina"]
          : Array.isArray(dest)
            ? dest
            : dest
              ? [dest]
              : ["admin", "oficina"];

      const { data: perfilesDestino, error: errPerfiles } = await supabaseAdmin
        .from("perfiles")
        .select("id")
        .in("rol", rolesDestino);

      if (errPerfiles) {
        console.error("Error consultando perfiles:", errPerfiles);
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Error consultando destinatarios",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      idsDestino = (perfilesDestino || []).map((p: { id: string }) => p.id);
    }

    idsDestino = Array.from(new Set(idsDestino)).filter(
      (id: string) => id !== usuarioExcluido,
    );

    if (idsDestino.length === 0) {
      if (notificacionId) {
        await supabaseAdmin
          .from("notificaciones")
          .update({ error: "Sin destinatarios autorizados" })
          .eq("id", notificacionId);
      }
      return new Response(
        JSON.stringify({
          ok: true,
          enviados: 0,
          motivo: "Sin destinatarios autorizados",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Consultar las suscripciones push de esos usuarios
    const { data: suscripciones, error: errSubs } = await supabaseAdmin
      .from("push_suscripciones")
      .select("id, endpoint, p256dh, auth, usuario_id")
      .in("usuario_id", idsDestino);

    if (errSubs) {
      console.error("Error consultando push_suscripciones:", errSubs);
      if (notificacionId) {
        await supabaseAdmin
          .from("notificaciones")
          .update({ error: `Error consultando suscripciones: ${errSubs.message}` })
          .eq("id", notificacionId);
      }
      return new Response(
        JSON.stringify({ ok: false, error: "Error consultando suscripciones" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!suscripciones || suscripciones.length === 0) {
      if (notificacionId) {
        await supabaseAdmin
          .from("notificaciones")
          .update({ error: "Sin suscripciones registradas" })
          .eq("id", notificacionId);
      }
      return new Response(
        JSON.stringify({
          ok: true,
          enviados: 0,
          motivo: "Sin suscripciones registradas",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. Configuración VAPID
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject =
      Deno.env.get("VAPID_SUBJECT") || "mailto:elevaplus.one@gmail.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("Faltan claves VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY");
      if (notificacionId) {
        await supabaseAdmin
          .from("notificaciones")
          .update({ error: "Claves VAPID no configuradas en el servidor" })
          .eq("id", notificacionId);
      }
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Claves VAPID no configuradas en el servidor",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payloadTexto = JSON.stringify({
      titulo,
      cuerpo,
      url,
      tag,
    });

    let enviados = 0;
    let eliminados = 0;
    const ahora = new Date().toISOString();

    // 5. Envío a cada suscripción
    for (const sub of suscripciones) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payloadTexto);
        enviados++;

        // Actualizar último envío exitoso
        await supabaseAdmin
          .from("push_suscripciones")
          .update({ ultimo_envio: ahora })
          .eq("id", sub.id);
      } catch (err: any) {
        // Si el endpoint fue revocado o expiró, borramos la fila
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabaseAdmin
            .from("push_suscripciones")
            .delete()
            .eq("id", sub.id);
          eliminados++;
        } else {
          console.error(
            `Error enviando notificación a suscripción ${sub.id}:`,
            err,
          );
        }
      }
    }

    if (notificacionId) {
      if (enviados > 0) {
        await supabaseAdmin
          .from("notificaciones")
          .update({ enviada_at: ahora, error: null })
          .eq("id", notificacionId);
      } else {
        await supabaseAdmin
          .from("notificaciones")
          .update({ error: "No se pudo entregar el push a ninguna suscripción" })
          .eq("id", notificacionId);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        enviados,
        eliminados,
        total: suscripciones.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    if (notificacionId) {
      try {
        await supabaseAdmin
          .from("notificaciones")
          .update({ error: error?.message || "Error inesperado" })
          .eq("id", notificacionId);
      } catch (_) {}
    }
    console.error("Error inesperado en webhook enviar-push:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Error interno no controlado",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
