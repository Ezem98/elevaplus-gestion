import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { RolPermitidoAsistente } from "./tipos";

export interface SesionAsistenteValida {
  usuarioId: string;
  email?: string;
  rol: RolPermitidoAsistente;
  cliente: SupabaseClient;
  token: string;
}

/**
 * Obtiene la fecha actual en la zona horaria de Argentina en formato ISO (YYYY-MM-DD).
 */
export function obtenerFechaHoyArgentina(fechaRef: Date = new Date()): string {
  const formato = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.TZ || "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formato.format(fechaRef);
}

/**
 * Crea un cliente de Supabase utilizando la publishable/anon key y el header
 * de autorización del usuario. Todas las operaciones de las herramientas usan
 * este cliente para respetar RLS y las políticas del usuario autenticado.
 */
export function crearClienteUsuario(token: string): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Valida el JWT del usuario contra Supabase Auth y consulta su perfil.
 * Si el usuario tiene rol de chofer, se rechaza con 403 y mensaje explícito.
 */
export async function validarSesionAsistente(
  token: string,
): Promise<SesionAsistenteValida> {
  if (!token || token.trim() === "") {
    const error: any = new Error("Token de autorización faltante.");
    error.status = 401;
    throw error;
  }

  const clienteUsuario = crearClienteUsuario(token);

  const { data, error: errorAuth } = await clienteUsuario.auth.getUser(token);
  if (errorAuth || !data?.user) {
    const error: any = new Error(
      `Token expirado o inválido: ${errorAuth?.message || "sin usuario"}`,
    );
    error.status = 401;
    throw error;
  }

  const { data: perfil, error: errorPerfil } = await clienteUsuario
    .from("perfiles")
    .select("rol, activo")
    .eq("id", data.user.id)
    .single();

  if (errorPerfil) {
    const error: any = new Error(
      `Error al consultar perfil del usuario: ${errorPerfil.message}`,
    );
    error.status = 403;
    throw error;
  }

  if (!perfil) {
    const error: any = new Error("Perfil de usuario no encontrado.");
    error.status = 403;
    throw error;
  }

  if (!perfil.activo) {
    const error: any = new Error("El usuario se encuentra inactivo.");
    error.status = 403;
    throw error;
  }

  if (perfil.rol === "chofer") {
    const error: any = new Error(
      "Acceso denegado: el asistente no está disponible para choferes en esta versión.",
    );
    error.status = 403;
    throw error;
  }

  if (perfil.rol !== "admin" && perfil.rol !== "oficina") {
    const error: any = new Error(
      "Acceso denegado: se requiere rol admin u oficina.",
    );
    error.status = 403;
    throw error;
  }

  return {
    usuarioId: data.user.id,
    email: data.user.email,
    rol: perfil.rol as RolPermitidoAsistente,
    cliente: clienteUsuario,
    token,
  };
}
