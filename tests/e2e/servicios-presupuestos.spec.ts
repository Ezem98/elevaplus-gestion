import { expect, test } from "@playwright/test";
import {
  CLIENTES,
  comoAdmin,
  limpiarRegistrosTest,
} from "../integracion/setup";

test.describe("Servicios y Presupuestos (E2E)", () => {
  const PREFIJO = "TEST-E2E-PRE-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("Caso 26 (§A.3): Servicio presupuestado con cliente y monto -> aparece tarjeta Presupuesto con validez por defecto", async ({
    page,
  }) => {
    const admin = await comoAdmin();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Crear servicio en estado presupuestado con cliente y monto
    const { data: serv, error } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "presupuestado",
        descripcion: `${PREFIJO}Servicio con presupuesto listo`,
        monto: 85000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(serv).toBeDefined();

    // 2. Navegar al detalle del servicio como oficina
    await page.goto(`/servicios/${serv!.id}`);

    // 3. Verificar que aparece la tarjeta de Presupuesto
    const tarjetaPresupuesto = page
      .locator("div")
      .filter({ hasText: /^Presupuesto/ })
      .first();
    await expect(tarjetaPresupuesto).toBeVisible();

    // 4. Verificar validez por defecto (15 días)
    const inputValidez = page.locator("#validez_dias");
    await expect(inputValidez).toHaveValue("15");

    // 5. Verificar que el botón Descargar PDF está activo
    const botonPdf = page.getByRole("button", { name: /Descargar/i });
    await expect(botonPdf).toBeEnabled();
  });

  test("Caso 31 (§A.3): Servicio sin monto -> los tres botones deshabilitados con aviso", async ({
    page,
  }) => {
    const admin = await comoAdmin();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Crear servicio con cliente pero sin monto
    const { data: serv, error } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "consulta",
        descripcion: `${PREFIJO}Servicio sin monto definido`,
        monto: null,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(serv).toBeDefined();

    // 2. Navegar al detalle del servicio
    await page.goto(`/servicios/${serv!.id}`);

    // 3. Verificar aviso de carga de monto
    await expect(
      page.getByText("Cargá el monto para generar el presupuesto."),
    ).toBeVisible();

    // 4. Verificar que los tres botones están deshabilitados
    const botonMail = page.getByRole("button", { name: /Mail/i });
    const botonWhatsApp = page.getByRole("button", { name: /WhatsApp/i });
    const botonPdf = page.getByRole("button", { name: /Descargar/i });

    await expect(botonMail).toBeDisabled();
    await expect(botonWhatsApp).toBeDisabled();
    await expect(botonPdf).toBeDisabled();
  });
});
