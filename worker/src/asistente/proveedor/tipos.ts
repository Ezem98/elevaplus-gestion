import type { HerramientaAsistente, MensajeHistorial } from "../tipos";

export interface LlamadaHerramientaModelo {
  id: string; // call_id
  nombre: string;
  argumentos: Record<string, any>;
}

export interface RespuestaModelo {
  texto?: string;
  llamadasHerramientas?: LlamadaHerramientaModelo[];
  tokensEntrada?: number;
  tokensSalida?: number;
  costoUsd?: number;
  modelo?: string;
  promptVersion?: string;
}

export interface ItemContextoTurno {
  type: "message" | "function_call" | "function_call_output";
  role?: "user" | "assistant" | "system";
  content?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
}

export interface EntradaGeneracionModelo {
  mensajes: MensajeHistorial[];
  herramientas: HerramientaAsistente[];
  /** Ítems intermedios del turno (llamadas a herramientas y sus salidas) */
  itemsTurno?: ItemContextoTurno[];
}

export interface ProveedorModelo {
  generarRespuesta(entrada: EntradaGeneracionModelo): Promise<RespuestaModelo>;
}
