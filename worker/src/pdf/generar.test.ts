import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseAdmin } from "../supabase";
import { generarYSubirPdfFactura } from "./generar";

describe("Worker - Generación de PDF (generarYSubirPdfFactura)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lanza error si empresa.cuit es null o no está definido", async () => {
    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      if (tabla === "facturas") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "fac-1",
                  tipo: "A",
                  punto_venta: 3,
                  numero: 10,
                  total: 1000,
                  neto: 1000,
                  iva: 0,
                  clientes: { cuit: "20304050607" },
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
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        } as any;
      }
      if (tabla === "empresa") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 1,
                  razon_social: "ELEVAPLUS",
                  cuit: null,
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    await expect(generarYSubirPdfFactura("fac-1")).rejects.toThrow(
      "Falta el CUIT de la empresa en Configuración",
    );
  });

  it("lanza error si empresa.cuit está vacío o solo contiene espacios", async () => {
    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      if (tabla === "facturas") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "fac-2",
                  tipo: "B",
                  punto_venta: 3,
                  numero: 20,
                  total: 500,
                  neto: 500,
                  iva: 0,
                  clientes: null,
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
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        } as any;
      }
      if (tabla === "empresa") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 1,
                  razon_social: "ELEVAPLUS",
                  cuit: "   ",
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    await expect(generarYSubirPdfFactura("fac-2")).rejects.toThrow(
      "Falta el CUIT de la empresa en Configuración",
    );
  });
});
