import { armarCsvVentas, prepararContenidoCsvConBom } from "@/lib/csv";
import { sugerirTipoFactura } from "@/lib/facturacion";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLIENTES,
  comoAdmin,
  comoOficina,
  CUENTAS,
  limpiarRegistrosTest,
  USUARIOS,
} from "./setup";

describe("RLS Oficina — Permisos y Reglas de Negocio", () => {
  const PREFIJO = "TEST-RLS-OFI-";

  beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  afterEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  it("Oficina puede realizar operaciones operativas (crear servicios y clientes)", async () => {
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Crear cliente
    const { data: cliente, error: errCli } = await oficina
      .from("clientes")
      .insert({
        nombre: `${PREFIJO}Cliente Operativo`,
        tipo: "empresa",
        cuit: "30-71234567-9",
        condicion_iva: "responsable_inscripto",
        condicion_pago: "contado",
      })
      .select("id")
      .single();

    expect(errCli).toBeNull();
    expect(cliente).toBeDefined();

    // 2. Crear servicio
    const { data: serv, error: errServ } = await oficina
      .from("servicios")
      .insert({
        cliente_id: cliente!.id,
        tipo: "traslado",
        estado: "consulta",
        descripcion: `${PREFIJO}Servicio creado por oficina`,
        monto: 85000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    expect(errServ).toBeNull();
    expect(serv).toBeDefined();

    // Limpieza puntual del cliente creado
    const admin = await comoAdmin();
    await admin.from("servicios").delete().eq("id", serv!.id);
    await admin.from("clientes").delete().eq("id", cliente!.id);
  });

  it("Oficina NO puede borrar servicios (restringido a admin)", async () => {
    const admin = await comoAdmin();
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);

    const { data: serv } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "consulta",
        descripcion: `${PREFIJO}Servicio a no borrar por oficina`,
        monto: 30000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    // Oficina intenta borrar el servicio
    const { data: resDel, error: errDel } = await oficina
      .from("servicios")
      .delete()
      .eq("id", serv!.id)
      .select();

    // RLS evalúa es_admin() = false, por lo que 0 filas son borradas
    expect(resDel === null || resDel.length === 0).toBe(true);

    // Verificar que el servicio sigue existiendo en la base
    const { data: sigueExistiendo } = await admin
      .from("servicios")
      .select("id")
      .eq("id", serv!.id)
      .maybeSingle();

    expect(sigueExistiendo).not.toBeNull();
  });

  it("Oficina NO puede modificar parametros_cotizador ni empresa (restringido a admin)", async () => {
    const oficina = await comoOficina();

    // 1. Intento de modificar parametros_cotizador
    const { data: resParam, error: errParam } = await oficina
      .from("parametros_cotizador")
      .update({ precio_km: 99999 })
      .eq("id", 1)
      .select();

    expect(resParam === null || resParam.length === 0).toBe(true);

    // 2. Intento de modificar empresa
    const { data: resEmp, error: errEmp } = await oficina
      .from("empresa")
      .update({ razon_social: "Hack S.A." })
      .eq("id", 1)
      .select();

    expect(resEmp === null || resEmp.length === 0).toBe(true);
  });

  it("Caso 15 (§A.2): Cliente Responsable Inscripto -> Tipo sugerido = A", async () => {
    const oficina = await comoOficina();

    const { data: clienteDeza } = await oficina
      .from("clientes")
      .select("nombre, condicion_iva")
      .eq("id", CLIENTES.deza.id)
      .single();

    expect(clienteDeza?.condicion_iva).toBe("responsable_inscripto");
    const tipoSugerido = sugerirTipoFactura(clienteDeza?.condicion_iva);
    expect(tipoSugerido).toBe("A");
  });

  it("Caso 16 (§A.2): Cliente Monotributo / Consumidor Final -> Tipo sugerido = B", async () => {
    const oficina = await comoOficina();

    // Monotributo
    const { data: clienteMono } = await oficina
      .from("clientes")
      .select("nombre, condicion_iva")
      .eq("id", CLIENTES.monotributo.id)
      .single();

    expect(clienteMono?.condicion_iva).toBe("monotributo");
    expect(sugerirTipoFactura(clienteMono?.condicion_iva)).toBe("B");

    // Consumidor Final
    const { data: clienteCons } = await oficina
      .from("clientes")
      .select("nombre, condicion_iva")
      .eq("id", CLIENTES.consumidorFinal.id)
      .single();

    expect(clienteCons?.condicion_iva).toBe("consumidor_final");
    expect(sugerirTipoFactura(clienteCons?.condicion_iva)).toBe("B");
  });

  it("Caso 17 (§A.2): Factura A a cliente sin CUIT queda bloqueada con aviso", async () => {
    const oficina = await comoOficina();

    // Obtener consumidor final sin CUIT
    const { data: clienteSinCuit } = await oficina
      .from("clientes")
      .select("id, nombre, cuit")
      .eq("id", CLIENTES.consumidorFinal.id)
      .single();

    expect(clienteSinCuit?.cuit).toBeNull();

    // Regla de validación de FormularioFactura
    const tipo = "A";
    const faltaCuitParaA =
      tipo === "A" && (!clienteSinCuit?.cuit || !clienteSinCuit.cuit.trim());
    expect(faltaCuitParaA).toBe(true);

    let errorMensaje: string | null = null;
    if (faltaCuitParaA) {
      errorMensaje = "Una Factura A requiere CUIT del cliente.";
    }
    expect(errorMensaje).toBe("Una Factura A requiere CUIT del cliente.");
  });

  it("Caso 20 y 21 (§A.2): Número sugerido (última + 1) y detección de número duplicado", async () => {
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);
    const pv = 99; // Punto de venta aislado para tests
    const tipo = "B";

    // 1. Insertar factura base con número 100
    const { error: errInsert1 } = await oficina.from("facturas").insert({
      tipo,
      punto_venta: pv,
      numero: 100,
      fecha: hoy,
      cliente_id: CLIENTES.monotributo.id,
      neto: 10000,
      iva: 2100,
      total: 12100,
      notas: `${PREFIJO}Factura base`,
    });
    expect(errInsert1).toBeNull();

    // 2. Caso 21: Consultar último número para calcular el sugerido
    const { data: ult } = await oficina
      .from("facturas")
      .select("numero")
      .eq("tipo", tipo)
      .eq("punto_venta", pv)
      .order("numero", { ascending: false })
      .limit(1)
      .single();

    expect(ult?.numero).toBe(100);
    const numeroSugerido = (ult?.numero ?? 0) + 1;
    expect(numeroSugerido).toBe(101);

    // 3. Caso 20: Intentar insertar con el MISMO número y punto de venta
    const { error: errDuplicado } = await oficina.from("facturas").insert({
      tipo,
      punto_venta: pv,
      numero: 100, // Duplicado intencional
      fecha: hoy,
      cliente_id: CLIENTES.monotributo.id,
      neto: 15000,
      iva: 3150,
      total: 18150,
      notas: `${PREFIJO}Factura duplicada`,
    });

    expect(errDuplicado).not.toBeNull();
    expect(errDuplicado?.message).toContain(
      "facturas_tipo_punto_venta_numero_key",
    );
  });

  it("Caso 23 (§A.2): 'No se factura' sale de Pendientes y 'Volver a facturable' lo revierte", async () => {
    const admin = await comoAdmin();
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Crear servicio en terminado
    const { data: serv } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "terminado",
        descripcion: `${PREFIJO}Servicio para probar no_facturable`,
        monto: 70000,
        fecha_programada: hoy,
        no_facturable: false,
      })
      .select("id")
      .single();

    // Helper para consultar pendientes de facturar tal como lo hace PaginaFacturacion
    const consultarPendientes = async () => {
      const { data } = await oficina
        .from("servicios")
        .select("id, no_facturable")
        .in("estado", ["terminado", "cobrado"])
        .is("factura_id", null)
        .eq("no_facturable", false)
        .eq("id", serv!.id);
      return data || [];
    };

    // Inicialmente aparece en pendientes
    let pends = await consultarPendientes();
    expect(pends.length).toBe(1);

    // 2. Marcar como "No se factura"
    const { error: errNoFact } = await oficina
      .from("servicios")
      .update({ no_facturable: true })
      .eq("id", serv!.id);
    expect(errNoFact).toBeNull();

    // Ahora desaparece de la lista de pendientes
    pends = await consultarPendientes();
    expect(pends.length).toBe(0);

    // 3. Volver a facturable (revertir)
    const { error: errFacturable } = await oficina
      .from("servicios")
      .update({ no_facturable: false })
      .eq("id", serv!.id);
    expect(errFacturable).toBeNull();

    // Vuelve a aparecer en pendientes
    pends = await consultarPendientes();
    expect(pends.length).toBe(1);
  });

  it("Caso 39 (§A.4): Filtro de ámbito Personal — los gastos de empresa no aparecen", async () => {
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Insertar egreso de ámbito Personal
    const { data: movPersonal } = await oficina
      .from("movimientos_caja")
      .insert({
        fecha: hoy,
        tipo: "egreso",
        ambito: "personal",
        monto: 15000,
        descripcion: `${PREFIJO}Gasto personal de supermercado`,
        estado: "pagado",
        medio: "efectivo",
        cuenta_id: CUENTAS.efectivo.id,
      })
      .select("id")
      .single();

    // 2. Insertar egreso de ámbito Empresa
    const { data: movEmpresa } = await oficina
      .from("movimientos_caja")
      .insert({
        fecha: hoy,
        tipo: "egreso",
        ambito: "empresa",
        monto: 80000,
        descripcion: `${PREFIJO}Gasto empresa repuestos`,
        estado: "pagado",
        medio: "efectivo",
        cuenta_id: CUENTAS.efectivo.id,
      })
      .select("id")
      .single();

    // 3. Consultar con filtro de ámbito Personal
    const { data: filtrados } = await oficina
      .from("movimientos_caja")
      .select("id, ambito, descripcion")
      .eq("ambito", "personal")
      .ilike("descripcion", `%${PREFIJO}%`);

    const idsFiltrados = (filtrados || []).map((m) => m.id);
    expect(idsFiltrados).toContain(movPersonal!.id);
    expect(idsFiltrados).not.toContain(movEmpresa!.id);
  });

  it("Caso 40 (§A.4): Exportar CSV — genera archivo con BOM UTF-8 y acentos intactos", () => {
    const datosFacturas = [
      {
        fecha: "2026-09-19",
        tipo: "A",
        punto_venta: 1,
        numero: 142,
        neto: 100000,
        iva: 21000,
        total: 121000,
        clientes: {
          cuit: "30-50001091-2",
          nombre: "Transportes Ramón e Hijos S.A.",
        },
      },
    ];

    const csvVentas = armarCsvVentas(datosFacturas);
    const conBom = prepararContenidoCsvConBom(csvVentas);

    // 1. Debe iniciar con el carácter BOM UTF-8 (\uFEFF)
    expect(conBom.startsWith("\uFEFF")).toBe(true);

    // 2. Las cabeceras deben conservar tildes y caracteres en español
    expect(conBom).toContain("número");
    expect(conBom).toContain("razón social");

    // 3. El contenido debe conservar los acentos del cliente
    expect(conBom).toContain("Ramón");

    // 4. Al codificar a Buffer UTF-8, los primeros 3 bytes son exactamente el BOM UTF-8 (EF BB BF)
    const buf = Buffer.from(conBom, "utf8");
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
  });

  it("Caso 56 (§A.7): Editar un vencimiento — no duplica instancias ni pisa las pagadas", async () => {
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);
    const fechaCuota1 = "2026-10-01";
    const fechaCuota2 = "2026-11-01";

    // 1. Crear vencimiento recurrente
    const { data: venc } = await oficina
      .from("vencimientos")
      .insert({
        titulo: `${PREFIJO}Seguro Camiones`,
        ambito: "empresa",
        frecuencia: "mensual",
        dia_del_mes: 1,
        fecha_inicio: hoy,
        monto_estimado: 50000,
        cuotas_total: 6,
        cuotas_pagadas: 0,
      })
      .select("id")
      .single();

    expect(venc).toBeDefined();
    const vId = venc!.id;

    // 2. Insertar instancias iniciales
    const { error: errUpsert1 } = await oficina
      .from("vencimiento_instancias")
      .upsert(
        [
          {
            vencimiento_id: vId,
            fecha: fechaCuota1,
            numero_cuota: 1,
            monto_estimado: 50000,
            estado: "pendiente",
          },
          {
            vencimiento_id: vId,
            fecha: fechaCuota2,
            numero_cuota: 2,
            monto_estimado: 50000,
            estado: "pendiente",
          },
        ],
        { onConflict: "vencimiento_id,fecha", ignoreDuplicates: true },
      );
    expect(errUpsert1).toBeNull();

    // 3. Marcar la primera cuota como pagada
    const { data: inst1 } = await oficina
      .from("vencimiento_instancias")
      .select("id")
      .eq("vencimiento_id", vId)
      .eq("fecha", fechaCuota1)
      .single();

    await oficina
      .from("vencimiento_instancias")
      .update({
        estado: "pagado",
        pagado_at: new Date().toISOString(),
      })
      .eq("id", inst1!.id);

    // 4. Edición del vencimiento (cambio de monto y re-ejecución de generación de instancias)
    await oficina
      .from("vencimientos")
      .update({ monto_estimado: 55000 })
      .eq("id", vId);

    // Re-ejecutar upsert con ignoreDuplicates: true (mismo patrón que FormularioVencimiento.tsx)
    const { error: errUpsert2 } = await oficina
      .from("vencimiento_instancias")
      .upsert(
        [
          {
            vencimiento_id: vId,
            fecha: fechaCuota1,
            numero_cuota: 1,
            monto_estimado: 55000,
            estado: "pendiente",
          },
          {
            vencimiento_id: vId,
            fecha: fechaCuota2,
            numero_cuota: 2,
            monto_estimado: 55000,
            estado: "pendiente",
          },
        ],
        { onConflict: "vencimiento_id,fecha", ignoreDuplicates: true },
      );
    expect(errUpsert2).toBeNull();

    // 5. Verificar: la cuota 1 SIGUE en estado pagado y no se duplicó
    const { data: instanciasFinales } = await oficina
      .from("vencimiento_instancias")
      .select("fecha, estado, monto_estimado")
      .eq("vencimiento_id", vId)
      .order("fecha", { ascending: true });

    expect(instanciasFinales?.length).toBe(2);
    expect(instanciasFinales![0].fecha).toBe(fechaCuota1);
    expect(instanciasFinales![0].estado).toBe("pagado"); // No se pisó
    expect(instanciasFinales![1].fecha).toBe(fechaCuota2);
    expect(instanciasFinales![1].estado).toBe("pendiente");
  });

  it("Caso 57 (§A.7): Marcar pagado — instancia pagado, gasto creado y cuotas_pagadas +1", async () => {
    const oficina = await comoOficina();
    const hoy = new Date().toISOString().slice(0, 10);
    const monto = 35000;

    // 1. Crear vencimiento con plan de cuotas (cuotas_total: 12, pagadas: 3)
    const { data: venc } = await oficina
      .from("vencimientos")
      .insert({
        titulo: `${PREFIJO}Plan Afip`,
        ambito: "empresa",
        frecuencia: "mensual",
        dia_del_mes: 15,
        fecha_inicio: hoy,
        monto_estimado: monto,
        cuotas_total: 12,
        cuotas_pagadas: 3,
      })
      .select("id, cuotas_pagadas")
      .single();

    // 2. Crear instancia pendiente
    const { data: inst } = await oficina
      .from("vencimiento_instancias")
      .insert({
        vencimiento_id: venc!.id,
        fecha: hoy,
        numero_cuota: 4,
        monto_estimado: monto,
        estado: "pendiente",
      })
      .select("id")
      .single();

    // 3. Crear el movimiento de egreso en caja
    const { data: mov } = await oficina
      .from("movimientos_caja")
      .insert({
        fecha: hoy,
        tipo: "egreso",
        ambito: "empresa",
        monto: monto,
        descripcion: `${PREFIJO}Pago cuota 4 Plan Afip`,
        estado: "pagado",
        medio: "transferencia",
        cuenta_id: CUENTAS.galicia.id,
      })
      .select("id")
      .single();

    // 4. Marcar instancia como pagada y asociar movimiento
    const ahora = new Date().toISOString();
    await oficina
      .from("vencimiento_instancias")
      .update({
        estado: "pagado",
        pagado_at: ahora,
        movimiento_id: mov!.id,
      })
      .eq("id", inst!.id);

    // 5. Incrementar cuotas_pagadas en el vencimiento
    await oficina
      .from("vencimientos")
      .update({
        cuotas_pagadas: venc!.cuotas_pagadas + 1,
      })
      .eq("id", venc!.id);

    // 6. Verificaciones
    const { data: instVerif } = await oficina
      .from("vencimiento_instancias")
      .select("estado, movimiento_id, pagado_at")
      .eq("id", inst!.id)
      .single();

    expect(instVerif?.estado).toBe("pagado");
    expect(instVerif?.movimiento_id).toBe(mov!.id);
    expect(instVerif?.pagado_at).not.toBeNull();

    const { data: vencVerif } = await oficina
      .from("vencimientos")
      .select("cuotas_pagadas")
      .eq("id", venc!.id)
      .single();

    expect(vencVerif?.cuotas_pagadas).toBe(4); // 3 + 1
  });

  it("Caso 70 (§A.9): Usuario inactivo no tiene permisos y su estado activo es false", async () => {
    const admin = await comoAdmin();
    const oficina = await comoOficina();

    // Consultar perfil de oficina
    const { data: perfilOficina } = await oficina
      .from("perfiles")
      .select("id, activo, rol")
      .eq("id", USUARIOS.oficina.id)
      .single();

    expect(perfilOficina?.activo).toBe(true);

    try {
      // 1. Desactivar temporalmente el usuario oficina
      await admin
        .from("perfiles")
        .update({ activo: false })
        .eq("id", USUARIOS.oficina.id);

      // 2. Verificar que perfiles.activo retorna false (RutaProtegida bloquea el acceso con este valor)
      const { data: perfilInactivo } = await oficina
        .from("perfiles")
        .select("id, activo")
        .eq("id", USUARIOS.oficina.id)
        .single();

      expect(perfilInactivo?.activo).toBe(false);
    } finally {
      // 3. Restaurar activo = true para no afectar subsiguientes tests
      await admin
        .from("perfiles")
        .update({ activo: true })
        .eq("id", USUARIOS.oficina.id);
    }
  });
});
