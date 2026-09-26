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
  /** Porcentaje de recargo para servicios nocturnos (ej: 30 para 30%). Null o undefined = sin recargo. */
  recargo_nocturno_pct?: number | null;
}

export interface EntradaCotizacion {
  km: number;
  vehiculo: VehiculoCotizable;
  cargaMayor50: boolean;
  idaYVuelta: boolean;
  /** Indica si se aplica la tarifa/recargo de servicio nocturno. */
  nocturno?: boolean;
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
  deltaVehiculo: number;
  deltaCarga: number;
  deltaNocturno?: number;
  recargoNocturnoPct?: number | null;
}

export function cotizar(e: EntradaCotizacion, p: ParametrosCotizacion): DesgloseCotizacion {
  const factorIdaVuelta = e.idaYVuelta ? (p.factor_ida_vuelta ?? 2) : 1;
  const kmFacturables = Math.max(e.km, p.km_minimo) * factorIdaVuelta;
  const base = kmFacturables * p.precio_km;
  const coefVehiculo = e.vehiculo.coef_precio;
  const coefCarga = e.cargaMayor50 ? e.vehiculo.coef_carga_mayor_50 : e.vehiculo.coef_carga_menor_50;
  const subtotalBase = base * coefVehiculo * coefCarga;

  const tieneRecargoNocturno = Boolean(
    e.nocturno && p.recargo_nocturno_pct != null && p.recargo_nocturno_pct > 0,
  );
  const recargoNocturnoPct = tieneRecargoNocturno ? p.recargo_nocturno_pct! : null;
  const deltaNocturno = tieneRecargoNocturno ? subtotalBase * (recargoNocturnoPct! / 100) : 0;
  const subtotal = subtotalBase + deltaNocturno;

  const deltaVehiculo = base * (coefVehiculo - 1);
  const deltaCarga = base * coefVehiculo * (coefCarga - 1);
  const aplicoMinimo = subtotal < p.monto_minimo;
  const importe = Math.round(Math.max(subtotal, p.monto_minimo));
  return {
    kmFacturables,
    base,
    coefVehiculo,
    coefCarga,
    factorIdaVuelta,
    subtotal,
    aplicoMinimo,
    importe,
    deltaVehiculo,
    deltaCarga,
    deltaNocturno: tieneRecargoNocturno ? deltaNocturno : undefined,
    recargoNocturnoPct,
  };
}

/**
 * Determina si una hora ("HH:mm" o "HH:mm:ss") se encuentra dentro de la franja nocturna.
 * La franja suele cruzar la medianoche (por defecto de 20:00 a 06:00).
 */
export function esHorarioNocturno(
  hora: string | null | undefined,
  desde: string | null | undefined = "20:00",
  hasta: string | null | undefined = "06:00",
): boolean {
  if (!hora) return false;
  const h = hora.slice(0, 5);
  const d = (desde || "20:00").slice(0, 5);
  const a = (hasta || "06:00").slice(0, 5);

  if (d > a) {
    // Cruza medianoche (ej: 20:00 a 06:00)
    return h >= d || h < a;
  }
  // Mismo día (ej: 01:00 a 05:00)
  return h >= d && h < a;
}
