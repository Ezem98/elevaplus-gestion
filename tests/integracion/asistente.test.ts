import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { herramientaSaldoCliente } from "../../worker/src/asistente/herramientas/clientes";
import { procesarTurno } from "../../worker/src/asistente/procesar";
import { ProveedorFalso } from "../../worker/src/asistente/proveedor/falso";
import { validarSesionAsistente } from "../../worker/src/asistente/sesion";
import {
  CLIENTES,
  comoAdmin,
  comoChofer1,
  comoOficina,
  limpiarRegistrosTest,
  USUARIOS,
} from "./setup";

describe("Asistente Chimuelo — Integración contra Supabase local (ASISTENTE_MODELO=falso)", () => {
  const PREFIJO = "TEST-ASISTENTE-";

  beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  afterEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  it("1. RLS: una consulta de saldos con sesión de chofer no ve los saldos ni deudas", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // Asegurar que existe al menos un servicio con monto impago para Deza creado por admin
    const { data: serv, error: errInsert } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "terminado",
        descripcion: `${PREFIJO}Servicio de prueba de saldo`,
        monto: 75000,
        monto_cobrado: 0,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    expect(errInsert).toBeNull();
    expect(serv).toBeDefined();

    // Consulta con sesión de admin: debe ver el saldo > 0
    const resAdmin = await herramientaSaldoCliente.ejecutar(
      {
        supabase: admin,
        usuarioId: USUARIOS.admin.id,
        rol: "admin",
        hoy,
      },
      { cliente_id: CLIENTES.deza.id },
    );

    expect(resAdmin.error).toBeUndefined();
    expect(resAdmin.saldo).toBeGreaterThan(0);

    // Consulta con sesión de chofer: por RLS, no ve saldos ni montos de clientes
    const resChofer = await herramientaSaldoCliente.ejecutar(
      {
        supabase: chofer1,
        usuarioId: USUARIOS.chofer1.id,
        rol: "oficina" as any, // simulando contexto para la herramienta
        hoy,
      },
      { cliente_id: CLIENTES.deza.id },
    );

    expect(resChofer.error).toBeUndefined();
    // Por RLS de Postgres, cuenta_corriente no suma los servicios que el chofer no tiene asignados
    expect(resChofer.saldo).toBe(0);
  });

  it("2. Seguridad de sesión: rechaza a un chofer con 403 y mensaje claro", async () => {
    const chofer1 = await comoChofer1();
    const {
      data: { session },
    } = await chofer1.auth.getSession();

    const tokenChofer = session?.access_token;
    expect(tokenChofer).toBeDefined();

    await expect(validarSesionAsistente(tokenChofer!)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining(
        "el asistente no está disponible para choferes",
      ),
    });
  });

  it("3. Flujo del asistente con modelo falso y propuesta: un usuario no puede confirmar la propuesta de otro", async () => {
    const oficina = await comoOficina();
    const admin = await comoAdmin();
    const proveedorFalso = new ProveedorFalso();

    // 1. Crear conversación para oficina
    const { data: conv, error: errConv } = await oficina
      .from("asistente_conversaciones")
      .insert({
        usuario_id: USUARIOS.oficina.id,
        titulo: `${PREFIJO}Conversación Oficina`,
      })
      .select()
      .single();

    expect(errConv).toBeNull();
    expect(conv).toBeDefined();

    // 2. Turno 1 con modelo falso: usuario pide traslado incompleto
    const turno1 = await procesarTurno({
      conversacionId: conv.id,
      usuarioId: USUARIOS.oficina.id,
      rol: "oficina",
      texto: "Cargame un traslado para mañana, de Burzaco a Avellaneda, para Deza, a las 9",
      supabase: oficina,
      proveedor: proveedorFalso,
    });

    expect(turno1.mensaje_asistente.contenido).toContain("¿Lo hace Mauro o Federico?");
    expect(turno1.propuesta).toBeUndefined();

    // 3. Turno 2 con modelo falso: usuario completa datos -> genera propuesta
    const turno2 = await procesarTurno({
      conversacionId: conv.id,
      usuarioId: USUARIOS.oficina.id,
      rol: "oficina",
      texto: "Mauro, solo ida",
      supabase: oficina,
      proveedor: proveedorFalso,
    });

    expect(turno2.propuesta).toBeDefined();
    expect(turno2.propuesta.id).toBeDefined();
    expect(turno2.propuesta.estado).toBe("pendiente");
    expect(turno2.propuesta.usuario_id).toBe(USUARIOS.oficina.id);

    const propuestaId = turno2.propuesta.id;

    // 4. Intentar confirmar la propuesta con la sesión de OTRO usuario (Admin)
    // RPC confirmar_propuesta debe rechazar porque usuario_id != auth.uid()
    const { data: resOtro, error: errOtro } = await admin.rpc(
      "confirmar_propuesta",
      {
        p_propuesta_id: propuestaId,
      },
    );

    // Debe fallar con error de no autorizado
    expect(errOtro).toBeDefined();
    expect(errOtro?.message).toContain("no pertenece al usuario actual");
    expect(resOtro).toBeNull();

    // 5. Confirmar con la sesión del dueño legítimo de la propuesta (Oficina)
    const { data: resPropio, error: errPropio } = await oficina.rpc(
      "confirmar_propuesta",
      {
        p_propuesta_id: propuestaId,
      },
    );

    expect(errPropio).toBeNull();
    expect(resPropio).toBeDefined();
    expect(resPropio.ok).toBe(true);
    expect(resPropio.estado).toBe("confirmada");
    expect(resPropio.resultado_id).toBeDefined();

    // 6. Idempotencia: un segundo toque en confirmar devuelve confirmada sin duplicar
    const { data: resDoble, error: errDoble } = await oficina.rpc(
      "confirmar_propuesta",
      {
        p_propuesta_id: propuestaId,
      },
    );

    expect(errDoble).toBeNull();
    expect(resDoble.ok).toBe(true);
    expect(resDoble.ya_confirmada).toBe(true);
    expect(resDoble.resultado_id).toBe(resPropio.resultado_id);
  });

  it("4. Persistencia de audio: procesarTurno con fue_audio=true guarda audio_segundos y costo_usd en asistente_mensajes", async () => {
    const oficina = await comoOficina();
    const proveedorFalso = new ProveedorFalso();

    // 1. Crear conversación
    const { data: conv, error: errConv } = await oficina
      .from("asistente_conversaciones")
      .insert({
        usuario_id: USUARIOS.oficina.id,
        titulo: `${PREFIJO}Conversación Audio`,
      })
      .select()
      .single();

    expect(errConv).toBeNull();
    expect(conv).toBeDefined();

    // 2. Procesar turno simulando audio transcripto
    const turnoAudio = await procesarTurno({
      conversacionId: conv.id,
      usuarioId: USUARIOS.oficina.id,
      rol: "oficina",
      texto: "Cargame un traslado para mañana",
      supabase: oficina,
      proveedor: proveedorFalso,
      fue_audio: true,
      audio_segundos: 28.5,
      costo_transcripcion_usd: 0.001425,
    });

    expect(turnoAudio.mensaje_usuario).toBeDefined();
    expect(turnoAudio.mensaje_usuario.fue_audio).toBe(true);
    expect(Number(turnoAudio.mensaje_usuario.audio_segundos)).toBe(28.5);

    // 3. Consultar directamente desde Supabase para verificar almacenamiento en la tabla
    const { data: msgDb, error: errDb } = await oficina
      .from("asistente_mensajes")
      .select("id, contenido, fue_audio, audio_segundos, costo_usd")
      .eq("id", turnoAudio.mensaje_usuario.id)
      .single();

    expect(errDb).toBeNull();
    expect(msgDb).toBeDefined();
    expect(msgDb.fue_audio).toBe(true);
    expect(Number(msgDb.audio_segundos)).toBe(28.5);
    expect(Number(msgDb.costo_usd)).toBe(0.001425);
    expect(msgDb.contenido).toBe("Cargame un traslado para mañana");
  });

  it("5. Servicio ya realizado: procesarTurno genera propuesta 'crear_servicio_realizado' y confirmar deja el servicio terminado con chofer y eventos", async () => {
    const oficina = await comoOficina();
    const admin = await comoAdmin();
    const proveedorFalso = new ProveedorFalso();

    // 1. Crear conversación
    const { data: conv, error: errConv } = await oficina
      .from("asistente_conversaciones")
      .insert({
        usuario_id: USUARIOS.oficina.id,
        titulo: `${PREFIJO}Conversación Servicio Realizado`,
      })
      .select()
      .single();

    expect(errConv).toBeNull();
    expect(conv).toBeDefined();

    // 2. Procesar turno con pedido de servicio realizado ayer
    const turno = await procesarTurno({
      conversacionId: conv.id,
      usuarioId: USUARIOS.oficina.id,
      rol: "oficina",
      texto: "Ayer hicimos un traslado para Deza de Burzaco a Avellaneda, lo hizo Mauro",
      supabase: oficina,
      proveedor: proveedorFalso,
    });

    expect(turno.propuesta).toBeDefined();
    expect(turno.propuesta.accion).toBe("crear_servicio_realizado");
    expect(turno.propuesta.estado).toBe("pendiente");
    expect(turno.propuesta.resumen).toContain("Servicio ya realizado");
    expect(turno.propuesta.resumen).toContain("Deza");
    expect(turno.propuesta.resumen).toMatch(/Chofer 1 Test|Mauro/);

    const propuestaId = turno.propuesta.id;

    // 3. Confirmar la propuesta como oficina
    const { data: resConf, error: errConf } = await oficina.rpc(
      "confirmar_propuesta",
      {
        p_propuesta_id: propuestaId,
      },
    );

    expect(errConf).toBeNull();
    expect(resConf).toBeDefined();
    expect(resConf.ok).toBe(true);
    expect(resConf.estado).toBe("confirmada");
    expect(resConf.resultado_id).toBeDefined();

    const servicioId = resConf.resultado_id;

    // 4. Verificar servicio creado en Supabase con cliente admin
    const { data: serv, error: errServ } = await admin
      .from("servicios")
      .select("id, tipo, cliente_id, estado, fecha_programada, origen, destino")
      .eq("id", servicioId)
      .single();

    expect(errServ).toBeNull();
    expect(serv).toBeDefined();
    expect(serv.estado).toBe("terminado");
    expect(serv.tipo).toBe("traslado");
    expect(serv.cliente_id).toBe(CLIENTES.deza.id);
    expect(serv.origen).toBe("Burzaco");
    expect(serv.destino).toBe("Avellaneda");

    // 5. Verificar chofer asignado en servicio_choferes
    const { data: choferes, error: errCh } = await admin
      .from("servicio_choferes")
      .select("chofer_id")
      .eq("servicio_id", servicioId);

    expect(errCh).toBeNull();
    expect(choferes).toBeDefined();
    expect(choferes!.length).toBe(1);

    // 6. Verificar eventos en servicio_eventos (programado, en_curso, terminado)
    const { data: evts, error: errEvts } = await admin
      .from("servicio_eventos")
      .select("estado_nuevo")
      .eq("servicio_id", servicioId)
      .order("created_at", { ascending: true });

    expect(errEvts).toBeNull();
    expect(evts).toBeDefined();
    expect(evts!.length).toBe(3);
    expect(evts!.map((e) => e.estado_nuevo)).toEqual([
      "programado",
      "en_curso",
      "terminado",
    ]);
  });
});
