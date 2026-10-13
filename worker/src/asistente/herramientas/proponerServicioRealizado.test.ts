import { describe, expect, it, vi } from "vitest";
import type { ContextoHerramienta } from "../tipos";
import { herramientaProponerServicioRealizado } from "./proponerServicioRealizado";

describe("proponer_servicio_realizado", () => {
  const ctxBase: ContextoHerramienta = {
    supabase: {} as any,
    usuarioId: "usr-123",
    rol: "oficina",
    hoy: "2026-10-15",
    conversacionId: "conv-456",
  };

  it("rechaza fecha futura con error claro", async () => {
    const res = await herramientaProponerServicioRealizado.ejecutar(ctxBase, {
      tipo: "traslado",
      cliente: "Deza",
      fecha: "mañana",
      origen: "Burzaco",
      destino: "Avellaneda",
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain("no puede tener fecha futura");
    expect(res.es_futura).toBe(true);
    expect(res.propuesta_id).toBeUndefined();
  });

  it("rechaza fecha con más de 90 días hacia atrás con error claro", async () => {
    // Si hoy es 2026-10-15, 90 días atrás es aprox 2026-07-17.
    // 2026-05-01 tiene más de 160 días.
    const res = await herramientaProponerServicioRealizado.ejecutar(ctxBase, {
      tipo: "traslado",
      cliente: "Deza",
      fecha: "2026-05-01",
      origen: "Burzaco",
      destino: "Avellaneda",
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain("90 días hacia atrás");
    expect(res.demasiado_antigua).toBe(true);
    expect(res.propuesta_id).toBeUndefined();
  });

  it("devuelve faltantes por tipo si faltan datos requeridos", async () => {
    // Traslado sin origen ni destino
    const resTraslado = await herramientaProponerServicioRealizado.ejecutar(
      ctxBase,
      {
        tipo: "traslado",
        cliente: "Deza",
        fecha: "ayer",
      },
    );
    expect(resTraslado.faltan).toBeDefined();
    expect(resTraslado.faltan).toContain("origen");
    expect(resTraslado.faltan).toContain("destino");

    // Alquiler por hora sin máquina ni dirección
    const resAlquiler = await herramientaProponerServicioRealizado.ejecutar(
      ctxBase,
      {
        tipo: "alquiler_hora",
        cliente: "Almatec",
        fecha: "ayer",
      },
    );
    expect(resAlquiler.faltan).toBeDefined();
    expect(resAlquiler.faltan).toContain("maquina");
    expect(resAlquiler.faltan).toContain("direccion");
  });

  it("con datos completos crea la propuesta con accion 'crear_servicio_realizado'", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        id: "prop-realizada-123",
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
          data: [{ id: "chof-mauro", nombre: "Mauro" }],
          error: null,
        }),
      }),
    });

    const mockSupabase = {
      from: vi.fn((tabla: string) => {
        if (tabla === "clientes") return { select: mockSelectClientes };
        if (tabla === "vehiculos") return { select: mockSelectVehiculos };
        if (tabla === "parametros_cotizador")
          return { select: mockSelectParamsCot };
        if (tabla === "perfiles") return { select: mockSelectChoferes };
        return { select: vi.fn() };
      }),
      rpc: mockRpc,
    };

    const ctxMock: ContextoHerramienta = {
      ...ctxBase,
      supabase: mockSupabase as any,
    };

    const res = await herramientaProponerServicioRealizado.ejecutar(ctxMock, {
      tipo: "traslado",
      cliente: "Deza",
      fecha: "ayer",
      hora: "10:00",
      origen: "Burzaco",
      destino: "Avellaneda",
      km: 30,
      vehiculo: "Ford Cargo",
      chofer: "Mauro",
      ida_y_vuelta: false,
    });

    expect(res.ok).toBe(true);
    expect(res.propuesta_id).toBe("prop-realizada-123");
    expect(res.resumen).toContain("Servicio ya realizado");
    expect(res.resumen).toContain("Deza S.A.");
    expect(res.resumen).toContain("Burzaco → Avellaneda");
    expect(res.resumen).toContain("Chofer: Mauro");

    expect(mockRpc).toHaveBeenCalledWith(
      "crear_propuesta",
      expect.objectContaining({
        p_conversacion_id: "conv-456",
        p_accion: "crear_servicio_realizado",
        p_datos: expect.objectContaining({
          cliente_id: "cli-111",
          tipo: "traslado",
          fecha_programada: "2026-10-14",
          es_realizado: true,
          estado_final: "terminado",
          choferes: ["chof-mauro"],
        }),
      }),
    );
  });
});
