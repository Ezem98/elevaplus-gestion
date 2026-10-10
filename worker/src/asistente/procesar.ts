import type { SupabaseClient } from "@supabase/supabase-js";
import {
  obtenerHerramientaPorNombre,
  obtenerHerramientasPorRol,
} from "./herramientas";
import { obtenerProveedorModelo } from "./proveedor";
import type { ItemContextoTurno, ProveedorModelo } from "./proveedor/tipos";
import { obtenerFechaHoyArgentina } from "./sesion";
import type {
  ContextoHerramienta,
  MensajeHistorial,
  ResultadoTurnoAsistente,
  RolPermitidoAsistente,
} from "./tipos";

export const MAX_VUELTAS_HERRAMIENTAS = 6;

export interface ParametrosProcesarTurno {
  conversacionId: string;
  usuarioId: string;
  rol: RolPermitidoAsistente;
  texto: string;
  supabase: SupabaseClient; // Cliente con sesión del usuario (RLS)
  proveedor?: ProveedorModelo; // Permite inyectar proveedor en tests
}

/**
 * Ejecuta un turno completo de conversación con el asistente (§4.4 de ASISTENTE-EN-LA-APP.md):
 * 1. Guarda el mensaje del usuario en asistente_mensajes con el cliente del usuario.
 * 2. Carga los últimos 20 mensajes de la conversación.
 * 3. Ejecuta el bucle de herramientas con el modelo (máximo 6 vueltas).
 * 4. Guarda el mensaje del asistente con herramientas usadas, tokens y costo.
 * 5. Devuelve la conversación, mensajes y propuesta si fue creada.
 */
