import { expect, test } from "@playwright/test";
import { comoAdmin } from "../integracion/setup";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test.describe("Configuración de Empresa — Datos fiscales", () => {
  let originalIibb: string | null = null;
  let originalInicioActividades: string | null = null;

  test.beforeAll(async () => {
    const admin = await comoAdmin();
    const { data: emp, error } = await admin
      .from("empresa")
      .select("iibb, inicio_actividades")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      throw new Error(`Error al leer empresa antes de test E2E: ${error.message}`);
    }

    originalIibb = emp?.iibb ?? null;
    originalInicioActividades = emp?.inicio_actividades ?? null;
  });

  test.afterAll(async () => {
    const admin = await comoAdmin();
    const { error } = await admin
      .from("empresa")
      .update({
        iibb: originalIibb,
        inicio_actividades: originalInicioActividades,
      })
      .eq("id", 1);

    if (error) {
      throw new Error(`Error al restaurar empresa después del test E2E: ${error.message}`);
    }
  });

  test("Cargar datos fiscales (IIBB e inicio de actividades), guardar, recargar y verificar persistencia", async ({
    page,
  }) => {
    const admin = await comoAdmin();

    await page.goto("/configuracion");

    // Verificar que estamos en la pestaña Empresa
    await expect(
      page.getByRole("heading", { name: "Empresa", exact: true }),
    ).toBeVisible();

    const inputIibb = page.locator("#emp-iibb");
    const inputInicio = page.locator("#emp-inicio-actividades");

    await expect(inputIibb).toBeVisible();
    await expect(inputInicio).toBeVisible();

    const testIibb = "Convenio Multilateral 901-123456-7";
    const testFecha = "2020-05-15";

    // Completar los dos campos
    await inputIibb.fill(testIibb);
    await inputInicio.fill(testFecha);

    // Guardar
    const botonGuardar = page.getByRole("button", {
      name: "Guardar empresa",
      exact: true,
    });
    await botonGuardar.click();

    // Verificar aviso de éxito
    await expect(page.getByText("Guardado")).toBeVisible();

    // Recargar la página
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Empresa", exact: true }),
    ).toBeVisible();

    // Verificar que los valores persisten en los inputs
    await expect(inputIibb).toHaveValue(testIibb);
    await expect(inputInicio).toHaveValue(testFecha);

    // Verificar que los datos se guardaron efectivamente en la base de datos
    const { data: empGuardada, error: errGuardada } = await admin
      .from("empresa")
      .select("iibb, inicio_actividades")
      .eq("id", 1)
      .single();

    expect(errGuardada).toBeNull();
    expect(empGuardada?.iibb).toBe(testIibb);
    expect(empGuardada?.inicio_actividades).toBe(testFecha);
  });
});
