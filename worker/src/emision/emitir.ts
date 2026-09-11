import { supabaseAdmin } from "../supabase";
import {
  TIPO_COMPROBANTE,
  obtenerCondicionIvaReceptorId,
} from "../arca/codigos";
import {
  mapearFacturaAComprobanteArca,
  type ClienteParaFactura,
  type ServicioParaFactura,
} from "../arca/mapear";
import {
  obtenerUltimoComprobante,
  solicitarComprobanteArca,
  type AmbienteArca,
} from "../arca/cliente";

export interface ParametrosEmitirFactura {
  clienteId: string;
  servicioIds: string[];
  loteId?: string | null;
  periodoDesde?: string;
  periodoHasta?: string;
}

export interface ResultadoEmisionFactura {
  factura_id: string;
  tipo: "A" | "B";
  punto_venta: number;
  numero: number;
  cae: string;
  cae_vencimiento: string;
}

function redondearDosDecimales(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function formatearComprobante(tipo: string, pv: number, numero: number): string {
  return `${tipo} ${String(pv).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}

/**
 * Emite una factura electrónica en ARCA para un cliente y lista de servicios.
 * Sigue el orden estricto de §4.3:
 * 1. Inserta factura en 'borrador' y vincula servicios.
 * 2. Pasa a 'emitiendo'.
 * 3. Consulta último comprobante.
 * 4. Solicita CAE a ARCA.
 * 5. Actualiza factura a 'emitida'.
 * 6. Pasa cada servicio a 'facturado' vía RPC cambiar_estado.
 */
export async function emitirFactura(
  params: ParametrosEmitirFactura
): Promise<ResultadoEmisionFactura> {
  const { clienteId, servicioIds, loteId, periodoDesde, periodoHasta } = params;

  if (servicioIds.length === 0) {
    throw new Error("Se requiere al menos un servicio para emitir la factura.");
  }

  // 1. Obtener parámetros de empresa
  const { data: empresa } = await supabaseAdmin
    .from("empresa")
    .select("punto_venta_ws, arca_ambiente")
    .limit(1)
    .single();

  const puntoVentaWs = empresa?.punto_venta_ws || 3;
  const ambienteArca: AmbienteArca = (empresa?.arca_ambiente as AmbienteArca) || "homologacion";

  // 2. Obtener datos del cliente
  const { data: cliente, error: errorCliente } = await supabaseAdmin
    .from("clientes")
    .select("id, nombre, cuit, condicion_iva, dias_pago")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) {
    throw new Error(`Cliente ${clienteId} no encontrado.`);
  }

  // 3. Obtener datos de los servicios
  const { data: servicios, error: errorServicios } = await supabaseAdmin
    .from("servicios")
    .select("id, numero, monto, aplica_iva, fecha_programada, fecha_fin, estado, factura_id")
    .in("id", servicioIds);

  if (errorServicios || !servicios || servicios.length === 0) {
    throw new Error("No se pudieron obtener los servicios para facturar.");
  }

  // Validar que los servicios no estén ya facturados
  for (const s of servicios) {
    if (s.factura_id) {
      throw new Error(`El servicio #${s.numero} ya está vinculado a otra factura.`);
    }
    if (s.estado === "facturado") {
      throw new Error(`El servicio #${s.numero} ya figura en estado facturado.`);
    }
  }

  const esRI = cliente.condicion_iva === "responsable_inscripto";
  const tipo: "A" | "B" = esRI ? "A" : "B";
  const tipoCbte = tipo === "A" ? TIPO_COMPROBANTE.FACTURA_A : TIPO_COMPROBANTE.FACTURA_B;

  // Calcular totales
  let neto = 0;
  let exento = 0;
  for (const s of servicios) {
    const monto = Number(s.monto) || 0;
    if (s.aplica_iva !== false) {
      neto += monto;
    } else {
      exento += monto;
    }
  }
  neto = redondearDosDecimales(neto);
  exento = redondearDosDecimales(exento);
  const iva = redondearDosDecimales(neto * 0.21);
  const total = redondearDosDecimales(neto + exento + iva);

  // Paso 1: Crear factura en estado 'borrador' y vincular servicios
  const { data: factura, error: errorFactura } = await supabaseAdmin
    .from("facturas")
    .insert({
      cliente_id: clienteId,
      tipo,
      punto_venta: puntoVentaWs,
      numero: null,
      neto,
      iva,
      total,
      periodo_desde: periodoDesde || null,
      periodo_hasta: periodoHasta || null,
      lote_id: loteId || null,
      estado_emision: "borrador",
      concepto: 2,
    })
    .select()
    .single();

  if (errorFactura || !factura) {
    throw new Error(`Error al crear borrador de factura: ${errorFactura?.message}`);
  }

  // Vincular servicios a la factura inmediatamente para bloquearlos
  await supabaseAdmin
    .from("servicios")
    .update({ factura_id: factura.id })
    .in("id", servicioIds);

  try {
    // Paso 2: Pasar a 'emitiendo'
    await supabaseAdmin
      .from("facturas")
      .update({ estado_emision: "emitiendo" })
      .eq("id", factura.id);

    // Paso 3: Consultar último comprobante en ARCA
    const ultimo = await obtenerUltimoComprobante(puntoVentaWs, tipoCbte, {
      ambiente: ambienteArca,
      facturaId: factura.id,
    });
    const proximoNumero = ultimo + 1;

    // Paso 4: Mapear payload y solicitar CAE a ARCA
    const clienteParaFactura: ClienteParaFactura = {
      cuit: cliente.cuit,
      condicion_iva: cliente.condicion_iva,
      dias_pago: cliente.dias_pago,
    };

    const serviciosParaFactura: ServicioParaFactura[] = servicios.map((s) => ({
      id: s.id,
      monto: s.monto,
      aplica_iva: s.aplica_iva,
      fecha_programada: s.fecha_programada,
      fecha_fin: s.fecha_fin,
    }));

    const payload = mapearFacturaAComprobanteArca({
      tipo,
      puntoDeVenta: puntoVentaWs,
      numeroComprobante: proximoNumero,
      cliente: clienteParaFactura,
      servicios: serviciosParaFactura,
      periodoDesde,
      periodoHasta,
    });

    const resArca = await solicitarComprobanteArca(payload, {
      ambiente: ambienteArca,
      facturaId: factura.id,
    });

    // Paso 5: Actualizar factura a 'emitida'
    await supabaseAdmin
      .from("facturas")
      .update({
        numero: proximoNumero,
        cae: resArca.CAE,
        cae_vencimiento: resArca.CAEFchVto,
        estado_emision: "emitida",
        emitida_at: new Date().toISOString(),
      })
      .eq("id", factura.id);

    // Paso 6: Marcar cada servicio como 'facturado' vía RPC cambiar_estado
    const notaEvento = `Factura ${formatearComprobante(tipo, puntoVentaWs, proximoNumero)} · CAE ${resArca.CAE}`;
    for (const s of servicios) {
      try {
        await supabaseAdmin.rpc("cambiar_estado", {
          p_servicio_id: s.id,
          p_nuevo: "facturado",
          p_nota: notaEvento,
        });
      } catch (errRpc) {
        console.error(`Error al pasar servicio ${s.id} a facturado:`, errRpc);
      }
    }

    return {
      factura_id: factura.id,
      tipo,
      punto_venta: puntoVentaWs,
      numero: proximoNumero,
      cae: resArca.CAE,
      cae_vencimiento: resArca.CAEFchVto,
    };
  } catch (errEmision: any) {
    // Error en paso 3 o 4: marcar factura como 'error' y desvincular servicios
    const mensajeError = errEmision?.message || String(errEmision);
    await supabaseAdmin
      .from("facturas")
      .update({
        estado_emision: "error",
        error_emision: mensajeError,
      })
      .eq("id", factura.id);

    // Desvincular servicios para que vuelvan a estar pendientes
    await supabaseAdmin
      .from("servicios")
      .update({ factura_id: null })
      .in("id", servicioIds)
      .eq("factura_id", factura.id);

    throw errEmision;
  }
}