export async function procesarTurno(
  params: ParametrosProcesarTurno,
): Promise<ResultadoTurnoAsistente> {
  const { conversacionId, usuarioId, rol, texto, supabase } = params;
  const proveedor = params.proveedor || obtenerProveedorModelo();

  // 1. Guardar mensaje del usuario en asistente_mensajes
  const { data: mensajeUsuario, error: errorInsertUsuario } = await supabase
    .from("asistente_mensajes")
    .insert({
      conversacion_id: conversacionId,
      rol: "usuario",
      contenido: texto,
      fue_audio: false,
    })
    .select()
    .single();

  if (errorInsertUsuario) {
    throw new Error(
      `Error al guardar mensaje del usuario: ${errorInsertUsuario.message}`,
    );
  }

  // 2. Cargar los últimos 20 mensajes de la conversación
  const { data: historialRaw, error: errorHistorial } = await supabase
    .from("asistente_mensajes")
    .select("id, rol, contenido, herramientas, created_at")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (errorHistorial) {
    throw new Error(
      `Error al cargar historial de mensajes: ${errorHistorial.message}`,
    );
  }

  // Invertir para orden cronológico ascendente
  const mensajesHistorial: MensajeHistorial[] = (historialRaw || [])
    .reverse()
    .map((m: any) => ({
      id: m.id,
      rol: m.rol,
      contenido: m.contenido,
      herramientas: m.herramientas,
      created_at: m.created_at,
    }));

  // 3. Herramientas permitidas para el rol y contexto de ejecución
  const herramientasPermitidas = obtenerHerramientasPorRol(rol);
  const ctx: ContextoHerramienta = {
    supabase,
    usuarioId,
    rol,
    hoy: obtenerFechaHoyArgentina(),
    conversacionId,
  };

  const herramientasUsadas: Array<{
    nombre: string;
    argumentos: any;
    resultado: any;
  }> = [];

  const itemsTurno: ItemContextoTurno[] = [];
  let propuestaId: string | null = null;
  let propuestaObjeto: any = null;

  let tokensEntradaTotal = 0;
  let tokensSalidaTotal = 0;
  let costoUsdTotal = 0;
  let modeloUsado = "desconocido";
  let promptVersionUsada = "local";
  let textoFinal = "";

  // 4. Bucle con el modelo (máximo 6 vueltas)
  let vuelta = 0;
  while (vuelta < MAX_VUELTAS_HERRAMIENTAS) {
    vuelta++;

    const respuesta = await proveedor.generarRespuesta({
      mensajes: mensajesHistorial,
      herramientas: herramientasPermitidas,
      itemsTurno,
    });

    tokensEntradaTotal += respuesta.tokensEntrada || 0;
    tokensSalidaTotal += respuesta.tokensSalida || 0;
    costoUsdTotal += respuesta.costoUsd || 0;
    if (respuesta.modelo) modeloUsado = respuesta.modelo;
    if (respuesta.promptVersion) promptVersionUsada = respuesta.promptVersion;

    const llamadas = respuesta.llamadasHerramientas || [];

    if (llamadas.length > 0) {
      for (const call of llamadas) {
        const herramienta = obtenerHerramientaPorNombre(call.nombre);
        let resultadoEjecucion: any = null;

        if (!herramienta) {
          resultadoEjecucion = {
            error: `La herramienta "${call.nombre}" no está disponible o no existe.`,
          };
        } else {
          try {
            resultadoEjecucion = await herramienta.ejecutar(
              ctx,
              call.argumentos,
            );
          } catch (err: any) {
            resultadoEjecucion = {
              error: err?.message || "Excepción al ejecutar la herramienta.",
            };
          }
        }

        // Registrar en herramientasUsadas del turno
        herramientasUsadas.push({
          nombre: call.nombre,
          argumentos: call.argumentos,
          resultado: resultadoEjecucion,
        });

        // Si la herramienta creó una propuesta, conservarla
        if (resultadoEjecucion?.propuesta_id) {
          propuestaId = resultadoEjecucion.propuesta_id;
          propuestaObjeto =
            resultadoEjecucion.propuesta || resultadoEjecucion;
        }

        // Registrar en items intermedios para la siguiente vuelta del modelo
        itemsTurno.push({
          type: "function_call",
          call_id: call.id,
          name: call.nombre,
          arguments: JSON.stringify(call.argumentos),
        });

        itemsTurno.push({
          type: "function_call_output",
          call_id: call.id,
          name: call.nombre,
          output: JSON.stringify(resultadoEjecucion),
        });
      }

      // Si alcanzamos la vuelta 6 y aún hubo llamadas, cortar
      if (vuelta >= MAX_VUELTAS_HERRAMIENTAS) {
        textoFinal =
          respuesta.texto ||
          "Alcancé el límite de pasos para esta respuesta. Si falta algo, por favor consultame nuevamente.";
        break;
      }
    } else {
      // El modelo devolvió respuesta de texto final sin llamadas a herramientas
      textoFinal = respuesta.texto || "";
      break;
    }
  }

  // 5. Guardar el mensaje del asistente en asistente_mensajes con el cliente del usuario
  const { data: mensajeAsistente, error: errorInsertAsistente } = await supabase
    .from("asistente_mensajes")
    .insert({
      conversacion_id: conversacionId,
      rol: "asistente",
      contenido: textoFinal,
      herramientas: herramientasUsadas.length > 0 ? herramientasUsadas : null,
      propuesta_id: propuestaId,
      modelo: modeloUsado,
      prompt_version: promptVersionUsada,
      tokens_entrada: tokensEntradaTotal,
      tokens_salida: tokensSalidaTotal,
      costo_usd: Number(costoUsdTotal.toFixed(6)),
    })
    .select()
    .single();

  if (errorInsertAsistente) {
    throw new Error(
      `Error al guardar mensaje del asistente: ${errorInsertAsistente.message}`,
    );
  }

  // 6. Si se generó propuesta pero no tenemos el objeto completo, consultarlo
  if (propuestaId && (!propuestaObjeto || !propuestaObjeto.estado)) {
    const { data: pData } = await supabase
      .from("asistente_propuestas")
      .select("*")
      .eq("id", propuestaId)
      .maybeSingle();
    if (pData) {
      propuestaObjeto = pData;
    }
  }

  return {
    conversacion_id: conversacionId,
    mensaje_usuario: mensajeUsuario,
    mensaje_asistente: mensajeAsistente,
    propuesta: propuestaObjeto || undefined,
  };
}
