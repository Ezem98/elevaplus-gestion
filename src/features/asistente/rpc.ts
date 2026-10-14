import { supabase } from "@/lib/supabase";

export interface ResultadoConfirmarPropuesta {
  ok: boolean;
  propuesta_id: string;
  estado: "confirmada" | "vencida" | "fallida" | string;
  resultado_id?: string;
  servicio?: Record<string, unknown>;
  presupuesto?: Record<string, unknown>;
  error?: string;
}

/**
 * Confirma una propuesta pendiente mediante la RPC confirmar_propuesta.
 * Es idempotente ante doble toque.
 */
export async function confirmarPropuesta(
  propuestaId: string,
): Promise<ResultadoConfirmarPropuesta> {
  const { data, error } = await supabase.rpc("confirmar_propuesta", {
    p_propuesta_id: propuestaId,
  });

  if (error) {
    return {
      ok: false,
      propuesta_id: propuestaId,
      estado: "fallida",
      error: error.message,
    };
  }

  if (!data) {
    return {
      ok: false,
      propuesta_id: propuestaId,
      estado: "fallida",
      error: "No se recibió respuesta de la confirmación.",
    };
  }

  return data as ResultadoConfirmarPropuesta;
}

/**
 * Descarta una propuesta pendiente mediante la RPC descartar_propuesta.
 */
export async function descartarPropuesta(
  propuestaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("descartar_propuesta", {
    p_propuesta_id: propuestaId,
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  if (!data) {
    return {
      ok: false,
      error: "No se recibió confirmación al descartar.",
    };
  }

  return { ok: true };
}
