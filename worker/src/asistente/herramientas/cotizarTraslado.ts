import { cotizar, type EntradaCotizacion, type ParametrosCotizacion } from "../../lib/cotizador";
import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";

function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

export const herramientaCotizarTraslado: HerramientaAsistente = {
  nombre: "cotizar_traslado",
  descripcion:
    "Calcula el precio sugerido de un traslado según kilómetros, vehículo, carga, modalidad ida y vuelta y recargo nocturno usando el cotizador oficial de ELEVAPLUS.",
  parametros: {
    type: "object",
    properties: {
      km: {
        type: "number",
        description: "Distancia en kilómetros del recorrido",
      },
      vehiculo: {
        type: "string",
        description:
          "Nombre o ID del vehículo (ej: 'Ford Cargo', 'camioneta'). Si se omite, se usa el vehículo principal disponible.",
      },
      carga_mayor_50: {
        type: "boolean",
        description: "Indica si la carga supera el 50% de la capacidad del vehículo (por defecto false)",
      },
      ida_y_vuelta: {
        type: "boolean",
        description: "Indica si el traslado es ida y vuelta (por defecto false)",
      },
      nocturno: {
        type: "boolean",
        description: "Indica si aplica recargo por horario nocturno (20:00 a 06:00)",
      },
    },
    required: ["km"],
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(
    ctx: ContextoHerramienta,
    args: {
      km: number;
      vehiculo?: string;
      carga_mayor_50?: boolean;
      ida_y_vuelta?: boolean;
      nocturno?: boolean;
    },
  ) {
    if (args.km == null || isNaN(args.km) || args.km <= 0) {
      return {
        error: "Los kilómetros deben ser un número positivo.",
      };
    }

    // 1. Obtener parámetros de cotización vigentes
    const { data: paramsRow, error: errorParams } = await ctx.supabase
      .from("parametros_cotizador")
      .select("precio_km, monto_minimo, km_minimo, recargo_nocturno_pct")
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .single();

    if (errorParams) {
      return {
        error: `Error al obtener parámetros del cotizador: ${errorParams.message}`,
      };
    }

    if (!paramsRow) {
      return {
        error: "No hay parámetros de cotización configurados en el sistema.",
      };
    }

    // 2. Obtener vehículos activos con coeficientes
    const { data: vehiculos, error: errorVehiculos } = await ctx.supabase
      .from("vehiculos")
      .select("id, nombre, coef_precio, coef_carga_menor_50, coef_carga_mayor_50")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (errorVehiculos) {
      return {
        error: `Error al consultar vehículos: ${errorVehiculos.message}`,
      };
    }

    if (!vehiculos || vehiculos.length === 0) {
      return {
        error: "No hay vehículos activos disponibles para cotizar.",
      };
    }

    // Seleccionar vehículo: coincidencia por ID o nombre
    let vehiculoElegido = vehiculos[0];
    if (args.vehiculo) {
      const busqueda = args.vehiculo.trim().toLowerCase();
      const match = vehiculos.find(
        (v) =>
          v.id === args.vehiculo ||
          v.nombre.toLowerCase().includes(busqueda),
      );
      if (match) {
        vehiculoElegido = match;
      }
    }

    const parametros: ParametrosCotizacion = {
      precio_km: Number(paramsRow.precio_km),
      monto_minimo: Number(paramsRow.monto_minimo),
      km_minimo: Number(paramsRow.km_minimo),
      recargo_nocturno_pct:
        paramsRow.recargo_nocturno_pct != null
          ? Number(paramsRow.recargo_nocturno_pct)
          : null,
    };

    const entrada: EntradaCotizacion = {
      km: Number(args.km),
      vehiculo: {
        coef_precio: Number(vehiculoElegido.coef_precio || 1),
        coef_carga_menor_50: Number(vehiculoElegido.coef_carga_menor_50 || 1),
        coef_carga_mayor_50: Number(vehiculoElegido.coef_carga_mayor_50 || 1),
      },
      cargaMayor50: Boolean(args.carga_mayor_50),
      idaYVuelta: Boolean(args.ida_y_vuelta),
      nocturno: Boolean(args.nocturno),
    };

    const desglose = cotizar(entrada, parametros);
    const precioFormateado = formatearMoneda(desglose.importe);

    const detalleModalidad = entrada.idaYVuelta ? "ida y vuelta" : "solo ida";
    const detalleCarga = entrada.cargaMayor50 ? ", carga > 50%" : "";
    const detalleNocturno = entrada.nocturno ? ", servicio nocturno" : "";

    const resumen = `Precio sugerido: ${precioFormateado} (${args.km} km, ${vehiculoElegido.nombre}, ${detalleModalidad}${detalleCarga}${detalleNocturno})`;

    return {
      vehiculo_id: vehiculoElegido.id,
      vehiculo_nombre: vehiculoElegido.nombre,
      km: args.km,
      importe: desglose.importe,
      importe_formateado: precioFormateado,
      km_facturables: desglose.kmFacturables,
      base: desglose.base,
      subtotal: desglose.subtotal,
      aplico_minimo: desglose.aplicoMinimo,
      delta_nocturno: desglose.deltaNocturno,
      resumen,
    };
  },
};
