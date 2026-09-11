import { supabaseAdmin } from "../supabase";

export interface ResultadoValidacionTopes {
  valido: boolean;
  motivo?: "tope_cantidad_superado" | "tope_monto_superado";
  limiteCantidad: number;
  limiteMonto: number;
  cantidadActual: number;
  montoActual: number;
}

/**
 * Valida que la cantidad y monto total a emitir no superen los topes
 * diarios configurados en la tabla empresa.
 */
export async function validarTopesEmision(
  cantidadAEmitir: number,
  montoAEmitir: number
): Promise<ResultadoValidacionTopes> {
  const { data: empresa } = await supabaseAdmin
    .from("empresa")
    .select("tope_diario_facturas, tope_diario_monto")
    .limit(1)
    .single();

  const limiteCantidad = empresa?.tope_diario_facturas ?? 20;
  const limiteMonto = Number(empresa?.tope_diario_monto) || 20000000;

  if (cantidadAEmitir > limiteCantidad) {
    return {
      valido: false,
      motivo: "tope_cantidad_superado",
      limiteCantidad,
      limiteMonto,
      cantidadActual: cantidadAEmitir,
      montoActual: montoAEmitir,
    };
  }

  if (montoAEmitir > limiteMonto) {
    return {
      valido: false,
      motivo: "tope_monto_superado",
      limiteCantidad,
      limiteMonto,
      cantidadActual: cantidadAEmitir,
      montoActual: montoAEmitir,
    };
  }

  return {
    valido: true,
    limiteCantidad,
    limiteMonto,
    cantidadActual: cantidadAEmitir,
    montoActual: montoAEmitir,
  };
}
