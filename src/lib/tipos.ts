// Tipos de dominio. Espejan los enums/tablas de supabase/migrations/0001.
// Cuando el esquema se estabilice, reemplazar por `supabase gen types typescript`.

export type Rol = "admin" | "oficina" | "chofer";

export type TipoServicio = "traslado" | "alquiler_hora" | "alquiler_periodo" | "mantenimiento" | "otro";

export type EstadoServicio =
  | "consulta" | "presupuestado" | "aceptado" | "programado"
  | "en_curso" | "terminado" | "cobrado" | "facturado" | "cancelado";

export type MedioPago = "efectivo" | "transferencia" | "cheque" | "echeq" | "otro";

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  telefono: string | null;
  activo: boolean;
}

export type TipoCliente = "empresa" | "particular" | "municipio";
export type CondicionIva = "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final";
export type CondicionPago = "contado" | "transferencia_diferida" | "cuenta_corriente";

export interface Cliente {
  id: string;
  nombre: string;
  tipo: TipoCliente;
  cuit: string | null;
  condicion_iva: CondicionIva | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  localidad: string | null;
  condicion_pago: CondicionPago;
  dias_pago: number;
  notas: string | null;
  activo: boolean;
  created_at?: string;
}

export interface CuentaCorrienteCliente {
  cliente_id: string;
  nombre: string;
  total_servicios: number;
  total_cobrado: number;
  saldo: number;
}

export interface Vehiculo {
  id: string;
  nombre: string;
  tipo: "camion" | "camioneta" | "trailer";
  coef_precio: number;
  coef_carga_menor_50: number;
  coef_carga_mayor_50: number;
  estado: "disponible" | "en_servicio" | "taller" | "baja";
  activo: boolean;
}

export interface ParametrosCotizador {
  id: number;
  vigente_desde: string;
  precio_km: number;
  monto_minimo: number;
  km_minimo: number;
  precio_gasoil: number | null;
}

export interface Servicio {
  id: string;
  numero: number;
  cliente_id: string | null;
  tipo: TipoServicio;
  estado: EstadoServicio;
  descripcion: string | null;
  origen: string | null;
  destino: string | null;
  carga: string | null;
  km: number | null;
  ida_y_vuelta: boolean;
  fecha_programada: string | null;
  hora_programada: string | null;
  vehiculo_id: string | null;
  maquina_id: string | null;
  monto: number | null;
  monto_cobrado: number;
  remito: string | null;
  orden_compra: string | null;
  no_planificado: boolean;
  created_at: string;
  clientes?: { nombre: string } | null;
}

export const ETIQUETA_ESTADO: Record<EstadoServicio, string> = {
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

export const ETIQUETA_TIPO: Record<TipoServicio, string> = {
  traslado: "Traslado",
  alquiler_hora: "Alquiler por hora",
  alquiler_periodo: "Alquiler por período",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
};

export const ETIQUETA_TIPO_CLIENTE: Record<TipoCliente, string> = {
  empresa: "Empresa",
  particular: "Particular",
  municipio: "Municipio",
};

export const ETIQUETA_CONDICION_IVA: Record<CondicionIva, string> = {
  responsable_inscripto: "Responsable inscripto",
  monotributo: "Monotributo",
  exento: "Exento",
  consumidor_final: "Consumidor final",
};

export const ETIQUETA_CONDICION_PAGO: Record<CondicionPago, string> = {
  contado: "Contado",
  transferencia_diferida: "Transferencia diferida",
  cuenta_corriente: "Cuenta corriente",
};

