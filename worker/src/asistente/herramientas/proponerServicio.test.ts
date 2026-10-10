import { describe, expect, it, vi } from "vitest";
import type { ContextoHerramienta } from "../tipos";
import { herramientaProponerServicio } from "./proponerServicio";

describe("proponer_servicio", () => {
  const ctxBase: ContextoHerramienta = {
    supabase: {} as any,
    usuarioId: "usr-123",
    rol: "oficina",
    hoy: "2026-10-15",
    conversacionId: "conv-456",
  };

  it("devuelve faltantes para tipo 'traslado' si faltan fecha, origen o destino", async () => {
    const res = await herramientaProponerServicio.ejecutar(ctxBase, {
      tipo: "traslado",
      cliente: "Deza",
      // faltan fecha, origen, destino
    });

    expect(res.faltan).toBeDefined();
    expect(res.faltan).toContain("fecha");
    expect(res.faltan).toContain("origen");
    expect(res.faltan).toContain("destino");
    expect(res.error).toBeDefined();
    expect(res.propuesta_id).toBeUndefined();
  });

  it("devuelve faltantes para 'alquiler_hora' si faltan maquina o direccion", async () => {
    const res = await herramientaProponerServicio.ejecutar(ctxBase, {
      tipo: "alquiler_hora",
      cliente: "Almatec",
      fecha: "hoy",
      // faltan maquina, direccion
    });

    expect(res.faltan).toBeDefined();
    expect(res.faltan).toContain("maquina");
    expect(res.faltan).toContain("direccion");
    expect(res.propuesta_id).toBeUndefined();
  });

  it("devuelve faltantes para 'alquiler_periodo' si faltan maquina, fechas o precio en USD", async () => {
    const res = await herramientaProponerServicio.ejecutar(ctxBase, {
      tipo: "alquiler_periodo",
      cliente: "Almatec",
      // faltan maquina, fecha_desde, fecha_hasta, direccion, precio_usd
    });

    expect(res.faltan).toBeDefined();
    expect(res.faltan).toContain("maquina");
    expect(res.faltan).toContain("fecha_desde");
    expect(res.faltan).toContain("fecha_hasta");
    expect(res.faltan).toContain("direccion");
    expect(res.faltan).toContain("precio_usd");
    expect(res.propuesta_id).toBeUndefined();
  });

  it("devuelve faltantes para 'mantenimiento' si falta descripcion", async () => {
    const res = await herramientaProponerServicio.ejecutar(ctxBase, {
      tipo: "mantenimiento",
      cliente: "Huma",
      fecha: "mañana",
      // falta descripcion
    });

    expect(res.faltan).toBeDefined();
    expect(res.faltan).toContain("descripcion");
    expect(res.propuesta_id).toBeUndefined();
  });

  it("devuelve faltantes para 'otro' si falta cliente o descripcion", async () => {
    const res = await herramientaProponerServicio.ejecutar(ctxBase, {
      tipo: "otro",
      // falta cliente, fecha, descripcion
    });

    expect(res.faltan).toBeDefined();
    expect(res.faltan).toContain("cliente");
    expect(res.faltan).toContain("fecha");
    expect(res.faltan).toContain("descripcion");
    expect(res.propuesta_id).toBeUndefined();
  });

  it("con datos completos crea la propuesta llamando a la RPC crear_propuesta", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        id: "prop-999",
        conversacion_id: "conv-456",
        estado: "pendiente",
      },
      error: null,
    });

    const mockSelectClientes = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [{ id: "cli-111", nombre: "Deza S.A." }],
            error: null,
          }),
        }),
      }),
    });

    const mockSelectVehiculos = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          {
            id: "veh-1",
            nombre: "Ford Cargo",
            coef_precio: 1.2,
            coef_carga_menor_50: 1,
            coef_carga_mayor_50: 1.1,
          },
        ],
        error: null,
      }),
    });

    const mockSelectParamsCot = vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              precio_km: 1500,
              monto_minimo: 50000,
              km_minimo: 10,
              recargo_nocturno_pct: 30,
            },
            error: null,
          }),
        }),
      }),
    });

    const mockSelectChoferes = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: "chof-1", nombre: "Mauro" }],
          error: null,
        }),
      }),
    });

    const mockSupabase = {
      from: vi.fn((tabla: string) => {
        if (tabla === "clientes") {
          return { select: mockSelectClientes };
        }
        if (tabla === "vehiculos") {
          return { select: mockSelectVehiculos };
        }
        if (tabla === "parametros_cotizador") {
          return { select: mockSelectParamsCot };
        }
        if (tabla === "perfiles") {
          return { select: mockSelectChoferes };
        }
        return { select: vi.fn() };
      }),
      rpc: mockRpc,
    };

    const ctxMock: ContextoHerramienta = {
      ...ctxBase,
      supabase: mockSupabase as any,
    };

    const res = await herramientaProponerServicio.ejecutar(ctxMock, {
      tipo: "traslado",
      cliente: "Deza",
      fecha: "mañana",
      hora: "09:00",
      origen: "Burzaco",
      destino: "Avellaneda",
      km: 30,
      vehiculo: "Ford Cargo",
      chofer: "Mauro",
      ida_y_vuelta: false,
    });

    expect(res.ok).toBe(true);
    expect(res.propuesta_id).toBe("prop-999");
    expect(mockRpc).toHaveBeenCalledWith(
      "crear_propuesta",
      expect.objectContaining({
        p_conversacion_id: "conv-456",
        p_accion: "crear_servicio",
        p_datos: expect.objectContaining({
          cliente_id: "cli-111",
          tipo: "traslado",
          origen: "Burzaco",
          destino: "Avellaneda",
          choferes: ["chof-1"],
        }),
      }),
    );
  });
});
