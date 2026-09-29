import { describe, expect, it } from "vitest";

describe("Lógica del módulo Chofer", () => {
  it("determina correctamente el fallback de mime type para audio en iPhone / Safari", () => {
    function elegirMimeType(
      isTypeSupported: (type: string) => boolean,
    ): { mime: string; ext: string } | null {
      if (isTypeSupported("audio/webm")) {
        return { mime: "audio/webm", ext: "webm" };
      }
      if (isTypeSupported("audio/mp4")) {
        return { mime: "audio/mp4", ext: "mp4" };
      }
      return null;
    }

    // Chrome / Android / Firefox
    expect(elegirMimeType((t) => t === "audio/webm")).toEqual({
      mime: "audio/webm",
      ext: "webm",
    });
    // Safari / iOS
    expect(elegirMimeType((t) => t === "audio/mp4")).toEqual({
      mime: "audio/mp4",
      ext: "mp4",
    });
    // Sin soporte
    expect(elegirMimeType(() => false)).toBeNull();
  });

  it("calcula correctamente el corte de fecha para los últimos 7 días", () => {
    function calcularHace7Dias(fechaRef: Date): string {
      const d = new Date(fechaRef);
      d.setDate(d.getDate() - 7);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dia = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dia}`;
    }

    const ref = new Date("2026-09-17T12:00:00Z");
    expect(calcularHace7Dias(ref)).toBe("2026-09-10");
  });

  it("filtra y agrupa servicios de días anteriores sin cerrar", () => {
    const serviciosPrueba = [
      { id: "1", fecha_programada: "2026-09-16", estado: "programado" },
      { id: "2", fecha_programada: "2026-09-16", estado: "en_curso" },
      { id: "3", fecha_programada: "2026-09-16", estado: "terminado" },
      { id: "4", fecha_programada: "2026-09-17", estado: "programado" },
    ];
    const hoyStr = "2026-09-17";

    const sinCerrar = serviciosPrueba.filter(
      (s) =>
        s.fecha_programada &&
        s.fecha_programada < hoyStr &&
        (s.estado === "programado" || s.estado === "en_curso"),
    );

    expect(sinCerrar.map((s) => s.id)).toEqual(["1", "2"]);
  });

  it("mapea correctamente las asignaciones de choferes para inserción en servicio_choferes", () => {
    const servicioId = "serv-123";
    const choferesSeleccionados = ["chof-1", "chof-2"];

    const filasServicioChoferes = choferesSeleccionados.map((chofer_id) => ({
      servicio_id: servicioId,
      chofer_id,
    }));

    expect(filasServicioChoferes).toEqual([
      { servicio_id: "serv-123", chofer_id: "chof-1" },
      { servicio_id: "serv-123", chofer_id: "chof-2" },
    ]);
  });

  it("verifica visibilidad del servicio para el chofer asignado según la regla de servicio_choferes", () => {
    const asignaciones = [
      { servicio_id: "serv-1", chofer_id: "chof-martin" },
      { servicio_id: "serv-2", chofer_id: "chof-juan" },
    ];

    const esVisibleParaChofer = (servicioId: string, choferId: string) =>
      asignaciones.some(
        (a) => a.servicio_id === servicioId && a.chofer_id === choferId,
      );

    expect(esVisibleParaChofer("serv-1", "chof-martin")).toBe(true);
    expect(esVisibleParaChofer("serv-1", "chof-juan")).toBe(false);
    expect(esVisibleParaChofer("serv-3", "chof-martin")).toBe(false);
  });

  it("pestaña Hoy filtra estrictamente hoy y excluye servicios de días futuros", () => {
    const hoyStr = "2026-09-28";
    const serviciosPrueba = [
      { id: "1", fecha_programada: "2026-09-27", estado: "programado" },
      { id: "2", fecha_programada: "2026-09-28", estado: "programado" },
      { id: "3", fecha_programada: "2026-09-29", estado: "programado" },
      { id: "4", fecha_programada: null, estado: "programado" },
    ];

    const serviciosHoy = serviciosPrueba.filter(
      (s) => !s.fecha_programada || s.fecha_programada === hoyStr,
    );

    expect(serviciosHoy.map((s) => s.id)).toEqual(["2", "4"]);
  });

  it("pestaña Mi semana filtra servicios programados en los próximos 7 días y los agrupa", () => {
    function sumarDias(fechaIso: string, dias: number): string {
      const d = new Date(`${fechaIso}T00:00:00`);
      d.setDate(d.getDate() + dias);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dia = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dia}`;
    }

    const hoyStr = "2026-09-28";
    const limiteSemanaStr = sumarDias(hoyStr, 7); // 2026-10-05

    const serviciosPrueba = [
      { id: "1", fecha_programada: "2026-09-28", estado: "programado" },
      { id: "2", fecha_programada: "2026-09-29", estado: "programado" },
      { id: "3", fecha_programada: "2026-09-29", estado: "en_curso" }, // no programado
      { id: "4", fecha_programada: "2026-10-05", estado: "programado" }, // día 7 (dentro)
      { id: "5", fecha_programada: "2026-10-06", estado: "programado" }, // día 8 (fuera)
      { id: "6", fecha_programada: "2026-09-27", estado: "programado" }, // pasado (fuera)
    ];

    const serviciosSemana = serviciosPrueba.filter(
      (s) =>
        s.estado === "programado" &&
        s.fecha_programada &&
        s.fecha_programada >= hoyStr &&
        s.fecha_programada <= limiteSemanaStr,
    );

    expect(serviciosSemana.map((s) => s.id)).toEqual(["1", "2", "4"]);

    const agrupados: Record<string, typeof serviciosPrueba> = {};
    for (const s of serviciosSemana) {
      const f = s.fecha_programada!;
      if (!agrupados[f]) agrupados[f] = [];
      agrupados[f].push(s);
    }

    expect(Object.keys(agrupados).sort()).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-10-05",
    ]);
    expect(agrupados["2026-09-29"].map((s) => s.id)).toEqual(["2"]);
  });

  it("deriva el estado inicial del formulario según fecha y choferes asignados", () => {
    function derivarEstadoInicial(hayFecha: boolean, choferes: string[]) {
      if (!hayFecha) return "consulta";
      return choferes.length > 0 ? "programado" : "aceptado";
    }

    // Sin fecha: queda en consulta
    expect(derivarEstadoInicial(false, [])).toBe("consulta");
    expect(derivarEstadoInicial(false, ["chof-1"])).toBe("consulta");

    // Con fecha pero sin chofer: aceptado
    expect(derivarEstadoInicial(true, [])).toBe("aceptado");

    // Con fecha y al menos un chofer: programado
    expect(derivarEstadoInicial(true, ["chof-1"])).toBe("programado");
    expect(derivarEstadoInicial(true, ["chof-1", "chof-2"])).toBe("programado");
  });
});
