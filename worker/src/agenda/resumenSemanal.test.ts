import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import * as mailCliente from "../mail/cliente";
import { supabaseAdmin } from "../supabase";
import { obtenerEmailDestinoEmpresa, resumenSemanal } from "./resumenSemanal";

describe("resumenSemanal - Resolución de destinatario desde empresa", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    config.MAIL_LISTA_BLANCA =
      "elevaplus.one@gmail.com,facturacion@eleva-plus.com.ar";
  });

  describe("obtenerEmailDestinoEmpresa", () => {
    it("resuelve empresa.email cuando está cargado y email_facturacion está vacío", async () => {
      vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
        if (tabla === "empresa") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    email: "elevaplus.one@gmail.com",
                    email_facturacion: null,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await obtenerEmailDestinoEmpresa();

      expect(res.error).toBeUndefined();
      expect(res.email).toBe("elevaplus.one@gmail.com");
    });

    it("hace fallback a empresa.email_facturacion si empresa.email está vacío", async () => {
      vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
        if (tabla === "empresa") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    email: "",
                    email_facturacion: "facturacion@eleva-plus.com.ar",
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await obtenerEmailDestinoEmpresa();

      expect(res.error).toBeUndefined();
      expect(res.email).toBe("facturacion@eleva-plus.com.ar");
    });

    it("retorna error explicativo mencionando las columnas cuando ambos emails están vacíos", async () => {
      vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
        if (tabla === "empresa") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    email: null,
                    email_facturacion: "",
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await obtenerEmailDestinoEmpresa();

      expect(res.email).toBeNull();
      expect(res.error).toContain(
        "No hay email configurado en la tabla empresa",
      );
      expect(res.error).toContain("'email'");
      expect(res.error).toContain("'email_facturacion'");
    });

    it("propaga el error de base de datos cuando la consulta a empresa falla", async () => {
      vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
        if (tabla === "empresa") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: "42703",
                    message: "column empresa.nombre does not exist",
                  },
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await obtenerEmailDestinoEmpresa();

      expect(res.email).toBeNull();
      expect(res.error).toBe(
        "Error al consultar tabla empresa: column empresa.nombre does not exist",
      );
    });

    it("retorna error descriptivo si el registro de empresa (id = 1) no existe", async () => {
      vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
        if (tabla === "empresa") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await obtenerEmailDestinoEmpresa();

      expect(res.email).toBeNull();
      expect(res.error).toContain(
        "No se encontró el registro de la empresa en la base de datos (id = 1)",
      );
    });
  });

  describe("resumenSemanal - Flujo completo", () => {
    it("con empresa.email cargado y email_facturacion vacío, resuelve el destinatario correctamente", async () => {
      vi.spyOn(mailCliente, "enviarMailConResend").mockResolvedValue({
        exito: true,
        id: "resend_mock_123",
        destinatario: "elevaplus.one@gmail.com",
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
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    email: "elevaplus.one@gmail.com",
                    email_facturacion: null,
                  },
                  error: null,
                }),
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
                    data: [],
                    error: null,
                  }),
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
                    order: vi.fn().mockResolvedValue({
                      data: [],
                      error: null,
                    }),
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

      const resultado = await resumenSemanal({ forzar: true });

      expect(resultado.ok).toBe(true);
      expect(resultado.destinatario).toBe("elevaplus.one@gmail.com");
      expect(mailCliente.enviarMailConResend).toHaveBeenCalledWith(
        expect.objectContaining({
          para: "elevaplus.one@gmail.com",
        }),
      );
    });

    it("con empresa.email vacío y email_facturacion cargado, resuelve mediante fallback", async () => {
      vi.spyOn(mailCliente, "enviarMailConResend").mockResolvedValue({
        exito: true,
        id: "resend_mock_456",
        destinatario: "facturacion@eleva-plus.com.ar",
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
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    email: null,
                    email_facturacion: "facturacion@eleva-plus.com.ar",
                  },
                  error: null,
                }),
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
                    data: [],
                    error: null,
                  }),
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
                    order: vi.fn().mockResolvedValue({
                      data: [],
                      error: null,
                    }),
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

      const resultado = await resumenSemanal({ forzar: true });

      expect(resultado.ok).toBe(true);
      expect(resultado.destinatario).toBe("facturacion@eleva-plus.com.ar");
      expect(mailCliente.enviarMailConResend).toHaveBeenCalledWith(
        expect.objectContaining({
          para: "facturacion@eleva-plus.com.ar",
        }),
      );
    });

    it("cuando falla la consulta de empresa, propaga el error y no emite el mail", async () => {
      const spyEnviar = vi.spyOn(mailCliente, "enviarMailConResend");

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
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    code: "42703",
                    message: "column empresa.nombre does not exist",
                  },
                }),
              }),
            }),
          } as any;
        }

        return {} as any;
      });

      const resultado = await resumenSemanal({ forzar: true });

      expect(resultado.ok).toBe(false);
      expect(resultado.error).toBe(
        "Error al consultar tabla empresa: column empresa.nombre does not exist",
      );
      expect(spyEnviar).not.toHaveBeenCalled();
    });
  });
});
