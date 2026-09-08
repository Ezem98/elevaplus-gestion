import { ALICUOTA_IVA } from "./config";
import type { CondicionIva } from "./tipos";

export function sugerirTipoFactura(condicionIva: CondicionIva | string | null | undefined): "A" | "B" {
  if (condicionIva === "responsable_inscripto") {
    return "A";
  }
  return "B";
}

export interface ServicioCalculo {
  monto: number | null | undefined;
  aplica_iva?: boolean | null;
}

export interface TotalesFactura {
  neto: number;
  iva: number;
  total: number;
}

function redondearDosDecimales(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function calcularTotales(servicios: ServicioCalculo[]): TotalesFactura {
  let sumaNeto = 0;
  let sumaBaseIva = 0;

  for (const s of servicios) {
    const monto = Number(s.monto) || 0;
    sumaNeto += monto;
    if (s.aplica_iva !== false) {
      sumaBaseIva += monto;
    }
  }

  const neto = redondearDosDecimales(sumaNeto);
  const iva = redondearDosDecimales(sumaBaseIva * ALICUOTA_IVA);
  const total = redondearDosDecimales(neto + iva);

  return { neto, iva, total };
}
