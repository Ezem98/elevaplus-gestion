import { supabase } from "./supabase";
import type { Cheque, EstadoCheque } from "./tipos";

export interface ParametrosCambiarEstadoCheque {
  chequeId: string;
  nuevoEstado: EstadoCheque;
  nota?: string | null;
  cuentaId?: string | null;
  fecha?: string | null;
  endosadoA?: string | null;
  movimientoId?: string | null;
  descontadoNeto?: number | null;
  descontadoEn?: string | null;
  motivo?: string | null;
}

export type ParametrosCambioEstadoCheque = ParametrosCambiarEstadoCheque;

/**
 * Cambia el estado de un cheque a través de la RPC oficial `cambiar_estado_cheque`.
 * Registra auditoría en `cheque_eventos` y actualiza cobros/movimientos asociados.
 */
export async function cambiarEstadoCheque(
  params: ParametrosCambiarEstadoCheque,
): Promise<Cheque> {
  const { data, error } = await supabase.rpc("cambiar_estado_cheque", {
    p_cheque_id: params.chequeId,
    p_nuevo: params.nuevoEstado,
    p_nota: params.nota ?? null,
    p_cuenta_id: params.cuentaId ?? null,
    p_fecha: params.fecha ?? new Date().toISOString().slice(0, 10),
    p_endosado_a: params.endosadoA ?? null,
    p_movimiento_id: params.movimientoId ?? null,
    p_descontado_neto: params.descontadoNeto ?? null,
    p_descontado_en: params.descontadoEn ?? null,
    p_motivo: params.motivo ?? null,
  });

  if (error) {
    throw new Error(error.message || "Error al cambiar el estado del cheque.");
  }

  return data as unknown as Cheque;
}
