import { expect, test } from "@playwright/test";
import {
  CLIENTES,
  comoAdmin,
  CUENTAS,
  limpiarRegistrosTest,
} from "../integracion/setup";

test.describe("Caja y Saldos (E2E)", () => {
  const PREFIJO = "TEST-E2E-CAJA-";

  test.beforeEach(async () => {
    const admin = await comoAdmin();
    await admin.from("cobros").delete().ilike("referencia", `%${PREFIJO}%`);
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    const admin = await comoAdmin();
    await admin.from("cobros").delete().ilike("referencia", `%${PREFIJO}%`);
    await limpiarRegistrosTest(PREFIJO);
  });

  test("Caso 38 (§A.4): Cobro con cuenta asignada aparece en Movimientos como 'Cobro de servicio' sin menú de edición", async ({
    page,
  }) => {
    const admin = await comoAdmin();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Insertar un movimiento de caja normal para verificar que este SÍ tiene menú de acciones
    const { data: movNormal, error: errMov } = await admin
      .from("movimientos_caja")
      .insert({
        tipo: "egreso",
        ambito: "empresa",
        cuenta_id: CUENTAS.efectivo.id,
        monto: 12000,
        fecha: hoy,
        descripcion: `${PREFIJO}Gasto con menu de edicion`,
        estado: "pagado",
      })
      .select("id")
      .single();

    expect(errMov).toBeNull();
    expect(movNormal).toBeDefined();

    // 2. Insertar un cobro acreditado con cuenta asignada (Efectivo) y cliente
    const { data: cobro, error: errCobro } = await admin
      .from("cobros")
      .insert({
        cliente_id: CLIENTES.deza.id,
        monto: 75000,
        medio: "efectivo",
        cuenta_id: CUENTAS.efectivo.id,
        estado: "acreditado",
        fecha: hoy,
        fecha_acreditacion: hoy,
        referencia: `${PREFIJO}REF-COBRO`,
      })
      .select("id")
      .single();

    expect(errCobro).toBeNull();
    expect(cobro).toBeDefined();

    // 3. Navegar a /caja (pestaña movimientos)
    await page.goto("/caja?tab=movimientos");
    await expect(
      page.getByRole("heading", { name: "Caja", exact: true }),
    ).toBeVisible();

    // 4. Localizar la fila del cobro específico por su ID único en la tabla desktop
    const filaCobro = page.locator(`tr#movimiento-${cobro!.id}`);
    await expect(filaCobro).toBeVisible();

    // Verificar que el texto enlaza a /cobros?tab=todos
    const linkCobro = filaCobro.getByRole("link", { name: /Cobro/i });
    await expect(linkCobro).toBeVisible();
    await expect(linkCobro).toHaveAttribute("href", "/cobros?tab=todos");

    // Verificar que la fila del cobro NO tiene menú de acciones (cero botones dentro de la fila)
    const botonesFilaCobro = filaCobro.locator("button");
    await expect(botonesFilaCobro).toHaveCount(0);

    // 5. Comparar con la fila del movimiento normal: sí debe tener botón de menú de acciones
    const filaMovNormal = page.locator(`tr#movimiento-${movNormal!.id}`);
    await expect(filaMovNormal).toBeVisible();
    const botonMenuMov = filaMovNormal.locator("button");
    await expect(botonMenuMov).toBeVisible();
  });

  test("Caso 11 (§A.1): Saldo proyectado negativo en 'A cubrir' se muestra en rojo (.text-peligro)", async ({
    page,
  }) => {
    const admin = await comoAdmin();
    const hoy = new Date();
    // Mañana para estar dentro del rango de proyección
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const fechaManana = manana.toISOString().slice(0, 10);
    const hoyStr = hoy.toISOString().slice(0, 10);

    // 1. Crear un cheque propio emitido en cuenta Galicia (saldo inicial 0 en seed)
    // Al no haber fondos, la proyección de la cuenta será negativa (-$350.000)
    const numeroCheque = `${PREFIJO}350K`;
    const { data: chq, error: errChq } = await admin
      .from("cheques")
      .insert({
        tipo: "emitido",
        estado: "emitido",
        cuenta_id: CUENTAS.galicia.id,
        monto: 350000,
        fecha_emision: hoyStr,
        fecha_pago: fechaManana,
        numero: numeroCheque,
        pagado_a: "Proveedor Repuestos Test",
      })
      .select("id")
      .single();

    expect(errChq).toBeNull();
    expect(chq).toBeDefined();

    // 2. Navegar a /cobros -> pestaña Cheques -> subpestaña A cubrir
    await page.goto("/cobros?tab=cheques&subtab=cubrir");
    await expect(
      page.getByRole("heading", { name: "Cobros", exact: true }),
    ).toBeVisible();

    // Verificar que la subpestaña "A cubrir" está visible y activa
    const pestanaCubrir = page.getByRole("button", { name: /A cubrir/i });
    await expect(pestanaCubrir).toBeVisible();

    // 3. Localizar la fila del cheque en la tabla
    const filaCheque = page.locator("tr", { hasText: numeroCheque });
    await expect(filaCheque).toBeVisible();

    // 4. Verificar que el saldo proyectado muestra el icono ⚠️ y la clase de token .text-peligro
    const celdaSaldoProyectado = filaCheque.locator("span.text-peligro");
    await expect(celdaSaldoProyectado).toBeVisible();
    await expect(celdaSaldoProyectado).toContainText("⚠️");
    await expect(celdaSaldoProyectado).toContainText("−$ 350.000");
  });
});
