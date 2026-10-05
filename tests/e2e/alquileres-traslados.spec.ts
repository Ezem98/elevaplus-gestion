import { expect, test } from "@playwright/test";
import {
  CLIENTES,
  comoAdmin,
  limpiarRegistrosTest,
  USUARIOS,
} from "../integracion/setup";

function obtenerFechaLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

test.describe("Alquileres y Traslados vinculados (E2E)", () => {
  const PREFIJO = "TEST-E2E-ALQ-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("alquiler por hora con traslado incluido creado en el momento con chofer (el chofer lo ve con la dirección y el trabajo)", async ({
    page,
    browser,
  }) => {
    const hoy = obtenerFechaLocal();
    const direccionTest = `${PREFIJO}Av. San Martín 1234`;
    const trabajoTest = `${PREFIJO}Descarga de contenedor 40'`;

    // 1. Ir a Nuevo servicio
    await page.goto("/servicios/nuevo");
    await expect(
      page.getByRole("heading", { name: "Nuevo servicio" }),
    ).toBeVisible();

    // 2. Elegir tipo Alquiler por hora
    await page.getByRole("button", { name: "Alquiler por hora" }).click();

    // 3. Seleccionar cliente Deza
    await page.locator("#cliente").selectOption(CLIENTES.deza.id);

    // 4. Seleccionar máquina
    await page.locator("#maquina").selectOption({ index: 1 });

    // 5. Horas estimadas
    await page.locator("#horas_estimadas").fill("4");

    // 6. Dirección y localidad de trabajo
    await page.locator("#direccion_trabajo").fill(direccionTest);
    await page.locator("#localidad_trabajo").fill("Burzaco");

    // 7. Trabajo a realizar con chip y texto personalizado
    await page.getByRole("button", { name: "Descarga", exact: true }).click();
    await page.locator("#trabajo_a_realizar").fill(trabajoTest);

    // 8. Traslado de la máquina: Incluido en el precio
    await page.getByRole("button", { name: "Incluido en el precio" }).click();

    // 9. Asignar Chofer 1 al traslado
    await page
      .getByRole("button", { name: USUARIOS.chofer1.nombre })
      .click();

    // 10. Fecha programada del alquiler (hoy)
    await page.locator("#fecha_programada").fill(hoy);

    // 11. Guardar servicio
    await page.getByRole("button", { name: "Guardar servicio" }).click();

    // 12. Redirección al detalle del alquiler creado
    await page.waitForURL(/\/servicios\/[a-f0-9-]+$/);
    const urlAlquiler = page.url();
    const rentalId = urlAlquiler.split("/").pop();
    expect(rentalId).toBeDefined();

    // 13. Abrir sesión del Chofer 1 y verificar que ve el traslado con la dirección y el trabajo
    const choferContext = await browser.newContext({
      storageState: "tests/e2e/.auth/chofer1.json",
      viewport: { width: 390, height: 844 },
    });
    const choferPage = await choferContext.newPage();
    await choferPage.goto("/chofer");

    // En la vista del chofer debe figurar la tarjeta del traslado con:
    // - El trabajo a realizar
    await expect(choferPage.getByText(trabajoTest)).toBeVisible();
    // - La dirección de trabajo
    await expect(choferPage.getByText(direccionTest)).toBeVisible();
    // - La identificación de traslado de máquina
    await expect(
      choferPage.getByText(/Traslado de (la )?máquina/i).first(),
    ).toBeVisible();

    await choferContext.close();
  });

  test("alquiler con traslado aparte sin precio (queda en terminado al terminarse, no en cobrado)", async ({
    page,
  }) => {
    const hoy = obtenerFechaLocal();
    const direccionTest = `${PREFIJO}Calle Falsa 123`;
    const trabajoTest = `${PREFIJO}Carga de autoelevador`;

    // 1. Ir a Nuevo servicio
    await page.goto("/servicios/nuevo");
    await expect(
      page.getByRole("heading", { name: "Nuevo servicio" }),
    ).toBeVisible();

    // 2. Elegir tipo Alquiler por hora
    await page.getByRole("button", { name: "Alquiler por hora" }).click();

    // 3. Seleccionar cliente Deza
    await page.locator("#cliente").selectOption(CLIENTES.deza.id);

    // 4. Seleccionar máquina
    await page.locator("#maquina").selectOption({ index: 1 });

    // 5. Dirección y localidad
    await page.locator("#direccion_trabajo").fill(direccionTest);

    // 6. Trabajo a realizar con chip "Carga"
    await page.getByRole("button", { name: "Carga", exact: true }).click();
    await page.locator("#trabajo_a_realizar").fill(trabajoTest);

    // 7. Traslado de la máquina: Se cobra aparte
    await page.getByRole("button", { name: "Se cobra aparte" }).click();

    // 8. Verificar aviso: "El traslado queda sin precio: acordate de cargarlo antes de facturar"
    await expect(
      page.getByText(
        "El traslado queda sin precio: acordate de cargarlo antes de facturar",
      ),
    ).toBeVisible();

    // No se ingresa precio (queda sin precio / null)

    // 9. Fecha programada
    await page.locator("#fecha_programada").fill(hoy);

    // 10. Guardar servicio
    await page.getByRole("button", { name: "Guardar servicio" }).click();

    // 11. Redirección al detalle del alquiler
    await page.waitForURL(/\/servicios\/[a-f0-9-]+$/);
    const urlAlquiler = page.url();
    const rentalId = urlAlquiler.split("/").pop();
    expect(rentalId).toBeDefined();

    // 12. Verificar en la base de datos que el traslado se creó vinculado, aparte, y con monto null
    const admin = await comoAdmin();
    const { data: traslado, error: errT } = await admin
      .from("servicios")
      .select("id, estado, monto, traslado_incluido, no_facturable, vinculado_a")
      .eq("vinculado_a", rentalId!)
      .single();

    expect(errT).toBeNull();
    expect(traslado).toBeDefined();
    expect(traslado.vinculado_a).toBe(rentalId);
    expect(traslado.traslado_incluido).toBe(false);
    expect(traslado.no_facturable).toBe(false);
    expect(traslado.monto).toBeNull();

    // 13. Pasar el traslado a en_curso y luego a terminado vía RPC cambiar_estado
    const { error: errEnCurso } = await admin.rpc("cambiar_estado", {
      p_servicio_id: traslado.id,
      p_nuevo: "en_curso",
    });
    expect(errEnCurso).toBeNull();

    const { error: errTerminado } = await admin.rpc("cambiar_estado", {
      p_servicio_id: traslado.id,
      p_nuevo: "terminado",
    });
    expect(errTerminado).toBeNull();

    // 14. Verificar que el traslado queda en 'terminado' y NO en 'cobrado' (porque no tiene monto)
    const { data: trasladoFinal, error: errFinal } = await admin
      .from("servicios")
      .select("estado")
      .eq("id", traslado.id)
      .single();

    expect(errFinal).toBeNull();
    expect(trasladoFinal?.estado).toBe("terminado");
  });
});
