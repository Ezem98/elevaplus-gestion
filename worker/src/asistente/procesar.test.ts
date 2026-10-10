import { describe, expect, it, vi } from "vitest";
import { MAX_VUELTAS_HERRAMIENTAS, procesarTurno } from "./procesar";
import type { ProveedorModelo, RespuestaModelo } from "./proveedor/tipos";

describe("procesarTurno y bucle de herramientas", () => {
  it("el loop corta estrictamente a las 6 vueltas si el modelo continúa pidiendo herramientas", async () => {
    let llamadasGenerar = 0;

    // Proveedor que siempre pide una herramienta en cada vuelta
    const proveedorInfinito: ProveedorModelo = {
      async generarRespuesta(): Promise<RespuestaModelo> {
        llamadasGenerar++;
        return {
          llamadasHerramientas: [
            {
              id: `call_${llamadasGenerar}`,
              nombre: "resolver_fecha",
              argumentos: { texto: "hoy" },
            },
          ],
          tokensEntrada: 10,
          tokensSalida: 10,
          costoUsd: 0.00001,
          modelo: "test-loop",
          promptVersion: "1",
        };
      },
    };

    const mockInsert = vi.fn((datos: any) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: `msg-${Date.now()}`, ...datos },
          error: null,
        }),
      })),
    }));

    const mockSelectHistorial = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    });

    const mockSupabase = {
      from: vi.fn((tabla: string) => {
        if (tabla === "asistente_mensajes") {
          return {
            insert: mockInsert,
            select: mockSelectHistorial,
          };
        }
        return {
          select: vi.fn(),
          insert: vi.fn(),
        };
      }),
    };

    const resultado = await procesarTurno({
      conversacionId: "conv-123",
      usuarioId: "usr-456",
      rol: "oficina",
      texto: "Probando corte de vueltas",
      supabase: mockSupabase as any,
      proveedor: proveedorInfinito,
    });

    // Debe cortar exactamente a las 6 vueltas
    expect(llamadasGenerar).toBe(MAX_VUELTAS_HERRAMIENTAS);
    expect(MAX_VUELTAS_HERRAMIENTAS).toBe(6);

    // Debe guardar mensaje del asistente con las 6 herramientas ejecutadas
    expect(resultado.mensaje_asistente).toBeDefined();
    expect(resultado.mensaje_asistente.herramientas).toHaveLength(6);
    expect(resultado.mensaje_asistente.contenido).toContain("límite");
  });

  it("finaliza en 1 vuelta si el modelo responde directamente con texto", async () => {
    let llamadasGenerar = 0;

    const proveedorDirecto: ProveedorModelo = {
      async generarRespuesta(): Promise<RespuestaModelo> {
        llamadasGenerar++;
        return {
          texto: "Hola, ¿en qué te puedo ayudar?",
          tokensEntrada: 15,
          tokensSalida: 10,
          costoUsd: 0.000015,
          modelo: "directo",
          promptVersion: "1",
        };
      },
    };

    const mockInsert = vi.fn((datos: any) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: `msg-${Date.now()}`, ...datos },
          error: null,
        }),
      })),
    }));

    const mockSupabase = {
      from: vi.fn((tabla: string) => {
        if (tabla === "asistente_mensajes") {
          return {
            insert: mockInsert,
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn() };
      }),
    };

    const resultado = await procesarTurno({
      conversacionId: "conv-123",
      usuarioId: "usr-456",
      rol: "admin",
      texto: "Hola Chimuelo",
      supabase: mockSupabase as any,
      proveedor: proveedorDirecto,
    });

    expect(llamadasGenerar).toBe(1);
    expect(resultado.mensaje_asistente.contenido).toBe("Hola, ¿en qué te puedo ayudar?");
  });
});
