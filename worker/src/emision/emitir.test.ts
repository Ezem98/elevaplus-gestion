import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseAdmin } from "../supabase";
import * as arcaCliente from "../arca/cliente";
import * as pdfGenerar from "../pdf/generar";
import * as mailEnviar from "../mail/enviar";
import { config } from "../config";
import { emitirFactura } from "./emitir";

describe("Worker - Emisión electrónica ARCA (emitirFactura)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rechaza la emisión si la RPC crear_factura_borrador falla por falta de cotización del día en servicio en dólares", async () => {
    // 1. Mock empresa
    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      if (tabla === "empresa") {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { punto_venta_ws: 3, arca_ambiente: "homologacion" },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (tabla === "clientes") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "cli-1",
                  nombre: "Cliente Test",
                  cuit: "20304050607",
                  condicion_iva: "responsable_inscripto",
                  dias_pago: 30,
                  enviar_factura_email: false,
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    // 2. Mock rpc crear_factura_borrador fallando por falta de cotización
    vi.spyOn(supabaseAdmin, "rpc").mockImplementation((fn: string) => {
      if (fn === "crear_factura_borrador") {
        return Promise.resolve({
          data: null,
          error: { message: "Falta la cotización del día para el servicio #42" },
        }) as any;
      }
      return Promise.resolve({ data: null, error: null }) as any;
    });

    // Spy en ARCA para verificar que nunca se solicitó comprobante
    const spyArca = vi.spyOn(arcaCliente, "solicitarComprobanteArca");

    // Ejecutar con un servicio en dólares sin cotización
    await expect(
      emitirFactura({
        clienteId: "cli-1",
        servicioIds: ["srv-usd-1"],
      }),
    ).rejects.toThrow("Falta la cotización del día para el servicio #42");

    expect(spyArca).not.toHaveBeenCalled();
  });

  it("envía la cotización del día por servicio a crear_factura_borrador y emite exitosamente", async () => {
    // Mock empresa y clientes
    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      if (tabla === "empresa") {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { punto_venta_ws: 3, arca_ambiente: "homologacion" },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (tabla === "clientes") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "cli-1",
                  nombre: "Cliente Test",
                  cuit: "20304050607",
                  condicion_iva: "responsable_inscripto",
                  dias_pago: 30,
                  enviar_factura_email: false,
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (tabla === "servicios") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "srv-usd-1",
                  numero: 42,
                  monto: 1950000,
                  aplica_iva: true,
                  fecha_programada: "2026-09-28",
                  fecha_fin: null,
                  estado: "terminado",
                  factura_id: "fac-1",
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      if (tabla === "facturas") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any;
      }
      return {} as any;
    });

    const spyRpc = vi
      .spyOn(supabaseAdmin, "rpc")
      .mockImplementation((fn: string, args: any) => {
        if (fn === "crear_factura_borrador") {
          return Promise.resolve({
            data: {
              id: "fac-1",
              tipo: "A",
              punto_venta: 3,
              numero: null,
              neto: 1950000,
              iva: 409500,
              total: 2359500,
              estado_emision: "borrador",
            },
            error: null,
          }) as any;
        }
        if (fn === "cambiar_estado") {
          return Promise.resolve({ data: null, error: null }) as any;
        }
        return Promise.resolve({ data: null, error: null }) as any;
      });

    vi.spyOn(arcaCliente, "obtenerUltimoComprobante").mockResolvedValue(100);
    vi.spyOn(arcaCliente, "solicitarComprobanteArca").mockResolvedValue({
      CAE: "12345678901234",
      CAEFchVto: "20261008",
      Resultado: "A",
    });
    vi.spyOn(pdfGenerar, "generarYSubirPdfFactura").mockResolvedValue(
      "facturas/fac-1.pdf",
    );
    vi.spyOn(mailEnviar, "enviarFacturaEmail").mockResolvedValue({
      exito: true,
    });

    const resultado = await emitirFactura({
      clienteId: "cli-1",
      servicios: [{ id: "srv-usd-1", cotizacion: 1300 }],
    });

    expect(spyRpc).toHaveBeenCalledWith("crear_factura_borrador", {
      p_datos: {
        cliente_id: "cli-1",
        tipo: "A",
        punto_venta: 3,
        periodo_desde: null,
        periodo_hasta: null,
        lote_id: null,
        concepto: 2,
      },
      p_servicios: [{ id: "srv-usd-1", cotizacion: 1300 }],
    });

    expect(resultado.factura_id).toBe("fac-1");
    expect(resultado.numero).toBe(101);
    expect(resultado.cae).toBe("12345678901234");
  });

  it("rechaza la emisión en producción si empresa.cuit no coincide con config.ARCA_CUIT", async () => {
    config.ARCA_CUIT = 20999999999;

    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      if (tabla === "empresa") {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  punto_venta_ws: 3,
                  arca_ambiente: "produccion",
                  cuit: "20-11111111-2",
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const spyArca = vi.spyOn(arcaCliente, "solicitarComprobanteArca");

    await expect(
      emitirFactura({
        clienteId: "cli-1",
        servicioIds: ["srv-1"],
      }),
    ).rejects.toThrow("El CUIT de Configuración no coincide con ARCA_CUIT del worker");

    expect(spyArca).not.toHaveBeenCalled();
  });
});
