import { describe, expect, it, vi } from "vitest";
import type { ContextoHerramienta } from "../tipos";
import {
  esTransicionValida,
  herramientaProponerCambioEstado,
  normalizarEstadoDestino,
} from "./proponerCambioEstado";

describe("proponer_cambio_estado", () => {
  const ctxBase: ContextoHerramienta = {
    supabase: {} as any,
    usuarioId: "usr-123",
    rol: "oficina",
    hoy: "2026-10-11",
    conversacionId: "conv-456",
  };

  it("normaliza estados en lenguaje natural", () => {
    expect(normalizarEstadoDestino("terminó")).toBe("terminado");
    expect(normalizarEstadoDestino("ya terminó")).toBe(null);
    expect(normalizarEstadoDestino("terminado")).toBe("terminado");
    expect(normalizarEstadoDestino("cancelado")).toBe("cancelado");
    expect(normalizarEstadoDestino("cancelá")).toBe("cancelado");
    expect(normalizarEstadoDestino("en curso")).toBe("en_curso");
    expect(normalizarEstadoDestino("programado")).toBe("programado");
    expect(normalizarEstadoDestino("cualquier cosa")).toBe(null);
  });

  it("valida transiciones según rol y matriz", () => {
    // Oficina
    expect(esTransicionValida("programado", "en_curso", "oficina")).toBe(true);
    expect(esTransicionValida("programado", "terminado", "oficina")).toBe(true);
    expect(esTransicionValida("en_curso", "terminado", "oficina")).toBe(true);
    expect(esTransicionValida("programado", "cancelado", "oficina")).toBe(true);
    expect(esTransicionValida("terminado", "en_curso", "oficina")).toBe(false);
    expect(esTransicionValida("terminado", "programado", "oficina")).toBe(false);
    expect(esTransicionValida("terminado", "terminado", "oficina")).toBe(false);

    // Admin puede forzar transiciones salvo mismo estado
    expect(esTransicionValida("terminado", "en_curso", "admin")).toBe(true);
    expect(esTransicionValida("terminado", "terminado", "admin")).toBe(false);
  });

  it("devuelve no_encontrado si no hay servicios que coincidan", async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    });

    const ctx: ContextoHerramienta = {
      ...ctxBase,
      supabase: { from: mockFrom } as any,
    };

    const res = await herramientaProponerCambioEstado.ejecutar(ctx, {
      numero: 9999,
      nuevo_estado: "terminado",
    });

    expect(res.no_encontrado).toBe(true);
    expect(res.propuesta_id).toBeUndefined();
  });

  it("devuelve ambiguos si hay más de un candidato", async () => {
    const serviciosMultiples = [
      {
        id: "serv-1",
        numero: 101,
        estado: "programado",
        fecha_programada: "2026-10-11",
        hora_programada: "09:00",
        clientes: { nombre: "Deza" },
      },
      {
        id: "serv-2",
        numero: 102,
        estado: "programado",
        fecha_programada: "2026-10-11",
        hora_programada: "14:00",
        clientes: { nombre: "Deza" },
      },
    ];

    const mockOrder = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({
        data: serviciosMultiples,
        error: null,
      }),
    });

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: mockOrder,
        }),
        order: mockOrder,
      }),
    });

    const ctx: ContextoHerramienta = {
      ...ctxBase,
      supabase: { from: mockFrom } as any,
    };

    const res = await herramientaProponerCambioEstado.ejecutar(ctx, {
      cliente: "Deza",
      fecha: "hoy",
      nuevo_estado: "terminado",
    });

    expect(res.ambiguos).toBeDefined();
    expect(res.ambiguos.length).toBe(2);
    expect(res.ambiguos[0].numero).toBe(101);
    expect(res.ambiguos[1].numero).toBe(102);
    expect(res.propuesta_id).toBeUndefined();
  });

  it("transición inválida no crea propuesta y devuelve error descriptivo", async () => {
    const servicioTerminado = {
      id: "serv-term",
      numero: 1087,
      estado: "terminado",
      fecha_programada: "2026-10-11",
      clientes: { nombre: "Deza" },
    };

    const mockRpc = vi.fn();
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [servicioTerminado],
          error: null,
        }),
      }),
    });

    const ctx: ContextoHerramienta = {
      ...ctxBase,
      rol: "oficina",
      supabase: { from: mockFrom, rpc: mockRpc } as any,
    };

    const res = await herramientaProponerCambioEstado.ejecutar(ctx, {
      numero: 1087,
      nuevo_estado: "en curso", // Terminado -> En curso no permitido para oficina
    });

    expect(res.transicion_invalida).toBe(true);
    expect(res.error).toContain("Transición no permitida");
    expect(mockRpc).not.toHaveBeenCalled();
    expect(res.propuesta_id).toBeUndefined();
  });

  it("transición válida crea propuesta con los datos y resumen correctos", async () => {
    const servicioProgramado = {
      id: "serv-ok",
      numero: 1087,
      estado: "programado",
      fecha_programada: "2026-10-11",
      clientes: { nombre: "Deza" },
    };

    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        id: "prop-777",
        conversacion_id: "conv-456",
        accion: "cambiar_estado",
        estado: "pendiente",
      },
      error: null,
    });

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [servicioProgramado],
          error: null,
        }),
      }),
    });

    const ctx: ContextoHerramienta = {
      ...ctxBase,
      supabase: { from: mockFrom, rpc: mockRpc } as any,
    };

    const res = await herramientaProponerCambioEstado.ejecutar(ctx, {
      numero: 1087,
      nuevo_estado: "terminó",
      nota: "Dejó remito firmado",
    });

    expect(res.ok).toBe(true);
    expect(res.propuesta_id).toBe("prop-777");
    expect(res.resumen).toBe(
      "Servicio #1087 · Deza · 11/10: Programado → Terminado",
    );
    expect(res.datos).toEqual({
      servicio_id: "serv-ok",
      numero: 1087,
      cliente: "Deza",
      fecha: "2026-10-11",
      estado_actual: "programado",
      nuevo_estado: "terminado",
      nota: "Dejó remito firmado",
    });

    expect(mockRpc).toHaveBeenCalledWith("crear_propuesta", {
      p_conversacion_id: "conv-456",
      p_accion: "cambiar_estado",
      p_datos: {
        servicio_id: "serv-ok",
        numero: 1087,
        cliente: "Deza",
        fecha: "2026-10-11",
        estado_actual: "programado",
        nuevo_estado: "terminado",
        nota: "Dejó remito firmado",
      },
      p_resumen: "Servicio #1087 · Deza · 11/10: Programado → Terminado",
    });
  });
});
