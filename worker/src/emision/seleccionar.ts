export type ModoFacturacion = "por_servicio" | "diaria" | "quincenal" | "mensual" | "manual";

export interface ClienteSeleccion {
  id: string;
  nombre: string;
  cuit: string | null;
  condicion_iva: "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | string | null;
  facturacion_modo?: ModoFacturacion | null;
  facturacion_automatica?: boolean | null;
  enviar_factura_email?: boolean | null;
  email_facturacion?: string | null;
  email?: string | null;
  dias_pago?: number | null;
}

export interface ServicioSeleccion {
  id: string;
  numero: number;
  cliente_id: string | null;
  descripcion: string | null;
  monto: number | null;
  aplica_iva?: boolean | null;
  fecha_programada?: string | null;
  fecha_fin?: string | null;
  fecha_inicio?: string | null;
}

export interface FacturaAEmitir {
  cliente: ClienteSeleccion;
  servicios: ServicioSeleccion[];
  tipo: "A" | "B";
  periodo_desde: string; // YYYY-MM-DD
  periodo_hasta: string; // YYYY-MM-DD
  total: number;
}

export interface DescartadoItem {
  cliente_id: string;
  cliente: string;
  motivo: "sin_cuit" | "sin_condicion_iva" | "requiere_dni" | "sin_monto" | "sin_iva_en_a";
  servicios: Array<{
    id: string;
    numero: number;
    descripcion: string | null;
  }>;
}

export interface ResultadoSeleccion {
  aEmitir: FacturaAEmitir[];
  descartados: DescartadoItem[];
}

export const TOPE_IDENTIFICACION_CONSUMIDOR_FINAL = 300000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function obtenerFechaServicio(s: ServicioSeleccion): string | null {
  const f = s.fecha_fin || s.fecha_programada || s.fecha_inicio;
  return f ? f.slice(0, 10) : null;
}

function calcularTotal(servicios: ServicioSeleccion[]): number {
  let neto = 0;
  let baseIva = 0;
  for (const s of servicios) {
    const monto = Number(s.monto) || 0;
    neto += monto;
    if (s.aplica_iva !== false) {
      baseIva += monto;
    }
  }
  const iva = Math.round((baseIva * 0.21 + Number.EPSILON) * 100) / 100;
  return Math.round((neto + iva + Number.EPSILON) * 100) / 100;
}

/**
 * Selecciona y agrupa qué servicios deben facturarse hoy según la política de cada cliente.
 */
