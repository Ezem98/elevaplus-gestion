import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { supabaseAdmin } from "../supabase";

export interface UsuarioAutenticado {
  id: string;
  email?: string;
  rol: "admin" | "oficina" | "chofer";
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

/**
 * Compara dos secretos en tiempo constante usando crypto.timingSafeEqual de node:crypto.
 * Realiza un chequeo previo de longitud para evitar excepciones de Buffer.
 * Devuelve false de inmediato si las longitudes difieren o si alguno está vacío o indefinido.
 */
export function compararSecretSeguro(
  secretRecibido: string | undefined,
  secretEsperado: string | undefined,
): boolean {
  if (!secretEsperado || !secretRecibido) {
    return false;
  }

  const bufRecibido = Buffer.from(secretRecibido);
  const bufEsperado = Buffer.from(secretEsperado);

  if (bufRecibido.length !== bufEsperado.length) {
    return false;
  }

  return timingSafeEqual(bufRecibido, bufEsperado);
}

/**
 * Middleware que valida el JWT de Supabase y asegura que el usuario
 * sea activo y tenga rol de admin u oficina.
 */
export async function requerirAdminUOficina(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autorización faltante o inválido." });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Token expirado o inválido." });
      return;
    }

    // Consultar rol en perfiles
    const { data: perfil, error: errorPerfil } = await supabaseAdmin
      .from("perfiles")
      .select("rol, activo")
      .eq("id", data.user.id)
      .single();

    if (errorPerfil || !perfil) {
      res.status(403).json({ error: "Perfil de usuario no encontrado." });
      return;
    }

    if (!perfil.activo) {
      res.status(403).json({ error: "El usuario se encuentra inactivo." });
      return;
    }

    if (perfil.rol !== "admin" && perfil.rol !== "oficina") {
      res.status(403).json({ error: "Acceso denegado: se requiere rol admin u oficina." });
      return;
    }

    req.usuario = {
      id: data.user.id,
      email: data.user.email,
      rol: perfil.rol,
    };

    next();
  } catch (err: any) {
    res.status(500).json({ error: "Error al validar la sesión." });
  }
}

/**
 * Middleware que permite acceso si se envía el header WORKER_SECRET
 * (Bearer token o x-worker-secret) o un JWT válido de admin/oficina.
 */
export async function requerirWorkerSecretOAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const rawSecret = req.headers["x-worker-secret"];
  const secretHeader =
    (typeof rawSecret === "string"
      ? rawSecret
      : Array.isArray(rawSecret)
        ? rawSecret[0]
        : undefined) ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (compararSecretSeguro(secretHeader, config.WORKER_SECRET)) {
    req.usuario = {
      id: "worker_secret",
      rol: "admin",
    };
    return next();
  }

  return requerirAdminUOficina(req, res, next);
}


