import { config } from "../../config";
import { ProveedorFalso } from "./falso";
import { ProveedorOpenAI } from "./openai";
import type { ProveedorModelo } from "./tipos";

export * from "./falso";
export * from "./openai";
export * from "./tipos";

/**
 * Obtiene la instancia del proveedor de modelo configurado:
 * - 'falso': proveedor determinista con guiones fijos (sin red, para tests y E2E).
 * - 'openai': proveedor oficial conectado a Responses API (POST /v1/responses).
 */
export function obtenerProveedorModelo(): ProveedorModelo {
  if (config.ASISTENTE_MODELO === "falso") {
    return new ProveedorFalso();
  }
  return new ProveedorOpenAI();
}
