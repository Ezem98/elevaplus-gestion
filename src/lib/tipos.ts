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

export type TipoMaquina = "autoelevador" | "plataforma" | "zorra" | "apilador" | "escalera" | "otro";
export type EstadoMaquina = "disponible" | "alquilada" | "taller" | "baja";

export interface Maquina {
  id: string;
  codigo_interno: string | null;
  tipo: TipoMaquina;
  marca: string | null;
  modelo: string | null;
  capacidad: string | null;
  estado: EstadoMaquina;
  activo: boolean;
  notas: string | null;
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
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  vehiculo_id: string | null;
  maquina_id: string | null;
  monto: number | null;
  aplica_iva: boolean;
  monto_cobrado: number;
  remito: string | null;
  orden_compra: string | null;
  factura_id: string | null;
  no_facturable: boolean;
  notas: string | null;
  no_planificado: boolean;
  presupuesto_validez_dias?: number | null;
  presupuesto_condiciones?: string | null;
  presupuesto_pdf_path?: string | null;
  presupuesto_generado_at?: string | null;
  created_at: string;
  clientes?: {
    nombre: string;
    cuit?: string | null;
    condicion_iva?: CondicionIva | null;
    telefono?: string | null;
    email?: string | null;
    direccion?: string | null;
    localidad?: string | null;
  } | null;
  vehiculos?: { nombre: string } | null;
  maquinas?: { codigo_interno: string | null; tipo: TipoMaquina } | null;
  facturas?: { id?: string; tipo: TipoFactura; punto_venta: number; numero: number; fecha?: string } | null;
  alquileres?: Alquiler | null;
}

export interface Empresa {
  id: number;
  razon_social: string;
  cuit: string;
  condicion_iva: CondicionIva;
  domicilio: string | null;
  telefono: string | null;
  email: string | null;
  email_secundario: string | null;
  instagram: string | null;
  presupuesto_validez_dias: number;
  presupuesto_espera_autoelevador: string;
  presupuesto_espera_camion: string | null;
  presupuesto_condiciones_extra: string | null;
  precio_hora_espera_camion?: number | null;
  precio_hora_espera_autoelevador?: number | null;
  updated_at?: string;
}

export interface ServicioEvento {
  id: number;
  servicio_id: string;
  estado_anterior: EstadoServicio | null;
  estado_nuevo: EstadoServicio;
  usuario_id: string | null;
  nota: string | null;
  created_at: string;
  perfiles?: { nombre: string } | null;
}

export interface ServicioChofer {
  chofer_id: string;
  perfiles?: { nombre: string } | { nombre: string }[] | null;
}

export type EstadoCobro = "pendiente" | "acreditado" | "rechazado";
export type TipoCheque = "recibido" | "emitido";
export type EstadoCheque = "en_cartera" | "depositado" | "acreditado" | "rechazado" | "endosado";

export interface Cobro {
  id: string;
  cliente_id: string | null;
  fecha: string;
  fecha_acreditacion: string | null;
  monto: number;
  medio: MedioPago;
  estado: EstadoCobro;
  referencia: string | null;
  cheque_id: string | null;
  registrado_por: string | null;
  notas: string | null;
  created_at: string;
  clientes?: { nombre: string } | null;
  cheques?: Cheque | null;
}

export interface Cheque {
  id: string;
  tipo: TipoCheque;
  es_echeq: boolean;
  numero: string | null;
  banco: string | null;
  emisor: string | null;
  fecha_emision: string | null;
  fecha_pago: string;
  monto: number;
  estado: EstadoCheque;
  cliente_id: string | null;
  notas: string | null;
  created_at: string;
  clientes?: { nombre: string } | null;
}

export interface CobroAplicacion {
  cobro_id: string;
  servicio_id: string;
  monto: number;
  cobros?: Cobro | null;
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

export const ETIQUETA_TIPO_MAQUINA: Record<TipoMaquina, string> = {
  autoelevador: "Autoelevador",
  plataforma: "Plataforma",
  zorra: "Zorra",
  apilador: "Apilador",
  escalera: "Escalera",
  otro: "Otro",
};

export const ETIQUETA_MEDIO_PAGO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  echeq: "E-cheq",
  otro: "Otro",
};

export const ETIQUETA_ESTADO_COBRO: Record<EstadoCobro, string> = {
  pendiente: "Pendiente",
  acreditado: "Acreditado",
  rechazado: "Rechazado",
};

export const ETIQUETA_ESTADO_CHEQUE: Record<EstadoCheque, string> = {
  en_cartera: "En cartera",
  depositado: "Depositado",
  acreditado: "Acreditado",
  rechazado: "Rechazado",
  endosado: "Endosado",
};

export type UnidadAlquiler = "dia" | "semana" | "quincena" | "mes";

export interface Alquiler {
  servicio_id: string;
  fecha_desde: string;
  fecha_hasta: string;
  unidad: UnidadAlquiler;
  cantidad: number;
  precio_unidad: number;
  renovacion_automatica: boolean;
  alertar_dias_antes: number;
  renovado_de?: string | null;
}

export const ETIQUETA_UNIDAD_ALQUILER: Record<UnidadAlquiler, string> = {
  dia: "Día",
  semana: "Semana",
  quincena: "Quincena",
  mes: "Mes",
};

export const ETIQUETA_UNIDAD_ALQUILER_PLURAL: Record<UnidadAlquiler, string> = {
  dia: "días",
  semana: "semanas",
  quincena: "quincenas",
  mes: "meses",
};

export function formatearUnidadPlural(unidad: UnidadAlquiler, cantidad: number): string {
  if (cantidad === 1) {
    return ETIQUETA_UNIDAD_ALQUILER[unidad].toLowerCase();
  }
  return ETIQUETA_UNIDAD_ALQUILER_PLURAL[unidad];
}

export type TipoFactura = "A" | "B" | "C" | "NC_A" | "NC_B" | "ND_A" | "ND_B";

export interface Factura {
  id: string;
  tipo: TipoFactura;
  punto_venta: number;
  numero: number;
  fecha: string;
  cliente_id: string | null;
  neto: number;
  iva: number;
  total: number;
  cae?: string | null;
  pdf_path?: string | null;
  notas?: string | null;
  created_at?: string;
  factura_asociada_id: string | null;
  anulada: boolean;
  clientes?: { nombre: string; cuit?: string | null; condicion_iva?: CondicionIva | null } | null;
  factura_asociada?: { tipo: TipoFactura; punto_venta: number; numero: number } | null;
}

export const ETIQUETA_TIPO_FACTURA: Record<TipoFactura, string> = {
  A: "Factura A",
  B: "Factura B",
  C: "Factura C",
  NC_A: "Nota de crédito A",
  NC_B: "Nota de crédito B",
  ND_A: "Nota de débito A",
  ND_B: "Nota de débito B",
};
