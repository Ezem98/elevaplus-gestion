/**
 * Códigos oficiales de ARCA (ex-AFIP) utilizados por el Web Service WSFEv1.
 * Fuente: Documentación oficial Afip SDK (https://docs.afipsdk.com/)
 */

export const TIPO_COMPROBANTE = {
  FACTURA_A: 1,
  NOTA_DE_DEBITO_A: 2,
  NOTA_DE_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DE_DEBITO_B: 7,
  NOTA_DE_CREDITO_B: 8,
  FACTURA_C: 11,
} as const;

export const CONCEPTO = {
  PRODUCTOS: 1,
  SERVICIOS: 2,
  PRODUCTOS_Y_SERVICIOS: 3,
} as const;

export const TIPO_DOCUMENTO = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,
} as const;

export const CONDICION_IVA_RECEPTOR = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
} as const;

export const ALICUOTA_IVA_ID = {
  IVA_0: 3,
  IVA_10_5: 4,
  IVA_21: 5,
} as const;

/**
 * Convierte la condición IVA de la base de datos de ELEVAPLUS al ID de ARCA
 */
export function obtenerCondicionIvaReceptorId(
  condicion: "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | string | null | undefined
): number {
  switch (condicion) {
    case "responsable_inscripto":
      return CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO;
    case "monotributo":
      return CONDICION_IVA_RECEPTOR.MONOTRIBUTO;
    case "exento":
      return CONDICION_IVA_RECEPTOR.EXENTO;
    case "consumidor_final":
    default:
      return CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
  }
}
