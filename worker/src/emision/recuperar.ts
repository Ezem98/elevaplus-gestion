import { supabaseAdmin } from "../supabase";
import { TIPO_COMPROBANTE } from "../arca/codigos";
import {
  obtenerUltimoComprobante,
  consultarComprobanteArca,
  type AmbienteArca,
} from "../arca/cliente";
import { generarYSubirPdfFactura } from "../pdf/generar";
import { config } from "../config";

export interface ComprobanteArcaRespuesta {
  ImpTotal?: number;
  DocNro?: number | string;
  CodAutorizacion?: string;
  CAE?: string;
  FchVto?: string | number;
  CAEFchVto?: string | number;
}

export interface EvaluacionRecuperacionParams {
  facturaTotal: number;
  clienteCuit?: string | null;
  comprobanteArca: ComprobanteArcaRespuesta | null;
  yaExisteFacturaEmitidaConEseNumero: boolean;
}

export interface ResultadoEvaluacionRecuperacion {
  coincide: boolean;
  motivo: string;
  cae?: string;
  caeVencimiento?: string;
}

export function formatearFechaArca(fch?: string | number | null): string | undefined {
  if (!fch) return undefined;
  const str = String(fch).trim();
  if (str.includes("-")) return str;
  if (str.length === 8) {
    const anio = str.slice(0, 4);
    const mes = str.slice(4, 6);
    const dia = str.slice(6, 8);
    return `${anio}-${mes}-${dia}`;
  }
  return str;
}

/**
 * Función pura que decide si un comprobante consultado en ARCA coincide
 * fehacientemente con una factura que quedó colgada en 'emitiendo'.
 */
export function evaluarRecuperacionComprobante(
  params: EvaluacionRecuperacionParams
): ResultadoEvaluacionRecuperacion {
  const {
    facturaTotal,
    clienteCuit,
    comprobanteArca,
    yaExisteFacturaEmitidaConEseNumero,
  } = params;

  if (!comprobanteArca) {
    return {
      coincide: false,
      motivo: "El comprobante no existe en ARCA.",
    };
  }

  if (yaExisteFacturaEmitidaConEseNumero) {
    return {
      coincide: false,
      motivo: "El número de comprobante ya está asignado a otra factura emitida en el sistema.",
    };
  }

  // Verificar total
  const impTotal = Number(comprobanteArca.ImpTotal) || 0;
  if (Math.abs(impTotal - facturaTotal) > 0.01) {
    return {
      coincide: false,
      motivo: `El importe total en ARCA ($${impTotal}) no coincide con el de la factura ($${facturaTotal}).`,
    };
  }

  // Verificar CUIT del receptor si aplica
  if (clienteCuit) {
    const cuitLimpio = clienteCuit.replace(/\D/g, "");
    const docNroArca = String(comprobanteArca.DocNro || "").replace(/\D/g, "");
    if (cuitLimpio && docNroArca && docNroArca !== "0" && docNroArca !== cuitLimpio) {
      return {
        coincide: false,
        motivo: `El CUIT del receptor en ARCA (${docNroArca}) no coincide con el del cliente (${cuitLimpio}).`,
      };
    }
  }

  const cae = comprobanteArca.CodAutorizacion || comprobanteArca.CAE;
  if (!cae) {
    return {
      coincide: false,
      motivo: "El comprobante en ARCA no contiene código de autorización (CAE).",
    };
  }

  const fchVto = formatearFechaArca(comprobanteArca.FchVto || comprobanteArca.CAEFchVto);

  return {
    coincide: true,
    motivo: "Comprobante verificado con éxito en ARCA.",
    cae: String(cae),
    caeVencimiento: fchVto,
  };
}

export interface ResultadoRecuperacionColgadas {
  encontradas: number;
  recuperadas: number;
  desvinculadas: number;
}

/**
 * Busca facturas que quedaron en 'emitiendo' por más de 10 minutos (por crash o reinicio del worker).
 * Para cada una:
 * - Consulta ARCA para ver si llegó a emitirse y obtener el CAE.
 * - Si se autorizó: la pasa a 'emitida', vincula los servicios como 'facturados' y genera el PDF.
 * - Si no se autorizó o no coincide: la pasa a 'error' y desvincula los servicios para que vuelvan a pendientes.
 */
