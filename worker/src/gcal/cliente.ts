import crypto from "crypto";
import { google, type calendar_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { config } from "../config";

/**
 * Crea una instancia de cliente OAuth2 para interactuar con las APIs de Google.
 */
export function crearOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    config.GOOGLE_OAUTH_CLIENT_ID,
    config.GOOGLE_OAUTH_CLIENT_SECRET,
    config.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

/**
 * Firma un estado (state) para proteger el flujo OAuth contra CSRF y manipulación.
 * Incluye usuario_id, timestamp y firma HMAC SHA256.
 */
export function firmarStateOAuth(usuarioId: string): string {
  const timestamp = Date.now();
  const payload = `${usuarioId}:${timestamp}`;
  const secreto = config.WORKER_SECRET || "elevaplus_gcal_secret_seguro";
  const firma = crypto.createHmac("sha256", secreto).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ usuarioId, timestamp, firma })).toString("base64url");
}

/**
 * Valida un state recibido en el callback de OAuth y recupera el usuarioId.
 */
export function verificarStateOAuth(state: string): { valido: boolean; usuarioId?: string } {
  try {
    const raw = Buffer.from(state, "base64url").toString("utf-8");
    const { usuarioId, timestamp, firma } = JSON.parse(raw);
    if (!usuarioId || typeof usuarioId !== "string" || !timestamp || !firma) {
      return { valido: false };
    }

    // Vence después de 20 minutos
    if (Date.now() - Number(timestamp) > 20 * 60 * 1000) {
      return { valido: false };
    }

    const secreto = config.WORKER_SECRET || "elevaplus_gcal_secret_seguro";
    const firmaEsperada = crypto
      .createHmac("sha256", secreto)
      .update(`${usuarioId}:${timestamp}`)
      .digest("hex");

    if (crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(firmaEsperada))) {
      return { valido: true, usuarioId };
    }
    return { valido: false };
  } catch {
    return { valido: false };
  }
}

/**
 * Genera la URL de autorización para redirigir al usuario al consentimiento de Google.
 * Exige access_type: "offline" y prompt: "consent" para asegurar la devolución del refresh token.
 */
export function generarUrlAutorizacion(state: string): string {
  const cliente = crearOAuth2Client();
  return cliente.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

/**
 * Intercambia el código de autorización temporal por los tokens (incluyendo refresh_token).
 */
export async function intercambiarCodigoPorTokens(code: string) {
  const cliente = crearOAuth2Client();
  const { tokens } = await cliente.getToken(code);
  return tokens;
}

/**
 * Obtiene el cliente de Google Calendar inicializado con un refresh token.
 */
export function obtenerClienteCalendar(refreshToken: string): {
  oauth2Client: OAuth2Client;
  calendar: calendar_v3.Calendar;
} {
  const oauth2Client = crearOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  return { oauth2Client, calendar };
}

/**
 * Obtiene el correo electrónico de la cuenta de Google asociada al cliente autenticado.
 */
export async function obtenerEmailGoogle(oauth2Client: OAuth2Client): Promise<string | null> {
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const info = await oauth2.userinfo.get();
    if (info.data.email) return info.data.email;
  } catch {
    // Si falla userinfo, intentamos leer el ID del calendario primario (suele ser el email)
  }

  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const primario = await calendar.calendarList.get({ calendarId: "primary" });
    return primario.data.id || null;
  } catch {
    return null;
  }
}

/**
 * Busca un calendario con el nombre "ELEVAPLUS" en la cuenta del usuario.
 * Si no existe, lo crea con la configuración y zona horaria adecuada.
 */
export async function asegurarCalendarioElevaplus(
  calendar: calendar_v3.Calendar,
): Promise<string> {
  // 1. Buscar primero por nombre para no duplicarlo en reconexiones
  const lista = await calendar.calendarList.list({ minAccessRole: "writer" });
  const calendarios = lista.data.items || [];
  const existente = calendarios.find(
    (c) => c.summary === "ELEVAPLUS" && !c.deleted,
  );

  if (existente && existente.id) {
    return existente.id;
  }

  // 2. Si no existe, crearlo
  const respuesta = await calendar.calendars.insert({
    requestBody: {
      summary: "ELEVAPLUS",
      description: "Vencimientos, cheques y cobros de ELEVAPLUS Gestión",
      timeZone: config.TZ || "America/Argentina/Buenos_Aires",
    },
  });

  if (!respuesta.data.id) {
    throw new Error("No se pudo obtener el ID del calendario 'ELEVAPLUS' creado en Google.");
  }

  return respuesta.data.id;
}

/**
 * Revoca el token en los servidores de Google para desconectar la cuenta.
 */
export async function revocarTokenGoogle(refreshToken: string): Promise<void> {
  try {
    const oauth2Client = crearOAuth2Client();
    await oauth2Client.revokeToken(refreshToken);
  } catch (err: any) {
    console.warn(
      "[GCAL] Advertencia al revocar token en Google (puede haber sido revocado previamente):",
      err?.message || err,
    );
  }
}
