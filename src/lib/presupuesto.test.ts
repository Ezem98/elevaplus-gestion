import { describe, expect, it } from "vitest";
import {
  armarCondiciones,
  armarItems,
  calcularTotalesPresupuesto,
  formatearFechaLarga,
  formatearNumeroPresupuesto,
  normalizarTelefonoWhatsApp,
} from "./presupuesto";
import type { Empresa } from "./tipos";

describe("presupuesto", () => {
  const empresaMock: Empresa = {
    id: 1,
    razon_social: "ALICIA ELIZABETH GAMARRA",
    cuit: "27-22651487-8",
    condicion_iva: "responsable_inscripto",
    domicilio: "Llavallol, Lomas de Zamora, Provincia de Buenos Aires",
    telefono: "+54 9 11 6391-6614",
    email: "elevaplus.one@gmail.com",
    email_secundario: "aelgama@yahoo.com",
    instagram: "@elevaplus_",
    presupuesto_validez_dias: 15,
    presupuesto_espera_autoelevador: "La hora de espera se cobra al valor de la hora de alquiler.",
    presupuesto_espera_camion: "El importe no incluye espera superior a 30 minutos.",
    presupuesto_condiciones_extra: null,
  };

  describe("formatearNumeroPresupuesto", () => {
    it("formatea números a 4 dígitos con prefijo N°", () => {
      expect(formatearNumeroPresupuesto(42)).toBe("N° 0042");
      expect(formatearNumeroPresupuesto(1)).toBe("N° 0001");
      expect(formatearNumeroPresupuesto("123")).toBe("N° 0123");
      expect(formatearNumeroPresupuesto(0)).toBe("N° 0000");
      expect(formatearNumeroPresupuesto(null)).toBe("N° 0000");
    });
  });

  describe("armarCondiciones", () => {
    it("arma las condiciones básicas para traslado con IVA y espera de camión", () => {
      const lineas = armarCondiciones({
        empresa: empresaMock,
        servicio: { tipo: "traslado", aplica_iva: true },
        validezDias: 15,
      });

      expect(lineas).toEqual([
        "Validez: 15 días corridos.",
        "Precios en pesos argentinos, sin IVA.",
        "Forma de pago: al finalizar el servicio.",
        "El importe no incluye espera superior a 30 minutos.",
      ]);
    });

    it("omite espera de camión si es null", () => {
      const lineas = armarCondiciones({
        empresa: { ...empresaMock, presupuesto_espera_camion: null },
        servicio: { tipo: "traslado", aplica_iva: false },
        validezDias: 7,
      });

      expect(lineas).toEqual([
        "Validez: 7 días corridos.",
        "Precios en pesos argentinos.",
        "Forma de pago: al finalizar el servicio.",
      ]);
    });

    it("arma condiciones para alquiler por hora con espera de autoelevador", () => {
      const lineas = armarCondiciones({
        empresa: empresaMock,
        servicio: { tipo: "alquiler_hora", aplica_iva: true },
        validezDias: 10,
      });

      expect(lineas).toEqual([
        "Validez: 10 días corridos.",
        "Precios en pesos argentinos, sin IVA.",
        "Forma de pago: al finalizar el servicio.",
        "La hora de espera se cobra al valor de la hora de alquiler.",
      ]);
    });

    it("arma condiciones para alquiler por período con plazo acordado y cláusula extra", () => {
      const lineas = armarCondiciones({
        empresa: empresaMock,
        servicio: { tipo: "alquiler_periodo", aplica_iva: true },
        validezDias: 15,
        extra: "Seguro de carga incluido a cargo del cliente.",
      });

      expect(lineas).toEqual([
        "Validez: 15 días corridos.",
        "Precios en pesos argentinos, sin IVA.",
        "Forma de pago: según plazo acordado.",
        "Seguro de carga incluido a cargo del cliente.",
      ]);
    });

    it("no incluye cláusula de espera para mantenimiento ni otros tipos", () => {
      const lineas = armarCondiciones({
        empresa: empresaMock,
        servicio: { tipo: "mantenimiento", aplica_iva: false },
        validezDias: 15,
      });

      expect(lineas).toEqual([
        "Validez: 15 días corridos.",
        "Precios en pesos argentinos.",
        "Forma de pago: al finalizar el servicio.",
      ]);
    });
  });

  describe("armarItems", () => {
    it("arma un ítem de traslado con carga y detalle de trayecto", () => {
      const items = armarItems({
        tipo: "traslado",
        carga: "autoelevador 2,5 t",
        origen: "Burzaco",
        destino: "Avellaneda",
        km: 60,
        ida_y_vuelta: true,
        monto: 257040,
        vehiculos: { nombre: "Ford Cargo con rampa" },
      });

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        descripcion: "Traslado de autoelevador 2,5 t",
        detalle: "Burzaco → Avellaneda, ida y vuelta (60 km) · Ford Cargo con rampa",
        cantidad: "1",
        precioUnitario: 257040,
        importe: 257040,
      });
    });

    it("arma un ítem para alquiler por período con datos de alquiler", () => {
      const items = armarItems({
        tipo: "alquiler_periodo",
        monto: 450000,
        alquileres: {
          servicio_id: "s-1",
          fecha_desde: "2026-09-10",
          fecha_hasta: "2026-10-01",
          unidad: "semana",
          cantidad: 3,
          precio_unidad: 150000,
          renovacion_automatica: false,
          alertar_dias_antes: 3,
        },
        vehiculos: null,
      });

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        descripcion: "Alquiler por período",
        detalle: "",
        cantidad: "3 semanas",
        precioUnitario: 150000,
        importe: 450000,
      });
    });

    it("usa descripcion del servicio si no hay trayecto ni vehículo", () => {
      const items = armarItems({
        tipo: "mantenimiento",
        monto: 50000,
        descripcion: "Service preventivo de 250 horas",
      });

      expect(items[0]).toEqual({
        descripcion: "Mantenimiento",
        detalle: "Service preventivo de 250 horas",
        cantidad: "1",
        precioUnitario: 50000,
        importe: 50000,
      });
    });
  });

  describe("calcularTotalesPresupuesto", () => {
    it("calcula neto, iva y total cuando aplica iva", () => {
      const totales = calcularTotalesPresupuesto({ monto: 100000, aplica_iva: true });
      expect(totales.neto).toBe(100000);
      expect(totales.iva).toBe(21000);
      expect(totales.total).toBe(121000);
    });

    it("calcula total sin iva cuando aplica_iva es false", () => {
      const totales = calcularTotalesPresupuesto({ monto: 100000, aplica_iva: false });
      expect(totales.neto).toBe(100000);
      expect(totales.iva).toBe(0);
      expect(totales.total).toBe(100000);
    });
  });

  describe("normalizarTelefonoWhatsApp", () => {
    it("normaliza números con diferentes formatos a 549...", () => {
      expect(normalizarTelefonoWhatsApp("+54 9 11 6391-6614")).toBe("5491163916614");
      expect(normalizarTelefonoWhatsApp("11 6391-6614")).toBe("5491163916614");
      expect(normalizarTelefonoWhatsApp("011-6391-6614")).toBe("5491163916614");
      expect(normalizarTelefonoWhatsApp("541163916614")).toBe("5491163916614");
      expect(normalizarTelefonoWhatsApp(null)).toBeNull();
      expect(normalizarTelefonoWhatsApp("")).toBeNull();
    });
  });

  describe("formatearFechaLarga", () => {
    it("formatea fecha en formato largo en español", () => {
      expect(formatearFechaLarga("2026-09-08")).toBe("8 de septiembre de 2026");
    });
  });
});
