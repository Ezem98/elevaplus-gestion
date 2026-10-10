import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";
import { resolverFechaLogica } from "./resolverFecha";

function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

export const herramientaServiciosDelDia: HerramientaAsistente = {
  nombre: "servicios_del_dia",
  descripcion:
    "Lista los servicios programados, en curso o terminados para una fecha específica (hoy, mañana o YYYY-MM-DD), indicando hora, cliente, tipo, recorrido, chofer y estado.",
  parametros: {
    type: "object",
    properties: {
      fecha: {
        type: "string",
        description:
          "Fecha a consultar (ej: 'hoy', 'mañana', 'el jueves', '2026-10-15')",
      },
    },
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta, args: { fecha?: string }) {
    let fechaISO = ctx.hoy;
    if (args.fecha && args.fecha.trim() !== "") {
      const resFecha = resolverFechaLogica(args.fecha, ctx.hoy);
      if (resFecha.ambiguo || !resFecha.fecha) {
        return {
          error:
            resFecha.motivo ||
            `No se pudo interpretar la fecha "${args.fecha}".`,
        };
      }
      fechaISO = resFecha.fecha;
    }

    const { data: servicios, error } = await ctx.supabase
      .from("servicios")
      .select(
        "id, numero, tipo, estado, hora_programada, origen, destino, descripcion, direccion_trabajo, localidad_trabajo, km, " +
          "clientes!servicios_cliente_id_fkey(id, nombre), " +
          "vehiculos!servicios_vehiculo_id_fkey(id, nombre), " +
          "maquinas!servicios_maquina_id_fkey(id, codigo_interno), " +
          "servicio_choferes(chofer:perfiles!servicio_choferes_chofer_id_fkey(id, nombre))",
      )
      .eq("fecha_programada", fechaISO)
      .not("estado", "in", '("consulta","cancelado")')
      .order("hora_programada", { ascending: true, nullsFirst: false });

    if (error) {
      return {
        error: `Error al consultar servicios del día: ${error.message}`,
      };
    }

    const lista = (servicios || []).map((s: any) => {
      const clienteNombre = s.clientes?.nombre || "Sin cliente";
      const choferes = (s.servicio_choferes || [])
        .map((sc: any) => sc.chofer?.nombre)
        .filter(Boolean)
        .join(", ");

      let recorrido = "";
      if (s.origen || s.destino) {
        recorrido = `${s.origen || "?"} → ${s.destino || "?"}`;
      } else if (s.direccion_trabajo) {
        recorrido = `${s.direccion_trabajo}${s.localidad_trabajo ? " (" + s.localidad_trabajo + ")" : ""}`;
      }

      return {
        id: s.id,
        numero: s.numero,
        hora: s.hora_programada ? s.hora_programada.slice(0, 5) : "Sin hora",
        cliente: clienteNombre,
        tipo: s.tipo,
        estado: s.estado,
        recorrido: recorrido || null,
        chofer: choferes || "Sin chofer",
        vehiculo: s.vehiculos?.nombre || null,
        maquina: s.maquinas?.codigo_interno || null,
        descripcion: s.descripcion || null,
      };
    });

    let resumen = "";
    if (lista.length === 0) {
      resumen = `No hay servicios programados para el ${fechaISO}.`;
    } else {
      const lineas = lista.map((s) => {
        const parteChofer = s.chofer !== "Sin chofer" ? ` (${s.chofer})` : "";
        const parteRecorrido = s.recorrido ? ` — ${s.recorrido}` : "";
        return `${s.hora} · #${s.numero} ${s.cliente} [${s.tipo}]${parteRecorrido}${parteChofer} · ${s.estado}`;
      });
      resumen = `Para el ${fechaISO} hay ${lista.length} servicio${lista.length === 1 ? "" : "s"}:\n` + lineas.join("\n");
    }

    return {
      fecha: fechaISO,
      cantidad: lista.length,
      servicios: lista,
      resumen,
    };
  },
};

export const herramientaServiciosSinCerrar: HerramientaAsistente = {
  nombre: "servicios_sin_cerrar",
  descripcion:
    "Lista servicios que quedaron en estado 'programado' o 'en_curso' con fecha anterior a hoy (servicios que requieren cierre operativo).",
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
        "id, numero, tipo, estado, fecha_programada, hora_programada, origen, destino, direccion_trabajo, localidad_trabajo, " +
          "clientes!servicios_cliente_id_fkey(id, nombre), " +
          "servicio_choferes(chofer:perfiles!servicio_choferes_chofer_id_fkey(id, nombre))",
      )
      .in("estado", ["programado", "en_curso"])
      .lt("fecha_programada", ctx.hoy)
      .order("fecha_programada", { ascending: false });

    if (error) {
      return {
        error: `Error al consultar servicios sin cerrar: ${error.message}`,
      };
    }

    const lista = (servicios || []).map((s: any) => {
      const choferes = (s.servicio_choferes || [])
        .map((sc: any) => sc.chofer?.nombre)
        .filter(Boolean)
        .join(", ");

      return {
        id: s.id,
        numero: s.numero,
        fecha: s.fecha_programada,
        hora: s.hora_programada ? s.hora_programada.slice(0, 5) : null,
        cliente: s.clientes?.nombre || "Sin cliente",
        tipo: s.tipo,
        estado: s.estado,
        chofer: choferes || "Sin chofer",
      };
    });

    let resumen = "";
    if (lista.length === 0) {
      resumen = "No hay servicios anteriores pendientes de cierre.";
    } else {
      const detalle = lista
        .map(
          (s) =>
            `#${s.numero} ${s.cliente} (${s.fecha}, ${s.tipo}) [${s.estado}, chofer: ${s.chofer}]`,
        )
        .join("\n");
      resumen = `Hay ${lista.length} servicio${lista.length === 1 ? "" : "s"} sin cerrar:\n` + detalle;
    }

    return {
      cantidad: lista.length,
      servicios: lista,
      resumen,
    };
  },
};