export function seleccionarFacturasHoy(
  fechaHoy: string, // YYYY-MM-DD
  clientes: ClienteSeleccion[],
  servicios: ServicioSeleccion[]
): ResultadoSeleccion {
  const aEmitir: FacturaAEmitir[] = [];
  const descartados: DescartadoItem[] = [];

  const hoyAno = parseInt(fechaHoy.slice(0, 4), 10);
  const hoyMes = parseInt(fechaHoy.slice(5, 7), 10);
  const hoyDia = parseInt(fechaHoy.slice(8, 10), 10);

  // Mapear clientes por ID
  const clientesMap = new Map<string, ClienteSeleccion>();
  for (const c of clientes) {
    clientesMap.set(c.id, c);
  }

  // Agrupar servicios por cliente_id
  const serviciosPorCliente = new Map<string, ServicioSeleccion[]>();
  for (const s of servicios) {
    if (!s.cliente_id) continue;
    const lista = serviciosPorCliente.get(s.cliente_id) || [];
    lista.push(s);
    serviciosPorCliente.set(s.cliente_id, lista);
  }

  for (const [clienteId, servs] of serviciosPorCliente.entries()) {
    const cliente = clientesMap.get(clienteId);
    if (!cliente) continue;

    const modo = cliente.facturacion_modo || "manual";
    const esAutomatica = Boolean(cliente.facturacion_automatica);

    // Regla: manual o facturacion_automatica = false -> nunca
    if (modo === "manual" || !esAutomatica) {
      continue;
    }

    // Filtrar servicios aplicables según modo
    let serviciosCandidatos: ServicioSeleccion[] = [];
    let periodoDesde = fechaHoy;
    let periodoHasta = fechaHoy;

    if (modo === "diaria" || modo === "por_servicio") {
      serviciosCandidatos = servs.filter((s) => {
        const fs = obtenerFechaServicio(s);
        return fs !== null && fs <= fechaHoy;
      });
    } else if (modo === "quincenal") {
      if (hoyDia === 16) {
        // Quincena anterior: 1 al 15 del mes actual
        periodoDesde = `${hoyAno}-${pad(hoyMes)}-01`;
        periodoHasta = `${hoyAno}-${pad(hoyMes)}-15`;
        serviciosCandidatos = servs.filter((s) => {
          const fs = obtenerFechaServicio(s);
          return fs !== null && fs >= periodoDesde && fs <= periodoHasta;
        });
      } else if (hoyDia === 1) {
        // Quincena anterior: 16 al fin de mes del mes anterior
        const prevMes = hoyMes === 1 ? 12 : hoyMes - 1;
        const prevAno = hoyMes === 1 ? hoyAno - 1 : hoyAno;
        const ultimoDia = new Date(Date.UTC(prevAno, prevMes, 0)).getUTCDate();
        periodoDesde = `${prevAno}-${pad(prevMes)}-16`;
        periodoHasta = `${prevAno}-${pad(prevMes)}-${pad(ultimoDia)}`;
        serviciosCandidatos = servs.filter((s) => {
          const fs = obtenerFechaServicio(s);
          return fs !== null && fs >= periodoDesde && fs <= periodoHasta;
        });
      } else {
        // No es día de facturación quincenal
        continue;
      }
    } else if (modo === "mensual") {
      if (hoyDia === 1) {
        // Mes anterior completo
        const prevMes = hoyMes === 1 ? 12 : hoyMes - 1;
        const prevAno = hoyMes === 1 ? hoyAno - 1 : hoyAno;
        const ultimoDia = new Date(Date.UTC(prevAno, prevMes, 0)).getUTCDate();
        periodoDesde = `${prevAno}-${pad(prevMes)}-01`;
        periodoHasta = `${prevAno}-${pad(prevMes)}-${pad(ultimoDia)}`;
        serviciosCandidatos = servs.filter((s) => {
          const fs = obtenerFechaServicio(s);
          return fs !== null && fs >= periodoDesde && fs <= periodoHasta;
        });
      } else {
        // No es día de facturación mensual
        continue;
      }
    }

    if (serviciosCandidatos.length === 0) {
      continue;
    }

    // Dividir en grupos según modo
    const grupos: ServicioSeleccion[][] =
      modo === "por_servicio"
        ? serviciosCandidatos.map((s) => [s])
        : [serviciosCandidatos];

    for (const grupo of grupos) {
      const resumenServicios = grupo.map((s) => ({
        id: s.id,
        numero: s.numero,
        descripcion: s.descripcion,
      }));

      // Validar servicios sin monto
      const tieneServicioSinMonto = grupo.some(
        (s) => s.monto === null || s.monto === undefined || Number(s.monto) <= 0
      );
      if (tieneServicioSinMonto) {
        descartados.push({
          cliente_id: cliente.id,
          cliente: cliente.nombre,
          motivo: "sin_monto",
          servicios: resumenServicios,
        });
        continue;
      }

      // Validar condicion_iva
      if (!cliente.condicion_iva) {
        descartados.push({
          cliente_id: cliente.id,
          cliente: cliente.nombre,
          motivo: "sin_condicion_iva",
          servicios: resumenServicios,
        });
        continue;
      }

      // Validar cliente RI sin CUIT
      const esRI = cliente.condicion_iva === "responsable_inscripto";
      const cuitLimpio = cliente.cuit ? cliente.cuit.replace(/\D/g, "") : "";
      if (esRI && cuitLimpio.length === 0) {
        descartados.push({
          cliente_id: cliente.id,
          cliente: cliente.nombre,
          motivo: "sin_cuit",
          servicios: resumenServicios,
        });
        continue;
      }

      const tipo: "A" | "B" = esRI ? "A" : "B";

      // Validar Factura A sin IVA
      if (tipo === "A" && grupo.every((s) => s.aplica_iva === false)) {
        descartados.push({
          cliente_id: cliente.id,
          cliente: cliente.nombre,
          motivo: "sin_iva_en_a",
          servicios: resumenServicios,
        });
        continue;
      }

      const totalFactura = calcularTotal(grupo);

      // Validar Factura B a consumidor final sin DNI por encima del tope
      if (
        tipo === "B" &&
        cliente.condicion_iva === "consumidor_final" &&
        cuitLimpio.length === 0 &&
        totalFactura > TOPE_IDENTIFICACION_CONSUMIDOR_FINAL
      ) {
        descartados.push({
          cliente_id: cliente.id,
          cliente: cliente.nombre,
          motivo: "requiere_dni",
          servicios: resumenServicios,
        });
        continue;
      }

      // Períodos del grupo
      let pDesde = periodoDesde;
      let pHasta = periodoHasta;
      if (modo === "diaria" || modo === "por_servicio") {
        const fechas = grupo
          .map(obtenerFechaServicio)
          .filter((f): f is string => f !== null)
          .sort();
        pDesde = fechas[0] || fechaHoy;
        pHasta = fechas[fechas.length - 1] || fechaHoy;
      }

      aEmitir.push({
        cliente,
        servicios: grupo,
        tipo,
        periodo_desde: pDesde,
        periodo_hasta: pHasta,
        total: totalFactura,
      });
    }
  }

  return { aEmitir, descartados };
}
