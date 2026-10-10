import type { SupabaseClient } from "@supabase/supabase-js";

export type RolPermitidoAsistente = "admin" | "oficina";

export interface ContextoHerramienta {
  /** Cliente de Supabase autenticado con la sesión del usuario (RLS activo, sin service role) */
  supabase: SupabaseClient;
  /** UUID del usuario autenticado */
  usuarioId: string;
  /** Rol del usuario (admin u oficina) */
  rol: RolPermitidoAsistente;
  /** Fecha de hoy en Argentina (YYYY-MM-DD) */
  hoy: string;
  /** ID de la conversación actual si está disponible */
  conversacionId?: string;
}

export interface HerramientaAsistente {
  nombre: string;
  descripcion: string;
  parametros: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
  roles: RolPermitidoAsistente[];
  ejecutar(ctx: ContextoHerramienta, args: any): Promise<any>;
}

export interface MensajeHistorial {
  id?: string;
  rol: "usuario" | "asistente";
  contenido: string;
  herramientas?: Array<{
    nombre: string;
    argumentos: any;
    resultado: any;
  }> | null;
  created_at?: string;
}

export interface ResultadoTurnoAsistente {
  conversacion_id: string;
  mensaje_usuario: any;
  mensaje_asistente: any;
  propuesta?: any;
}
