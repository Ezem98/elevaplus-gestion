import { expect, test } from "@playwright/test";
import {
  CLIENTES,
  comoAdmin,
  limpiarRegistrosTest,
  USUARIOS,
} from "../integracion/setup";

test.describe("Flujo Chofer (E2E)", () => {
  const PREFIJO = "TEST-E2E-CHF-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("Caso 41 (§A.5): Iniciar -> Terminé sin foto -> Estados cambian vía RPC y abre ¿Cobraste?", async ({
    page,
  }) => {
    const admin = await comoAdmin();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Crear un servicio programado asignado a Chofer 1 (con carga descriptiva visible en la tarjeta)
    const { data: serv, error: errServ } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio de traslado asignado`,
        carga: `${PREFIJO}Traslado autoelevador asignado`,
        monto: 85000,
        fecha_programada: hoy,
      })
      .select("id, numero")
      .single();

    expect(errServ).toBeNull();
    expect(serv).toBeDefined();

    const { error: errAsig } = await admin.from("servicio_choferes").insert({
      servicio_id: serv!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    expect(errAsig).toBeNull();

    // 2. Navegar a /chofer
    await page.goto("/chofer");
    await expect(
      page.getByRole("button", { name: "Hoy", exact: true }),
    ).toBeVisible();

    // 3. Verificar que aparece la tarjeta del servicio con botón "Iniciar"
    const tarjetaServicio = page.locator(".bg-superficie", {
      hasText: `${PREFIJO}Traslado autoelevador asignado`,
    });
    await expect(tarjetaServicio).toBeVisible();

    const botonIniciar = tarjetaServicio.getByRole("button", {
      name: "Iniciar",
    });
    await expect(botonIniciar).toBeVisible();
    await botonIniciar.click();

    // 4. Verificar transición a 'en_curso' en base de datos vía RPC
    await expect(async () => {
      const { data: servEnCurso } = await admin
        .from("servicios")
        .select("estado")
        .eq("id", serv!.id)
        .single();
      expect(servEnCurso?.estado).toBe("en_curso");
    }).toPass({ timeout: 5000 });

    // 5. En la UI el botón ahora es "Terminé"
    const botonTermine = tarjetaServicio.getByRole("button", {
      name: "Terminé",
      exact: true,
    });
    await expect(botonTermine).toBeVisible();
    await botonTermine.click();

    // 6. Aparece la sección de remito con botón "Terminé sin foto"
    const botonSinFoto = tarjetaServicio.getByRole("button", {
      name: "Terminé sin foto",
    });
    await expect(botonSinFoto).toBeVisible();
    await botonSinFoto.click();

    // 7. Verificar transición a 'terminado' en base de datos vía RPC
    await expect(async () => {
      const { data: servTerminado } = await admin
        .from("servicios")
        .select("estado")
        .eq("id", serv!.id)
        .single();
      expect(servTerminado?.estado).toBe("terminado");
    }).toPass({ timeout: 5000 });

    // 8. Se abre automáticamente la pantalla "¿Cobraste?"
    await expect(
      page.getByRole("heading", { name: "¿Cobraste?" }),
    ).toBeVisible();
    await expect(page.getByText(`Servicio #${serv!.numero}`)).toBeVisible();

    // El chofer elige "No, lo paga después" para concluir el flujo
    const opcionDespues = page.getByRole("button", {
      name: /No, lo paga después/i,
    });
    await expect(opcionDespues).toBeVisible();
    await opcionDespues.click();

    // Confirmar con el botón Listo para regresar a la vista principal
    const botonListo = page.getByRole("button", { name: "Listo" });
    await expect(botonListo).toBeVisible();
    await botonListo.click();

    // Vuelve a la vista principal
    await expect(
      page.getByRole("button", { name: "Hoy", exact: true }),
    ).toBeVisible();
  });

  test("Caso 46 (§A.5): Ningún '$' visible en toda la UI del chofer (Hoy, Historial y No planificado)", async ({
    page,
  }) => {
    const admin = await comoAdmin();
    const hoy = new Date().toISOString().slice(0, 10);

    // 1. Crear dos servicios asignados con montos explícitos en BD: uno programado y uno terminado
    const { data: servProgramado } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Servicio con precio oculto`,
        carga: `${PREFIJO}Servicio con precio oculto`,
        monto: 120000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: servProgramado!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    const { data: servHistorial } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "alquiler_hora",
        estado: "terminado",
        descripcion: `${PREFIJO}Alquiler finalizado con precio oculto`,
        carga: `${PREFIJO}Alquiler finalizado con precio oculto`,
        origen: `${PREFIJO}Origen Historial`,
        monto: 75000,
        fecha_programada: hoy,
      })
      .select("id")
      .single();

    await admin.from("servicio_choferes").insert({
      servicio_id: servHistorial!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    // 2. Pantalla 1: Pestaña "Hoy"
    await page.goto("/chofer");
    await expect(
      page.getByRole("button", { name: "Hoy", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${PREFIJO}Servicio con precio oculto`),
    ).toBeVisible();

    // Verificación estricta de regla de negocio: no hay símbolo $ en el DOM de la vista Hoy
    await expect(page.locator("body")).not.toContainText("$");

    // 3. Pantalla 2: Pestaña "Últimos 7 días" (historial reciente)
    const botonHistorial = page.getByRole("button", {
      name: "Últimos 7 días",
      exact: true,
    });
    await expect(botonHistorial).toBeVisible();
    await botonHistorial.click();

    await expect(page.getByText(`${PREFIJO}Origen Historial`)).toBeVisible();

    // Verificación estricta de regla de negocio: no hay símbolo $ ni monto en el DOM de la vista Historial
    await expect(page.locator("body")).not.toContainText("$");
    await expect(page.locator("body")).not.toContainText("75000");

    // 4. Pantalla 3: Pantalla "Trabajo no planificado"
    const botonHoy = page.getByRole("button", { name: "Hoy", exact: true });
    await botonHoy.click();

    const botonNoPlanificado = page.getByRole("button", {
      name: /Hice un trabajo que no está en la lista/i,
    });
    await expect(botonNoPlanificado).toBeVisible();
    await botonNoPlanificado.click();

    // Verificar que se abrió la pantalla de alta no planificada
    await expect(
      page.getByRole("heading", { name: "Servicio no planificado" }),
    ).toBeVisible();

    // Verificación estricta de regla de negocio: no hay símbolo $ en el formulario de alta no planificada
    await expect(page.locator("body")).not.toContainText("$");

    // NOTA DE NEGOCIO: La única excepción donde aparece el símbolo $ en la experiencia del chofer
    // es en la subpantalla "¿Cobraste?" al seleccionar "Efectivo", dentro del componente EntradaMonto
    // como prefijo del input para que el chofer tipee el monto que el cliente le entregó en mano.
    // El precio presupuestado o convenido por la empresa NUNCA se le muestra al chofer.
  });

  test("Pestaña 'Mi semana': muestra servicios programados de los próximos 7 días agrupados y sin montos", async ({
    page,
  }) => {
    const admin = await comoAdmin();
    const dManana = new Date();
    dManana.setDate(dManana.getDate() + 1);
    const manana = `${dManana.getFullYear()}-${String(dManana.getMonth() + 1).padStart(2, "0")}-${String(dManana.getDate()).padStart(2, "0")}`;

    // Crear un servicio para mañana asignado al chofer
    const { data: serv, error: errServ } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        descripcion: `${PREFIJO}Viaje de mañana`,
        carga: `${PREFIJO}Carga programada semana`,
        monto: 120000,
        fecha_programada: manana,
      })
      .select("id, numero")
      .single();

    expect(errServ).toBeNull();

    await admin.from("servicio_choferes").insert({
      servicio_id: serv!.id,
      chofer_id: USUARIOS.chofer1.id,
    });

    await page.goto("/chofer");

    // En "Hoy", el servicio de mañana NO debe figurar
    await expect(page.getByText(`${PREFIJO}Carga programada semana`)).not.toBeVisible();

    // Tocar pestaña "Mi semana"
    const botonMiSemana = page.getByRole("button", {
      name: "Mi semana",
      exact: true,
    });
    await expect(botonMiSemana).toBeVisible();
    await botonMiSemana.click();

    // Debe mostrar la tarjeta del servicio de mañana
    await expect(page.getByText(`${PREFIJO}Carga programada semana`)).toBeVisible();

    // No debe contener montos de dinero ($ ni 120000)
    await expect(page.locator("body")).not.toContainText("$");
    await expect(page.locator("body")).not.toContainText("120000");
  });
});
