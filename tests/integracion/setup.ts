import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { USUARIOS } from "../fixtures/ids";

// Cargar variables desde .env.test si no están en process.env
function obtenerConfigTest() {
  const envTestPath = path.resolve(process.cwd(), ".env.test");
  let envUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  let envAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if ((!envUrl || !envAnonKey) && fs.existsSync(envTestPath)) {
    const contenido = fs.readFileSync(envTestPath, "utf-8");
    for (const linea of contenido.split(/\r?\n/)) {
      const match = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const [, key, value] = match;
        const valLimpio = value ? value.trim().replace(/^['"]|['"]$/g, "") : "";
        if (!process.env[key]) {
          process.env[key] = valLimpio;
        }
      }
    }
    envUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    envAnonKey =
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  }

  const url = envUrl || "http://127.0.0.1:54321";
  const anonKey =
    envAnonKey ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

  return { url, anonKey };
}

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = obtenerConfigTest();

// Clientes en caché para no autenticar en cada llamada
let clienteAdmin: SupabaseClient | null = null;
let clienteOficina: SupabaseClient | null = null;
let clienteChofer1: SupabaseClient | null = null;
let clienteChofer2: SupabaseClient | null = null;
let clienteAnonimo: SupabaseClient | null = null;

async function crearClienteAutenticado(
  email: string,
  pass: string,
): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (error || !data?.session) {
    throw new Error(
      `Error al autenticar ${email} en setup de integración: ${error?.message || "sesión nula"}`,
    );
  }

  return client;
}

export async function comoAdmin(): Promise<SupabaseClient> {
  if (!clienteAdmin) {
    clienteAdmin = await crearClienteAutenticado(
      USUARIOS.admin.email,
      USUARIOS.admin.password,
    );
  }
  return clienteAdmin;
}

export async function comoOficina(): Promise<SupabaseClient> {
  if (!clienteOficina) {
    clienteOficina = await crearClienteAutenticado(
      USUARIOS.oficina.email,
      USUARIOS.oficina.password,
    );
  }
  return clienteOficina;
}

export async function comoChofer1(): Promise<SupabaseClient> {
  if (!clienteChofer1) {
    clienteChofer1 = await crearClienteAutenticado(
      USUARIOS.chofer1.email,
      USUARIOS.chofer1.password,
    );
  }
  return clienteChofer1;
}

export async function comoChofer2(): Promise<SupabaseClient> {
  if (!clienteChofer2) {
    clienteChofer2 = await crearClienteAutenticado(
      USUARIOS.chofer2.email,
      USUARIOS.chofer2.password,
    );
  }
  return clienteChofer2;
}

export function comoAnonimo(): SupabaseClient {
  if (!clienteAnonimo) {
    clienteAnonimo = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return clienteAnonimo;
}

export {
  CATEGORIAS_MOVIMIENTO,
  CLIENTES,
  CUENTAS,
  EMPRESA,
  MAQUINAS,
  PARAMETROS_COTIZADOR,
  USUARIOS,
  VEHICULOS,
} from "../fixtures/ids";

/**
 * Limpia registros creados durante tests usando el cliente de admin (sin service_role).
 */
export async function limpiarRegistrosTest(prefijo: string) {
  const admin = await comoAdmin();

  // Presupuestos creados por el test
  const { data: presList } = await admin
    .from("presupuestos")
    .select("id")
    .or(
      `prospecto_nombre.ilike.%${prefijo}%,condiciones.ilike.%${prefijo}%,notas.ilike.%${prefijo}%`,
    );
  const presIds = (presList || []).map((p) => p.id);

  // 1. Obtener servicios del test (por descripción o vinculados a presupuestos del test)
  let sQuery = admin.from("servicios").select("id");
  if (presIds.length > 0) {
    sQuery = sQuery.or(
      `descripcion.ilike.%${prefijo}%,presupuesto_id.in.(${presIds.join(",")})`,
    );
  } else {
    sQuery = sQuery.ilike("descripcion", `%${prefijo}%`);
  }
  const { data: servs } = await sQuery;

  const sIds = (servs || []).map((s) => s.id);
  if (sIds.length > 0) {
    // Obtener cobros aplicados a estos servicios para borrarlos
    const { data: aplicas } = await admin
      .from("cobro_aplicaciones")
      .select("cobro_id")
      .in("servicio_id", sIds);
    const cIds = (aplicas || []).map((a) => a.cobro_id).filter(Boolean);

    // Desvincular factura_id de servicios del test
    await admin.from("servicios").update({ factura_id: null }).in("id", sIds);
    // Borrar aplicaciones de cobro asociadas a estos servicios
    await admin.from("cobro_aplicaciones").delete().in("servicio_id", sIds);
    // Borrar los cobros encontrados
    if (cIds.length > 0) {
      await admin.from("cobros").delete().in("id", cIds);
    }
    // Borrar alquileres dependientes
    await admin.from("alquileres").delete().in("servicio_id", sIds);
    // Borrar adjuntos asociados a estos servicios
    await admin.from("adjuntos").delete().in("servicio_id", sIds);
    // Borrar asignaciones de choferes y eventos
    await admin.from("servicio_choferes").delete().in("servicio_id", sIds);
    await admin.from("servicio_eventos").delete().in("servicio_id", sIds);
    // Borrar los servicios
    await admin.from("servicios").delete().in("id", sIds);
  }

  // Borrar presupuestos del test
  if (presIds.length > 0) {
    await admin.from("presupuestos").delete().in("id", presIds);
  }

  // Borrar clientes creados por el test
  await admin.from("clientes").delete().ilike("nombre", `%${prefijo}%`);

  // 2. Borrar facturas creadas por el test (notas contienen prefijo)
  await admin.from("facturas").delete().ilike("notas", `%${prefijo}%`);

  // 3. Borrar cheques creados por el test y cobros asociados
  const { data: chqs } = await admin
    .from("cheques")
    .select("id")
    .ilike("numero", `%${prefijo}%`);
  const chqIds = (chqs || []).map((c) => c.id);
  if (chqIds.length > 0) {
    await admin.from("cobros").delete().in("cheque_id", chqIds);
    await admin.from("cheques").delete().in("id", chqIds);
  }

  // 4. Borrar movimientos creados por el test
  await admin
    .from("movimientos_caja")
    .delete()
    .ilike("descripcion", `%${prefijo}%`);

  // 5. Borrar vencimientos e instancias creadas por el test
  const { data: venci } = await admin
    .from("vencimientos")
    .select("id")
    .ilike("titulo", `%${prefijo}%`);
  const vIds = (venci || []).map((v) => v.id);
  if (vIds.length > 0) {
    await admin
      .from("vencimiento_instancias")
      .delete()
      .in("vencimiento_id", vIds);
    await admin.from("vencimientos").delete().in("id", vIds);
  }

  // 7. Borrar eventos de flota creados por el test
  await admin
    .from("eventos_flota")
    .delete()
    .ilike("descripcion", `%${prefijo}%`);
  await admin.from("eventos_flota").delete().ilike("proveedor", `%${prefijo}%`);

  // 8. Borrar novedades de empleados creadas por el test
  await admin
    .from("novedades_empleado")
    .delete()
    .ilike("notas", `%${prefijo}%`);

  // 9. Borrar logs de ARCA creados por el test
  await admin.from("arca_log").delete().ilike("accion", `%${prefijo}%`);
}
