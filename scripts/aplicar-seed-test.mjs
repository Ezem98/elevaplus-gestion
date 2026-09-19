import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const seedPath = path.resolve("supabase/seed-test.sql");
if (!fs.existsSync(seedPath)) {
  console.error("❌ No se encontró supabase/seed-test.sql");
  process.exit(1);
}

console.log("Aplicando supabase/seed-test.sql...");
const sqlContent = fs.readFileSync(seedPath, "utf8");

// 1. Probar con psql en host si está disponible (típico en runners Linux)
let res = spawnSync("psql", [process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres"], {
  input: sqlContent,
  stdio: ["pipe", "inherit", "pipe"],
});

// 2. Si no existe psql en host (ej. Windows sin postgres en PATH), ejecutar en el contenedor Docker
if (res.error || res.status !== 0) {
  res = spawnSync("docker", ["exec", "-i", "supabase_db_elevaplus-gestion", "psql", "-U", "postgres", "-d", "postgres"], {
    input: sqlContent,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

if (res.status !== 0) {
  console.error("❌ Error al aplicar seed-test.sql");
  process.exit(1);
}

console.log("✓ Seed de test aplicado exitosamente.");
