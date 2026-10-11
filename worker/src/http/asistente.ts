import express, { Router, type Request, type Response } from "express";
import { z } from "zod";
import { procesarTurno } from "../asistente/procesar";
import { validarSesionAsistente } from "../asistente/sesion";
import { verificarTopes } from "../asistente/topes";
import {
  esTipoAudioPermitido,
  transcribirAudio,
  type ResultadoTranscripcion,
} from "../asistente/transcribir";

export const asistenteRouter = Router();

const parsearAudioCrudo = express.raw({
  type: [
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
  ],
  limit: "5mb",
});

function generarTitulo(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  const palabras = limpio.split(" ").slice(0, 6).join(" ");
  return palabras.slice(0, 60) || "Nueva conversación";
}

/**
 * POST /asistente/mensaje
 *
 * Headers: Authorization: Bearer <JWT del usuario>
 * Body: { conversacion_id?: string, texto: string } (máx. 2000 caracteres)
 *
 * Respuesta: { conversacion_id, mensaje_usuario, mensaje_asistente, propuesta? }
 */
asistenteRouter.post("/mensaje", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Token de autorización faltante o inválido.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  let sesion: any;
  try {
    sesion = await validarSesionAsistente(token);
  } catch (err: any) {
    const status = err?.status || 500;
    res.status(status).json({
      error: err?.message || "Error al validar la sesión del usuario.",
    });
    return;
  }

  const { conversacion_id, texto } = req.body;

  if (typeof texto !== "string" || texto.trim() === "") {
    res.status(400).json({
      error: "El campo 'texto' es obligatorio y debe ser una cadena no vacía.",
    });
    return;
  }

  if (texto.length > 2000) {
    res.status(400).json({
      error: "El mensaje no puede superar los 2000 caracteres.",
    });
    return;
  }

  const textoLimpio = texto.trim();

  try {
    // 1. Control de topes y rate limit
    const resultadoTopes = await verificarTopes(
      sesion.usuarioId,
      sesion.cliente,
    );

    if (resultadoTopes.superado) {
      res.status(200).json({
        conversacion_id: conversacion_id || null,
        mensaje_usuario: {
          rol: "usuario",
          contenido: textoLimpio,
        },
        mensaje_asistente: {
          rol: "asistente",
          contenido:
            resultadoTopes.mensaje || "Por hoy llegué al límite; seguimos mañana",
        },
      });
      return;
    }

    // 2. Resolver o crear la conversación
    let convIdFinal = conversacion_id;

    if (!convIdFinal) {
      const titulo = generarTitulo(textoLimpio);
      const { data: nuevaConv, error: errConv } = await sesion.cliente
        .from("asistente_conversaciones")
        .insert({
          usuario_id: sesion.usuarioId,
          titulo,
        })
        .select()
        .single();

      if (errConv) {
        res.status(500).json({
          error: `Error al crear conversación: ${errConv.message}`,
        });
        return;
      }

      convIdFinal = nuevaConv.id;
    } else {
      // Validar que la conversación exista y sea accesible
      const { data: convExistente, error: errExiste } = await sesion.cliente
        .from("asistente_conversaciones")
        .select("id")
        .eq("id", convIdFinal)
        .maybeSingle();

      if (errExiste) {
        res.status(500).json({
          error: `Error al consultar conversación: ${errExiste.message}`,
        });
        return;
      }

      if (!convExistente) {
        res.status(404).json({
          error: "Conversación no encontrada o sin acceso.",
        });
        return;
      }
    }

    // 3. Procesar el turno con el modelo y sus herramientas
    const resultado = await procesarTurno({
      conversacionId: convIdFinal,
      usuarioId: sesion.usuarioId,
      rol: sesion.rol,
      texto: textoLimpio,
      supabase: sesion.cliente,
    });

    res.status(200).json(resultado);
  } catch (err: any) {
    console.error("[ASISTENTE] Error al procesar mensaje:", err);
    res.status(500).json({
      error: err?.message || "Ocurrió un error al procesar el mensaje con el asistente.",
    });
  }
});

/**
 * POST /asistente/audio
 *
 * Headers:
 * - Authorization: Bearer <JWT del usuario>
 * - Content-Type: audio/webm | audio/mp4 | audio/mpeg | audio/ogg | audio/wav (máx. 5 MB)
 * - X-Duracion-Segundos: opcional (duración según el navegador; máx. 120 s)
 * - X-Transcripcion-Falsa: opcional (solo con ASISTENTE_MODELO=falso)
 *
 * Query params:
 * - conversacion_id: opcional (UUID)
 *
 * Body: binario crudo del audio
 *
 * Respuesta: { conversacion_id, transcripcion, mensaje_usuario, mensaje_asistente, propuesta? }
 */
