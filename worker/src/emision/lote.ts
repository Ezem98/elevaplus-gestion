import { supabaseAdmin } from "../supabase";
import { config } from "../config";
import {
  seleccionarFacturasHoy,
  type ClienteSeleccion,
  type ServicioSeleccion,
  type DescartadoItem,
} from "./seleccionar";
import { validarTopesEmision } from "./topes";
import { emitirFactura } from "./emitir";
import { recuperarFacturasColgadas } from "./recuperar";
import { notificarLotePush } from "../notificaciones/push";

export interface ParametrosCorrerLote {
  disparadoPor?: string; // 'cron' | 'manual:<usuario_id>'
  fechaHoy?: string; // YYYY-MM-DD
}

export interface ResultadoLote {
  loteId: string;
  facturasEmitidas: number;
  montoTotal: number;
  descartados: (DescartadoItem | any)[];
  error: string | null;
}

/**
 * Obtiene la fecha actual formateada en YYYY-MM-DD según la zona horaria indicada.
 */
export function obtenerFechaHoy(tz: string = config.TZ || "America/Argentina/Buenos_Aires"): string {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Ejecuta el lote nocturno o manual de facturación electrónica.
 * 1. Recupera facturas en 'emitiendo' colgadas de más de 10 minutos.
 * 2. Selecciona clientes y servicios pendientes de facturar.
 * 3. Valida topes diarios de emisión.
 * 4. Emite secuencialmente cada factura en ARCA.
 * 5. Registra el resultado en lotes_emision.
 * 6. Dispara notificación push a admin y oficina vía Edge Function.
 */
export async function correrLote(params: ParametrosCorrerLote = {}): Promise<ResultadoLote> {
  const fechaHoy = params.fechaHoy || obtenerFechaHoy(config.TZ);
  const disparadoPor = params.disparadoPor || "cron";

  console.log(`[LOTE] Iniciando corrida de facturación (${disparadoPor}) para la fecha ${fechaHoy}...`);

  // 1. Recuperación previa de comprobantes interrumpidos
  try {
    const resRecuperacion = await recuperarFacturasColgadas(10);
    if (resRecuperacion.encontradas > 0) {
      console.log(
        `[LOTE] Idempotencia: ${resRecuperacion.recuperadas} recuperadas, ${resRecuperacion.desvinculadas} desvinculadas de ${resRecuperacion.encontradas} colgadas.`
      );
    }
  } catch (errRecuperar) {
    console.error("[LOTE] Error durante la recuperación de facturas colgadas:", errRecuperar);
  }

  // 2. Crear registro inicial en lotes_emision
  const { data: lote, error: errLote } = await supabaseAdmin
    .from("lotes_emision")
    .insert({
      fecha: fechaHoy,
      disparado_por: disparadoPor,
      facturas_emitidas: 0,
      monto_total: 0,
      descartados: [],
    })
    .select("id")
    .single();

  if (errLote || !lote) {
    const errorMsg = `No se pudo crear el registro en lotes_emision: ${errLote?.message}`;
    console.error(`[LOTE] ${errorMsg}`);
    await notificarLotePush({
      facturasEmitidas: 0,
      montoTotal: 0,
      cantidadDescartados: 0,
      error: errorMsg,
    });
    throw new Error(errorMsg);
  }

  const loteId = lote.id;

  try {
    // 3. Cargar clientes
    const { data: clientes, error: errClientes } = await supabaseAdmin
      .from("clientes")
      .select("id, nombre, cuit, condicion_iva, dias_pago, facturacion_modo, facturacion_automatica, enviar_factura_email, email_facturacion, email");

    if (errClientes) {
      throw new Error(`Error al consultar clientes: ${errClientes.message}`);
    }

    // 4. Cargar servicios terminados o cobrados pendientes de facturar
    const { data: servicios, error: errServicios } = await supabaseAdmin
      .from("servicios")
      .select("id, numero, cliente_id, descripcion, monto, aplica_iva, fecha_programada, fecha_fin, fecha_inicio, estado, no_facturable, factura_id")
      .in("estado", ["terminado", "cobrado"])
      .is("factura_id", null)
      .or("no_facturable.is.null,no_facturable.eq.false");

    if (errServicios) {
      throw new Error(`Error al consultar servicios: ${errServicios.message}`);
    }

    // 5. Seleccionar facturas a emitir y descartados según la política de cada cliente
    const { aEmitir, descartados } = seleccionarFacturasHoy(
      fechaHoy,
      (clientes || []) as ClienteSeleccion[],
      (servicios || []) as ServicioSeleccion[]
    );

    console.log(`[LOTE] Selección completada: ${aEmitir.length} factura(s) a emitir, ${descartados.length} observación(es)/descartado(s).`);

    // 6. Validar topes diarios
    const sumaTotalAEmitir = aEmitir.reduce((acc, item) => acc + item.total, 0);
    const validacionTopes = await validarTopesEmision(aEmitir.length, sumaTotalAEmitir);

    if (!validacionTopes.valido) {
      console.warn(
        `[LOTE] Tope superado (${validacionTopes.motivo}): cantidad ${aEmitir.length} (tope ${validacionTopes.limiteCantidad}), monto $${sumaTotalAEmitir} (tope $${validacionTopes.limiteMonto}). No se emite nada.`
      );

      await supabaseAdmin
        .from("lotes_emision")
        .update({
          finalizado_at: new Date().toISOString(),
          error: "tope_superado",
          descartados,
        })
        .eq("id", loteId);

      await notificarLotePush({
        facturasEmitidas: 0,
        montoTotal: 0,
        cantidadDescartados: descartados.length,
        error: "tope_superado",
      });

      return {
        loteId,
        facturasEmitidas: 0,
        montoTotal: 0,
        descartados,
        error: "tope_superado",
      };
    }

    // 7. Si no hay nada que emitir
    if (aEmitir.length === 0) {
      await supabaseAdmin
        .from("lotes_emision")
        .update({
          finalizado_at: new Date().toISOString(),
          facturas_emitidas: 0,
          monto_total: 0,
          descartados,
        })
        .eq("id", loteId);

      // Si hubo descartados avisa, si no es silencioso
      await notificarLotePush({
        facturasEmitidas: 0,
        montoTotal: 0,
        cantidadDescartados: descartados.length,
      });

      console.log("[LOTE] Finalizado sin facturas a emitir.");
      return {
        loteId,
        facturasEmitidas: 0,
        montoTotal: 0,
        descartados,
        error: null,
      };
    }

    // 8. Emisión secuencial de facturas
    let facturasEmitidas = 0;
    let montoTotalEmitido = 0;
    const erroresEmision: any[] = [];

    for (const facturaData of aEmitir) {
      try {
        console.log(`[LOTE] Emitiendo factura ${facturaData.tipo} para cliente ${facturaData.cliente.nombre} ($${facturaData.total})...`);
        const resEmision = await emitirFactura({
          clienteId: facturaData.cliente.id,
          servicioIds: facturaData.servicios.map((s) => s.id),
          loteId,
          periodoDesde: facturaData.periodo_desde,
          periodoHasta: facturaData.periodo_hasta,
        });

        facturasEmitidas++;
        montoTotalEmitido += facturaData.total;
        console.log(
          `[LOTE] Factura emitida con éxito: ${resEmision.tipo} ${resEmision.punto_venta}-${resEmision.numero} · CAE ${resEmision.cae}`
        );
      } catch (errFactura: any) {
        console.error(`[LOTE] Falló la emisión para cliente ${facturaData.cliente.nombre}:`, errFactura);
        erroresEmision.push({
          cliente_id: facturaData.cliente.id,
          cliente: facturaData.cliente.nombre,
          motivo: "error_emision",
          error: errFactura?.message || String(errFactura),
          servicios: facturaData.servicios.map((s) => ({
            id: s.id,
            numero: s.numero,
            descripcion: s.descripcion,
          })),
        });
      }
    }

    const descartadosTotales = [...descartados, ...erroresEmision];
    const montoRedondeado = Math.round((montoTotalEmitido + Number.EPSILON) * 100) / 100;

    // 9. Actualizar lote finalizado
    await supabaseAdmin
      .from("lotes_emision")
      .update({
        finalizado_at: new Date().toISOString(),
        facturas_emitidas: facturasEmitidas,
        monto_total: montoRedondeado,
        descartados: descartadosTotales,
      })
      .eq("id", loteId);

    // 10. Notificación push de resumen
    await notificarLotePush({
      facturasEmitidas,
      montoTotal: montoRedondeado,
      cantidadDescartados: descartadosTotales.length,
    });

    console.log(
      `[LOTE] Lote finalizado: ${facturasEmitidas} emitida(s) por $${montoRedondeado}, ${descartadosTotales.length} observada(s).`
    );

    return {
      loteId,
      facturasEmitidas,
      montoTotal: montoRedondeado,
      descartados: descartadosTotales,
      error: null,
    };
  } catch (errLoteGeneral: any) {
    const errorMsg = errLoteGeneral?.message || String(errLoteGeneral);
    console.error("[LOTE] Error crítico en el proceso de lote:", errLoteGeneral);

    await supabaseAdmin
      .from("lotes_emision")
      .update({
        finalizado_at: new Date().toISOString(),
        error: errorMsg,
      })
      .eq("id", loteId);

    await notificarLotePush({
      facturasEmitidas: 0,
      montoTotal: 0,
      cantidadDescartados: 0,
      error: errorMsg,
    });

    throw errLoteGeneral;
  }
}
