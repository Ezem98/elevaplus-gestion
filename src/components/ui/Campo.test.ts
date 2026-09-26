import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntradaClave } from "./Campo";

describe("EntradaClave", () => {
  it("renderiza inicialmente un input type='password' con pr-11", () => {
    const html = renderToStaticMarkup(
      createElement(EntradaClave, { id: "clave", value: "secreto123", readOnly: true })
    );
    expect(html).toContain('type="password"');
    expect(html).toContain('id="clave"');
    expect(html).toContain('value="secreto123"');
    expect(html).toContain("pr-11");
  });

  it("renderiza el botón con type='button', área táctil de 44 px y etiquetas de accesibilidad", () => {
    const html = renderToStaticMarkup(
      createElement(EntradaClave, { id: "clave" })
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Mostrar contraseña"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("h-11");
    expect(html).toContain("w-11");
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("min-w-[44px]");
    expect(html).toContain("text-tinta-suave");
    expect(html).toContain("hover:text-tinta");
  });

  it("respeta el autoComplete recibido o usa current-password por defecto", () => {
    const htmlDefecto = renderToStaticMarkup(
      createElement(EntradaClave, { id: "clave" })
    );
    expect(htmlDefecto).toContain('autoComplete="current-password"');

    const htmlNuevo = renderToStaticMarkup(
      createElement(EntradaClave, { id: "clave", autoComplete: "new-password" })
    );
    expect(htmlNuevo).toContain('autoComplete="new-password"');
  });

  it("soporta estado deshabilitado tanto en el input como en el botón", () => {
    const html = renderToStaticMarkup(
      createElement(EntradaClave, { id: "clave", disabled: true })
    );
    expect(html).toContain('disabled=""');
  });
});
