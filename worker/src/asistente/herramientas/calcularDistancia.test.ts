import { describe, expect, it, vi } from "vitest";
import {
  calcularDistanciaRuta,
  herramientaCalcularDistancia,
  normalizarDireccion,
} from "./calcularDistancia";

describe("Herramienta calcular_distancia", () => {
  const CLAVE_TEST = "test-api-key";

  it("ok: convierte metros a km con 1 decimal y duración a minutos", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            distanceMeters: 32400,
            duration: "1800s",
          },
        ],
      }),
    });

    const resultado = await calcularDistanciaRuta(
      { origen: "Burzaco", destino: "Campana" },
      { apiKey: CLAVE_TEST, esFalso: false, fetchFn: mockFetch as any },
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(resultado.error).toBeUndefined();
    expect(resultado.km).toBe(32.4);
    expect(resultado.duracion_min).toBe(30);
    expect(resultado.origen).toBe("Burzaco");
    expect(resultado.destino).toBe("Campana");
    expect(resultado.resumen).toContain("32.4 km");
    expect(resultado.resumen).toContain("30 min");
  });

  it("sin ruta: devuelve error claro cuando Google no encuentra trayecto", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [] }),
    });

    const resultado = await calcularDistanciaRuta(
      { origen: "Isla Perdida", destino: "Burzaco" },
      { apiKey: CLAVE_TEST, esFalso: false, fetchFn: mockFetch as any },
    );

    expect(resultado.error).toBeDefined();
    expect(resultado.error).toContain("No se encontró una ruta");
    expect(resultado.km).toBeUndefined();
  });

  it("error HTTP: devuelve error claro cuando la API falla con código HTTP", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          message: "Ubicación inválida",
        },
      }),
    });

    const resultado = await calcularDistanciaRuta(
      { origen: "Burzaco", destino: "Campana" },
      { apiKey: CLAVE_TEST, esFalso: false, fetchFn: mockFetch as any },
    );

    expect(resultado.error).toBeDefined();
    expect(resultado.error).toContain("Ubicación inválida");
    expect(resultado.km).toBeUndefined();
  });

  it("sin API key: no llama a fetch y devuelve mensaje solicitando los km", async () => {
    const mockFetch = vi.fn();

    const resultado = await calcularDistanciaRuta(
      { origen: "Burzaco", destino: "Campana" },
      { apiKey: "", esFalso: false, fetchFn: mockFetch as any },
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(resultado.error).toBe(
      "El cálculo de distancia no está configurado; pasame los km",
    );
    expect(resultado.km).toBeUndefined();
  });

  it("agrega ', Buenos Aires, Argentina' cuando corresponde para desambiguar", async () => {
    // 1. Verificación directa de normalizarDireccion
    expect(normalizarDireccion("Burzaco")).toBe(
      "Burzaco, Buenos Aires, Argentina",
    );
    expect(normalizarDireccion("Ruta 2 km 40, Brandsen")).toBe(
      "Ruta 2 km 40, Brandsen, Buenos Aires, Argentina",
    );
    expect(normalizarDireccion("Campana, Buenos Aires")).toBe(
      "Campana, Buenos Aires",
    );
    expect(normalizarDireccion("Rosario, Santa Fe")).toBe(
      "Rosario, Santa Fe",
    );
    expect(normalizarDireccion("Córdoba, Argentina")).toBe(
      "Córdoba, Argentina",
    );
    expect(normalizarDireccion("Avellaneda, CABA")).toBe(
      "Avellaneda, CABA",
    );

    // 2. Verificación en el payload enviado al endpoint
    let bodyEnviado: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      bodyEnviado = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({
          routes: [{ distanceMeters: 10000, duration: "600s" }],
        }),
      });
    });

    await calcularDistanciaRuta(
      { origen: "Burzaco", destino: "Campana" },
      { apiKey: CLAVE_TEST, esFalso: false, fetchFn: mockFetch as any },
    );

    expect(bodyEnviado).not.toBeNull();
    expect(bodyEnviado.origin.address).toBe("Burzaco, Buenos Aires, Argentina");
    expect(bodyEnviado.destination.address).toBe(
      "Campana, Buenos Aires, Argentina",
    );
    expect(bodyEnviado.travelMode).toBe("DRIVE");
    expect(bodyEnviado.regionCode).toBe("ar");
    expect(bodyEnviado.languageCode).toBe("es-AR");
  });

  it("la key no aparece en el error si la API o la red fallan mencionándola", async () => {
    // Caso 1: API HTTP devuelve mensaje con la key
    const mockFetchHttp = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          message: `The API key ${CLAVE_TEST} has expired`,
        },
      }),
    });

    const resHttp = await calcularDistanciaRuta(
      { origen: "Burzaco", destino: "Campana" },
      { apiKey: CLAVE_TEST, esFalso: false, fetchFn: mockFetchHttp as any },
    );

    expect(resHttp.error).toBeDefined();
    expect(resHttp.error).not.toContain(CLAVE_TEST);
    expect(resHttp.error).toContain("[OCULTA]");

    // Caso 2: Excepción de red con la key en el mensaje
    const mockFetchRed = vi.fn().mockRejectedValue(
      new Error(`Fallo de conexión enviando key ${CLAVE_TEST}`),
    );

    const resRed = await calcularDistanciaRuta(
      { origen: "Burzaco", destino: "Campana" },
      { apiKey: CLAVE_TEST, esFalso: false, fetchFn: mockFetchRed as any },
    );

    expect(resRed.error).toBeDefined();
    expect(resRed.error).not.toContain(CLAVE_TEST);
    expect(resRed.error).toContain("[OCULTA]");
  });

  it("en modo falso devuelve distancia fija de prueba sin llamar a Google", async () => {
    const mockFetch = vi.fn();

    const resultado = await calcularDistanciaRuta(
      { origen: "Burzaco", destino: "Campana" },
      { apiKey: "", esFalso: true, fetchFn: mockFetch as any },
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(resultado.error).toBeUndefined();
    expect(resultado.km).toBe(105.4);
    expect(resultado.duracion_min).toBe(95);
    expect(resultado.origen).toBe("Burzaco");
    expect(resultado.destino).toBe("Campana");
    expect(resultado.resumen).toContain("105.4 km");
  });

  it("definición de herramienta: roles permitidos y sin acceso para chofer", () => {
    expect(herramientaCalcularDistancia.nombre).toBe("calcular_distancia");
    expect(herramientaCalcularDistancia.roles).toContain("admin");
    expect(herramientaCalcularDistancia.roles).toContain("oficina");
    expect(herramientaCalcularDistancia.roles).not.toContain("chofer");
    expect(herramientaCalcularDistancia.parametros.required).toEqual([
      "origen",
      "destino",
    ]);
  });
});
