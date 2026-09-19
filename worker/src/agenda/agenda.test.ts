import { describe, expect, it } from "vitest";
import {
  construirCuerpoPush,
  evaluarDescubiertoCheque,
  obtenerNombreDiaSemana,
} from "./recordatorios";
import { obtenerSemanaLunesADomingo } from "./resumenSemanal";

describe("Agenda y Recordatorios - Funciones puras", () => {
  describe("construirCuerpoPush", () => {
    it("retorna string vacío si la lista no tiene elementos", () => {
      expect(construirCuerpoPush([])).toBe("");
    });

    it("formatea correctamente un solo ítem con monto", () => {
      const items = [{ titulo: "Sueldos", monto: 1200000 }];
      const cuerpo = construirCuerpoPush(items);
      expect(cuerpo).toContain("Sueldos");
      expect(cuerpo).toContain("1.200.000");
    });

    it("formatea un ítem sin monto", () => {
      const items = [{ titulo: "Vence alquiler galpón", monto: null }];
      const cuerpo = construirCuerpoPush(items);
      expect(cuerpo).toBe("Vence alquiler galpón");
    });

    it("concatena hasta 3 ítems con ' · ' sin agregar 'y N más'", () => {
      const items = [
        { titulo: "Sueldos", monto: 1200000 },
        { titulo: "Cubrir cheque Galicia", monto: 350000 },
        { titulo: "Cobrar cheque Huma", monto: 200000 },
      ];
      const cuerpo = construirCuerpoPush(items);
      const partes = cuerpo.split(" · ");
      expect(partes).toHaveLength(3);
      expect(cuerpo).not.toContain("más");
    });

    it("concatena los primeros 3 y agrega ' y N más' si son 7 ítems", () => {
      const items = [
        { titulo: "Sueldos", monto: 1200000 },
        { titulo: "Cubrir cheque Galicia", monto: 350000 },
        { titulo: "Cobrar cheque Huma", monto: 200000 },
        { titulo: "IVA", monto: 150000 },
        { titulo: "Seguro flota", monto: 80000 },
        { titulo: "Edesur", monto: 45000 },
        { titulo: "Plan SUSS", monto: 120000 },
      ];
      const cuerpo = construirCuerpoPush(items);
      expect(cuerpo).toContain("Sueldos");
      expect(cuerpo).toContain("Cubrir cheque Galicia");
      expect(cuerpo).toContain("Cobrar cheque Huma");
      expect(cuerpo).toContain("y 4 más");
    });
  });

  describe("evaluarDescubiertoCheque", () => {
    const serieProyeccion = [
      { fecha: "2026-09-20", saldo_proyectado: 150000 },
      { fecha: "2026-09-21", saldo_proyectado: 25000 },
      { fecha: "2026-09-22", saldo_proyectado: -45000 },
      { fecha: "2026-09-23", saldo_proyectado: -120000 },
    ];

    it("detecta descubierto cuando el saldo proyectado es negativo", () => {
      const res = evaluarDescubiertoCheque("2026-09-22", serieProyeccion);
      expect(res.tieneDescubierto).toBe(true);
      expect(res.saldoProyectado).toBe(-45000);
    });

    it("detecta saldo cubierto cuando el saldo proyectado es positivo o cero", () => {
      const res = evaluarDescubiertoCheque("2026-09-20", serieProyeccion);
      expect(res.tieneDescubierto).toBe(false);
      expect(res.saldoProyectado).toBe(150000);
    });

    it("si la fecha no existe en la serie, asume saldo 0 (sin descubierto)", () => {
      const res = evaluarDescubiertoCheque("2026-09-30", serieProyeccion);
      expect(res.tieneDescubierto).toBe(false);
      expect(res.saldoProyectado).toBe(0);
    });
  });

  describe("obtenerSemanaLunesADomingo", () => {
    it("calcula la semana completa cuando la fecha dada es lunes", () => {
      const res = obtenerSemanaLunesADomingo("2026-09-21"); // Lunes
      expect(res.lunes).toBe("2026-09-21");
      expect(res.domingo).toBe("2026-09-27");
    });

    it("calcula la semana completa cuando la fecha dada es jueves", () => {
      const res = obtenerSemanaLunesADomingo("2026-09-24"); // Jueves
      expect(res.lunes).toBe("2026-09-21");
      expect(res.domingo).toBe("2026-09-27");
    });

    it("calcula la semana completa cuando la fecha dada es domingo", () => {
      const res = obtenerSemanaLunesADomingo("2026-09-27"); // Domingo
      expect(res.lunes).toBe("2026-09-21");
      expect(res.domingo).toBe("2026-09-27");
    });
  });

  describe("obtenerNombreDiaSemana", () => {
    it("retorna el nombre del día en español correcto sin problemas de timezone", () => {
      expect(obtenerNombreDiaSemana("2026-09-21")).toBe("lunes");
      expect(obtenerNombreDiaSemana("2026-09-22")).toBe("martes");
      expect(obtenerNombreDiaSemana("2026-09-23")).toBe("miércoles");
      expect(obtenerNombreDiaSemana("2026-09-24")).toBe("jueves");
      expect(obtenerNombreDiaSemana("2026-09-25")).toBe("viernes");
      expect(obtenerNombreDiaSemana("2026-09-26")).toBe("sábado");
      expect(obtenerNombreDiaSemana("2026-09-27")).toBe("domingo");
    });
  });
});
