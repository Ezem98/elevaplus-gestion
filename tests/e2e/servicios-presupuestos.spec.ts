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

  test("Caso Retroactivo: Cargar servicio con fecha de hace 10 días como ya realizado y cobrado -> aparece en Todos, en Cobrados y en la semana correcta de Caja", async ({
    page,
  }) => {
    // 10 días atrás en formato YYYY-MM-DD
    const d = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const fechaDiezDiasAtras = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");

    // Lunes de la semana de esa fecha
    const diaSemana = d.getDay();
    const diffLunes = (diaSemana + 6) % 7;
    const dLunes = new Date(d);
    dLunes.setDate(d.getDate() - diffLunes);
    const lunesSemana = [
      dLunes.getFullYear(),
      String(dLunes.getMonth() + 1).padStart(2, "0"),
      String(dLunes.getDate()).padStart(2, "0"),
    ].join("-");

    const descTest = `${PREFIJO}Retro-${Date.now()}`;

    // 1. Navegar a nuevo servicio
    await page.goto("/servicios/nuevo");

    // 2. Seleccionar cliente
    await page.locator("#cliente").selectOption(CLIENTES.deza.id);

    // 3. Completar campos de traslado
    await page.locator("#origen").fill("Base Elevaplus");
    await page.locator("#destino").fill("Planta Pilar");
    await page.locator("#carga").fill("Autoelevador 2.5t");
    await page.locator("#descripcion").fill(descTest);

    // 4. Ingresar fecha de hace 10 días
    await page.locator("#fecha_programada").fill(fechaDiezDiasAtras);

    // 5. Verificar aviso y preselección de 'Ya realizado'
    await expect(
      page.getByText("La fecha es pasada: se carga como servicio ya realizado"),
    ).toBeVisible();
    const botonRealizado = page.getByRole("button", { name: /Ya realizado/i });
    await expect(botonRealizado).toHaveAttribute("aria-pressed", "true");

    // 6. Ingresar monto y marcar ¿Ya se cobró?
    await page.locator("#monto").fill("45000");
    await page.getByLabel("¿Ya se cobró?").check();

    // 7. Guardar servicio
    await page.getByRole("button", { name: "Guardar servicio" }).click();

    // 8. Se redirige al detalle con ?cobrar=1 y se abre FormularioCobro
    await page.waitForURL(/\/servicios\/[a-f0-9-]+(\?.*)?/);
    await expect(page.locator("#fecha_cobro")).toBeVisible();
    await expect(page.locator("#fecha_cobro")).toHaveValue(fechaDiezDiasAtras);

    // 9. Confirmar cobro
    await page.getByRole("button", { name: "Guardar cobro" }).click();
    await expect(page.locator("#fecha_cobro")).not.toBeVisible();

    // 10. Verificar que aparece en /servicios con filtro Todos
    await page.goto("/servicios?filtro=todos");
    await expect(
      page.locator("table").getByText(CLIENTES.deza.nombre).first(),
    ).toBeVisible();
    await expect(
      page.locator("table").getByText("$ 45.000").first(),
    ).toBeVisible();

    // 11. Verificar que aparece en /servicios con filtro Cobrados
    await page.goto("/servicios?filtro=cobrados");
    await expect(
      page.locator("table").getByText(CLIENTES.deza.nombre).first(),
    ).toBeVisible();
    await expect(
      page.locator("table").getByText("Cobrado").first(),
    ).toBeVisible();

    // 12. Verificar que aparece en la semana correcta de Caja
    await page.goto(`/caja?tab=resumen&periodo=semana&desde=${lunesSemana}`);
    await expect(page.getByText("Movimientos de la semana")).toBeVisible();
    await expect(
      page.locator("table").getByText(CLIENTES.deza.nombre).first(),
    ).toBeVisible();
  });

  test("Caso Alquiler Retroactivo En Curso: alquiler mensual que empezó hace 10 días y termina en 20 queda en curso, máquina en alquilada, y no aparece en sin cerrar", async ({
    page,
  }) => {
    // 10 días atrás en formato YYYY-MM-DD
    const dDesde = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const fechaDesde = [
      dDesde.getFullYear(),
      String(dDesde.getMonth() + 1).padStart(2, "0"),
      String(dDesde.getDate()).padStart(2, "0"),
    ].join("-");

    // 20 días adelante en formato YYYY-MM-DD
    const dHasta = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const fechaHasta = [
      dHasta.getFullYear(),
      String(dHasta.getMonth() + 1).padStart(2, "0"),
      String(dHasta.getDate()).padStart(2, "0"),
    ].join("-");

    const descTest = `${PREFIJO}AlqRetro-${Date.now()}`;

    // 1. Navegar a nuevo servicio
    await page.goto("/servicios/nuevo");

    // 2. Cambiar tipo a alquiler_periodo
    await page.getByRole("button", { name: "Alquiler por período" }).click();

    // 3. Seleccionar cliente
    await page.locator("#cliente").selectOption(CLIENTES.deza.id);

    // 4. Seleccionar máquina disponible (AE-01 o primera disponible)
    await page.locator("#maquina_periodo").selectOption({ index: 1 });

    // 5. Cargar fechas desde y hasta
    await page.locator("#fecha_desde").fill(fechaDesde);
    await page.locator("#fecha_hasta").fill(fechaHasta);

    // 6. Verificar aviso y preselección de 'En curso desde el dd/mm'
    await expect(
      page.getByText("El alquiler empezó antes de hoy y sigue vigente"),
    ).toBeVisible();

    const diaDesdeStr = String(dDesde.getDate()).padStart(2, "0");
    const mesDesdeStr = String(dDesde.getMonth() + 1).padStart(2, "0");
    const botonEnCurso = page.getByRole("button", {
      name: new RegExp(`En curso desde el ${diaDesdeStr}/${mesDesdeStr}`, "i"),
    });
    await expect(botonEnCurso).toHaveAttribute("aria-pressed", "true");

    // 7. Cargar unidad mes y precio
    await page.getByRole("button", { name: "Mes" }).click();
    await page.locator("#precio_unidad").fill("120000");

    // 8. Guardar servicio
    await page.getByRole("button", { name: "Guardar servicio" }).click();

    // 9. Esperar redirección al detalle del servicio
    await page.waitForURL(/\/servicios\/[a-f0-9-]+$/);

    // 10. Verificar que el estado del servicio es 'En curso'
    await expect(page.getByText("En curso").first()).toBeVisible();

    // 11. Verificar que la máquina figura como alquilada en /flota
    await page.goto("/flota");
    await expect(page.getByText("Alquilada").first()).toBeVisible();

    // 12. Verificar en /hoy que NO aparece en 'sin cerrar'
    await page.goto("/hoy");
    const seccionSinCerrar = page.locator("section", {
      hasText: /servicios? de días anteriores sin cerrar/i,
    });
    if ((await seccionSinCerrar.count()) > 0) {
      await expect(seccionSinCerrar.getByText(descTest)).not.toBeVisible();
    }
  });
});