export async function recuperarFacturasColgadas(minutosLimite = 10): Promise<ResultadoRecuperacionColgadas> {
  const haceDiezMinutos = new Date(Date.now() - minutosLimite * 60 * 1000).toISOString();

  // 1. Buscar facturas en 'emitiendo' con más de 10 minutos de antigüedad
  const { data: facturasColgadas, error: errFacturas } = await supabaseAdmin
    .from("facturas")
    .select("id, tipo, punto_venta, numero, total, cliente_id, created_at, clientes(cuit)")
    .eq("estado_emision", "emitiendo")
    .lte("created_at", haceDiezMinutos);

  if (errFacturas) {
    console.error("Error al buscar facturas colgadas:", errFacturas);
    return { encontradas: 0, recuperadas: 0, desvinculadas: 0 };
  }

  if (!facturasColgadas || facturasColgadas.length === 0) {
    return { encontradas: 0, recuperadas: 0, desvinculadas: 0 };
  }

  console.log(`Se encontraron ${facturasColgadas.length} factura(s) en estado 'emitiendo' de más de ${minutosLimite} minutos.`);

  const { data: empresa, error: errorEmpresa } = await supabaseAdmin
    .from("empresa")
    .select("cuit, punto_venta_ws, arca_ambiente")
    .limit(1)
    .single();

  if (errorEmpresa) {
    throw new Error(`Error al consultar datos de empresa: ${errorEmpresa.message}`);
  }

  const puntoVentaWs = empresa?.punto_venta_ws || 3;
  const ambienteArca: AmbienteArca = (empresa?.arca_ambiente as AmbienteArca) || "homologacion";

  if (ambienteArca === "produccion") {
    const cuitEmpresa = (empresa?.cuit || "").replace(/\D/g, "");
    const cuitConfig = config.ARCA_CUIT ? String(config.ARCA_CUIT).replace(/\D/g, "") : "";
    if (!cuitEmpresa || !cuitConfig || cuitEmpresa !== cuitConfig) {
      throw new Error("El CUIT de Configuración no coincide con ARCA_CUIT del worker");
    }
  }

  let recuperadas = 0;
  let desvinculadas = 0;

  for (const factura of facturasColgadas) {
    const pv = factura.punto_venta || puntoVentaWs;
    const tipoCbte = factura.tipo === "A" ? TIPO_COMPROBANTE.FACTURA_A : TIPO_COMPROBANTE.FACTURA_B;
    const cuitCliente = (factura.clientes as any)?.cuit || null;

    try {
      let numeroAChequear = factura.numero;

      if (!numeroAChequear) {
        // Consultar el último en ARCA
        const ultimoEnArca = await obtenerUltimoComprobante(pv, tipoCbte, {
          ambiente: ambienteArca,
          facturaId: factura.id,
        });
        if (ultimoEnArca > 0) {
          numeroAChequear = ultimoEnArca;
        }
      }

      let comprobanteArca: ComprobanteArcaRespuesta | null = null;
      if (numeroAChequear && numeroAChequear > 0) {
        try {
          comprobanteArca = await consultarComprobanteArca(numeroAChequear, pv, tipoCbte, {
            ambiente: ambienteArca,
            facturaId: factura.id,
          });
        } catch (errConsulta) {
          console.warn(`No se pudo consultar el comprobante #${numeroAChequear} en ARCA:`, errConsulta);
        }
      }

      // Chequear si ya hay otra factura distinta con este número y estado 'emitida'
      let yaExisteEmitida = false;
      if (numeroAChequear) {
        const { data: existente } = await supabaseAdmin
          .from("facturas")
          .select("id")
          .eq("tipo", factura.tipo)
          .eq("punto_venta", pv)
          .eq("numero", numeroAChequear)
          .eq("estado_emision", "emitida")
          .neq("id", factura.id)
          .maybeSingle();

        yaExisteEmitida = Boolean(existente);
      }

      const evaluacion = evaluarRecuperacionComprobante({
        facturaTotal: Number(factura.total) || 0,
        clienteCuit: cuitCliente,
        comprobanteArca,
        yaExisteFacturaEmitidaConEseNumero: yaExisteEmitida,
      });

      if (evaluacion.coincide && evaluacion.cae && numeroAChequear) {
        console.log(`Factura ${factura.id} recuperada con CAE ${evaluacion.cae} (número ${numeroAChequear}).`);

        // Actualizar factura a emitida
        await supabaseAdmin
          .from("facturas")
          .update({
            numero: numeroAChequear,
            cae: evaluacion.cae,
            cae_vencimiento: evaluacion.caeVencimiento || null,
            estado_emision: "emitida",
            emitida_at: new Date().toISOString(),
          })
          .eq("id", factura.id);

        // Obtener servicios vinculados y pasarlos a facturado vía RPC cambiar_estado
        const { data: servicios } = await supabaseAdmin
          .from("servicios")
          .select("id")
          .eq("factura_id", factura.id);

        const notaEvento = `Factura recuperada ${factura.tipo} ${String(pv).padStart(4, "0")}-${String(numeroAChequear).padStart(8, "0")} · CAE ${evaluacion.cae}`;
        for (const s of servicios || []) {
          try {
            await supabaseAdmin.rpc("cambiar_estado", {
              p_servicio_id: s.id,
              p_nuevo: "facturado",
              p_nota: notaEvento,
            });
          } catch (errRpc) {
            console.error(`Error al pasar servicio ${s.id} a facturado al recuperar:`, errRpc);
          }
        }

        // Generar PDF
        try {
          await generarYSubirPdfFactura(factura.id);
        } catch (errPdf) {
          console.error(`Error al generar PDF de factura recuperada ${factura.id}:`, errPdf);
        }

        recuperadas++;
      } else {
        console.warn(`Factura ${factura.id} no pudo recuperarse: ${evaluacion.motivo}. Desvinculando servicios.`);

        // Marcar como error
        await supabaseAdmin
          .from("facturas")
          .update({
            estado_emision: "error",
            error_emision: `Recuperación automática fallida: ${evaluacion.motivo}`,
          })
          .eq("id", factura.id);

        // Desvincular servicios para que vuelvan a pendientes
        await supabaseAdmin
          .from("servicios")
          .update({ factura_id: null })
          .eq("factura_id", factura.id);

        desvinculadas++;
      }
    } catch (errLoop: any) {
      console.error(`Error al procesar recuperación de factura ${factura.id}:`, errLoop);
    }
  }

  return {
    encontradas: facturasColgadas.length,
    recuperadas,
    desvinculadas,
  };
}
