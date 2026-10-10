import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { validarSesionAsistente } from "./sesion";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

describe("validarSesionAsistente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza tokens vacíos con 401", async () => {
    await expect(validarSesionAsistente("")).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining("faltante"),
    });
  });

  it("rechaza usuarios con rol 'chofer' con 403 y mensaje claro", async () => {
    const mockCliente = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "chofer-uuid", email: "chofer@empresa.com" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { rol: "chofer", activo: true },
              error: null,
            }),
          }),
        }),
      }),
    };

    vi.mocked(createClient).mockReturnValue(mockCliente as any);

    await expect(validarSesionAsistente("token-chofer")).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("el asistente no está disponible para choferes"),
    });
  });

  it("rechaza usuarios inactivos con 403", async () => {
    const mockCliente = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "inactivo-uuid" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { rol: "oficina", activo: false },
              error: null,
            }),
          }),
        }),
      }),
    };

    vi.mocked(createClient).mockReturnValue(mockCliente as any);

    await expect(validarSesionAsistente("token-inactivo")).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("inactivo"),
    });
  });

  it("permite acceso a usuarios con rol 'admin' u 'oficina'", async () => {
    const mockCliente = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "oficina-uuid", email: "oficina@empresa.com" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { rol: "oficina", activo: true },
              error: null,
            }),
          }),
        }),
      }),
    };

    vi.mocked(createClient).mockReturnValue(mockCliente as any);

    const sesion = await validarSesionAsistente("token-oficina");
    expect(sesion.usuarioId).toBe("oficina-uuid");
    expect(sesion.rol).toBe("oficina");
    expect(sesion.cliente).toBeDefined();
  });
});
