import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLIENTES,
  comoAdmin,
  comoChofer1,
  comoOficina,
  CUENTAS,
  limpiarRegistrosTest,
} from "./setup";

describe("RPC Firmas e Integridad", () => {
  const PREFIJO = "TEST-RPC-";
  let idServicioTest: string | null = null;
  let idChequeTest: string | null = null;

  beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  afterEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  it("cambiar_estado: coincide exactamente la firma de parámetros y no da PGRST202", async () => {
    const admin = await comoAdmin();

    // Crear un servicio de prueba en estado 'consulta'
    const { data: serv, error: errInsert } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "consulta",
        descripcion: `${PREFIJO}Servicio para probar RPC cambiar_estado`,
        monto: 50000,
        fecha_programada: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    expect(errInsert).toBeNull();
    expect(serv).toBeDefined();
    idServicioTest = serv!.id;

    // Llamada con la firma exacta usada en la aplicación: p_servicio_id, p_nuevo, p_nota
    const { data: servActualizado, error: errRpc } = await admin.rpc(
      "cambiar_estado",
      {
        p_servicio_id: idServicioTest,
        p_nuevo: "presupuestado",
        p_nota: "Presupuesto enviado al cliente",
      },
    );

    // CRÍTICO: No debe ser PGRST202 (función no encontrada / firma errónea)
    if (errRpc) {
      expect(errRpc.code).not.toBe("PGRST202");
    }
    expect(errRpc).toBeNull();
    expect(servActualizado).toBeDefined();
    expect((servActualizado as any).estado).toBe("presupuestado");

    // Verificar llamada con solo parámetros obligatorios (p_nota default null)
    const { data: servProg, error: errRpc2 } = await admin.rpc(
      "cambiar_estado",
      {
        p_servicio_id: idServicioTest,
        p_nuevo: "programado",
      },
    );

    if (errRpc2) {
      expect(errRpc2.code).not.toBe("PGRST202");
    }
    expect(errRpc2).toBeNull();
    expect((servProg as any).estado).toBe("programado");
  });

  it("cambiar_estado_cheque: coincide exactamente la firma de parámetros y no da PGRST202", async () => {
    const oficina = await comoOficina();

    // Crear un cheque de prueba en estado 'en_cartera'
    idChequeTest = crypto.randomUUID();
    const hoy = new Date().toISOString().slice(0, 10);

    const { error: errInsert } = await oficina.from("cheques").insert({
      id: idChequeTest,
      tipo: "recibido",
      es_echeq: false,
      numero: `${PREFIJO}CHQ-01`,
      banco: "Banco Galicia",
      emisor: "Deza SA",
      monto: 150000,
      fecha_pago: hoy,
      cliente_id: CLIENTES.deza.id,
      estado: "en_cartera",
    });
    expect(errInsert).toBeNull();

    // Llamar con los 10 parámetros que usa la aplicación en src/lib/cheques.ts
    const { data: chequeActualizado, error: errRpc } = await oficina.rpc(
      "cambiar_estado_cheque",
      {
        p_cheque_id: idChequeTest,
        p_nuevo: "depositado",
        p_nota: "Depositado en Galicia",
        p_cuenta_id: CUENTAS.galicia.id,
        p_fecha: hoy,
        p_endosado_a: null,
        p_movimiento_id: null,
        p_descontado_neto: null,
        p_descontado_en: null,
        p_motivo: null,
      },
    );

    // CRÍTICO: No debe ser PGRST202
    if (errRpc) {
      expect(errRpc.code).not.toBe("PGRST202");
    }
    expect(errRpc).toBeNull();
    expect(chequeActualizado).toBeDefined();
    expect((chequeActualizado as any).estado).toBe("depositado");
  });

  it("Caso 13 (§A.1): Chofer llama cambiar_estado_cheque -> rechaza con 'No autorizado'", async () => {
    const chofer = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // Chofer intentando cambiar el estado de un cheque
    const { error: errRpc } = await chofer.rpc("cambiar_estado_cheque", {
      p_cheque_id: "00000000-0000-0000-0000-000000000000",
      p_nuevo: "depositado",
      p_nota: null,
      p_cuenta_id: CUENTAS.galicia.id,
      p_fecha: hoy,
      p_endosado_a: null,
      p_movimiento_id: null,
      p_descontado_neto: null,
      p_descontado_en: null,
      p_motivo: null,
    });

    expect(errRpc).not.toBeNull();
    // La RPC debe existir (no PGRST202) y rechazar por permisos
    expect(errRpc?.code).not.toBe("PGRST202");
    expect(errRpc?.message.toLowerCase()).toContain("no autorizado");
  });

  it("proyeccion_caja: coincide la firma y devuelve la proyección sin PGRST202", async () => {
    const oficina = await comoOficina();

    // 1. Proyección general (sin cuenta específica)
    const { data: gral, error: errGral } = await oficina.rpc(
      "proyeccion_caja",
      {
        p_dias: 14,
        p_cuenta_id: null,
      },
    );

    if (errGral) {
      expect(errGral.code).not.toBe("PGRST202");
    }
    expect(errGral).toBeNull();
    expect(Array.isArray(gral)).toBe(true);
    expect(gral!.length).toBe(15); // hoy + 14 días = 15 filas
    expect(gral![0]).toHaveProperty("fecha");
    expect(gral![0]).toHaveProperty("saldo_proyectado");
    expect(gral![0]).toHaveProperty("ingresos");
    expect(gral![0]).toHaveProperty("egresos");

    // 2. Proyección filtrada por cuenta
    const { data: porCuenta, error: errCuenta } = await oficina.rpc(
      "proyeccion_caja",
      {
        p_dias: 7,
        p_cuenta_id: CUENTAS.efectivo.id,
      },
    );

    if (errCuenta) {
      expect(errCuenta.code).not.toBe("PGRST202");
    }
    expect(errCuenta).toBeNull();
    expect(Array.isArray(porCuenta)).toBe(true);
    expect(porCuenta!.length).toBe(8); // hoy + 7 días = 8 filas
  });

  it("tengo_google_calendar: coincide la firma sin parámetros y no da PGRST202", async () => {
    const oficina = await comoOficina();

    const { data, error } = await oficina.rpc("tengo_google_calendar");

    if (error) {
      expect(error.code).not.toBe("PGRST202");
    }
    expect(error).toBeNull();
    expect(typeof data).toBe("boolean");
    expect(data).toBe(false); // No conectado en entorno de test
  });
});
