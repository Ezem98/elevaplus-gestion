import {
  enviarMailConResend,
  filtrarDestinatarioPorListaBlanca,
} from "../mail/cliente";
import {
  ChequeSemanalMail,
  generarPlantillaResumenSemanal,
  ItemAgendaSemanalMail,
  ProyeccionDiaMail,
} from "../mail/plantillas";
import { latir } from "../notificaciones/heartbeat";
import { supabaseAdmin } from "../supabase";
import { finalizarEjecucion, registrarEjecucion } from "./idempotencia";
import { obtenerFechaHoyBA } from "./instancias";

/**
 * Calcula el lunes y domingo de la semana correspondiente a una fecha YYYY-MM-DD.
 */
export function obtenerSemanaLunesADomingo(fechaStr: string): {
  lunes: string;
  domingo: string;
} {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const mondayDate = new Date(date);
  mondayDate.setUTCDate(date.getUTCDate() + diffToMonday);

  const sundayDate = new Date(mondayDate);
  sundayDate.setUTCDate(mondayDate.getUTCDate() + 6);

  return {
    lunes: mondayDate.toISOString().slice(0, 10),
    domingo: sundayDate.toISOString().slice(0, 10),
  };
}

function formatearFechaCorta(isoFecha: string): string {
  const [y, m, d] = isoFecha.split("-");
  return `${d}/${m}`;
}

/**
 * Obtiene el email de destino para las comunicaciones de la empresa.
 * Prioriza `empresa.email`, con fallback a `empresa.email_facturacion`.
 */
export async function obtenerEmailDestinoEmpresa(): Promise<{
  email: string | null;
  error?: string;
}> {
  const { data: empresa, error: errEmpresa } = await supabaseAdmin
    .from("empresa")
    .select("email, email_facturacion")
    .eq("id", 1)
    .maybeSingle();

  if (errEmpresa) {
    console.error(
      "[RESUMEN-SEMANAL] Error al consultar tabla empresa:",
      errEmpresa,
    );
    return {
      email: null,
      error: `Error al consultar tabla empresa: ${errEmpresa.message}`,
    };
  }

  if (!empresa) {
    return {
      email: null,
      error:
        "No se encontró el registro de la empresa en la base de datos (id = 1).",
    };
  }

  const emailDestino =
    empresa.email?.trim() || empresa.email_facturacion?.trim() || "";

  if (!emailDestino) {
    return {
      email: null,
      error:
        "No hay email configurado en la tabla empresa (se verificaron las columnas 'email' y 'email_facturacion').",
    };
  }

  return { email: emailDestino };
}

/**
 * Cron 07:00 lunes - Envía resumen semanal a empresa.email con compromisos,
 * cheques a cobrar/cubrir y proyección de caja a 7 días.
 */
