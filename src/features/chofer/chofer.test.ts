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
});
