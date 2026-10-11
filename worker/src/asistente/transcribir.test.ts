import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import {
  calcularCostoTranscripcion,
  esTipoAudioPermitido,
  transcribirAudio,
} from "./transcribir";

describe("Módulo transcribirAudio y utilidades", () => {
  const modeloOriginal = config.ASISTENTE_MODELO;
  const apiKeyOriginal = config.OPENAI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    config.ASISTENTE_MODELO = modeloOriginal;
    config.OPENAI_API_KEY = apiKeyOriginal;
  });

  describe("esTipoAudioPermitido", () => {
    it("acepta los tipos MIME permitidos con o sin parámetros", () => {
      expect(esTipoAudioPermitido("audio/webm")).toBe(true);
      expect(esTipoAudioPermitido("audio/webm;codecs=opus")).toBe(true);
      expect(esTipoAudioPermitido("audio/mp4")).toBe(true);
      expect(esTipoAudioPermitido("audio/mpeg")).toBe(true);
      expect(esTipoAudioPermitido("audio/ogg")).toBe(true);
      expect(esTipoAudioPermitido("audio/wav")).toBe(true);
    });

    it("rechaza tipos no permitidos o faltantes", () => {
      expect(esTipoAudioPermitido(undefined)).toBe(false);
      expect(esTipoAudioPermitido("")).toBe(false);
      expect(esTipoAudioPermitido("text/plain")).toBe(false);
      expect(esTipoAudioPermitido("application/json")).toBe(false);
      expect(esTipoAudioPermitido("audio/flac")).toBe(false);
    });
  });

  describe("calcularCostoTranscripcion", () => {
    it("retorna 0 para duraciones nulas o negativas", () => {
      expect(calcularCostoTranscripcion(0)).toBe(0);
      expect(calcularCostoTranscripcion(-10)).toBe(0);
    });

    it("calcula el costo para gpt-4o-mini-transcribe ($0.003/min = $0.00005/s)", () => {
      // 60 segundos -> $0.003
      expect(calcularCostoTranscripcion(60, "gpt-4o-mini-transcribe")).toBe(
        0.003,
      );
      // 30 segundos -> $0.0015
      expect(calcularCostoTranscripcion(30, "gpt-4o-mini-transcribe")).toBe(
        0.0015,
      );
    });

    it("calcula el costo para whisper-1 ($0.006/min = $0.0001/s)", () => {
      // 60 segundos -> $0.006
      expect(calcularCostoTranscripcion(60, "whisper-1")).toBe(0.006);
    });
  });

  describe("Proveedor falso (ASISTENTE_MODELO=falso)", () => {
    beforeEach(() => {
      config.ASISTENTE_MODELO = "falso";
    });

    it("retorna texto por defecto 'cargame un traslado para mañana' sin llamar a red", async () => {
      const res = await transcribirAudio({
        buffer: Buffer.from("audio-mock"),
        mimetype: "audio/webm",
      });

      expect(res.texto).toBe("cargame un traslado para mañana");
      expect(res.duracionSegundos).toBe(5);
    });

    it("retorna el texto del header X-Transcripcion-Falsa si está presente", async () => {
      const res = await transcribirAudio({
        buffer: Buffer.from("audio-mock"),
        mimetype: "audio/webm",
        headerTranscripcionFalsa: "¿cuánto me debe Deza?",
        duracionSegundosHeader: 12,
      });

      expect(res.texto).toBe("¿cuánto me debe Deza?");
      expect(res.duracionSegundos).toBe(12);
    });
  });

  describe("Proveedor real / Mock de OpenAI (ASISTENTE_MODELO=openai)", () => {
    beforeEach(() => {
      config.ASISTENTE_MODELO = "openai";
    });

    it("lanza error 503 claro si no hay OPENAI_API_KEY", async () => {
      config.OPENAI_API_KEY = "";

      await expect(
        transcribirAudio({
          buffer: Buffer.from("audio-mock"),
          mimetype: "audio/webm",
        }),
      ).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("OPENAI_API_KEY no configurada"),
      });
    });

    it("el SDK de transcripción se llama con language 'es' y el modelo configurado", async () => {
      config.OPENAI_API_KEY = "sk-test-key-123";

      const mockCreate = vi.fn().mockResolvedValue({
        text: "Hola Chimuelo traslado para el viernes",
        duration: 45.5,
      });

      const mockClienteOpenAI = {
        audio: {
          transcriptions: {
            create: mockCreate,
          },
        },
      } as any;

      const bufferEntrada = Buffer.from("datos-binarios-de-audio");
      const res = await transcribirAudio({
        buffer: bufferEntrada,
        mimetype: "audio/webm",
        clienteOpenAI: mockClienteOpenAI,
      });

      expect(mockCreate).toHaveBeenCalledOnce();
      const callArgs = mockCreate.mock.calls[0][0];

      // Verificación de idioma español obligatorio
      expect(callArgs.language).toBe("es");
      expect(callArgs.model).toBe("gpt-4o-mini-transcribe");
      expect(callArgs.response_format).toBe("verbose_json");
      expect(callArgs.file).toBeDefined();

      expect(res.texto).toBe("Hola Chimuelo traslado para el viernes");
      expect(res.duracionSegundos).toBe(45.5);
      expect(res.costoUsd).toBeGreaterThan(0);
    });
  });
});