export async function resumenSemanal(
  params: { forzar?: boolean } = {},
): Promise<{
  ok: boolean;
  omitido?: boolean;
  omitidoPorListaBlanca?: boolean;
  destinatario?: string;
  alertaDescubierto?: boolean;
  error?: string;
}> {
  const hoyStr = obtenerFechaHoyBA();
  const { lunes, domingo } = obtenerSemanaLunesADomingo(hoyStr);
  const clave = `resumen-semanal:${lunes}`;

  const { ejecutado } = await registrarEjecucion(
    "resumen-semanal",
    clave,
    params.forzar,
  );

  if (!ejecutado) {
    await latir("semanal");
    return { ok: true, omitido: true };
  }

  try {
    // 1. Obtener email de la empresa
    const { email: emailDestino, error: errorEmail } =
      await obtenerEmailDestinoEmpresa();

    if (errorEmail || !emailDestino) {
      const msg =
        errorEmail ||
        "No hay email configurado en la tabla empresa (se verificaron las columnas 'email' y 'email_facturacion').";
      console.warn(`[RESUMEN-SEMANAL] ${msg}`);
      await finalizarEjecucion("resumen-semanal", clave, { error: msg });
      return { ok: false, error: msg };
    }

    // 2. Verificar política de lista blanca
    const chequeoLista = filtrarDestinatarioPorListaBlanca(emailDestino);
    if (!chequeoLista.permitido) {
      console.log(
        `[RESUMEN-SEMANAL] Omitido por lista blanca: ${chequeoLista.motivo}`,
      );
      await finalizarEjecucion("resumen-semanal", clave, {
        omitidoPorListaBlanca: true,
        destinatario: emailDestino,
        motivo: chequeoLista.motivo,
      });
      await latir("semanal");
      return {
        ok: true,
        omitidoPorListaBlanca: true,
        destinatario: emailDestino,
      };
    }

    // 3. Consultar vista agenda para toda la semana
    const { data: agendaRows, error: errAgenda } = await supabaseAdmin
      .from("agenda")
      .select("*")
      .gte("fecha", lunes)
      .lte("fecha", domingo)
      .order("fecha", { ascending: true });

    if (errAgenda) {
      console.error("[RESUMEN-SEMANAL] Error al consultar agenda:", errAgenda);
      throw errAgenda;
    }

    const itemsAgenda: ItemAgendaSemanalMail[] = (agendaRows || []).map(
      (it: any) => ({
        fecha: it.fecha,
        titulo: it.titulo,
        monto: it.monto != null ? Number(it.monto) : null,
        sentido: it.sentido as "ingreso" | "egreso" | "info",
        detalle: it.detalle,
      }),
    );

    // 4. Consultar cheques de la semana
    const { data: chequesRows, error: errCheques } = await supabaseAdmin
      .from("cheques")
      .select(
        "id, numero, banco, monto, tipo, estado, fecha_pago, emisor, pagado_a, clientes(nombre)",
      )
      .gte("fecha_pago", lunes)
      .lte("fecha_pago", domingo)
      .in("estado", ["en_cartera", "depositado", "emitido"])
      .order("fecha_pago", { ascending: true });

    if (errCheques) {
      console.error(
        "[RESUMEN-SEMANAL] Error al consultar cheques:",
        errCheques,
      );
      throw errCheques;
    }

    const chequesCobrar: ChequeSemanalMail[] = [];
    const chequesCubrir: ChequeSemanalMail[] = [];

    for (const ch of chequesRows || []) {
      const clienteNombre = (ch as any).clientes?.nombre;
      if (
        ch.tipo === "recibido" &&
        (ch.estado === "en_cartera" || ch.estado === "depositado")
      ) {
        chequesCobrar.push({
          id: ch.id,
          numero: ch.numero,
          banco: ch.banco,
          monto: Number(ch.monto),
          tipo: "recibido",
          fechaPago: ch.fecha_pago,
          contraparte: clienteNombre || ch.emisor || "s/d",
        });
      } else if (ch.tipo === "emitido" && ch.estado === "emitido") {
        chequesCubrir.push({
          id: ch.id,
          numero: ch.numero,
          banco: ch.banco,
          monto: Number(ch.monto),
          tipo: "emitido",
          fechaPago: ch.fecha_pago,
          contraparte: ch.pagado_a || "s/d",
        });
      }
    }

    // 5. Proyección de caja a 7 días
    const { data: proyeccionData, error: errProy } = await supabaseAdmin.rpc(
      "proyeccion_caja",
      { p_dias: 7, p_cuenta_id: null },
    );

    if (errProy) {
      console.error(
        "[RESUMEN-SEMANAL] Error al ejecutar RPC proyeccion_caja:",
        errProy,
      );
      throw errProy;
    }

    const proyeccion: ProyeccionDiaMail[] = (proyeccionData || []).map(
      (p: any) => ({
        fecha: p.fecha,
        ingresos: Number(p.ingresos || 0),
        egresos: Number(p.egresos || 0),
        saldoProyectado: Number(p.saldo_proyectado || 0),
      }),
    );

    const alertaDescubierto = proyeccion.some((p) => p.saldoProyectado < 0);

    const [anioLunes] = lunes.split("-");
    const rangoTexto = `Semana del ${formatearFechaCorta(lunes)} al ${formatearFechaCorta(domingo)} de ${anioLunes}`;

    // 6. Generar plantilla de mail
    const contenidoMail = generarPlantillaResumenSemanal({
      rangoTexto,
      itemsAgenda,
      chequesCobrar,
      chequesCubrir,
      proyeccion,
      alertaDescubierto,
    });

    // 7. Enviar correo vía Resend
    const envio = await enviarMailConResend({
      para: emailDestino,
      asunto: contenidoMail.asunto,
      texto: contenidoMail.texto,
      html: contenidoMail.html,
    });

    if (!envio.exito) {
      console.error(
        `[RESUMEN-SEMANAL] Error en el envío de correo: ${envio.motivo}`,
      );
      await finalizarEjecucion("resumen-semanal", clave, {
        error: envio.motivo,
        destinatario: emailDestino,
      });
      return { ok: false, error: envio.motivo };
    }

    const resultadoFinal = {
      destinatario: emailDestino,
      resendId: envio.id,
      itemsAgenda: itemsAgenda.length,
      chequesCobrar: chequesCobrar.length,
      chequesCubrir: chequesCubrir.length,
      alertaDescubierto,
    };

    await finalizarEjecucion("resumen-semanal", clave, resultadoFinal);
    console.log(
      `[RESUMEN-SEMANAL] Enviado exitosamente a ${emailDestino} (Resend ID: ${envio.id})`,
    );

    await latir("semanal");

    return {
      ok: true,
      destinatario: emailDestino,
      alertaDescubierto,
    };
  } catch (err: any) {
    console.error("[RESUMEN-SEMANAL] Error no controlado:", err);
    await finalizarEjecucion("resumen-semanal", clave, {
      error: err?.message || String(err),
    });
    return { ok: false, error: err?.message || String(err) };
  }
}
