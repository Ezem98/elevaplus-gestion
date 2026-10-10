import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Seguridad RLS: ninguna herramienta del asistente debe importar supabaseAdmin", () => {
  const dirHerramientas = path.resolve(__dirname);

  it("verifica que ningún archivo de herramientas importa o referencia supabaseAdmin", () => {
    const archivos = fs.readdirSync(dirHerramientas);
    const archivosTs = archivos.filter(
      (a) =>
        a.endsWith(".ts") &&
        !a.endsWith(".test.ts") &&
        !a.endsWith(".d.ts"),
    );

    expect(archivosTs.length).toBeGreaterThan(5);

    for (const archivo of archivosTs) {
      const rutaCompleta = path.join(dirHerramientas, archivo);
      const contenido = fs.readFileSync(rutaCompleta, "utf-8");

      const importaAdmin =
        contenido.includes("supabaseAdmin") ||
        /from\s+["'].*\/supabase["']/.test(contenido);

      expect(
        importaAdmin,
        `El archivo ${archivo} importa o referencia supabaseAdmin. Todas las herramientas deben usar únicamente ctx.supabase (sesión del usuario con RLS).`,
      ).toBe(false);
    }
  });
});
