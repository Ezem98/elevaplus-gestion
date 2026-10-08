/**
 * Lógica pura para decidir si un objeto del bucket `adjuntos` es huérfano.
 *
 * Convenciones de ruta conocidas (bucket `adjuntos`):
 *   servicios/<servicio_id>/<archivo>        -> adjuntos.storage_path
 *   presupuestos/<presupuesto_id>/<archivo>  -> presupuestos.pdf_path / servicios.presupuesto_pdf_path
 *   comprobantes/<movimiento_id>/<archivo>   -> movimientos_caja.comprobante_path
 *   (cheques.imagen_path también se considera referencia exacta)
 * Cualquier otra carpeta se considera desconocida y nunca se toca.
 */

export const DIAS_MINIMOS_HUERFANO = 7;

export type CarpetaConocida = "servicios" | "presupuestos" | "comprobantes";

export const CARPETAS_CONOCIDAS: readonly CarpetaConocida[] = [
  "servicios",
  "presupuestos",
  "comprobantes",
];

export interface EntidadesExistentes {
  servicios: ReadonlySet<string>;
  presupuestos: ReadonlySet<string>;
  comprobantes: ReadonlySet<string>;
}

export interface EntradaDecision {
  bucket: string;
  path: string;
  creadoEn: string | null | undefined;
  ahora: Date;
  referenciados: ReadonlySet<string>;
  existentes: EntidadesExistentes;
}

export type MotivoDecision =
  | "huerfano"
  | "bucket-protegido"
  | "referenciado"
  | "entidad-existe"
  | "reciente"
  | "sin-fecha"
  | "desconocida";

export interface ResultadoDecision {
  huerfano: boolean;
  motivo: MotivoDecision;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extrae carpeta e id de entidad de una ruta conocida; null si la convención no se entiende. */
export function parsearRuta(
  path: string,
): { carpeta: CarpetaConocida; id: string } | null {
  const partes = path.split("/");
  if (partes.length < 3 || partes.some((p) => p === "")) return null;
  const [carpeta, id] = partes;
  if (!(CARPETAS_CONOCIDAS as readonly string[]).includes(carpeta)) return null;
  if (!UUID.test(id)) return null;
  return { carpeta: carpeta as CarpetaConocida, id: id.toLowerCase() };
}

export function decidirHuerfano(entrada: EntradaDecision): ResultadoDecision {
  // Registros fiscales (bucket facturas) y cualquier otro bucket: nunca.
  if (entrada.bucket !== "adjuntos") {
    return { huerfano: false, motivo: "bucket-protegido" };
  }
  if (entrada.referenciados.has(entrada.path)) {
    return { huerfano: false, motivo: "referenciado" };
  }
  const ruta = parsearRuta(entrada.path);
  if (!ruta) return { huerfano: false, motivo: "desconocida" };

  if (entrada.existentes[ruta.carpeta].has(ruta.id)) {
    return { huerfano: false, motivo: "entidad-existe" };
  }

  if (!entrada.creadoEn) return { huerfano: false, motivo: "sin-fecha" };
  const creado = new Date(entrada.creadoEn).getTime();
  if (Number.isNaN(creado)) return { huerfano: false, motivo: "sin-fecha" };
  const edadMs = entrada.ahora.getTime() - creado;
  if (edadMs < DIAS_MINIMOS_HUERFANO * 24 * 60 * 60 * 1000) {
    return { huerfano: false, motivo: "reciente" };
  }

  return { huerfano: true, motivo: "huerfano" };
}
