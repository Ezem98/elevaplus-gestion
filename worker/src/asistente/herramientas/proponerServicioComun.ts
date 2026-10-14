import { cotizar, type ParametrosCotizacion } from "../../lib/cotizador";
import type { ContextoHerramienta } from "../tipos";
import { resolverFechaLogica, sumarDiasISO } from "./resolverFecha";

export function formatearMonedaARS(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

export function formatearMonedaUSD(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(monto);
}

export interface EntradaProponerServicio {
  tipo:
    | "traslado"
    | "alquiler_hora"
    | "alquiler_periodo"
    | "mantenimiento"
    | "otro"
    | string;
  cliente?: string; // nombre o UUID
  fecha?: string; // relativo o ISO
  hora?: string; // HH:mm
  origen?: string;
  destino?: string;
  paradas?: Array<{
    direccion: string;
    localidad?: string;
    carga?: string;
  }>;
  km?: number;
  ida_y_vuelta?: boolean;
  nocturno?: boolean;
  vehiculo?: string; // nombre o UUID
  maquina?: string; // código o UUID
  chofer?: string; // nombre o UUID
  choferes?: string[]; // nombres o UUIDs
  direccion?: string; // para alquiler o mantenimiento
  localidad?: string;
  monto?: number;
  precio_usd?: number; // para alquiler por período
  fecha_desde?: string; // para alquiler por período
  fecha_hasta?: string;
  descripcion?: string; // para mantenimiento u otro
  trabajo_a_realizar?: string;
}

export interface OpcionesProponerServicio {
  esRealizado: boolean;
}

function capitalizarTipo(t: string): string {
  const mapeo: Record<string, string> = {
    traslado: "Traslado",
    alquiler_hora: "Alquiler por hora",
    alquiler_periodo: "Alquiler por período",
    mantenimiento: "Mantenimiento",
    otro: "Otro",
  };
  return mapeo[t] || t.replace("_", " ");
}

/**
 * Lógica común de validación y resolución de datos de servicio tanto para
 * servicios a futuro (proponer_servicio) como ya realizados (proponer_servicio_realizado).
 */
export async function ejecutarPropuestaServicio(
  ctx: ContextoHerramienta,
  args: EntradaProponerServicio,
  opciones: OpcionesProponerServicio,
) {
  const { esRealizado } = opciones;

  // El modelo a veces manda 0 en vez de omitir el dato: un precio o km en 0 cuenta como faltante.
  for (const campo of ["monto", "precio_usd", "km"] as const) {
    if (args[campo] != null && !(Number(args[campo]) > 0)) {
      args = { ...args, [campo]: undefined };
    }
  }

  if (!args.tipo) {
    return {
      faltan: ["tipo"],
      error: "Debe indicar el tipo de servicio.",
      resumen:
        "Falta indicar el tipo de servicio (traslado, alquiler, mantenimiento u otro).",
    };
  }

  // Normalizar tipo de servicio
  let tipoNormalizado = args.tipo.trim().toLowerCase();
  if (tipoNormalizado.includes("traslado")) tipoNormalizado = "traslado";
  else if (
    tipoNormalizado.includes("periodo") ||
    tipoNormalizado.includes("período")
  )
    tipoNormalizado = "alquiler_periodo";
  else if (
    tipoNormalizado.includes("alquiler") &&
    tipoNormalizado.includes("hora")
  )
    tipoNormalizado = "alquiler_hora";
  else if (tipoNormalizado.includes("mantenimiento"))
    tipoNormalizado = "mantenimiento";
  else if (tipoNormalizado === "otro") tipoNormalizado = "otro";

  // 1. Validar campos obligatorios por tipo (§4.3)
  const faltan: string[] = [];

  // Todos requieren cliente
  if (!args.cliente || args.cliente.trim() === "") {
    faltan.push("cliente");
  }

  if (tipoNormalizado === "traslado") {
    // traslado: cliente, fecha, origen, destino (o paradas)
    if (!args.fecha || args.fecha.trim() === "") faltan.push("fecha");
    const tieneParadas =
      Array.isArray(args.paradas) && args.paradas.length >= 2;
    const tieneOrigen = Boolean(args.origen && args.origen.trim() !== "");
    const tieneDestino = Boolean(args.destino && args.destino.trim() !== "");
    if (!tieneParadas && (!tieneOrigen || !tieneDestino)) {
      if (!tieneOrigen) faltan.push("origen");
      if (!tieneDestino) faltan.push("destino");
    }
    // Sin precio hace falta el km para el cotizador (nunca se inventa la distancia).
    if (args.monto == null && args.km == null) faltan.push("monto o km");
  } else if (tipoNormalizado === "alquiler_hora") {
    // alquiler por hora: cliente, fecha, máquina, dirección
    if (!args.fecha || args.fecha.trim() === "") faltan.push("fecha");
    if (!args.maquina || args.maquina.trim() === "") faltan.push("maquina");
    if (!args.direccion || args.direccion.trim() === "") faltan.push("direccion");
  } else if (tipoNormalizado === "alquiler_periodo") {
    // alquiler por período: cliente, máquina, desde, hasta, dirección, precio en U$S
    if (!args.maquina || args.maquina.trim() === "") faltan.push("maquina");
    const desde = args.fecha_desde || args.fecha;
    if (!desde || desde.trim() === "") faltan.push("fecha_desde");
    if (!args.fecha_hasta || args.fecha_hasta.trim() === "")
      faltan.push("fecha_hasta");
    if (!args.direccion || args.direccion.trim() === "")
      faltan.push("direccion");
    if (args.precio_usd == null && args.monto == null)
      faltan.push("precio_usd");
  } else if (tipoNormalizado === "mantenimiento") {
    // mantenimiento: cliente, fecha, descripción del trabajo
    if (!args.fecha || args.fecha.trim() === "") faltan.push("fecha");
    const desc = args.descripcion || args.trabajo_a_realizar;
    if (!desc || desc.trim() === "") faltan.push("descripcion");
  } else {
    // otro: cliente, fecha, descripción
    if (!args.fecha || args.fecha.trim() === "") faltan.push("fecha");
    const desc = args.descripcion || args.trabajo_a_realizar;
    if (!desc || desc.trim() === "") faltan.push("descripcion");
  }

  if (faltan.length > 0) {
    return {
      faltan,
      error: "Faltan datos obligatorios para proponer el servicio.",
      resumen: `Para proponer este ${capitalizarTipo(tipoNormalizado).toLowerCase()} falta: ${faltan.join(", ")}.`,
    };
  }

  // 2. Resolver fecha a ISO y validar restricciones temporales
  let fechaISO = ctx.hoy;
  let diaSemana = "";
  const rawFecha =
    tipoNormalizado === "alquiler_periodo"
      ? args.fecha_desde || args.fecha
      : args.fecha;

  if (rawFecha) {
    const resF = resolverFechaLogica(rawFecha, ctx.hoy);
    if (resF.fecha) {
      fechaISO = resF.fecha;
      diaSemana = resF.dia_semana || "";
    } else {
      fechaISO = rawFecha;
    }
  }

  let fechaHastaISO: string | null = null;
  if (args.fecha_hasta) {
    const resHasta = resolverFechaLogica(args.fecha_hasta, ctx.hoy);
    fechaHastaISO = resHasta.fecha || args.fecha_hasta;
  }

  // Validaciones temporales según esRealizado
  if (esRealizado) {
    // Un servicio realizado debe ser hoy o en el pasado
    if (fechaISO > ctx.hoy) {
      return {
        error:
          "Un servicio ya realizado no puede tener fecha futura. Para servicios futuros usá proponer_servicio.",
        es_futura: true,
        fecha: fechaISO,
      };
    }

    // Tope razonable hacia atrás: máximo 90 días
    const limite90Dias = sumarDiasISO(ctx.hoy, -90);
    if (fechaISO < limite90Dias) {
      return {
        error:
          "La fecha es anterior al límite permitido de 90 días hacia atrás para servicios ya realizados.",
        demasiado_antigua: true,
        fecha: fechaISO,
      };
    }
  } else {
    // proponer_servicio es para hoy en adelante
    if (fechaISO < ctx.hoy) {
      return {
        error: `La fecha (${fechaISO}) es anterior a hoy. Para cargar servicios que ya se realizaron usá la herramienta proponer_servicio_realizado.`,
        es_pasada: true,
        fecha: fechaISO,
      };
    }
  }

  // 3. Resolver cliente a ID
  const clienteTermino = args.cliente!.trim();
  let clienteId: string | null = null;
  let clienteNombre: string = clienteTermino;

  const esUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      clienteTermino,
    );

  if (esUUID) {
    const { data: cData, error: cErr } = await ctx.supabase
      .from("clientes")
      .select("id, nombre")
      .eq("id", clienteTermino)
      .single();
    if (cErr || !cData) {
      return {
        faltan: ["cliente"],
        error: `Cliente no encontrado: ${cErr?.message || "ID inexistente"}`,
      };
    }
    clienteId = cData.id;
    clienteNombre = cData.nombre;
  } else {
    const { data: matches, error: cErr } = await ctx.supabase
      .from("clientes")
      .select("id, nombre")
      .eq("activo", true)
      .ilike("nombre", `%${clienteTermino}%`)
      .limit(5);

    if (cErr) {
      return {
        error: `Error al resolver cliente: ${cErr.message}`,
      };
    }

    if (!matches || matches.length === 0) {
      return {
        faltan: ["cliente"],
        error: `No se encontró ningún cliente activo con el nombre "${clienteTermino}".`,
        resumen: `No encontré ningún cliente llamado "${clienteTermino}". ¿Querés revisar el nombre?`,
      };
    }

    if (matches.length > 1) {
      const exacta = matches.find(
        (m) => m.nombre.toLowerCase() === clienteTermino.toLowerCase(),
      );
      if (exacta) {
        clienteId = exacta.id;
        clienteNombre = exacta.nombre;
      } else {
        return {
          faltan: ["cliente"],
          ambiguo: true,
          opciones: matches.map((m) => m.nombre),
          resumen: `Encontré varios clientes parecidos (${matches.map((m) => m.nombre).join(", ")}). ¿Cuál de ellos es?`,
        };
      }
    } else {
      clienteId = matches[0].id;
      clienteNombre = matches[0].nombre;
    }
  }

  // 4. Resolver vehículo si fue especificado
  let vehiculoId: string | null = null;
  let vehiculoNombre: string | null = null;
  let vehiculoRow: any = null;

  if (args.vehiculo) {
    const { data: vData } = await ctx.supabase
      .from("vehiculos")
      .select("id, nombre, coef_precio, coef_carga_menor_50, coef_carga_mayor_50")
      .eq("activo", true);

    if (vData && vData.length > 0) {
      const vMatch = vData.find(
        (v) =>
          v.id === args.vehiculo ||
          v.nombre.toLowerCase().includes(args.vehiculo!.toLowerCase()),
      );
      if (vMatch) {
        vehiculoId = vMatch.id;
        vehiculoNombre = vMatch.nombre;
        vehiculoRow = vMatch;
      }
    }
  }

  // 5. Resolver máquina si fue especificada
  let maquinaId: string | null = null;
  let maquinaCodigo: string | null = null;

  if (args.maquina) {
    const { data: mData } = await ctx.supabase
      .from("maquinas")
      .select("id, codigo_interno, modelo")
      .eq("activo", true);

    if (mData && mData.length > 0) {
      const mMatch = mData.find(
        (m) =>
          m.id === args.maquina ||
          (m.codigo_interno &&
            m.codigo_interno
              .toLowerCase()
              .includes(args.maquina!.toLowerCase())) ||
          (m.modelo &&
            m.modelo.toLowerCase().includes(args.maquina!.toLowerCase())),
      );
      if (mMatch) {
        maquinaId = mMatch.id;
        maquinaCodigo = mMatch.codigo_interno || mMatch.modelo;
      }
    }
  }

  // 6. Resolver chofer(es)
  const choferesNombres = [
    ...(args.choferes || []),
    ...(args.chofer ? [args.chofer] : []),
  ].filter(Boolean);

  const choferesIds: string[] = [];
  const choferesResueltosNombres: string[] = [];

  if (choferesNombres.length > 0) {
    const { data: chData } = await ctx.supabase
      .from("perfiles")
      .select("id, nombre")
      .eq("rol", "chofer")
      .eq("activo", true);

    if (chData) {
      for (const nom of choferesNombres) {
        const nomLimpio = nom.toLowerCase();
        let match = chData.find(
          (c) =>
            c.id === nom ||
            c.nombre.toLowerCase().includes(nomLimpio),
        );
        if (!match) {
          if (nomLimpio.includes("mauro")) {
            match = chData.find((c) => c.nombre.toLowerCase().includes("chofer 1"));
          } else if (nomLimpio.includes("federico")) {
            match = chData.find((c) => c.nombre.toLowerCase().includes("chofer 2"));
          }
        }
        if (match && !choferesIds.includes(match.id)) {
          choferesIds.push(match.id);
          choferesResueltosNombres.push(match.nombre);
        }
      }
    }
  }

  // 7. Calcular precio sugerido con cotizador si es traslado y no tiene monto
  let montoFinal = args.monto != null ? Number(args.monto) : null;
  let precioSugerido: number | null = null;

  if (tipoNormalizado === "traslado" && montoFinal == null) {
    const { data: pCot } = await ctx.supabase
      .from("parametros_cotizador")
      .select("precio_km, monto_minimo, km_minimo, recargo_nocturno_pct")
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .single();

    if (pCot) {
      let vCot = vehiculoRow;
      if (!vCot) {
        const { data: primVeh } = await ctx.supabase
          .from("vehiculos")
          .select("id, nombre, coef_precio, coef_carga_menor_50, coef_carga_mayor_50")
          .eq("activo", true)
          .limit(1)
          .single();
        vCot = primVeh;
        if (vCot && !vehiculoId) {
          vehiculoId = vCot.id;
          vehiculoNombre = vCot.nombre;
        }
      }

      if (vCot) {
        const paramsCot: ParametrosCotizacion = {
          precio_km: Number(pCot.precio_km),
          monto_minimo: Number(pCot.monto_minimo),
          km_minimo: Number(pCot.km_minimo),
          recargo_nocturno_pct:
            pCot.recargo_nocturno_pct != null
              ? Number(pCot.recargo_nocturno_pct)
              : null,
        };
        const desglose = cotizar(
          {
            km: Number(args.km),
            vehiculo: {
              coef_precio: Number(vCot.coef_precio || 1),
              coef_carga_menor_50: Number(vCot.coef_carga_menor_50 || 1),
              coef_carga_mayor_50: Number(vCot.coef_carga_mayor_50 || 1),
            },
            cargaMayor50: false,
            idaYVuelta: Boolean(args.ida_y_vuelta),
            nocturno: Boolean(args.nocturno),
          },
          paramsCot,
        );
        precioSugerido = desglose.importe;
        montoFinal = desglose.importe;
      }
    }
  }

  // 8. Armar datos formateados para la base de datos
  const horaIni = args.hora
    ? args.hora.length === 5
      ? `${args.hora}:00`
      : args.hora
    : "12:00:00";
  const fechaInicioIso = `${fechaISO}T${horaIni}-03:00`;
  const fechaFinIso =
    tipoNormalizado === "alquiler_periodo" && fechaHastaISO
      ? `${fechaHastaISO}T${horaIni}-03:00`
      : fechaInicioIso;

  const datosServicio: any = {
    cliente_id: clienteId,
    tipo: tipoNormalizado,
    fecha_programada: fechaISO,
    hora_programada: args.hora || null,
    origen: args.origen || null,
    destino: args.destino || null,
    km: args.km || null,
    ida_y_vuelta: Boolean(args.ida_y_vuelta),
    nocturno: Boolean(args.nocturno),
    vehiculo_id: vehiculoId,
    maquina_id: maquinaId,
    choferes: choferesIds.length > 0 ? choferesIds : null,
    direccion_trabajo: args.direccion || null,
    localidad_trabajo: args.localidad || null,
    trabajo_a_realizar: args.descripcion || args.trabajo_a_realizar || null,
    descripcion:
      args.descripcion ||
      `${tipoNormalizado.toUpperCase()} - ${clienteNombre}`,
  };

  if (esRealizado) {
    datosServicio.es_realizado = true;
    datosServicio.estado_final = "terminado";
    datosServicio.fecha_inicio = fechaInicioIso;
    datosServicio.fecha_fin = fechaFinIso;
  }

  if (tipoNormalizado === "alquiler_periodo") {
    datosServicio.moneda = "USD";
    datosServicio.monto_moneda = args.precio_usd || args.monto;
    datosServicio.monto = null;
    datosServicio.alquiler = {
      fecha_desde: fechaISO,
      fecha_hasta: fechaHastaISO || fechaISO,
      unidad: "mes",
      cantidad: 1,
      precio_unidad: args.precio_usd || args.monto,
    };
  } else {
    datosServicio.moneda = "ARS";
    datosServicio.monto = montoFinal;
  }

  if (Array.isArray(args.paradas) && args.paradas.length > 0) {
    datosServicio.paradas = args.paradas;
  }

  // 9. Construir el texto de resumen para la tarjeta
  const partesResumen: string[] = [];
  const rotuloTipo = capitalizarTipo(tipoNormalizado);

  if (esRealizado) {
    partesResumen.push(`Servicio ya realizado · ${rotuloTipo} · ${clienteNombre}`);
  } else {
    partesResumen.push(`${rotuloTipo.toUpperCase()} · ${clienteNombre}`);
  }

  const detalleHora = args.hora ? ` · ${args.hora}` : "";
  partesResumen.push(`${diaSemana ? diaSemana + " " : ""}${fechaISO}${detalleHora}`);

  if (tipoNormalizado === "traslado") {
    const modal = args.ida_y_vuelta ? "ida y vuelta" : "solo ida";
    const kmTxt = args.km ? `, ${args.km} km` : "";
    partesResumen.push(`${args.origen || "?"} → ${args.destino || "?"} (${modal}${kmTxt})`);
  } else if (args.direccion) {
    partesResumen.push(
      `Dirección: ${args.direccion}${args.localidad ? " (" + args.localidad + ")" : ""}`,
    );
  }

  const choferStr =
    choferesResueltosNombres.length > 0
      ? choferesResueltosNombres.join(", ")
      : "Sin chofer (opcional)";
  const vehStr = vehiculoNombre ? ` · ${vehiculoNombre}` : "";
  const maqStr = maquinaCodigo ? ` · Máquina: ${maquinaCodigo}` : "";

  partesResumen.push(`Chofer: ${choferStr}${vehStr}${maqStr}`);

  if (precioSugerido != null) {
    partesResumen.push(`Precio sugerido: ${formatearMonedaARS(precioSugerido)}`);
  } else if (montoFinal != null) {
    partesResumen.push(`Precio: ${formatearMonedaARS(montoFinal)}`);
  } else if (args.precio_usd != null) {
    partesResumen.push(`Precio: ${formatearMonedaUSD(args.precio_usd)}`);
  }

  const resumen = partesResumen.join("\n");

  // 10. Si tenemos conversacionId, llamar a la RPC crear_propuesta
  let propuestaCreada: any = null;
  const accionRPC = esRealizado
    ? "crear_servicio_realizado"
    : "crear_servicio";

  if (ctx.conversacionId) {
    const { data: prop, error: errProp } = await ctx.supabase.rpc(
      "crear_propuesta",
      {
        p_conversacion_id: ctx.conversacionId,
        p_accion: accionRPC,
        p_datos: datosServicio,
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
    datos: datosServicio,
  };
}
