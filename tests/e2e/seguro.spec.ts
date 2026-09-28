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

test.describe("Carga asegurada en traslados (E2E)", () => {
  const PREFIJO = "TEST-E2E-SEG-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("Traslado de $ 200.000 netos con seguro de $ 30.000 -> CC $ 224.793,39 neto, factura con dos renglones, total con IVA $ 272.000,00", async ({
    page,
    context,
  }) => {
    const hoy = obtenerFechaLocal();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // 1. Cargar traslado con carga asegurada en /servicios/nuevo
    await page.goto("/servicios/nuevo");
    await expect(
      page.getByRole("heading", { name: "Nuevo servicio" }),
    ).toBeVisible();

    // Seleccionar cliente Deza (Responsable Inscripto)
    await page.locator("#cliente").selectOption(CLIENTES.deza.id);

    // Activar toggle Carga asegurada
    const checkboxCargaAsegurada = page.locator("#carga_asegurada");
    await expect(checkboxCargaAsegurada).toBeVisible();
    await checkboxCargaAsegurada.check();

    // Completar precio del servicio e importe del seguro
    await page.locator("#monto").fill("200000");
    await page.locator("#seguro_importe").fill("30000");

    // Verificar desglose en vivo
    await expect(
      page.getByText("Total: servicio $ 200.000 + seguro $ 30.000"),
    ).toBeVisible();

    // Descripción
    const descServicio = `${PREFIJO}Traslado asegurado de autoelevador`;
    await page.locator("#descripcion").fill(descServicio);

    // Origen, destino y carga
    await page.locator("#origen").fill("Base Canning");
    await page.locator("#destino").fill("Planta Burzaco");
    await page.locator("#carga").fill("Autoelevador Yale 2.5t");

    // Estado inicial: Ya realizado para que impacte en cuenta corriente y facturación
    await page.getByRole("button", { name: "Ya realizado" }).click();
    await page.locator("#fecha_programada").fill("2026-08-31");

    // Guardar servicio
    await page.getByRole("button", { name: "Guardar servicio" }).click();

    // Redirección al detalle del servicio
    await page.waitForURL(/\/servicios\/[a-f0-9-]+(\?.*)?$/);

    // En el detalle del servicio:
    // - Chip Carga asegurada
    await expect(page.getByText("Carga asegurada").first()).toBeVisible();
    // - "incluye seguro $ 30.000" debajo del monto
    await expect(page.getByText("incluye seguro $ 30.000").first()).toBeVisible();
    // - Link para registrar factura de la aseguradora
    const linkFacturaAseguradora = page.getByRole("link", {
      name: /Registrar la factura de la aseguradora/i,
    }).first();
    await expect(linkFacturaAseguradora).toBeVisible();

    // 2. Verificar que el link abre Caja con los datos precargados
    await linkFacturaAseguradora.click();
    await page.waitForURL(/\/caja\?.*categoria=Seguros.*/);
    await expect(
      page.getByRole("heading", { name: "Caja", exact: true }),
    ).toBeVisible();

    // Verificar campos precargados en el formulario de movimiento de egreso
    await expect(page.locator("#monto_movimiento")).toHaveValue("30.000");
    await expect(page.locator("#comp_tipo")).toHaveValue("A");
    await expect(page.locator("#comp_neto")).toHaveValue("24.793,39");
    await expect(page.locator("#comp_iva")).toHaveValue("5.206,61");

    // 3. Verificar cuenta corriente en la ficha del cliente
    await page.goto(`/clientes/${CLIENTES.deza.id}`);
    await expect(
      page.getByRole("heading", { name: CLIENTES.deza.nombre }),
    ).toBeVisible();

    // Verificar que en movimientos figura "incluye seguro $ 30.000"
    await expect(page.getByText("incluye seguro $ 30.000").first()).toBeVisible();

    // El neto en cuenta corriente es $ 224.793,39
    await expect(page.getByText("$ 224.793,39").first()).toBeVisible();

    // 4. Facturación: Facturar servicio y verificar renglones
    await page.goto("/facturacion");
    await expect(
      page.getByRole("heading", { name: "Facturación", exact: true }),
    ).toBeVisible();

    // Ubicar el grupo del cliente y seleccionar el servicio
    await expect(page.getByText(descServicio)).toBeVisible();
    const checkboxServicio = page.locator("input[type='checkbox']").first();
    await checkboxServicio.check();

    // Abrir formulario de facturación
    const botonFacturar = page.getByRole("button", {
      name: /Facturar seleccionados|Registrar factura del portal/i,
    });
    await expect(botonFacturar).toBeEnabled();
    await botonFacturar.click();

    // Verificar que en el resumen del formulario figure "incluye seguro $ 30.000"
    await expect(page.getByText("incluye seguro $ 30.000").first()).toBeVisible();

    // Copiar datos para ARCA
    const botonCopiar = page.getByRole("button", {
      name: /Copiar datos para ARCA/i,
    });
    await expect(botonCopiar).toBeVisible();
    await botonCopiar.click();

    await expect(page.getByText("Copiado")).toBeVisible();

    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    const clipNorm = clipText.replace(/\u00a0/g, " ");
    // Dos renglones en servicios:
    // 1) Descripción por monto - monto_seguro ($ 200.000)
    // 2) Seguro de carga (IVA incluido: $ 30.000) por monto_seguro ($ 24.793,39)
    expect(clipNorm).toContain(`${descServicio} — $ 200.000`);
    expect(clipNorm).toContain("Seguro de carga (IVA incluido: $ 30.000) — $ 24.793,39");
    expect(clipNorm).toContain("Neto: $ 224.793,39");
    expect(clipNorm).toContain("IVA 21%: $ 47.206,61");
    expect(clipNorm).toContain("Total: $ 272.000");

    // Completar número de factura y guardar
    const numeroAleatorio = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    await page.locator("#numero_factura").fill(numeroAleatorio);
    await page
      .locator("#notas_factura")
      .fill(`${PREFIJO}Factura traslado asegurado`);

    const botonGuardar = page.getByRole("button", { name: "Guardar factura" });
    await botonGuardar.click();

    // Esperar a que el formulario guarde, se desmonte y el servicio salga de Pendientes
    await expect(botonCopiar).not.toBeVisible();
    await expect(page.locator("body")).not.toContainText(descServicio);

    // 5. Verificar en base de datos la factura registrada
    const admin = await comoAdmin();
    const { data: facturaDb, error: errFac } = await admin
      .from("facturas")
      .select("id, numero, neto, iva, total")
      .eq("numero", Number(numeroAleatorio))
      .single();

    expect(errFac).toBeNull();
    expect(facturaDb).toBeDefined();
    expect(Number(facturaDb?.neto)).toBe(224793.39);
    expect(Number(facturaDb?.iva)).toBe(47206.61);
    expect(Number(facturaDb?.total)).toBe(272000);
  });
});
