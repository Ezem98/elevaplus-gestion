import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generarInstancias } from "../agenda/instancias";
import { recordatoriosHoy } from "../agenda/recordatorios";
import { resumenChoferesHoy } from "../agenda/resumenChoferes";
import { resumenSemanal } from "../agenda/resumenSemanal";
import { config } from "../config";
import * as emitirModule from "../emision/emitir";
import { correrLote } from "../emision/lote";
import * as mailClienteModule from "../mail/cliente";
import { sincronizarCalendario } from "../gcal/sincronizar";
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

    it("hace fetch GET con timeout de 5s en camino exitoso para 'calendario'", async () => {
      (config as any).HEARTBEAT_CALENDARIO =
        "https://betterstack.com/heartbeat/calendario";

      const fetchMock = vi.fn().mockResolvedValue(
        new Response("ok", {
          status: 200,
          statusText: "OK",
        }),
      );
      globalThis.fetch = fetchMock;
      const warnSpy = vi.spyOn(logger, "warn");

      await expect(latir("calendario")).resolves.not.toThrow();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://betterstack.com/heartbeat/calendario",
        expect.objectContaining({ method: "GET" }),
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("hace fetch GET con timeout de 5s en camino exitoso para 'choferes'", async () => {
      (config as any).HEARTBEAT_CHOFERES =
        "https://betterstack.com/heartbeat/choferes";

      const fetchMock = vi.fn().mockResolvedValue(
        new Response("ok", {
          status: 200,
          statusText: "OK",
        }),
      );
      globalThis.fetch = fetchMock;
      const warnSpy = vi.spyOn(logger, "warn");

      await expect(latir("choferes")).resolves.not.toThrow();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://betterstack.com/heartbeat/choferes",
        expect.objectContaining({ method: "GET" }),
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("Invocación de latir() desde las tareas", () => {
    describe("generarInstancias", () => {
      it("llama a latir('instancias') en el camino feliz cuando no hay vencimientos activos", async () => {
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

      it("llama a latir('instancias') en el camino feliz con vencimientos procesados", async () => {
        (config as any).HEARTBEAT_INSTANCIAS =
          "https://betterstack.com/heartbeat/instancias";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "vencimientos") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "v-1",
                      frecuencia: "mensual",
                      dia_del_mes: 10,
                      monto_estimado: 5000,
                      fecha_inicio: "2026-01-01",
                    },
                  ],
                  error: null,
                }),
              }),
            } as any;
          }
          if (tabla === "vencimiento_instancias") {
            return {
              upsert: vi.fn().mockResolvedValue({ error: null }),
            } as any;
          }
          return {} as any;
        });

        const res = await generarInstancias();

        expect(res.ok).toBe(true);
        expect(res.vencimientosProcesados).toBe(1);
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
          if (tabla === "servicios") {
            const queryChain: any = {
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
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

      it("llama a latir('recordatorios') cuando es omitido por idempotencia", async () => {
        (config as any).HEARTBEAT_RECORDATORIOS =
          "https://betterstack.com/heartbeat/recordatorios";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "ejecuciones_worker") {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: {
                      code: "23505",
                      message: "duplicate key value violates unique constraint",
                    },
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await recordatoriosHoy({ forzar: false });

        expect(res.ok).toBe(true);
        expect(res.omitido).toBe(true);
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

      it("llama a latir('lote') cuando no hay facturas para emitir (aEmitir vacío)", async () => {
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
                  single: vi.fn().mockResolvedValue({
                    data: {
                      tope_diario_facturas: 20,
                      tope_diario_monto: 20000000,
                    },
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
                    data: { id: "lote-vacio-1" },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            } as any;
          }
          if (tabla === "clientes") {
            return {
              select: vi.fn().mockResolvedValue({ data: [], error: null }),
            } as any;
          }
          if (tabla === "servicios") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    or: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await correrLote({ disparadoPor: "manual:admin" });

        expect(res.error).toBeNull();
        expect(res.loteId).toBe("lote-vacio-1");
        expect(res.facturasEmitidas).toBe(0);
        expect(fetchMock).toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/lote",
          expect.anything(),
        );
      });

      it("llama a latir('lote') cuando se superan los topes diarios (salida controlada)", async () => {
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
                  single: vi.fn().mockResolvedValue({
                    data: { tope_diario_facturas: 0, tope_diario_monto: 0 },
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
                    data: { id: "lote-topes-1" },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            } as any;
          }
          if (tabla === "clientes") {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "cli-1",
                    nombre: "Cliente 1",
                    cuit: "20111111112",
                    condicion_iva: "responsable_inscripto",
                    facturacion_modo: "por_servicio",
                    facturacion_automatica: true,
                  },
                ],
                error: null,
              }),
            } as any;
          }
          if (tabla === "servicios") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    or: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: "srv-1",
                          numero: 101,
                          cliente_id: "cli-1",
                          descripcion: "Servicio 1",
                          monto: 10000,
                          aplica_iva: true,
                          fecha_fin: "2026-09-20",
                          estado: "terminado",
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await correrLote({ disparadoPor: "manual:admin" });

        expect(res.error).toBe("tope_superado");
        expect(res.loteId).toBe("lote-topes-1");
        expect(res.facturasEmitidas).toBe(0);
        expect(fetchMock).toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/lote",
          expect.anything(),
        );
      });

      it("llama a latir('lote') en el camino normal con facturas emitidas", async () => {
        (config as any).HEARTBEAT_LOTE =
          "https://betterstack.com/heartbeat/lote";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(emitirModule, "emitirFactura").mockResolvedValue({
          tipo: "Factura A",
          punto_venta: 1,
          numero: 10,
          cae: "12345678901234",
          vencimiento_cae: "2026-09-30",
          factura_id: "fact-1",
        } as any);

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "empresa") {
            return {
              select: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { arca_ambiente: "produccion" },
                    error: null,
                  }),
                  single: vi.fn().mockResolvedValue({
                    data: {
                      tope_diario_facturas: 50,
                      tope_diario_monto: 50000000,
                    },
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
                    data: { id: "lote-exito-1" },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            } as any;
          }
          if (tabla === "clientes") {
            return {
              select: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "cli-1",
                    nombre: "Cliente 1",
                    cuit: "20111111112",
                    condicion_iva: "responsable_inscripto",
                    facturacion_modo: "por_servicio",
                    facturacion_automatica: true,
                  },
                ],
                error: null,
              }),
            } as any;
          }
          if (tabla === "servicios") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    or: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: "srv-1",
                          numero: 101,
                          cliente_id: "cli-1",
                          descripcion: "Servicio 1",
                          monto: 10000,
                          aplica_iva: true,
                          fecha_fin: "2026-09-20",
                          estado: "terminado",
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await correrLote({ disparadoPor: "manual:admin" });

        expect(res.error).toBeNull();
        expect(res.loteId).toBe("lote-exito-1");
        expect(res.facturasEmitidas).toBe(1);
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

      it("NO llama a latir('lote') si ocurre un error crítico durante la consulta de servicios", async () => {
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
                    data: { id: "lote-crit-1" },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            } as any;
          }
          if (tabla === "clientes") {
            return {
              select: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            } as any;
          }
          if (tabla === "servicios") {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    or: vi.fn().mockResolvedValue({
                      data: null,
                      error: {
                        message: "Error al consultar servicios: timeout",
                      },
                    }),
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        await expect(
          correrLote({ disparadoPor: "manual:admin" }),
        ).rejects.toThrow("Error al consultar servicios: timeout");

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
            const mockData = {
              data: {
                email: "contacto@empresa.com",
                email_facturacion: null,
                razon_social: "ELEVAPLUS",
              },
              error: null,
            };
            const mockChain: any = {
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue(mockData),
              maybeSingle: vi.fn().mockResolvedValue(mockData),
            };
            return {
              select: vi.fn().mockReturnValue(mockChain),
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

      it("llama a latir('semanal') cuando es omitido por idempotencia", async () => {
        (config as any).HEARTBEAT_SEMANAL =
          "https://betterstack.com/heartbeat/semanal";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
          if (tabla === "ejecuciones_worker") {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: {
                      code: "23505",
                      message: "duplicate key value violates unique constraint",
                    },
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await resumenSemanal({ forzar: false });

        expect(res.ok).toBe(true);
        expect(res.omitido).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/semanal",
          expect.anything(),
        );
      });

      it("llama a latir('semanal') en el camino normal cuando el correo se envía con éxito", async () => {
        (config as any).HEARTBEAT_SEMANAL =
          "https://betterstack.com/heartbeat/semanal";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        config.MAIL_LISTA_BLANCA = "admin@empresa.com";

        vi.spyOn(mailClienteModule, "enviarMailConResend").mockResolvedValue({
          exito: true,
          id: "resend-mock-123",
        });

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
            const mockData = {
              data: {
                email: "admin@empresa.com",
                email_facturacion: null,
              },
              error: null,
            };
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue(mockData),
                  single: vi.fn().mockResolvedValue(mockData),
                }),
              }),
            } as any;
          }
          if (tabla === "agenda") {
            return {
              select: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            } as any;
          }
          if (tabla === "cheques") {
            return {
              select: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      order: vi
                        .fn()
                        .mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        vi.spyOn(supabaseAdmin, "rpc").mockResolvedValue({
          data: [],
          error: null,
        } as any);

        const res = await resumenSemanal({ forzar: true });

        expect(res.ok).toBe(true);
        expect(res.omitidoPorListaBlanca).toBeUndefined();
        expect(res.destinatario).toBe("admin@empresa.com");
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
            const mockData = {
              data: { email: null, email_facturacion: null },
              error: null,
            };
            const mockChain: any = {
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue(mockData),
              maybeSingle: vi.fn().mockResolvedValue(mockData),
            };
            return {
              select: vi.fn().mockReturnValue(mockChain),
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

      it("NO llama a latir('semanal') cuando falla el envío del mail vía Resend", async () => {
        (config as any).HEARTBEAT_SEMANAL =
          "https://betterstack.com/heartbeat/semanal";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        config.MAIL_LISTA_BLANCA = "admin@empresa.com";

        vi.spyOn(mailClienteModule, "enviarMailConResend").mockResolvedValue({
          exito: false,
          motivo: "API key inválida",
        });

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
            const mockData = {
              data: {
                email: "admin@empresa.com",
                email_facturacion: null,
              },
              error: null,
            };
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue(mockData),
                  single: vi.fn().mockResolvedValue(mockData),
                }),
              }),
            } as any;
          }
          if (tabla === "agenda") {
            return {
              select: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            } as any;
          }
          if (tabla === "cheques") {
            return {
              select: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      order: vi
                        .fn()
                        .mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        vi.spyOn(supabaseAdmin, "rpc").mockResolvedValue({
          data: [],
          error: null,
        } as any);

        const res = await resumenSemanal({ forzar: true });

        expect(res.ok).toBe(false);
        expect(res.error).toBe("API key inválida");
        expect(fetchMock).not.toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/semanal",
          expect.anything(),
        );
      });

      it("NO llama a latir('semanal') cuando ocurre una excepción en la consulta de agenda", async () => {
        (config as any).HEARTBEAT_SEMANAL =
          "https://betterstack.com/heartbeat/semanal";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        config.MAIL_LISTA_BLANCA = "admin@empresa.com";

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
            const mockData = {
              data: {
                email: "admin@empresa.com",
                email_facturacion: null,
              },
              error: null,
            };
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue(mockData),
                  single: vi.fn().mockResolvedValue(mockData),
                }),
              }),
            } as any;
          }
          if (tabla === "agenda") {
            return {
              select: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: "Error consultando agenda semanal" },
                    }),
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

    describe("sincronizarCalendario", () => {
      it("llama a latir('calendario') en el camino feliz cuando no hay conexiones activas", async () => {
        (config as any).HEARTBEAT_CALENDARIO =
          "https://betterstack.com/heartbeat/calendario";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        } as any);

        const res = await sincronizarCalendario();

        expect(res.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/calendario",
          expect.objectContaining({ method: "GET" }),
        );
      });

      it("NO llama a latir('calendario') cuando ocurre un error al consultar conexiones", async () => {
        (config as any).HEARTBEAT_CALENDARIO =
          "https://betterstack.com/heartbeat/calendario";

        const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
        globalThis.fetch = fetchMock;

        vi.spyOn(supabaseAdmin, "from").mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Error consultando conexiones de Google Calendar" },
            }),
          }),
        } as any);

        const res = await sincronizarCalendario();

        expect(fetchMock).not.toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/calendario",
          expect.anything(),
        );
      });
    });

    describe("resumenChoferesHoy", () => {
      it("llama a latir('choferes') en el camino feliz cuando no hay choferes", async () => {
        (config as any).HEARTBEAT_CHOFERES =
          "https://betterstack.com/heartbeat/choferes";

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
          if (tabla === "perfiles") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            } as any;
          }
          if (tabla === "servicios") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await resumenChoferesHoy({ forzar: true });

        expect(res.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/choferes",
          expect.anything(),
        );
      });

      it("NO llama a latir('choferes') si ocurre un error al consultar la base", async () => {
        (config as any).HEARTBEAT_CHOFERES =
          "https://betterstack.com/heartbeat/choferes";

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
          if (tabla === "perfiles") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: "Error consultando perfiles" },
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const res = await resumenChoferesHoy({ forzar: true });

        expect(res.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalledWith(
          "https://betterstack.com/heartbeat/choferes",
          expect.anything(),
        );
      });
    });
  });
});
