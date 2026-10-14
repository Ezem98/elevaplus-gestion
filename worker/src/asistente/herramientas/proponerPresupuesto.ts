import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";
import {
  formatearMonedaARS,
  formatearMonedaUSD,
} from "./proponerServicioComun";
import { resolverFechaLogica } from "./resolverFecha";

export interface ItemPresupuestoEntrada {
  tipo?: string;
  descripcion?: string;
  precio?: number;
  /** Cotización del dólar, solo si el usuario la dijo (nunca se inventa). */
  cotizacion?: number;
  monto?: number;
  precio_unitario?: number;
  moneda?: "ARS" | "USD" | string;
  cantidad?: number;
  unidad?: string;
  origen?: string;
  destino?: string;
  km?: number;
  ida_y_vuelta?: boolean;
  nocturno?: boolean;
  maquina?: string;
  fecha?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
}

export interface EntradaProponerPresupuesto {
  cliente?: string;
  prospecto?: {
    nombre: string;
    telefono?: string;
    email?: string;
    cuit?: string;
  };
  prospecto_nombre?: string;
  prospecto_telefono?: string;
  prospecto_email?: string;
  prospecto_cuit?: string;
  validez_dias?: number;
  condiciones?: string;
  items?: ItemPresupuestoEntrada[];
}

