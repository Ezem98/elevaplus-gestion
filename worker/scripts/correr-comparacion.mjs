// Corre la comparación de modelos contra el Supabase LOCAL.
// Toma URL y anon key de `supabase status` (valores de desarrollo) y las claves de API de worker/.env.comparacion.
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirWorker = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raiz = path.resolve(dirWorker, "..");

const estado = JSON.parse(
  execSync("npx supabase status -o json", { cwd: raiz, encoding: "utf8" }),
);

const env = {
  ...process.env,
  SUPABASE_URL: estado.API_URL,
  VITE_SUPABASE_URL: estado.API_URL,
  SUPABASE_ANON_KEY: estado.ANON_KEY,
  VITE_SUPABASE_ANON_KEY: estado.ANON_KEY,
};

const resultado = spawnSync(
  "npx",
  [
    "tsx",
    "--env-file-if-exists=.env.comparacion",
    "scripts/comparar-modelos.ts",
    ...process.argv.slice(2),
  ],
  { cwd: dirWorker, env, stdio: "inherit", shell: true },
);
process.exit(resultado.status ?? 1);
