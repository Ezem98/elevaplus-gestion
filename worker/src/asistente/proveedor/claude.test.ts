import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";
import { ProveedorClaude } from "./claude";
import { ProveedorFalso } from "./falso";
import { obtenerProveedorModelo } from "./index";
import { ProveedorOpenAI } from "./openai";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "APIError";
    }
  }

  class MockRateLimitError extends MockAPIError {
    constructor(status: number, message: string) {
      super(status, message);
      this.name = "RateLimitError";
    }
  }

  const MockAnthropic = vi.fn().mockImplementation(function (options: any) {
    return {
      messages: {
        create: mockCreate,
      },
      options,
    };
  });

  (MockAnthropic as any).APIError = MockAPIError;
  (MockAnthropic as any).RateLimitError = MockRateLimitError;

  return {
    default: MockAnthropic,
    APIError: MockAPIError,
    RateLimitError: MockRateLimitError,
  };
});

// Clave ficticia de baja entropía para evitar falsos positivos de gitleaks
const CLAVE_FALSA_TEST = "sk-ant-" + "a".repeat(32);

describe("ProveedorClaude (@anthropic-ai/sdk Messages API)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza error descriptivo si no hay ANTHROPIC_API_KEY configurada", async () => {
    const proveedor = new ProveedorClaude({ apiKey: "" });

    await expect(
      proveedor.generarRespuesta({
        mensajes: [{ id: "1", rol: "usuario", contenido: "Hola" }],
        herramientas: [],
      }),
    ).rejects.toThrow("ANTHROPIC_API_KEY no está configurada");
  });

  it("mapea correctamente las herramientas a { name, description, input_schema }", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_123",
      content: [{ type: "text", text: "Hola, soy Chimuelo." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 20 },
    });

    const proveedor = new ProveedorClaude({
      apiKey: CLAVE_FALSA_TEST,
      modelo: "claude-haiku-5-5",
    });

    await proveedor.generarRespuesta({
      mensajes: [{ id: "1", rol: "usuario", contenido: "Hola" }],
      herramientas: [
        {
          nombre: "resolver_fecha",
          descripcion: "Resuelve una fecha relativa",
          parametros: {
            type: "object",
            properties: { texto: { type: "string" } },
            required: ["texto"],
          },
          roles: ["oficina", "admin"],
          ejecutar: vi.fn(),
        },
      ],
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const paramsLlamada = mockCreate.mock.calls[0][0];

    expect(paramsLlamada.model).toBe("claude-haiku-5-5");
    expect(paramsLlamada.tools).toEqual([
      {
        name: "resolver_fecha",
        description: "Resuelve una fecha relativa",
        input_schema: {
          type: "object",
          properties: { texto: { type: "string" } },
          required: ["texto"],
        },
      },
    ]);
  });

  it("ronda con tool_use → tool_result en un solo mensaje user y contenido del asistente reenviado idéntico (con thinking)", async () => {
    const rawAssistantContent = [
      {
        type: "thinking",
        thinking: "Necesito verificar la fecha de hoy y el saldo de Deza.",
        signature: "sig_abc123",
      },
      {
        type: "tool_use",
        id: "call_fecha_1",
        name: "resolver_fecha",
        input: { texto: "hoy" },
      },
      {
        type: "tool_use",
        id: "call_saldo_2",
        name: "saldo_cliente",
        input: { nombre: "Deza Test" },
      },
    ];

    // Ronda 1: modelo devuelve tool_use con thinking
    mockCreate.mockResolvedValueOnce({
      id: "msg_round1",
      content: rawAssistantContent,
      stop_reason: "tool_use",
      usage: { input_tokens: 80, output_tokens: 40 },
    });

    const proveedor = new ProveedorClaude({
      apiKey: CLAVE_FALSA_TEST,
    });

    const respuesta1 = await proveedor.generarRespuesta({
      mensajes: [
        {
          id: "1",
          rol: "usuario",
          contenido: "¿Cuánto debe Deza y qué día es hoy?",
        },
      ],
      herramientas: [],
    });

    expect(respuesta1.llamadasHerramientas).toHaveLength(2);
    expect(respuesta1.contenidoCrudo).toEqual(rawAssistantContent);

    // Ronda 2: simulamos la siguiente vuelta enviando itemsTurno con el contenido crudo y los tool_results
    mockCreate.mockResolvedValueOnce({
      id: "msg_round2",
      content: [
        {
          type: "text",
          text: "Hoy es 14 de octubre y Deza debe $ 500.000.",
        },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 150, output_tokens: 30 },
    });

    const respuesta2 = await proveedor.generarRespuesta({
      mensajes: [
        {
          id: "1",
          rol: "usuario",
          contenido: "¿Cuánto debe Deza y qué día es hoy?",
        },
      ],
      herramientas: [],
      itemsTurno: [
        {
          type: "message",
          role: "assistant",
          contenidoCrudo: respuesta1.contenidoCrudo,
        },
        {
          type: "function_call",
          call_id: "call_fecha_1",
          name: "resolver_fecha",
          arguments: JSON.stringify({ texto: "hoy" }),
        },
        {
          type: "function_call_output",
          call_id: "call_fecha_1",
          output: JSON.stringify({ fecha: "2026-10-14" }),
        },
        {
          type: "function_call",
          call_id: "call_saldo_2",
          name: "saldo_cliente",
          arguments: JSON.stringify({ nombre: "Deza Test" }),
        },
        {
          type: "function_call_output",
          call_id: "call_saldo_2",
          output: JSON.stringify({ saldo: 500000 }),
        },
      ],
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    const paramsSegundaLlamada = mockCreate.mock.calls[1][0];

    // Verificar que messages tenga:
    // 1. Mensaje de usuario inicial
    // 2. Mensaje asistente con el contenido crudo idéntico (incluyendo thinking)
    // 3. UN ÚNICO mensaje user con TODOS los tool_result de esa ronda
    expect(paramsSegundaLlamada.messages).toHaveLength(3);

    expect(paramsSegundaLlamada.messages[0]).toEqual({
      role: "user",
      content: "¿Cuánto debe Deza y qué día es hoy?",
    });

    expect(paramsSegundaLlamada.messages[1]).toEqual({
      role: "assistant",
      content: rawAssistantContent,
    });

    expect(paramsSegundaLlamada.messages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "call_fecha_1",
          content: '{"fecha":"2026-10-14"}',
        },
        {
          type: "tool_result",
          tool_use_id: "call_saldo_2",
          content: '{"saldo":500000}',
        },
      ],
    });

    expect(respuesta2.texto).toBe("Hoy es 14 de octubre y Deza debe $ 500.000.");
  });

  it("maneja stop_reason refusal con texto amable de que no puede ayudar con eso", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_refusal",
      content: [],
      stop_reason: "refusal",
      usage: { input_tokens: 40, output_tokens: 10 },
    });

    const proveedor = new ProveedorClaude({
      apiKey: CLAVE_FALSA_TEST,
    });

    const resultado = await proveedor.generarRespuesta({
      mensajes: [{ id: "1", rol: "usuario", contenido: "Hacé algo prohibido" }],
      herramientas: [],
    });

    expect(resultado.texto).toBe("Disculpá, no puedo ayudarte con ese pedido.");
    expect(resultado.tokensEntrada).toBe(40);
    expect(resultado.tokensSalida).toBe(10);
  });

  it("maneja stop_reason max_tokens con error manejado", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_max_tokens",
      content: [{ type: "text", text: "Respuesta truncada..." }],
      stop_reason: "max_tokens",
      usage: { input_tokens: 50, output_tokens: 4096 },
    });

    const proveedor = new ProveedorClaude({
      apiKey: CLAVE_FALSA_TEST,
    });

    await expect(
      proveedor.generarRespuesta({
        mensajes: [{ id: "1", rol: "usuario", contenido: "Escribí un texto muy largo" }],
        herramientas: [],
      }),
    ).rejects.toThrow("La respuesta superó el límite de tokens permitido (max_tokens).");
  });

  it("calcula correctamente el costo con input_tokens, cache_read_input_tokens, cache_creation_input_tokens y output_tokens", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_costo",
      content: [{ type: "text", text: "Respuesta con cache" }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 1000,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 200,
        output_tokens: 400,
      },
    });

    const proveedor = new ProveedorClaude({
      apiKey: CLAVE_FALSA_TEST,
    });

    const resultado = await proveedor.generarRespuesta({
      mensajes: [{ id: "1", rol: "usuario", contenido: "¿Cómo estás?" }],
      herramientas: [],
    });

    // tokensEntrada = 1000 + 500 + 200 = 1700
    expect(resultado.tokensEntrada).toBe(1700);
    expect(resultado.tokensSalida).toBe(400);

    // Costo esperado:
    // (1000 * 0.10 + 500 * 0.01 + 200 * 0.125 + 400 * 0.50) / 1_000_000
    // = (100 + 5 + 25 + 200) / 1_000_000 = 330 / 1_000_000 = 0.00033
    expect(resultado.costoUsd).toBe(0.00033);
  });

  it("no envía temperature, top_p, thinking, ni tool_choice any/tool, e incluye prompt caching y output_config effort low", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_params",
      content: [{ type: "text", text: "OK" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const proveedor = new ProveedorClaude({
      apiKey: CLAVE_FALSA_TEST,
      modelo: "claude-haiku-5-5",
    });

    await proveedor.generarRespuesta({
      mensajes: [{ id: "1", rol: "usuario", contenido: "Hola" }],
      herramientas: [],
    });

    const paramsLlamada = mockCreate.mock.calls[0][0];

    // Parámetros obligatorios
    expect(paramsLlamada.max_tokens).toBe(4096);
    expect(paramsLlamada.output_config).toEqual({ effort: "low" });
    expect(paramsLlamada.system).toEqual([
      {
        type: "text",
        text: expect.any(String),
        cache_control: { type: "ephemeral" },
      },
    ]);

    // Parámetros prohibidos o adaptativos
    expect(paramsLlamada.temperature).toBeUndefined();
    expect(paramsLlamada.top_p).toBeUndefined();
    expect(paramsLlamada.thinking).toBeUndefined();
    expect(paramsLlamada.tool_choice?.type).not.toBe("any");
    expect(paramsLlamada.tool_choice?.type).not.toBe("tool");
  });

  it("sanitiza errores del SDK de Anthropic sin exponer la API key", async () => {
    const errorApi = new (Anthropic as any).APIError(
      401,
      `Invalid authentication for key ${CLAVE_FALSA_TEST}`,
    );
    mockCreate.mockRejectedValueOnce(errorApi);

    const proveedor = new ProveedorClaude({
      apiKey: CLAVE_FALSA_TEST,
    });

    await expect(
      proveedor.generarRespuesta({
        mensajes: [{ id: "1", rol: "usuario", contenido: "Hola" }],
        herramientas: [],
      }),
    ).rejects.toThrowError(
      /Error en Anthropic API \(401\): Invalid authentication for key \[REDACTED_API_KEY\]/,
    );
  });

  it("maneja RateLimitError con mensaje específico de límite de tasa", async () => {
    const errorRateLimit = new (Anthropic as any).RateLimitError(
      429,
      "Too many requests",
    );
    mockCreate.mockRejectedValueOnce(errorRateLimit);

    const proveedor = new ProveedorClaude({
      apiKey: CLAVE_FALSA_TEST,
    });

    await expect(
      proveedor.generarRespuesta({
        mensajes: [{ id: "1", rol: "usuario", contenido: "Hola" }],
        herramientas: [],
      }),
    ).rejects.toThrowError(
      /Límite de tasa excedido en Anthropic API: Too many requests/,
    );
  });

  it("obtenerProveedorModelo() devuelve ProveedorClaude cuando ASISTENTE_MODELO=claude, y preserva falso y openai", () => {
    const original = config.ASISTENTE_MODELO;
    try {
      (config as any).ASISTENTE_MODELO = "claude";
      expect(obtenerProveedorModelo()).toBeInstanceOf(ProveedorClaude);

      (config as any).ASISTENTE_MODELO = "falso";
      expect(obtenerProveedorModelo()).toBeInstanceOf(ProveedorFalso);

      (config as any).ASISTENTE_MODELO = "openai";
      expect(obtenerProveedorModelo()).toBeInstanceOf(ProveedorOpenAI);
    } finally {
      (config as any).ASISTENTE_MODELO = original;
    }
  });
});
