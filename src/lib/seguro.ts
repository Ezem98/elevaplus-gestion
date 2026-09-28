/**
 * Calcula la porción neta correspondiente al seguro tercerizado de un servicio de traslado.
 * La aseguradora le pasa a la empresa un importe final que ya incluye su IVA.
 * Al refacturar gravado:
 * - Si aplica_iva es true: el neto es round(importe / 1.21, 2).
 * - Si aplica_iva es false: el neto es igual al importe cargado.
 *
 * Ejemplo con redondeo rioplatense:
 * - 30.000 con IVA -> neto = 24.793,39
 * - Al sumar el 21% de IVA (5.206,61), el total vuelve exactamente a 30.000,00.
 */
export function netoSeguro(
  importe: number | null | undefined,
  aplicaIva: boolean,
): number {
  if (importe == null || isNaN(importe) || importe <= 0) {
    return 0;
  }

  if (!aplicaIva) {
    return Math.round((importe + Number.EPSILON) * 100) / 100;
  }

  return Math.round((importe / 1.21 + Number.EPSILON) * 100) / 100;
}
