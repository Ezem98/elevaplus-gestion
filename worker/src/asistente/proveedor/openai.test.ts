import { beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { ProveedorOpenAI } from "./openai";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "APIError";
    }
  }

  const MockOpenAI = vi.fn().mockImplementation(function (options: any) {
    return {
      responses: {
        create: mockCreate,
      },
      options,
    };
  });

  (MockOpenAI as any).APIError = MockAPIError;

  return {
    default: MockOpenAI,
    APIError: MockAPIError,
  };
});

describe("ProveedorOpenAI (Responses API con SDK oficial)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza error descriptivo si no hay OPENAI_API_KEY configurada", async () => {
    const proveedor = new ProveedorOpenAI({ apiKey: "" });

    await expect(
      proveedor.generarRespuesta({
        mensajes: [{ id: "1", rol: "usuario", contenido: "Hola" }],
        herramientas: [],
      }),
    ).rejects.toThrow("OPENAI_API_KEY no está configurada");
  });

  it("mapea correctamente una respuesta con function_call y calcula costos", async () => {
    mockCreate.mockResolvedValueOnce({
      output: [
        {
          type: "function_call",
          call_id: "call_abc123",
          name: "resolver_fecha",
          arguments: JSON.stringify({ texto: "mañana" }),
        },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
      },
    });

    const proveedor = new ProveedorOpenAI({
      apiKey: "test-sk-key",
      modelo: "gpt-5.6-luna",
    });

    const resultado = await proveedor.generarRespuesta({
      mensajes: [
        { id: "1", rol: "usuario", contenido: "¿Qué fecha es mañana?" },
      ],
      herramientas: [
        {
          nombre: "resolver_fecha",
          descripcion: "Resuelve una fecha relativa",
          parametros: {
            type: "object",
            properties: { texto: { type: "string" } },
            required: ["texto"],
          },
          ejecutar: vi.fn(),
        },
      ],
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const paramsLlamada = mockCreate.mock.calls[0][0];

    // Verificar mapeo del payload de entrada
    expect(paramsLlamada.model).toBe("gpt-5.6-luna");
    expect(paramsLlamada.input).toEqual([
      {
        type: "message",
        role: "user",
        content: "¿Qué fecha es mañana?",
      },
    ]);
    expect(paramsLlamada.tools).toEqual([
      {
        type: "function",
        name: "resolver_fecha",
        description: "Resuelve una fecha relativa",
        parameters: {
          type: "object",
          properties: { texto: { type: "string" } },
          required: ["texto"],
        },
      },
    ]);

    // Verificar mapeo de la respuesta
    expect(resultado.texto).toBeUndefined();
    expect(resultado.llamadasHerramientas).toHaveLength(1);
    expect(resultado.llamadasHerramientas?.[0]).toEqual({
      id: "call_abc123",
      nombre: "resolver_fecha",
      argumentos: { texto: "mañana" },
    });
    expect(resultado.tokensEntrada).toBe(100);
    expect(resultado.tokensSalida).toBe(50);
    // Costo: (100 * 0.20 + 50 * 1.20) / 1_000_000 = (20 + 60) / 1_000_000 = 0.00008
    expect(resultado.costoUsd).toBe(0.00008);
  });

  it("mapea correctamente una respuesta con texto final y tokens compatibles", async () => {
    mockCreate.mockResolvedValueOnce({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "El servicio quedó programado para mañana.",
            },
          ],
        },
      ],
      usage: {
        prompt_tokens: 80,
        completion_tokens: 20,
      },
    });

    const proveedor = new ProveedorOpenAI({
      apiKey: "test-sk-key",
      modelo: "gpt-5.6-luna",
    });

    const resultado = await proveedor.generarRespuesta({
      mensajes: [
        { id: "1", rol: "usuario", contenido: "¿Cuándo es?" },
        { id: "2", rol: "asistente", contenido: "Revisando..." },
      ],
      herramientas: [],
      itemsTurno: [
        {
          type: "function_call",
          call_id: "call_1",
          name: "resolver_fecha",
          arguments: "{}",
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: '{"fecha":"2026-10-10"}',
        },
      ],
    });

    const paramsLlamada = mockCreate.mock.calls[0][0];
    expect(paramsLlamada.input).toEqual([
      { type: "message", role: "user", content: "¿Cuándo es?" },
      { type: "message", role: "assistant", content: "Revisando..." },
      {
        type: "function_call",
        call_id: "call_1",
        name: "resolver_fecha",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: '{"fecha":"2026-10-10"}',
      },
    ]);

    expect(resultado.texto).toBe("El servicio quedó programado para mañana.");
    expect(resultado.llamadasHerramientas).toBeUndefined();
    expect(resultado.tokensEntrada).toBe(80);
    expect(resultado.tokensSalida).toBe(20);
  });

  it("envía prompt versionado cuando promptId y promptVersion están configurados", async () => {
    mockCreate.mockResolvedValueOnce({
      output_text: "Respuesta con prompt versionado",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const proveedor = new ProveedorOpenAI({
      apiKey: "test-sk-key",
      promptId: "pmpt-chimuelo-v1",
      promptVersion: "2.1",
    });

    const resultado = await proveedor.generarRespuesta({
      mensajes: [{ id: "1", rol: "usuario", contenido: "Hola" }],
      herramientas: [],
    });

    const paramsLlamada = mockCreate.mock.calls[0][0];
    expect(paramsLlamada.prompt).toEqual({
      id: "pmpt-chimuelo-v1",
      version: "2.1",
    });
    expect(paramsLlamada.instructions).toBeUndefined();
    expect(resultado.texto).toBe("Respuesta con prompt versionado");
    expect(resultado.promptVersion).toBe("2.1");
  });

  it("sanitiza errores del SDK sin exponer la API key", async () => {
    const errorApi = new (OpenAI as any).APIError(
      401,
      "Invalid authentication for key sk-secreta-123456789",
    );
    mockCreate.mockRejectedValueOnce(errorApi);

    const proveedor = new ProveedorOpenAI({
      apiKey: "sk-secreta-123456789",
    });

    await expect(
      proveedor.generarRespuesta({
        mensajes: [{ id: "1", rol: "usuario", contenido: "Hola" }],
        herramientas: [],
      }),
    ).rejects.toThrowError(
      /Error en OpenAI Responses API \(401\): Invalid authentication for key \[REDACTED_API_KEY\]/,
    );
  });
});
