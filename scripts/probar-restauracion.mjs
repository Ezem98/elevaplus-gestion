// Prueba de restauración de un backup en la base LOCAL de Supabase (nunca en producción).
// Uso: node scripts/probar-restauracion.mjs <carpeta-del-backup>
// Borra la base local (supabase db reset --no-seed), carga data.sql y compara filas por tabla.
// Al terminar, `npm run db:local` deja la base local como estaba para los tests.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { contarFilas } from "./lib/backup.mjs";

const carpeta = process.argv[2];
if (!carpeta) {
  console.error("Uso: node scripts/probar-restauracion.mjs <carpeta-del-backup>");
  process.exit(1);
}
const dataSql = path.join(carpeta, "data.sql");
if (!fs.existsSync(dataSql)) {
  console.error(`❌ No existe ${dataSql}`);
  process.exit(1);
}

const esWindows = process.platform === "win32";

console.log("1/3 Reseteando la base LOCAL sin seed (aplica las migraciones del repo)...");
const reset = spawnSync("npx", ["supabase", "db", "reset", "--local", "--no-seed"], {
  stdio: "inherit",
  shell: esWindows,
});
if (reset.status !== 0) {
  console.error("❌ Falló supabase db reset local. ¿Está Docker abierto y `supabase start` corriendo?");
  process.exit(reset.status ?? 1);
}

console.log("2/3 Cargando data.sql en una sola transacción...");
const contenedor = buscarContenedorDb();
const sql = fs.readFileSync(dataSql, "utf8");
const esperado = contarFilas(sql);
// Las migraciones insertan datos iniciales (cuentas, parámetros): se vacían las tablas
// que trae el dump para que la carga quede igual a producción.
const tablas = [...esperado.keys()].map((t) => t.split(".").map((p) => `"${p}"`).join("."));
const vaciar = tablas.length > 0 ? `TRUNCATE ${tablas.join(", ")} CASCADE;\n` : "";
const carga = spawnSync(
  "docker",
  // supabase_admin (superusuario del stack local) para poder vaciar y cargar auth y storage.
  ["exec", "-i", contenedor, "psql", "-U", "supabase_admin", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "--single-transaction", "-q"],
  { input: `SET session_replication_role = replica;\n${vaciar}${sql}`, stdio: ["pipe", "inherit", "inherit"] },
);
if (carga.status !== 0) {
  console.error("❌ La carga de data.sql falló: el backup NO se puede restaurar tal cual.");
  process.exit(carga.status ?? 1);
}

console.log("3/3 Comparando filas por tabla...");
let diferencias = 0;
for (const [tabla, filas] of esperado) {
  if (!tabla.startsWith("public.")) continue;
  const res = spawnSync(
    "docker",
    ["exec", "-i", contenedor, "psql", "-U", "postgres", "-d", "postgres", "-At",
      "-c", `select count(*) from ${tabla.split(".").map((p) => `"${p}"`).join(".")}`],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    console.error(`  ✗ ${tabla}: no se pudo contar (${res.stderr.trim()})`);
    diferencias++;
    continue;
  }
  const real = Number(res.stdout.trim());
  const ok = real === filas;
  if (!ok) diferencias++;
  console.log(`  ${ok ? "✓" : "✗"} ${tabla}: ${real}/${filas}`);
}

if (diferencias > 0) {
  console.error(`\n❌ ${diferencias} tabla(s) con diferencias.`);
  process.exit(1);
}
console.log("\n✓ Restauración OK: todas las tablas de public tienen las filas del backup.");
console.log("Para volver a la base de tests: npm run db:local");

function buscarContenedorDb() {
  const res = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" });
  if (res.status !== 0) {
    console.error("❌ No se pudo listar contenedores de Docker.");
    process.exit(1);
  }
  const nombre = res.stdout.split(/\r?\n/).find((n) => n.startsWith("supabase_db"));
  if (!nombre) {
    console.error("❌ No encontré el contenedor supabase_db. Corré `npx supabase start`.");
    process.exit(1);
  }
  return nombre;
}
