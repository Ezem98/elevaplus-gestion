import { expect, test } from "@playwright/test";
import {
  CLIENTES,
  comoAdmin,
  limpiarRegistrosTest,
} from "../integracion/setup";

function obtenerFechaLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

test.describe("Moneda en Alquileres y Facturación (E2E)", () => {
  const PREFIJO = "TEST-E2E-MON-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("Cargar alquiler mensual en U$S 1.500 a 1.250, ver $ 1.875.000 en CC, facturar a 1.300 y verificar $ 1.950.000", async ({
    page,
  }) => {
    const hoy = obtenerFechaLocal();

    // 1. Cargar alquiler mensual en /servicios/nuevo
    await page.goto("/servicios/nuevo");
    await expect(
      page.getByRole("heading", { name: "Nuevo servicio" }),
    ).toBeVisible();

    // Cambiar tipo a Alquiler por período
    await page.getByRole("button", { name: "Alquiler por período" }).click();

    // Seleccionar cliente Deza
    await page.locator("#cliente").selectOption(CLIENTES.deza.id);

    // Seleccionar primera máquina disponible
    await page.locator("#maquina_periodo").selectOption({ index: 1 });

    // Dirección de trabajo
    await page.locator("#direccion_trabajo").fill("Parque Industrial Burzaco");

    // Fechas desde y hasta (período concluido en el pasado para carga retroactiva)
    await page.locator("#fecha_desde").fill("2026-08-01");
    await page.locator("#fecha_hasta").fill("2026-08-31");

    // Seleccionar unidad Mes
    await page.getByRole("button", { name: "Mes" }).click();

    // Desmarcar Aplica IVA para que neto y total coincidan con el monto del servicio
    await page.locator("#aplica_iva").uncheck();

    // Verificar que el selector de moneda está en Dólares (U$S) por defecto
    const botonUsd = page.getByRole("button", { name: "Dólares (U$S)" });
    await expect(botonUsd).toHaveAttribute("aria-pressed", "true");

    // Completar Monto en U$S y Cotización
    await page.locator("#monto_moneda").fill("1500");
    await page.locator("#cotizacion").fill("1250");

    // Verificar equivalencia en vivo
    await expect(
      page.getByText("Equivalente en pesos: $ 1.875.000"),
    ).toBeVisible();

    // Descripción
    await page.locator("#descripcion").fill(`${PREFIJO}Alquiler mensual USD`);

    // Estado inicial: Ya realizado (terminado) para que impacte en la cuenta corriente y en Facturación
    await page.getByRole("button", { name: "Ya realizado" }).click();
    await page.locator("#fecha_programada").fill("2026-08-31");

    // Guardar servicio
    await page.getByRole("button", { name: "Guardar servicio" }).click();

    // Redirección al detalle del servicio
    await page.waitForURL(/\/servicios\/[a-f0-9-]+$/);

    // En el detalle del servicio: visualización de "U$S 1.500" y "$ 1.875.000 a $ 1.250"
    await expect(page.getByText("U$S 1.500").first()).toBeVisible();
    await expect(page.getByText("$ 1.875.000 a $ 1.250").first()).toBeVisible();

    // 2. Ver $ 1.875.000 en la cuenta corriente del cliente
    await page.goto(`/clientes/${CLIENTES.deza.id}`);
    await expect(
      page.getByRole("heading", { name: CLIENTES.deza.nombre }),
    ).toBeVisible();

    // Tarjeta Saldo / Facturado muestra $ 1.875.000
    await expect(page.getByText("$ 1.875.000").first()).toBeVisible();

    // Movimientos del cliente muestra el servicio en USD con su equivalente
    await expect(page.getByText("U$S 1.500").first()).toBeVisible();
    await expect(page.getByText("$ 1.875.000 a $ 1.250").first()).toBeVisible();

    // 3. Facturación: facturarlo cambiando la cotización a 1.300
    await page.goto("/facturacion");
    await expect(
      page.getByRole("heading", { name: "Facturación", exact: true }),
    ).toBeVisible();

    // Ubicar el grupo del cliente y seleccionar el servicio
    await expect(page.getByText(`${PREFIJO}Alquiler mensual USD`)).toBeVisible();
    const checkboxServicio = page.locator("input[type='checkbox']:not([title])").first();
    await checkboxServicio.check();

    // Abrir formulario de facturación
    const botonFacturar = page.getByRole("button", {
      name: /Facturar seleccionados|Registrar factura del portal/i,
    });
    await expect(botonFacturar).toBeEnabled();
    await botonFacturar.click();

    // Formulario abierto: fila con cotización editable
    const inputCotiz = page.getByTestId("cotizacion-factura");
    await expect(inputCotiz).toBeVisible();
    await expect(inputCotiz).toHaveValue("1250");

    // Cambiar cotización a 1300
    await inputCotiz.fill("1300");

    // Verificar recálculo en el desglose de totales
    await expect(page.getByText("Total: $ 1.950.000")).toBeVisible();

    // Completar número de factura y notas
    const numeroAleatorio = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    await page.locator("#numero_factura").fill(numeroAleatorio);
    await page
      .locator("#notas_factura")
      .fill(`${PREFIJO}Factura emitida en test E2E`);

    // Guardar factura
    const botonGuardar = page.getByRole("button", { name: "Guardar factura" });
    await botonGuardar.click();

    // Esperar a que se guarde la factura, desmonte el formulario y el servicio salga de Pendientes
    const botonCopiar = page.getByRole("button", {
      name: /Copiar datos para ARCA/i,
    });
    await expect(botonCopiar).not.toBeVisible();
    await expect(
      page.getByText(`${PREFIJO}Alquiler mensual USD`),
    ).toHaveCount(0);

    // 4. Verificar que la cuenta corriente del cliente quedó en $ 1.950.000
    await page.goto(`/clientes/${CLIENTES.deza.id}`);
    await expect(
      page.getByRole("heading", { name: CLIENTES.deza.nombre }),
    ).toBeVisible();

    await expect(page.getByText("$ 1.950.000").first()).toBeVisible();
    await expect(page.getByText("$ 1.950.000 a $ 1.300")).toBeVisible();

    // 5. Verificar que la factura en base de datos quedó en $ 1.950.000
    const admin = await comoAdmin();
    const { data: facturaDb, error: errFac } = await admin
      .from("facturas")
      .select("id, numero, neto, iva, total")
      .eq("numero", Number(numeroAleatorio))
      .single();

    expect(errFac).toBeNull();
    expect(facturaDb).toBeDefined();
    expect(Number(facturaDb?.total)).toBe(1950000);
    expect(Number(facturaDb?.neto)).toBe(1950000);
  });
});
