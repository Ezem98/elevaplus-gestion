import { expect, test } from "@playwright/test";
import { comoAdmin, CLIENTES } from "../integracion/setup";

test.describe("Asistente Chimuelo (E2E)", () => {
  test.afterEach(async () => {
    // Limpiar servicios y datos de asistente creados durante el test
    try {
      const admin = await comoAdmin();
      await admin
        .from("servicios")
        .delete()
        .eq("cliente_id", CLIENTES.deza.id)
        .eq("origen", "Burzaco")
        .eq("destino", "Avellaneda");
      await admin.from("asistente_mensajes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await admin.from("asistente_propuestas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await admin.from("asistente_conversaciones").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } catch (e) {
      console.warn("Error al limpiar datos del test de asistente:", e);
    }
  });

  test("Pedir traslado por texto -> asistente pide lo que falta -> responder -> aparece tarjeta -> Confirmar -> el servicio existe", async ({
    page,
  }) => {
    // 1. Navegar como oficina a la vista principal (Hoy)
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();

    // 2. Abrir el asistente Chimuelo desde el botón del encabezado
    const botonChimuelo = page.getByRole("button", {
      name: "Abrir asistente Chimuelo",
    });
    await expect(botonChimuelo).toBeVisible();
    await botonChimuelo.click();

    // 3. El panel lateral o chat está visible con el input
    const inputChat = page.getByPlaceholder(/Hablá con Chimuelo/i);
    await expect(inputChat).toBeVisible();

    // 4. Pedir el traslado incompleto por texto
    await inputChat.fill(
      "Cargame un traslado para mañana, de Burzaco a Avellaneda, para Deza, a las 9",
    );
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // 5. El asistente responde pidiendo chofer y modalidad
    await expect(
      page.getByText("¿Lo hace Mauro o Federico? ¿Y es ida y vuelta?"),
    ).toBeVisible({ timeout: 15000 });

    // 6. Responder lo que falta
    await inputChat.fill("Mauro, solo ida");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // 7. Aparece la tarjeta de propuesta con los datos y acciones
    const tarjeta = page.getByTestId("tarjeta-propuesta");
    await expect(tarjeta).toBeVisible({ timeout: 15000 });
    await expect(tarjeta.getByText(/Burzaco → Avellaneda/).first()).toBeVisible();

    const botonConfirmar = tarjeta.getByRole("button", {
      name: "Confirmar",
      exact: true,
    });
    const botonRevisar = tarjeta.getByRole("button", {
      name: "Revisar en el formulario",
      exact: true,
    });
    await expect(botonConfirmar).toBeVisible();
    await expect(botonRevisar).toBeVisible();

    // 8. Tocar Confirmar
    await botonConfirmar.click();

    // 9. Verificar que se muestra el resultado con link al servicio creado
    await expect(page.getByText("¡Servicio creado con éxito!")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("link", { name: /Ver servicio/i })).toBeVisible();

    // 10. Verificar con el cliente admin que el servicio existe en la base de datos
    const admin = await comoAdmin();
    const { data: servs, error: errServs } = await admin
      .from("servicios")
      .select("id, tipo, origen, destino, cliente_id, estado")
      .eq("cliente_id", CLIENTES.deza.id)
      .eq("tipo", "traslado")
      .eq("origen", "Burzaco")
      .eq("destino", "Avellaneda");

    expect(errServs).toBeNull();
    expect(servs).not.toBeNull();
    expect(servs!.length).toBeGreaterThan(0);
    expect(["consulta", "programado"]).toContain(servs![0].estado);
  });

  test("'Revisar en el formulario' abre /servicios/nuevo con los datos precargados vía location.state", async ({
    page,
  }) => {
    // 1. Navegar directamente a /asistente (pantalla completa)
    await page.goto("/asistente");

    const inputChat = page.getByPlaceholder(/Hablá con Chimuelo/i);
    await expect(inputChat).toBeVisible();

    // 2. Pedir traslado
    await inputChat.fill(
      "Cargame un traslado para mañana, de Burzaco a Avellaneda, para Deza, a las 9",
    );
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    await expect(
      page.getByText("¿Lo hace Mauro o Federico? ¿Y es ida y vuelta?"),
    ).toBeVisible({ timeout: 15000 });

    // 3. Responder lo que falta
    await inputChat.fill("Mauro, solo ida");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // 4. Aparece la propuesta
    await expect(page.getByText("Propuesta de servicio")).toBeVisible({
      timeout: 15000,
    });

    const botonRevisar = page.getByRole("button", {
      name: "Revisar en el formulario",
      exact: true,
    });
    await expect(botonRevisar).toBeVisible();

    // 5. Tocar 'Revisar en el formulario'
    await botonRevisar.click();

    // 6. Debe navegar a /servicios/nuevo sin parámetros en la URL (solo location.state)
    await page.waitForURL((url) => url.pathname === "/servicios/nuevo");
    expect(page.url()).not.toContain("?origen=");
    expect(page.url()).not.toContain("?destino=");

    // 7. Verificar que los campos están precargados en el formulario
    await expect(page.locator("#origen")).toHaveValue("Burzaco");
    await expect(page.locator("#destino")).toHaveValue("Avellaneda");
    await expect(page.locator("#hora_programada")).toHaveValue("09:00");
    await expect(page.locator("#km")).toHaveValue("30");
  });

  test("Un chofer no ve el botón del asistente y es redirigido si intenta acceder a /asistente", async ({
    browser,
  }) => {
    // 1. Abrir contexto con sesión de chofer
    const context = await browser.newContext({
      storageState: "tests/e2e/.auth/chofer1.json",
    });
    const pageChofer = await context.newPage();

    // 2. Navegar a /chofer
    await pageChofer.goto("/chofer");
    await expect(
      pageChofer.getByRole("button", { name: "Hoy", exact: true }),
    ).toBeVisible();

    // 3. Verificar que no existe ningún botón o imagen del asistente Chimuelo
    await expect(
      pageChofer.getByRole("button", { name: "Abrir asistente Chimuelo" }),
    ).toHaveCount(0);
    await expect(pageChofer.locator('img[src="/chimuelo.svg"]')).toHaveCount(0);

    // 4. Intentar ingresar a /asistente directamente -> debe ser redirigido a /chofer
    await pageChofer.goto("/asistente");
    await pageChofer.waitForURL((url) => url.pathname === "/chofer");
    expect(pageChofer.url()).toContain("/chofer");

    await context.close();
  });

  test("Pedir cambio de estado a Chimuelo ('el de Deza de hoy ya terminó') -> tarjeta de cambio de estado -> Confirmar -> estado terminado en la base y evento registrado", async ({
    page,
  }) => {
    // 1. Crear como admin un servicio programado de prueba para hoy
    const admin = await comoAdmin();
    const hoyStr = new Date().toISOString().slice(0, 10);
    const { data: servCreado, error: errCrea } = await admin
      .from("servicios")
      .insert({
        cliente_id: CLIENTES.deza.id,
        tipo: "traslado",
        estado: "programado",
        fecha_programada: hoyStr,
        hora_programada: "10:00",
        origen: "Burzaco",
        destino: "Avellaneda",
        descripcion: "Servicio prueba cambio estado Chimuelo",
        monto: 150000,
      })
      .select()
      .single();

    expect(errCrea).toBeNull();
    expect(servCreado).toBeDefined();

    try {
      // 2. Navegar a /asistente
      await page.goto("/asistente");
      const inputChat = page.getByPlaceholder(/Hablá con Chimuelo/i);
      await expect(inputChat).toBeVisible();

      // 3. Pedir a Chimuelo que lo marque como terminado
      await inputChat.fill("El de Deza de hoy ya terminó");
      await page.getByRole("button", { name: "Enviar mensaje" }).click();

      // 4. Aparece la tarjeta de propuesta con el cambio de estado
      const tarjeta = page.getByTestId("tarjeta-propuesta");
      await expect(tarjeta).toBeVisible({ timeout: 15000 });
      await expect(tarjeta.getByText("Cambio de estado")).toBeVisible();
      await expect(tarjeta.getByText("Terminado", { exact: true })).toBeVisible();

      const botonConfirmar = tarjeta.getByRole("button", {
        name: "Confirmar",
        exact: true,
      });
      await expect(botonConfirmar).toBeVisible();

      // 5. Tocar Confirmar
      await botonConfirmar.click();

      // 6. Verificar mensaje de éxito
      await expect(
        page.getByText("¡Estado actualizado con éxito!"),
      ).toBeVisible({ timeout: 15000 });

      // 7. Verificar con cliente admin que el estado cambió a 'terminado'
      const { data: servActualizado, error: errGet } = await admin
        .from("servicios")
        .select("id, estado")
        .eq("id", servCreado.id)
        .single();

      expect(errGet).toBeNull();
      expect(servActualizado.estado).toBe("terminado");

      // 8. Verificar que hay un evento en servicio_eventos
      const { data: eventos, error: errEvt } = await admin
        .from("servicio_eventos")
        .select("*")
        .eq("servicio_id", servCreado.id)
        .eq("estado_nuevo", "terminado");

      expect(errEvt).toBeNull();
      expect(eventos).not.toBeNull();
      expect(eventos!.length).toBeGreaterThan(0);
      expect(eventos![0].estado_anterior).toBe("programado");
      expect(eventos![0].estado_nuevo).toBe("terminado");
    } finally {
      await admin.from("servicios").delete().eq("id", servCreado.id);
    }
  });
});

