import { describe, expect, it } from "vitest";
import { cargarSecretos } from "./secretos";

type Llamada = { url: string; init: RequestInit };

function falso(respuestas: Array<{ status: number; cuerpo?: unknown }>) {
  const llamadas: Llamada[] = [];
  const fetchFalso = (async (url: string, init: RequestInit) => {
    llamadas.push({ url: String(url), init });
    const r = respuestas.shift() ?? { status: 500 };
    return { ok: r.status < 400, status: r.status, json: async () => r.cuerpo };
  }) as unknown as typeof fetch;
  return { llamadas, fetchFalso };
}

const identidad = {
  INFISICAL_CLIENT_ID: "id",
  INFISICAL_CLIENT_SECRET: "secreto",
  INFISICAL_PROJECT_ID: "proyecto",
};

describe("cargarSecretos", () => {
  it("no hace nada sin identidad configurada", async () => {
    const { llamadas, fetchFalso } = falso([]);
    expect(await cargarSecretos({ servicio: "worker", env: {}, fetch: fetchFalso })).toBeUndefined();
    expect(llamadas).toHaveLength(0);
  });

  it("inicia sesión, lee la carpeta del servicio y pisa las variables", async () => {
    const env: NodeJS.ProcessEnv = { ...identidad, SUPABASE_SERVICE_ROLE_KEY: "vieja" };
    const { llamadas, fetchFalso } = falso([
      { status: 200, cuerpo: { accessToken: "tok" } },
      {
        status: 200,
        cuerpo: {
          secrets: [
            { secretKey: "SUPABASE_SERVICE_ROLE_KEY", secretValue: "nueva" },
            { secretKey: "WORKER_SECRET", secretValue: "abc" },
          ],
        },
      },
    ]);
    const r = await cargarSecretos({ servicio: "worker", env, fetch: fetchFalso, esperaMs: 0 });
    expect(r).toEqual({ cantidad: 2 });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("nueva");
    expect(env.WORKER_SECRET).toBe("abc");
    expect(llamadas[0]!.url).toBe("https://app.infisical.com/api/v1/auth/universal-auth/login");
    expect(llamadas[1]!.url).toContain("secretPath=%2Fworker");
    expect(llamadas[1]!.url).toContain("environment=prod");
    expect((llamadas[1]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("falla si la carpeta no tiene secretos", async () => {
    const { fetchFalso } = falso([
      { status: 200, cuerpo: { accessToken: "tok" } },
      { status: 200, cuerpo: { secrets: [] } },
    ]);
    await expect(
      cargarSecretos({ servicio: "worker", env: { ...identidad }, fetch: fetchFalso }),
    ).rejects.toThrow(/no tiene secretos/);
  });

  it("no reintenta una credencial rechazada y no muestra el cuerpo de la respuesta", async () => {
    const { llamadas, fetchFalso } = falso([{ status: 401, cuerpo: { message: "detalle-privado" } }]);
    const err = await cargarSecretos({ servicio: "worker", env: { ...identidad }, fetch: fetchFalso }).catch(
      (e: Error) => e,
    );
    expect(String((err as Error).message)).toContain("401");
    expect(String((err as Error).message)).not.toContain("detalle-privado");
    expect(llamadas).toHaveLength(1);
  });

  it("reintenta errores del servidor", async () => {
    const { llamadas, fetchFalso } = falso([
      { status: 503 },
      { status: 200, cuerpo: { accessToken: "tok" } },
      { status: 200, cuerpo: { secrets: [{ secretKey: "A", secretValue: "1" }] } },
    ]);
    await cargarSecretos({ servicio: "worker", env: { ...identidad }, fetch: fetchFalso, esperaMs: 0 });
    expect(llamadas).toHaveLength(3);
  });

  it("exige secreto de cliente y proyecto con la identidad", async () => {
    await expect(
      cargarSecretos({ servicio: "worker", env: { INFISICAL_CLIENT_ID: "id" } }),
    ).rejects.toThrow(/INFISICAL_CLIENT_SECRET/);
  });
});
