import Anthropic from "@anthropic-ai/sdk";
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
 * Proveedor oficial para Claude utilizando el SDK oficial (@anthropic-ai/sdk)
 * con soporte para prompt caching, tool calling, esfuerzo bajo y costos de Haiku 5.5.
 */
export class ProveedorClaude implements ProveedorModelo {
  private apiKey: string;
  private modelo: string;
  private cliente?: Anthropic;

  constructor(opciones?: {
    apiKey?: string;
    modelo?: string;
    cliente?: Anthropic;
  }) {
    this.apiKey = opciones?.apiKey || config.ANTHROPIC_API_KEY || "";
    this.modelo =
      opciones?.modelo || config.ANTHROPIC_MODELO || "claude-haiku-5-5";

    if (opciones?.cliente) {
      this.cliente = opciones.cliente;
    } else if (this.apiKey) {
      this.cliente = new Anthropic({
        apiKey: this.apiKey,
        timeout: 30_000,
        maxRetries: 2,
      });
    }
  }

  private obtenerCliente(): Anthropic {
    if (this.cliente) {
      return this.cliente;
    }

    if (!this.apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY no está configurada. Configure la clave o utilice ASISTENTE_MODELO=falso.",
      );
    }

    this.cliente = new Anthropic({
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
        "ANTHROPIC_API_KEY no está configurada. Configure la clave o utilice ASISTENTE_MODELO=falso.",
      );
    }

    const cliente = this.obtenerCliente();

    // 1. Armar secuencia de mensajes (historial previo + ítems intermedios del turno)
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of entrada.mensajes) {
      messages.push({
        role: msg.rol === "usuario" ? "user" : "assistant",
        content: msg.contenido,
      });
    }

    if (entrada.itemsTurno && entrada.itemsTurno.length > 0) {
      let pendingToolOutputs: Anthropic.ToolResultBlockParam[] = [];

      const flushToolOutputs = () => {
        if (pendingToolOutputs.length > 0) {
          messages.push({
            role: "user",
            content: pendingToolOutputs,
          });
          pendingToolOutputs = [];
        }
      };

      for (const item of entrada.itemsTurno) {
        if (
          item.type === "message" &&
          item.role === "assistant" &&
          item.contenidoCrudo
        ) {
          flushToolOutputs();
          messages.push({
            role: "assistant",
            content: item.contenidoCrudo as any,
          });
        } else if (item.type === "function_call_output") {
          pendingToolOutputs.push({
            type: "tool_result",
            tool_use_id: item.call_id || "",
            content: item.output ?? "",
          });
        }
      }

      flushToolOutputs();
    }

    if (messages.length === 0) {
      messages.push({
        role: "user",
        content: "Hola",
      });
    }

    // 2. Mapear herramientas al formato esperado por Claude ({ name, description, input_schema })
    const toolsPayload: Anthropic.Tool[] = entrada.herramientas.map((h) => ({
      name: h.nombre,
      description: h.descripcion,
      input_schema: {
        type: "object" as const,
        properties: h.parametros?.properties || {},
        ...(h.parametros?.required ? { required: h.parametros.required } : {}),
        ...(h.parametros?.additionalProperties !== undefined
          ? { additionalProperties: h.parametros.additionalProperties }
          : {}),
      },
    }));

    // 3. Estructura del cuerpo de la petición con prompt caching en system
    const systemPayload: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: PROMPT_CHIMUELO_LOCAL,
        cache_control: { type: "ephemeral" },
      },
    ];

    const bodyPayload: Anthropic.MessageCreateParams = {
      model: this.modelo,
      max_tokens: 4096,
      messages,
      system: systemPayload,
      output_config: { effort: "low" },
      ...(toolsPayload.length > 0 ? { tools: toolsPayload } : {}),
    };

    // 4. Llamada al SDK oficial de Anthropic
    let data: Anthropic.Message;
    try {
      data = await cliente.messages.create(bodyPayload);
    } catch (error: any) {
      if (error instanceof Anthropic.RateLimitError) {
        const detalle = sanitizarMensaje(error.message, this.apiKey);
        throw new Error(
          `Límite de tasa excedido en Anthropic API: ${detalle}`,
        );
      }
      if (error instanceof Anthropic.APIError) {
        const detalle = sanitizarMensaje(error.message, this.apiKey);
        throw new Error(
          `Error en Anthropic API (${error.status ?? "desconocido"}): ${detalle}`,
        );
      }
      const detalle = sanitizarMensaje(
        error instanceof Error ? error.message : String(error),
        this.apiKey,
      );
      throw new Error(`Error al comunicarse con Anthropic: ${detalle}`);
    }

    // 5. Tokens y cálculo de costos (Claude Haiku 5.5: input $0.10, cache_read $0.01, cache_creation $0.125, salida $0.50 por 1M)
    const inputTokens = Number(data.usage?.input_tokens ?? 0);
    const cacheReadTokens = Number(data.usage?.cache_read_input_tokens ?? 0);
    const cacheCreationTokens = Number(
      data.usage?.cache_creation_input_tokens ?? 0,
    );
    const tokensEntrada = inputTokens + cacheReadTokens + cacheCreationTokens;
    const tokensSalida = Number(data.usage?.output_tokens ?? 0);
    const costoUsd = Number(
      (
        (inputTokens * 0.10 +
          cacheReadTokens * 0.01 +
          cacheCreationTokens * 0.125 +
          tokensSalida * 0.50) /
        1_000_000
      ).toFixed(6),
    );

    // 6. Revisar stop_reason: "refusal" y "max_tokens"
    if (data.stop_reason === "refusal") {
      return {
        texto: "Disculpá, no puedo ayudarte con ese pedido.",
        tokensEntrada,
        tokensSalida,
        costoUsd,
        modelo: this.modelo,
        promptVersion: "local",
      };
    }

    if (data.stop_reason === "max_tokens") {
      throw new Error(
        "La respuesta superó el límite de tokens permitido (max_tokens).",
      );
    }

    // 7. Procesar bloques de salida (tool_use y text)
    const llamadasHerramientas: LlamadaHerramientaModelo[] = [];
    const partesTexto: string[] = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === "tool_use") {
          let argsObj: Record<string, any> = {};
          if (typeof block.input === "object" && block.input !== null) {
            argsObj = block.input as Record<string, any>;
          } else if (typeof block.input === "string") {
            try {
              argsObj = JSON.parse(block.input);
            } catch {
              argsObj = {};
            }
          }
          llamadasHerramientas.push({
            id: block.id,
            nombre: block.name,
            argumentos: argsObj,
          });
        } else if (block.type === "text") {
          if (typeof block.text === "string" && block.text.trim().length > 0) {
            partesTexto.push(block.text);
          }
        }
      }
    }

    return {
      texto: partesTexto.length > 0 ? partesTexto.join("\n") : undefined,
      llamadasHerramientas:
        llamadasHerramientas.length > 0 ? llamadasHerramientas : undefined,
      tokensEntrada,
      tokensSalida,
      costoUsd,
      modelo: this.modelo,
      promptVersion: "local",
      contenidoCrudo: data.content,
    };
  }
}
