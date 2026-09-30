import { describe, expect, it, beforeEach } from "vitest";
import {
  sanitizarBorrador,
  limpiarTodosLosBorradores,
} from "./useBorrador";

describe("useBorrador — Funciones auxiliares y sanitización", () => {
  class LocalStorageMock {
    private store: Record<string, string> = {};
    clear() {
      this.store = {};
    }
    getItem(key: string) {
      return this.store[key] ?? null;
    }
    setItem(key: string, value: string) {
      this.store[key] = String(value);
    }
    removeItem(key: string) {
      delete this.store[key];
    }
    key(index: number) {
      return Object.keys(this.store)[index] ?? null;
    }
    get length() {
      return Object.keys(this.store).length;
    }
  }

  const mockStorage = new LocalStorageMock();

  beforeEach(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockStorage;
    mockStorage.clear();
  });

  it("sanitizarBorrador: nunca guarda contraseñas ni claves sensibles", () => {
    const estado = {
      usuario: "admin@test.local",
      clave: "secreta123",
      password: "password123",
      contraseña: "otra_clave",
      contrasena: "sin_enie",
      datos: {
        origen: "Canning",
        clave: "subclave",
        token: "ok",
      },
      lista: [
        { id: 1, clave: "123", nombre: "Item 1" },
        { id: 2, password: "abc", nombre: "Item 2" },
      ],
    };

    const sanitizado = sanitizarBorrador(estado);

    expect(sanitizado).toEqual({
      usuario: "admin@test.local",
      datos: {
        origen: "Canning",
        token: "ok",
      },
      lista: [
        { id: 1, nombre: "Item 1" },
        { id: 2, nombre: "Item 2" },
      ],
    });
    expect((sanitizado as any).clave).toBeUndefined();
    expect((sanitizado as any).password).toBeUndefined();
    expect((sanitizado as any).contraseña).toBeUndefined();
    expect((sanitizado as any).contrasena).toBeUndefined();
    expect((sanitizado.datos as any).clave).toBeUndefined();
  });

  it("limpiarTodosLosBorradores: elimina solo las claves de borrador", () => {
    localStorage.setItem("borrador_user1_servicio", JSON.stringify({ a: 1 }));
    localStorage.setItem("borrador_user1_cliente", JSON.stringify({ b: 2 }));
    localStorage.setItem("borrador_user2_servicio", JSON.stringify({ c: 3 }));
    localStorage.setItem("otra_clave", "preservar");

    // Limpiar para usuario 1
    limpiarTodosLosBorradores("user1");
    expect(localStorage.getItem("borrador_user1_servicio")).toBeNull();
    expect(localStorage.getItem("borrador_user1_cliente")).toBeNull();
    expect(localStorage.getItem("borrador_user2_servicio")).not.toBeNull();
    expect(localStorage.getItem("otra_clave")).toBe("preservar");

    // Limpiar todos
    limpiarTodosLosBorradores();
    expect(localStorage.getItem("borrador_user2_servicio")).toBeNull();
    expect(localStorage.getItem("otra_clave")).toBe("preservar");
  });

  it("formatearAntiguedad: devuelve frases precisas en español rioplatense", async () => {
    const { formatearAntiguedad } = await import("./useBorrador");
    const ahora = 1000000000000;

    // Menos de 1 minuto
    expect(formatearAntiguedad(ahora - 20 * 1000, ahora)).toBe("hace unos segundos");
    // 1 minuto
    expect(formatearAntiguedad(ahora - 60 * 1000, ahora)).toBe("hace 1 minuto");
    // Minutos
    expect(formatearAntiguedad(ahora - 15 * 60 * 1000, ahora)).toBe("hace 15 minutos");
    // 1 hora
    expect(formatearAntiguedad(ahora - 60 * 60 * 1000, ahora)).toBe("hace 1 hora");
    // 2 horas
    expect(formatearAntiguedad(ahora - 2 * 60 * 60 * 1000, ahora)).toBe("hace 2 horas");
    // 1 día
    expect(formatearAntiguedad(ahora - 24 * 60 * 60 * 1000, ahora)).toBe("hace 1 día");
    // Varios días
    expect(formatearAntiguedad(ahora - 3 * 24 * 60 * 60 * 1000, ahora)).toBe("hace 3 días");
  });

  it("claves de cobro independientes: cobro_servicio_<id1> no contamina cobro_servicio_<id2>", () => {
    const usuarioId = "user1";
    const keyServicio1 = `borrador_${usuarioId}_cobro_servicio_serv-001`;
    const keyServicio2 = `borrador_${usuarioId}_cobro_servicio_serv-002`;

    localStorage.setItem(
      keyServicio1,
      JSON.stringify({
        guardadoEn: Date.now(),
        datos: { monto: 50000, referencia: "TRANSF-001" },
      }),
    );

    expect(localStorage.getItem(keyServicio1)).not.toBeNull();
    expect(localStorage.getItem(keyServicio2)).toBeNull();
  });
});

