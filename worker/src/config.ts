import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const esquemaConfig = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "staging", "production", "test"])
    .default("staging"),
  SUPABASE_URL: z
    .string()
    .default(
      process.env.SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        "https://ejemplo.supabase.co",
    ),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .default(process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy_service_role_key"),
  AFIPSDK_ACCESS_TOKEN: z.string().optional().default(""),
  ARCA_CUIT: z.coerce.number().default(20409378472),
  ARCA_CERT: z.string().optional(),
  ARCA_KEY: z.string().optional(),
  WORKER_SECRET: z.string().optional().default(""),
  TZ: z.string().default("America/Argentina/Buenos_Aires"),
  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_REMITENTE: z
    .string()
    .default("ELEVAPLUS Facturación <facturacion@eleva-plus.com.ar>"),
  MAIL_LISTA_BLANCA: z.string().optional().default(""),
  EDGE_PUSH_URL: z.string().optional().default(""),
  WEBHOOK_SECRET: z.string().optional().default(""),
  HEARTBEAT_INSTANCIAS: z.string().optional(),
  HEARTBEAT_RECORDATORIOS: z.string().optional(),
  HEARTBEAT_LOTE: z.string().optional(),
  HEARTBEAT_SEMANAL: z.string().optional(),
  HEARTBEAT_CALENDARIO: z.string().optional(),
  HEARTBEAT_CHOFERES: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z
    .string()
    .optional()
    .default(
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        "https://elevaplus-worker-production.up.railway.app/gcal/callback",
    ),
  APP_URL: z
    .string()
    .optional()
    .default(
      process.env.APP_URL || "https://gestion.eleva-plus.com.ar",
    ),
});

export const config = esquemaConfig.parse(process.env);
