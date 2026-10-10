import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";

function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

export const herramientaBuscarCliente: HerramientaAsistente = {
  nombre: "buscar_cliente",
  descripcion:
    "Busca clientes activos por nombre parcial. Devuelve hasta 5 coincidencias con id, nombre y saldo actual para que el modelo pueda identificar al cliente o consultar en caso de ambigüedad.",
  parametros: {
    type: "object",
    properties: {
      nombre: {
        type: "string",
        description: "Nombre o fragmento del nombre del cliente a buscar",
      },
    },
    required: ["nombre"],
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta, args: { nombre: string }) {
    if (!args.nombre || args.nombre.trim() === "") {
      return {
        coincidencias: [],
        resumen: "Debe indicar un nombre de cliente para buscar.",
      };
    }

    const termino = args.nombre.trim();

    // 1. Buscar coincidencias en la tabla clientes
    const { data: clientes, error: errorClientes } = await ctx.supabase
      .from("clientes")
      .select("id, nombre, cuit, telefono, direccion, localidad")
      .eq("activo", true)
      .ilike("nombre", `%${termino}%`)
      .order("nombre", { ascending: true })
      .limit(5);

    if (errorClientes) {
      return {
        error: `Error al buscar clientes: ${errorClientes.message}`,
      };
    }

    if (!clientes || clientes.length === 0) {
      return {
        coincidencias: [],
        resumen: `No se encontraron clientes que coincidan con "${termino}".`,
      };
    }

    // 2. Obtener saldos de la vista cuenta_corriente para los clientes encontrados
    const ids = clientes.map((c) => c.id);
    const { data: cuentas, error: errorCuentas } = await ctx.supabase
      .from("cuenta_corriente")
      .select("cliente_id, saldo")
      .in("cliente_id", ids);

    if (errorCuentas) {
      // Registrar pero continuar mostrando clientes con saldo 0
      console.error(
        `[buscar_cliente] Error al consultar cuenta_corriente: ${errorCuentas.message}`,
      );
    }

    const mapaSaldos = new Map<string, number>();
    if (cuentas) {
      for (const row of cuentas) {
        mapaSaldos.set(row.cliente_id, Number(row.saldo || 0));
      }
    }

    const coincidencias = clientes.map((c) => {
      const saldoNum = mapaSaldos.get(c.id) ?? 0;
      return {
        id: c.id,
        nombre: c.nombre,
        cuit: c.cuit || null,
        telefono: c.telefono || null,
        localidad: c.localidad || null,
        saldo: saldoNum,
        saldo_formateado: formatearMoneda(saldoNum),
      };
    });

    let resumen = "";
    if (coincidencias.length === 1) {
      const c = coincidencias[0];
      resumen = `Encontré a ${c.nombre} (saldo: ${c.saldo_formateado}).`;
    } else {
      const nombres = coincidencias
        .map((c) => `${c.nombre} (${c.saldo_formateado})`)
        .join(", ");
      resumen = `Encontré ${coincidencias.length} clientes: ${nombres}.`;
    }

    return {
      coincidencias,
      total_encontrados: coincidencias.length,
      resumen,
    };
  },
};

export const herramientaSaldoCliente: HerramientaAsistente = {
  nombre: "saldo_cliente",
  descripcion:
    "Consulta el estado de cuenta y deuda de un cliente específico: saldo total, servicios impagos, fecha del más viejo y si tiene facturas pendientes.",
  parametros: {
    type: "object",
    properties: {
      cliente_id: {
        type: "string",
        description: "UUID del cliente",
      },
    },
    required: ["cliente_id"],
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta, args: { cliente_id: string }) {
    if (!args.cliente_id) {
      return { error: "Debe indicar el cliente_id." };
    }

    // 1. Obtener datos del cliente
    const { data: cliente, error: errorCliente } = await ctx.supabase
      .from("clientes")
      .select("id, nombre")
      .eq("id", args.cliente_id)
      .single();

    if (errorCliente) {
      return {
        error: `Error al consultar cliente: ${errorCliente.message}`,
      };
    }

    if (!cliente) {
      return { error: "Cliente no encontrado." };
    }

    // 2. Consultar cuenta corriente
    const { data: cuenta, error: errorCuenta } = await ctx.supabase
      .from("cuenta_corriente")
      .select("saldo, total_servicios, total_cobrado")
      .eq("cliente_id", args.cliente_id)
      .maybeSingle();

    if (errorCuenta) {
      return {
        error: `Error al consultar saldo en cuenta corriente: ${errorCuenta.message}`,
      };
    }

    const saldo = Number(cuenta?.saldo || 0);
    const totalFacturado = Number(cuenta?.total_servicios || 0);
    const totalCobrado = Number(cuenta?.total_cobrado || 0);

    // 3. Consultar servicios impagos
    const { data: impagos, error: errorImpagos } = await ctx.supabase
      .from("servicios")
      .select("id, numero, fecha_programada, monto, monto_cobrado, estado")
      .eq("cliente_id", args.cliente_id)
      .not("estado", "in", '("consulta","presupuestado","cancelado","cobrado")')
      .order("fecha_programada", { ascending: true, nullsFirst: false });

    if (errorImpagos) {
      return {
        error: `Error al consultar servicios impagos: ${errorImpagos.message}`,
      };
    }

    const serviciosImpagos = impagos || [];
    const cantidadImpagos = serviciosImpagos.length;
    const fechaMasViejo = serviciosImpagos[0]?.fecha_programada || null;

    // 4. Consultar facturas emitidas pendientes de cobro
    const { data: facturasPend, error: errorFacturas } = await ctx.supabase
      .from("servicios")
      .select("factura_id")
      .eq("cliente_id", args.cliente_id)
      .not("factura_id", "is", null)
      .not("estado", "in", '("cobrado","cancelado")')
      .limit(1);

    if (errorFacturas) {
      console.error(
        `[saldo_cliente] Error al consultar facturas pendientes: ${errorFacturas.message}`,
      );
    }

    const tieneFacturasPendientes = Boolean(
      facturasPend && facturasPend.length > 0,
    );

    let resumen = "";
    if (saldo <= 0) {
      resumen = `${cliente.nombre} no tiene deuda pendiente. Saldo al día.`;
    } else {
      const detalleFecha = fechaMasViejo
        ? `, el más viejo es del ${fechaMasViejo}`
        : "";
      resumen = `${cliente.nombre} debe ${formatearMoneda(saldo)} en ${cantidadImpagos} servicio${cantidadImpagos === 1 ? "" : "s"}${detalleFecha}.`;
      if (tieneFacturasPendientes) {
        resumen += " Tiene facturas emitidas pendientes de cobro.";
      }
    }

    return {
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre,
      saldo,
      saldo_formateado: formatearMoneda(saldo),
      total_facturado: totalFacturado,
      total_cobrado: totalCobrado,
      cantidad_servicios_impagos: cantidadImpagos,
      fecha_servicio_mas_viejo: fechaMasViejo,
      tiene_facturas_pendientes: tieneFacturasPendientes,
      resumen,
    };
  },
};
