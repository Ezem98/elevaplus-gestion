import { describe, expect, it } from "vitest";
import {
  armarDetalleTrayecto,
  armarMensajeNuevoViaje,
  armarMensajeViajeModificado,
  armarResumenDiaChofer,
  armarTituloRecordatorioHoy,
  formatearDiaYFecha,
  formatearHora,
  simplificarNombreCliente,
} from "./mensajes";

describe("Armado de mensajes de chofer y oficina", () => {
  describe("simplificarNombreCliente", () => {
    it("elimina S.A., SRL, SAS o SH al final de la razón social", () => {
      expect(simplificarNombreCliente("Huma S.A.")).toBe("Huma");
      expect(simplificarNombreCliente("Huma SA")).toBe("Huma");
      expect(simplificarNombreCliente("Deza SRL")).toBe("Deza");
      expect(simplificarNombreCliente("Deza S.R.L.")).toBe("Deza");
      expect(simplificarNombreCliente("Logística Sur S.A.S.")).toBe(
        "Logística Sur",
      );
      expect(simplificarNombreCliente("Transportes Huma")).toBe(
        "Transportes Huma",
      );
      expect(simplificarNombreCliente("Deza")).toBe("Deza");
    });

    it("maneja nombres vacíos o con espacios", () => {
      expect(simplificarNombreCliente("")).toBe("");
      expect(simplificarNombreCliente("   ")).toBe("");
    });
  });

  describe("formatearDiaYFecha", () => {
    it("formatea fechas ISO a día de semana y D/M en español rioplatense", () => {
      // 2026-10-02 es viernes
      expect(formatearDiaYFecha("2026-10-02")).toBe("viernes 2/10");
      // 2026-10-01 es jueves
      expect(formatearDiaYFecha("2026-10-01")).toBe("jueves 1/10");
      // 2026-09-29 es martes
      expect(formatearDiaYFecha("2026-09-29")).toBe("martes 29/9");
    });
  });

  describe("formatearHora y armarDetalleTrayecto", () => {
    it("formatea horas con segundos a HH:mm", () => {
      expect(formatearHora("08:00:00")).toBe("08:00");
      expect(formatearHora("14:30")).toBe("14:30");
      expect(formatearHora(null)).toBe("");
    });

    it("arma trayecto origen y destino", () => {
      expect(armarDetalleTrayecto("Burzaco", "Avellaneda")).toBe(
        "Burzaco → Avellaneda",
      );
      expect(armarDetalleTrayecto(null, "Avellaneda")).toBe("Avellaneda");
      expect(armarDetalleTrayecto("Burzaco", null)).toBe("Burzaco");
      expect(armarDetalleTrayecto(null, null)).toBe("");
    });
  });

  describe("armarMensajeNuevoViaje", () => {
    it("arma el mensaje al asignar un viaje según la especificación", () => {
      // Caso exacto del prompt: "Nuevo viaje: jueves 2/10 08:00 · Huma S.A. · Burzaco → Avellaneda"
      // Nota: Si pasamos una fecha que corresponda a jueves 2/10 o cualquier fecha válida:
      const res = armarMensajeNuevoViaje({
        fecha: "2026-10-01", // jueves 1/10
        hora: "08:00:00",
        cliente: "Huma S.A.",
        origen: "Burzaco",
        destino: "Avellaneda",
      });

      expect(res.titulo).toBe("Nuevo viaje");
      expect(res.cuerpo).toBe(
        "jueves 1/10 08:00 · Huma S.A. · Burzaco → Avellaneda",
      );
      expect(res.textoCompleto).toBe(
        "Nuevo viaje: jueves 1/10 08:00 · Huma S.A. · Burzaco → Avellaneda",
      );
    });

    it("arma el mensaje sin hora si no está programada", () => {
      const res = armarMensajeNuevoViaje({
        fecha: "2026-10-01",
        cliente: "Huma S.A.",
        origen: "Burzaco",
        destino: "Avellaneda",
      });

      expect(res.cuerpo).toBe("jueves 1/10 · Huma S.A. · Burzaco → Avellaneda");
      expect(res.textoCompleto).toBe(
        "Nuevo viaje: jueves 1/10 · Huma S.A. · Burzaco → Avellaneda",
      );
    });

    it("arma el mensaje sin trayecto si no tiene origen ni destino", () => {
      const res = armarMensajeNuevoViaje({
        fecha: "2026-10-01",
        hora: "10:30",
        cliente: "Deza SRL",
      });

      expect(res.cuerpo).toBe("jueves 1/10 10:30 · Deza SRL");
      expect(res.textoCompleto).toBe(
        "Nuevo viaje: jueves 1/10 10:30 · Deza SRL",
      );
    });
  });

  describe("armarMensajeViajeModificado", () => {
    it("arma el mensaje al reprogramar un viaje", () => {
      const res = armarMensajeViajeModificado({
        fecha: "2026-10-01",
        hora: "08:00:00",
        cliente: "Huma S.A.",
        origen: "Burzaco",
        destino: "Avellaneda",
      });

      expect(res.titulo).toBe("Cambió el viaje de Huma S.A.");
      expect(res.cuerpo).toBe("jueves 1/10 08:00 · Burzaco → Avellaneda");
      expect(res.textoCompleto).toBe(
        "Cambió el viaje de Huma S.A.: jueves 1/10 08:00 · Burzaco → Avellaneda",
      );
    });

    it("arma el mensaje reprogramado sin trayecto", () => {
      const res = armarMensajeViajeModificado({
        fecha: "2026-10-01",
        hora: "14:00",
        cliente: "Deza",
      });

      expect(res.titulo).toBe("Cambió el viaje de Deza");
      expect(res.cuerpo).toBe("jueves 1/10 14:00");
      expect(res.textoCompleto).toBe(
        "Cambió el viaje de Deza: jueves 1/10 14:00",
      );
    });
  });

  describe("armarResumenDiaChofer", () => {
    it("retorna null si el chofer no tiene viajes (sin viajes, nada)", () => {
      expect(armarResumenDiaChofer([])).toBeNull();
    });

    it("arma el resumen con múltiples viajes según el formato especificado", () => {
      // Caso exacto del prompt: "Hoy tenés 2 viajes: 08:00 Huma · 14:00 Deza"
      const res = armarResumenDiaChofer([
        { hora: "08:00:00", cliente: "Huma S.A." },
        { hora: "14:00:00", cliente: "Deza SRL" },
      ]);

      expect(res).not.toBeNull();
      expect(res?.titulo).toBe("Hoy tenés 2 viajes");
      expect(res?.cuerpo).toBe("08:00 Huma · 14:00 Deza");
      expect(res?.textoCompleto).toBe(
        "Hoy tenés 2 viajes: 08:00 Huma · 14:00 Deza",
      );
    });

    it("arma el resumen en singular cuando hay 1 viaje", () => {
      const res = armarResumenDiaChofer([
        { hora: "08:00:00", cliente: "Huma S.A." },
      ]);

      expect(res?.titulo).toBe("Hoy tenés 1 viaje");
      expect(res?.cuerpo).toBe("08:00 Huma");
      expect(res?.textoCompleto).toBe("Hoy tenés 1 viaje: 08:00 Huma");
    });

    it("arma el resumen sin hora cuando no está programada", () => {
      const res = armarResumenDiaChofer([
        { cliente: "Huma S.A." },
        { hora: "14:00", cliente: "Deza" },
      ]);

      expect(res?.cuerpo).toBe("Huma · 14:00 Deza");
      expect(res?.textoCompleto).toBe(
        "Hoy tenés 2 viajes: Huma · 14:00 Deza",
      );
    });
  });

  describe("armarTituloRecordatorioHoy", () => {
    it("arma título solo con vencimientos", () => {
      expect(armarTituloRecordatorioHoy(1, 0)).toBe("Hoy tenés 1 vencimiento");
      expect(armarTituloRecordatorioHoy(3, 0)).toBe("Hoy tenés 3 vencimientos");
    });

    it("arma título solo con servicios sin chofer", () => {
      expect(armarTituloRecordatorioHoy(0, 1)).toBe(
        "Hoy tenés 1 servicio sin chofer",
      );
      expect(armarTituloRecordatorioHoy(0, 2)).toBe(
        "Hoy tenés 2 servicios sin chofer",
      );
    });

    it("arma título combinado cuando hay vencimientos y servicios sin chofer", () => {
      expect(armarTituloRecordatorioHoy(1, 1)).toBe(
        "Hoy tenés 1 vencimiento y 1 servicio sin chofer",
      );
      expect(armarTituloRecordatorioHoy(2, 3)).toBe(
        "Hoy tenés 2 vencimientos y 3 servicios sin chofer",
      );
    });

    it("maneja caso sin compromisos", () => {
      expect(armarTituloRecordatorioHoy(0, 0)).toBe("Sin compromisos para hoy");
    });
  });
});
