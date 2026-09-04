/**
 * Fórmula de cotización de traslados.
 *
 *   kmFacturables = max(km, km_minimo) × (ida y vuelta ? factor_ida_vuelta : 1)
 *   base          = kmFacturables × precio_km
 *   coef          = coef_precio(vehículo) × coef_carga(vehículo, carga)
 *   importe       = max(base × coef, monto_minimo)
 *
 * Los coeficientes por vehículo y los parámetros (precio_km, mínimo, factor ida y
 * vuelta) viven en la base y se editan desde Configuración, nunca acá.
 *
 * PENDIENTE: la planilla original da $243.054 para Ford Cargo / 30 km / <50% / ida y
 * vuelta y esa cifra no se reproduce con ninguna combinación simple de los
 * coeficientes visibles. Hay que abrir la fórmula de la celda F18 y portarla tal cual
 * antes de dar el cotizador por terminado. Mientras tanto la fórmula de arriba es la
 * versión "limpia" y explicable.
 */

export interface VehiculoCotizable {
  coef_precio: number;
  coef_carga_menor_50: number;
  coef_carga_mayor_50: number;
}

export interface ParametrosCotizacion {
  precio_km: number;
  monto_minimo: number;
  km_minimo: number;
  /** Multiplicador de km cuando el viaje es ida y vuelta. Default 2. */
  factor_ida_vuelta?: number;
}

export interface EntradaCotizacion {
  km: number;
  vehiculo: VehiculoCotizable;
  cargaMayor50: boolean;
  idaYVuelta: boolean;
}

export interface DesgloseCotizacion {
  kmFacturables: number;
  base: number;
  coefVehiculo: number;
  coefCarga: number;
  factorIdaVuelta: number;
  subtotal: number;
  aplicoMinimo: boolean;
  importe: number;
}

export function cotizar(e: EntradaCotizacion, p: ParametrosCotizacion): DesgloseCotizacion {
  const factorIdaVuelta = e.idaYVuelta ? (p.factor_ida_vuelta ?? 2) : 1;
  const kmFacturables = Math.max(e.km, p.km_minimo) * factorIdaVuelta;
  const base = kmFacturables * p.precio_km;
  const coefVehiculo = e.vehiculo.coef_precio;
  const coefCarga = e.cargaMayor50 ? e.vehiculo.coef_carga_mayor_50 : e.vehiculo.coef_carga_menor_50;
  const subtotal = base * coefVehiculo * coefCarga;
  const aplicoMinimo = subtotal < p.monto_minimo;
  const importe = Math.round(Math.max(subtotal, p.monto_minimo));
  return { kmFacturables, base, coefVehiculo, coefCarga, factorIdaVuelta, subtotal, aplicoMinimo, importe };
}
