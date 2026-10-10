import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";
import { resolverFechaLogica } from "./resolverFecha";

export const herramientaChoferesDisponibles: HerramientaAsistente = {
  nombre: "choferes_disponibles",
  descripcion:
    "Consulta la disponibilidad de choferes para una fecha específica (hoy, mañana o YYYY-MM-DD), detallando servicios asignados y novedades activas (vacaciones, ausencias, médico, franco).",
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

    // 1. Obtener choferes activos
    const { data: choferes, error: errorChoferes } = await ctx.supabase
      .from("perfiles")
      .select("id, nombre, telefono")
      .eq("rol", "chofer")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (errorChoferes) {
      return {
        error: `Error al consultar choferes: ${errorChoferes.message}`,
      };
    }

    const listaChoferes = choferes || [];
    if (listaChoferes.length === 0) {
      return {
        fecha: fechaISO,
        choferes: [],
        resumen: "No hay choferes activos registrados en el sistema.",
      };
    }

    const choferIds = listaChoferes.map((c) => c.id);

    // 2. Consultar novedades del día
    // Una novedad aplica si fecha <= fechaISO y (fecha_hasta is null o fecha_hasta >= fechaISO)
    const { data: novedades, error: errorNovedades } = await ctx.supabase
      .from("novedades_empleado")
      .select("id, empleado_id, tipo, fecha, fecha_hasta, notas")
      .in("empleado_id", choferIds)
      .lte("fecha", fechaISO);

    if (errorNovedades) {
      console.error(
        `[choferes_disponibles] Error al consultar novedades: ${errorNovedades.message}`,
      );
    }

    const mapaNovedades = new Map<string, any[]>();
    for (const nov of novedades || []) {
      const hasta = nov.fecha_hasta || nov.fecha;
      if (hasta >= fechaISO) {
        if (!mapaNovedades.has(nov.empleado_id)) {
          mapaNovedades.set(nov.empleado_id, []);
        }
        mapaNovedades.get(nov.empleado_id)!.push(nov);
      }
    }

    // 3. Consultar servicios del día asignados a choferes
    const { data: servicios, error: errorServicios } = await ctx.supabase
      .from("servicios")
      .select(
        "id, numero, tipo, estado, hora_programada, origen, destino, direccion_trabajo, localidad_trabajo, " +
          "clientes!servicios_cliente_id_fkey(id, nombre), " +
          "servicio_choferes(chofer_id)",
      )
      .eq("fecha_programada", fechaISO)
      .in("estado", ["programado", "en_curso", "terminado"]);

    if (errorServicios) {
      console.error(
        `[choferes_disponibles] Error al consultar servicios: ${errorServicios.message}`,
      );
    }

    const mapaServiciosChofer = new Map<string, any[]>();
    for (const s of (servicios || []) as any[]) {
      for (const sc of s.servicio_choferes || []) {
        if (sc.chofer_id) {
          if (!mapaServiciosChofer.has(sc.chofer_id)) {
            mapaServiciosChofer.set(sc.chofer_id, []);
          }
          mapaServiciosChofer.get(sc.chofer_id)!.push({
            id: s.id,
            numero: s.numero,
            hora: s.hora_programada ? s.hora_programada.slice(0, 5) : null,
            tipo: s.tipo,
            estado: s.estado,
            cliente: s.clientes?.nombre || "Sin cliente",
          });
        }
      }
    }

    // 4. Consolidar estado por chofer
    const resultado = listaChoferes.map((c) => {
      const novs = mapaNovedades.get(c.id) || [];
      const servs = mapaServiciosChofer.get(c.id) || [];
      const tieneNovedadBloqueante = novs.some((n) =>
        ["ausente", "vacaciones", "medico", "licencia", "franco"].includes(n.tipo),
      );
      const disponible = !tieneNovedadBloqueante && servs.length === 0;

      let estadoTexto = "";
      if (tieneNovedadBloqueante) {
        const motivos = novs.map((n) => n.tipo).join(", ");
        estadoTexto = `No disponible (${motivos})`;
      } else if (servs.length > 0) {
        estadoTexto = `Con ${servs.length} servicio(s) asignado(s)`;
      } else {
        estadoTexto = "Disponible (libre sin servicios)";
      }

      return {
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono || null,
        disponible,
        estado_texto: estadoTexto,
        novedades: novs.map((n) => ({
          tipo: n.tipo,
          notas: n.notas || null,
        })),
        servicios_asignados: servs,
      };
    });

    const lineasResumen = resultado.map(
      (c) => `- ${c.nombre}: ${c.estado_texto}`,
    );
    const resumen = `Disponibilidad de choferes para el ${fechaISO}:\n` + lineasResumen.join("\n");

    return {
      fecha: fechaISO,
      choferes: resultado,
      resumen,
    };
  },
};
