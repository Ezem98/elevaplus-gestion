import { config } from "../config";
import {
  generarFechas,
  type VencimientoParaGeneracion,
} from "../lib/vencimientos";
import { latir } from "../notificaciones/heartbeat";
import { supabaseAdmin } from "../supabase";

export interface ResultadoGeneracionInstancias {
  ok: boolean;
  vencimientosProcesados: number;
  instanciasTotalesGeneradas: number;
  error?: string;
}

export function obtenerFechaHoyBA(): string {
  const d = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.TZ || "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function sumarDias(iso: string, cantDias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + cantDias));
  return f.toISOString().slice(0, 10);
}

/**
 * Recorre todos los vencimientos activos y genera las instancias faltantes
 * para los próximos 90 días usando generarFechas e ignoreDuplicates para no pisar
 * instancias existentes (pagadas u omitidas).
 */
export async function generarInstancias(
  _params: { forzar?: boolean } = {},
): Promise<ResultadoGeneracionInstancias> {
  const hoyStr = obtenerFechaHoyBA();
  const hastaStr = sumarDias(hoyStr, 90);

  console.log(
    `[INSTANCIAS] Iniciando generación de instancias desde ${hoyStr} hasta ${hastaStr}...`,
  );

  let exito = false;
  try {
    const { data: vencimientos, error: errVenc } = await supabaseAdmin
      .from("vencimientos")
      .select("*")
      .eq("activo", true);

    if (errVenc) {
      throw new Error(
        `Error al consultar vencimientos activos: ${errVenc.message}`,
      );
    }

    if (!vencimientos || vencimientos.length === 0) {
      console.log("[INSTANCIAS] No hay vencimientos activos configurados.");
      exito = true;
      return {
        ok: true,
        vencimientosProcesados: 0,
        instanciasTotalesGeneradas: 0,
      };
    }

    let totalInstancias = 0;

    for (const v of vencimientos) {
      const paramGen: VencimientoParaGeneracion = {
        frecuencia: v.frecuencia,
        dia_del_mes: v.dia_del_mes,
        dia_semana: v.dia_semana,
        fecha_inicio: v.fecha_inicio,
        fecha_fin: v.fecha_fin,
        cuotas_total: v.cuotas_total,
        cuotas_pagadas: v.cuotas_pagadas ?? 0,
      };

      const fechas = generarFechas(paramGen, hoyStr, hastaStr);

      if (fechas.length === 0) {
        continue;
      }

      const filasAInsertar = fechas.map((fecha) => ({
        vencimiento_id: v.id,
        fecha,
        monto_estimado: v.monto_estimado,
        estado: "pendiente",
      }));

      // Inserción idempotente que no sobreescribe instancias pagadas u omitidas
      const { error: errInsert } = await supabaseAdmin
        .from("vencimiento_instancias")
        .upsert(filasAInsertar, {
          onConflict: "vencimiento_id,fecha",
          ignoreDuplicates: true,
        });

      if (errInsert) {
        console.error(
          `[INSTANCIAS] Error al insertar instancias para vencimiento ${v.id}:`,
          errInsert,
        );
      } else {
        totalInstancias += filasAInsertar.length;
      }
    }

    console.log(
      `[INSTANCIAS] Generación finalizada: ${vencimientos.length} vencimientos procesados, ${totalInstancias} instancias programadas/verificadas.`,
    );

    exito = true;
    return {
      ok: true,
      vencimientosProcesados: vencimientos.length,
      instanciasTotalesGeneradas: totalInstancias,
    };
  } catch (err: any) {
    console.error("[INSTANCIAS] Excepción en generación de instancias:", err);
    return {
      ok: false,
      vencimientosProcesados: 0,
      instanciasTotalesGeneradas: 0,
      error: err?.message || String(err),
    };
  } finally {
    if (exito) {
      await latir("instancias");
    }
  }
}
