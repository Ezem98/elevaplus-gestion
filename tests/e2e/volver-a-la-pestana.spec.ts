import { expect, test, type Page } from "@playwright/test";

// Simula que el usuario cambia de pestaña (o minimiza la PWA) un buen rato y vuelve.
// Al volver, Supabase ve el token por vencer, lo renueva y emite TOKEN_REFRESHED
// con un objeto de sesión nuevo.
async function irseYVolver(page: Page) {
  await page.evaluate(() => {
    const clave = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    if (!clave) throw new Error("No hay sesión de Supabase en localStorage");
    const sesion = JSON.parse(localStorage.getItem(clave)!);
    sesion.expires_at = Math.floor(Date.now() / 1000) + 5;
    localStorage.setItem(clave, JSON.stringify(sesion));
  });
  for (const estado of ["hidden", "visible"] as const) {
    await page.evaluate((valor) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => valor });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => valor === "hidden" });
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    }, estado);
    await page.waitForTimeout(300);
  }
}

test.describe("Volver a la pestaña (E2E)", () => {
  test("cambiar de pestaña y volver no recarga el formulario de cliente", async ({ page }) => {
    let pantallaCargando = false;
    await page.goto("/clientes/nuevo");
    await expect(page.getByRole("heading", { name: "Nuevo cliente" })).toBeVisible();

    await page.locator("#nombre").fill("TEST-E2E-PESTANA Cliente a medio cargar");

    // Si la pantalla se desmonta aparece "Cargando…" un instante
    await page.evaluate(() => {
      const observador = new MutationObserver(() => {
        if (document.body.innerText.includes("Cargando…")) {
          (window as unknown as { __seDesmonto: boolean }).__seDesmonto = true;
        }
      });
      observador.observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    await irseYVolver(page);
    // Dar tiempo a que Supabase termine de recuperar la sesión
    await page.waitForTimeout(1500);

    pantallaCargando = await page.evaluate(
      () => (window as unknown as { __seDesmonto?: boolean }).__seDesmonto === true,
    );
    expect(pantallaCargando).toBe(false);
    await expect(page.locator("#nombre")).toHaveValue("TEST-E2E-PESTANA Cliente a medio cargar");
    // Si se hubiera remontado, el formulario mostraría el aviso de borrador recuperado
    await expect(page.getByText("Recuperamos lo que estabas cargando")).not.toBeVisible();
  });
});
