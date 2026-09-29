import { expect, test } from "@playwright/test";
import {
  CLIENTES,
  comoAdmin,
  limpiarRegistrosTest,
  USUARIOS,
} from "../integracion/setup";

function obtenerFechaLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

test.describe("Recorridos con Paradas (E2E)", () => {
  const PREFIJO = "TEST-E2E-REC-";

  test.beforeEach(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test.afterAll(async () => {
    await limpiarRegistrosTest(PREFIJO);
  });

  test("Cargar recorrido de 3 paradas, cierre parcial del chofer en la 2da parada, aviso incompleto y reprogramar la 3ra", async ({
    page,
    browser,
  }) => {
    const hoy = obtenerFechaLocal();

    // 1. Oficina carga un traslado con 3 paradas en /servicios/nuevo
    await page.goto("/servicios/nuevo");
    await expect(
      page.getByRole("heading", { name: "Nuevo servicio" }),
    ).toBeVisible();

    // Seleccionar cliente
    await page.locator("#cliente").selectOption(CLIENTES.deza.id);

    // Origen y Destino inicial
    await page.locator("#origen").fill(`${PREFIJO}Origen Canning`);
    await page.locator("#destino").fill(`${PREFIJO}Parada 1 Lanús`);

    // Agregar segunda parada (+ Agregar parada convierte destino en Parada 1 y agrega Parada 2)
    const botonAgregarParada = page.getByRole("button", {
      name: "+ Agregar parada",
    });
    await expect(botonAgregarParada).toBeVisible();
    await botonAgregarParada.click();

    await expect(page.locator("#parada_dir_0")).toHaveValue(
      `${PREFIJO}Parada 1 Lanús`,
    );
    await page.locator("#parada_dir_1").fill(`${PREFIJO}Parada 2 Quilmes`);

    // Agregar tercera parada
    await botonAgregarParada.click();
    await expect(page.locator("#parada_dir_2")).toBeVisible();
    await page.locator("#parada_dir_2").click();
    await page.locator("#parada_dir_2").fill(`${PREFIJO}Parada 3 Bernal`);

    // Carga general y monto
    await page.locator("#carga").fill(`${PREFIJO}Carga Recorrido`);
    await page.locator("#monto").fill("150000");

    // Descripción del servicio
    await page.locator("#descripcion").click();
    await page.locator("#descripcion").fill(
      `${PREFIJO}Servicio de traslado con 3 paradas`,
    );

    // Fecha programada
    await page.locator("#fecha_programada").fill(hoy);

    // Asignar Chofer 1 desde el formulario (deriva estado a Programado y asigna vía programar_servicio)
    await page.getByRole("button", { name: USUARIOS.chofer1.nombre }).click();

    // Guardar servicio
    await page.getByRole("button", { name: "Guardar servicio" }).click();

    // Redirección al detalle del servicio
    await page.waitForURL(/\/servicios\/[a-f0-9-]+$/);
    const urlServicio = page.url();
    const servicioId = urlServicio.match(/\/servicios\/([a-f0-9-]+)$/)?.[1];
    expect(servicioId).toBeDefined();

    // Verificar que las 3 paradas se visualizan en el detalle de la oficina
    await expect(page.getByText(`${PREFIJO}Parada 1 Lanús`)).toBeVisible();
    await expect(page.getByText(`${PREFIJO}Parada 2 Quilmes`)).toBeVisible();
    await expect(page.getByText(`${PREFIJO}Parada 3 Bernal`)).toBeVisible();

    // 2. Chofer inicia el servicio y lo cierra llegando hasta la segunda parada
    const choferContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: "tests/e2e/.auth/chofer1.json",
    });
    const choferPage = await choferContext.newPage();

    await choferPage.goto("/chofer");
    await expect(
      choferPage.getByRole("button", { name: "Hoy", exact: true }),
    ).toBeVisible();

    // Ubicar la tarjeta del servicio por la primera parada
    const tarjetaChofer = choferPage.locator(".bg-superficie", {
      hasText: `${PREFIJO}Parada 1 Lanús`,
    });
    await expect(tarjetaChofer).toBeVisible();

    // Iniciar servicio
    const botonIniciar = tarjetaChofer.getByRole("button", { name: "Iniciar" });
    await expect(botonIniciar).toBeVisible();
    await botonIniciar.click();

    // Terminar servicio
    const botonTermine = tarjetaChofer.getByRole("button", {
      name: "Terminé",
      exact: true,
    });
    await expect(botonTermine).toBeVisible();
    await botonTermine.click();

    // Pregunta: ¿Hiciste todo el recorrido?
    await expect(
      tarjetaChofer.getByText("¿Hiciste todo el recorrido?"),
    ).toBeVisible();
    const botonNoHasta = tarjetaChofer.getByRole("button", {
      name: "No, llegué hasta…",
    });
    await expect(botonNoHasta).toBeVisible();
    await botonNoHasta.click();

    // Selección de parada alcanzada: elegir Parada 2
    await expect(
      tarjetaChofer.getByText("¿Hasta qué parada llegaste?"),
    ).toBeVisible();
    const opcionParada2 = tarjetaChofer.getByRole("button", {
      name: new RegExp(`${PREFIJO}Parada 2 Quilmes`, "i"),
    });
    await expect(opcionParada2).toBeVisible();
    await opcionParada2.click();

    // Cierre sin foto de remito
    const botonSinFoto = tarjetaChofer.getByRole("button", {
      name: "Terminé sin foto",
    });
    await expect(botonSinFoto).toBeVisible();
    await botonSinFoto.click();

    // Pantalla ¿Cobraste?
    await expect(
      choferPage.getByRole("heading", { name: "¿Cobraste?" }),
    ).toBeVisible();
    const opcionDespues = choferPage.getByRole("button", {
      name: /No, lo paga después/i,
    });
    await expect(opcionDespues).toBeVisible();
    await opcionDespues.click();

    const botonListo = choferPage.getByRole("button", { name: "Listo" });
    await expect(botonListo).toBeVisible();
    await botonListo.click();

    await choferContext.close();

    // 3. Oficina recarga o navega al servicio y verifica aviso de incompleto
    await page.goto(`/servicios/${servicioId}`);

    // Aparece el aviso de recorrido incompleto: 2 de 3 paradas
    await expect(
      page.getByText("Recorrido incompleto: llegó a 2 de 3 paradas."),
    ).toBeVisible();

    // Botón para reprogramar paradas pendientes
    const botonReprogramar = page.getByRole("button", {
      name: "Reprogramar paradas pendientes",
    });
    await expect(botonReprogramar).toBeVisible();
    await botonReprogramar.click();

    // 4. Redirección al nuevo servicio reprogramado
    await page.waitForURL((url) => {
      const match = url.pathname.match(/\/servicios\/([a-f0-9-]+)$/);
      return Boolean(match && match[1] !== servicioId);
    });

    const urlNuevoServicio = page.url();
    const nuevoServicioId = urlNuevoServicio.match(
      /\/servicios\/([a-f0-9-]+)$/,
    )?.[1];
    expect(nuevoServicioId).toBeDefined();

    // Verificar nuevo servicio:
    // - Aviso de continuación del servicio anterior
    await expect(
      page.getByText(/Continuación del servicio #/i),
    ).toBeVisible();

    // - Estado: Aceptado
    await expect(page.getByText("Aceptado").first()).toBeVisible();

    // - Origen: dirección de la parada 2 donde terminó
    await expect(
      page.getByText(`${PREFIJO}Parada 2 Quilmes`).first(),
    ).toBeVisible();

    // - Parada pendiente: parada 3
    await expect(
      page.getByText(`${PREFIJO}Parada 3 Bernal`).first(),
    ).toBeVisible();

    // 5. Volver al servicio original y verificar que indica que fue reprogramado
    await page.goto(`/servicios/${servicioId}`);
    await expect(
      page.getByText(
        /Las paradas pendientes fueron reprogramadas en el/i,
      ),
    ).toBeVisible();
  });
});
