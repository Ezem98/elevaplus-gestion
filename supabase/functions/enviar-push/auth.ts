/**
 * Autenticación y comparación en tiempo constante para la Edge Function enviar-push.
 */

/**
 * Compara dos cadenas en tiempo constante utilizando TextEncoder y XOR acumulado.
 * Previene ataques de análisis de temporización (timing attacks) sobre secretos y tokens.
 */
export function igualTiempoConstante(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);

  if (bytesA.length !== bytesB.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i] ^ bytesB[i];
  }

  return diff === 0;
}

export interface ParametrosAutorizar {
  webhookSecret?: string | null;
  serviceRoleKey?: string | null;
  authHeader?: string | null;
  apiKeyHeader?: string | null;
}

export type ResultadoAutorizacion = "ok" | "sin_credenciales" | "no_autorizado";

/**
 * Evalúa las credenciales recibidas frente a los secretos del entorno.
 *
 * Rechaza por defecto (fail-closed):
 * - Si no hay ninguna credencial configurada en el entorno (ni WEBHOOK_SECRET
 *   ni SUPABASE_SERVICE_ROLE_KEY no vacíos), retorna "sin_credenciales".
 * - Si el header Authorization coincide con Bearer <WEBHOOK_SECRET>, retorna "ok".
 * - Si el header Authorization o apikey coincide con SUPABASE_SERVICE_ROLE_KEY, retorna "ok".
 * - De lo contrario, retorna "no_autorizado".
 */
export function autorizar({
  webhookSecret,
  serviceRoleKey,
  authHeader,
  apiKeyHeader,
}: ParametrosAutorizar): ResultadoAutorizacion {
  const tieneWebhookSecret =
    typeof webhookSecret === "string" && webhookSecret.length > 0;
  const tieneServiceRoleKey =
    typeof serviceRoleKey === "string" && serviceRoleKey.length > 0;

  if (!tieneWebhookSecret && !tieneServiceRoleKey) {
    return "sin_credenciales";
  }

  const esWebhookValido =
    tieneWebhookSecret &&
    typeof authHeader === "string" &&
    igualTiempoConstante(authHeader, `Bearer ${webhookSecret}`);

  const esServiceRoleValido =
    tieneServiceRoleKey &&
    ((typeof authHeader === "string" &&
      igualTiempoConstante(authHeader, `Bearer ${serviceRoleKey}`)) ||
      (typeof apiKeyHeader === "string" &&
        igualTiempoConstante(apiKeyHeader, serviceRoleKey)));

  if (esWebhookValido || esServiceRoleValido) {
    return "ok";
  }

  return "no_autorizado";
}

/**
 * Secret key del proyecto para el cliente admin y para autorizar llamadas del backend.
 * Supabase la publica en SUPABASE_SECRET_KEYS (JSON por nombre); se usa la "default".
 * SUPABASE_SERVICE_ROLE_KEY (legacy) queda como respaldo mientras exista.
 */
export function leerSecretKey(
  leer: (nombre: string) => string | undefined = (n) => Deno.env.get(n),
): string | undefined {
  const crudo = leer("SUPABASE_SECRET_KEYS");
  if (crudo) {
    try {
      const clave = JSON.parse(crudo)?.default;
      if (typeof clave === "string" && clave.length > 0) return clave;
    } catch {
      // JSON inválido: se sigue con el respaldo
    }
  }
  return leer("SUPABASE_SERVICE_ROLE_KEY");
}
