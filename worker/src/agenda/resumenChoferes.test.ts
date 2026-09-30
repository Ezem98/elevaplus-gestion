import { beforeEach, describe, expect, it, vi } from "vitest";
import * as heartbeatModule from "../notificaciones/heartbeat";
import * as pushModule from "../notificaciones/push";
import { supabaseAdmin } from "../supabase";
import * as idempotenciaModule from "./idempotencia";
import { resumenChoferesHoy } from "./resumenChoferes";

describe("resumenChoferesHoy - Tarea diaria de choferes a las 7:00", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("omite la ejecución si la tarea ya fue ejecutada y no se fuerza", async () => {
    vi.spyOn(idempotenciaModule, "registrarEjecucion").mockResolvedValue({
      ejecutado: false,
      motivo: "ya_ejecutado",
    });
    const latirSpy = vi
      .spyOn(heartbeatModule, "latir")
      .mockResolvedValue(undefined);

    const res = await resumenChoferesHoy({ forzar: false });

    expect(res.ok).toBe(true);
    expect(res.omitido).toBe(true);
    expect(res.choferesNotificados).toBe(0);
    expect(latirSpy).toHaveBeenCalledWith("choferes");
  });

  it("envía push únicamente a los choferes que tienen viajes hoy", async () => {
    vi.spyOn(idempotenciaModule, "registrarEjecucion").mockResolvedValue({
      ejecutado: true,
      id: 1,
    });
    vi.spyOn(idempotenciaModule, "finalizarEjecucion").mockResolvedValue(
      undefined,
    );
    const latirSpy = vi
      .spyOn(heartbeatModule, "latir")
      .mockResolvedValue(undefined);
    const enviarPushSpy = vi
      .spyOn(pushModule, "enviarPushDirecto")
      .mockResolvedValue({ ok: true });

    // Mock choferes activos: Chofer 1 (con 2 viajes), Chofer 2 (con 1 viaje), Chofer 3 (sin viajes)
    const choferesMock = [
      { id: "chofer-uuid-1", nombre: "Carlos Gómez" },
      { id: "chofer-uuid-2", nombre: "Roberto Paz" },
      { id: "chofer-uuid-3", nombre: "Martín Díaz" },
    ];

    // Mock servicios programados para hoy
    const serviciosMock = [
      {
        id: "serv-1",
        numero: 101,
        fecha_programada: "2026-09-29",
        hora_programada: "08:00:00",
        estado: "programado",
        cliente: { nombre: "Huma S.A." },
        servicio_choferes: [{ chofer_id: "chofer-uuid-1" }],
      },
      {
        id: "serv-2",
        numero: 102,
        fecha_programada: "2026-09-29",
        hora_programada: "14:00:00",
        estado: "programado",
        cliente: { nombre: "Deza SRL" },
        servicio_choferes: [{ chofer_id: "chofer-uuid-1" }],
      },
      {
        id: "serv-3",
        numero: 103,
        fecha_programada: "2026-09-29",
        hora_programada: "09:30:00",
        estado: "programado",
        cliente: { nombre: "Acme" },
        servicio_choferes: [{ chofer_id: "chofer-uuid-2" }],
      },
    ];

    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      if (tabla === "perfiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: choferesMock,
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (tabla === "servicios") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: serviciosMock,
                  error: null,
                }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await resumenChoferesHoy({ forzar: true });

    expect(res.ok).toBe(true);
    expect(res.choferesNotificados).toBe(2);

    // Chofer 1 debe recibir push con 2 viajes
    expect(enviarPushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: "Hoy tenés 2 viajes",
        cuerpo: "08:00 Huma · 14:00 Deza",
        destinatarios: { usuarios: ["chofer-uuid-1"] },
        url: "/chofer",
      }),
    );

    // Chofer 2 debe recibir push con 1 viaje
    expect(enviarPushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: "Hoy tenés 1 viaje",
        cuerpo: "09:30 Acme",
        destinatarios: { usuarios: ["chofer-uuid-2"] },
        url: "/chofer",
      }),
    );

    // Chofer 3 no tiene viajes: no debe haber llamada para él
    expect(enviarPushSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        destinatarios: { usuarios: ["chofer-uuid-3"] },
      }),
    );

    expect(latirSpy).toHaveBeenCalledWith("choferes");
  });

  it("no envía notificaciones si ningún chofer tiene viajes hoy", async () => {
    vi.spyOn(idempotenciaModule, "registrarEjecucion").mockResolvedValue({
      ejecutado: true,
      id: 2,
    });
    vi.spyOn(idempotenciaModule, "finalizarEjecucion").mockResolvedValue(
      undefined,
    );
    const latirSpy = vi
      .spyOn(heartbeatModule, "latir")
      .mockResolvedValue(undefined);
    const enviarPushSpy = vi
      .spyOn(pushModule, "enviarPushDirecto")
      .mockResolvedValue({ ok: true });

    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      if (tabla === "perfiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: "c-1", nombre: "Chofer 1" }],
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (tabla === "servicios") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await resumenChoferesHoy({ forzar: true });

    expect(res.ok).toBe(true);
    expect(res.choferesNotificados).toBe(0);
    expect(enviarPushSpy).not.toHaveBeenCalled();
    expect(latirSpy).toHaveBeenCalledWith("choferes");
  });

  it("captura errores y no llama a latir si falla la consulta de choferes", async () => {
    vi.spyOn(idempotenciaModule, "registrarEjecucion").mockResolvedValue({
      ejecutado: true,
      id: 3,
    });
    const latirSpy = vi
      .spyOn(heartbeatModule, "latir")
      .mockResolvedValue(undefined);

    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      if (tabla === "perfiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "Error de conexión a perfiles" },
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await resumenChoferesHoy({ forzar: true });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("Error de conexión a perfiles");
    expect(latirSpy).not.toHaveBeenCalled();
  });
});