export const PARAMETROS_PROPONER_PRESUPUESTO: HerramientaAsistente["parametros"] = {
  type: "object",
  properties: {
    cliente: {
      type: "string",
      description: "Nombre o ID del cliente existente o prospecto",
    },
    prospecto: {
      type: "object",
      description: "Datos del prospecto si no es cliente todavía",
      properties: {
        nombre: { type: "string" },
        telefono: { type: "string" },
        email: { type: "string" },
        cuit: { type: "string" },
      },
      required: ["nombre"],
    },
    prospecto_nombre: {
      type: "string",
      description: "Nombre del prospecto (si se indica directamente)",
    },
    prospecto_telefono: {
      type: "string",
      description: "Teléfono de contacto del prospecto",
    },
    prospecto_email: {
      type: "string",
      description: "Email de contacto del prospecto",
    },
    prospecto_cuit: {
      type: "string",
      description: "CUIT del prospecto",
    },
    validez_dias: {
      type: "number",
      description: "Días de validez de la cotización (por defecto 15)",
    },
    condiciones: {
      type: "string",
      description: "Condiciones comerciales adicionales",
    },
    items: {
      type: "array",
      description:
        "Lista de ítems que componen el presupuesto. Cada ítem debe tener precio explícito.",
      items: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            description:
              "Tipo de servicio: 'traslado', 'alquiler_periodo', 'alquiler_hora', 'mantenimiento', 'otro'",
          },
          descripcion: {
            type: "string",
            description: "Descripción del ítem cotizado",
          },
          precio: {
            type: "number",
            description: "Precio del ítem indicado por el usuario",
          },
          monto: {
            type: "number",
            description: "Monto alternativo para el ítem",
          },
          precio_unitario: {
            type: "number",
            description: "Precio por unidad (por día, semana, mes u hora)",
          },
          moneda: {
            type: "string",
            description: "Moneda del ítem: 'ARS' o 'USD'",
          },
          cotizacion: {
            type: "number",
            description:
              "Cotización del dólar para ítems en USD. Solo si el usuario la dijo; nunca la inventes.",
          },
          cantidad: {
            type: "number",
            description: "Cantidad de unidades (ej: días de alquiler)",
          },
          unidad: {
            type: "string",
            description: "Unidad de alquiler: 'dia', 'semana', 'quincena', 'mes'",
          },
          origen: {
            type: "string",
            description: "Origen del traslado",
          },
          destino: {
            type: "string",
            description: "Destino del traslado",
          },
          km: {
            type: "number",
            description: "Kilómetros estimados",
          },
          ida_y_vuelta: {
            type: "boolean",
            description: "Si es ida y vuelta",
          },
          nocturno: {
            type: "boolean",
            description: "Si aplica recargo nocturno",
          },
          maquina: {
            type: "string",
            description: "Máquina o autoelevador asignado (ej: 'AE-01')",
          },
          fecha: {
            type: "string",
            description: "Fecha tentativa del servicio",
          },
          fecha_desde: {
            type: "string",
            description: "Fecha tentativa de inicio de alquiler",
          },
          fecha_hasta: {
            type: "string",
            description: "Fecha tentativa de fin de alquiler",
          },
        },
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

export const herramientaProponerPresupuesto: HerramientaAsistente = {
  nombre: "proponer_presupuesto",
  descripcion:
    "Valida y arma una propuesta para crear un presupuesto con uno o más ítems (traslados, alquileres, etc.). Cada ítem debe tener un precio explícito indicado por el usuario (esta herramienta NUNCA calcula ni sugiere precios con el cotizador ni inventa montos). Si falta el precio de algún ítem, devuelve qué falta. Si el cliente no existe, lo toma como prospecto. Calcula totales solo sumando los precios dados y crea la propuesta pendiente en la base de datos con acción 'crear_presupuesto' para confirmarla en la app.",
  parametros: PARAMETROS_PROPONER_PRESUPUESTO,
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta, args: EntradaProponerPresupuesto) {
    const terminoCliente = (
      args.cliente ||
      args.prospecto?.nombre ||
      args.prospecto_nombre ||
      ""
    ).trim();

    if (!terminoCliente) {
      return {
        faltan: ["cliente"],
        error: "Debe indicar el cliente o prospecto para armar el presupuesto.",
        resumen:
          "Falta indicar a nombre de qué cliente o prospecto armamos el presupuesto.",
      };
    }

    // 1. Resolver cliente o prospecto
    let clienteId: string | null = null;
    let clienteNombre = terminoCliente;
    let esProspecto = false;

    const esUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        terminoCliente,
      );

    if (esUUID) {
      const { data: cData, error: cErr } = await ctx.supabase
        .from("clientes")
        .select("id, nombre")
        .eq("id", terminoCliente)
        .maybeSingle();

      if (cErr) {
        return {
          error: `Error al consultar cliente: ${cErr.message}`,
        };
      }

      if (cData) {
        clienteId = cData.id;
        clienteNombre = cData.nombre;
      } else {
        esProspecto = true;
      }
    } else if (args.prospecto && !args.cliente) {
      esProspecto = true;
      clienteNombre = args.prospecto.nombre.trim();
    } else {
      const { data: matches, error: cErr } = await ctx.supabase
        .from("clientes")
        .select("id, nombre")
        .eq("activo", true)
        .ilike("nombre", `%${terminoCliente}%`)
        .limit(5);

      if (cErr) {
        return {
          error: `Error al consultar clientes: ${cErr.message}`,
        };
      }

      if (!matches || matches.length === 0) {
        // No existe en clientes -> se toma como prospecto
        esProspecto = true;
      } else if (matches.length > 1) {
        const exacta = matches.find(
          (m) => m.nombre.toLowerCase() === terminoCliente.toLowerCase(),
        );
        if (exacta) {
          clienteId = exacta.id;
          clienteNombre = exacta.nombre;
        } else {
          return {
            faltan: ["cliente"],
            ambiguo: true,
            opciones: matches.map((m) => m.nombre),
            resumen: `Encontré varios clientes parecidos (${matches.map((m) => m.nombre).join(", ")}). ¿A cuál de ellos le armamos el presupuesto?`,
          };
        }
      } else {
        clienteId = matches[0].id;
        clienteNombre = matches[0].nombre;
      }
    }

    const prospectoNombre = esProspecto ? clienteNombre : null;
    const prospectoTelefono =
      args.prospecto?.telefono || args.prospecto_telefono || null;
    const prospectoEmail =
      args.prospecto?.email || args.prospecto_email || null;
    const prospectoCuit = args.prospecto?.cuit || args.prospecto_cuit || null;

    // 2. Validar ítems
    if (
      !args.items ||
      !Array.isArray(args.items) ||
      args.items.length === 0
    ) {
      return {
        faltan: ["items"],
        error: "Debe incluir al menos un ítem en el presupuesto.",
        resumen: "El presupuesto debe tener al menos un ítem con su precio.",
      };
    }

    // 3. Validar precios de TODOS los ítems (DECISIÓN DEL DUEÑO: nunca usar cotizador ni inventar montos)
    const faltanPrecios: string[] = [];
    const itemsPrevalidados: Array<{
      item: ItemPresupuestoEntrada;
      precio: number;
      tipoNormalizado: string;
      moneda: "ARS" | "USD";
    }> = [];

    for (let i = 0; i < args.items.length; i++) {
      const it = args.items[i];
      let tipoNorm = (it.tipo || "traslado").trim().toLowerCase();
      if (tipoNorm.includes("traslado")) tipoNorm = "traslado";
      else if (
        tipoNorm.includes("periodo") ||
        tipoNorm.includes("período")
      )
        tipoNorm = "alquiler_periodo";
      else if (tipoNorm.includes("alquiler") && tipoNorm.includes("hora"))
        tipoNorm = "alquiler_hora";
      else if (tipoNorm.includes("mantenimiento")) tipoNorm = "mantenimiento";
      else if (tipoNorm !== "traslado" && tipoNorm !== "alquiler_periodo" && tipoNorm !== "alquiler_hora" && tipoNorm !== "mantenimiento")
        tipoNorm = "otro";

      let precioFinal: number | null = null;
      if (it.precio != null && Number(it.precio) > 0) {
        precioFinal = Number(it.precio);
      } else if (it.monto != null && Number(it.monto) > 0) {
        precioFinal = Number(it.monto);
      } else if (
        it.precio_unitario != null &&
        Number(it.precio_unitario) > 0 &&
        it.cantidad != null &&
        Number(it.cantidad) > 0
      ) {
        precioFinal = Number(it.cantidad) * Number(it.precio_unitario);
      }

      if (precioFinal == null || precioFinal <= 0) {
        const etiqueta =
          it.descripcion ||
          (tipoNorm ? tipoNorm.replace("_", " ") : `ítem ${i + 1}`);
        faltanPrecios.push(`precio de "${etiqueta}"`);
      } else {
        const moneda: "ARS" | "USD" =
          it.moneda && it.moneda.toUpperCase() === "USD" ? "USD" : "ARS";
        itemsPrevalidados.push({
          item: it,
          precio: precioFinal,
          tipoNormalizado: tipoNorm,
          moneda,
        });
      }
    }

    if (faltanPrecios.length > 0) {
      return {
        faltan: faltanPrecios,
        error: `Falta indicar el precio de: ${faltanPrecios.join(", ")}.`,
        resumen: `Para armar el presupuesto necesito que me indiques el ${faltanPrecios.join(", ")}.`,
      };
    }

    // 4. Procesar y estructurar ítems para la RPC crear_presupuesto
    const itemsPayload: any[] = [];
    const itemsResumen: Array<{
      descripcion: string;
      precio: number;
      moneda: "ARS" | "USD";
    }> = [];

    // Sin cotización inventada: en USD se guarda el precio en dólares y la cotización solo si el usuario la dijo (igual que el formulario).

    for (let i = 0; i < itemsPrevalidados.length; i++) {
      const { item: it, precio, tipoNormalizado, moneda } =
        itemsPrevalidados[i];

      // Resolver máquina si fue especificada
      let maquinaId: string | null = null;
      let maquinaCodigo: string | null = null;
      if (it.maquina) {
        const { data: mData } = await ctx.supabase
          .from("maquinas")
          .select("id, codigo_interno, modelo")
          .eq("activo", true);

        if (mData && mData.length > 0) {
          const mMatch = mData.find(
            (m) =>
              m.id === it.maquina ||
              (m.codigo_interno &&
                m.codigo_interno
                  .toLowerCase()
                  .includes(it.maquina!.toLowerCase())) ||
              (m.modelo &&
                m.modelo.toLowerCase().includes(it.maquina!.toLowerCase())),
          );
          if (mMatch) {
            maquinaId = mMatch.id;
            maquinaCodigo = mMatch.codigo_interno || mMatch.modelo;
          }
        }
      }

      // Fechas tentativas
      let fechaProg: string | null = null;
      if (it.fecha) {
        const resF = resolverFechaLogica(it.fecha, ctx.hoy);
        fechaProg = resF.fecha || it.fecha;
      }

      // Detalle de alquiler para alquiler_periodo
      let alquilerPayload: any = null;
      if (tipoNormalizado === "alquiler_periodo") {
        const cantidad =
          it.cantidad != null && Number(it.cantidad) > 0
            ? Number(it.cantidad)
            : 1;
        const unidad = it.unidad || "dia";
        const precioUnidad =
          it.precio_unitario != null && Number(it.precio_unitario) > 0
            ? Number(it.precio_unitario)
            : precio / cantidad;

        let fechaDesde = it.fecha_desde || it.fecha;
        let fechaHasta = it.fecha_hasta;
        if (fechaDesde) {
          const resDesde = resolverFechaLogica(fechaDesde, ctx.hoy);
          if (resDesde.fecha) fechaDesde = resDesde.fecha;
        } else {
          fechaDesde = ctx.hoy;
        }

        if (fechaHasta) {
          const resHasta = resolverFechaLogica(fechaHasta, ctx.hoy);
          if (resHasta.fecha) fechaHasta = resHasta.fecha;
        } else {
          const d = new Date(fechaDesde + "T00:00:00");
          let dias = 1;
          if (unidad === "dia") dias = Math.max(1, cantidad);
          else if (unidad === "semana") dias = Math.max(1, cantidad) * 7;
          else if (unidad === "quincena") dias = Math.max(1, cantidad) * 15;
          else if (unidad === "mes") dias = Math.max(1, cantidad) * 30;
          const fin = !isNaN(d.getTime())
            ? new Date(d.getTime() + Math.max(0, dias - 1) * 86400000)
            : d;
          fechaHasta = !isNaN(fin.getTime())
            ? fin.toISOString().slice(0, 10)
            : fechaDesde;
        }

        if (!fechaProg) {
          fechaProg = fechaDesde;
        }

        alquilerPayload = {
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta,
          unidad,
          cantidad,
          precio_unidad: precioUnidad,
        };
      }

      const descItem =
        it.descripcion?.trim() ||
        `${tipoNormalizado.toUpperCase()}${maquinaCodigo ? " " + maquinaCodigo : ""}`;

      const payloadItem: any = {
        tipo: tipoNormalizado,
        descripcion: descItem,
        monto:
          moneda === "ARS"
            ? precio
            : it.cotizacion ? Math.round(precio * Number(it.cotizacion)) : null,
        moneda,
        monto_moneda: moneda === "USD" ? precio : null,
        cotizacion: moneda === "USD" && it.cotizacion ? Number(it.cotizacion) : null,
        aplica_iva: true,
        nocturno: Boolean(it.nocturno),
        origen: it.origen?.trim() || null,
        destino: it.destino?.trim() || null,
        km: it.km != null ? Number(it.km) : null,
        ida_y_vuelta: Boolean(it.ida_y_vuelta),
        fecha_programada: fechaProg,
        hora_programada: null,
        maquina_id: maquinaId,
        vehiculo_id: null,
        alquiler: alquilerPayload,
      };

      itemsPayload.push(payloadItem);
      itemsResumen.push({
        descripcion: descItem,
        precio,
        moneda,
      });
    }

    // 5. Calcular totales sumando exclusivamente los precios indicados (sin cotizador)
    let totalARS = 0;
    let totalUSD = 0;
    for (const r of itemsResumen) {
      if (r.moneda === "USD") {
        totalUSD += r.precio;
      } else {
        totalARS += r.precio;
      }
    }

    const totales: Record<string, number> = {};
    if (totalARS > 0 || totalUSD === 0) totales.ARS = totalARS;
    if (totalUSD > 0) totales.USD = totalUSD;

    const validezDias = args.validez_dias ? Number(args.validez_dias) : 15;

    // 6. Armar resumen textual
    const partesResumen: string[] = [];
    partesResumen.push(
      `PRESUPUESTO · ${clienteNombre}${esProspecto ? " (Prospecto)" : ""}`,
    );
    partesResumen.push("Ítems:");
    for (const r of itemsResumen) {
      const precioTxt =
        r.moneda === "USD"
          ? formatearMonedaUSD(r.precio)
          : formatearMonedaARS(r.precio);
      partesResumen.push(`- ${r.descripcion}: ${precioTxt}`);
    }

    const lineasTotales: string[] = [];
    if (totales.ARS != null) {
      lineasTotales.push(`Total: ${formatearMonedaARS(totales.ARS)}`);
    }
    if (totales.USD != null) {
      lineasTotales.push(`Total: ${formatearMonedaUSD(totales.USD)}`);
    }
    partesResumen.push(lineasTotales.join(" · "));
    partesResumen.push(`Validez: ${validezDias} días`);

    if (args.condiciones && args.condiciones.trim()) {
      partesResumen.push(`Condiciones: ${args.condiciones.trim()}`);
    }

    const resumen = partesResumen.join("\n");

    // 7. Preparar objeto de datos para guardar en la propuesta
    const datosPresupuesto = {
      cliente_id: clienteId,
      prospecto_nombre: prospectoNombre,
      prospecto_telefono: prospectoTelefono,
      prospecto_email: prospectoEmail,
      prospecto_cuit: prospectoCuit,
      validez_dias: validezDias,
      condiciones: args.condiciones?.trim() || null,
    };

    const datosPropuesta: any = {
      presupuesto: datosPresupuesto,
      items: itemsPayload,
      cliente: clienteNombre,
      es_prospecto: esProspecto,
      totales,
      validez_dias: validezDias,
      condiciones: args.condiciones?.trim() || null,
    };

    // 8. Crear propuesta en la base si hay contexto de conversación
    let propuestaCreada: any = null;
    if (ctx.conversacionId) {
      const { data: prop, error: errProp } = await ctx.supabase.rpc(
        "crear_propuesta",
        {
          p_conversacion_id: ctx.conversacionId,
          p_accion: "crear_presupuesto",
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
      totales,
    };
  },
};
