import OpenAI from "openai";
import { config } from "../../config";
import { PROMPT_CHIMUELO_LOCAL } from "../prompt";
import type {
  EntradaGeneracionModelo,
  LlamadaHerramientaModelo,
  ProveedorModelo,
  RespuestaModelo,
} from "./tipos";

function sanitizarMensaje(mensaje: string, apiKey?: string): string {
  if (!apiKey || apiKey.length === 0) return mensaje;
  return mensaje.split(apiKey).join("[REDACTED_API_KEY]");
}

/**
 * Proveedor oficial para OpenAI utilizando el SDK oficial y la Responses API
 * (client.responses.create), con soporte para tool calling y prompts versionados.
 */
export class ProveedorOpenAI implements ProveedorModelo {
  private apiKey: string;
  private modelo: string;
  private promptId?: string;
  private promptVersion?: string;
  private cliente?: OpenAI;

  constructor(opciones?: {
    apiKey?: string;
    modelo?: string;
    promptId?: string;
    promptVersion?: string;
    cliente?: OpenAI;
  }) {
    this.apiKey = opciones?.apiKey || config.OPENAI_API_KEY || "";
    this.modelo = opciones?.modelo || config.OPENAI_MODELO || "gpt-5.6-luna";
    this.promptId = opciones?.promptId || config.OPENAI_PROMPT_ID;
    this.promptVersion = opciones?.promptVersion || config.OPENAI_PROMPT_VERSION;

    if (opciones?.cliente) {
      this.cliente = opciones.cliente;
    } else if (this.apiKey) {
      this.cliente = new OpenAI({
        apiKey: this.apiKey,
        timeout: 30_000,
        maxRetries: 2,
      });
    }
  }

  private obtenerCliente(): OpenAI {
    if (this.cliente) {
      return this.cliente;
    }

    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY no está configurada. Configure la clave o utilice ASISTENTE_MODELO=falso.",
      );
    }

    this.cliente = new OpenAI({
      apiKey: this.apiKey,
      timeout: 30_000,
      maxRetries: 2,
    });
    return this.cliente;
  }

  async generarRespuesta(
    entrada: EntradaGeneracionModelo,
  ): Promise<RespuestaModelo> {
    if (!this.apiKey && !this.cliente) {
      throw new Error(
        "OPENAI_API_KEY no está configurada. Configure la clave o utilice ASISTENTE_MODELO=falso.",
      );
    }

    const cliente = this.obtenerCliente();

    // 1. Armar la secuencia de entrada (historial + ítems intermedios del turno)
    const inputItems: any[] = [];

    for (const msg of entrada.mensajes) {
      inputItems.push({
        type: "message",
        role: msg.rol === "usuario" ? "user" : "assistant",
        content: msg.contenido,
      });
    }

    if (entrada.itemsTurno && entrada.itemsTurno.length > 0) {
      for (const item of entrada.itemsTurno) {
        if (item.type === "function_call") {
          inputItems.push({
            type: "function_call",
            call_id: item.call_id,
            name: item.name,
            arguments: item.arguments,
          });
        } else if (item.type === "function_call_output") {
          inputItems.push({
            type: "function_call_output",
            call_id: item.call_id,
            output: item.output,
          });
        } else if (item.type === "message") {
          inputItems.push({
            type: "message",
            role: item.role || "assistant",
            content: item.content,
          });
        }
      }
    }

    // 2. Mapear herramientas al formato esperado por la Responses API
    const toolsPayload = entrada.herramientas.map((h) => ({
      type: "function" as const,
      name: h.nombre,
      description: h.descripcion,
      parameters: h.parametros,
    }));

    // 3. Estructura del cuerpo de la petición
    const bodyPayload: any = {
      model: this.modelo,
      input: inputItems,
      tools: toolsPayload,
    };

    if (this.promptId) {
      bodyPayload.prompt = {
        id: this.promptId,
        ...(this.promptVersion ? { version: this.promptVersion } : {}),
      };
    } else {
      bodyPayload.instructions = PROMPT_CHIMUELO_LOCAL;
    }

    // 4. Llamada al SDK oficial con Responses API
    let data: any;
    try {
      data = await cliente.responses.create(bodyPayload);
    } catch (error: any) {
      if (error instanceof OpenAI.APIError) {
        const detalle = sanitizarMensaje(error.message, this.apiKey);
        throw new Error(
          `Error en OpenAI Responses API (${error.status ?? "desconocido"}): ${detalle}`,
        );
      }
      const detalle = sanitizarMensaje(
        error instanceof Error ? error.message : String(error),
        this.apiKey,
      );
      throw new Error(`Error al comunicarse con OpenAI: ${detalle}`);
    }

    // 5. Procesar la salida (output[])
    const llamadasHerramientas: LlamadaHerramientaModelo[] = [];
    const partesTexto: string[] = [];

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === "function_call") {
          let argsObj: Record<string, any> = {};
          try {
            argsObj =
              typeof item.arguments === "string"
                ? JSON.parse(item.arguments)
                : item.arguments || {};
          } catch {
            argsObj = {};
          }
          llamadasHerramientas.push({
            id: item.call_id || item.id || `call_${Date.now()}`,
            nombre: item.name,
            argumentos: argsObj,
          });
        } else if (item.type === "message") {
          if (typeof item.content === "string") {
            partesTexto.push(item.content);
          } else if (Array.isArray(item.content)) {
            for (const parte of item.content) {
              if (
                parte &&
                (parte.type === "output_text" || parte.type === "text")
              ) {
                partesTexto.push(parte.text);
              }
            }
          }
        }
      }
    }

    if (partesTexto.length === 0 && data.output_text) {
      partesTexto.push(data.output_text);
    }

    // 6. Tokens y cálculo de costos (GPT-5.6 Luna: $0.20 / $1.20 por 1M)
    const tokensEntrada = Number(
      data.usage?.input_tokens ?? data.usage?.prompt_tokens ?? 0,
    );
    const tokensSalida = Number(
      data.usage?.output_tokens ?? data.usage?.completion_tokens ?? 0,
    );
    const costoUsd = Number(
      ((tokensEntrada * 0.20 + tokensSalida * 1.20) / 1_000_000).toFixed(6),
    );

    return {
      texto: partesTexto.length > 0 ? partesTexto.join("\n") : undefined,
      llamadasHerramientas:
        llamadasHerramientas.length > 0 ? llamadasHerramientas : undefined,
      tokensEntrada,
      tokensSalida,
      costoUsd,
      modelo: this.modelo,
      promptVersion: this.promptVersion || "local",
    };
  }
}
