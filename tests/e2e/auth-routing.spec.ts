import { expect, test } from "@playwright/test";
import path from "node:path";

test.describe("Autenticación y Redirecciones de Rutas", () => {
  test("Caso 72 (§A.9): Anónimo a cualquier ruta va a /ingresar", async ({
    page,
  }) => {
    // 1. Intento de acceso a raíz
    await page.goto("/");
    await page.waitForURL((url) => url.pathname === "/ingresar");
    await expect(page.locator("#email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ingresar", exact: true }),
    ).toBeVisible();

    // 2. Intento de acceso a facturación
    await page.goto("/facturacion");
    await page.waitForURL((url) => url.pathname === "/ingresar");
    await expect(page.locator("#email")).toBeVisible();

    // 3. Intento de acceso a vista chofer
    await page.goto("/chofer");
    await page.waitForURL((url) => url.pathname === "/ingresar");
    await expect(page.locator("#email")).toBeVisible();
  });

  test("Caso 71 (§A.9): Chofer entra a /facturacion -> Redirigido a /chofer", async ({
    browser,
  }) => {
    const choferState = path.resolve(
      process.cwd(),
      "tests/e2e/.auth/chofer1.json",
    );
    const context = await browser.newContext({ storageState: choferState });
    const page = await context.newPage();

    // El chofer intenta acceder a una ruta restringida a oficina/admin
    await page.goto("/facturacion");
    await page.waitForURL((url) => url.pathname === "/chofer");
    expect(page.url()).toContain("/chofer");
    await expect(
      page.getByRole("button", { name: "Hoy", exact: true }),
    ).toBeVisible();

    await context.close();
  });
});
