import { describe, it, expect } from "vitest";
import { parsearRespuestaPadron } from "./padron";

describe("parsearRespuestaPadron", () => {
  it("debe retornar null si la respuesta es null o vacía", () => {
    expect(parsearRespuestaPadron("20111111111", null)).toBeNull();
  });

  it("debe parsear correctamente un contribuyente Responsable Inscripto", () => {
    const raw = {
      datosGenerales: {
        razonSocial: "TRANS-ELEVACIONES S.A.",
        estadoClave: "ACTIVO",
        domicilioFiscal: {
          direccion: "Av. Corrientes 1234",
          localidad: "CABA",
          descripcionProvincia: "CIUDAD AUTONOMA BUENOS AIRES",
        },
      },
      datosRegimenGeneral: {
        impuesto: [
          { idImpuesto: 30, descripcionImpuesto: "IVA" },
          { idImpuesto: 10, descripcionImpuesto: "GANANCIAS SOCIEDADES" },
        ],
      },
    };

    const res = parsearRespuestaPadron("30-71111111-2", raw);
    expect(res).not.toBeNull();
    expect(res?.razon_social).toBe("TRANS-ELEVACIONES S.A.");
    expect(res?.condicion_iva).toBe("responsable_inscripto");
    expect(res?.domicilio).toBe("Av. Corrientes 1234, CABA, CIUDAD AUTONOMA BUENOS AIRES");
    expect(res?.activo).toBe(true);
  });

  it("debe parsear correctamente un Monotributista persona física", () => {
    const raw = {
      datosGenerales: {
        nombre: "JUAN CARLOS",
        apellido: "PEREZ",
        estadoClave: "ACTIVO",
        domicilioFiscal: {
          direccion: "Calle Falsa 123",
          localidad: "La Plata",
        },
      },
      datosMonotributo: {
        categoria: "H",
      },
    };

    const res = parsearRespuestaPadron("20-22222222-3", raw);
    expect(res?.razon_social).toBe("PEREZ JUAN CARLOS");
    expect(res?.condicion_iva).toBe("monotributo");
    expect(res?.domicilio).toBe("Calle Falsa 123, La Plata");
    expect(res?.activo).toBe(true);
  });

  it("debe detectar si el contribuyente está inactivo", () => {
    const raw = {
      datosGenerales: {
        razonSocial: "INACTIVA S.R.L.",
        estadoClave: "INACTIVO",
      },
    };

    const res = parsearRespuestaPadron("30-33333333-4", raw);
    expect(res?.activo).toBe(false);
  });
});
