import { describe, it, expect } from "vitest";
import { cotizar, esHorarioNocturno } from "./cotizador";

const fordCargo = { coef_precio: 1.8, coef_carga_menor_50: 1.4, coef_carga_mayor_50: 1.5 };
const fiorino = { coef_precio: 0.95, coef_carga_menor_50: 1.1, coef_carga_mayor_50: 1.2 };
const params = { precio_km: 1700, monto_minimo: 15000, km_minimo: 1 };

describe("cotizar", () => {
  it("calcula base × coeficientes para un viaje simple", () => {
    // 30 km × 1700 × 1.8 × 1.4 = 128.520
    const r = cotizar({ km: 30, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: false }, params);
    expect(r.importe).toBe(128520);
    expect(r.aplicoMinimo).toBe(false);
  });

  it("ida y vuelta duplica los km por defecto", () => {
    const r = cotizar({ km: 30, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: true }, params);
    expect(r.kmFacturables).toBe(60);
    expect(r.importe).toBe(257040);
  });

  it("respeta un factor de ida y vuelta configurado", () => {
    const r = cotizar(
      { km: 30, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: true },
      { ...params, factor_ida_vuelta: 1.5 },
    );
    expect(r.kmFacturables).toBe(45);
  });

  it("aplica el mínimo cuando el cálculo queda por debajo", () => {
    const r = cotizar({ km: 2, vehiculo: fiorino, cargaMayor50: false, idaYVuelta: false }, params);
    expect(r.aplicoMinimo).toBe(true);
    expect(r.importe).toBe(15000);
  });

  it("usa km_minimo si la distancia es menor", () => {
    const r = cotizar(
      { km: 0.3, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: false },
      { ...params, km_minimo: 5 },
    );
    expect(r.kmFacturables).toBe(5);
  });

  it("carga >50% usa el coeficiente mayor", () => {
    const a = cotizar({ km: 100, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: false }, params);
    const b = cotizar({ km: 100, vehiculo: fordCargo, cargaMayor50: true, idaYVuelta: false }, params);
    expect(b.coefCarga).toBe(1.5);
    expect(b.importe).toBeGreaterThan(a.importe);
  });

  it("la suma de base + deltaVehiculo + deltaCarga es igual a subtotal", () => {
    const r = cotizar({ km: 30, vehiculo: fordCargo, cargaMayor50: true, idaYVuelta: true }, params);
    expect(r.base + r.deltaVehiculo + r.deltaCarga).toBeCloseTo(r.subtotal, 5);
  });

  describe("servicio nocturno", () => {
    it("apagado igual que hoy (incluso con porcentaje configurado)", () => {
      const sinNocturno = cotizar(
        { km: 30, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: false, nocturno: false },
        { ...params, recargo_nocturno_pct: 30 },
      );
      const original = cotizar(
        { km: 30, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: false },
        params,
      );
      expect(sinNocturno.importe).toBe(original.importe);
      expect(sinNocturno.subtotal).toBe(original.subtotal);
      expect(sinNocturno.deltaNocturno).toBeUndefined();
      expect(sinNocturno.recargoNocturnoPct).toBeNull();
    });

    it("encendido sin porcentaje configurado (null o undefined) no altera el importe", () => {
      const r = cotizar(
        { km: 30, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: false, nocturno: true },
        { ...params, recargo_nocturno_pct: null },
      );
      const original = cotizar(
        { km: 30, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: false },
        params,
      );
      expect(r.importe).toBe(original.importe);
      expect(r.subtotal).toBe(original.subtotal);
      expect(r.deltaNocturno).toBeUndefined();
    });

    it("encendido con porcentaje configurado aplica el recargo como factor sobre el subtotal", () => {
      // Subtotal base = 30 * 1700 * 1.8 * 1.4 = 128.520
      // Con +30% recargo: deltaNocturno = 38.556, subtotal = 167.076
      const r = cotizar(
        { km: 30, vehiculo: fordCargo, cargaMayor50: false, idaYVuelta: false, nocturno: true },
        { ...params, recargo_nocturno_pct: 30 },
      );
      expect(r.recargoNocturnoPct).toBe(30);
      expect(r.deltaNocturno).toBeCloseTo(38556, 2);
      expect(r.subtotal).toBeCloseTo(167076, 2);
      expect(r.importe).toBe(167076);
      expect(r.aplicoMinimo).toBe(false);
    });

    it("interacción con monto mínimo: si el subtotal con recargo sigue por debajo del mínimo, aplica el mínimo", () => {
      // 2 km × 1700 × 0.95 × 1.1 = 3.553
      // Con +30% recargo: subtotal = 4.618,9. Mínimo = 15.000
      const r = cotizar(
        { km: 2, vehiculo: fiorino, cargaMayor50: false, idaYVuelta: false, nocturno: true },
        { ...params, monto_minimo: 15000, recargo_nocturno_pct: 30 },
      );
      expect(r.subtotal).toBeLessThan(15000);
      expect(r.aplicoMinimo).toBe(true);
      expect(r.importe).toBe(15000);
    });

    it("interacción con monto mínimo: si el subtotal sin recargo era menor pero con recargo supera el mínimo, no aplica mínimo", () => {
      // Supongamos subtotal base = 12.000 (< 15.000 mínimo).
      // Con +30% recargo: 12.000 * 1.30 = 15.600 (> 15.000)
      // Simulamos con km tal que base quede en ~12.000
      const r = cotizar(
        { km: 7, vehiculo: fiorino, cargaMayor50: false, idaYVuelta: false, nocturno: true },
        { ...params, monto_minimo: 15000, recargo_nocturno_pct: 30 },
      );
      // 7 * 1700 * 0.95 * 1.1 = 12.435,5
      // 12.435,5 * 1.3 = 16.166,15
      expect(r.subtotal).toBeGreaterThan(15000);
      expect(r.aplicoMinimo).toBe(false);
      expect(r.importe).toBe(16166);
    });
  });

  describe("esHorarioNocturno", () => {
    it("detecta horarios nocturnos que cruzan la medianoche (20:00 a 06:00)", () => {
      // 22:00 y 03:00 son nocturnas
      expect(esHorarioNocturno("22:00")).toBe(true);
      expect(esHorarioNocturno("03:00")).toBe(true);
      expect(esHorarioNocturno("20:00")).toBe(true);
      expect(esHorarioNocturno("23:59")).toBe(true);
      expect(esHorarioNocturno("00:00")).toBe(true);
      expect(esHorarioNocturno("05:59")).toBe(true);
      expect(esHorarioNocturno("03:30:00")).toBe(true);

      // Fuera de la franja nocturna
      expect(esHorarioNocturno("06:00")).toBe(false);
      expect(esHorarioNocturno("12:00")).toBe(false);
      expect(esHorarioNocturno("19:59")).toBe(false);
      expect(esHorarioNocturno(null)).toBe(false);
      expect(esHorarioNocturno("")).toBe(false);
    });

    it("respeta franjas horarias personalizadas", () => {
      // Franja de 21:00 a 07:00
      expect(esHorarioNocturno("20:30", "21:00", "07:00")).toBe(false);
      expect(esHorarioNocturno("21:30", "21:00", "07:00")).toBe(true);
      expect(esHorarioNocturno("06:30", "21:00", "07:00")).toBe(true);
      expect(esHorarioNocturno("07:15", "21:00", "07:00")).toBe(false);
    });
  });
});
