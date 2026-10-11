import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";
import { resolverFechaLogica } from "./resolverFecha";

export type EstadoServicio =
  | "consulta"
  | "presupuestado"
  | "aceptado"
  | "programado"
  | "en_curso"
  | "terminado"
  | "cobrado"
  | "facturado"
  | "cancelado";

/**
 * Matriz de transiciones de estado de un servicio.
 * Refleja exactamente la lógica de validación de public.cambiar_estado en
 * supabase/migrations/20261007000036_revocar_execute_anon.sql (líneas 47-64).
 */
export const MATRIZ_TRANSICIONES_CAMBIAR_ESTADO = {
  // nuevo = 'cancelado' -> permitido para admin y oficina desde cualquier estado
  cancelado: [
    "consulta",
    "presupuestado",
    "aceptado",
    "programado",
    "en_curso",
    "terminado",
    "cobrado",
    "facturado",
  ],
  // s.estado = 'consulta' y nuevo = 'presupuestado' -> permitido admin y oficina
  presupuestado: ["consulta"],
  // s.estado = 'presupuestado' y nuevo = 'aceptado' -> permitido admin y oficina
  aceptado: ["presupuestado"],
  // s.estado in ('aceptado', 'consulta', 'presupuestado') y nuevo = 'programado' -> permitido admin y oficina
  programado: ["aceptado", "consulta", "presupuestado"],
  // s.estado = 'programado' y nuevo = 'en_curso' -> permitido admin y oficina (o chofer asignado)
  en_curso: ["programado"],
  // s.estado in ('programado', 'en_curso') y nuevo = 'terminado' -> permitido admin y oficina (o chofer asignado)
  terminado: ["programado", "en_curso"],
  // s.estado in ('terminado', 'cobrado') y nuevo = 'facturado' -> permitido admin y oficina
  facturado: ["terminado", "cobrado"],
} as const;

export function esTransicionValida(
  estadoActual: EstadoServicio,
  nuevoEstado: EstadoServicio,
  rol: "admin" | "oficina",
): boolean {
  if (estadoActual === nuevoEstado) {
    return false;
  }

  if (rol === "admin") {
    // En cambiar_estado: "elsif rol = 'admin' then permitido := true;"
    return true;
  }

  if (nuevoEstado === "cancelado") {
    return true;
  }

  const origenesPermitidos =
    MATRIZ_TRANSICIONES_CAMBIAR_ESTADO[
      nuevoEstado as keyof typeof MATRIZ_TRANSICIONES_CAMBIAR_ESTADO
    ];

  if (
    origenesPermitidos &&
    (origenesPermitidos as readonly string[]).includes(estadoActual)
  ) {
    return true;
  }

  return false;
}

export function normalizarEstadoDestino(texto: string): EstadoServicio | null {
  const t = texto.trim().toLowerCase();
  if (
    t === "terminado" ||
    t === "termino" ||
    t === "terminó" ||
    t === "finalizado" ||
    t === "completado" ||
    t === "terminar" ||
    t === "cerrar" ||
    t === "finalizar"
  ) {
    return "terminado";
  }
  if (
    t === "cancelado" ||
    t === "cancela" ||
    t === "cancelá" ||
    t === "cancelar" ||
    t === "anular" ||
    t === "anulado"
  ) {
    return "cancelado";
  }
  if (
    t === "en_curso" ||
    t === "en curso" ||
    t === "iniciado" ||
    t === "iniciar" ||
    t === "arrancó" ||
    t === "arranco" ||
    t === "en viaje"
  ) {
    return "en_curso";
  }
  if (
    t === "programado" ||
    t === "programar" ||
    t === "agendado" ||
    t === "agendar"
  ) {
    return "programado";
  }
  if (t === "presupuestado" || t === "presupuestar") {
    return "presupuestado";
  }
  if (
    t === "aceptado" ||
    t === "aceptar" ||
    t === "confirmado" ||
    t === "aprobar"
  ) {
    return "aceptado";
  }
  if (t === "facturado" || t === "facturar") {
    return "facturado";
  }
  if (t === "cobrado" || t === "cobrar") {
    return "cobrado";
  }
  if (t === "consulta") {
    return "consulta";
  }
  return null;
}

