import { latir } from "../notificaciones/heartbeat";
import { enviarPushDirecto } from "../notificaciones/push";
import { supabaseAdmin } from "../supabase";
import { finalizarEjecucion, registrarEjecucion } from "./idempotencia";
import { obtenerFechaHoyBA, sumarDias } from "./instancias";

export interface ItemAgendaSimple {
  titulo: string;
  monto?: number | null;
}

export interface ChequeAlertaFondos {
  id: string;
  numero: string | null;
  banco: string | null;
  monto: number;
  cuenta_id: string | null;
  fecha_pago: string;
  cuentas?: { nombre: string } | null;
}

export function formatearPesosSimple(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

export function obtenerNombreDiaSemana(isoFecha: string): string {
  const [y, m, d] = isoFecha.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const dias = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  return dias[fecha.getUTCDay()] || isoFecha;
}

/**
 * Arma el cuerpo del push con hasta 3 líneas concatenadas por ' · '
 * y agrega 'y N más' si la lista supera los 3 ítems.
 */
export function construirCuerpoPush(items: ItemAgendaSimple[]): string {
  if (!items || items.length === 0) return "";

  const primerosTres = items.slice(0, 3).map((it) => {
    const textoMonto =
      it.monto != null ? ` ${formatearPesosSimple(Number(it.monto))}` : "";
    return `${it.titulo}${textoMonto}`;
  });

  let cuerpo = primerosTres.join(" · ");
  if (items.length > 3) {
    cuerpo += ` y ${items.length - 3} más`;
  }

  return cuerpo;
}

/**
 * Función pura para evaluar si una proyección de saldo para una fecha dada resulta en descubierto.
 */
export function evaluarDescubiertoCheque(
  fechaPago: string,
  serieProyeccion: { fecha: string; saldo_proyectado: number }[],
): { tieneDescubierto: boolean; saldoProyectado: number } {
  const dia = serieProyeccion.find((p) => p.fecha === fechaPago);
  const saldo = Number(dia?.saldo_proyectado ?? 0);
  return {
    tieneDescubierto: saldo < 0,
    saldoProyectado: saldo,
  };
}

/**
 * Cron 08:00 - Recordatorios de compromisos del día y Alerta de fondos de cheques a vencer.
 */
export async function recordatoriosHoy(
  params: { forzar?: boolean } = {},
): Promise<{
  ok: boolean;
  omitido?: boolean;
  notificacionEnviada: boolean;
  chequesAlertados: number;
  error?: string;
}> {
  const hoyStr = obtenerFechaHoyBA();
  const clave = `recordatorio-hoy:${hoyStr}`;

  const { ejecutado } = await registrarEjecucion(
    "recordatorio-hoy",
    clave,
    params.forzar,
  );
  if (!ejecutado) {
    await latir("recordatorios");
    return {
      ok: true,
      omitido: true,
      notificacionEnviada: false,
      chequesAlertados: 0,
    };
  }

  try {
    // 1. Consultar ítems de agenda de hoy (excluyendo sentido 'info')
    const { data: itemsHoy, error: errAgenda } = await supabaseAdmin
      .from("agenda")
      .select("clave, titulo, monto, sentido")
      .eq("fecha", hoyStr)
      .neq("sentido", "info");

    if (errAgenda) {
      throw new Error(`Error al consultar agenda de hoy: ${errAgenda.message}`);
    }

    let notificacionEnviada = false;

    if (itemsHoy && itemsHoy.length > 0) {
      const cant = itemsHoy.length;
      const titulo = `Hoy tenés ${cant} ${cant === 1 ? "vencimiento" : "vencimientos"}`;
      const cuerpo = construirCuerpoPush(itemsHoy);

      await enviarPushDirecto({
        titulo,
        cuerpo,
        url: "/agenda",
        tag: `agenda-hoy:${hoyStr}`,
        destinatarios: "oficina",
      });

      notificacionEnviada = true;
    } else {
      console.log(
        `[RECORDATORIOS] Sin vencimientos con monto para hoy (${hoyStr}).`,
      );
    }

    // 2. Alerta de fondos para cheques propios emitidos en ≤ 3 días
    const hoyMas3Str = sumarDias(hoyStr, 3);
    const { data: chequesEmitidos, error: errCheques } = await supabaseAdmin
      .from("cheques")
      .select(
        "id, numero, banco, monto, cuenta_id, fecha_pago, cuentas(nombre)",
      )
      .eq("tipo", "emitido")
      .eq("estado", "emitido")
      .gte("fecha_pago", hoyStr)
      .lte("fecha_pago", hoyMas3Str);

    if (errCheques) {
      console.error(
        "[RECORDATORIOS] Error consultando cheques a cubrir:",
        errCheques,
      );
    }

    let chequesAlertados = 0;

    if (chequesEmitidos && chequesEmitidos.length > 0) {
      // Agrupar por cuenta_id para no repetir llamadas a proyeccion_caja
      const chequesPorCuenta = new Map<string, ChequeAlertaFondos[]>();
      for (const ch of chequesEmitidos as unknown as ChequeAlertaFondos[]) {
        if (!ch.cuenta_id) continue;
        const list = chequesPorCuenta.get(ch.cuenta_id) ?? [];
        list.push(ch);
        chequesPorCuenta.set(ch.cuenta_id, list);
      }

      for (const [cuentaId, chequesCuenta] of chequesPorCuenta.entries()) {
        const { data: proyeccion, error: errProy } = await supabaseAdmin.rpc(
          "proyeccion_caja",
          {
            p_dias: 4,
            p_cuenta_id: cuentaId,
          },
        );

        if (errProy || !proyeccion) {
          console.error(
            `[RECORDATORIOS] Error en proyeccion_caja para cuenta ${cuentaId}:`,
            errProy,
          );
          continue;
        }

        const serieProy =
          (proyeccion as { fecha: string; saldo_proyectado: number }[]) ?? [];

        for (const ch of chequesCuenta) {
          const { tieneDescubierto } = evaluarDescubiertoCheque(
            ch.fecha_pago,
            serieProy,
          );

          if (tieneDescubierto) {
            const nombreBanco = ch.banco || ch.cuentas?.nombre || "la cuenta";
            const diaVencimiento = obtenerNombreDiaSemana(ch.fecha_pago);
            const montoFormateado = formatearPesosSimple(Number(ch.monto));

            const cuerpoAlerta = `El cheque de ${nombreBanco} por ${montoFormateado} vence el ${diaVencimiento} y la cuenta no cubre`;

            await enviarPushDirecto({
              titulo: "Alerta de fondos en cuenta",
              cuerpo: cuerpoAlerta,
              url: "/cobros?tab=cheques",
              tag: `fondos:${ch.id}`,
              destinatarios: "oficina",
            });

            chequesAlertados++;
          }
        }
      }
    }

    await finalizarEjecucion("recordatorio-hoy", clave, {
      itemsProcesados: itemsHoy?.length ?? 0,
      notificacionEnviada,
      chequesAlertados,
    });

    await latir("recordatorios");

    return {
      ok: true,
      notificacionEnviada,
      chequesAlertados,
    };
  } catch (err: any) {
    console.error("[RECORDATORIOS] Excepción en recordatoriosHoy:", err);
    return {
      ok: false,
      notificacionEnviada: false,
      chequesAlertados: 0,
      error: err?.message || String(err),
    };
  }
}

/**
 * Cron 09:00 - Recordatorios de compromisos para el día de mañana.
 */
export async function recordatoriosManana(
  params: { forzar?: boolean } = {},
): Promise<{
  ok: boolean;
  omitido?: boolean;
  notificacionEnviada: boolean;
  error?: string;
}> {
  const hoyStr = obtenerFechaHoyBA();
  const mananaStr = sumarDias(hoyStr, 1);
  const clave = `recordatorio-manana:${mananaStr}`;

  const { ejecutado } = await registrarEjecucion(
    "recordatorio-manana",
    clave,
    params.forzar,
  );
  if (!ejecutado) {
    return { ok: true, omitido: true, notificacionEnviada: false };
  }

  try {
    const { data: itemsManana, error: errAgenda } = await supabaseAdmin
      .from("agenda")
      .select("clave, titulo, monto, sentido")
      .eq("fecha", mananaStr)
      .neq("sentido", "info");

    if (errAgenda) {
      throw new Error(
        `Error al consultar agenda de mañana: ${errAgenda.message}`,
      );
    }

    let notificacionEnviada = false;

    if (itemsManana && itemsManana.length > 0) {
      const cant = itemsManana.length;
      const titulo = `Mañana vence${cant === 1 ? "" : "n"} ${cant} ${cant === 1 ? "compromiso" : "compromisos"}`;
      const cuerpo = construirCuerpoPush(itemsManana);

      await enviarPushDirecto({
        titulo,
        cuerpo,
        url: "/agenda",
        tag: `agenda-manana:${mananaStr}`,
        destinatarios: "oficina",
      });

      notificacionEnviada = true;
    } else {
      console.log(
        `[RECORDATORIOS] Sin vencimientos para mañana (${mananaStr}).`,
      );
    }

    await finalizarEjecucion("recordatorio-manana", clave, {
      itemsProcesados: itemsManana?.length ?? 0,
      notificacionEnviada,
    });

    return {
      ok: true,
      notificacionEnviada,
    };
  } catch (err: any) {
    console.error("[RECORDATORIOS] Excepción en recordatoriosManana:", err);
    return {
      ok: false,
      notificacionEnviada: false,
      error: err?.message || String(err),
    };
  }
}
