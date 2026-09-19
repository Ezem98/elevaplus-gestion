/**
 * Constantes de IDs fijos para pruebas locales, de integración y E2E.
 * IMPORTANTE: Debe mantenerse estrictamente sincronizado con supabase/seed-test.sql.
 */

export const USUARIOS = {
  admin: {
    id: "a0000000-0000-0000-0000-000000000001",
    email: "admin@test.local",
    password: "test1234",
    nombre: "Admin Test",
    rol: "admin" as const,
  },
  oficina: {
    id: "a0000000-0000-0000-0000-000000000002",
    email: "oficina@test.local",
    password: "test1234",
    nombre: "Oficina Test",
    rol: "oficina" as const,
  },
  chofer1: {
    id: "a0000000-0000-0000-0000-000000000003",
    email: "chofer1@test.local",
    password: "test1234",
    nombre: "Chofer 1 Test",
    rol: "chofer" as const,
  },
  chofer2: {
    id: "a0000000-0000-0000-0000-000000000004",
    email: "chofer2@test.local",
    password: "test1234",
    nombre: "Chofer 2 Test",
    rol: "chofer" as const,
  },
} as const;

export const CLIENTES = {
  deza: {
    id: "c0000000-0000-0000-0000-000000000001",
    nombre: "Deza Test",
    cuit: "30-50001091-2",
    condicion_iva: "responsable_inscripto" as const,
  },
  monotributo: {
    id: "c0000000-0000-0000-0000-000000000002",
    nombre: "Monotributo Test",
    cuit: "20-22651487-3",
    condicion_iva: "monotributo" as const,
  },
  consumidorFinal: {
    id: "c0000000-0000-0000-0000-000000000003",
    nombre: "Consumidor Test",
    cuit: null,
    condicion_iva: "consumidor_final" as const,
  },
} as const;

export const CUENTAS = {
  efectivo: {
    id: "b0000000-0000-0000-0000-000000000001",
    nombre: "Efectivo",
    saldo_inicial: 100000,
  },
  mercadoPago: {
    id: "b0000000-0000-0000-0000-000000000002",
    nombre: "Mercado Pago",
    saldo_inicial: 0,
  },
  credicoop: {
    id: "b0000000-0000-0000-0000-000000000003",
    nombre: "Credicoop",
    saldo_inicial: 0,
  },
  galicia: {
    id: "b0000000-0000-0000-0000-000000000004",
    nombre: "Galicia",
    saldo_inicial: 0,
  },
} as const;

export const VEHICULOS = {
  fordCargo: {
    id: "e0000000-0000-0000-0000-000000000001",
    nombre: "Ford Cargo",
    tipo: "camion" as const,
    coef_precio: 1.8,
    coef_carga_menor_50: 1.4,
    coef_carga_mayor_50: 1.5,
    consumo_l_100km: 20.0,
  },
  ranger: {
    id: "e0000000-0000-0000-0000-000000000002",
    nombre: "Ranger",
    tipo: "camioneta" as const,
    coef_precio: 1.1,
    coef_carga_menor_50: 1.1,
    coef_carga_mayor_50: 1.2,
    consumo_l_100km: 11.5,
  },
} as const;

export const MAQUINAS = {
  ae01: {
    id: "f0000000-0000-0000-0000-000000000001",
    codigo_interno: "AE-01",
    tipo: "autoelevador" as const,
  },
  ae02: {
    id: "f0000000-0000-0000-0000-000000000002",
    codigo_interno: "AE-02",
    tipo: "autoelevador" as const,
  },
} as const;

export const EMPRESA = {
  id: 1,
  razon_social: "ALICIA ELIZABETH GAMARRA",
  cuit: "27-22651487-8",
} as const;

export const PARAMETROS_COTIZADOR = {
  id: 1,
  precio_km: 1700,
  monto_minimo: 15000,
  km_minimo: 1,
  precio_gasoil: 1600,
} as const;

export const CATEGORIAS_MOVIMIENTO = {
  combustible: "d0000000-0000-0000-0000-000000000001",
  mantenimientoReparaciones: "d0000000-0000-0000-0000-000000000002",
  repuestos: "d0000000-0000-0000-0000-000000000003",
  peajesViaticos: "d0000000-0000-0000-0000-000000000004",
  tercerizados: "d0000000-0000-0000-0000-000000000005",
  sueldosCargasSociales: "d0000000-0000-0000-0000-000000000006",
  honorarios: "d0000000-0000-0000-0000-000000000007",
  impuestosTasas: "d0000000-0000-0000-0000-000000000008",
  seguros: "d0000000-0000-0000-0000-000000000009",
  serviciosGalpon: "d0000000-0000-0000-0000-000000000010",
  alquilerGalpon: "d0000000-0000-0000-0000-000000000011",
  bancariosComisiones: "d0000000-0000-0000-0000-000000000012",
  equipamiento: "d0000000-0000-0000-0000-000000000013",
  otrosGastosEmpresa: "d0000000-0000-0000-0000-000000000014",
  ventaEquipos: "d0000000-0000-0000-0000-000000000015",
  otrosIngresosEmpresa: "d0000000-0000-0000-0000-000000000016",
  vivienda: "d0000000-0000-0000-0000-000000000017",
  serviciosHogar: "d0000000-0000-0000-0000-000000000018",
  alimentacion: "d0000000-0000-0000-0000-000000000019",
  salud: "d0000000-0000-0000-0000-000000000020",
  mascotas: "d0000000-0000-0000-0000-000000000021",
  transporte: "d0000000-0000-0000-0000-000000000022",
  familia: "d0000000-0000-0000-0000-000000000023",
  otrosGastosPersonal: "d0000000-0000-0000-0000-000000000024",
  retiroEmpresa: "d0000000-0000-0000-0000-000000000025",
  otrosIngresosPersonal: "d0000000-0000-0000-0000-000000000026",
} as const;
