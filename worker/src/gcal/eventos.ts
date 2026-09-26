import type { calendar_v3 } from "googleapis";

export interface FilaAgenda {
  clave: string;
  fecha: string; // YYYY-MM-DD
  sentido: "egreso" | "ingreso" | "info" | string;
  titulo: string;
  detalle?: string | null;
  monto?: number | string | null;
  cuenta_id?: string | null;
  estado?: string | null;
  ambito?: string | null;
  url?: string | null;
}

export interface EventoGuardado {
  clave: string;
  gcal_event_id: string;
}

/**
 * Formatea un monto en pesos argentinos sin centavos (ej: "$ 1.200.000").
 */
export function formatearMontoPesos(monto: number): string {
  const parteEntera = Math.round(monto);
  const formateado = new Intl.NumberFormat("es-AR").format(parteEntera);
  return `$ ${formateado}`;
}

/**
 * Construye el payload de un evento para Google Calendar a partir de una fila de la vista agenda.
 * - Evento de día completo (date, no dateTime).
 * - Título con monto si lo hay (ej: "Sueldos · $ 1.200.000").
 * - Descripción con detalle y link a la app.
 * - Recordatorio popup según recordar_dias_antes o 1 día para los derivados (disparado a las 9:00 hs).
 */
export function armarEventoGcal(
  item: FilaAgenda,
  recordarDiasAntes?: number | null,
  urlBaseApp: string = "https://gestion.eleva-plus.com.ar",
): calendar_v3.Schema$Event {
  // 1. Título
  let resumen = item.titulo;
  const numMonto = item.monto != null ? Number(item.monto) : null;
  if (numMonto != null && !isNaN(numMonto) && numMonto > 0) {
    resumen = `${item.titulo} · ${formatearMontoPesos(numMonto)}`;
  }

  // 2. Descripción con detalle y link a la app
  const partesDescripcion: string[] = [];
  if (item.detalle && item.detalle.trim()) {
    partesDescripcion.push(item.detalle.trim());
  }

  if (item.url && item.url.trim()) {
    const baseLimpia = urlBaseApp.replace(/\/$/, "");
    const rutaLimpia = item.url.startsWith("/") ? item.url : `/${item.url}`;
    const linkCompleto = item.url.startsWith("http")
      ? item.url
      : `${baseLimpia}${rutaLimpia}`;
    partesDescripcion.push(`Ver en ELEVAPLUS: ${linkCompleto}`);
  }

  const descripcion = partesDescripcion.join("\n\n");

  // 3. Recordatorio popup
  // Para eventos de día completo (date), las 00:00 hs es el inicio del día del evento.
  // 1 día antes a las 9:00 AM = 15 horas antes de las 00:00 (15 * 60 = 900 minutos).
  // N días antes a las 9:00 AM = (N - 1) * 24h + 15h = (N * 24 - 9) * 60 minutos.
  const dias = Math.max(1, Number(recordarDiasAntes) || 1);
  const minutosRecordatorio = (dias * 24 - 9) * 60;

  return {
    summary: resumen,
    description: descripcion,
    start: {
      date: item.fecha,
    },
    end: {
      date: item.fecha,
    },
    reminders: {
      useDefault: false,
      overrides: [
        {
          method: "popup",
          minutes: minutosRecordatorio,
        },
      ],
    },
  };
}

/**
 * Compara las claves activas de la agenda contra los eventos guardados en la base de datos
 * y devuelve aquellos que ya no están vigentes (para ser eliminados de Google Calendar y de la base).
 */
export function detectarEventosABorrar(
  clavesAgenda: string[],
  eventosGuardados: EventoGuardado[],
): EventoGuardado[] {
  const clavesValidas = new Set(clavesAgenda);
  return eventosGuardados.filter((evento) => !clavesValidas.has(evento.clave));
}

/**
 * Detecta si un error devuelto por Google corresponde a 'invalid_grant' (token revocado o expirado).
 */
export function esErrorInvalidGrant(err: unknown): boolean {
  if (!err) return false;
  const e = err as any;
  const mensaje = String(e.message || "").toLowerCase();
  const dataError = String(e.response?.data?.error || "").toLowerCase();
  const dataDesc = String(e.response?.data?.error_description || "").toLowerCase();

  return (
    mensaje.includes("invalid_grant") ||
    dataError === "invalid_grant" ||
    dataDesc.includes("invalid_grant")
  );
}
