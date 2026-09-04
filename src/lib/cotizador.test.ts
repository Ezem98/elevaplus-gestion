import { describe, it, expect } from "vitest";
import { cotizar } from "./cotizador";

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
});
