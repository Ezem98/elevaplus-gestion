import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import { supabaseAdmin } from "../supabase";
import {
  decidirHuerfano,
  type EntidadesExistentes,
} from "./decidirHuerfano";
import { limpiarStorageHuerfanos } from "./limpiarHuerfanos";

const ID_SERV = "11111111-1111-4111-8111-111111111111";
const ID_SERV_2 = "22222222-2222-4222-8222-222222222222";
const AHORA = new Date("2026-10-08T12:00:00Z");
const VIEJO = "2026-09-01T00:00:00Z";
const RECIENTE = "2026-10-05T00:00:00Z";

function existentes(parcial: Partial<Record<keyof EntidadesExistentes, string[]>> = {}): EntidadesExistentes {
  return {
    servicios: new Set(parcial.servicios ?? []),
    presupuestos: new Set(parcial.presupuestos ?? []),
    comprobantes: new Set(parcial.comprobantes ?? []),
  };
}

function decidir(
  over: Partial<Parameters<typeof decidirHuerfano>[0]> = {},
) {
  return decidirHuerfano({
    bucket: "adjuntos",
    path: `servicios/${ID_SERV}/remito.jpg`,
    creadoEn: VIEJO,
    ahora: AHORA,
    referenciados: new Set(),
    existentes: existentes(),
    ...over,
  });
}

describe("decidirHuerfano", () => {
  it("es huérfano: sin referencia, entidad inexistente y con más de 7 días", () => {
    expect(decidir()).toEqual({ huerfano: true, motivo: "huerfano" });
  });

  it("no es huérfano si una columna lo referencia por path exacto", () => {
    const path = `servicios/${ID_SERV}/remito.jpg`;
    expect(decidir({ referenciados: new Set([path]) }).huerfano).toBe(false);
  });

  it("no es huérfano si la entidad existe", () => {
    const r = decidir({ existentes: existentes({ servicios: [ID_SERV] }) });
    expect(r).toEqual({ huerfano: false, motivo: "entidad-existe" });
  });

  it("no es huérfano si tiene menos de 7 días", () => {
    expect(decidir({ creadoEn: RECIENTE })).toEqual({
      huerfano: false,
      motivo: "reciente",
    });
  });

  it("no es huérfano si no se conoce la fecha de creación", () => {
    expect(decidir({ creadoEn: null }).huerfano).toBe(false);
  });

  it("no toca carpetas de convención desconocida", () => {
    expect(decidir({ path: "otra/cosa/x.txt" }).motivo).toBe("desconocida");
    expect(decidir({ path: "servicios/no-es-uuid/x.txt" }).motivo).toBe(
      "desconocida",
    );
    expect(decidir({ path: `servicios/${ID_SERV}` }).motivo).toBe(
      "desconocida",
    );
    expect(decidir({ path: "suelto.txt" }).huerfano).toBe(false);
  });

  it("nunca toca el bucket facturas", () => {
    const r = decidir({
      bucket: "facturas",
      path: `${ID_SERV}/A-0003-00000010.pdf`,
    });
    expect(r).toEqual({ huerfano: false, motivo: "bucket-protegido" });
    expect(
      decidir({ bucket: "facturas", path: `servicios/${ID_SERV}/x.pdf` })
        .huerfano,
    ).toBe(false);
  });
});

describe("limpiarStorageHuerfanos", () => {
  const remove = vi.fn();

  function mockearSupabase(paths: string[]) {
    remove.mockReset();
    remove.mockImplementation(async (lista: string[]) => ({
      data: lista.map((name) => ({ name })),
      error: null,
    }));

    // Estructura: raíz -> carpeta "servicios" -> una carpeta por id -> archivos
    const porId = new Map<string, string[]>();
    for (const p of paths) {
      const [, id, archivo] = p.split("/");
      porId.set(id, [...(porId.get(id) ?? []), archivo]);
    }
    const list = vi.fn(async (prefijo: string) => {
      if (prefijo === "") {
        return { data: [{ name: "servicios", id: null }], error: null };
      }
      if (prefijo === "servicios") {
        return {
          data: [...porId.keys()].map((name) => ({ name, id: null })),
          error: null,
        };
      }
      const id = prefijo.split("/")[1];
      return {
        data: (porId.get(id) ?? []).map((name) => ({
          name,
          id: `obj-${name}`,
          created_at: VIEJO,
        })),
        error: null,
      };
    });

    vi.spyOn(supabaseAdmin.storage, "from").mockReturnValue({
      list,
      remove,
    } as any);

    vi.spyOn(supabaseAdmin, "from").mockImplementation((tabla: string) => {
      const filasPorTabla: Record<string, any[]> = {};
      return {
        select: (_cols: string) => {
          const consulta: any = {
            not: () => consulta,
            order: () => consulta,
            range: async () => ({ data: filasPorTabla[tabla] ?? [], error: null }),
            in: async () => ({ data: [], error: null }),
          };
          return consulta;
        },
      } as any;
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("en modo informe detecta huérfanos pero no llama a remove", async () => {
    (config as any).STORAGE_LIMPIEZA_BORRAR = undefined;
    mockearSupabase([
      `servicios/${ID_SERV}/a.jpg`,
      `servicios/${ID_SERV_2}/b.jpg`,
    ]);

    const res = await limpiarStorageHuerfanos();

    expect(res.ok).toBe(true);
    expect(res.modo).toBe("informe");
    expect(res.huerfanos).toBe(2);
    expect(res.borrados).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it("con un valor distinto de 'true' exacto tampoco borra", async () => {
    (config as any).STORAGE_LIMPIEZA_BORRAR = "TRUE";
    mockearSupabase([`servicios/${ID_SERV}/a.jpg`]);

    const res = await limpiarStorageHuerfanos();

    expect(res.modo).toBe("informe");
    expect(remove).not.toHaveBeenCalled();
  });

  it("con STORAGE_LIMPIEZA_BORRAR=true llama a remove solo con los huérfanos", async () => {
    (config as any).STORAGE_LIMPIEZA_BORRAR = "true";
    mockearSupabase([
      `servicios/${ID_SERV}/a.jpg`,
      `servicios/${ID_SERV_2}/b.jpg`,
    ]);

    const res = await limpiarStorageHuerfanos();

    expect(res.modo).toBe("borrado");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([
      `servicios/${ID_SERV}/a.jpg`,
      `servicios/${ID_SERV_2}/b.jpg`,
    ]);
    expect(res.borrados).toBe(2);
  });

  it("respeta el tope de 200 borrados por corrida", async () => {
    (config as any).STORAGE_LIMPIEZA_BORRAR = "true";
    const paths: string[] = [];
    for (let i = 0; i < 250; i++) {
      paths.push(`servicios/${ID_SERV}/archivo-${i}.jpg`);
    }
    mockearSupabase(paths);

    const res = await limpiarStorageHuerfanos();

    expect(res.huerfanos).toBe(250);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][0]).toHaveLength(200);
    expect(res.borrados).toBe(200);
  });
});
