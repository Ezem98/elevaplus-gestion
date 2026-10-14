import { describe, expect, it, vi } from "vitest";
import type { ContextoHerramienta } from "../tipos";
import { herramientaProponerPresupuesto } from "./proponerPresupuesto";

// Mock del cotizador para garantizar que proponer_presupuesto NUNCA lo llame
vi.mock("../../lib/cotizador", () => ({
  cotizar: vi.fn(() => {
    throw new Error("¡El cotizador NO debe ser llamado en presupuestos!");
  }),
}));

describe("proponer_presupuesto", () => {
  const mockSupabaseDefault = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }),
    rpc: vi.fn(),
  };

  const ctxBase: ContextoHerramienta = {
    supabase: mockSupabaseDefault as any,
    usuarioId: "usr-123",
    rol: "oficina",
    hoy: "2026-10-15",
    conversacionId: "conv-456",
  };

  it("ítem sin precio → devuelve faltan con la indicación del ítem", async () => {
    const res = await herramientaProponerPresupuesto.ejecutar(ctxBase, {
      cliente: "Deza",
      items: [
        {
          tipo: "traslado",
          descripcion: "Traslado a Campana",
          origen: "Burzaco",
          destino: "Campana",
          // sin precio ni monto
        },
      ],
    });

    expect(res.faltan).toBeDefined();
    expect(res.faltan.length).toBeGreaterThan(0);
    expect(res.faltan[0]).toContain("Traslado a Campana");
    expect(res.error).toBeDefined();
    expect(res.propuesta_id).toBeFalsy();
  });

  it("cliente ambiguo → devuelve faltan cliente con opciones", async () => {
    const mockSelectClientes = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [
              { id: "cli-1", nombre: "Deza Construcciones" },
              { id: "cli-2", nombre: "Deza Logística" },
            ],
            error: null,
          }),
        }),
      }),
    });

    const ctxMock: ContextoHerramienta = {
      ...ctxBase,
      supabase: {
        from: vi.fn((tabla: string) => {
          if (tabla === "clientes") return { select: mockSelectClientes };
          return { select: vi.fn() };
        }),
      } as any,
    };

    const res = await herramientaProponerPresupuesto.ejecutar(ctxMock, {
      cliente: "Deza",
      items: [
        {
          tipo: "traslado",
          descripcion: "Viaje Burzaco",
          precio: 200000,
        },
      ],
    });

    expect(res.faltan).toBeDefined();
    expect(res.faltan).toContain("cliente");
    expect(res.ambiguo).toBe(true);
    expect(res.opciones).toEqual([
      "Deza Construcciones",
      "Deza Logística",
    ]);
  });

  it("prospecto → si no existe en clientes, lo toma como prospecto con prospecto_nombre", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        id: "prop-pres-123",
        conversacion_id: "conv-456",
        estado: "pendiente",
      },
      error: null,
    });

    const mockSelectClientes = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [], // No existe en clientes
            error: null,
          }),
        }),
      }),
    });

    const ctxMock: ContextoHerramienta = {
      ...ctxBase,
      supabase: {
        from: vi.fn((tabla: string) => {
          if (tabla === "clientes") return { select: mockSelectClientes };
          if (tabla === "maquinas") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
        rpc: mockRpc,
      } as any,
    };

    const res = await herramientaProponerPresupuesto.ejecutar(ctxMock, {
      cliente: "Techint S.A.",
      items: [
        {
          tipo: "traslado",
          descripcion: "Traslado AE-01",
          precio: 350000,
        },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.propuesta_id).toBe("prop-pres-123");
    expect(mockRpc).toHaveBeenCalledWith(
      "crear_propuesta",
      expect.objectContaining({
        p_conversacion_id: "conv-456",
        p_accion: "crear_presupuesto",
        p_datos: expect.objectContaining({
          presupuesto: expect.objectContaining({
            cliente_id: null,
            prospecto_nombre: "Techint S.A.",
          }),
          es_prospecto: true,
        }),
      }),
    );
  });

  it("total = suma de ítems → calcula totales sumando los precios dados", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { id: "prop-sum-1", estado: "pendiente" },
      error: null,
    });

    const mockSelectClientes = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [{ id: "cli-99", nombre: "Deza" }],
            error: null,
          }),
        }),
      }),
    });

    const ctxMock: ContextoHerramienta = {
      ...ctxBase,
      supabase: {
        from: vi.fn((tabla: string) => {
          if (tabla === "clientes") return { select: mockSelectClientes };
          if (tabla === "maquinas") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          return { select: vi.fn() };
        }),
        rpc: mockRpc,
      } as any,
    };

    const res = await herramientaProponerPresupuesto.ejecutar(ctxMock, {
      cliente: "Deza",
      items: [
        {
          tipo: "traslado",
          descripcion: "Traslado Burzaco a Campana",
          precio: 350000,
        },
        {
          tipo: "alquiler_periodo",
          descripcion: "3 días de alquiler",
          cantidad: 3,
          unidad: "dia",
          precio_unitario: 180000,
          precio: 540000,
        },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.totales.ARS).toBe(890000);
    expect(res.resumen).toContain("890.000");
  });

  it("no usa el cotizador → la herramienta no ejecuta cotizar() ni inventa precios", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { id: "prop-cot-1", estado: "pendiente" },
      error: null,
    });

    const mockSelectClientes = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [{ id: "cli-99", nombre: "Deza" }],
            error: null,
          }),
        }),
      }),
    });

    const ctxMock: ContextoHerramienta = {
      ...ctxBase,
      supabase: {
        from: vi.fn((tabla: string) => {
          if (tabla === "clientes") return { select: mockSelectClientes };
          if (tabla === "maquinas") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          if (tabla === "parametros_cotizador") {
            throw new Error("No debe consultarse parametros_cotizador");
          }
          return { select: vi.fn() };
        }),
        rpc: mockRpc,
      } as any,
    };

    // Al tener precio explícito, no consulta parametros_cotizador ni cotizar()
    const res = await herramientaProponerPresupuesto.ejecutar(ctxMock, {
      cliente: "Deza",
      items: [
        {
          tipo: "traslado",
          descripcion: "Traslado de 30 km",
          km: 30,
          precio: 250000,
        },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.totales.ARS).toBe(250000);
  });

  it("ítem en USD sin cotización → guarda dólares y no inventa el monto en pesos", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { id: "prop-usd-1", estado: "pendiente" },
      error: null,
    });

    const mockSelectClientes = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [{ id: "cli-99", nombre: "Deza" }],
            error: null,
          }),
        }),
      }),
    });

    const ctxMock: ContextoHerramienta = {
      ...ctxBase,
      supabase: {
        from: vi.fn((tabla: string) => {
          if (tabla === "clientes") return { select: mockSelectClientes };
          if (tabla === "maquinas") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          if (tabla === "servicios") {
            throw new Error("No debe buscar una cotización anterior");
          }
          return { select: vi.fn() };
        }),
        rpc: mockRpc,
      } as any,
    };

    const res = await herramientaProponerPresupuesto.ejecutar(ctxMock, {
      cliente: "Deza",
      items: [
        {
          tipo: "alquiler_periodo",
          descripcion: "Alquiler de tijera un mes",
          moneda: "USD",
          precio: 1200,
        },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.totales.USD).toBe(1200);
    const item = mockRpc.mock.calls[0][1].p_datos.items[0];
    expect(item.monto_moneda).toBe(1200);
    expect(item.monto).toBeNull();
    expect(item.cotizacion).toBeNull();
  });
});
