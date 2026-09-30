import { expect, test } from "@playwright/test";
import {
  CLIENTES,
  comoAdmin,
  limpiarRegistrosTest,
} from "../integracion/setup";

test.describe("Borradores automáticos (E2E)", () => {
  const PREFIJO = "TEST-E2E-BORRADOR-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("llenar el formulario de servicio, recargar, y ver los datos recuperados", async ({
    page,
  }) => {
    // 1. Ir al formulario de nuevo servicio
    await page.goto("/servicios/nuevo");
    await expect(
      page.getByRole("heading", { name: "Nuevo servicio" }),
    ).toBeVisible();

    // 2. Llenar campos del formulario
    await page.locator("#origen").fill("Base Canning 1234");
    await page.locator("#destino").fill("Planta Monte Grande 567");
    await page.locator("#carga").fill("Autoelevador Yale 2.5tn");

    // 3. Esperar a que transcurran los 2 segundos para que guarde useBorrador
    await page.waitForTimeout(2500);

    // 4. Recargar la página
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Nuevo servicio" }),
    ).toBeVisible();

    // 5. Verificar aviso de recuperación y botón Descartar
    await expect(
      page.getByText("Recuperamos lo que estabas cargando"),
    ).toBeVisible();
    const botonDescartar = page.getByRole("button", { name: "Descartar" });
    await expect(botonDescartar).toBeVisible();

    // 6. Verificar que los datos cargados fueron restaurados
    await expect(page.locator("#origen")).toHaveValue("Base Canning 1234");
    await expect(page.locator("#destino")).toHaveValue("Planta Monte Grande 567");
    await expect(page.locator("#carga")).toHaveValue("Autoelevador Yale 2.5tn");

    // 7. Al descartar, se limpia el aviso y el formulario
    await botonDescartar.click();
    await expect(
      page.getByText("Recuperamos lo que estabas cargando"),
    ).not.toBeVisible();
    await expect(page.locator("#origen")).toHaveValue("");
    await expect(page.locator("#destino")).toHaveValue("");
    await expect(page.locator("#carga")).toHaveValue("");
  });

  test("empezar el cobro de un servicio, abrir el de otro servicio del mismo cliente, y verificar que no recupera el borrador", async ({
    page,
  }) => {
    const admin = await comoAdmin();
    const hoy = new Date().toISOString().slice(0, 10);

    // Crear dos servicios con saldo pendiente para el mismo cliente
    const { data: serv1, error: err1 } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "terminado",
        descripcion: `${PREFIJO}Servicio 1 Cobro`,
        monto: 60000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    const { data: serv2, error: err2 } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "terminado",
        descripcion: `${PREFIJO}Servicio 2 Cobro`,
        monto: 80000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    expect(err1).toBeNull();
    expect(err2).toBeNull();
    expect(serv1).toBeDefined();
    expect(serv2).toBeDefined();

    // 1. Abrir cobro del servicio 1
    await page.goto(`/servicios/${serv1!.id}?cobrar=1`);
    await expect(page.getByRole("heading", { name: "Registrar cobro" })).toBeVisible();

    // 2. Empezar a cargar datos en el cobro: seleccionar Transferencia y poner referencia
    await page.getByRole("button", { name: "Transferencia" }).click();
    await page.locator("#ref_transf").fill("OP-TRANSF-SERV-1");

    // 3. Esperar a que se guarde el borrador (2s debounce)
    await page.waitForTimeout(2500);

    // 4. Abrir el cobro de otro servicio del mismo cliente
    await page.goto(`/servicios/${serv2!.id}?cobrar=1`);
    await expect(page.getByRole("heading", { name: "Registrar cobro" })).toBeVisible();

    // 5. Verificar que NO recupera el borrador del servicio 1
    await expect(
      page.getByText("Recuperamos lo que estabas cargando"),
    ).not.toBeVisible();

    // 6. Volver al servicio 1 y verificar que sí recupera su propio borrador
    await page.goto(`/servicios/${serv1!.id}?cobrar=1`);
    await expect(page.getByRole("heading", { name: "Registrar cobro" })).toBeVisible();
    await expect(
      page.getByText("Recuperamos lo que estabas cargando"),
    ).toBeVisible();
    await expect(page.locator("#ref_transf")).toHaveValue("OP-TRANSF-SERV-1");

    // 7. Descartar borrador y verificar limpieza
    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(
      page.getByText("Recuperamos lo que estabas cargando"),
    ).not.toBeVisible();
  });
});
