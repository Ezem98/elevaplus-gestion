import { describe, expect, it } from "vitest";
import {
  armarEventoGcal,
  detectarEventosABorrar,
  esErrorInvalidGrant,
  formatearMontoPesos,
  type EventoGuardado,
  type FilaAgenda,
} from "./eventos";
import {
  firmarStateOAuth,
  generarUrlAutorizacion,
  verificarStateOAuth,
} from "./cliente";

describe("Google Calendar - Formateo y armado de eventos", () => {
  describe("formatearMontoPesos()", () => {
    it("formatea números enteros sin centavos en estilo argentino", () => {
      const resultado = formatearMontoPesos(1200000);
      expect(resultado).toBe("$ 1.200.000");
    });

    it("redondea centavos al entero más cercano", () => {
      expect(formatearMontoPesos(350000.4)).toBe("$ 350.000");
      expect(formatearMontoPesos(350000.6)).toBe("$ 350.001");
    });
  });

  describe("armarEventoGcal()", () => {
    it("arma evento con monto formateado en el título para un vencimiento", () => {
      const item: FilaAgenda = {
        clave: "vencimiento:abc-123",
        fecha: "2026-10-05",
        sentido: "egreso",
        titulo: "Sueldos",
        detalle: "Pago de quincena personal",
        monto: 1200000,
        url: "/agenda?vencimiento=abc-123",
      };

      const evento = armarEventoGcal(item, 2, "https://gestion.eleva-plus.com.ar");

      // Título con monto
      expect(evento.summary).toBe("Sueldos · $ 1.200.000");

      // Día completo: start.date y end.date sin dateTime
      expect(evento.start).toEqual({ date: "2026-10-05" });
      expect(evento.end).toEqual({ date: "2026-10-05" });
      expect((evento.start as any).dateTime).toBeUndefined();
      expect((evento.end as any).dateTime).toBeUndefined();

      // Recordatorio popup para 2 días antes a las 9:00 hs (2 * 24 - 9 = 39 hs = 2340 minutos)
      expect(evento.reminders).toEqual({
        useDefault: false,
        overrides: [
          {
            method: "popup",
            minutes: 2340,
          },
        ],
      });

      // Descripción con detalle y link a la app
      expect(evento.description).toContain("Pago de quincena personal");
      expect(evento.description).toContain(
        "Ver en ELEVAPLUS: https://gestion.eleva-plus.com.ar/agenda?vencimiento=abc-123",
      );
    });

    it("arma evento sin monto en el título cuando monto es null o 0", () => {
      const item: FilaAgenda = {
        clave: "alquiler:ser-789",
        fecha: "2026-10-12",
        sentido: "info",
        titulo: "Vence alquiler",
        detalle: "Cliente Huma SA - Autoelevador 2.5t",
        monto: null,
        url: "/servicios/ser-789",
      };

      const evento = armarEventoGcal(item, 1, "https://gestion.eleva-plus.com.ar");

      expect(evento.summary).toBe("Vence alquiler");
      expect(evento.start).toEqual({ date: "2026-10-12" });
      expect(evento.end).toEqual({ date: "2026-10-12" });

      // Recordatorio por defecto de 1 día antes a las 9:00 hs (1 * 24 - 9 = 15 hs = 900 minutos)
      expect(evento.reminders).toEqual({
        useDefault: false,
        overrides: [
          {
            method: "popup",
            minutes: 900,
          },
        ],
      });

      expect(evento.description).toContain("Cliente Huma SA - Autoelevador 2.5t");
      expect(evento.description).toContain(
        "Ver en ELEVAPLUS: https://gestion.eleva-plus.com.ar/servicios/ser-789",
      );
    });

    it("aplica recordatorio de 1 día (900 minutos) para eventos derivados sin días especificados", () => {
      const item: FilaAgenda = {
        clave: "cheque_cobrar:ch-1",
        fecha: "2026-10-20",
        sentido: "ingreso",
        titulo: "Cobrar cheque 45678",
        detalle: "Banco Galicia",
        monto: 350000,
        url: "/cobros?tab=cheques&cheque=ch-1",
      };

      const evento = armarEventoGcal(item, null, "https://gestion.eleva-plus.com.ar");

      expect(evento.summary).toBe("Cobrar cheque 45678 · $ 350.000");
      expect(evento.reminders?.overrides?.[0]?.minutes).toBe(900);
    });
  });

  describe("detectarEventosABorrar()", () => {
    it("detecta eventos cuyas claves ya no están presentes en la agenda", () => {
      const clavesAgenda = [
        "vencimiento:v1",
        "cheque_cobrar:ch1",
        "movimiento:m1",
      ];

      const eventosGuardados: EventoGuardado[] = [
        { clave: "vencimiento:v1", gcal_event_id: "gcal_1" },
        { clave: "vencimiento:v2_pagado", gcal_event_id: "gcal_2" }, // debe borrarse
        { clave: "cheque_cobrar:ch1", gcal_event_id: "gcal_3" },
        { clave: "cobro:co_acreditado", gcal_event_id: "gcal_4" }, // debe borrarse
      ];

      const aBorrar = detectarEventosABorrar(clavesAgenda, eventosGuardados);

      expect(aBorrar).toHaveLength(2);
      expect(aBorrar).toEqual([
        { clave: "vencimiento:v2_pagado", gcal_event_id: "gcal_2" },
        { clave: "cobro:co_acreditado", gcal_event_id: "gcal_4" },
      ]);
    });

    it("no devuelve nada si todos los eventos guardados siguen vigentes en agenda", () => {
      const clavesAgenda = ["vencimiento:v1", "cheque_cobrar:ch1"];
      const eventosGuardados: EventoGuardado[] = [
        { clave: "vencimiento:v1", gcal_event_id: "gcal_1" },
        { clave: "cheque_cobrar:ch1", gcal_event_id: "gcal_2" },
      ];

      const aBorrar = detectarEventosABorrar(clavesAgenda, eventosGuardados);
      expect(aBorrar).toHaveLength(0);
    });

    it("devuelve todos los eventos guardados si la agenda queda vacía", () => {
      const clavesAgenda: string[] = [];
      const eventosGuardados: EventoGuardado[] = [
        { clave: "vencimiento:v1", gcal_event_id: "gcal_1" },
      ];

      const aBorrar = detectarEventosABorrar(clavesAgenda, eventosGuardados);
      expect(aBorrar).toEqual(eventosGuardados);
    });
  });

  describe("esErrorInvalidGrant()", () => {
    it("reconoce invalid_grant en message", () => {
      const err = new Error("invalid_grant: Bad Request");
      expect(esErrorInvalidGrant(err)).toBe(true);
    });

    it("reconoce invalid_grant en response.data.error", () => {
      const err = {
        response: {
          data: {
            error: "invalid_grant",
            error_description: "Token has been expired or revoked.",
          },
        },
      };
      expect(esErrorInvalidGrant(err)).toBe(true);
    });

    it("reconoce invalid_grant en response.data.error_description", () => {
      const err = {
        response: {
          data: {
            error: "unauthorized_client",
            error_description: "Failed with invalid_grant",
          },
        },
      };
      expect(esErrorInvalidGrant(err)).toBe(true);
    });

    it("devuelve false para errores de red u otros códigos HTTP", () => {
      expect(esErrorInvalidGrant(new Error("ETIMEDOUT"))).toBe(false);
      expect(
        esErrorInvalidGrant({
          code: 404,
          response: { status: 404, data: { error: "notFound" } },
        }),
      ).toBe(false);
      expect(esErrorInvalidGrant(null)).toBe(false);
      expect(esErrorInvalidGrant(undefined)).toBe(false);
    });
  });

  describe("Seguridad OAuth: firmarStateOAuth() y verificarStateOAuth()", () => {
    it("firma y verifica exitosamente un state para un usuario", () => {
      const usuarioId = "11111111-2222-3333-4444-555555555555";
      const state = firmarStateOAuth(usuarioId);

      const verificacion = verificarStateOAuth(state);
      expect(verificacion.valido).toBe(true);
      expect(verificacion.usuarioId).toBe(usuarioId);
    });

    it("rechaza un state alterado o inválido", () => {
      const stateAlterado = Buffer.from(
        JSON.stringify({
          usuarioId: "fake-id",
          timestamp: Date.now(),
          firma: "firma_trucha",
        }),
      ).toString("base64url");

      const verificacion = verificarStateOAuth(stateAlterado);
      expect(verificacion.valido).toBe(false);
      expect(verificacion.usuarioId).toBeUndefined();
    });

    it("rechaza strings no válidos", () => {
      expect(verificarStateOAuth("not-a-valid-state").valido).toBe(false);
      expect(verificarStateOAuth("").valido).toBe(false);
    });

    it("genera URL de autorización con Google que contiene el state firmado y sin tokens de usuario en query", () => {
      const usuarioId = "11111111-2222-3333-4444-555555555555";
      const state = firmarStateOAuth(usuarioId);
      const url = generarUrlAutorizacion(state);

      expect(url).toContain("https://accounts.google.com");
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
      expect(url).toContain(encodeURIComponent(state));
      // El usuarioId no debe aparecer en texto plano en la URL
      expect(url).not.toContain("usuarioId");
      expect(url).not.toContain(usuarioId);
    });
  });
});
