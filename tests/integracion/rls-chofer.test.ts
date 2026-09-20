import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLIENTES,
  comoAdmin,
  comoChofer1,
  comoChofer2,
  CUENTAS,
  limpiarRegistrosTest,
  USUARIOS,
  VEHICULOS,
} from "./setup";

describe("RLS Chofer — Permisos y Restricciones", () => {
  const PREFIJO = "TEST-RLS-CH-";

  beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  afterEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  it("Autenticación y rol: comoChofer1() tiene sesión activa con el sub correcto y mi_rol() devuelve chofer", async () => {
    const chofer1 = await comoChofer1();

    // 1. Verificar sesión y sub en auth
    const {
      data: { user },
      error: errUser,
    } = await chofer1.auth.getUser();

    expect(errUser).toBeNull();
    expect(user).toBeDefined();
    expect(user?.id).toBe(USUARIOS.chofer1.id);
    expect(user?.email).toBe(USUARIOS.chofer1.email);

    // 2. Verificar función mi_rol() en Postgres
    const { data: rol, error: errRol } = await chofer1.rpc("mi_rol" as any);
    expect(errRol).toBeNull();
    expect(rol).toBe("chofer");
  });

  it("Control de RLS positivo: Chofer 1 sí puede leer servicios asignados a él (devuelve al menos una fila)", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // Crear un servicio asignado a Chofer 1
    const { data: serv, error: errInsert } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Control positivo Chofer 1`,
        monto: 50000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    expect(errInsert).toBeNull();
    expect(serv).toBeDefined();

    await admin.from("servicio_choferes").insert({
      servicio_id: serv!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    // Chofer 1 consulta sus servicios
    const { data: leidos, error: errQuery } = await chofer1
      .from("servicios")
      .select("id, descripcion")
      .ilike("descripcion", `%${PREFIJO}%`);

    expect(errQuery).toBeNull();
    expect(leidos).toBeDefined();
    expect(leidos!.length).toBeGreaterThanOrEqual(1);
    expect(leidos!.some((s) => s.id === serv!.id)).toBe(true);
  });

  it("Caso 48 (§A.5): Chofer no puede leer facturas, movimientos de caja, cheques, vencimientos ni arca_log", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // 0. Setup: Admin inserta un registro en cada tabla restringida para garantizar que existan datos
    // Factura
    const { data: facAdmin, error: errFacAdmin } = await admin
      .from("facturas")
      .insert({
        tipo: "B",
        punto_venta: 1,
        numero: 999901,
        cliente_id: CLIENTES.consumidorFinal.id,
        fecha: hoy,
        neto: 10000,
        iva: 2100,
        total: 12100,
        notas: `${PREFIJO}Factura restringida`,
      })
      .select("id")
      .single();
    expect(errFacAdmin).toBeNull();
    expect(facAdmin).toBeDefined();

    // Movimiento de caja
    const { data: movAdmin, error: errMovAdmin } = await admin
      .from("movimientos_caja")
      .insert({
        cuenta_id: CUENTAS.efectivo.id,
        tipo: "ingreso",
        monto: 5000,
        fecha: hoy,
        descripcion: `${PREFIJO}Movimiento restringido`,
      })
      .select("id")
      .single();
    expect(errMovAdmin).toBeNull();
    expect(movAdmin).toBeDefined();

    // Cheque
    const { data: chqAdmin, error: errChqAdmin } = await admin
      .from("cheques")
      .insert({
        tipo: "recibido",
        es_echeq: false,
        numero: `${PREFIJO}CHQ-REST`,
        banco: "Banco Santander",
        emisor: "Emisor Test",
        monto: 20000,
        fecha_pago: hoy,
        cliente_id: CLIENTES.deza.id,
        estado: "en_cartera",
      })
      .select("id")
      .single();
    expect(errChqAdmin).toBeNull();
    expect(chqAdmin).toBeDefined();

    // Vencimiento
    const { data: venAdmin, error: errVenAdmin } = await admin
      .from("vencimientos")
      .insert({
        titulo: `${PREFIJO}Vencimiento restringido`,
        ambito: "empresa",
        frecuencia: "mensual",
        monto_estimado: 30000,
        fecha_inicio: hoy,
        activo: true,
      })
      .select("id")
      .single();
    expect(errVenAdmin).toBeNull();
    expect(venAdmin).toBeDefined();

    // 1. Facturas: chofer no puede leerlas
    const { data: facturas, error: errFac } = await chofer1
      .from("facturas")
      .select("id")
      .eq("id", facAdmin!.id);
    expect(errFac).toBeNull();
    expect(facturas).toEqual([]);

    // 2. Movimientos de caja: chofer no puede leerlos
    const { data: movs, error: errMov } = await chofer1
      .from("movimientos_caja")
      .select("id")
      .eq("id", movAdmin!.id);
    expect(errMov).toBeNull();
    expect(movs).toEqual([]);

    // 3. Cheques: chofer no puede leerlos
    const { data: cheques, error: errChq } = await chofer1
      .from("cheques")
      .select("id")
      .eq("id", chqAdmin!.id);
    expect(errChq).toBeNull();
    expect(cheques).toEqual([]);

    // 4. Vencimientos: chofer no puede leerlos
    const { data: venci, error: errVen } = await chofer1
      .from("vencimientos")
      .select("id")
      .eq("id", venAdmin!.id);
    expect(errVen).toBeNull();
    expect(venci).toEqual([]);

    // 5. Arca log: chofer no puede leerlos
    const { data: arca, error: errArca } = await chofer1
      .from("arca_log")
      .select("id");
    expect(errArca).toBeNull();
    expect(arca).toEqual([]);
  });

  it("Caso 47 (§A.5): Chofer ve únicamente sus servicios asignados y no los de otros choferes", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const chofer2 = await comoChofer2();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Crear servicio para Chofer 1
    const { data: serv1 } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio asignado a Chofer 1`,
        monto: 60000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: serv1!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    // 2. Crear servicio para Chofer 2
    const { data: serv2 } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.monotributo.id,
        tipo: "alquiler_hora",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio asignado a Chofer 2`,
        monto: 40000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: serv2!.id,
      chofer_id: USUARIOS.chofer2.id,
    });

    // 3. Crear servicio sin chofer
    const { data: servSinChofer } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.consumidorFinal.id,
        tipo: "traslado",
        estado: "consulta",
        descripcion: `${PREFIJO}Servicio sin asignar`,
        monto: 20000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    // 4. Chofer 1 consulta servicios
    const { data: serviciosChofer1 } = await chofer1
      .from("servicios")
      .select("id, descripcion")
      .ilike("descripcion", `%${PREFIJO}%`);

    const idsChofer1 = (serviciosChofer1 || []).map((s) => s.id);
    expect(idsChofer1).toContain(serv1!.id);
    expect(idsChofer1).not.toContain(serv2!.id);
    expect(idsChofer1).not.toContain(servSinChofer!.id);

    // 5. Chofer 2 consulta servicios
    const { data: serviciosChofer2 } = await chofer2
      .from("servicios")
      .select("id, descripcion")
      .ilike("descripcion", `%${PREFIJO}%`);

    const idsChofer2 = (serviciosChofer2 || []).map((s) => s.id);
    expect(idsChofer2).toContain(serv2!.id);
    expect(idsChofer2).not.toContain(serv1!.id);
    expect(idsChofer2).not.toContain(servSinChofer!.id);
  });

  it("Chofer no puede modificar servicios con UPDATE directo (debe usar RPC)", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    const { data: serv } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Intento de update directo`,
        monto: 50000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: serv!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    // Chofer 1 intenta hacer un UPDATE directo sobre el servicio asignado
    const { data: resUpdate, error: errUpdate } = await chofer1
      .from("servicios")
      .update({ monto: 999999, descripcion: "Modificado sin permiso" })
      .eq("id", serv!.id)
      .select();

    // RLS bloquea update a chofer: no se modifica la fila
    expect(resUpdate === null || resUpdate.length === 0).toBe(true);

    // Verificar que el monto sigue intacto
    const { data: servVerif } = await admin
      .from("servicios")
      .select("monto")
      .eq("id", serv!.id)
      .single();

    expect(Number(servVerif?.monto)).toBe(50000);
  });

  it("Chofer no puede cambiar estado de un servicio ajeno vía RPC", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // Crear servicio asignado a Chofer 2
    const { data: servChofer2 } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio de Chofer 2`,
        monto: 35000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: servChofer2!.id,
      chofer_id: USUARIOS.chofer2.id,
    });

    // 1. Chofer 1 intenta cambiar el estado del servicio de Chofer 2 -> debe fallar
    const { error: errRpc } = await chofer1.rpc("cambiar_estado", {
      p_servicio_id: servChofer2!.id,
      p_nuevo: "en_curso",
    });

    expect(errRpc).not.toBeNull();
    expect(errRpc?.message.toLowerCase()).toContain(
      "no permitida para rol chofer",
    );

    // 2. Crear servicio para Chofer 1 y verificar que el asignado SÍ puede
    const { data: servChofer1 } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio propio de Chofer 1`,
        monto: 35000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: servChofer1!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    const { data: servIniciado, error: errRpcPropio } = await chofer1.rpc(
      "cambiar_estado",
      {
        p_servicio_id: servChofer1!.id,
        p_nuevo: "en_curso",
      },
    );

    expect(errRpcPropio).toBeNull();
    expect((servIniciado as any).estado).toBe("en_curso");
  });

  it("Chofer solo puede insertar cobros en efectivo o cheque (bloqueado por transferencia)", async () => {
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // Intento de insertar cobro por transferencia
    const { error: errTransf } = await chofer1.from("cobros").insert({
      cliente_id: CLIENTES.deza.id,
      fecha: hoy,
      monto: 50000,
      medio: "transferencia",
      estado: "acreditado",
      registrado_por: USUARIOS.chofer1.id,
    });

    expect(errTransf).not.toBeNull();
    expect(errTransf?.message).toContain("violates row-level security");
  });

  it("Chofer no puede leer las novedades de otro empleado", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    // Admin registra una novedad para Chofer 2
    const { data: novChofer2, error: errNov } = await admin
      .from("novedades_empleado")
      .insert({
        empleado_id: USUARIOS.chofer2.id,
        tipo: "vacaciones",
        fecha: hoy,
        fecha_hasta: hoy,
        notas: `${PREFIJO}Vacaciones Chofer 2`,
      })
      .select("id")
      .single();

    expect(errNov).toBeNull();
    expect(novChofer2).toBeDefined();

    // Chofer 1 intenta leer la novedad de Chofer 2
    const { data: leido } = await chofer1
      .from("novedades_empleado")
      .select("id")
      .eq("id", novChofer2!.id);

    expect(leido).toEqual([]);

    // Control positivo: Chofer 2 sí puede leer su propia novedad
    const chofer2 = await comoChofer2();
    const { data: leidoChofer2 } = await chofer2
      .from("novedades_empleado")
      .select("id")
      .eq("id", novChofer2!.id);

    expect(leidoChofer2).toBeDefined();
    expect(leidoChofer2!.length).toBe(1);
    expect(leidoChofer2![0].id).toBe(novChofer2!.id);
  });

  it("Caso 42 (§A.5): Terminé con foto — sube adjunto a Storage y fila en adjuntos", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);

    const { data: serv, error: errInsertServ } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "en_curso",
        descripcion: `${PREFIJO}Servicio con foto remito`,
        monto: 45000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    expect(errInsertServ).toBeNull();
    expect(serv).toBeDefined();

    await admin.from("servicio_choferes").insert({
      servicio_id: serv!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    // 1. Chofer 1 sube foto al bucket adjuntos
    const storagePath = `servicios/${serv!.id}/remito-${Date.now()}.jpg`;
    const contenidoImagen = Buffer.from("imagen-simulada-remito-jpeg");

    const { error: errUpload } = await chofer1.storage
      .from("adjuntos")
      .upload(storagePath, contenidoImagen, {
        contentType: "image/jpeg",
      });
    expect(errUpload).toBeNull();

    // 2. Chofer 1 registra la fila en la tabla adjuntos
    const { error: errInsertAdj } = await chofer1.from("adjuntos").insert({
      servicio_id: serv!.id,
      tipo: "remito",
      storage_path: storagePath,
      subido_por: USUARIOS.chofer1.id,
    });
    expect(errInsertAdj).toBeNull();

    // 3. Chofer 1 cambia el estado a terminado vía RPC
    const { data: servTerminado, error: errRpc } = await chofer1.rpc(
      "cambiar_estado",
      {
        p_servicio_id: serv!.id,
        p_nuevo: "terminado",
      },
    );
    expect(errRpc).toBeNull();
    expect((servTerminado as any).estado).toBe("terminado");

    // 4. Verificar que el adjunto existe en la base y el archivo en Storage
    const { data: adjuntosGuardados } = await chofer1
      .from("adjuntos")
      .select("id, tipo, storage_path")
      .eq("servicio_id", serv!.id);

    expect(adjuntosGuardados?.length).toBe(1);
    expect(adjuntosGuardados![0].tipo).toBe("remito");
    expect(adjuntosGuardados![0].storage_path).toBe(storagePath);
  });

  it("Caso 43 (§A.5): ¿Cobraste? Efectivo — cobro acreditado en cuenta Efectivo y servicio cobrado", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);
    const monto = 30000;

    const { data: serv } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "terminado",
        descripcion: `${PREFIJO}Servicio cobrado en efectivo`,
        monto: monto,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: serv!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    // 1. Chofer registra cobro en efectivo
    const { data: cobro, error: errCobro } = await chofer1
      .from("cobros")
      .insert({
        cliente_id: CLIENTES.deza.id,
        fecha: hoy,
        fecha_acreditacion: hoy,
        monto: monto,
        medio: "efectivo",
        estado: "acreditado",
        registrado_por: USUARIOS.chofer1.id,
        cuenta_id: CUENTAS.efectivo.id,
      })
      .select("id")
      .single();

    expect(errCobro).toBeNull();
    expect(cobro).toBeDefined();

    // 2. Chofer registra aplicación al servicio
    const { error: errAplic } = await chofer1
      .from("cobro_aplicaciones")
      .insert({
        cobro_id: cobro!.id,
        servicio_id: serv!.id,
        monto: monto,
      });
    expect(errAplic).toBeNull();

    // 3. Verificar mediante admin que el servicio pasó a 'cobrado' y monto_cobrado = monto
    const { data: servVerif } = await admin
      .from("servicios")
      .select("estado, monto_cobrado")
      .eq("id", serv!.id)
      .single();

    expect(servVerif?.estado).toBe("cobrado");
    expect(Number(servVerif?.monto_cobrado)).toBe(monto);
  });

  it("Caso 44 (§A.5): ¿Cobraste? Cheque — cheque en_cartera y cobro pendiente", async () => {
    const admin = await comoAdmin();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);
    const monto = 42000;
    const chequeId = crypto.randomUUID();

    const { data: serv } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "terminado",
        descripcion: `${PREFIJO}Servicio cobrado con cheque`,
        monto: monto,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: serv!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    // 1. Chofer inserta cheque (sin .select())
    const { error: errCheque } = await chofer1.from("cheques").insert({
      id: chequeId,
      tipo: "recibido",
      es_echeq: false,
      numero: `${PREFIJO}CHQ-CHOFER`,
      banco: "Banco Santander",
      emisor: "Deza Test",
      monto: monto,
      fecha_pago: hoy,
      cliente_id: CLIENTES.deza.id,
      estado: "en_cartera",
    });
    expect(errCheque).toBeNull();

    // 2. Chofer inserta cobro con medio cheque y estado pendiente
    const { data: cobro, error: errCobro } = await chofer1
      .from("cobros")
      .insert({
        cliente_id: CLIENTES.deza.id,
        fecha: hoy,
        monto: monto,
        medio: "cheque",
        estado: "pendiente",
        cheque_id: chequeId,
        registrado_por: USUARIOS.chofer1.id,
      })
      .select("id")
      .single();

    expect(errCobro).toBeNull();
    expect(cobro).toBeDefined();

    // 3. Aplicación al servicio
    await chofer1.from("cobro_aplicaciones").insert({
      cobro_id: cobro!.id,
      servicio_id: serv!.id,
      monto: monto,
    });

    // 4. Verificación como admin
    const { data: chequeVerif } = await admin
      .from("cheques")
      .select("estado, monto")
      .eq("id", chequeId)
      .single();

    expect(chequeVerif?.estado).toBe("en_cartera");
    expect(Number(chequeVerif?.monto)).toBe(monto);

    const { data: cobroVerif } = await admin
      .from("cobros")
      .select("estado, medio")
      .eq("id", cobro!.id)
      .single();

    expect(cobroVerif?.estado).toBe("pendiente");
    expect(cobroVerif?.medio).toBe("cheque");
  });

  it("Caso 45 (§A.5): Servicio no planificado — se crea en terminado con no_planificado = true", async () => {
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);
    const ahora = new Date().toISOString();

    // 1. Chofer crea servicio no planificado en terminado
    const { data: nuevoServicio, error: errInsert } = await chofer1
      .from("servicios")
      .insert({
        tipo: "traslado",
        cliente_id: CLIENTES.monotributo.id,
        estado: "terminado",
        no_planificado: true,
        creado_por: USUARIOS.chofer1.id,
        fecha_programada: hoy,
        fecha_inicio: ahora,
        fecha_fin: ahora,
        descripcion: `${PREFIJO}Viaje urgente no planificado`,
      })
      .select("id, no_planificado, estado")
      .single();

    expect(errInsert).toBeNull();
    expect(nuevoServicio).toBeDefined();
    expect(nuevoServicio!.no_planificado).toBe(true);
    expect(nuevoServicio!.estado).toBe("terminado");

    // 2. Chofer se asigna en servicio_choferes
    const { error: errChofer } = await chofer1
      .from("servicio_choferes")
      .insert({
        servicio_id: nuevoServicio!.id,
        chofer_id: USUARIOS.chofer1.id,
      });
    expect(errChofer).toBeNull();

    // 3. Chofer sube foto de remito
    const storagePath = `servicios/${nuevoServicio!.id}/remito-noplanificado.jpg`;
    await chofer1.storage
      .from("adjuntos")
      .upload(storagePath, Buffer.from("remito-no-planificado"), {
        contentType: "image/jpeg",
      });

    const { error: errAdj } = await chofer1.from("adjuntos").insert({
      servicio_id: nuevoServicio!.id,
      tipo: "remito",
      storage_path: storagePath,
      subido_por: USUARIOS.chofer1.id,
    });
    expect(errAdj).toBeNull();
  });

  it("Caso 52 (§A.6): Evento de flota tipo taller — Chofer puede registrar ingreso a taller", async () => {
    const chofer1 = await comoChofer1();
    const admin = await comoAdmin();
    const hoy = new Date().toISOString().slice(0, 10);

    // Chofer registra evento de flota tipo 'taller'
    const { error: errEvento } = await chofer1.from("eventos_flota").insert({
      vehiculo_id: VEHICULOS.fordCargo.id,
      fecha: hoy,
      tipo: "taller",
      descripcion: `${PREFIJO}Camión a taller por ruido en embrague`,
      creado_por: USUARIOS.chofer1.id,
    });
    expect(errEvento).toBeNull();

    // Actualizar estado del vehículo a 'taller' (tarea operativa)
    const { error: errVeh } = await admin
      .from("vehiculos")
      .update({ estado: "taller" })
      .eq("id", VEHICULOS.fordCargo.id);
    expect(errVeh).toBeNull();

    // Verificar que el vehículo está en taller
    const { data: vehTaller } = await admin
      .from("vehiculos")
      .select("estado")
      .eq("id", VEHICULOS.fordCargo.id)
      .single();
    expect(vehTaller?.estado).toBe("taller");

    // 'Volvió del taller' lo revierte a disponible
    await admin
      .from("vehiculos")
      .update({ estado: "disponible" })
      .eq("id", VEHICULOS.fordCargo.id);

    const { data: vehDisp } = await admin
      .from("vehiculos")
      .select("estado")
      .eq("id", VEHICULOS.fordCargo.id)
      .single();
    expect(vehDisp?.estado).toBe("disponible");
  });
});
