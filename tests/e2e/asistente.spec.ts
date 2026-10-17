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

      const { data: presusTechint } = await admin
        .from("presupuestos")
        .select("id")
        .eq("prospecto_nombre", "Techint");
      if (presusTechint && presusTechint.length > 0) {
        const pids = presusTechint.map((p) => p.id);
        const { data: servsPres } = await admin
          .from("servicios")
          .select("id")
          .in("presupuesto_id", pids);
        if (servsPres && servsPres.length > 0) {
          const sids = servsPres.map((s) => s.id);
          await admin.from("alquileres").delete().in("servicio_id", sids);
          await admin.from("servicios").delete().in("id", sids);
        }
        await admin.from("presupuestos").delete().in("id", pids);
      }

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
    // "Hoy" en Argentina, como lo calcula el worker: entre las 21 y las 24 hs
    // la fecha UTC ya es mañana y Chimuelo no encontraría el servicio.
    const hoyStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date());
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

  test("Pedir servicio ya realizado a Chimuelo ('ayer hicimos un traslado para Deza de Burzaco a Avellaneda, lo hizo Mauro') -> tarjeta 'Ya realizado' -> Confirmar -> servicio en estado terminado con fecha de ayer", async ({
    page,
  }) => {
    // 1. Navegar a /asistente
    await page.goto("/asistente");
    const inputChat = page.getByPlaceholder(/Hablá con Chimuelo/i);
    await expect(inputChat).toBeVisible();

    // 2. Pedir a Chimuelo el servicio ya realizado
    await inputChat.fill(
      "Ayer hicimos un traslado para Deza de Burzaco a Avellaneda, lo hizo Mauro",
    );
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // 3. Aparece la tarjeta de propuesta con el rótulo "Ya realizado"
    const tarjeta = page.getByTestId("tarjeta-propuesta");
    await expect(tarjeta).toBeVisible({ timeout: 15000 });
    await expect(tarjeta.getByTestId("badge-ya-realizado")).toBeVisible();
    await expect(tarjeta.getByTestId("badge-ya-realizado")).toHaveText("Ya realizado");
    await expect(tarjeta.getByText(/Burzaco → Avellaneda/).first()).toBeVisible();

    const botonConfirmar = tarjeta.getByRole("button", {
      name: "Confirmar",
      exact: true,
    });
    await expect(botonConfirmar).toBeVisible();

    // 4. Tocar Confirmar
    await botonConfirmar.click();

    // 5. Verificar mensaje de éxito
    await expect(
      page.getByText("¡Servicio realizado registrado con éxito!"),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: /Ver servicio/i })).toBeVisible();

    // 6. Verificar con cliente admin que el servicio existe con fecha de ayer y estado terminado
    const admin = await comoAdmin();
    const hoyDate = new Date(Date.now() - 3 * 3600 * 1000);
    const ayerDate = new Date(hoyDate.getTime() - 86400000);
    const fechaAyerStr = ayerDate.toISOString().slice(0, 10);

    const { data: servs, error: errServs } = await admin
      .from("servicios")
      .select("id, tipo, origen, destino, cliente_id, estado, fecha_programada")
      .eq("cliente_id", CLIENTES.deza.id)
      .eq("tipo", "traslado")
      .eq("origen", "Burzaco")
      .eq("destino", "Avellaneda")
      .order("created_at", { ascending: false });

    expect(errServs).toBeNull();
    expect(servs).not.toBeNull();
    expect(servs!.length).toBeGreaterThan(0);
    const servCreado = servs![0];
    expect(servCreado.estado).toBe("terminado");
    expect(servCreado.fecha_programada).toBe(fechaAyerStr);

    // 7. Verificar que tiene chofer asignado (Mauro)
    const { data: choferesAsignados, error: errCh } = await admin
      .from("servicio_choferes")
      .select("chofer_id")
      .eq("servicio_id", servCreado.id);
    expect(errCh).toBeNull();
    expect(choferesAsignados).not.toBeNull();
    expect(choferesAsignados!.length).toBeGreaterThan(0);
  });

  test("Pedir presupuesto sin precio -> Chimuelo pregunta el precio -> responder -> tarjeta -> Confirmar -> el presupuesto existe con sus ítems y montos exactos y 'Ver presupuesto' abre su página", async ({
    page,
  }) => {
    // 1. Navegar a /asistente
    await page.goto("/asistente");
    const inputChat = page.getByPlaceholder(/Hablá con Chimuelo/i);
    await expect(inputChat).toBeVisible();

    // 2. Pedir presupuesto sin precio
    await inputChat.fill(
      "Haceme un presupuesto para Techint: traslado de la AE-01 de Burzaco a Campana y 3 días de alquiler",
    );
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // 3. Chimuelo responde preguntando el precio
    await expect(
      page.getByText("¿Qué precio le ponemos al traslado y cuánto por día el alquiler?"),
    ).toBeVisible({ timeout: 15000 });

    // 4. Responder con los precios
    await inputChat.fill(
      "El traslado $ 350.000 y el alquiler a $ 180.000 por día",
    );
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // 5. Aparece la tarjeta de propuesta de presupuesto
    const tarjeta = page.getByTestId("tarjeta-propuesta");
    await expect(tarjeta).toBeVisible({ timeout: 15000 });
    await expect(tarjeta.getByText("Presupuesto", { exact: true })).toBeVisible();
    await expect(tarjeta.getByText("Techint").first()).toBeVisible();
    await expect(tarjeta.getByText(/Campana/).first()).toBeVisible();
    await expect(tarjeta.getByText(/350\.000/).first()).toBeVisible();
    await expect(tarjeta.getByText(/540\.000/).first()).toBeVisible();
    await expect(tarjeta.getByText(/890\.000/).first()).toBeVisible();

    const botonConfirmar = tarjeta.getByRole("button", {
      name: "Confirmar",
      exact: true,
    });
    await expect(botonConfirmar).toBeVisible();
    await expect(
      tarjeta.getByRole("button", { name: "Descartar", exact: true }),
    ).toBeVisible();

    // 6. Confirmar la propuesta
    await botonConfirmar.click();

    // 7. Aparece mensaje de éxito y enlace para ver el presupuesto
    await expect(
      page.getByText("¡Presupuesto creado con éxito!"),
    ).toBeVisible({ timeout: 15000 });
    const linkVerPresupuesto = page.getByRole("link", {
      name: /Ver presupuesto/i,
    });
    await expect(linkVerPresupuesto).toBeVisible();

    // 8. Verificar con el cliente admin que el presupuesto y sus ítems existen en la base
    const admin = await comoAdmin();
    const { data: presus, error: errPres } = await admin
      .from("presupuestos")
      .select("id, prospecto_nombre, estado, validez_dias")
      .eq("prospecto_nombre", "Techint")
      .order("created_at", { ascending: false });

    expect(errPres).toBeNull();
    expect(presus).not.toBeNull();
    expect(presus!.length).toBeGreaterThan(0);
    const presCreado = presus![0];
    expect(presCreado.prospecto_nombre).toBe("Techint");
    expect(presCreado.estado).toBe("borrador");

    const { data: items, error: errItems } = await admin
      .from("servicios")
      .select("id, tipo, descripcion, monto, moneda, origen, destino")
      .eq("presupuesto_id", presCreado.id)
      .order("monto", { ascending: true });

    expect(errItems).toBeNull();
    expect(items).not.toBeNull();
    expect(items!.length).toBe(2);

    const itemTraslado = items!.find((it) => it.tipo === "traslado");
    expect(itemTraslado).toBeDefined();
    expect(Number(itemTraslado!.monto)).toBe(350000);
    expect(itemTraslado!.origen).toBe("Burzaco");
    expect(itemTraslado!.destino).toBe("Campana");

    const itemAlquiler = items!.find((it) => it.tipo === "alquiler_periodo");
    expect(itemAlquiler).toBeDefined();
    expect(Number(itemAlquiler!.monto)).toBe(540000);

    const { data: alqDetalle, error: errAlq } = await admin
      .from("alquileres")
      .select("*")
      .eq("servicio_id", itemAlquiler!.id)
      .single();
    expect(errAlq).toBeNull();
    expect(alqDetalle.cantidad).toBe(3);
    expect(Number(alqDetalle.precio_unidad)).toBe(180000);

    // 9. Hacer clic en "Ver presupuesto" y verificar que abre su página
    await linkVerPresupuesto.click();
    await page.waitForURL((url) => url.pathname === `/presupuestos/${presCreado.id}`);
    expect(page.url()).toContain(`/presupuestos/${presCreado.id}`);
    await expect(page.getByText("Techint").first()).toBeVisible();
  });

  test("Pedir cotización de traslado de Burzaco a Campana sin km -> Chimuelo calcula distancia y responde con km y precio", async ({
    page,
  }) => {
    // 1. Navegar a /asistente
    await page.goto("/asistente");
    const inputChat = page.getByPlaceholder(/Hablá con Chimuelo/i);
    await expect(inputChat).toBeVisible();

    // 2. Pedir la cotización del traslado sin indicar los km
    await inputChat.fill(
      "Cotizame un traslado de Burzaco a Campana con el Ford Cargo, solo ida",
    );
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // 3. Chimuelo responde calculando la distancia y cotizando:
    // Debe mostrar los km (105.4 km) y el precio calculado ($ 451.534)
    await expect(page.getByText(/105[.,]4\s*km/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/\$\s*451\.534/)).toBeVisible({
      timeout: 15000,
    });
  });
});

