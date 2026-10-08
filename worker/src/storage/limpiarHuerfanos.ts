import { config } from "../config";
import { latir } from "../notificaciones/heartbeat";
import { supabaseAdmin } from "../supabase";
import {
  CARPETAS_CONOCIDAS,
  decidirHuerfano,
  parsearRuta,
  type CarpetaConocida,
  type EntidadesExistentes,
} from "./decidirHuerfano";

const BUCKET = "adjuntos";
const TOPE_BORRADOS = 200;
// Menor que el max_rows de PostgREST (1000): si la API recortara una página,
// el corte por `data.length < PAGINA` dejaría referencias sin leer.
const PAGINA = 500;
const LOTE_IN = 100;
const PROFUNDIDAD_MAX = 6;

export interface ObjetoStorage {
  path: string;
  creadoEn: string | null;
}

export interface ResultadoLimpiezaStorage {
  ok: boolean;
  modo: "informe" | "borrado";
  totalObjetos: number;
  huerfanos: number;
  desconocidos: number;
  borrados: number;
  paths: string[];
  error?: string;
}

/** Lista recursivamente todos los objetos del bucket (las carpetas vienen con id null). */
async function listarObjetos(
  prefijo: string,
  profundidad = 0,
): Promise<ObjetoStorage[]> {
  if (profundidad > PROFUNDIDAD_MAX) return [];
  const salida: ObjetoStorage[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(prefijo, { limit: PAGINA, offset });
    if (error) {
      throw new Error(
        `Error al listar Storage '${BUCKET}/${prefijo}': ${error.message}`,
      );
    }
    if (!data) {
      throw new Error(`Storage '${BUCKET}/${prefijo}' no devolvió datos.`);
    }
    for (const item of data) {
      const ruta = prefijo ? `${prefijo}/${item.name}` : item.name;
      if (item.id === null || item.id === undefined) {
        salida.push(...(await listarObjetos(ruta, profundidad + 1)));
      } else {
        salida.push({ path: ruta, creadoEn: item.created_at ?? null });
      }
    }
    if (data.length < PAGINA) break;
    offset += PAGINA;
  }
  return salida;
}

/** Trae todos los valores no nulos de una columna (paginado). */
async function leerColumna(tabla: string, columna: string): Promise<string[]> {
  const valores: string[] = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from(tabla)
      .select(columna)
      .not(columna, "is", null)
      .order(columna)
      .range(desde, desde + PAGINA - 1);
    if (error) {
      throw new Error(`Error al leer ${tabla}.${columna}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`La consulta de ${tabla}.${columna} no devolvió datos.`);
    }
    for (const fila of data as unknown as Record<string, string | null>[]) {
      const v = fila[columna];
      if (v) valores.push(v);
    }
    if (data.length < PAGINA) break;
    desde += PAGINA;
  }
  return valores;
}

async function idsExistentes(
  tabla: string,
  ids: string[],
): Promise<Set<string>> {
  const existentes = new Set<string>();
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    const lote = ids.slice(i, i + LOTE_IN);
    const { data, error } = await supabaseAdmin
      .from(tabla)
      .select("id")
      .in("id", lote);
    if (error) {
      throw new Error(`Error al consultar ${tabla}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`La consulta de ${tabla} no devolvió datos.`);
    }
    for (const fila of data as { id: string }[]) {
      existentes.add(fila.id.toLowerCase());
    }
  }
  return existentes;
}

const TABLA_POR_CARPETA: Record<CarpetaConocida, string> = {
  servicios: "servicios",
  presupuestos: "presupuestos",
  comprobantes: "movimientos_caja",
};

/**
 * Cron semanal: busca archivos huérfanos en el bucket `adjuntos`.
 * Por defecto solo informa. Borra únicamente con STORAGE_LIMPIEZA_BORRAR="true",
 * hasta 200 archivos por corrida. El bucket `facturas` no se toca nunca.
 */
export async function limpiarStorageHuerfanos(): Promise<ResultadoLimpiezaStorage> {
  const borrar = config.STORAGE_LIMPIEZA_BORRAR === "true";
  const modo = borrar ? "borrado" : "informe";
  let exito = false;
  try {
    const ahora = new Date();
    const objetos = await listarObjetos("");

    // Referencias exactas por path
    const referenciados = new Set<string>();
    for (const [tabla, columna] of [
      ["adjuntos", "storage_path"],
      ["servicios", "presupuesto_pdf_path"],
      ["presupuestos", "pdf_path"],
      ["movimientos_caja", "comprobante_path"],
      ["cheques", "imagen_path"],
    ] as const) {
      for (const v of await leerColumna(tabla, columna)) referenciados.add(v);
    }

    // Entidades candidatas (solo las de objetos no referenciados)
    const idsPorCarpeta: Record<CarpetaConocida, Set<string>> = {
      servicios: new Set(),
      presupuestos: new Set(),
      comprobantes: new Set(),
    };
    for (const o of objetos) {
      if (referenciados.has(o.path)) continue;
      const ruta = parsearRuta(o.path);
      if (ruta) idsPorCarpeta[ruta.carpeta].add(ruta.id);
    }
    const entidades: EntidadesExistentes = {
      servicios: new Set(),
      presupuestos: new Set(),
      comprobantes: new Set(),
    };
    for (const carpeta of CARPETAS_CONOCIDAS) {
      entidades[carpeta] = await idsExistentes(TABLA_POR_CARPETA[carpeta], [
        ...idsPorCarpeta[carpeta],
      ]);
    }

    const huerfanos: string[] = [];
    let desconocidos = 0;
    for (const o of objetos) {
      const r = decidirHuerfano({
        bucket: BUCKET,
        path: o.path,
        creadoEn: o.creadoEn,
        ahora,
        referenciados,
        existentes: entidades,
      });
      if (r.huerfano) huerfanos.push(o.path);
      else if (r.motivo === "desconocida") desconocidos++;
    }

    console.log(
      `[STORAGE] Modo ${modo}: ${objetos.length} objetos, ${huerfanos.length} huérfanos, ${desconocidos} de convención desconocida (no se tocan).`,
    );
    for (const p of huerfanos) console.log(`[STORAGE] Huérfano: ${p}`);

    let borrados = 0;
    if (borrar && huerfanos.length > 0) {
      const aBorrar = huerfanos.slice(0, TOPE_BORRADOS);
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove(aBorrar);
      if (error) {
        throw new Error(`Error al borrar huérfanos: ${error.message}`);
      }
      if (!data) {
        throw new Error("El borrado de huérfanos no devolvió datos.");
      }
      borrados = data.length;
      console.log(
        `[STORAGE] Borrados ${borrados} archivos huérfanos (tope ${TOPE_BORRADOS} por corrida).`,
      );
    }

    exito = true;
    return {
      ok: true,
      modo,
      totalObjetos: objetos.length,
      huerfanos: huerfanos.length,
      desconocidos,
      borrados,
      paths: huerfanos,
    };
  } catch (err: any) {
    console.error("[STORAGE] Error en limpiarStorageHuerfanos:", err);
    return {
      ok: false,
      modo,
      totalObjetos: 0,
      huerfanos: 0,
      desconocidos: 0,
      borrados: 0,
      paths: [],
      error: err?.message || String(err),
    };
  } finally {
    if (exito) await latir("storage");
  }
}
