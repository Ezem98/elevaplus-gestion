import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import { supabaseAdmin } from "../supabase";
import { compararSecretSeguro, requerirWorkerSecretOAdmin } from "./auth";
import {
  autorizar,
  igualTiempoConstante,
} from "../../../supabase/functions/enviar-push/auth.ts";

describe("Worker - Autenticación y comparación en tiempo constante", () => {
  const workerSecretOriginal = config.WORKER_SECRET;

  beforeEach(() => {
    vi.restoreAllMocks();
    config.WORKER_SECRET = "secreto-de-prueba-seguro-123";
  });

  afterEach(() => {
    config.WORKER_SECRET = workerSecretOriginal;
  });

  describe("Función compararSecretSeguro", () => {
    it("retorna true cuando el secreto recibido coincide exactamente", () => {
      expect(
        compararSecretSeguro("mi-clave-super-secreta", "mi-clave-super-secreta"),
      ).toBe(true);
    });

    it("retorna false cuando el secreto recibido es incorrecto pero de igual longitud", () => {
      expect(
        compararSecretSeguro("mi-clave-super-secreta", "mi-clave-super-secreto"),
      ).toBe(false);
    });

    it("retorna false cuando el secreto recibido tiene distinta longitud sin lanzar excepción", () => {
      expect(
        compararSecretSeguro("corta", "mi-clave-super-secreta"),
      ).toBe(false);
      expect(
        compararSecretSeguro("mi-clave-super-secreta-mas-larga", "mi-clave-super-secreta"),
      ).toBe(false);
    });

    it("retorna false cuando el secreto recibido es indefinido o vacío", () => {
      expect(compararSecretSeguro(undefined, "mi-clave-super-secreta")).toBe(false);
      expect(compararSecretSeguro("", "mi-clave-super-secreta")).toBe(false);
    });

    it("retorna false cuando el secreto esperado es indefinido o vacío", () => {
      expect(compararSecretSeguro("mi-clave-super-secreta", undefined)).toBe(false);
      expect(compararSecretSeguro("mi-clave-super-secreta", "")).toBe(false);
    });
  });

  describe("Middleware requerirWorkerSecretOAdmin", () => {
    it("autentica exitosamente con header x-worker-secret correcto", async () => {
      const req: any = {
        headers: {
          "x-worker-secret": "secreto-de-prueba-seguro-123",
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await requerirWorkerSecretOAdmin(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.usuario).toEqual({
        id: "worker_secret",
        rol: "admin",
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it("autentica exitosamente con header Authorization: Bearer <secret> correcto", async () => {
      const req: any = {
        headers: {
          authorization: "Bearer secreto-de-prueba-seguro-123",
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await requerirWorkerSecretOAdmin(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.usuario).toEqual({
        id: "worker_secret",
        rol: "admin",
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it("rechaza secret incorrecto de misma longitud y delega en JWT (retornando 401 si no hay token)", async () => {
      const req: any = {
        headers: {
          "x-worker-secret": "secreto-de-prueba-seguro-999",
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await requerirWorkerSecretOAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });

    it("rechaza secret de distinta longitud y delega en JWT sin lanzar errores", async () => {
      const req: any = {
        headers: {
          "x-worker-secret": "invalido",
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await requerirWorkerSecretOAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("delega en JWT cuando WORKER_SECRET está vacío en la configuración", async () => {
      config.WORKER_SECRET = "";

      const req: any = {
        headers: {
          "x-worker-secret": "cualquier-cosa",
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await requerirWorkerSecretOAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("delega exitosamente en autenticación de usuario cuando se provee un JWT válido de admin", async () => {
      config.WORKER_SECRET = "";

      const req: any = {
        headers: {
          authorization: "Bearer token-jwt-valido",
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      vi.spyOn(supabaseAdmin.auth, "getUser").mockResolvedValue({
        data: { user: { id: "usuario-admin-1", email: "admin@elevaplus.com.ar" } } as any,
        error: null,
      });

      vi.spyOn(supabaseAdmin, "from").mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { rol: "admin", activo: true },
              error: null,
            }),
          }),
        }),
      } as any);

      await requerirWorkerSecretOAdmin(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.usuario).toEqual({
        id: "usuario-admin-1",
        email: "admin@elevaplus.com.ar",
        rol: "admin",
      });
    });
  });
});

describe("Edge Function - enviar-push auth", () => {
  describe("Función igualTiempoConstante", () => {
    it("retorna true para cadenas idénticas", () => {
      expect(igualTiempoConstante("clave-secreta", "clave-secreta")).toBe(true);
    });

    it("retorna false para cadenas de diferente longitud", () => {
      expect(igualTiempoConstante("clave", "clave-larga")).toBe(false);
      expect(igualTiempoConstante("clave-larga", "clave")).toBe(false);
    });

    it("retorna false para cadenas de misma longitud y diferente contenido", () => {
      expect(igualTiempoConstante("clave-123", "clave-456")).toBe(false);
      expect(igualTiempoConstante("clave-12a", "clave-12b")).toBe(false);
    });

    it("retorna true para cadenas vacías", () => {
      expect(igualTiempoConstante("", "")).toBe(true);
    });

    it("maneja correctamente cadenas con acentos y caracteres especiales UTF-8", () => {
      expect(igualTiempoConstante("elevación-rápida", "elevación-rápida")).toBe(true);
      expect(igualTiempoConstante("elevación-rápida", "elevacion-rapida")).toBe(false);
    });
  });

  describe("Función autorizar", () => {
    it("falla cerrado (sin_credenciales) si no hay WEBHOOK_SECRET ni SUPABASE_SERVICE_ROLE_KEY", () => {
      expect(
        autorizar({
          webhookSecret: undefined,
          serviceRoleKey: undefined,
          authHeader: "Bearer cualquier-cosa",
          apiKeyHeader: "cualquier-cosa",
        }),
      ).toBe("sin_credenciales");

      expect(
        autorizar({
          webhookSecret: "",
          serviceRoleKey: "",
          authHeader: null,
          apiKeyHeader: null,
        }),
      ).toBe("sin_credenciales");
    });

    it("autoriza con ok cuando authHeader coincide con Bearer WEBHOOK_SECRET", () => {
      const res = autorizar({
        webhookSecret: "super-webhook-secret-xyz",
        serviceRoleKey: undefined,
        authHeader: "Bearer super-webhook-secret-xyz",
      });
      expect(res).toBe("ok");
    });

    it("autoriza con ok cuando authHeader coincide con Bearer SUPABASE_SERVICE_ROLE_KEY", () => {
      const res = autorizar({
        webhookSecret: undefined,
        serviceRoleKey: "service-role-key-xyz",
        authHeader: "Bearer service-role-key-xyz",
      });
      expect(res).toBe("ok");
    });

    it("autoriza con ok cuando apiKeyHeader coincide con SUPABASE_SERVICE_ROLE_KEY", () => {
      const res = autorizar({
        webhookSecret: undefined,
        serviceRoleKey: "service-role-key-xyz",
        apiKeyHeader: "service-role-key-xyz",
      });
      expect(res).toBe("ok");
    });

    it("rechaza con no_autorizado si las credenciales no coinciden (misma longitud)", () => {
      const res = autorizar({
        webhookSecret: "super-webhook-secret-xyz",
        serviceRoleKey: "service-role-key-xyz",
        authHeader: "Bearer super-webhook-secret-abc",
        apiKeyHeader: "service-role-key-abc",
      });
      expect(res).toBe("no_autorizado");
    });

    it("rechaza con no_autorizado si las credenciales no coinciden (distinta longitud)", () => {
      const res = autorizar({
        webhookSecret: "super-webhook-secret-xyz",
        serviceRoleKey: "service-role-key-xyz",
        authHeader: "Bearer corta",
        apiKeyHeader: "corta",
      });
      expect(res).toBe("no_autorizado");
    });

    it("rechaza con no_autorizado si authHeader no tiene el prefijo Bearer", () => {
      const res = autorizar({
        webhookSecret: "super-webhook-secret-xyz",
        authHeader: "super-webhook-secret-xyz",
      });
      expect(res).toBe("no_autorizado");
    });

    it("rechaza con no_autorizado cuando no se proveen headers pero hay credenciales configuradas", () => {
      const res = autorizar({
        webhookSecret: "super-webhook-secret-xyz",
        serviceRoleKey: "service-role-key-xyz",
        authHeader: null,
        apiKeyHeader: null,
      });
      expect(res).toBe("no_autorizado");
    });
  });
});
