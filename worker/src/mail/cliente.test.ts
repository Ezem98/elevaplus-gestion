import { describe, it, expect } from "vitest";
import { filtrarDestinatarioPorListaBlanca } from "./cliente";

describe("filtrarDestinatarioPorListaBlanca", () => {
  it("en produccion permite cualquier destinatario", () => {
    const res = filtrarDestinatarioPorListaBlanca("cliente@real.com", "production", "");
    expect(res.permitido).toBe(true);
    expect(res.emailFinal).toBe("cliente@real.com");
  });

  it("en staging bloquea si la lista blanca esta vacia", () => {
    const res = filtrarDestinatarioPorListaBlanca("cliente@real.com", "staging", "");
    expect(res.permitido).toBe(false);
    expect(res.motivo).toContain("no configurada");
  });

  it("en staging permite destinatarios que estan en la lista blanca (sin importar mayúsculas o espacios)", () => {
    const lista = "admin@empresa.com, prueba@eleva-plus.com.ar";
    const res = filtrarDestinatarioPorListaBlanca("Prueba@eleva-plus.com.ar", "staging", lista);
    expect(res.permitido).toBe(true);
  });

  it("en staging bloquea destinatarios que no estan en la lista blanca", () => {
    const lista = "admin@empresa.com, prueba@eleva-plus.com.ar";
    const res = filtrarDestinatarioPorListaBlanca("cliente_real@gmail.com", "staging", lista);
    expect(res.permitido).toBe(false);
    expect(res.motivo).toContain("no está incluido en la lista blanca");
  });
});
