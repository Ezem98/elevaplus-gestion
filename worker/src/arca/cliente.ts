import Afip from "@afipsdk/afip.js";
import { config } from "../config";
import { supabaseAdmin } from "../supabase";
import type { PayloadAfipVoucher } from "./mapear";

export type AmbienteArca = "homologacion" | "produccion";

export interface OpcionesClienteArca {
  cuit?: number;
  ambiente?: AmbienteArca;
  cert?: string;
  key?: string;
  accessToken?: string;
}

export interface RespuestaCrearComprobante {
  CAE: string;
  CAEFchVto: string;
}

/** CUIT genérico de prueba provisto por Afip SDK para el ambiente de homologación. */
export const CUIT_HOMOLOGACION_AFIPSDK = 20409378472;

function decodificarCertificado(val?: string): string | undefined {
  if (!val) return undefined;
  if (val.includes("-----BEGIN")) return val;
  try {
    const decoded = Buffer.from(val, "base64").toString("utf-8");
    if (decoded.includes("-----BEGIN")) return decoded;
  } catch {
    // Si no es base64 válido, retorna el valor original
  }
  return val;
}

/**
 * Crea una instancia de Afip configurada según el ambiente y credenciales.
 */
export function obtenerInstanciaAfip(opciones: OpcionesClienteArca = {}): any {
  const ambiente = opciones.ambiente || "homologacion";
  const esProduccion = ambiente === "produccion";
  const cert = decodificarCertificado(opciones.cert || config.ARCA_CERT);
  const key = decodificarCertificado(opciones.key || config.ARCA_KEY);
  const cuit = esProduccion
    ? opciones.cuit || config.ARCA_CUIT
    : opciones.cuit || config.ARCA_CUIT || CUIT_HOMOLOGACION_AFIPSDK;
  const tokenRaw = opciones.accessToken ?? config.AFIPSDK_ACCESS_TOKEN;
  const accessToken =
    tokenRaw && tokenRaw.trim().length > 0 ? tokenRaw.trim() : undefined;

  if (esProduccion) {
    const faltantes: string[] = [];
    if (!cuit) faltantes.push("ARCA_CUIT");
    if (!cert) faltantes.push("ARCA_CERT");
    if (!key) faltantes.push("ARCA_KEY");
    if (!accessToken) faltantes.push("AFIPSDK_ACCESS_TOKEN");

    if (faltantes.length > 0) {
      throw new Error(
        `Faltan variables requeridas para ARCA en producción: ${faltantes.join(", ")}`,
      );
    }
  }

  const params: any = {
    CUIT: cuit,
    production: esProduccion,
    access_token: accessToken || "",
  };

  if (cert && key) {
    params.cert = cert;
    params.key = key;
  }

  return new Afip(params);
}

/**
 * Registra una llamada al WS de ARCA en la tabla arca_log.
 */
export async function registrarLogArca(params: {
  factura_id?: string | null;
  accion: "ultimo_comprobante" | "crear_comprobante" | "consultar" | string;
  ambiente: AmbienteArca;
  request?: any;
  response?: any;
  exito: boolean;
  duracion_ms: number;
}): Promise<void> {
  try {
    await supabaseAdmin.from("arca_log").insert({
      factura_id: params.factura_id || null,
      accion: params.accion,
      ambiente: params.ambiente,
      request: params.request ?? null,
      response: params.response ?? null,
      exito: params.exito,
      duracion_ms: params.duracion_ms,
    });
  } catch (err) {
    console.error("Error al registrar en arca_log:", err);
  }
}

/**
 * Consulta el último número de comprobante autorizado para un punto de venta y tipo.
 */
export async function obtenerUltimoComprobante(
  puntoDeVenta: number,
  tipoDeComprobante: number,
  opciones: OpcionesClienteArca & { facturaId?: string } = {}
): Promise<number> {
  const ambiente = opciones.ambiente || "homologacion";
  const afip = obtenerInstanciaAfip(opciones);
  const inicio = Date.now();

  try {
    const ultimo = await afip.ElectronicBilling.getLastVoucher(puntoDeVenta, tipoDeComprobante);
    const duracion = Date.now() - inicio;

    await registrarLogArca({
      factura_id: opciones.facturaId,
      accion: "ultimo_comprobante",
      ambiente,
      request: { puntoDeVenta, tipoDeComprobante },
      response: { ultimo },
      exito: true,
      duracion_ms: duracion,
    });

    return Number(ultimo) || 0;
  } catch (error: any) {
    const duracion = Date.now() - inicio;

    await registrarLogArca({
      factura_id: opciones.facturaId,
      accion: "ultimo_comprobante",
      ambiente,
      request: { puntoDeVenta, tipoDeComprobante },
      response: { error: error?.message || String(error) },
      exito: false,
      duracion_ms: duracion,
    });

    throw error;
  }
}

/**
 * Crea y solicita CAE para un comprobante en ARCA.
 */
export async function solicitarComprobanteArca(
  payload: PayloadAfipVoucher,
  opciones: OpcionesClienteArca & { facturaId?: string } = {}
): Promise<RespuestaCrearComprobante> {
  const ambiente = opciones.ambiente || "homologacion";
  const afip = obtenerInstanciaAfip(opciones);
  const inicio = Date.now();

  try {
    const res = await afip.ElectronicBilling.createVoucher(payload);
    const duracion = Date.now() - inicio;

    await registrarLogArca({
      factura_id: opciones.facturaId,
      accion: "crear_comprobante",
      ambiente,
      request: payload,
      response: res,
      exito: true,
      duracion_ms: duracion,
    });

    if (!res?.CAE) {
      throw new Error(`ARCA no retornó CAE: ${JSON.stringify(res)}`);
    }

    return {
      CAE: String(res.CAE),
      CAEFchVto: String(res.CAEFchVto),
    };
  } catch (error: any) {
    const duracion = Date.now() - inicio;

    await registrarLogArca({
      factura_id: opciones.facturaId,
      accion: "crear_comprobante",
      ambiente,
      request: payload,
      response: { error: error?.message || String(error) },
      exito: false,
      duracion_ms: duracion,
    });

    throw error;
  }
}

/**
 * Consulta la información de un comprobante ya emitido.
 */
export async function consultarComprobanteArca(
  numero: number,
  puntoDeVenta: number,
  tipoDeComprobante: number,
  opciones: OpcionesClienteArca & { facturaId?: string } = {}
): Promise<any> {
  const ambiente = opciones.ambiente || "homologacion";
  const afip = obtenerInstanciaAfip(opciones);
  const inicio = Date.now();

  try {
    const res = await afip.ElectronicBilling.getVoucherInfo(numero, puntoDeVenta, tipoDeComprobante);
    const duracion = Date.now() - inicio;

    await registrarLogArca({
      factura_id: opciones.facturaId,
      accion: "consultar",
      ambiente,
      request: { numero, puntoDeVenta, tipoDeComprobante },
      response: res,
      exito: true,
      duracion_ms: duracion,
    });

    return res;
  } catch (error: any) {
    const duracion = Date.now() - inicio;

    await registrarLogArca({
      factura_id: opciones.facturaId,
      accion: "consultar",
      ambiente,
      request: { numero, puntoDeVenta, tipoDeComprobante },
      response: { error: error?.message || String(error) },
      exito: false,
      duracion_ms: duracion,
    });

    throw error;
  }
}
