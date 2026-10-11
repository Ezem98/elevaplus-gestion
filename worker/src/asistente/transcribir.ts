import OpenAI, { toFile } from "openai";
import { config } from "../config";

export const TIPOS_AUDIO_PERMITIDOS = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
] as const;

export type TipoAudioPermitido = (typeof TIPOS_AUDIO_PERMITIDOS)[number];

/**
 * Valida si un Content-Type (posiblemente con parámetros como ;codecs=opus)
 * pertenece a la lista de tipos de audio admitidos.
 */
export function esTipoAudioPermitido(contentType?: string): boolean {
  if (!contentType) return false;
  const tipoLimpio = contentType.split(";")[0].trim().toLowerCase();
  return (TIPOS_AUDIO_PERMITIDOS as readonly string[]).includes(tipoLimpio);
}

export interface ParametrosTranscribirAudio {
  buffer: Buffer;
  mimetype: string;
  headerTranscripcionFalsa?: string;
  duracionSegundosHeader?: number;
  clienteOpenAI?: OpenAI;
  modelo?: string;
}

export interface ResultadoTranscripcion {
  texto: string;
  duracionSegundos?: number;
  costoUsd?: number;
}

/**
 * Calcula el costo estimado en USD de la transcripción de audio:
 * - whisper-1: $0.006 por minuto ($0.0001 por segundo).
 * - gpt-4o-mini-transcribe / default: $0.003 por minuto ($0.00005 por segundo).
 */
export function calcularCostoTranscripcion(
  segundos: number,
  modelo: string = "gpt-4o-mini-transcribe",
): number {
  if (!segundos || segundos <= 0) return 0;
  const costoPorMinuto = modelo.includes("whisper") ? 0.006 : 0.003;
  const costoTotal = (segundos / 60) * costoPorMinuto;
  return Number(costoTotal.toFixed(6));
}

function sanitizarMensaje(mensaje: string, apiKey?: string): string {
  if (!apiKey || apiKey.length === 0) return mensaje;
  return mensaje.split(apiKey).join("[REDACTED_API_KEY]");
}

/**
 * Transcribe un Buffer de audio utilizando el SDK de OpenAI (audio.transcriptions.create)
 * con idioma español ("es") y el modelo configurado.
 *
 * Si ASISTENTE_MODELO=falso, opera sin red devolviendo X-Transcripcion-Falsa
 * o "cargame un traslado para mañana".
 *
 * El buffer nunca se guarda en disco ni en base de datos.
 */
export async function transcribirAudio(
  params: ParametrosTranscribirAudio,
): Promise<ResultadoTranscripcion> {
  const { buffer, mimetype, headerTranscripcionFalsa, duracionSegundosHeader } =
    params;

  // 1. Proveedor falso para pruebas y E2E sin red
  if (config.ASISTENTE_MODELO === "falso") {
    const textoFalso =
      headerTranscripcionFalsa !== undefined &&
      headerTranscripcionFalsa.trim() !== ""
        ? headerTranscripcionFalsa.trim()
        : "cargame un traslado para mañana";

    const duracionFalsa =
      duracionSegundosHeader != null && !isNaN(duracionSegundosHeader)
        ? duracionSegundosHeader
        : 5;

    const costoFalso = calcularCostoTranscripcion(duracionFalsa, "falso");

    return {
      texto: textoFalso,
      duracionSegundos: duracionFalsa,
      costoUsd: costoFalso,
    };
  }

  // 2. Validación de disponibilidad de OpenAI API Key
  if (
    !params.clienteOpenAI &&
    (!config.OPENAI_API_KEY || config.OPENAI_API_KEY.trim() === "")
  ) {
    const err: any = new Error(
      "El servicio de transcripción de audio no está disponible (OPENAI_API_KEY no configurada).",
    );
    err.status = 503;
    throw err;
  }

  const cliente =
    params.clienteOpenAI ||
    new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      timeout: 30_000,
      maxRetries: 2,
    });

  const extensiones: Record<string, string> = {
    "audio/webm": "audio.webm",
    "audio/mp4": "audio.mp4",
    "audio/mpeg": "audio.mp3",
    "audio/ogg": "audio.ogg",
    "audio/wav": "audio.wav",
  };
  const tipoLimpio = mimetype.split(";")[0].trim().toLowerCase();
  const nombreArchivo = extensiones[tipoLimpio] || "audio.webm";

  const modelo =
    params.modelo ||
    config.OPENAI_MODELO_TRANSCRIPCION ||
    "gpt-4o-mini-transcribe";

  try {
    const archivo = await toFile(buffer, nombreArchivo, {
      type: tipoLimpio,
    });

    const respuesta: any = await cliente.audio.transcriptions.create({
      file: archivo,
      model: modelo,
      language: "es",
      response_format: "verbose_json",
    });

    const texto = (respuesta?.text || "").trim();
    const duracion =
      typeof respuesta?.duration === "number"
        ? respuesta.duration
        : duracionSegundosHeader;

    const costoUsd = duracion
      ? calcularCostoTranscripcion(duracion, modelo)
      : 0;

    return {
      texto,
      duracionSegundos: duracion,
      costoUsd,
    };
  } catch (err: any) {
    if (err?.status === 503) {
      throw err;
    }
    const mensaje = err?.message || String(err);
    const detalle = sanitizarMensaje(mensaje, config.OPENAI_API_KEY);
    const errorLimpio: any = new Error(
      `Error al transcribir el audio: ${detalle}`,
    );
    errorLimpio.status = err?.status || 500;
    throw errorLimpio;
  }
}
