import { expect, test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { USUARIOS } from "../fixtures/ids";

const authDir = path.resolve(process.cwd(), "tests/e2e/.auth");
const oficinaFile = path.join(authDir, "oficina.json");
const chofer1File = path.join(authDir, "chofer1.json");
const adminFile = path.join(authDir, "admin.json");

setup(
  "Verificar seguridad de bundle local y autenticar roles",
  async ({ page }) => {
    // Salvaguarda: Verificar que dist esté compilado para Supabase local
    const distAssetsDir = path.resolve(process.cwd(), "dist/assets");
    if (fs.existsSync(distAssetsDir)) {
      const files = fs
        .readdirSync(distAssetsDir)
        .filter((f) => f.endsWith(".js"));
      let contiene54321 = false;
      let contieneProd = false;

      for (const f of files) {
        const content = fs.readFileSync(path.join(distAssetsDir, f), "utf8");
        if (content.includes("54321")) contiene54321 = true;
        if (content.includes("arqcisnthwaliitljsel")) contieneProd = true;
      }

      if (contieneProd) {
        throw new Error(
          "ALERTA CRÍTICA: El bundle compilado apunta a la base de producción. Abortando tests E2E.",
        );
      }
      if (!contiene54321) {
        throw new Error(
          "ALERTA: El bundle compilado no apunta al puerto local 54321 de Supabase.",
        );
      }
    }

    // Asegurar directorio .auth
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    // 1. Autenticar Oficina
    await page.goto("/ingresar");
    await page.locator("#email").fill(USUARIOS.oficina.email);
    await page.locator("#clave").fill(USUARIOS.oficina.password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(
      page.getByRole("heading", { name: "Hoy", exact: true }),
    ).toBeVisible();
    await page.context().storageState({ path: oficinaFile });

    // 2. Limpiar cookies y localStorage para loguear Chofer 1
    await page.context().clearCookies();
    await page.goto("/ingresar");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/ingresar");
    await page.locator("#email").fill(USUARIOS.chofer1.email);
    await page.locator("#clave").fill(USUARIOS.chofer1.password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/chofer");
    await expect(
      page.getByRole("button", { name: "Hoy", exact: true }),
    ).toBeVisible();
    await page.context().storageState({ path: chofer1File });

    // 3. Autenticar Admin
    await page.context().clearCookies();
    await page.goto("/ingresar");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/ingresar");
    await page.locator("#email").fill(USUARIOS.admin.email);
    await page.locator("#clave").fill(USUARIOS.admin.password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(
      page.getByRole("heading", { name: "Hoy", exact: true }),
    ).toBeVisible();
    await page.context().storageState({ path: adminFile });
  },
);
