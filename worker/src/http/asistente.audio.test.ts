import express from "express";
import type { Server } from "http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as procesarModulo from "../asistente/procesar";
import * as sesionModulo from "../asistente/sesion";
import * as topesModulo from "../asistente/topes";
import * as transcribirModulo from "../asistente/transcribir";
import { config } from "../config";
import { asistenteRouter } from "./asistente";

describe("Endpoint POST /asistente/audio — Tests unitarios de integración HTTP", () => {
  let server: Server;
  let baseUrl: string;

  const insertsRealizados: any[] = [];
  const mensajesGuardados: any[] = [];
  const conversacionesGuardadas: any[] = [];

  const mockInsert = vi.fn((datos: any) => {
    insertsRealizados.push(datos);
    const id = `id-${Date.now()}-${Math.random()}`;
    const registro = { id, ...datos };
    if (datos.rol) {
      mensajesGuardados.push(registro);
    } else {
      conversacionesGuardadas.push(registro);
    }
    return {
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: registro,
          error: null,
        }),
      })),
    };
  });

  const mockSelect = vi.fn((_campos: string) => ({
    eq: vi.fn((_col: string, val: string) => ({
      order: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({
          data: [...mensajesGuardados.filter((m) => m.conversacion_id === val)],
          error: null,
        }),
      })),
      maybeSingle: vi.fn().mockResolvedValue({
        data:
          conversacionesGuardadas.find((c) => c.id === val) || { id: val },
        error: null,
      }),
    })),
  }));

  const mockSupabase = {
    from: vi.fn((_tabla: string) => ({
      insert: mockInsert,
      select: mockSelect,
    })),
  };

  beforeAll(async () => {
    const app = express();
    app.use("/asistente", asistenteRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}/asistente/audio`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    insertsRealizados.length = 0;
    mensajesGuardados.length = 0;
    conversacionesGuardadas.length = 0;
    config.ASISTENTE_MODELO = "falso";

    // Sesión admin por defecto para los tests
    vi.spyOn(sesionModulo, "validarSesionAsistente").mockResolvedValue({
      usuarioId: "usr-admin-1",
      email: "admin@elevaplus.com.ar",
      rol: "admin",
      cliente: mockSupabase as any,
      token: "tok-valido",
    });

    vi.spyOn(topesModulo, "verificarTopes").mockResolvedValue({
      superado: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. tipo no permitido → 415", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-valido",
        "content-type": "text/plain",
      },
      body: "audio en texto plano",
    });

    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toContain("Formato de audio no soportado");
  });

  it("2. vacío → 400", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-valido",
        "content-type": "audio/webm",
      },
      body: Buffer.alloc(0),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("vacío");
  });

  it("3. >5 MB → 413", async () => {
    // Generar buffer de 5.2 MB
    const bufferGrande = Buffer.alloc(5.2 * 1024 * 1024, 0xaa);

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-valido",
        "content-type": "audio/webm",
      },
      body: bufferGrande,
    });

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain("supera el límite");
  });

  it("4a. >120 s por header X-Duracion-Segundos → 400 'El audio puede durar hasta 2 minutos.'", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-valido",
        "content-type": "audio/webm",
        "x-duracion-segundos": "125",
      },
      body: Buffer.from("audio-dummy"),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("El audio puede durar hasta 2 minutos.");
  });

  it("4b. >120 s devuelto por la transcripción → 400 'El audio puede durar hasta 2 minutos.'", async () => {
    vi.spyOn(transcribirModulo, "transcribirAudio").mockResolvedValue({
      texto: "Un audio largo transcripto",
      duracionSegundos: 135,
    });

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-valido",
        "content-type": "audio/webm",
      },
      body: Buffer.from("audio-dummy"),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("El audio puede durar hasta 2 minutos.");
  });

  it("5. chofer → 403 con mensaje claro", async () => {
    vi.spyOn(sesionModulo, "validarSesionAsistente").mockRejectedValue(
      Object.assign(
        new Error(
          "Acceso denegado: el asistente no está disponible para choferes en esta versión.",
        ),
        { status: 403 },
      ),
    );

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-chofer",
        "content-type": "audio/webm",
      },
      body: Buffer.from("audio-dummy"),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("no está disponible para choferes");
  });

  it("6. con el proveedor falso devuelve la transcripción y la respuesta del asistente y guarda fue_audio=true", async () => {
    config.ASISTENTE_MODELO = "falso";

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-valido",
        "content-type": "audio/webm",
        "x-transcripcion-falsa": "Cargame un traslado para mañana",
        "x-duracion-segundos": "15",
      },
      body: Buffer.from("audio-simulado"),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    // 1. Debe devolver conversacion_id y transcripción
    expect(data.conversacion_id).toBeDefined();
    expect(data.transcripcion).toBe("Cargame un traslado para mañana");

    // 2. Respuesta de Chimuelo (proveedor falso ante traslado pide chofer y modalidad)
    expect(data.mensaje_asistente).toBeDefined();
    expect(data.mensaje_asistente.contenido).toContain(
      "¿Lo hace Mauro o Federico? ¿Y es ida y vuelta?",
    );

    // 3. El mensaje del usuario guardado debe tener fue_audio = true y audio_segundos
    expect(data.mensaje_usuario).toBeDefined();
    expect(data.mensaje_usuario.contenido).toBe(
      "Cargame un traslado para mañana",
    );
    expect(data.mensaje_usuario.fue_audio).toBe(true);
    expect(data.mensaje_usuario.audio_segundos).toBe(15);

    // 4. Verificar que se haya insertado en asistente_mensajes con fue_audio = true
    const insertUsuario = insertsRealizados.find(
      (ins) => ins.rol === "usuario",
    );
    expect(insertUsuario).toBeDefined();
    expect(insertUsuario.fue_audio).toBe(true);
    expect(insertUsuario.audio_segundos).toBe(15);
  });

  it("7. el SDK de transcripción se llama con language 'es' (mock de openai)", async () => {
    config.ASISTENTE_MODELO = "openai";
    config.OPENAI_API_KEY = "sk-test-key";

    const mockCreate = vi.fn().mockResolvedValue({
      text: "cargame un traslado para mañana",
      duration: 10,
    });

    const mockOpenAIInstance = {
      audio: {
        transcriptions: {
          create: mockCreate,
        },
      },
    };

    // Mockear procesarTurno para aislar la prueba de transcripción y evitar llamadas a Responses API
    vi.spyOn(procesarModulo, "procesarTurno").mockResolvedValue({
      conversacion_id: "conv-test-7",
      mensaje_usuario: {
        id: "msg-u-7",
        rol: "usuario",
        contenido: "cargame un traslado para mañana",
        fue_audio: true,
        audio_segundos: 10,
      },
      mensaje_asistente: {
        id: "msg-a-7",
        rol: "asistente",
        contenido: "Entendido, ya lo reviso.",
      },
    });

    // Usar la función original de transcribirAudio inyectando mockOpenAIInstance
    const funcionOriginalTranscribir = transcribirModulo.transcribirAudio;
    vi.spyOn(transcribirModulo, "transcribirAudio").mockImplementation(
      async (params) => {
        return funcionOriginalTranscribir({
          ...params,
          clienteOpenAI: mockOpenAIInstance as any,
        });
      },
    );

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-valido",
        "content-type": "audio/webm",
      },
      body: Buffer.from("audio-mock"),
    });

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.language).toBe("es");
  });

  it("8. el audio no se persiste (ningún insert recibe el buffer)", async () => {
    config.ASISTENTE_MODELO = "falso";
    const audioBuffer = Buffer.from("datos-binarios-secretos-del-audio");

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-valido",
        "content-type": "audio/webm",
      },
      body: audioBuffer,
    });

    expect(res.status).toBe(200);

    // Verificar todas las llamadas a mockInsert
    expect(insertsRealizados.length).toBeGreaterThan(0);
    for (const insert of insertsRealizados) {
      // El objeto insertado no debe ser un Buffer
      expect(Buffer.isBuffer(insert)).toBe(false);

      // Ninguna propiedad del objeto debe contener el Buffer o referencias a él
      for (const [clave, valor] of Object.entries(insert)) {
        expect(Buffer.isBuffer(valor)).toBe(false);
        expect(valor).not.toEqual(audioBuffer);
        expect(clave).not.toBe("audio");
        expect(clave).not.toBe("buffer");
      }
    }
  });

  it("valida que conversacion_id en query string sea un UUID válido", async () => {
    const res = await fetch(`${baseUrl}?conversacion_id=invalido-no-uuid`, {
      method: "POST",
      headers: {
        authorization: "Bearer tok-valido",
        "content-type": "audio/webm",
      },
      body: Buffer.from("audio-mock"),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("UUID válido");
  });
});
