import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";
import {
  ejecutarPropuestaServicio,
  type EntradaProponerServicio,
} from "./proponerServicioComun";

export type { EntradaProponerServicio };

export const PARAMETROS_PROPONER_SERVICIO: HerramientaAsistente["parametros"] = {
  type: "object",
  properties: {
    tipo: {
      type: "string",
      description:
        "Tipo de servicio: 'traslado', 'alquiler_hora', 'alquiler_periodo', 'mantenimiento', 'otro'",
    },
    cliente: {
      type: "string",
      description: "Nombre o ID del cliente",
    },
    fecha: {
      type: "string",
      description: "Fecha del servicio (ej: 'hoy', 'mañana', 'YYYY-MM-DD')",
    },
    hora: {
      type: "string",
      description: "Hora programada (ej: '09:00', '14:30')",
    },
    origen: {
      type: "string",
      description: "Dirección o localidad de origen (para traslados)",
    },
    destino: {
      type: "string",
      description: "Dirección o localidad de destino (para traslados)",
    },
    km: {
      type: "number",
      description: "Distancia en kilómetros del recorrido",
    },
    ida_y_vuelta: {
      type: "boolean",
      description: "Si el traslado es ida y vuelta",
    },
    nocturno: {
      type: "boolean",
      description: "Si el traslado es en horario nocturno",
    },
    vehiculo: {
      type: "string",
      description: "Nombre o ID del camión o vehículo",
    },
    maquina: {
      type: "string",
      description: "Código o ID de la máquina (ej: 'AE-01')",
    },
    chofer: {
      type: "string",
      description: "Nombre o ID del chofer asignado",
    },
    choferes: {
      type: "array",
      items: { type: "string" },
      description: "Lista de choferes asignados",
    },
    direccion: {
      type: "string",
      description: "Dirección del trabajo (para alquiler o mantenimiento)",
    },
    localidad: {
      type: "string",
      description: "Localidad del trabajo",
    },
    monto: {
      type: "number",
      description: "Precio acordado en pesos",
    },
    precio_usd: {
      type: "number",
      description: "Precio en dólares (para alquiler por período)",
    },
    fecha_desde: {
      type: "string",
      description: "Fecha de inicio del alquiler por período",
    },
    fecha_hasta: {
      type: "string",
      description: "Fecha de fin del alquiler por período",
    },
    descripcion: {
      type: "string",
      description: "Detalle del trabajo o tarea a realizar",
    },
  },
  required: ["tipo"],
  additionalProperties: false,
};

export const herramientaProponerServicio: HerramientaAsistente = {
  nombre: "proponer_servicio",
  descripcion:
    "Valida los datos requeridos para dar de alta un servicio según su tipo con fecha de hoy en adelante. Si falta información obligatoria, devuelve qué falta sin crear nada. Si la fecha es pasada, devuelve un error indicando usar proponer_servicio_realizado. Si está completo, resuelve identidades a UUIDs, cotiza traslados si corresponde y crea la propuesta pendiente en la base para que el usuario la confirme en la app.",
  parametros: PARAMETROS_PROPONER_SERVICIO,
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta, args: EntradaProponerServicio) {
    return ejecutarPropuestaServicio(ctx, args, { esRealizado: false });
  },
};