asistenteRouter.post(
  "/audio",
  (req: Request, res: Response, next) => {
    const contentType = req.headers["content-type"];
    if (!contentType || !esTipoAudioPermitido(contentType)) {
      res.status(415).json({
        error:
          "Formato de audio no soportado. Formatos permitidos: audio/webm, audio/mp4, audio/mpeg, audio/ogg, audio/wav.",
      });
      return;
    }

    parsearAudioCrudo(req, res, (err: any) => {
      if (err) {
        if (err.type === "entity.too.large" || err.status === 413) {
          res.status(413).json({
            error: "El archivo de audio supera el límite máximo permitido de 5 MB.",
          });
          return;
        }
        res.status(400).json({
          error: err?.message || "Error al procesar el cuerpo del audio.",
        });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    // 1. Validar que el cuerpo no esté vacío
    const bufferAudio = req.body;
    if (
      !bufferAudio ||
      !Buffer.isBuffer(bufferAudio) ||
      bufferAudio.length === 0
    ) {
      res.status(400).json({
        error: "El archivo de audio está vacío.",
      });
      return;
    }

    // 2. Validar duración informada por el navegador en el header
    const duracionHeaderRaw = req.headers["x-duracion-segundos"];
    let duracionHeader: number | undefined;
    if (duracionHeaderRaw) {
      const duracionNum = Number(duracionHeaderRaw);
      if (isNaN(duracionNum) || duracionNum < 0) {
        res.status(400).json({
          error: "El header 'X-Duracion-Segundos' debe ser un número válido.",
        });
        return;
      }
      if (duracionNum > 120) {
        res.status(400).json({
          error: "El audio puede durar hasta 2 minutos.",
        });
        return;
      }
      duracionHeader = duracionNum;
    }

    // 3. Validar conversacion_id opcional en query string
    const conversacionIdQuery = req.query.conversacion_id;
    if (conversacionIdQuery !== undefined) {
      const esUUIDValido =
        typeof conversacionIdQuery === "string" &&
        z.string().uuid().safeParse(conversacionIdQuery).success;

      if (!esUUIDValido) {
        res.status(400).json({
          error: "El parámetro 'conversacion_id' debe ser un UUID válido.",
        });
        return;
      }
    }

    // 4. Validar token y sesión del usuario
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Token de autorización faltante o inválido.",
      });
      return;
    }

    const token = authHeader.split(" ")[1];

    let sesion: any;
    try {
      sesion = await validarSesionAsistente(token);
    } catch (err: any) {
      const status = err?.status || 500;
      res.status(status).json({
        error: err?.message || "Error al validar la sesión del usuario.",
      });
      return;
    }

    try {
      // 5. Control de topes y rate limit (el audio cuenta como un mensaje)
      const resultadoTopes = await verificarTopes(
        sesion.usuarioId,
        sesion.cliente,
      );

      let convIdFinal = (conversacionIdQuery as string) || undefined;

      if (resultadoTopes.superado) {
        res.status(200).json({
          conversacion_id: convIdFinal || null,
          transcripcion: "",
          mensaje_usuario: {
            rol: "usuario",
            contenido: "",
            fue_audio: true,
          },
          mensaje_asistente: {
            rol: "asistente",
            contenido:
              resultadoTopes.mensaje ||
              "Por hoy llegué al límite; seguimos mañana",
          },
        });
        return;
      }

      // 6. Si se pasó conversacion_id, validar existencia y acceso antes de transcribir
      if (convIdFinal) {
        const { data: convExistente, error: errExiste } = await sesion.cliente
          .from("asistente_conversaciones")
          .select("id")
          .eq("id", convIdFinal)
          .maybeSingle();

        if (errExiste) {
          res.status(500).json({
            error: `Error al consultar conversación: ${errExiste.message}`,
          });
          return;
        }

        if (!convExistente) {
          res.status(404).json({
            error: "Conversación no encontrada o sin acceso.",
          });
          return;
        }
      }

      // 7. Transcripción del audio (OpenAI o proveedor falso)
      const headerTranscripcionFalsa = req.headers[
        "x-transcripcion-falsa"
      ] as string | undefined;

      const contentType = req.headers["content-type"] as string;

      let transcripcionRes: ResultadoTranscripcion;
      try {
        transcripcionRes = await transcribirAudio({
          buffer: bufferAudio,
          mimetype: contentType,
          headerTranscripcionFalsa,
          duracionSegundosHeader: duracionHeader,
        });
      } catch (err: any) {
        const status = err?.status || 500;
        res.status(status).json({
          error: err?.message || "Error al transcribir el audio.",
        });
        return;
      }

      // 8. Validar duración obtenida en la transcripción
      if (
        transcripcionRes.duracionSegundos != null &&
        transcripcionRes.duracionSegundos > 120
      ) {
        res.status(400).json({
          error: "El audio puede durar hasta 2 minutos.",
        });
        return;
      }

      const textoTranscrito = transcripcionRes.texto.trim();
      if (!textoTranscrito) {
        res.status(400).json({
          error: "No se pudo transcribir ningún texto del audio.",
        });
        return;
      }

      // 9. Crear conversación si no vino especificada
      if (!convIdFinal) {
        const titulo = generarTitulo(textoTranscrito);
        const { data: nuevaConv, error: errConv } = await sesion.cliente
          .from("asistente_conversaciones")
          .insert({
            usuario_id: sesion.usuarioId,
            titulo,
          })
          .select()
          .single();

        if (errConv) {
          res.status(500).json({
            error: `Error al crear conversación: ${errConv.message}`,
          });
          return;
        }

        convIdFinal = nuevaConv.id;
      }

      if (!convIdFinal) {
        res.status(500).json({
          error: "No se pudo resolver el ID de la conversación.",
        });
        return;
      }

      // 10. Procesar el turno con el asistente reutilizando procesarTurno
      const resultado = await procesarTurno({
        conversacionId: convIdFinal,
        usuarioId: sesion.usuarioId,
        rol: sesion.rol,
        texto: textoTranscrito,
        supabase: sesion.cliente,
        fue_audio: true,
        audio_segundos: transcripcionRes.duracionSegundos,
        costo_transcripcion_usd: transcripcionRes.costoUsd,
      });

      res.status(200).json({
        conversacion_id: resultado.conversacion_id,
        transcripcion: textoTranscrito,
        mensaje_usuario: resultado.mensaje_usuario,
        mensaje_asistente: resultado.mensaje_asistente,
        ...(resultado.propuesta ? { propuesta: resultado.propuesta } : {}),
      });
    } catch (err: any) {
      console.error("[ASISTENTE] Error al procesar audio:", err);
      res.status(500).json({
        error:
          err?.message ||
          "Ocurrió un error al procesar el audio con el asistente.",
      });
    }
  },
);

