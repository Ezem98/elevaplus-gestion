import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";

function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

export const herramientaResumenCobranzas: HerramientaAsistente = {
  nombre: "resumen_cobranzas",
  descripcion:
    "Obtiene el resumen financiero de cobranzas: total adeudado a cobrar, cantidad de clientes con saldo deudor y el ranking de los 5 clientes con mayor deuda.",
  parametros: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta) {
    const { data: cuentas, error } = await ctx.supabase
      .from("cuenta_corriente")
      .select("cliente_id, nombre, saldo")
      .gt("saldo", 0)
      .order("saldo", { ascending: false });

    if (error) {
      return {
        error: `Error al consultar cobranzas: ${error.message}`,
      };
    }

    const lista = cuentas || [];
    const totalCobrar = lista.reduce((acum, c) => acum + Number(c.saldo || 0), 0);
    const top5 = lista.slice(0, 5).map((c) => ({
      cliente_id: c.cliente_id,
      nombre: c.nombre,
      saldo: Number(c.saldo),
      saldo_formateado: formatearMoneda(Number(c.saldo)),
    }));

    let resumen = "";
    if (lista.length === 0) {
      resumen = "No hay saldos pendientes de cobro. Todos los clientes están al día.";
    } else {
      const lineasTop = top5
        .map((c, i) => `${i + 1}. ${c.nombre}: ${c.saldo_formateado}`)
        .join("\n");
      resumen = `Total a cobrar: ${formatearMoneda(totalCobrar)} entre ${lista.length} cliente${lista.length === 1 ? "" : "s"}.\nMayores deudores:\n${lineasTop}`;
    }

    return {
      total_a_cobrar: totalCobrar,
      total_a_cobrar_formateado: formatearMoneda(totalCobrar),
      clientes_con_deuda_cantidad: lista.length,
      top_5: top5,
      resumen,
    };
  },
};

export const herramientaPendientesFacturar: HerramientaAsistente = {
  nombre: "pendientes_facturar",
  descripcion:
    "Lista servicios terminados o cobrados que aún no fueron facturados, indicando cantidad y monto agrupado por cliente.",
  parametros: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta) {
    const { data: servicios, error } = await ctx.supabase
      .from("servicios")
      .select(
        "id, numero, monto, fecha_programada, clientes!servicios_cliente_id_fkey(id, nombre)",
      )
      .in("estado", ["terminado", "cobrado"])
      .is("factura_id", null)
      .eq("no_facturable", false)
      .order("fecha_programada", { ascending: true });

    if (error) {
      return {
        error: `Error al consultar pendientes de facturar: ${error.message}`,
      };
    }

    const lista = servicios || [];
    const grupos: Record<
      string,
      { cliente_id: string; cliente_nombre: string; cantidad: number; monto_total: number }
    > = {};

    let montoGlobal = 0;

    for (const s of lista as any[]) {
      const cId = s.clientes?.id || "desconocido";
      const cNom = s.clientes?.nombre || "Sin cliente asignado";
      const m = Number(s.monto || 0);
      montoGlobal += m;

      if (!grupos[cId]) {
        grupos[cId] = {
          cliente_id: cId,
          cliente_nombre: cNom,
          cantidad: 0,
          monto_total: 0,
        };
      }
      grupos[cId].cantidad += 1;
      grupos[cId].monto_total += m;
    }

    const porCliente = Object.values(grupos).map((g) => ({
      cliente_id: g.cliente_id,
      cliente_nombre: g.cliente_nombre,
      cantidad_servicios: g.cantidad,
      monto_total: g.monto_total,
      monto_formateado: formatearMoneda(g.monto_total),
    }));

    let resumen = "";
    if (lista.length === 0) {
      resumen = "No hay servicios terminados o cobrados pendientes de facturar.";
    } else {
      const detalle = porCliente
        .map((c) => `- ${c.cliente_nombre}: ${c.cantidad_servicios} servicio(s) por ${c.monto_formateado}`)
        .join("\n");
      resumen = `Hay ${lista.length} servicios pendientes de facturar por un total de ${formatearMoneda(montoGlobal)}:\n${detalle}`;
    }

    return {
      total_servicios_pendientes: lista.length,
      monto_total_global: montoGlobal,
      monto_total_formateado: formatearMoneda(montoGlobal),
      por_cliente: porCliente,
      resumen,
    };
  },
};
