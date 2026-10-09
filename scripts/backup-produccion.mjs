// Backup manual de la base de producción (plan Free de Supabase: no hay backups automáticos).
// Uso: node scripts/backup-produccion.mjs
// Requiere `npx supabase link` hecho y pide la contraseña de la base (o usa SUPABASE_DB_PASSWORD).
// Deja roles.sql, schema.sql y data.sql en ~/backups/elevaplus/AAAA-MM-DD, FUERA del repo.
// Solo lee producción: no modifica nada.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { contarFilas } from "./lib/backup.mjs";

const fecha = new Date().toISOString().slice(0, 10);
const destino = path.join(os.homedir(), "backups", "elevaplus", fecha);
const repo = path.resolve(".");

if (path.resolve(destino).startsWith(repo + path.sep)) {
  console.error("❌ El destino del backup no puede estar dentro del repo.");
  process.exit(1);
}
if (fs.existsSync(destino) && fs.readdirSync(destino).length > 0) {
  console.error(`❌ Ya existe un backup en ${destino}. Borralo o movelo antes de repetir.`);
  process.exit(1);
}
fs.mkdirSync(destino, { recursive: true });

const pasos = [
  { nombre: "roles.sql", args: ["--role-only"] },
  { nombre: "schema.sql", args: [] },
  { nombre: "data.sql", args: ["--data-only", "--use-copy"] },
];

for (const paso of pasos) {
  const archivo = path.join(destino, paso.nombre);
  console.log(`Generando ${paso.nombre}...`);
  const res = spawnSync(
    "npx",
    ["supabase", "db", "dump", "--linked", ...paso.args, "-f", archivo],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (res.status !== 0) {
    console.error(`❌ Falló el dump de ${paso.nombre} (código ${res.status}).`);
    process.exit(res.status ?? 1);
  }
  if (!fs.existsSync(archivo) || fs.statSync(archivo).size === 0) {
    console.error(`❌ ${paso.nombre} quedó vacío.`);
    process.exit(1);
  }
}

// Resumen: filas por tabla según los bloques COPY de data.sql
const filas = contarFilas(fs.readFileSync(path.join(destino, "data.sql"), "utf8"));
const publicas = [...filas].filter(([t]) => t.startsWith("public."));
console.log(`\n✓ Backup en ${destino}`);
for (const p of pasos) {
  const kb = (fs.statSync(path.join(destino, p.nombre)).size / 1024).toFixed(0);
  console.log(`  ${p.nombre}: ${kb} KB`);
}
console.log(`  ${publicas.length} tablas de public con datos, ${publicas.reduce((a, [, n]) => a + n, 0)} filas.`);
console.log("\nLos archivos de Storage (PDF, fotos) NO están incluidos.");
console.log("Para probarlo: node scripts/probar-restauracion.mjs " + JSON.stringify(destino));
