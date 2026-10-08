import { describe, it, expect } from "vitest";
import {
  escaparCampo,
  armarCsvVentas,
  armarCsvCompras,
  prepararContenidoCsvConBom,
} from "./csv";

describe("escaparCampo", () => {
  it("antepone apóstrofe ante fórmulas con =", () => {
    expect(escaparCampo("=SUM(A1)")).toBe("'=SUM(A1)");
  });

  it("antepone apóstrofe ante texto que comienza con +", () => {
    expect(escaparCampo("+54 11 1234-5678")).toBe("'+54 11 1234-5678");
  });

  it("antepone apóstrofe ante texto que comienza con @", () => {
    expect(escaparCampo("@x")).toBe("'@x");
  });

  it("mantiene intactos los números negativos", () => {
    expect(escaparCampo(-100)).toBe("-100");
  });

  it("mantiene intactos los números positivos y cero", () => {
    expect(escaparCampo(1500.5)).toBe("1500.5");
    expect(escaparCampo(0)).toBe("0");
  });

  it("antepone apóstrofe a texto con menos que no sea numérico", () => {
    expect(escaparCampo("-descuento")).toBe("'-descuento");
  });

  it("antepone apóstrofe ante tab o retorno de carro", () => {
    expect(escaparCampo("\tcomando")).toBe("'\tcomando");
    expect(escaparCampo("\rcomando")).toBe("\"'\rcomando\"");
  });

  it("entrecomilla el texto con coma y fórmula dejando el apóstrofe adentro", () => {
    expect(escaparCampo("=SUM(A1,B1)")).toBe("\"'=SUM(A1,B1)\"");
    expect(escaparCampo("+54, 11")).toBe("\"'+54, 11\"");
  });

  it("escapa comillas dobles internas en fórmulas", () => {
    expect(escaparCampo('=cmd "test"')).toBe("\"'=cmd \"\"test\"\"\"");
  });

  it("devuelve cadena vacía para null y undefined", () => {
    expect(escaparCampo(null)).toBe("");
    expect(escaparCampo(undefined)).toBe("");
  });

  it("mantiene texto normal sin caracteres especiales", () => {
    expect(escaparCampo("Servicio de elevación")).toBe("Servicio de elevación");
  });
});

describe("armarCsvVentas", () => {
  it("genera encabezados y filas escapando campos peligrosos", () => {
    const facturas = [
      {
        fecha: "2026-10-01",
        tipo: "A",
        punto_venta: 1,
        numero: 10,
        clientes: {
          cuit: "30-11223344-5",
          nombre: "=SUM(B1,B2)",
        },
        neto: 1000,
        iva: 210,
        total: 1210,
      },
      {
        fecha: "2026-10-02",
        tipo: "B",
        punto_venta: 1,
        numero: 11,
        clientes: {
          cuit: "20-99887766-4",
          nombre: "Cliente Normal",
        },
        neto: -500,
        iva: -105,
        total: -605,
      },
    ];

    const csv = armarCsvVentas(facturas);
    const lineas = csv.split("\r\n");

    expect(lineas[0]).toBe("fecha,tipo,punto_venta,número,CUIT,razón social,neto,IVA,total");
    // La fórmula en razón social debe estar entrecomillada con el apóstrofe adentro
    expect(lineas[1]).toContain("\"'=SUM(B1,B2)\"");
    // Los montos negativos numéricos no deben tener apóstrofe
    expect(lineas[2]).toContain("-500,-105,-605");
  });
});

describe("armarCsvCompras", () => {
  it("genera encabezados y formatea comprobantes correctamente", () => {
    const movimientos = [
      {
        fecha: "2026-10-01",
        proveedor: "+54 Proveedor SRL",
        proveedor_cuit: "30-55667788-9",
        comprobante_tipo: "Factura A",
        comprobante_punto_venta: 2,
        comprobante_numero: 45,
        neto: 2000,
        iva: 420,
        monto: 2420,
      },
    ];

    const csv = armarCsvCompras(movimientos);
    expect(csv).toContain("'+54 Proveedor SRL");
    expect(csv).toContain("0002-00000045");
  });
});

describe("prepararContenidoCsvConBom", () => {
  it("antepone el carácter BOM UTF-8", () => {
    const csv = "col1,col2\r\nval1,val2";
    const res = prepararContenidoCsvConBom(csv);
    expect(res.charCodeAt(0)).toBe(0xfeff);
    expect(res.slice(1)).toBe(csv);
  });
});
