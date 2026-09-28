// Tipos de dominio. Espejan los enums/tablas de supabase/migrations/0001.
// Cuando el esquema se estabilice, reemplazar por `supabase gen types typescript`.

export type Rol = "admin" | "oficina" | "chofer";

export type TipoServicio =
  | "traslado"
  | "alquiler_hora"
  | "alquiler_periodo"
  | "mantenimiento"
  | "otro";

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

export type MedioPago =
  | "efectivo"
  | "transferencia"
  | "cheque"
  | "echeq"
  | "cheque_terceros"
  | "cheque_propio"
  | "debito_automatico"
  | "otro";

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  telefono: string | null;
  activo: boolean;
}

export type TipoCliente = "empresa" | "particular" | "municipio";
export type CondicionIva =
  | "responsable_inscripto"
  | "monotributo"
  | "exento"
  | "consumidor_final";
export type CondicionPago =
  | "contado"
  | "transferencia_diferida"
  | "cuenta_corriente";
export type ModoFacturacion =
  | "por_servicio"
  | "diaria"
  | "quincenal"
  | "mensual"
  | "manual";
export type EstadoEmision =
  | "manual"
  | "borrador"
  | "emitiendo"
  | "emitida"
  | "error";
export type AmbienteArca = "homologacion" | "produccion";

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
  facturacion_modo?: ModoFacturacion;
  facturacion_automatica?: boolean;
  enviar_factura_email?: boolean;
  email_facturacion?: string | null;
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
  patente?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  km_actual?: number | null;
  vtv_vence?: string | null;
  seguro_vence?: string | null;
  seguro_compania?: string | null;
  notas_flota?: string | null;
  coef_precio: number;
  coef_carga_menor_50: number;
  coef_carga_mayor_50: number;
  consumo_l_100km?: number | null;
  estado: "disponible" | "en_servicio" | "taller" | "baja";
  activo: boolean;
  notas?: string | null;
}

export interface Tercerizado {
  id: string;
  nombre: string;
  telefono: string | null;
  cuit: string | null;
  tipo: string | null;
  notas: string | null;
  activo: boolean;
}

export type TipoEventoFlota =
  | "taller"
  | "service"
  | "reparacion"
  | "vtv"
  | "seguro"
  | "patente"
  | "neumaticos"
  | "otro";

export const ETIQUETA_EVENTO_FLOTA: Record<TipoEventoFlota, string> = {
  taller: "Taller",
  service: "Service",
  reparacion: "Reparación",
  vtv: "VTV",
  seguro: "Seguro",
  patente: "Patente",
  neumaticos: "Neumáticos",
  otro: "Otro",
};

export interface EventoFlota {
  id: string;
  vehiculo_id: string | null;
  maquina_id: string | null;
  fecha: string;
  fecha_fin: string | null;
  tipo: TipoEventoFlota;
  descripcion: string | null;
  km: number | null;
  horas: number | null;
  costo: number | null;
  movimiento_id: string | null;
  proximo_vencimiento: string | null;
  proveedor: string | null;
  creado_por: string | null;
  created_at: string;
  vehiculos?: { nombre: string; patente?: string | null } | null;
  maquinas?: {
    codigo_interno: string | null;
    marca?: string | null;
    modelo?: string | null;
  } | null;
}

export type TipoNovedad =
  | "ausente"
  | "medico"
  | "vacaciones"
  | "franco"
  | "feriado"
  | "adelanto"
  | "licencia"
  | "otro";

export const ETIQUETA_TIPO_NOVEDAD: Record<TipoNovedad, string> = {
  ausente: "Ausente",
  medico: "Médico",
  vacaciones: "Vacaciones",
  franco: "Franco",
  feriado: "Feriado",
  adelanto: "Adelanto",
  licencia: "Licencia",
  otro: "Otro",
};

