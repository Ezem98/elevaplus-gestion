import {
  TIPO_COMPROBANTE,
  CONCEPTO,
  TIPO_DOCUMENTO,
  ALICUOTA_IVA_ID,
  obtenerCondicionIvaReceptorId,
} from "./codigos";

export interface ClienteParaFactura {
  cuit: string | null;
  condicion_iva: "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | string | null;
  dias_pago?: number | null;
}

export interface ServicioParaFactura {
  id: string;
  monto: number | null;
  aplica_iva?: boolean | null;
  fecha_programada?: string | null;
  fecha_fin?: string | null;
}

export interface OpcionesMapeoFactura {
  tipo: "A" | "B";
  puntoDeVenta: number;
  numeroComprobante: number;
  fechaEmision?: string; // YYYY-MM-DD
  periodoDesde?: string; // YYYY-MM-DD
  periodoHasta?: string; // YYYY-MM-DD
  cliente: ClienteParaFactura;
  servicios: ServicioParaFactura[];
}

export interface PayloadAfipVoucher {
  CantReg: number;
  PtoVta: number;
  CbteTipo: number;
  Concepto: number;
  DocTipo: number;
  DocNro: number;
  CbteDesde: number;
  CbteHasta: number;
  CbteFch: number;
  FchServDesde: number;
  FchServHasta: number;
  FchVtoPago: number;
  ImpTotal: number;
  ImpTotConc: number;
  ImpNeto: number;
  ImpOpEx: number;
  ImpIVA: number;
  ImpTrib: number;
  MonId: string;
  MonCotiz: number;
  CondicionIVAReceptorId: number;
  Iva?: Array<{
    Id: number;
    BaseImp: number;
    Importe: number;
  }>;
}

function redondearDosDecimales(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function fechaAEntero(fechaStr: string): number {
  return parseInt(fechaStr.slice(0, 10).replace(/-/g, ""), 10);
}

function sumarDias(fechaStr: string, dias: number): string {
  const d = new Date(fechaStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Mapea los datos de cliente, servicios y parámetros de comprobante
 * al payload requerido por WSFEv1 a través de Afip SDK.
 */
export function mapearFacturaAComprobanteArca(opciones: OpcionesMapeoFactura): PayloadAfipVoucher {
  const {
    tipo,
    puntoDeVenta,
    numeroComprobante,
    cliente,
    servicios,
    periodoDesde,
    periodoHasta,
  } = opciones;

  const hoyStr = opciones.fechaEmision || new Date().toISOString().slice(0, 10);
  const cbteFch = fechaAEntero(hoyStr);

  // Tipo de comprobante
  const cbteTipo = tipo === "A" ? TIPO_COMPROBANTE.FACTURA_A : TIPO_COMPROBANTE.FACTURA_B;

  // Documento del receptor
  let docTipo: number = TIPO_DOCUMENTO.CONSUMIDOR_FINAL;
  let docNro = 0;

  const cuitLimpio = cliente.cuit ? cliente.cuit.replace(/\D/g, "") : "";
  if (cuitLimpio.length === 11) {
    docTipo = TIPO_DOCUMENTO.CUIT;
    docNro = Number(cuitLimpio);
  } else if (cuitLimpio.length === 7 || cuitLimpio.length === 8) {
    docTipo = TIPO_DOCUMENTO.DNI;
    docNro = Number(cuitLimpio);
  } else if (cuitLimpio.length > 0) {
    docTipo = TIPO_DOCUMENTO.CUIT;
    docNro = Number(cuitLimpio);
  } else {
    docTipo = TIPO_DOCUMENTO.CONSUMIDOR_FINAL;
    docNro = 0;
  }

  // Condición IVA del receptor
  const condicionIvaId = obtenerCondicionIvaReceptorId(cliente.condicion_iva);

  // Períodos de servicio
  let fchDesdeStr = periodoDesde;
  let fchHastaStr = periodoHasta;

  if (!fchDesdeStr || !fchHastaStr) {
    const fechasServicios: string[] = [];
    for (const s of servicios) {
      const f = s.fecha_fin || s.fecha_programada;
      if (f) fechasServicios.push(f.slice(0, 10));
    }
    fechasServicios.sort();
    fchDesdeStr = fchDesdeStr || (fechasServicios.length > 0 ? fechasServicios[0] : hoyStr);
    fchHastaStr = fchHastaStr || (fechasServicios.length > 0 ? fechasServicios[fechasServicios.length - 1] : hoyStr);
  }

  const fchServDesde = fechaAEntero(fchDesdeStr);
  const fchServHasta = fechaAEntero(fchHastaStr);

  // Vencimiento de pago: fecha + dias_pago (mínimo fecha actual)
  const diasPago = Math.max(0, Number(cliente.dias_pago) || 0);
  const vtoPagoStr = diasPago > 0 ? sumarDias(hoyStr, diasPago) : hoyStr;
  const fchVtoPago = fechaAEntero(vtoPagoStr);

  // Cálculo de importes
  let netoGravado = 0;
  let exento = 0;

  for (const s of servicios) {
    const monto = Number(s.monto) || 0;
    if (s.aplica_iva !== false) {
      netoGravado += monto;
    } else {
      exento += monto;
    }
  }

  netoGravado = redondearDosDecimales(netoGravado);
  exento = redondearDosDecimales(exento);
  const impIVA = redondearDosDecimales(netoGravado * 0.21);
  const impTotal = redondearDosDecimales(netoGravado + exento + impIVA);

  const payload: PayloadAfipVoucher = {
    CantReg: 1,
    PtoVta: puntoDeVenta,
    CbteTipo: cbteTipo,
    Concepto: CONCEPTO.SERVICIOS,
    DocTipo: docTipo,
    DocNro: docNro,
    CbteDesde: numeroComprobante,
    CbteHasta: numeroComprobante,
    CbteFch: cbteFch,
    FchServDesde: fchServDesde,
    FchServHasta: fchServHasta,
    FchVtoPago: fchVtoPago,
    ImpTotal: impTotal,
    ImpTotConc: 0,
    ImpNeto: netoGravado,
    ImpOpEx: exento,
    ImpIVA: impIVA,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: condicionIvaId,
  };

  if (impIVA > 0) {
    payload.Iva = [
      {
        Id: ALICUOTA_IVA_ID.IVA_21,
        BaseImp: netoGravado,
        Importe: impIVA,
      },
    ];
  }

  return payload;
}
