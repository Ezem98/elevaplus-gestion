import { describe, expect, it } from "vitest";
import { resolverFechaLogica } from "./resolverFecha";

describe("resolver_fecha", () => {
  // Tomamos como fecha de referencia fija en Argentina: Jueves 15 de Octubre de 2026
  const HOY_JUEVES = "2026-10-15"; // Jueves

  it("resuelve 'hoy' correctamente", () => {
    const res = resolverFechaLogica("hoy", HOY_JUEVES);
    expect(res.ambiguo).toBe(false);
    expect(res.fecha).toBe("2026-10-15");
    expect(res.dia_semana).toBe("jueves");
    expect(res.formato_humano).toContain("15/10");
  });

  it("resuelve 'mañana' correctamente", () => {
    const res = resolverFechaLogica("mañana", HOY_JUEVES);
    expect(res.ambiguo).toBe(false);
    expect(res.fecha).toBe("2026-10-16");
    expect(res.dia_semana).toBe("viernes");
    expect(res.formato_humano).toContain("16/10");
  });

  it("resuelve 'pasado' o 'pasado mañana' correctamente", () => {
    const res = resolverFechaLogica("pasado mañana", HOY_JUEVES);
    expect(res.ambiguo).toBe(false);
    expect(res.fecha).toBe("2026-10-17");
    expect(res.dia_semana).toBe("sábado");
  });

  it("resuelve días de la semana a futuro (ej: el viernes, el lunes)", () => {
    // Si hoy es jueves 15, el viernes es mañana 16
    const resViernes = resolverFechaLogica("el viernes", HOY_JUEVES);
    expect(resViernes.ambiguo).toBe(false);
    expect(resViernes.fecha).toBe("2026-10-16");
    expect(resViernes.dia_semana).toBe("viernes");

    // El lunes siguiente es 19 de octubre
    const resLunes = resolverFechaLogica("el lunes", HOY_JUEVES);
    expect(resLunes.ambiguo).toBe(false);
    expect(resLunes.fecha).toBe("2026-10-19");
    expect(resLunes.dia_semana).toBe("lunes");
  });

  it("detecta ambigüedad si se pide el mismo día de la semana sin calificador (ej: 'el jueves' un jueves)", () => {
    // Hoy es jueves 15, usuario pide "el jueves"
    const res = resolverFechaLogica("el jueves", HOY_JUEVES);
    expect(res.ambiguo).toBe(true);
    expect(res.motivo).toContain("Hoy es jueves");
    expect(res.opciones).toBeDefined();
    expect(res.opciones).toContain("2026-10-15");
    expect(res.opciones).toContain("2026-10-22");
  });

  it("permite desambiguar con 'el próximo jueves' o 'este jueves'", () => {
    const resProx = resolverFechaLogica("el próximo jueves", HOY_JUEVES);
    expect(resProx.ambiguo).toBe(false);
    expect(resProx.fecha).toBe("2026-10-22");

    const resEste = resolverFechaLogica("este jueves", HOY_JUEVES);
    expect(resEste.ambiguo).toBe(false);
    expect(resEste.fecha).toBe("2026-10-15");
  });

  it("resuelve fechas sueltas dentro del mismo mes (ej: 'el 20')", () => {
    const res = resolverFechaLogica("el 20", HOY_JUEVES);
    expect(res.ambiguo).toBe(false);
    expect(res.fecha).toBe("2026-10-20");
    expect(res.dia_semana).toBe("martes");
  });

  it("detecta ambigüedad si la fecha suelta coincide con hoy ('el 15' el día 15)", () => {
    const res = resolverFechaLogica("el 15", HOY_JUEVES);
    expect(res.ambiguo).toBe(true);
    expect(res.motivo).toContain("Hoy es día 15");
  });

  it("maneja cruce de mes cuando el día solicitado ya pasó en el mes actual (ej: 'el 3' el 28 de octubre)", () => {
    const HOY_FIN_MES = "2026-10-28";
    const res = resolverFechaLogica("el 3", HOY_FIN_MES);
    expect(res.ambiguo).toBe(false);
    // Cruce de mes: pasa de octubre a noviembre
    expect(res.fecha).toBe("2026-11-03");
    expect(res.dia_semana).toBe("martes");
  });

  it("maneja cruce de año en diciembre (ej: 'el 5' el 28 de diciembre)", () => {
    const HOY_DICIEMBRE = "2026-12-28";
    const res = resolverFechaLogica("el 5", HOY_DICIEMBRE);
    expect(res.ambiguo).toBe(false);
    // Cruce de año: pasa a enero de 2027
    expect(res.fecha).toBe("2027-01-05");
    expect(res.dia_semana).toBe("martes");
  });

  it("resuelve fechas en formato DD/MM y DD/MM/YYYY", () => {
    const res = resolverFechaLogica("25/11", HOY_JUEVES);
    expect(res.ambiguo).toBe(false);
    expect(res.fecha).toBe("2026-11-25");
    expect(res.dia_semana).toBe("miércoles");

    const resAno = resolverFechaLogica("10/03/2027", HOY_JUEVES);
    expect(resAno.ambiguo).toBe(false);
    expect(resAno.fecha).toBe("2027-03-10");
  });

  it("indica ambigüedad ante entradas no reconocidas o días inválidos", () => {
    const resInvalido = resolverFechaLogica("el 32", HOY_JUEVES);
    expect(resInvalido.ambiguo).toBe(true);
    expect(resInvalido.motivo).toContain("no es válido");

    const resTextoRaro = resolverFechaLogica("algún día de estos", HOY_JUEVES);
    expect(resTextoRaro.ambiguo).toBe(true);
  });
});
