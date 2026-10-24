// Los secretos del worker viven en Infisical. En Railway queda solo la credencial de la
// identidad de máquina (INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID).

const INTENTOS = 3;

export interface OpcionesSecretos {
  /** Carpeta dentro del proyecto de Infisical (por ejemplo "worker"). */
  servicio: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  /** Pausa entre reintentos, en milisegundos. */
  esperaMs?: number;
}

async function pedirJson(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  que: string,
  esperaMs: number | undefined,
): Promise<any> {
  let ultimo: Error | undefined;
  for (let n = 1; n <= INTENTOS; n++) {
    let definitivo = false;
    try {
      const r = await fetchFn(url, init);
      if (r.ok) return await r.json();
      // El cuerpo de la respuesta no se muestra: puede traer datos de la identidad.
      ultimo = new Error(`${que}: respuesta ${r.status}`);
      definitivo = r.status >= 400 && r.status < 500 && r.status !== 429;
    } catch (e) {
      ultimo = new Error(`${que}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (definitivo) break;
    if (n < INTENTOS) await new Promise((ok) => setTimeout(ok, esperaMs ?? 1000 * n));
  }
  throw ultimo;
}

/**
 * Lee los secretos del servicio desde Infisical y los pone en `env`.
 * Sin INFISICAL_CLIENT_ID no hace nada (desarrollo local y pruebas siguen con .env).
 * Con la identidad configurada y sin poder leer, lanza: el worker no arranca.
 */
export async function cargarSecretos({
  servicio,
  env = process.env,
  fetch: fetchFn = fetch,
  esperaMs,
}: OpcionesSecretos): Promise<{ cantidad: number } | undefined> {
  const clientId = env.INFISICAL_CLIENT_ID;
  if (!clientId) return undefined;

  const clientSecret = env.INFISICAL_CLIENT_SECRET;
  const proyecto = env.INFISICAL_PROJECT_ID;
  if (!clientSecret || !proyecto) {
    throw new Error(
      "Infisical: con INFISICAL_CLIENT_ID hacen falta INFISICAL_CLIENT_SECRET e INFISICAL_PROJECT_ID",
    );
  }
  const sitio = (env.INFISICAL_SITE_URL ?? "https://app.infisical.com").replace(/\/$/, "");
  const entorno = env.INFISICAL_ENV ?? "prod";
  const carpeta = env.INFISICAL_SECRET_PATH ?? `/${servicio}`;

  const login = await pedirJson(
    fetchFn,
    `${sitio}/api/v1/auth/universal-auth/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    },
    "Infisical login",
    esperaMs,
  );
  if (!login?.accessToken) throw new Error("Infisical login: sin accessToken");

  const consulta = new URLSearchParams({
    projectId: proyecto,
    workspaceId: proyecto,
    environment: entorno,
    secretPath: carpeta,
    expandSecretReferences: "true",
  });
  const lista = await pedirJson(
    fetchFn,
    `${sitio}/api/v3/secrets/raw?${consulta}`,
    { headers: { authorization: `Bearer ${login.accessToken}` } },
    "Infisical secretos",
    esperaMs,
  );

  const secretos: Array<{ secretKey: string; secretValue: string }> = lista?.secrets ?? [];
  if (secretos.length === 0) {
    throw new Error(`Infisical: la carpeta ${carpeta} (${entorno}) no tiene secretos`);
  }
  // Lo de Infisical manda sobre cualquier variable vieja que haya quedado en Railway.
  for (const { secretKey, secretValue } of secretos) env[secretKey] = secretValue;
  return { cantidad: secretos.length };
}
