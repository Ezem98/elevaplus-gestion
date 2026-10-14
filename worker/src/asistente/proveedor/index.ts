import { config } from "../../config";
import { ProveedorClaude } from "./claude";
import { ProveedorFalso } from "./falso";
import { ProveedorOpenAI } from "./openai";
import type { ProveedorModelo } from "./tipos";

export * from "./claude";
export * from "./falso";
export * from "./openai";
export * from "./tipos";

/**
 * Obtiene la instancia del proveedor de modelo configurado:
 * - 'falso': proveedor determinista con guiones fijos (sin red, para tests y E2E).
 * - 'claude': proveedor oficial conectado a Anthropic Messages API.
 * - 'openai': proveedor oficial conectado a Responses API (POST /v1/responses).
 */
export function obtenerProveedorModelo(): ProveedorModelo {
  if (config.ASISTENTE_MODELO === "falso") {
    return new ProveedorFalso();
  }
  if (config.ASISTENTE_MODELO === "claude") {
    return new ProveedorClaude();
  }
  return new ProveedorOpenAI();
}