export interface NovedadEmpleado {
  id: string;
  empleado_id: string | null;
  empleado_nombre: string | null;
  fecha: string;
  fecha_hasta: string | null;
  tipo: TipoNovedad;
  monto: number | null;
  movimiento_id: string | null;
  notas: string | null;
  creado_por: string | null;
  created_at: string;
  perfiles?: { nombre: string; rol?: Rol } | null;
}

export interface ParametrosCotizador {
  id: number;
  vigente_desde: string;
  precio_km: number;
  monto_minimo: number;
  km_minimo: number;
  precio_gasoil: number | null;
  recargo_nocturno_pct?: number | null;
  nocturno_desde?: string | null;
  nocturno_hasta?: string | null;
}

export type TipoMaquina =
  | "autoelevador"
  | "plataforma"
  | "zorra"
  | "apilador"
  | "escalera"
  | "otro";
export type EstadoMaquina = "disponible" | "alquilada" | "taller" | "baja";

export interface Maquina {
  id: string;
  codigo_interno: string | null;
  tipo: TipoMaquina;
  marca: string | null;
  modelo: string | null;
  capacidad: string | null;
  anio?: number | null;
  horas_actual?: number | null;
  numero_serie?: string | null;
  combustible?: string | null;
  ultimo_service?: string | null;
  proximo_service?: string | null;
  estado: EstadoMaquina;
  activo: boolean;
  permite_alquiler_hora?: boolean;
  notas: string | null;
}

export type CargaDesde = "origen" | "parada_anterior";
export type EstadoParada = "pendiente" | "completada" | "no_realizada";

export const ETIQUETA_ESTADO_PARADA: Record<EstadoParada, string> = {
  pendiente: "Pendiente",
  completada: "Completada",
  no_realizada: "No realizada",
};

