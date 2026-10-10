import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";

export const herramientaEstadoMaquina: HerramientaAsistente = {
  nombre: "estado_maquina",
  descripcion:
    "Consulta el estado operativo y ubicación de las máquinas (autoelevadores, plataformas, zorras): disponible, en taller o alquilada (a quién, hasta cuándo y en qué dirección).",
  parametros: {
    type: "object",
    properties: {
      codigo: {
        type: "string",
        description:
          "Código interno o modelo de la máquina a consultar (ej: 'AE-01', 'Hyster')",
      },
      tipo: {
        type: "string",
        description:
          "Tipo de máquina ('autoelevador', 'plataforma', 'zorra', 'apilador', 'escalera', 'otro')",
      },
    },
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(
    ctx: ContextoHerramienta,
    args: { codigo?: string; tipo?: string },
  ) {
    let query = ctx.supabase
      .from("maquinas")
      .select("id, codigo_interno, tipo, marca, modelo, capacidad, estado, activo")
      .eq("activo", true)
      .order("codigo_interno", { ascending: true });

    if (args.codigo && args.codigo.trim() !== "") {
      query = query.ilike("codigo_interno", `%${args.codigo.trim()}%`);
    }

    if (args.tipo && args.tipo.trim() !== "") {
      query = query.eq("tipo", args.tipo.trim());
    }

    const { data: maquinas, error: errorMaquinas } = await query;

    if (errorMaquinas) {
      return {
        error: `Error al consultar máquinas: ${errorMaquinas.message}`,
      };
    }

    const lista = maquinas || [];
    if (lista.length === 0) {
      return {
        maquinas: [],
        resumen: "No se encontraron máquinas con los filtros indicados.",
      };
    }

    const maquinaIds = lista.map((m) => m.id);

    // Consultar servicios activos de alquiler para las máquinas alquiladas
    const { data: serviciosAlquiler, error: errorServicios } =
      await ctx.supabase
        .from("servicios")
        .select(
          "id, maquina_id, estado, direccion_trabajo, localidad_trabajo, " +
            "clientes!servicios_cliente_id_fkey(id, nombre), " +
            "alquileres(fecha_desde, fecha_hasta, unidad, cantidad)",
        )
        .in("maquina_id", maquinaIds)
        .in("estado", ["programado", "en_curso"]);

    if (errorServicios) {
      console.error(
        `[estado_maquina] Error al consultar servicios de alquiler: ${errorServicios.message}`,
      );
    }

    const mapaAlquileres = new Map<string, any>();
    if (serviciosAlquiler) {
      for (const s of serviciosAlquiler as any[]) {
        if (s.maquina_id) {
          mapaAlquileres.set(s.maquina_id, s);
        }
      }
    }

    const resultado = lista.map((m) => {
      const alqServ = mapaAlquileres.get(m.id);
      let detalleUbicacion = "";
      let clienteNombre: string | null = null;
      let fechaHasta: string | null = null;

      if (m.estado === "alquilada" && alqServ) {
        clienteNombre = alqServ.clientes?.nombre || "Cliente no especificado";
        const alqInfo = Array.isArray(alqServ.alquileres)
          ? alqServ.alquileres[0]
          : alqServ.alquileres;
        fechaHasta = alqInfo?.fecha_hasta || null;
        const dir = alqServ.direccion_trabajo
          ? ` en ${alqServ.direccion_trabajo}${alqServ.localidad_trabajo ? " (" + alqServ.localidad_trabajo + ")" : ""}`
          : "";
        const hastaTxt = fechaHasta ? ` hasta el ${fechaHasta}` : "";
        detalleUbicacion = `Alquilada a ${clienteNombre}${hastaTxt}${dir}`;
      } else if (m.estado === "taller") {
        detalleUbicacion = "En taller (mantenimiento / reparación)";
      } else if (m.estado === "disponible") {
        detalleUbicacion = "Disponible en galpón / base";
      } else {
        detalleUbicacion = `Estado: ${m.estado}`;
      }

      return {
        id: m.id,
        codigo_interno: m.codigo_interno,
        tipo: m.tipo,
        marca: m.marca || null,
        modelo: m.modelo || null,
        capacidad: m.capacidad || null,
        estado: m.estado,
        cliente_actual: clienteNombre,
        alquiler_hasta: fechaHasta,
        detalle_ubicacion: detalleUbicacion,
      };
    });

    const lineasResumen = resultado.map(
      (m) => `- ${m.codigo_interno || m.modelo} [${m.tipo}]: ${m.detalle_ubicacion}`,
    );
    const resumen = `Estado de máquinas (${resultado.length}):\n` + lineasResumen.join("\n");

    return {
      cantidad: resultado.length,
      maquinas: resultado,
      resumen,
    };
  },
};