export const herramientaBuscarServicio: HerramientaAsistente = {
  nombre: "buscar_servicio",
  descripcion:
    "Obtiene el detalle completo de un servicio puntual a partir de su número identificador (#123) o por cliente y fecha.",
  parametros: {
    type: "object",
    properties: {
      numero: {
        type: "number",
        description: "Número del servicio (ej: 1087)",
      },
      cliente: {
        type: "string",
        description: "Nombre o fragmento del cliente si no se tiene el número",
      },
      fecha: {
        type: "string",
        description: "Fecha aproximada o exacta del servicio (YYYY-MM-DD)",
      },
    },
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(
    ctx: ContextoHerramienta,
    args: { numero?: number; cliente?: string; fecha?: string },
  ) {
    if (!args.numero && !args.cliente) {
      return {
        error: "Debe indicar al menos el número de servicio o el nombre del cliente.",
      };
    }

    let query = ctx.supabase
      .from("servicios")
      .select(
        "id, numero, tipo, estado, fecha_programada, hora_programada, origen, destino, km, ida_y_vuelta, nocturno, monto, monto_cobrado, moneda, descripcion, direccion_trabajo, localidad_trabajo, trabajo_a_realizar, " +
          "clientes!servicios_cliente_id_fkey(id, nombre, telefono), " +
          "vehiculos!servicios_vehiculo_id_fkey(id, nombre, patente), " +
          "maquinas!servicios_maquina_id_fkey(id, codigo_interno, modelo), " +
          "servicio_choferes(chofer:perfiles!servicio_choferes_chofer_id_fkey(id, nombre)), " +
          "paradas(orden, direccion, localidad, carga, estado), " +
          "alquileres(fecha_desde, fecha_hasta, unidad, cantidad, precio_unidad)",
      );

    if (args.numero) {
      query = query.eq("numero", args.numero);
    } else {
      if (args.fecha) {
        const resFecha = resolverFechaLogica(args.fecha, ctx.hoy);
        if (resFecha.fecha) {
          query = query.eq("fecha_programada", resFecha.fecha);
        }
      }
      query = query
        .order("created_at", { ascending: false })
        .limit(5);
    }

    const { data: servicios, error } = await query;

    if (error) {
      return {
        error: `Error al buscar servicio: ${error.message}`,
      };
    }

    const listaServicios = (servicios as any[]) || [];

    if (listaServicios.length === 0) {
      return {
        servicio: null,
        resumen: args.numero
          ? `No se encontró ningún servicio #${args.numero}.`
          : "No se encontró ningún servicio con los criterios indicados.",
      };
    }

    // Si buscamos por cliente sin número, filtrar por nombre
    let encontrado: any = listaServicios[0];
    if (args.cliente && !args.numero) {
      const termino = args.cliente.toLowerCase();
      const match = listaServicios.find((s: any) =>
        s.clientes?.nombre?.toLowerCase().includes(termino),
      );
      if (match) encontrado = match;
    }

    const choferes = (encontrado.servicio_choferes || [])
      .map((sc: any) => sc.chofer?.nombre)
      .filter(Boolean)
      .join(", ");

    const montoFormateado = encontrado.monto != null ? formatearMoneda(Number(encontrado.monto)) : null;

    const resumen = `Servicio #${encontrado.numero} · ${encontrado.clientes?.nombre || "Sin cliente"}
Tipo: ${encontrado.tipo} · Estado: ${encontrado.estado}
Fecha: ${encontrado.fecha_programada || "Sin fecha"}${encontrado.hora_programada ? " a las " + encontrado.hora_programada.slice(0, 5) : ""}
Chofer: ${choferes || "Sin asignar"}
${encontrado.vehiculos?.nombre ? "Vehículo: " + encontrado.vehiculos.nombre : ""}
${encontrado.maquinas?.codigo_interno ? "Máquina: " + encontrado.maquinas.codigo_interno : ""}
${montoFormateado ? "Monto: " + montoFormateado : ""}`.trim();

    return {
      servicio: encontrado,
      resumen,
    };
  },
};
