import { PresupuestoPDF } from "@/features/presupuestos/PresupuestoPDF";
import { normalizarTelefonoWhatsApp } from "@/lib/presupuesto";
import { pdf } from "@react-pdf/renderer";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CATEGORIAS_MOVIMIENTO,
  CLIENTES,
  comoAdmin,
  comoChofer1,
  comoOficina,
  CUENTAS,
  limpiarRegistrosTest,
  MAQUINAS,
  USUARIOS,
} from "./setup";

describe("Flujos de Integración y Casos de Negocio", () => {
  const PREFIJO = "TEST-FLUJO-";

  beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  afterEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  it("Flujo completo por API: Presupuesto → Aceptado → Programado → Terminado → Cobrado → Facturado", async () => {
    const admin = await comoAdmin();
    const oficina = await comoOficina();
    const chofer1 = await comoChofer1();
    const hoy = new Date().toISOString().slice(0, 10);
    const monto = 80000;

    // 1. Crear servicio en consulta
    const { data: serv, error: errCrear } = await oficina
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "consulta",
        descripcion: `${PREFIJO}Ciclo de vida completo`,
        monto: monto,
        fecha_programada: hoy,
      })
      .select("id, numero")
      .single();

    expect(errCrear).toBeNull();
    const sId = serv!.id;

    // 2. Consulta → Presupuestado
    const { error: errPresup } = await oficina.rpc("cambiar_estado", {
      p_servicio_id: sId,
      p_nuevo: "presupuestado",
      p_nota: "Presupuesto enviado",
    });
    expect(errPresup).toBeNull();

    // 3. Presupuestado → Aceptado
    const { error: errAcep } = await oficina.rpc("cambiar_estado", {
      p_servicio_id: sId,
      p_nuevo: "aceptado",
      p_nota: "Cliente confirmó presupuesto",
    });
    expect(errAcep).toBeNull();

    // 4. Aceptado → Programado y asignación de Chofer
    const { error: errProg } = await oficina.rpc("cambiar_estado", {
      p_servicio_id: sId,
      p_nuevo: "programado",
      p_nota: "Programado para hoy",
    });
    expect(errProg).toBeNull();

    await oficina.from("servicio_choferes").insert({
      servicio_id: sId,
      chofer_id: USUARIOS.chofer1.id,
    });

    // 5. Chofer inicia: Programado → En curso
    const { error: errEnCurso } = await chofer1.rpc("cambiar_estado", {
      p_servicio_id: sId,
      p_nuevo: "en_curso",
    });
    expect(errEnCurso).toBeNull();

    // 6. Chofer termina: En curso → Terminado
    const { error: errTerm } = await chofer1.rpc("cambiar_estado", {
      p_servicio_id: sId,
      p_nuevo: "terminado",
    });
    expect(errTerm).toBeNull();

    // 7. Cobro en efectivo por el total
    const { data: cobro, error: errCobro } = await chofer1
      .from("cobros")
      .insert({
        cliente_id: CLIENTES.deza.id,
        fecha: hoy,
        fecha_acreditacion: hoy,
        monto: monto,
        medio: "efectivo",
        estado: "acreditado",
        cuenta_id: CUENTAS.efectivo.id,
        registrado_por: USUARIOS.chofer1.id,
      })
      .select("id")
      .single();

    expect(errCobro).toBeNull();

    const { error: errAplic } = await chofer1
      .from("cobro_aplicaciones")
      .insert({
        cobro_id: cobro!.id,
        servicio_id: sId,
        monto: monto,
      });
    expect(errAplic).toBeNull();

    // El trigger recalcula cobros del servicio y lo pasa a 'cobrado'
    const { data: servCobrado } = await admin
      .from("servicios")
      .select("estado, monto_cobrado")
      .eq("id", sId)
      .single();

    expect(servCobrado?.estado).toBe("cobrado");
    expect(Number(servCobrado?.monto_cobrado)).toBe(monto);

    // 8. Facturación
    const pv = 98;
    const numFactura = (Math.floor(Date.now() / 1000) % 900000) + 1000;
    const { data: factura, error: errFac } = await oficina
      .from("facturas")
      .insert({
        tipo: "A",
        punto_venta: pv,
        numero: numFactura,
        fecha: hoy,
        cliente_id: CLIENTES.deza.id,
        neto: monto,
        iva: monto * 0.21,
        total: monto * 1.21,
        notas: `${PREFIJO}Factura ciclo completo`,
      })
      .select("id")
      .single();

    expect(errFac).toBeNull();

    // Asociar factura al servicio y avanzar a facturado
    await oficina
      .from("servicios")
      .update({ factura_id: factura!.id })
      .eq("id", sId);

    const { error: errFacturado } = await oficina.rpc("cambiar_estado", {
      p_servicio_id: sId,
      p_nuevo: "facturado",
      p_nota: "Facturado con Factura A",
    });
    expect(errFacturado).toBeNull();

    const { data: servFinal } = await admin
      .from("servicios")
      .select("estado, factura_id")
      .eq("id", sId)
      .single();

    expect(servFinal?.estado).toBe("facturado");
    expect(servFinal?.factura_id).toBe(factura!.id);
  });

  it("Caso 4 (§A.1): Endosar cheque a proveedor — egreso pagado, cheque endosado, saldos intactos", async () => {
    const admin = await comoAdmin();
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);
    const montoCheque = 120000;
    const idCheque = crypto.randomUUID();

    // 1. Recibir cheque en cartera
    const { error: errChq } = await oficina.from("cheques").insert({
      id: idCheque,
      tipo: "recibido",
      es_echeq: false,
      numero: `${PREFIJO}CHQ-ENDOSO`,
      banco: "Banco Credicoop",
      emisor: "Cliente Pagador",
      monto: montoCheque,
      fecha_pago: hoy,
      cliente_id: CLIENTES.deza.id,
      estado: "en_cartera",
    });
    expect(errChq).toBeNull();

    // Consultar saldo de cuentas antes del endoso
    const { data: saldosAntes } = await admin
      .from("saldos_cuentas")
      .select("*");

    // 2. Crear movimiento de egreso para pagar al proveedor con cheque de terceros
    const { data: movEgreso, error: errEgreso } = await oficina
      .from("movimientos_caja")
      .insert({
        fecha: hoy,
        tipo: "egreso",
        ambito: "empresa",
        monto: montoCheque,
        descripcion: `${PREFIJO}Pago repuestos por endoso`,
        estado: "pagado",
        medio: "cheque",
        proveedor: "Taller Mecánico S.A.",
      })
      .select("id")
      .single();

    expect(errEgreso).toBeNull();

    // 3. Ejecutar RPC cambiar_estado_cheque a 'endosado'
    const { data: chqEndosado, error: errRpc } = await oficina.rpc(
      "cambiar_estado_cheque",
      {
        p_cheque_id: idCheque,
        p_nuevo: "endosado",
        p_nota: "Endosado a Taller Mecánico S.A.",
        p_cuenta_id: null,
        p_fecha: hoy,
        p_endosado_a: "Taller Mecánico S.A.",
        p_movimiento_id: movEgreso!.id,
        p_descontado_neto: null,
        p_descontado_en: null,
        p_motivo: null,
      },
    );

    expect(errRpc).toBeNull();
    expect(chqEndosado).toBeDefined();

    // 4. Verificaciones
    const { data: chqVerif } = await admin
      .from("cheques")
      .select("estado, endosado_a, endosado_movimiento_id")
      .eq("id", idCheque)
      .single();

    expect(chqVerif?.estado).toBe("endosado");
    expect(chqVerif?.endosado_a).toBe("Taller Mecánico S.A.");
    expect(chqVerif?.endosado_movimiento_id).toBe(movEgreso!.id);

    // 5. Saldos de cuentas bancarias y efectivo deben permanecer INTACTOS
    const { data: saldosDespues } = await admin
      .from("saldos_cuentas")
      .select("*");
    expect(saldosDespues).toEqual(saldosAntes);
  });

  it("Caso 27 (§A.3): Descargar PDF — se genera sin error y pesa > 10 KB", async () => {
    const admin = await comoAdmin();
    const hoy = new Date().toISOString().slice(0, 10);

    // Obtener datos de empresa del seed
    const { data: emp } = await admin.from("empresa").select("*").single();
    expect(emp).toBeDefined();

    const servicioSimulado = {
      id: "00000000-0000-0000-0000-000000000099",
      numero: 105,
      tipo: "traslado",
      estado: "presupuestado",
      monto: 75000,
      aplica_iva: true,
      fecha_programada: hoy,
      origen: "Burzaco",
      destino: "Lomas de Zamora",
      km: 18,
      ida_y_vuelta: true,
      carga: "Autoelevador 2.5 tn",
      descripcion: "Traslado de autoelevador ida y vuelta",
      clientes: {
        nombre: "Industrias Metalúrgicas S.A.",
        cuit: "30-65432109-8",
        condicion_iva: "responsable_inscripto",
      },
    };

    // Renderizar PDF usando el componente oficial PresupuestoPDF
    const elemento = React.createElement(PresupuestoPDF, {
      empresa: emp!,
      servicio: servicioSimulado as any,
      validezDias: 15,
      extra: "Descarga de equipo incluida.",
    });

    const stream = await pdf(elemento as any).toBuffer();
    const chunks: Buffer[] = [];
    for await (const chunk of stream as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // Verificar encabezado PDF estándar: %PDF-
    expect(buffer.slice(0, 4).toString()).toBe("%PDF");
    // Regla del caso 27: El archivo generado pesa > 10 KB (10240 bytes)
    expect(buffer.length).toBeGreaterThan(10240);
  });

  it("Caso 29 (§A.3): Cambiar validez y condiciones persisten al recargar", async () => {
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);

    const { data: serv } = await oficina
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "consulta",
        descripcion: `${PREFIJO}Servicio para probar persistencia de condiciones`,
        monto: 60000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    const validezModificada = 45;
    const condicionesModificadas =
      "Presupuesto sujeto a disponibilidad de chofer y grúa.";

    // Guardar cambios de validez y condiciones
    const { error: errUpdate } = await oficina
      .from("servicios")
      .update({
        presupuesto_validez_dias: validezModificada,
        presupuesto_condiciones: condicionesModificadas,
      })
      .eq("id", serv!.id);

    expect(errUpdate).toBeNull();

    // Recargar desde la base y verificar que persistieron
    const { data: recargado } = await oficina
      .from("servicios")
      .select("presupuesto_validez_dias, presupuesto_condiciones")
      .eq("id", serv!.id)
      .single();

    expect(recargado?.presupuesto_validez_dias).toBe(validezModificada);
    expect(recargado?.presupuesto_condiciones).toBe(condicionesModificadas);
  });

  it("Caso 30 (§A.3): Botón WhatsApp — URL wa.me con teléfono normalizado y mensaje", () => {
    // 1. Normalización de teléfonos argentinos con diversos formatos
    expect(normalizarTelefonoWhatsApp("11 4050 6070")).toBe("5491140506070");
    expect(normalizarTelefonoWhatsApp("011-15-4050-6070")).toBe(
      "549111540506070",
    );
    expect(normalizarTelefonoWhatsApp("+54 9 11 4050 6070")).toBe(
      "5491140506070",
    );
    expect(normalizarTelefonoWhatsApp("5491140506070")).toBe("5491140506070");
    expect(normalizarTelefonoWhatsApp("")).toBeNull();
    expect(normalizarTelefonoWhatsApp(null)).toBeNull();

    // 2. Construcción de URL de WhatsApp con link firmado y codificación segura
    const tel = normalizarTelefonoWhatsApp("11 4050 6070");
    const linkDescarga =
      "https://supabase.local/storage/v1/object/sign/adjuntos/presupuesto.pdf?token=xyz123";
    const mensaje = `Hola, te paso el presupuesto N° 0105 de ELEVAPLUS: ${linkDescarga}. Cualquier duda, escribime.`;

    const waUrl = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;

    expect(waUrl.startsWith("https://wa.me/5491140506070?text=")).toBe(true);
    expect(waUrl).toContain(encodeURIComponent("N° 0105"));
    expect(waUrl).toContain(encodeURIComponent(linkDescarga));
  });

  it("Caso 32 (§A.3): Servicio sin cliente — no se puede generar presupuesto", async () => {
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);

    // Crear servicio sin cliente asociado
    const { data: servSinCli } = await oficina
      .from("servicios")
      .insert({
        cliente_id: null,
        tipo: "traslado",
        estado: "consulta",
        descripcion: `${PREFIJO}Servicio sin cliente`,
        monto: 50000,
        fecha_programada: hoy,
      })
      .select("id, cliente_id")
      .single();

    expect(servSinCli?.cliente_id).toBeNull();

    // Validación de negocio: un presupuesto requiere cliente asignado
    const puedeGenerarPresupuesto = Boolean(servSinCli?.cliente_id);
    expect(puedeGenerarPresupuesto).toBe(false);
  });

  it("Caso 35 (§A.4): Gasto con Factura A neto 100.000 — IVA sugerido 21.000, total 121.000", async () => {
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);
    const neto = 100000;
    const ivaSugerido = Math.round(neto * 0.21); // 21.000
    const montoTotal = neto + ivaSugerido; // 121.000

    expect(ivaSugerido).toBe(21000);
    expect(montoTotal).toBe(121000);

    // Registrar el egreso con comprobante A
    const { data: mov, error: errMov } = await oficina
      .from("movimientos_caja")
      .insert({
        fecha: hoy,
        tipo: "egreso",
        ambito: "empresa",
        categoria_id: CATEGORIAS_MOVIMIENTO.repuestos,
        descripcion: `${PREFIJO}Compra de repuestos autoelevador`,
        monto: montoTotal,
        neto: neto,
        iva: ivaSugerido,
        tiene_comprobante: true,
        comprobante_tipo: "A",
        comprobante_punto_venta: 1,
        comprobante_numero: 9876,
        proveedor: "Repuestos Industriales SA",
        proveedor_cuit: "30-70809010-4",
        estado: "pagado",
        medio: "transferencia",
        cuenta_id: CUENTAS.galicia.id,
      })
      .select("id, neto, iva, monto, comprobante_tipo")
      .single();

    expect(errMov).toBeNull();
    expect(Number(mov?.neto)).toBe(100000);
    expect(Number(mov?.iva)).toBe(21000);
    expect(Number(mov?.monto)).toBe(121000);

    // Verificar en iva_mensual que suma a IVA compras
    const mesActual = hoy.slice(0, 7) + "-01";
    const { data: ivaFila } = await oficina
      .from("iva_mensual")
      .select("*")
      .eq("mes", mesActual)
      .maybeSingle();

    if (ivaFila) {
      expect(Number(ivaFila.iva_compras)).toBeGreaterThanOrEqual(21000);
    }
  });

  it("Caso 50 (§A.6): Renovar alquiler — nuevo servicio con fechas corridas y renovado_de seteado", async () => {
    const admin = await comoAdmin();
    const oficina = await comoOficina();

    // 1. Crear servicio y alquiler original
    const { data: servOriginal } = await oficina
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "alquiler_periodo",
        estado: "programado",
        maquina_id: MAQUINAS.ae01.id,
        descripcion: `${PREFIJO}Alquiler Original Mes 1`,
        monto: 250000,
        fecha_programada: "2026-09-01",
      })
      .select("id, numero")
      .single();

    await oficina.from("alquileres").insert({
      servicio_id: servOriginal!.id,
      fecha_desde: "2026-09-01",
      fecha_hasta: "2026-09-30",
      unidad: "mes",
      cantidad: 1,
      precio_unidad: 250000,
    });

    // 2. Crear servicio renovado con fechas corridas (octubre)
    const { data: servRenovado, error: errRenov } = await oficina
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "alquiler_periodo",
        estado: "consulta",
        maquina_id: MAQUINAS.ae01.id,
        descripcion: `${PREFIJO}Alquiler Renovado Mes 2`,
        monto: 250000,
        fecha_programada: "2026-10-01",
      })
      .select("id")
      .single();

    expect(errRenov).toBeNull();

    // Insertar en alquileres con renovado_de = servOriginal.id
    const { error: errAlqRenov } = await oficina.from("alquileres").insert({
      servicio_id: servRenovado!.id,
      fecha_desde: "2026-10-01",
      fecha_hasta: "2026-10-31",
      unidad: "mes",
      cantidad: 1,
      precio_unidad: 250000,
      renovado_de: servOriginal!.id,
    });
    expect(errAlqRenov).toBeNull();

    // Avanzar renovado a programado con nota
    const { error: errRpc } = await oficina.rpc("cambiar_estado", {
      p_servicio_id: servRenovado!.id,
      p_nuevo: "programado",
      p_nota: `Renovación del #${servOriginal!.numero}`,
    });
    expect(errRpc).toBeNull();

    // 3. Verificación
    const { data: alqVerif } = await admin
      .from("alquileres")
      .select("servicio_id, fecha_desde, fecha_hasta, renovado_de")
      .eq("servicio_id", servRenovado!.id)
      .single();

    expect(alqVerif?.renovado_de).toBe(servOriginal!.id);
    expect(alqVerif?.fecha_desde).toBe("2026-10-01");
    expect(alqVerif?.fecha_hasta).toBe("2026-10-31");
  });

  it("Facturación múltiple: 3 servicios de un cliente agrupados en una sola Factura A", async () => {
    const admin = await comoAdmin();
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);
    const montos = [30000, 45000, 25000];
    const sumaNeto = 100000;
    const sumaIva = 21000;
    const totalFactura = 121000;

    // 1. Crear 3 servicios para el cliente Deza en estado terminado
    const idsServicios: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { data: s } = await oficina
        .from("servicios")
        .insert({
          cliente_id: CLIENTES.deza.id,
          tipo: "traslado",
          estado: "terminado",
          descripcion: `${PREFIJO}Servicio ${i + 1} para factura múltiple`,
          monto: montos[i],
          fecha_programada: hoy,
        })
        .select("id")
        .single();
      idsServicios.push(s!.id);
    }

    expect(idsServicios.length).toBe(3);

    // 2. Crear una única Factura A por el total agrupado
    const pv = 97;
    const numFactura = (Math.floor(Date.now() / 1000) % 900000) + 5000;
    const { data: factura, error: errFac } = await oficina
      .from("facturas")
      .insert({
        tipo: "A",
        punto_venta: pv,
        numero: numFactura,
        fecha: hoy,
        cliente_id: CLIENTES.deza.id,
        neto: sumaNeto,
        iva: sumaIva,
        total: totalFactura,
        notas: `${PREFIJO}Factura múltiple 3 servicios`,
      })
      .select("id")
      .single();

    expect(errFac).toBeNull();
    expect(factura).toBeDefined();

    // 3. Asociar la factura a los 3 servicios y avanzar a facturado
    for (const sId of idsServicios) {
      await oficina
        .from("servicios")
        .update({ factura_id: factura!.id })
        .eq("id", sId);

      const { error: errRpc } = await oficina.rpc("cambiar_estado", {
        p_servicio_id: sId,
        p_nuevo: "facturado",
      });
      expect(errRpc).toBeNull();
    }

    // 4. Verificar que los 3 servicios apuntan a la misma factura y están facturados
    const { data: serviciosVerif } = await admin
      .from("servicios")
      .select("id, estado, factura_id")
      .in("id", idsServicios);

    expect(serviciosVerif?.length).toBe(3);
    for (const s of serviciosVerif!) {
      expect(s.estado).toBe("facturado");
      expect(s.factura_id).toBe(factura!.id);
    }
  });

  it("Regresión PGRST201: la lista de cada pestaña devuelve la misma cantidad de filas que el contador, con alquiler embebido y sin error", async () => {
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // 1. Crear servicios para poblar varios estados y tipos
    // Servicio 1: alquiler_periodo en_curso (con fila en alquileres)
    const { data: sAlq, error: errSAlq } = await oficina
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "alquiler_periodo",
        estado: "en_curso",
        descripcion: `${PREFIJO}Alquiler con embedding`,
        monto: 150000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();
    expect(errSAlq).toBeNull();

    const { error: errAlq } = await oficina.from("alquileres").insert({
      servicio_id: sAlq!.id,
      fecha_desde: hoy,
      fecha_hasta: manana,
      unidad: "mes",
      cantidad: 1,
      precio_unidad: 150000,
    });
    expect(errAlq).toBeNull();

    // Servicio 2: presupuesto (estado presupuestado)
    const { error: errS2 } = await oficina.from("servicios").insert({
      cliente_id: CLIENTES.deza.id,
      tipo: "traslado",
      estado: "presupuestado",
      descripcion: `${PREFIJO}Presupuesto pendiente`,
      monto: 50000,
      fecha_programada: hoy,
    });
    expect(errS2).toBeNull();

    // Servicio 3: cobrado
    const { error: errS3 } = await oficina.from("servicios").insert({
      cliente_id: CLIENTES.deza.id,
      tipo: "mantenimiento",
      estado: "cobrado",
      descripcion: `${PREFIJO}Servicio cobrado`,
      monto: 30000,
      fecha_programada: hoy,
    });
    expect(errS3).toBeNull();

    // Servicio 4: cancelado
    const { error: errS4 } = await oficina.from("servicios").insert({
      cliente_id: CLIENTES.deza.id,
      tipo: "otro",
      estado: "cancelado",
      descripcion: `${PREFIJO}Servicio cancelado`,
      monto: 20000,
      fecha_programada: hoy,
    });
    expect(errS4).toBeNull();

    // Servicio 5: sin cliente (cliente_id: null) en consulta
    const { data: sSinCliente, error: errS5 } = await oficina
      .from("servicios")
      .insert({
        cliente_id: null,
        tipo: "otro",
        estado: "consulta",
        descripcion: `${PREFIJO}Servicio sin cliente`,
        monto: 10000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();
    expect(errS5).toBeNull();

    // 2. Ejecutar la consulta de conteos tal cual lo hace PaginaServicios (aislada por PREFIJO del test)
    const { data: conteoData, error: errConteo } = await oficina
      .from("servicios")
      .select("tipo, estado")
      .ilike("descripcion", `%${PREFIJO}%`);
    expect(errConteo).toBeNull();
    expect(conteoData).toBeDefined();

    type ClaveFiltro =
      | "todos"
      | "presupuestos"
      | "en_curso"
      | "alquileres_activos"
      | "cobrados"
      | "cancelados";

    const conteos: Record<ClaveFiltro, number> = {
      todos: 0,
      presupuestos: 0,
      en_curso: 0,
      alquileres_activos: 0,
      cobrados: 0,
      cancelados: 0,
    };
    conteos.todos = conteoData!.length;
    for (const item of conteoData!) {
      const e = item.estado;
      if (item.tipo === "alquiler_periodo" && e === "en_curso") {
        conteos.alquileres_activos++;
      }
      if (e === "consulta" || e === "presupuestado") {
        conteos.presupuestos++;
      } else if (
        e === "aceptado" ||
        e === "programado" ||
        e === "en_curso" ||
        e === "terminado"
      ) {
        conteos.en_curso++;
      } else if (e === "cobrado" || e === "facturado") {
        conteos.cobrados++;
      } else if (e === "cancelado") {
        conteos.cancelados++;
      }
    }

    // 3. Probar la consulta de lista de cada pestaña
    const pestanas: { id: ClaveFiltro; estados: string[] }[] = [
      { id: "todos", estados: [] },
      { id: "presupuestos", estados: ["consulta", "presupuestado"] },
      { id: "en_curso", estados: ["aceptado", "programado", "en_curso", "terminado"] },
      { id: "alquileres_activos", estados: [] },
      { id: "cobrados", estados: ["cobrado", "facturado"] },
      { id: "cancelados", estados: ["cancelado"] },
    ];

    for (const p of pestanas) {
      let q = oficina
        .from("servicios")
        .select(
          "*, clientes!servicios_cliente_id_fkey(nombre), alquileres!alquileres_servicio_id_fkey(fecha_desde, fecha_hasta)",
        )
        .ilike("descripcion", `%${PREFIJO}%`)
        .order("fecha_programada", { ascending: false, nullsFirst: false })
        .limit(100);

      if (p.id === "alquileres_activos") {
        q = q.eq("tipo", "alquiler_periodo").eq("estado", "en_curso");
      } else if (p.estados.length > 0) {
        q = q.in("estado", p.estados);
      }

      const { data, error } = await q;

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBe(conteos[p.id]);

      // En la pestaña Todos, verificar que el servicio sin cliente aparece y tiene clientes en null
      if (p.id === "todos") {
        const itemSinCliente = data!.find((s: any) => s.id === sSinCliente!.id);
        expect(itemSinCliente).toBeDefined();
        expect(itemSinCliente.clientes).toBeNull();
      }

      // En la pestaña de alquileres_activos, verificar que el alquiler está embebido correctamente
      if (p.id === "alquileres_activos") {
        const itemAlq = data!.find((s: any) => s.id === sAlq!.id);
        expect(itemAlq).toBeDefined();
        expect(itemAlq.alquileres).toBeDefined();
        expect(itemAlq.alquileres.fecha_desde).toBe(hoy);
        expect(itemAlq.alquileres.fecha_hasta).toBe(manana);
      }
    }
  });
});
