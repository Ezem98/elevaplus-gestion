import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: any;
  old_record: any;
}

Deno.serve(async (req: Request) => {
  // 1. Verificación del header Authorization contra WEBHOOK_SECRET
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const payload: WebhookPayload = await req.json();
    const { type, table, record } = payload;

    // Solo se procesan eventos tipo INSERT
    if (type !== "INSERT" || !record) {
      return new Response(
        JSON.stringify({ ok: true, ignorado: true, motivo: "No es un evento INSERT" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let titulo = "";
    let cuerpo = "";
    let url = "";
    let tag = "";
    let usuarioExcluido: string | null = null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ ok: false, error: "Variables de entorno de Supabase faltantes" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Caso 1: INSERT en servicio_eventos con estado_nuevo in ('terminado', 'en_curso')
    if (table === "servicio_eventos") {
      if (record.estado_nuevo !== "terminado" && record.estado_nuevo !== "en_curso") {
        return new Response(
          JSON.stringify({ ok: true, ignorado: true, motivo: "Estado no procesable" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      usuarioExcluido = record.usuario_id || null;

      const [{ data: servicio }, { data: usuarioPerfil }] = await Promise.all([
        supabaseAdmin
          .from("servicios")
          .select("id, numero, tipo, origen, destino, cliente:clientes(nombre)")
          .eq("id", record.servicio_id)
          .maybeSingle(),
        record.usuario_id
          ? supabaseAdmin
              .from("perfiles")
              .select("nombre")
              .eq("id", record.usuario_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const nombreUsuario = usuarioPerfil?.nombre || "Un chofer";
      const numServ = servicio?.numero != null ? `#${servicio.numero}` : "";
      const clienteNombre = (servicio?.cliente as any)?.nombre || "Cliente";

      let detalleTrayecto = "";
      if (servicio?.origen && servicio?.destino) {
        const prefijoTipo = servicio.tipo === "traslado" ? "Traslado " : "";
        detalleTrayecto = `${prefijoTipo}${servicio.origen} → ${servicio.destino}`;
      }

      const accion = record.estado_nuevo === "terminado" ? "terminó" : "inició";
      titulo = `${nombreUsuario} ${accion} el servicio ${numServ}`.trim();
      cuerpo = detalleTrayecto ? `${clienteNombre} · ${detalleTrayecto}` : clienteNombre;
      url = `/servicios/${record.servicio_id}`;
      tag = `servicio-${record.servicio_id}`;
    }
    // Caso 2: INSERT en servicios con no_planificado = true
    else if (table === "servicios") {
      if (!record.no_planificado) {
        return new Response(
          JSON.stringify({ ok: true, ignorado: true, motivo: "No es servicio no planificado" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
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
      cuerpo = detalleTrayecto ? `${clienteNombre} · ${detalleTrayecto}` : clienteNombre;
      url = `/servicios/${record.id}`;
      tag = `servicio-${record.id}`;
    } else {
      return new Response(
        JSON.stringify({ ok: true, ignorado: true, motivo: "Tabla no configurada para push" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Obtener usuarios destino con rol admin u oficina excluyendo al generador
    const { data: perfilesDestino, error: errPerfiles } = await supabaseAdmin
      .from("perfiles")
      .select("id")
      .in("rol", ["admin", "oficina"]);

    if (errPerfiles) {
      console.error("Error consultando perfiles:", errPerfiles);
      return new Response(
        JSON.stringify({ ok: false, error: "Error consultando destinatarios" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const idsDestino = (perfilesDestino || [])
      .map((p: { id: string }) => p.id)
      .filter((id: string) => id !== usuarioExcluido);

    if (idsDestino.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, enviados: 0, motivo: "Sin destinatarios autorizados" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Consultar las suscripciones push de esos usuarios
    const { data: suscripciones, error: errSubs } = await supabaseAdmin
      .from("push_suscripciones")
      .select("id, endpoint, p256dh, auth, usuario_id")
      .in("usuario_id", idsDestino);

    if (errSubs) {
      console.error("Error consultando push_suscripciones:", errSubs);
      return new Response(
        JSON.stringify({ ok: false, error: "Error consultando suscripciones" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!suscripciones || suscripciones.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, enviados: 0, motivo: "Sin suscripciones registradas" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Configuración VAPID
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject =
      Deno.env.get("VAPID_SUBJECT") || "mailto:elevaplus.one@gmail.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("Faltan claves VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY");
      return new Response(
        JSON.stringify({ ok: false, error: "Claves VAPID no configuradas en el servidor" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
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
          console.error(`Error enviando notificación a suscripción ${sub.id}:`, err);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        enviados,
        eliminados,
        total: suscripciones.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error inesperado en webhook enviar-push:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Error interno no controlado" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
