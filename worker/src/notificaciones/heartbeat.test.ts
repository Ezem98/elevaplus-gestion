import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generarInstancias } from "../agenda/instancias";
import { recordatoriosHoy } from "../agenda/recordatorios";
import { resumenSemanal } from "../agenda/resumenSemanal";
import { config } from "../config";
import { correrLote } from "../emision/lote";
import { supabaseAdmin } from "../supabase";
import { latir, logger } from "./heartbeat";

describe("Worker - Heartbeats de Better Stack", () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  describe("Función latir()", () => {
    it("no lanza ni hace fetch si la URL no está definida o está vacía", async () => {
      (config as any).HEARTBEAT_INSTANCIAS = undefined;
      delete process.env.HEARTBEAT_INSTANCIAS;

      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;
      const warnSpy = vi.spyOn(logger, "warn");

      await expect(latir("instancias")).resolves.not.toThrow();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("no lanza y registra advertencia con logger.warn cuando el servidor devuelve 500", async () => {
      (config as any).HEARTBEAT_LOTE = "https://betterstack.com/heartbeat/lote";

      const fetchMock = vi.fn().mockResolvedValue(
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        }),
      );
      globalThis.fetch = fetchMock;
      const warnSpy = vi.spyOn(logger, "warn");

      await expect(latir("lote")).resolves.not.toThrow();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://betterstack.com/heartbeat/lote",
        expect.objectContaining({ method: "GET" }),
      );
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain("500");
      expect(warnSpy.mock.calls[0][0]).not.toContain("https://");
    });

    it("no lanza y registra advertencia con logger.warn cuando el fetch falla por error de red o timeout", async () => {
      (config as any).HEARTBEAT_RECORDATORIOS =
        "https://betterstack.com/heartbeat/recordatorios";

      const fetchMock = vi
        .fn()
        .mockRejectedValue(new Error("Connection reset"));
      globalThis.fetch = fetchMock;
      const warnSpy = vi.spyOn(logger, "warn");

      await expect(latir("recordatorios")).resolves.not.toThrow();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://betterstack.com/heartbeat/recordatorios",
        expect.objectContaining({ method: "GET" }),
      );
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain("Connection reset");
      expect(warnSpy.mock.calls[0][0]).not.toContain("https://");
    });

    it("envía el GET correctamente en el camino feliz (200 OK)", async () => {
      (config as any).HEARTBEAT_SEMANAL =
        "https://betterstack.com/heartbeat/semanal";

      const fetchMock = vi.fn().mockResolvedValue(
        new Response("ok", {
          status: 200,
          statusText: "OK",
        }),
      );
      globalThis.fetch = fetchMock;
      const warnSpy = vi.spyOn(logger, "warn");

      await expect(latir("semanal")).resolves.not.toThrow();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://betterstack.com/heartbeat/semanal",
        expect.objectContaining({ method: "GET" }),
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("Invocación de latir() desde las tareas", () => {
    describe("generarInstancias", () => {
      it("llama a latir('instancias') en el camino feliz", async () => {
        (config as any).HEARTBEAT_INSTANCIAS =
          "https://betterstack.com/heartbeat/instancias";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        } as any);

        const res = await generarInstancias();

        expect(res.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/instancias",
          expect.anything(),
        );
      });

      it("NO llama a latir('instancias') cuando ocurre un error", async () => {
        (config as any).HEARTBEAT_INSTANCIAS =
          "https://betterstack.com/heartbeat/instancias";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Error de conexión a la base" },
            }),
          }),
        } as any);

        const res = await generarInstancias();

        expect(res.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/instancias",
          expect.anything(),
        );
      });
    });

    describe("recordatoriosHoy", () => {
      it("llama a latir('recordatorios') en el camino feliz", async () => {
        (config as any).HEARTBEAT_RECORDATORIOS =
          "https://betterstack.com/heartbeat/recordatorios";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "ejecuciones_worker") {
            return {
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi
                    .fn()
                    .mockResolvedValue({ data: { id: 1 }, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                match: vi.fn().mockResolvedValue({ error: null }),
              }),
            } as any;
          }
          if (tabla === "agenda") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            } as any;
          }
          if (tabla === "cheques") {
            const queryChain: any = {
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
            return {
              select: vi.fn().mockReturnValue(queryChain),
            } as any;
          }
          return {} as any;
        });

        const res = await recordatoriosHoy({ forzar: true });

        expect(res.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/recordatorios",
          expect.anything(),
        );
      });

      it("NO llama a latir('recordatorios') en caso de error", async () => {
        (config as any).HEARTBEAT_RECORDATORIOS =
          "https://betterstack.com/heartbeat/recordatorios";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "ejecuciones_worker") {
            return {
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi
                    .fn()
                    .mockResolvedValue({ data: { id: 1 }, error: null }),
                }),
              }),
            } as any;
          }
          if (tabla === "agenda") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  neq: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: "Error consultando agenda" },
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await recordatoriosHoy({ forzar: true });

        expect(res.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/recordatorios",
          expect.anything(),
        );
      });
    });

    describe("correrLote", () => {
      it("llama a latir('lote') cuando sale temprano por ambiente homologación", async () => {
        (config as any).HEARTBEAT_LOTE =
          "https://betterstack.com/heartbeat/lote";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "empresa") {
            return {
              select: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { arca_ambiente: "homologacion" },
                    error: null,
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await correrLote({ disparadoPor: "cron" });

        expect(res.error).toBeNull();
        expect(fetchMock).toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/lote",
          expect.anything(),
        );
      });

      it("NO llama a latir('lote') si falla la creación del lote en la base", async () => {
        (config as any).HEARTBEAT_LOTE =
          "https://betterstack.com/heartbeat/lote";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "empresa") {
            return {
              select: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { arca_ambiente: "produccion" },
                    error: null,
                  }),
                }),
              }),
            } as any;
          }
          if (tabla === "facturas") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  lte: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            } as any;
          }
          if (tabla === "lotes_emision") {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: "Error al crear lote" },
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        await expect(
          correrLote({ disparadoPor: "manual:admin" }),
        ).rejects.toThrow();

        expect(fetchMock).not.toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/lote",
          expect.anything(),
        );
      });
    });

    describe("resumenSemanal", () => {
      it("llama a latir('semanal') en el camino feliz cuando se omite por lista blanca", async () => {
        (config as any).HEARTBEAT_SEMANAL =
          "https://betterstack.com/heartbeat/semanal";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        config.MAIL_LISTA_BLANCA = "otro@test.com";

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "ejecuciones_worker") {
            return {
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi
                    .fn()
                    .mockResolvedValue({ data: { id: 1 }, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                match: vi.fn().mockResolvedValue({ error: null }),
              }),
            } as any;
          }
          if (tabla === "empresa") {
            return {
              select: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      email: "contacto@empresa.com",
                      nombre: "ELEVAPLUS",
                    },
                    error: null,
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await resumenSemanal({ forzar: true });

        expect(res.ok).toBe(true);
        expect(res.omitidoPorListaBlanca).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/semanal",
          expect.anything(),
        );
      });

      it("NO llama a latir('semanal') cuando la empresa no tiene email configurado", async () => {
        (config as any).HEARTBEAT_SEMANAL =
          "https://betterstack.com/heartbeat/semanal";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "ejecuciones_worker") {
            return {
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi
                    .fn()
                    .mockResolvedValue({ data: { id: 1 }, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                match: vi.fn().mockResolvedValue({ error: null }),
              }),
            } as any;
          }
          if (tabla === "empresa") {
            return {
              select: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { email: null },
                    error: null,
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await resumenSemanal({ forzar: true });

        expect(res.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/semanal",
          expect.anything(),
        );
      });
    });
  });
});
