import { supabaseAdmin } from "../supabase";

export interface RegistroIdempotencia {
  id: number;
  tarea: string;
  clave: string;
  ejecutado_at: string;
  resultado?: any;
}

/**
 * Intenta registrar el inicio de una tarea en ejecuciones_worker.
 * Si ya fue ejecutada (conflicto de clave única) y no se fuerza, retorna ejecutado: false.
 */
export async function registrarEjecucion(
  tarea: string,
  clave: string,
  forzar: boolean = false,
  resultadoInicial: any = { estado: "iniciado" },
): Promise<{ ejecutado: boolean; motivo?: string; id?: number }> {
  if (forzar) {
    console.log(
      `[IDEMPOTENCIA] Tarea '${tarea}' (${clave}) ejecutada con forzar=true.`,
    );
    const { data, error } = await supabaseAdmin
      .from("ejecuciones_worker")
      .upsert(
        {
          tarea,
          clave,
          ejecutado_at: new Date().toISOString(),
          resultado: resultadoInicial,
        },
        { onConflict: "tarea,clave" },
      )
      .select("id")
      .single();

    if (error) {
      console.error(
        "[IDEMPOTENCIA] Error al registrar ejecución forzada:",
        error,
      );
    }
    return { ejecutado: true, id: data?.id };
  }

  const { data, error } = await supabaseAdmin
    .from("ejecuciones_worker")
    .insert({
      tarea,
      clave,
      ejecutado_at: new Date().toISOString(),
      resultado: resultadoInicial,
    })
    .select("id")
    .single();

  if (error) {
    // Código de violación de clave única en Postgres: 23505
    if (error.code === "23505" || error.message?.includes("duplicate key")) {
      console.log(
        `[IDEMPOTENCIA] Tarea '${tarea}' (${clave}) ya ejecutada previamente. Se omite.`,
      );
      return { ejecutado: false, motivo: "ya_ejecutado" };
    }
    console.error(
      `[IDEMPOTENCIA] Error inesperado al insertar en ejecuciones_worker:`,
      error,
    );
    throw error;
  }

  return { ejecutado: true, id: data?.id };
}

/**
 * Actualiza el resultado final de una ejecución registrada.
 */
export async function finalizarEjecucion(
  tarea: string,
  clave: string,
  resultadoFinal: any,
): Promise<void> {
  try {
    await supabaseAdmin
      .from("ejecuciones_worker")
      .update({
        resultado: resultadoFinal,
      })
      .match({ tarea, clave });
  } catch (err) {
    console.error("[IDEMPOTENCIA] Error al finalizar ejecucion:", err);
  }
}
