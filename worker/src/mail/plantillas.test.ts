import { describe, it, expect } from "vitest";
import {
  escaparHtml,
  generarPlantillaFactura,
  generarPlantillaResumenSemanal,
} from "./plantillas";

describe("escaparHtml", () => {
  it("reemplaza &, <, >, \", ' por sus entidades HTML correspondientes", () => {
    expect(escaparHtml('Pedro & "Juan" <test> \'ok\'')).toBe(
      "Pedro &amp; &quot;Juan&quot; &lt;test&gt; &#39;ok&#39;",
    );
  });

  it("reemplaza & primero para no alterar entidades introducidas", () => {
    expect(escaparHtml("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("devuelve cadena vacía ante valores nulos o vacíos", () => {
    expect(escaparHtml("")).toBe("");
    // @ts-expect-error probando valor nulo en runtime
    expect(escaparHtml(null)).toBe("");
    // @ts-expect-error probando valor undefined en runtime
    expect(escaparHtml(undefined)).toBe("");
  });
});

describe("generarPlantillaFactura", () => {
  const paramsBase = {
    factura: {
      tipo: "A" as const,
      puntoVenta: 3,
      numero: 42,
      total: 456218,
    },
    cliente: {
      nombre: "Acme Corp S.A.",
      email: "contacto@acme.com",
    },
    empresa: {
      nombre: "ELEVAPLUS",
      razonSocial: "ELEVAPLUS S.R.L.",
      cuit: "30-71829384-9",
      banco: "Banco Galicia",
      cbu: "0070123456789012345678",
      aliasCbu: "ELEVA.PLUS.PAGOS",
      telefono: "+54 9 11 1234-5678",
      email: "facturacion@eleva-plus.com.ar",
    },
    servicios: [
      {
        id: "serv-1",
        numero: 101,
        descripcion: "Elevación de materiales piso 14",
        monto: 377039.67,
        fecha: "2026-09-10",
      },
    ],
  };

  it("debe armar el asunto con el formato exigido", () => {
    const res = generarPlantillaFactura(paramsBase);
    // Asunto: Factura A 0003-00000042 · ELEVAPLUS · $ 456.218
    expect(res.asunto).toContain("Factura A 0003-00000042");
    expect(res.asunto).toContain("ELEVAPLUS");
    expect(res.asunto).toContain("456.218");
  });

  it("debe incluir los datos bancarios en texto y en HTML", () => {
    const res = generarPlantillaFactura(paramsBase);
    expect(res.texto).toContain("Banco Galicia");
    expect(res.texto).toContain("0070123456789012345678");
    expect(res.texto).toContain("ELEVA.PLUS.PAGOS");

    expect(res.html).toContain("Banco Galicia");
    expect(res.html).toContain("0070123456789012345678");
    expect(res.html).toContain("ELEVA.PLUS.PAGOS");
  });

  it("debe listar los servicios y la leyenda de desestimación si ya pagó", () => {
    const res = generarPlantillaFactura(paramsBase);
    expect(res.texto).toContain("Elevación de materiales piso 14");
    expect(res.texto).toContain("Si ya realizaste el pago");

    expect(res.html).toContain("Elevación de materiales piso 14");
    expect(res.html).toContain("Si ya realizaste el pago");
  });

  it("debe definir el nombre de archivo PDF adjunto correcto", () => {
    const res = generarPlantillaFactura(paramsBase);
    expect(res.nombreArchivoPdf).toBe("Factura-A-0003-00000042.pdf");
  });

  it("escapa cliente malicioso en HTML sin alterar el texto plano ni el asunto", () => {
    const paramsMalicioso = {
      ...paramsBase,
      cliente: {
        nombre: '<script>alert(1)</script> & "Cía"',
        email: "malicioso@cia.com",
      },
    };

    const res = generarPlantillaFactura(paramsMalicioso);

    // No debe aparecer crudo en HTML
    expect(res.html).not.toContain('<script>alert(1)</script>');
    expect(res.html).not.toContain('"Cía"');

    // Debe aparecer escapado en HTML
    expect(res.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Cía&quot;');

    // En texto plano debe permanecer crudo
    expect(res.texto).toContain('Hola <script>alert(1)</script> & "Cía",');

    // El asunto no debe tener entidades HTML
    expect(res.asunto).not.toContain("&amp;");
  });

  it("escapa descripción de servicios y datos de empresa en HTML", () => {
    const paramsMalicioso = {
      ...paramsBase,
      empresa: {
        ...paramsBase.empresa,
        nombre: 'ELEVAPLUS <img src=x onerror=alert(1)> & "Hnos"',
      },
      servicios: [
        {
          id: "serv-mal",
          numero: 99,
          descripcion: 'Traslado con <grua> & "camión"',
          monto: 100,
        },
      ],
    };

    const res = generarPlantillaFactura(paramsMalicioso);
    expect(res.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(res.html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Hnos&quot;");
    expect(res.html).not.toContain("<grua>");
    expect(res.html).toContain("Traslado con &lt;grua&gt; &amp; &quot;camión&quot;");
    expect(res.texto).toContain('Traslado con <grua> & "camión"');
  });
});

describe("generarPlantillaResumenSemanal", () => {
  it("escapa datos variables en HTML manteniendo texto plano intacto", () => {
    const res = generarPlantillaResumenSemanal({
      rangoTexto: "Semana 1 & <2>",
      itemsAgenda: [
        {
          fecha: "2026-10-10",
          titulo: 'Mantenimiento <urgente> & "revisión"',
          sentido: "egreso",
          monto: 500,
          detalle: 'Detalle <extra> & "nota"',
        },
      ],
      chequesCobrar: [
        {
          id: "ch-1",
          banco: "Banco <Nación>",
          numero: "123",
          contraparte: 'Cliente <X> & "Y"',
          monto: 1000,
          tipo: "recibido",
          fechaPago: "2026-10-12",
        },
      ],
      chequesCubrir: [],
      proyeccion: [
        {
          fecha: "2026-10-10",
          ingresos: 0,
          egresos: 500,
          saldoProyectado: -500,
        },
      ],
      alertaDescubierto: true,
    });

    expect(res.html).not.toContain("<urgente>");
    expect(res.html).toContain('&lt;urgente&gt; &amp; &quot;revisión&quot;');
    expect(res.html).not.toContain("<Nación>");
    expect(res.html).toContain("Banco &lt;Nación&gt;");
    expect(res.html).toContain('Cliente &lt;X&gt; &amp; &quot;Y&quot;');

    // Texto plano
    expect(res.texto).toContain('Mantenimiento <urgente> & "revisión"');
    expect(res.texto).toContain('Cliente <X> & "Y"');
  });
});
