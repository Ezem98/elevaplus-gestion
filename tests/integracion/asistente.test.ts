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
});