export interface Parada {
  id?: string;
  servicio_id?: string;
  orden: number;
  direccion: string;
  localidad?: string | null;
  carga?: string | null;
  carga_desde: CargaDesde;
  estado: EstadoParada;
  completada_at?: string | null;
  notas?: string | null;
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
  nocturno?: boolean;
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
  tercerizado?: boolean;
  tercerizado_id?: string | null;
  tercero_nombre?: string | null;
  costo_tercero?: number | null;
  presupuesto_id?: string | null;
  moneda?: "ARS" | "USD";
  monto_moneda?: number | null;
  cotizacion?: number | null;
  continuacion_de?: string | null;
  presupuesto_validez_dias?: number | null;
  presupuesto_condiciones?: string | null;
  presupuesto_pdf_path?: string | null;
  presupuesto_generado_at?: string | null;
  created_at: string;
  clientes?: {
    id?: string;
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
  tercerizados?: Tercerizado | null;
  facturas?: {
    id?: string;
    tipo: TipoFactura;
    punto_venta: number;
    numero: number;
    fecha?: string;
  } | null;
  alquileres?: Alquiler | null;
  presupuestos?: {
    id: string;
    numero: number;
    estado: EstadoPresupuesto;
  } | null;
  paradas?: Parada[] | null;
}

export type EstadoPresupuesto =
  | "borrador"
  | "enviado"
  | "aceptado"
  | "rechazado"
  | "vencido";

export interface Presupuesto {
  id: string;
  numero: number;
  fecha: string;
  estado: EstadoPresupuesto;
  cliente_id: string | null;
  prospecto_nombre: string | null;
  prospecto_telefono: string | null;
  prospecto_email: string | null;
  prospecto_cuit: string | null;
  validez_dias: number;
  condiciones: string | null;
  pdf_path: string | null;
  generado_at: string | null;
  enviado_at: string | null;
  respondido_at: string | null;
  notas: string | null;
  creado_por: string | null;
  created_at: string;
  clientes?: {
    id?: string;
    nombre: string;
    cuit?: string | null;
    condicion_iva?: CondicionIva | null;
    telefono?: string | null;
    email?: string | null;
    direccion?: string | null;
    localidad?: string | null;
  } | null;
  servicios?: Servicio[];
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
  punto_venta_ws?: number;
  arca_ambiente?: AmbienteArca;
  tope_diario_facturas?: number;
  tope_diario_monto?: number;
  cbu?: string | null;
  alias_cbu?: string | null;
  banco?: string | null;
  email_facturacion?: string | null;
  texto_pie_factura?: string | null;
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
export type EstadoCheque =
  | "en_cartera"
  | "depositado"
  | "acreditado"
  | "rechazado"
  | "endosado"
  | "emitido"
  | "debitado"
  | "anulado"
  | "descontado";

export interface Cuenta {
  id: string;
  nombre: string;
  saldo_inicial: number;
  activa: boolean;
  orden: number;
}

export type AmbitoMovimiento = "empresa" | "personal";
export type TipoMovimiento = "ingreso" | "egreso" | "transferencia";
export type EstadoMovimiento = "pendiente" | "pagado";
export type TipoComprobanteCompra = "A" | "B" | "C" | "M" | "ticket" | "otro";

export interface CategoriaMovimiento {
  id: string;
  nombre: string;
  ambito: AmbitoMovimiento;
  tipo: "ingreso" | "egreso";
  activa: boolean;
  orden: number;
}

export interface MovimientoCaja {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  ambito: AmbitoMovimiento;
  categoria_id: string | null;
  proveedor: string | null;
  descripcion: string | null;
  medio: MedioPago | null;
  cuenta_id: string | null;
  cuenta_destino_id: string | null;
  monto: number;
  estado: EstadoMovimiento;
  fecha_acreditacion: string | null;
  tiene_comprobante: boolean;
  comprobante_tipo: TipoComprobanteCompra | null;
  comprobante_punto_venta: number | null;
  comprobante_numero: number | null;
  proveedor_cuit: string | null;
  neto: number | null;
  iva: number | null;
  comprobante_path: string | null;
  notas: string | null;
  registrado_por: string | null;
  created_at: string;
  cheque_id?: string | null;
  categorias_movimiento?: { nombre: string } | null;
  cuentas?: { nombre: string } | null;
  cuenta_destino?: { nombre: string } | null;
  cheques?: Cheque | null;
}

export interface SaldoCuenta {
  id: string;
  nombre: string;
  saldo_inicial: number;
  saldo: number;
}

export interface IvaMensual {
  mes: string;
  iva_ventas: number;
  iva_compras: number;
  posicion: number;
}

export interface Cobro {
  id: string;
  cliente_id: string | null;
  fecha: string;
  fecha_acreditacion: string | null;
  monto: number;
  medio: MedioPago;
  cuenta_id: string | null;
  estado: EstadoCobro;
  referencia: string | null;
  cheque_id: string | null;
  registrado_por: string | null;
  notas: string | null;
  created_at: string;
  clientes?: { nombre: string } | null;
  cheques?: Cheque | null;
  cuentas?: { id: string; nombre: string } | null;
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
  cuenta_id?: string | null;
  fecha_deposito?: string | null;
  fecha_acreditacion?: string | null;
  fecha_rechazo?: string | null;
  motivo_rechazo?: string | null;
  endosado_a?: string | null;
  endosado_movimiento_id?: string | null;
  descontado_neto?: number | null;
  descontado_en?: string | null;
  pagado_a?: string | null;
  movimiento_id?: string | null;
  imagen_path?: string | null;
  updated_at?: string;
  clientes?: { nombre: string } | null;
  cuentas?: { id: string; nombre: string } | null;
}

export interface ChequeEvento {
  id: number;
  cheque_id: string;
  estado_anterior: EstadoCheque | null;
  estado_nuevo: EstadoCheque;
  usuario_id: string | null;
  nota: string | null;
  created_at: string;
  perfiles?: { nombre: string } | null;
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

export const ETIQUETA_MODO_FACTURACION: Record<ModoFacturacion, string> = {
  por_servicio: "Por servicio",
  diaria: "Diaria",
  quincenal: "Quincenal",
  mensual: "Mensual",
  manual: "Manual",
};

export const ETIQUETA_ESTADO_EMISION: Record<EstadoEmision, string> = {
  manual: "Manual",
  borrador: "Borrador",
  emitiendo: "Emitiendo",
  emitida: "Emitida",
  error: "Error",
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
  cheque_terceros: "Cheque de terceros",
  cheque_propio: "Cheque propio",
  debito_automatico: "Débito automático",
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
  emitido: "Emitido",
  debitado: "Debitado",
  anulado: "Anulado",
  descontado: "Descontado",
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

export function formatearUnidadPlural(
  unidad: UnidadAlquiler,
  cantidad: number,
): string {
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
  cae_vencimiento?: string | null;
  concepto?: number | null;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  fecha_vto_pago?: string | null;
  estado_emision?: EstadoEmision | null;
  error_emision?: string | null;
  emitida_at?: string | null;
  enviada_email_at?: string | null;
  email_destino?: string | null;
  lote_id?: string | null;
  pdf_path?: string | null;
  notas?: string | null;
  created_at?: string;
  factura_asociada_id: string | null;
  anulada: boolean;
  clientes?: {
    nombre: string;
    cuit?: string | null;
    condicion_iva?: CondicionIva | null;
  } | null;
  factura_asociada?: {
    tipo: TipoFactura;
    punto_venta: number;
    numero: number;
  } | null;
}

export interface DescartadoLote {
  cliente_id?: string;
  cliente?: string;
  motivo?: string;
  error?: string;
  servicios?: Array<{
    id: string;
    numero: number;
    descripcion?: string | null;
  }>;
}

export interface LoteEmision {
  id: string;
  fecha: string;
  iniciado_at: string;
  finalizado_at: string | null;
  disparado_por: string;
  facturas_emitidas: number;
  monto_total: number;
  descartados: DescartadoLote[];
  error: string | null;
}

export interface ArcaLog {
  id: number;
  factura_id: string | null;
  accion: string;
  ambiente: AmbienteArca;
  request: any;
  response: any;
  exito: boolean;
  duracion_ms: number;
  created_at: string;
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

import type { FrecuenciaVencimiento } from "./vencimientos";
export type { FrecuenciaVencimiento };

export type EstadoInstancia = "pendiente" | "pagado" | "omitido";

export interface Vencimiento {
  id: string;
  titulo: string;
  ambito: AmbitoMovimiento;
  categoria_id: string | null;
  proveedor: string | null;
  monto_estimado: number | null;
  cuenta_sugerida_id: string | null;
  medio_sugerido: MedioPago | null;
  frecuencia: FrecuenciaVencimiento;
  dia_del_mes: number | null;
  dia_semana: number | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  cuotas_total: number | null;
  cuotas_pagadas: number;
  recordar_dias_antes: number;
  activo: boolean;
  notas: string | null;
  created_at: string;
  categorias_movimiento?: { nombre: string } | null;
  cuentas?: { id: string; nombre: string } | null;
}

export interface VencimientoInstancia {
  id: string;
  vencimiento_id: string;
  fecha: string;
  numero_cuota: number | null;
  monto_estimado: number | null;
  estado: EstadoInstancia;
  movimiento_id: string | null;
  pagado_at: string | null;
  gcal_event_id: string | null;
  nota?: string | null;
  vencimientos?: Vencimiento | null;
}

export interface ItemAgenda {
  clave: string;
  fecha: string;
  sentido: "ingreso" | "egreso" | "info";
  titulo: string;
  detalle: string | null;
  monto: number | null;
  cuenta_id: string | null;
  estado: string;
  ambito: string;
  url: string;
}

export const ETIQUETA_FRECUENCIA_VENCIMIENTO: Record<
  FrecuenciaVencimiento,
  string
> = {
  unica: "Única vez",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
  bimestral: "Bimestral",
  anual: "Anual",
};

export const ETIQUETA_ESTADO_INSTANCIA: Record<EstadoInstancia, string> = {
  pendiente: "Pendiente",
  pagado: "Pagado",
  omitido: "Omitido",
};
