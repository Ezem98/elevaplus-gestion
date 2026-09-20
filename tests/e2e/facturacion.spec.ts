import { expect, test } from "@playwright/test";
import {
  CLIENTES,
  comoAdmin,
  limpiarRegistrosTest,
} from "../integracion/setup";

test.describe("Facturación (E2E)", () => {
  const PREFIJO = "TEST-E2E-FAC-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("Casos 14, 18 y 19 (§A.2): Agrupación en Pendientes, copiar datos para ARCA y guardar factura manual", async ({
    page,
    context,
  }) => {
    const admin = await comoAdmin();
    const hoy = new Date().toISOString().slice(0, 10);

    // Otorgar permisos de portapapeles para el test del Caso 18
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // 1. Crear servicio terminado y facturable para el cliente con CUIT (Deza - Responsable Inscripto)
    const { data: serv, error: errServ } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "terminado",
        descripcion: `${PREFIJO}Traslado de autoelevador`,
        monto: 150000,
        aplica_iva: true,
        no_facturable: false,
        fecha_programada: hoy,
      })
      .select("id, numero")
      .single();

    expect(errServ).toBeNull();
    expect(serv).toBeDefined();

    // 2. Verificar que en la pantalla Hoy aparece aviso de servicio sin facturar
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Hoy", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /servicio(s)? sin facturar/i }).first(),
    ).toBeVisible();

    // 3. Caso 14: Navegar a /facturacion y verificar agrupación por cliente con CUIT y condición IVA
    await page.goto("/facturacion");
    await expect(
      page.getByRole("heading", { name: "Facturación", exact: true }),
    ).toBeVisible();

    // Pestaña Pendientes activa por defecto
    await expect(
      page.getByRole("button", { name: /Pendientes/i }),
    ).toBeVisible();

    // Encabezado del grupo: Nombre del cliente
    const linkCliente = page.getByRole("link", { name: CLIENTES.deza.nombre });
    await expect(linkCliente).toBeVisible();

    // CUIT del cliente
    await expect(page.getByText(`CUIT ${CLIENTES.deza.cuit}`)).toBeVisible();

    // Condición frente al IVA
    await expect(page.getByText("Responsable Inscripto")).toBeVisible();

    // Fila del servicio
    await expect(
      page.getByText(`${PREFIJO}Traslado de autoelevador`),
    ).toBeVisible();

    // 4. Seleccionar el servicio en el grupo para habilitar facturación
    const checkboxServicio = page.locator("input[type='checkbox']").first();
    await checkboxServicio.check();

    // Botón para registrar factura del portal / facturar seleccionados
    const botonFacturar = page.getByRole("button", {
      name: /Facturar seleccionados|Registrar factura del portal/i,
    });
    await expect(botonFacturar).toBeEnabled();
    await botonFacturar.click();

    // 5. Caso 18: Formulario abierto -> botón "Copiar datos para ARCA"
    const botonCopiar = page.getByRole("button", {
      name: /Copiar datos para ARCA/i,
    });
    await expect(botonCopiar).toBeVisible();
    await botonCopiar.click();

    // Verificar feedback visual de copiado
    await expect(page.getByText("Copiado")).toBeVisible();

    // Verificar contenido real del portapapeles
    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipText).toContain(`Razón social: ${CLIENTES.deza.nombre}`);
    expect(clipText).toContain(`CUIT: ${CLIENTES.deza.cuit}`);
    expect(clipText).toContain("Condición IVA: Responsable inscripto");
    expect(clipText).toContain("Servicios:");
    expect(clipText).toContain(`${PREFIJO}Traslado de autoelevador`);
    expect(clipText).toContain("Neto:");
    expect(clipText).toContain("IVA 21%:");
    expect(clipText).toContain("Total:");

    // 6. Caso 19: Completar formulario y guardar factura
    const numeroAleatorio = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    await page.locator("#numero_factura").fill(numeroAleatorio);
    await page
      .locator("#notas_factura")
      .fill(`${PREFIJO}Factura emitida en test E2E`);

    const botonGuardar = page.getByRole("button", { name: "Guardar factura" });
    await botonGuardar.click();

    // Esperar a que el formulario guarde y se desmonte
    await expect(botonGuardar).not.toBeVisible();

    // 7. Verificar que el servicio desaparece de la lista de Pendientes
    await expect(page.locator("body")).not.toContainText(
      `${PREFIJO}Traslado de autoelevador`,
    );

    // 8. Verificar en base de datos que el servicio pasó a 'facturado' y tiene factura_id asociada
    const { data: servDb } = await admin
      .from("servicios")
      .select("estado, factura_id")
      .eq("id", serv!.id)
      .single();

    expect(servDb?.estado).toBe("facturado");
    expect(servDb?.factura_id).not.toBeNull();

    // 9. Verificar que en la pantalla Hoy el servicio ya no cuenta como pendiente de facturar
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Hoy", exact: true }),
    ).toBeVisible();

    const { count: sinFacturarRestantes } = await admin
      .from("servicios")
      .select("id", { count: "exact", head: true })
      .in("estado", ["terminado", "cobrado"])
      .is("factura_id", null)
      .eq("no_facturable", false);

    if ((sinFacturarRestantes ?? 0) === 0) {
      await expect(
        page.getByRole("link", { name: /servicio(s)? sin facturar/i }),
      ).toHaveCount(0);
    }
  });
});