function capitalizarEstado(estado: string): string {
  const mapeo: Record<string, string> = {
    consulta: "Consulta",
    presupuestado: "Presupuestado",
    aceptado: "Aceptado",
    programado: "Programado",
    en_curso: "En curso",
    terminado: "Terminado",
    cobrado: "Cobrado",
    facturado: "Facturado",
    cancelado: "Cancelado",
  };
  return mapeo[estado] || estado;
}

function formatearFechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "Sin fecha";
  const partes = fecha.split("-");
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}`;
  }
  return fecha;
}

export interface EntradaProponerCambioEstado {
  numero?: number | string;
  cliente?: string;
  fecha?: string;
  descripcion?: string;
  referencia?: string;
  nuevo_estado: string;
  nota?: string;
}

export const herramientaProponerCambioEstado: HerramientaAsistente = {
  nombre: "proponer_cambio_estado",
  descripcion:
    "Busca un servicio existente por número, cliente, fecha o descripción, valida la transición de estado requerida según las reglas de negocio y genera una propuesta de cambio de estado para confirmación del usuario.",
  parametros: {
    type: "object",
    properties: {
      numero: {
        type: "number",
        description: "Número del servicio si se conoce (ej: 1087)",
      },
      cliente: {
        type: "string",
        description: "Nombre o fragmento del cliente del servicio",
      },
      fecha: {
        type: "string",
        description:
          "Fecha del servicio (ej: 'hoy', 'mañana', 'YYYY-MM-DD')",
      },
      descripcion: {
        type: "string",
        description:
          "Descripción, origen o destino del servicio si no hay número",
      },
      referencia: {
        type: "string",
        description:
          "Referencia libre al servicio si viene todo junto (ej: '#1087', 'el de Deza de hoy')",
      },
      nuevo_estado: {
        type: "string",
        description:
          "Estado destino en lenguaje natural (ej: 'terminó', 'cancelado', 'en curso', 'programado')",
      },
      nota: {
        type: "string",
        description: "Nota o motivo opcional del cambio de estado",
      },
    },
    required: ["nuevo_estado"],
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(
    ctx: ContextoHerramienta,
    args: EntradaProponerCambioEstado,
  ) {
    const nuevoEstado = normalizarEstadoDestino(args.nuevo_estado || "");
    if (!nuevoEstado) {
      return {
        error: `Estado destino no reconocido: "${args.nuevo_estado}".`,
      };
    }

    // 1. Extraer número de servicio si viene explícito o en la referencia
    let numeroBuscado: number | null = null;
    if (args.numero != null && String(args.numero).trim() !== "") {
      const n = Number(String(args.numero).replace(/\D/g, ""));
      if (!Number.isNaN(n) && n > 0) numeroBuscado = n;
    } else if (args.referencia) {
      const matchNum = args.referencia.match(/#?(\d+)/);
      if (matchNum) {
        const n = Number(matchNum[1]);
        if (!Number.isNaN(n) && n > 0) numeroBuscado = n;
      }
    }

    let candidatos: any[] = [];

    if (numeroBuscado) {
      const { data: servicios, error } = await ctx.supabase
        .from("servicios")
        .select(
          "id, numero, tipo, estado, fecha_programada, hora_programada, origen, destino, descripcion, " +
            "clientes!servicios_cliente_id_fkey(id, nombre)",
        )
        .eq("numero", numeroBuscado);

      if (error) {
        return {
          error: `Error al buscar servicio #${numeroBuscado}: ${error.message}`,
        };
      }
      candidatos = servicios || [];
    } else {
      // 2. Búsqueda por cliente, fecha y/o descripción
      let fechaISO: string | null = null;
      let textoFecha = args.fecha;

      if (!textoFecha && args.referencia) {
        const refLower = args.referencia.toLowerCase();
        if (refLower.includes("hoy") || refLower.includes("de hoy")) {
          textoFecha = "hoy";
        } else if (
          refLower.includes("mañana") ||
          refLower.includes("manana")
        ) {
          textoFecha = "mañana";
        }
      }

      if (textoFecha && textoFecha.trim() !== "") {
        const resFecha = resolverFechaLogica(textoFecha, ctx.hoy);
        if (resFecha.fecha) {
          fechaISO = resFecha.fecha;
        }
      }

      let query = ctx.supabase
        .from("servicios")
        .select(
          "id, numero, tipo, estado, fecha_programada, hora_programada, origen, destino, descripcion, " +
            "clientes!servicios_cliente_id_fkey(id, nombre)",
        );

      if (fechaISO) {
        query = query.eq("fecha_programada", fechaISO);
      }

      const { data: servicios, error } = await query
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) {
        return {
          error: `Error al buscar servicios: ${error.message}`,
        };
      }

      const lista = (servicios as any[]) || [];

      // Filtrado en memoria
      const clienteTerm = args.cliente
        ? args.cliente.trim().toLowerCase()
        : null;
      const descTerm = args.descripcion
        ? args.descripcion.trim().toLowerCase()
        : null;

      candidatos = lista.filter((s) => {
        if (clienteTerm) {
          const nombreCliente = s.clientes?.nombre?.toLowerCase() || "";
          if (!nombreCliente.includes(clienteTerm)) return false;
        }
        if (descTerm) {
          const desc = s.descripcion?.toLowerCase() || "";
          const orig = s.origen?.toLowerCase() || "";
          const dest = s.destino?.toLowerCase() || "";
          if (
            !desc.includes(descTerm) &&
            !orig.includes(descTerm) &&
            !dest.includes(descTerm)
          ) {
            return false;
          }
        }
        return true;
      });
    }

    // 3. Evaluar resultados de la búsqueda
    if (candidatos.length === 0) {
      return {
        no_encontrado: true,
        motivo: "No se encontró ningún servicio que coincida con la búsqueda.",
      };
    }

    if (candidatos.length > 1) {
      return {
        ambiguos: candidatos.map((s) => ({
          id: s.id,
          numero: s.numero,
          cliente: s.clientes?.nombre || "Sin cliente",
          fecha: s.fecha_programada,
          hora: s.hora_programada,
          estado: s.estado,
          tipo: s.tipo,
          resumen: `Servicio #${s.numero} · ${s.clientes?.nombre || "Sin cliente"} · ${formatearFechaCorta(s.fecha_programada)} (${capitalizarEstado(s.estado)})`,
        })),
        mensaje: `Se encontraron ${candidatos.length} servicios candidatos. ¿A cuál te referís?`,
      };
    }

    // 4. Candidato único
    const servicio = candidatos[0];
    const estadoActual = servicio.estado as EstadoServicio;
    const clienteNombre = servicio.clientes?.nombre || "Sin cliente";
    const fechaCorta = formatearFechaCorta(servicio.fecha_programada);

    // 5. Validar transición de estado
    if (!esTransicionValida(estadoActual, nuevoEstado, ctx.rol)) {
      return {
        transicion_invalida: true,
        error: `Transición no permitida: un servicio en estado "${estadoActual}" no puede pasar a "${nuevoEstado}" con rol ${ctx.rol}.`,
        estado_actual: estadoActual,
        nuevo_estado: nuevoEstado,
      };
    }

    // 6. Construir resumen para la tarjeta y proposal
    // Formato requerido: "Servicio #1087 · Deza · 11/10: Programado → Terminado"
    const resumen = `Servicio #${servicio.numero} · ${clienteNombre} · ${fechaCorta}: ${capitalizarEstado(estadoActual)} → ${capitalizarEstado(nuevoEstado)}`;

    const datosPropuesta = {
      servicio_id: servicio.id,
      numero: servicio.numero,
      cliente: clienteNombre,
      fecha: servicio.fecha_programada,
      estado_actual: estadoActual,
      nuevo_estado: nuevoEstado,
      nota: args.nota || null,
    };

    // 7. Si tenemos conversacionId, llamar a crear_propuesta
    let propuestaCreada: any = null;
    if (ctx.conversacionId) {
      const { data: prop, error: errProp } = await ctx.supabase.rpc(
        "crear_propuesta",
        {
          p_conversacion_id: ctx.conversacionId,
          p_accion: "cambiar_estado",
          p_datos: datosPropuesta,
          p_resumen: resumen,
        },
      );

      if (errProp) {
        return {
          error: `Error al crear propuesta en la base de datos: ${errProp.message}`,
        };
      }
      propuestaCreada = prop;
    }

    return {
      ok: true,
      propuesta_id: propuestaCreada?.id || null,
      propuesta: propuestaCreada,
      resumen,
      datos: datosPropuesta,
    };
  },
};
