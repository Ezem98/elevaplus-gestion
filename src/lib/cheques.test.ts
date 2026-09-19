import { beforeEach, describe, expect, it, vi } from "vitest";
import { cambiarEstadoCheque } from "./cheques";
import { supabase } from "./supabase";

vi.mock("./supabase", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe("cambiarEstadoCheque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifica que las claves del objeto pasado a supabase.rpc coinciden exactamente con la firma de la función", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { id: "ch-123", estado: "depositado" },
      error: null,
    } as any);

    await cambiarEstadoCheque({
      chequeId: "ch-123",
      nuevoEstado: "depositado",
      nota: "Nota de prueba",
      cuentaId: "cta-1",
      fecha: "2026-09-20",
      endosadoA: "Proveedor SA",
      movimientoId: "mov-456",
      descontadoNeto: 95000,
      descontadoEn: "Banco Macro",
      motivo: "Motivo opcional",
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [nombreRpc, objetoParams] = vi.mocked(supabase.rpc).mock.calls[0];

    expect(nombreRpc).toBe("cambiar_estado_cheque");

    // Claves esperadas según la firma de la función en supabase/migrations/20260916000012_agenda_y_cheques.sql
    const CLAVES_FIRMA_RPC = [
      "p_cheque_id",
      "p_nuevo",
      "p_nota",
      "p_cuenta_id",
      "p_fecha",
      "p_endosado_a",
      "p_movimiento_id",
      "p_descontado_neto",
      "p_descontado_en",
      "p_motivo",
    ];

    expect(Object.keys(objetoParams).sort()).toEqual(CLAVES_FIRMA_RPC.sort());

    // Verificación puntual de parámetros críticos
    expect(objetoParams.p_nuevo).toBe("depositado");
    expect(objetoParams.p_movimiento_id).toBe("mov-456");
  });

  it("lanza un error si la RPC falla", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "Transición no permitida" },
    } as any);

    await expect(
      cambiarEstadoCheque({
        chequeId: "ch-123",
        nuevoEstado: "acreditado",
      }),
    ).rejects.toThrow("Transición no permitida");
  });
});

// Esta lista tiene que actualizarse si cambia la firma en la migración.
