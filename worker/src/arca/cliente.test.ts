import { beforeEach, describe, expect, it } from "vitest";
import { config } from "../config";
import {
  CUIT_HOMOLOGACION_AFIPSDK,
  obtenerInstanciaAfip,
} from "./cliente";

describe("Worker - ARCA cliente (obtenerInstanciaAfip)", () => {
  beforeEach(() => {
    config.ARCA_CUIT = undefined;
    config.ARCA_CERT = undefined;
    config.ARCA_KEY = undefined;
    config.AFIPSDK_ACCESS_TOKEN = "";
  });

  it("exporta CUIT_HOMOLOGACION_AFIPSDK con el valor 20409378472", () => {
    expect(CUIT_HOMOLOGACION_AFIPSDK).toBe(20409378472);
  });

  it("en homologación sin ARCA_CUIT usa 20409378472 por defecto", () => {
    const afip = obtenerInstanciaAfip({ ambiente: "homologacion" });
    expect(afip.CUIT).toBe(20409378472);
    expect(afip.options.production).toBe(false);
  });

  it("en homologación con opciones.cuit respeta el CUIT provisto", () => {
    const afip = obtenerInstanciaAfip({
      ambiente: "homologacion",
      cuit: 20111111112,
    });
    expect(afip.CUIT).toBe(20111111112);
    expect(afip.options.production).toBe(false);
  });

  it("en producción sin variables lanza error con los nombres faltantes", () => {
    expect(() => obtenerInstanciaAfip({ ambiente: "produccion" })).toThrowError(
      "Faltan variables requeridas para ARCA en producción: ARCA_CUIT, ARCA_CERT, ARCA_KEY, AFIPSDK_ACCESS_TOKEN",
    );
  });

  it("en producción lista únicamente las variables que faltan", () => {
    expect(() =>
      obtenerInstanciaAfip({
        ambiente: "produccion",
        cuit: 27226514878,
        accessToken: "test_token_afipsdk",
      }),
    ).toThrowError(
      "Faltan variables requeridas para ARCA en producción: ARCA_CERT, ARCA_KEY",
    );
  });

  it("en producción con todas las variables requeridas crea la instancia correctamente sin exponer secretos", () => {
    const tokenSecreto = "super_secret_token_123";
    const certMock = "-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----";
    const keyMock = "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----";

    const afip = obtenerInstanciaAfip({
      ambiente: "produccion",
      cuit: 27226514878,
      cert: certMock,
      key: keyMock,
      accessToken: tokenSecreto,
    });

    expect(afip.CUIT).toBe(27226514878);
    expect(afip.options.production).toBe(true);
    expect(afip.options.cert).toBe(certMock);
    expect(afip.options.key).toBe(keyMock);
  });

  it("ningún error en producción imprime el valor de cert, key o token", () => {
    const valorSecretoToken = "afipsdk_token_secreto_xyz";
    const valorSecretoKey = "clave_privada_secreta_abc";

    try {
      obtenerInstanciaAfip({
        ambiente: "produccion",
        accessToken: valorSecretoToken,
        key: valorSecretoKey,
        // Faltan ARCA_CUIT y ARCA_CERT
      });
      expect.unreachable("Debió lanzar un error");
    } catch (err: any) {
      expect(err.message).toContain("ARCA_CUIT");
      expect(err.message).toContain("ARCA_CERT");
      expect(err.message).not.toContain(valorSecretoToken);
      expect(err.message).not.toContain(valorSecretoKey);
    }
  });
});
