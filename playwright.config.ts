import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function leerEnvTest(): Record<string, string> {
  const envTestPath = path.resolve(process.cwd(), ".env.test");
  const envVars: Record<string, string> = {};
  if (fs.existsSync(envTestPath)) {
    const contenido = fs.readFileSync(envTestPath, "utf-8");
    for (const linea of contenido.split(/\r?\n/)) {
      const match = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const [, key, value] = match;
        envVars[key] = value ? value.trim().replace(/^['"]|['"]$/g, "") : "";
      }
    }
  }
  return envVars;
}

const envTest = leerEnvTest();

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  envTest.SUPABASE_URL ||
  envTest.VITE_SUPABASE_URL ||
  "http://127.0.0.1:54321";

const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  envTest.SUPABASE_SERVICE_ROLE_KEY ||
  "dummy_service_role_key";

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  envTest.SUPABASE_ANON_KEY ||
  envTest.VITE_SUPABASE_ANON_KEY ||
  "";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "oficina",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/oficina.json",
      },
      testIgnore: [
        /auth\.setup\.ts/,
        /chofer\.spec\.ts/,
        /auth-routing\.spec\.ts/,
      ],
    },
    {
      name: "chofer",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        storageState: "tests/e2e/.auth/chofer1.json",
      },
      testMatch: /chofer\.spec\.ts/,
    },
    {
      name: "anonimo",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
      },
      testMatch: /auth-routing\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "npm run build --prefix worker && node worker/dist/index.js",
      url: "http://localhost:3001/health",
      env: {
        PORT: "3001",
        NODE_ENV: "test",
        TZ: "America/Argentina/Buenos_Aires",
        ASISTENTE_MODELO: "falso",
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
        SUPABASE_ANON_KEY: supabaseAnonKey,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "npm run build:test && npx vite preview --port 4173 --mode test",
      url: "http://localhost:4173",
      env: {
        VITE_WORKER_URL: "http://localhost:3001",
        ...process.env,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
