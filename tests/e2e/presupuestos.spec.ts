import { expect, test } from "@playwright/test";
import { limpiarRegistrosTest } from "../integracion/setup";

test.describe("Presupuestos (E2E)", () => {
  const PREFIJO = "TEST-E2E-PRE-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("Camino completo desde 'Nuevo presupuesto' hasta PDF y aceptación creando cliente nuevo", async ({
    page,
  }) => {
    const nombreProspecto = `${PREFIJO}Metalúrgica del Sur`;
    const telefonoProspecto = "11 3344 5566";
    const emailProspecto = "contacto@metalurgicadelsur.com.ar";
    const cuitProspecto = "30-71998877-4";

    // 1. Navegar a la lista de servicios con la pestaña de presupuestos
    await page.goto("/servicios?filtro=presupuestos");

    // 2. Hacer clic en "Nuevo presupuesto"
    const botonNuevo = page.getByRole("button", { name: /Nuevo presupuesto/i });
    await expect(botonNuevo).toBeVisible();
    await botonNuevo.click();

    // 3. Confirmar navegación a /presupuestos/nuevo
    await page.waitForURL("/presupuestos/nuevo");
    await expect(
      page.getByRole("heading", { name: "Nuevo presupuesto", exact: true }),
    ).toBeVisible();

    // 4. Seleccionar destinatario: "No es cliente todavía (prospecto)"
    await page
      .getByRole("button", { name: "No es cliente todavía (prospecto)" })
      .click();

    // Completar datos del prospecto
    await page.locator("#prospecto_nombre").fill(nombreProspecto);
    await page.locator("#prospecto_tel").fill(telefonoProspecto);
    await page.locator("#prospecto_email").fill(emailProspecto);
    await page.locator("#prospecto_cuit").fill(cuitProspecto);

    // 5. Agregar ítem de servicio (traslado)
    await page.getByRole("button", { name: "Agregar ítem" }).click();

    await page.locator("#item_orig").fill("Base Elevaplus");
    await page.locator("#item_dest").fill("Parque Industrial Burzaco");
    await page.locator("#item_desc").fill("Traslado autoelevador Hyster");
    await page.locator("#item_monto").fill("150000");

    // Confirmar el ítem
    await page.getByRole("button", { name: "Confirmar ítem" }).click();

    // Verificar que el ítem aparece en la tabla
    await expect(
      page.getByText("Traslado autoelevador Hyster"),
    ).toBeVisible();
    await expect(page.getByText("Base Elevaplus")).toBeVisible();
    await expect(page.getByText("Parque Industrial Burzaco")).toBeVisible();
    await expect(page.getByText("$ 150.000").first()).toBeVisible();

    // 6. Verificar sección de totales calculados en vivo
    await expect(page.getByText("Totales en Pesos (ARS)")).toBeVisible();
    await expect(page.getByText("$ 31.500").first()).toBeVisible(); // IVA 21%
    await expect(page.getByText("$ 181.500").first()).toBeVisible(); // Total con IVA

    // 7. Guardar y generar PDF
    const botonGuardarPdf = page.getByRole("button", {
      name: "Guardar y generar PDF",
    });
    await expect(botonGuardarPdf).toBeEnabled();
    await botonGuardarPdf.click();

    // 8. Esperar redirección al detalle del presupuesto /presupuestos/:id
    await page.waitForURL(/\/presupuestos\/[a-f0-9-]+$/);

    // 9. Verificar datos en la pantalla del presupuesto
    await expect(
      page.getByRole("heading", { name: /Presupuesto #\d+/i }),
    ).toBeVisible();
    await expect(page.getByText("Prospecto").first()).toBeVisible();
    await expect(page.getByText(nombreProspecto).first()).toBeVisible();

    // El estado calculado debe ser "Enviado" tras la generación
    await expect(page.getByText("Enviado").first()).toBeVisible();

    // Verificar totales en la vista de detalle
    await expect(page.getByText("$ 181.500").first()).toBeVisible();

    // 10. Verificar disponibilidad del PDF
    const botonDescargarPdf = page.getByRole("button", {
      name: "Descargar PDF",
    });
    await expect(botonDescargarPdf).toBeVisible();
    await expect(botonDescargarPdf).toBeEnabled();

    // Debe mostrarse el enlace "Ver PDF actual" con la URL firmada generada
    const linkVerPdf = page.getByRole("link", { name: "Ver PDF actual" });
    await expect(linkVerPdf).toBeVisible();
    await expect(linkVerPdf).toHaveAttribute("href", /token=/);

    // 11. Verificar que el PDF fue subido al storage y es accesible y válido
    const hrefPdf = await linkVerPdf.getAttribute("href");
    expect(hrefPdf).toBeTruthy();
    const resPdf = await page.request.get(hrefPdf!);
    expect(resPdf.status()).toBe(200);
    expect(resPdf.headers()["content-type"]).toContain("application/pdf");

    // Probar click en Descargar PDF
    await botonDescargarPdf.click();
    await expect(botonDescargarPdf).toBeEnabled();

    // 12. Aceptar el presupuesto creando el cliente nuevo desde la interfaz (§4.3)
    const botonAceptado = page.getByRole("button", { name: "Aceptado" });
    await expect(botonAceptado).toBeVisible();
    await botonAceptado.click();

    // Si el algoritmo de duplicados detecta coincidencias, pulsar "No, crear cliente nuevo"
    const botonNoCrearNuevo = page.getByRole("button", {
      name: "No, crear cliente nuevo",
    });
    if (await botonNoCrearNuevo.isVisible({ timeout: 1500 }).catch(() => false)) {
      await botonNoCrearNuevo.click();
    }

    // Debe abrirse el formulario inline para crear cliente nuevo
    await expect(
      page.getByText("Crear cliente nuevo desde prospecto"),
    ).toBeVisible();

    // Los campos deben venir precompletados con los datos del prospecto
    await expect(page.locator("#nc_nombre")).toHaveValue(nombreProspecto);
    await expect(page.locator("#nc_cuit")).toHaveValue(cuitProspecto);
    await expect(page.locator("#nc_tel")).toHaveValue(telefonoProspecto);
    await expect(page.locator("#nc_email")).toHaveValue(emailProspecto);

    // Guardar cliente y aceptar presupuesto
    const botonGuardarYAceptar = page.getByRole("button", {
      name: "Guardar cliente y aceptar presupuesto",
    });
    await expect(botonGuardarYAceptar).toBeVisible();
    await botonGuardarYAceptar.click();

    // Verificar que el presupuesto pasó a estado "Aceptado"
    await expect(page.getByText("Aceptado").first()).toBeVisible();

    // Ya no debe mostrar la etiqueta "Prospecto", sino el link al cliente creado
    await expect(
      page.getByRole("link", { name: nombreProspecto }).first(),
    ).toBeVisible();

    // Y el ítem en la tabla debe mostrar chip "Aceptado"
    await expect(
      page.locator("span", { hasText: /^Aceptado$/ }).first(),
    ).toBeVisible();
  });

  test("Crear presupuesto y rechazarlo desde la interfaz cancelando sus ítems", async ({
    page,
  }) => {
    const nombreProspectoRechazo = `${PREFIJO}Rechazo Logística`;

    // 1. Ir a nuevo presupuesto
    await page.goto("/presupuestos/nuevo");

    // 2. Destinatario prospecto
    await page
      .getByRole("button", { name: "No es cliente todavía (prospecto)" })
      .click();
    await page.locator("#prospecto_nombre").fill(nombreProspectoRechazo);

    // 3. Agregar ítem
    await page.getByRole("button", { name: "Agregar ítem" }).click();
    await page.locator("#item_orig").fill("Canning");
    await page.locator("#item_dest").fill("Lanús");
    await page.locator("#item_desc").fill("Flete corto autoelevador");
    await page.locator("#item_monto").fill("80000");
    await page.getByRole("button", { name: "Confirmar ítem" }).click();

    // 4. Guardar como borrador
    const botonBorrador = page.getByRole("button", { name: "Guardar borrador" });
    await expect(botonBorrador).toBeEnabled();
    await botonBorrador.click();

    // 5. Redirección a detalle
    await page.waitForURL(/\/presupuestos\/[a-f0-9-]+$/);
    await expect(page.getByText("Borrador").first()).toBeVisible();

    // 6. Rechazar presupuesto (manejando el confirm)
    page.once("dialog", (dialog) => dialog.accept());
    const botonRechazado = page.getByRole("button", { name: "Rechazado" });
    await expect(botonRechazado).toBeVisible();
    await botonRechazado.click();

    // 7. Verificar que el estado del presupuesto cambió a "Rechazado"
    await expect(page.getByText("Rechazado").first()).toBeVisible();

    // Y el ítem pasó a "Cancelado"
    await expect(
      page.locator("span", { hasText: /^Cancelado$/ }).first(),
    ).toBeVisible();
  });

  test("Agregar un ítem desde el cotizador a un presupuesto existente", async ({
    page,
  }) => {
    const nombreProspectoCotiz = `${PREFIJO}Agropecuaria Pampeana`;

    // 1. Crear presupuesto inicial en borrador
    await page.goto("/presupuestos/nuevo");
    await page
      .getByRole("button", { name: "No es cliente todavía (prospecto)" })
      .click();
    await page.locator("#prospecto_nombre").fill(nombreProspectoCotiz);

    // Agregar un ítem manual
    await page.getByRole("button", { name: "Agregar ítem" }).click();
    await page.locator("#item_orig").fill("Planta Central");
    await page.locator("#item_dest").fill("Depósito Chacras");
    await page.locator("#item_desc").fill("Movimiento de zorra eléctrica");
    await page.locator("#item_monto").fill("60000");
    await page.getByRole("button", { name: "Confirmar ítem" }).click();

    // Guardar borrador
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await page.waitForURL(/\/presupuestos\/[a-f0-9-]+$/);

    await expect(page.getByText("Movimiento de zorra eléctrica")).toBeVisible();

    // 2. Navegar al cotizador desde el presupuesto
    const botonCotizar = page.getByRole("button", {
      name: "Cotizar un traslado",
    });
    await expect(botonCotizar).toBeVisible();
    await botonCotizar.click();

    // 3. Confirmar que estamos en el cotizador con ?presupuesto=
    await page.waitForURL(/\/cotizador\?presupuesto=[a-f0-9-]+$/);
    await expect(
      page.getByRole("heading", { name: "Cotizador", exact: true }),
    ).toBeVisible();

    // 4. Modificar distancia a 40 km
    const inputKm = page.locator("#km");
    await inputKm.fill("40");

    // 5. Agregar al presupuesto
    const botonAgregarAlPresupuesto = page.getByRole("button", {
      name: /Agregar al presupuesto por/i,
    });
    await expect(botonAgregarAlPresupuesto).toBeVisible();
    await expect(botonAgregarAlPresupuesto).toBeEnabled();
    await botonAgregarAlPresupuesto.click();

    // 6. Confirmar regreso al detalle del presupuesto
    await page.waitForURL(/\/presupuestos\/[a-f0-9-]+$/);

    // 7. Verificar que ambos ítems están presentes
    await expect(page.getByText("Movimiento de zorra eléctrica")).toBeVisible();
    await expect(page.getByText(/Traslado cotizado —.*40 km/i)).toBeVisible();
  });
});
