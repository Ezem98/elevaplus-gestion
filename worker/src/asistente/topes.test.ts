import { beforeEach, describe, expect, it, vi } from "vitest";
import * as moduloPush from "../notificaciones/push";
import { _resetearTopesMemoria, verificarTopes } from "./topes";

describe("verificarTopes", () => {
  const usuarioId = "usr-tester-1";

  beforeEach(() => {
    _resetearTopesMemoria();
    vi.restoreAllMocks();
  });

  it("permite el mensaje si el usuario está dentro de todos los límites", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [{ id: "conv-1" }], error: null }),
          in: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ count: 5, error: null }),
            })),
            gte: vi.fn(() => ({
              not: vi.fn().mockResolvedValue({
                data: [{ costo_usd: 0.05 }],
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    const res = await verificarTopes(usuarioId, mockSupabase as any);
    expect(res.superado).toBe(false);
  });

  it("detecta rate limit en memoria si se envían más de 10 mensajes en 1 minuto y avisa por push al admin", async () => {
    const spyPush = vi
      .spyOn(moduloPush, "enviarPushDirecto")
      .mockResolvedValue({ ok: true });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };

    // Enviar 10 mensajes seguidos
    for (let i = 0; i < 10; i++) {
      const res = await verificarTopes(usuarioId, mockSupabase as any);
      expect(res.superado).toBe(false);
    }

    // El mensaje número 11 debe superar el rate limit
    const res11 = await verificarTopes(usuarioId, mockSupabase as any);
    expect(res11.superado).toBe(true);
    expect(res11.motivo).toBe("rate_limit");
    expect(res11.mensaje).toBe("Por hoy llegué al límite; seguimos mañana");

    // Verificar notificación push al admin
    expect(spyPush).toHaveBeenCalledTimes(1);
    expect(spyPush).toHaveBeenCalledWith(
      expect.objectContaining({
        destinatarios: { roles: ["admin"] },
      }),
    );

    // Un intento posterior el mismo día no vuelve a disparar push al admin
    await verificarTopes(usuarioId, mockSupabase as any);
    expect(spyPush).toHaveBeenCalledTimes(1);
  });

  it("detecta tope diario de 60 mensajes y avisa al admin", async () => {
    const spyPush = vi
      .spyOn(moduloPush, "enviarPushDirecto")
      .mockResolvedValue({ ok: true });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [{ id: "conv-1" }], error: null }),
          in: vi.fn(() => ({
            eq: vi.fn(() => ({
              // 60 mensajes hoy
              gte: vi.fn().mockResolvedValue({ count: 60, error: null }),
            })),
          })),
        })),
      })),
    };

    const res = await verificarTopes(usuarioId, mockSupabase as any);
    expect(res.superado).toBe(true);
    expect(res.motivo).toBe("mensajes_diarios");
    expect(res.mensaje).toBe("Por hoy llegué al límite; seguimos mañana");
    expect(spyPush).toHaveBeenCalledTimes(1);
  });

  it("detecta tope diario de gasto en USD", async () => {
    const spyPush = vi
      .spyOn(moduloPush, "enviarPushDirecto")
      .mockResolvedValue({ ok: true });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: [{ id: "conv-1" }], error: null }),
          in: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn().mockResolvedValue({ count: 20, error: null }),
            })),
            gte: vi.fn(() => ({
              not: vi.fn().mockResolvedValue({
                // Supera 1 USD
                data: [{ costo_usd: 0.6 }, { costo_usd: 0.5 }],
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    const res = await verificarTopes(usuarioId, mockSupabase as any);
    expect(res.superado).toBe(true);
    expect(res.motivo).toBe("costo_diario");
    expect(res.mensaje).toBe("Por hoy llegué al límite; seguimos mañana");
    expect(spyPush).toHaveBeenCalledTimes(1);
  });
});
