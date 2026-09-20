import { expect, test } from "@playwright/test";
import { comoAdmin, CUENTAS, limpiarRegistrosTest } from "../integracion/setup";

test.describe("Agenda y Proyección de Caja (E2E)", () => {
  const PREFIJO = "TEST-E2E-AGE-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("Caso 59 (§A.7): Atrasados -> Mismo número en la franja de Agenda y en el aviso de Hoy", async ({
    page,
  }) => {
    const admin = await comoAdmin();

    // 1. Crear un vencimiento con una instancia en fecha pasada (atrasada)
    const { data: venc, error: errVenc } = await admin
      .from("vencimientos")
      .insert({
        titulo: `${PREFIJO}Seguro de grúa atrasado`,
        proveedor: "La Segunda Seguros",
        monto_estimado: 60000,
        cuenta_sugerida_id: CUENTAS.galicia.id,
        ambito: "empresa",
        dia_del_mes: 5,
        activo: true,
      })
      .select("id")
      .single();

    expect(errVenc).toBeNull();
    expect(venc).toBeDefined();

    const tresDiasAtras = new Date();
    tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
    const fechaPasada = tresDiasAtras.toISOString().slice(0, 10);

    const { error: errInst } = await admin
      .from("vencimiento_instancias")
      .insert({
        vencimiento_id: venc!.id,
        fecha: fechaPasada,
        monto_estimado: 60000,
        estado: "pendiente",
      });

    expect(errInst).toBeNull();

    // 2. Navegar a Hoy (/) y capturar el texto de vencimientos atrasados
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Hoy", exact: true }),
    ).toBeVisible();

    const avisoHoyAtrasados = page.getByText(/vencimiento(s)? atrasado(s)?/i);
    await expect(avisoHoyAtrasados).toBeVisible();
    const textoAvisoHoy = (await avisoHoyAtrasados.textContent()) || "";
    // Extraer número de atrasados (ej. "1 vencimiento atrasado" -> "1")
    const matchHoy = textoAvisoHoy.match(/(\d+)\s+vencimiento/i);
    expect(matchHoy).not.toBeNull();
    const cantidadHoy = matchHoy![1];

    // 3. Navegar a /agenda y verificar que la franja ámbar muestra exactamente el mismo número
    await page.goto("/agenda");
    await expect(
      page.getByRole("heading", { name: "Agenda", exact: true }),
    ).toBeVisible();

    const bannerAgenda = page.getByText(
      new RegExp(`${cantidadHoy}\\s+vencimiento(s)?\\s+atrasado(s)?`, "i"),
    );
    await expect(bannerAgenda).toBeVisible();
  });

  test("Caso 60 (§A.7): Proyección de caja con día negativo muestra barra en rojo (.bg-peligro)", async ({
    page,
  }) => {
    const admin = await comoAdmin();
    const hoy = new Date();
    const dosDiasAdelante = new Date(hoy);
    dosDiasAdelante.setDate(dosDiasAdelante.getDate() + 2);
    const fechaCompromiso = dosDiasAdelante.toISOString().slice(0, 10);

    // 1. Crear un compromiso futuro con monto enorme (ej: 5.000.000) que exceda el saldo de caja
    // y fuerce una proyección negativa en los próximos 14 días
    const { data: vencGrande, error: errVenc } = await admin
      .from("vencimientos")
      .insert({
        titulo: `${PREFIJO}Pago extraordinario flota`,
        proveedor: "Proveedor Especial",
        monto_estimado: 5000000,
        cuenta_sugerida_id: CUENTAS.efectivo.id,
        ambito: "empresa",
        dia_del_mes: 15,
        activo: true,
      })
      .select("id")
      .single();

    expect(errVenc).toBeNull();
    expect(vencGrande).toBeDefined();

    const { error: errInst } = await admin
      .from("vencimiento_instancias")
      .insert({
        vencimiento_id: vencGrande!.id,
        fecha: fechaCompromiso,
        monto_estimado: 5000000,
        estado: "pendiente",
      });

    expect(errInst).toBeNull();

    // 2. Navegar a /agenda
    await page.goto("/agenda");
    await expect(
      page.getByRole("heading", { name: "Agenda", exact: true }),
    ).toBeVisible();

    // 3. Verificar que aparece la sección de proyección de caja
    await expect(
      page.getByText("Proyección de caja · próximos 14 días"),
    ).toBeVisible();

    // 4. Verificar aviso de descubierto en texto con clase .text-peligro
    await expect(page.getByText("Se proyecta descubierto")).toBeVisible();
    await expect(page.locator(".text-peligro").first()).toBeVisible();

    // 5. Verificar que existe una barra negativa dibujada con la clase de token .bg-peligro bajo el eje
    const barrasDescubierto = page.locator(".bg-peligro");
    await expect(barrasDescubierto.first()).toBeVisible();
  });
});
