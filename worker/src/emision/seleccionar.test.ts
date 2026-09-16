import { describe, it, expect } from "vitest";
import { seleccionarFacturasHoy, type ClienteSeleccion, type ServicioSeleccion } from "./seleccionar";

describe("seleccionarFacturasHoy", () => {
  const clienteRIConCuit: ClienteSeleccion = {
    id: "c-1",
    nombre: "Empresa S.A.",
    cuit: "30-11223344-5",
    condicion_iva: "responsable_inscripto",
    facturacion_modo: "diaria",
    facturacion_automatica: true,
  };

  const clienteManual: ClienteSeleccion = {
    id: "c-2",
    nombre: "Cliente Manual",
    cuit: "20-99887766-4",
    condicion_iva: "monotributo",
    facturacion_modo: "manual",
    facturacion_automatica: false,
  };

  it("ignora clientes en modo manual o sin facturación automática", () => {
    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 101, cliente_id: "c-2", descripcion: "Viaje", monto: 50000, fecha_programada: "2026-09-10" },
    ];

    const res = seleccionarFacturasHoy("2026-09-11", [clienteManual], servicios);
    expect(res.aEmitir).toHaveLength(0);
    expect(res.descartados).toHaveLength(0);
  });

  it("modo por_servicio genera una factura por cada servicio", () => {
    const clientePorServicio: ClienteSeleccion = {
      ...clienteRIConCuit,
      id: "c-ps",
      facturacion_modo: "por_servicio",
    };

    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-ps", descripcion: "Servicio 1", monto: 30000, fecha_programada: "2026-09-10" },
      { id: "s-2", numero: 2, cliente_id: "c-ps", descripcion: "Servicio 2", monto: 40000, fecha_programada: "2026-09-11" },
    ];

    const res = seleccionarFacturasHoy("2026-09-11", [clientePorServicio], servicios);
    expect(res.aEmitir).toHaveLength(2);
    expect(res.aEmitir[0].servicios).toHaveLength(1);
    expect(res.aEmitir[1].servicios).toHaveLength(1);
  });

  it("modo diaria agrupa servicios con fecha <= hoy en una sola factura", () => {
    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-1", descripcion: "Servicio 1", monto: 30000, fecha_programada: "2026-09-09" },
      { id: "s-2", numero: 2, cliente_id: "c-1", descripcion: "Servicio 2", monto: 40000, fecha_programada: "2026-09-10" },
      { id: "s-futuro", numero: 3, cliente_id: "c-1", descripcion: "Futuro", monto: 50000, fecha_programada: "2026-09-15" },
    ];

    const res = seleccionarFacturasHoy("2026-09-11", [clienteRIConCuit], servicios);
    expect(res.aEmitir).toHaveLength(1);
    expect(res.aEmitir[0].servicios).toHaveLength(2);
    expect(res.aEmitir[0].servicios.map((s) => s.id)).toEqual(["s-1", "s-2"]);
    expect(res.aEmitir[0].tipo).toBe("A");
  });

  it("modo quincenal el día 16 toma la quincena 1 a 15", () => {
    const clienteQuincenal: ClienteSeleccion = {
      ...clienteRIConCuit,
      id: "c-q",
      facturacion_modo: "quincenal",
    };

    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-q", descripcion: "Día 5", monto: 20000, fecha_programada: "2026-09-05" },
      { id: "s-2", numero: 2, cliente_id: "c-q", descripcion: "Día 15", monto: 25000, fecha_programada: "2026-09-15" },
      { id: "s-3", numero: 3, cliente_id: "c-q", descripcion: "Día 16", monto: 30000, fecha_programada: "2026-09-16" },
    ];

    const res = seleccionarFacturasHoy("2026-09-16", [clienteQuincenal], servicios);
    expect(res.aEmitir).toHaveLength(1);
    expect(res.aEmitir[0].servicios).toHaveLength(2);
    expect(res.aEmitir[0].periodo_desde).toBe("2026-09-01");
    expect(res.aEmitir[0].periodo_hasta).toBe("2026-09-15");
  });

  it("modo quincenal no emite en días intermedios (ej: día 10)", () => {
    const clienteQuincenal: ClienteSeleccion = {
      ...clienteRIConCuit,
      id: "c-q",
      facturacion_modo: "quincenal",
    };
    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-q", descripcion: "Día 5", monto: 20000, fecha_programada: "2026-09-05" },
    ];

    const res = seleccionarFacturasHoy("2026-09-10", [clienteQuincenal], servicios);
    expect(res.aEmitir).toHaveLength(0);
  });

  it("modo mensual el día 1 toma el mes anterior completo", () => {
    const clienteMensual: ClienteSeleccion = {
      ...clienteRIConCuit,
      id: "c-m",
      facturacion_modo: "mensual",
    };

    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-m", descripcion: "Agosto", monto: 50000, fecha_programada: "2026-08-20" },
      { id: "s-2", numero: 2, cliente_id: "c-m", descripcion: "Septiembre", monto: 60000, fecha_programada: "2026-09-01" },
    ];

    const res = seleccionarFacturasHoy("2026-09-01", [clienteMensual], servicios);
    expect(res.aEmitir).toHaveLength(1);
    expect(res.aEmitir[0].servicios).toHaveLength(1);
    expect(res.aEmitir[0].periodo_desde).toBe("2026-08-01");
    expect(res.aEmitir[0].periodo_hasta).toBe("2026-08-31");
  });

  it("descarta con motivo sin_cuit si el cliente es RI y no tiene CUIT", () => {
    const clienteRISinCuit: ClienteSeleccion = {
      ...clienteRIConCuit,
      id: "c-ri-sin",
      cuit: null,
      facturacion_modo: "diaria",
    };

    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-ri-sin", descripcion: "S1", monto: 20000, fecha_programada: "2026-09-10" },
    ];

    const res = seleccionarFacturasHoy("2026-09-11", [clienteRISinCuit], servicios);
    expect(res.aEmitir).toHaveLength(0);
    expect(res.descartados).toHaveLength(1);
    expect(res.descartados[0].motivo).toBe("sin_cuit");
  });

  it("descarta con motivo sin_condicion_iva si no tiene condición IVA", () => {
    const clienteSinIva: ClienteSeleccion = {
      ...clienteRIConCuit,
      id: "c-sin-iva",
      condicion_iva: null,
    };

    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-sin-iva", descripcion: "S1", monto: 20000, fecha_programada: "2026-09-10" },
    ];

    const res = seleccionarFacturasHoy("2026-09-11", [clienteSinIva], servicios);
    expect(res.aEmitir).toHaveLength(0);
    expect(res.descartados[0].motivo).toBe("sin_condicion_iva");
  });

  it("descarta con motivo sin_monto si algún servicio tiene monto nulo o cero", () => {
    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-1", descripcion: "Sin precio", monto: 0, fecha_programada: "2026-09-10" },
    ];

    const res = seleccionarFacturasHoy("2026-09-11", [clienteRIConCuit], servicios);
    expect(res.aEmitir).toHaveLength(0);
    expect(res.descartados[0].motivo).toBe("sin_monto");
  });

  it("descarta con motivo sin_iva_en_a si todos los servicios de una factura A tienen aplica_iva = false", () => {
    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-1", descripcion: "Exento", monto: 50000, aplica_iva: false, fecha_programada: "2026-09-10" },
    ];

    const res = seleccionarFacturasHoy("2026-09-11", [clienteRIConCuit], servicios);
    expect(res.aEmitir).toHaveLength(0);
    expect(res.descartados[0].motivo).toBe("sin_iva_en_a");
  });

  it("descarta con motivo requiere_dni si consumidor final supera tope legal sin identificación", () => {
    const consumidorFinal: ClienteSeleccion = {
      id: "c-cf",
      nombre: "Consumidor Final",
      cuit: null,
      condicion_iva: "consumidor_final",
      facturacion_modo: "diaria",
      facturacion_automatica: true,
    };

    const servicios: ServicioSeleccion[] = [
      { id: "s-1", numero: 1, cliente_id: "c-cf", descripcion: "Servicio muy caro", monto: 350000, fecha_programada: "2026-09-10" },
    ];

    const res = seleccionarFacturasHoy("2026-09-11", [consumidorFinal], servicios);
    expect(res.aEmitir).toHaveLength(0);
    expect(res.descartados[0].motivo).toBe("requiere_dni");
  });
});
