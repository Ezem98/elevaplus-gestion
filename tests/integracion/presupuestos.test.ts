import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { comoChofer1, comoOficina, limpiarRegistrosTest } from "./setup";

describe("Presupuestos — Integración (§4)", () => {
  const PREFIJO = "TEST-INT-PRE-";

  beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  it("Crear presupuesto con prospecto y dos ítems vía crear_presupuesto, marcar enviado y aceptarlo creando cliente nuevo vía aceptar_presupuesto", async () => {
    const supabase = await comoOficina();
    const cuitAleatorio = `30-${Math.floor(10000000 + Math.random() * 89999999)}-9`;
    const nombreProspecto = `${PREFIJO}Flujo Integral SRL`;

    // 1. Crear presupuesto con prospecto y dos ítems atómicamente con crear_presupuesto
    const { data: pres, error: presErr } = await supabase.rpc(
      "crear_presupuesto",
      {
        p_datos: {
          prospecto_nombre: nombreProspecto,
          prospecto_cuit: cuitAleatorio,
          prospecto_telefono: "1155443322",
          prospecto_email: "info@flujointegral.com",
          validez_dias: 15,
          condiciones: "Pago a 30 días",
        },
        p_items: [
          {
            tipo: "traslado",
            descripcion: `${PREFIJO}Traslado de autoelevador a Pilar`,
            monto: 120000,
            moneda: "ARS",
            aplica_iva: true,
            origen: "Base Canning",
            destino: "Parque Industrial Pilar",
            km: 80,
          },
          {
            tipo: "alquiler_hora",
            descripcion: `${PREFIJO}Operación de carga y descarga 4 horas`,
            monto: 90000,
            moneda: "ARS",
            aplica_iva: true,
          },
        ],
      },
    );

    expect(presErr).toBeNull();
    expect(pres).toBeDefined();
    expect(pres.numero).toBeGreaterThan(0);
    expect(pres.cliente_id).toBeNull();
    expect(pres.estado).toBe("borrador");

    // 2. Verificar que los ítems fueron creados en estado consulta
    const { data: itemsIniciales, error: itErr } = await supabase
      .from("servicios")
      .select("id, estado, presupuesto_id, cliente_id")
      .eq("presupuesto_id", pres.id);

    expect(itErr).toBeNull();
    expect(itemsIniciales).toHaveLength(2);
    for (const item of itemsIniciales!) {
      expect(item.estado).toBe("consulta");
      expect(item.cliente_id).toBeNull();
    }

    // 3. Marcar como enviado vía marcar_presupuesto_enviado
    const { data: presEnviado, error: envErr } = await supabase.rpc(
      "marcar_presupuesto_enviado",
      {
        p_presupuesto_id: pres.id,
        p_pdf_path: `presupuestos/${pres.id}/presupuesto-${pres.numero}.pdf`,
      },
    );

    expect(envErr).toBeNull();
    expect(presEnviado.estado).toBe("enviado");
    expect(presEnviado.pdf_path).toContain(`presupuesto-${pres.numero}.pdf`);

    // Los ítems en consulta deben haber pasado a presupuestado
    const { data: itemsEnviados } = await supabase
      .from("servicios")
      .select("id, estado")
      .eq("presupuesto_id", pres.id);

    for (const item of itemsEnviados!) {
      expect(item.estado).toBe("presupuestado");
    }

    // 4. Aceptar presupuesto creando el nuevo cliente atómicamente vía aceptar_presupuesto
    const { data: presAceptado, error: acepErr } = await supabase.rpc(
      "aceptar_presupuesto",
      {
        p_presupuesto_id: pres.id,
        p_cliente_id: null,
        p_cliente_nuevo: {
          nombre: nombreProspecto,
          cuit: cuitAleatorio,
          telefono: "1155443322",
          email: "info@flujointegral.com",
          condicion_iva: "responsable_inscripto",
        },
      },
    );

    expect(acepErr).toBeNull();
    expect(presAceptado).toBeDefined();
    expect(presAceptado.estado).toBe("aceptado");
    expect(presAceptado.cliente_id).toBeDefined();

    // 5. Verificar que el cliente existe en la tabla clientes
    const { data: clienteCreado, error: cliErr } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", presAceptado.cliente_id)
      .single();

    expect(cliErr).toBeNull();
    expect(clienteCreado.nombre).toBe(nombreProspecto);
    expect(clienteCreado.cuit).toBe(cuitAleatorio.replace(/\D/g, ""));

    // 6. Verificar que ambos servicios quedaron vinculados al cliente y en estado aceptado
    const { data: serviciosActualizados, error: sActErr } = await supabase
      .from("servicios")
      .select("id, cliente_id, estado, presupuesto_id")
      .eq("presupuesto_id", pres.id);

    expect(sActErr).toBeNull();
    expect(serviciosActualizados).toHaveLength(2);

    for (const s of serviciosActualizados!) {
      expect(s.cliente_id).toBe(clienteCreado.id);
      expect(s.estado).toBe("aceptado");
    }
  });

  it("Aceptar presupuesto con un ítem cancelado: el cancelado sigue cancelado", async () => {
    const supabase = await comoOficina();

    // 1. Crear presupuesto con dos ítems
    const { data: pres, error: presErr } = await supabase.rpc(
      "crear_presupuesto",
      {
        p_datos: {
          prospecto_nombre: `${PREFIJO}Empresa con Item Cancelado SA`,
          validez_dias: 10,
        },
        p_items: [
          {
            tipo: "traslado",
            descripcion: `${PREFIJO}Ítem que se va a aceptar`,
            monto: 75000,
            moneda: "ARS",
          },
          {
            tipo: "mantenimiento",
            descripcion: `${PREFIJO}Ítem que se va a cancelar antes de aceptar`,
            monto: 30000,
            moneda: "ARS",
          },
        ],
      },
    );

    expect(presErr).toBeNull();

    // Obtener los dos servicios creados
    const { data: items } = await supabase
      .from("servicios")
      .select("id, descripcion, monto")
      .eq("presupuesto_id", pres.id);

    const servActivo = items!.find((i) => i.monto === 75000 || i.descripcion.includes("aceptar"))!;
    const servCancelado = items!.find((i) => i.monto === 30000 || i.descripcion.includes("cancelar"))!;

    // 2. Cancelar el segundo ítem
    const { error: cancelErr } = await supabase.rpc("cambiar_estado", {
      p_servicio_id: servCancelado.id,
      p_nuevo: "cancelado",
      p_nota: "Cancelado a pedido del cliente",
    });
    expect(cancelErr).toBeNull();

    // 3. Aceptar presupuesto con cliente nuevo
    const { data: presAceptado, error: acepErr } = await supabase.rpc(
      "aceptar_presupuesto",
      {
        p_presupuesto_id: pres.id,
        p_cliente_id: null,
        p_cliente_nuevo: {
          nombre: `${PREFIJO}Empresa con Item Cancelado SA`,
        },
      },
    );

    expect(acepErr).toBeNull();
    expect(presAceptado.estado).toBe("aceptado");

    // 4. Verificar que el ítem activo pasó a aceptado y el cancelado sigue cancelado
    const { data: servActivoFinal } = await supabase
      .from("servicios")
      .select("estado, cliente_id")
      .eq("id", servActivo.id)
      .single();
    expect(servActivoFinal?.estado).toBe("aceptado");
    expect(servActivoFinal?.cliente_id).toBe(presAceptado.cliente_id);

    const { data: servCanceladoFinal } = await supabase
      .from("servicios")
      .select("estado, cliente_id")
      .eq("id", servCancelado.id)
      .single();
    expect(servCanceladoFinal?.estado).toBe("cancelado");
  });

  it("Rechazar presupuesto vía rechazar_presupuesto cancela ítems y actualiza estado", async () => {
    const supabase = await comoOficina();

    // 1. Crear presupuesto con dos ítems
    const { data: pres, error: presErr } = await supabase.rpc(
      "crear_presupuesto",
      {
        p_datos: {
          prospecto_nombre: `${PREFIJO}Empresa Rechazo Test SRL`,
          validez_dias: 15,
        },
        p_items: [
          {
            tipo: "traslado",
            descripcion: `${PREFIJO}Servicio a ser rechazado 1`,
            monto: 50000,
            moneda: "ARS",
          },
          {
            tipo: "alquiler_hora",
            descripcion: `${PREFIJO}Servicio a ser rechazado 2`,
            monto: 40000,
            moneda: "ARS",
          },
        ],
      },
    );

    expect(presErr).toBeNull();

    // 2. Rechazar presupuesto
    const { data: presRechazado, error: rechErr } = await supabase.rpc(
      "rechazar_presupuesto",
      {
        p_presupuesto_id: pres.id,
        p_motivo: "Presupuesto muy caro",
      },
    );

    expect(rechErr).toBeNull();
    expect(presRechazado.estado).toBe("rechazado");
    expect(presRechazado.notas).toContain("Presupuesto muy caro");

    // 3. Verificar que ambos servicios pasaron a cancelado
    const { data: serviciosCancelados } = await supabase
      .from("servicios")
      .select("id, estado")
      .eq("presupuesto_id", pres.id);

    expect(serviciosCancelados).toHaveLength(2);
    for (const s of serviciosCancelados!) {
      expect(s.estado).toBe("cancelado");
    }
  });

  it("Función interna _insertar_items_presupuesto: oficina y chofer reciben error de permisos y no se inserta nada", async () => {
    const supabaseOficina = await comoOficina();
    const supabaseChofer = await comoChofer1();

    // 1. Crear presupuesto legítimo vía crear_presupuesto para tener un ID válido
    const { data: pres, error: presErr } = await supabaseOficina.rpc(
      "crear_presupuesto",
      {
        p_datos: {
          prospecto_nombre: `${PREFIJO}Test Permisos Internos`,
          validez_dias: 15,
        },
        p_items: [
          {
            tipo: "traslado",
            descripcion: `${PREFIJO}Ítem legítimo inicial`,
            monto: 50000,
            moneda: "ARS",
          },
        ],
      },
    );
    expect(presErr).toBeNull();
    expect(pres).toBeDefined();

    // Contar servicios del presupuesto antes del intento
    const { data: servsAntes } = await supabaseOficina
      .from("servicios")
      .select("id")
      .eq("presupuesto_id", pres.id);
    expect(servsAntes).toHaveLength(1);

    const itemIntento = [
      {
        tipo: "traslado",
        descripcion: `${PREFIJO}Ítem que no debe insertarse`,
        monto: 99999,
        moneda: "ARS",
      },
    ];

    // 2. Intento de llamada directa por Oficina
    const { error: errOficina } = await supabaseOficina.rpc(
      "_insertar_items_presupuesto" as any,
      {
        p_presupuesto_id: pres.id,
        p_cliente_id: null,
        p_items: itemIntento,
      },
    );
    expect(errOficina).not.toBeNull();
    expect(errOficina?.message).toBeDefined();

    // 3. Intento de llamada directa por Chofer
    const { error: errChofer } = await supabaseChofer.rpc(
      "_insertar_items_presupuesto" as any,
      {
        p_presupuesto_id: pres.id,
        p_cliente_id: null,
        p_items: itemIntento,
      },
    );
    expect(errChofer).not.toBeNull();
    expect(errChofer?.message).toBeDefined();

    // 4. Verificar que no se insertó nada
    const { data: servsDespues } = await supabaseOficina
      .from("servicios")
      .select("id, descripcion")
      .eq("presupuesto_id", pres.id);
    expect(servsDespues).toHaveLength(1);
    expect(servsDespues![0].descripcion).toContain("Ítem legítimo inicial");
  });
});
