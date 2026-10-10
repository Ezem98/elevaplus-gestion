import { Router, type Request, type Response } from "express";
import { procesarTurno } from "../asistente/procesar";
import { validarSesionAsistente } from "../asistente/sesion";
import { verificarTopes } from "../asistente/topes";

export const asistenteRouter = Router();

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
