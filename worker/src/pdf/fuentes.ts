import path from "node:path";
import { Font } from "@react-pdf/renderer";

let fuentesRegistradas = false;

export function registrarFuentes(): void {
  if (fuentesRegistradas) return;

  try {
    const pkgPath = require.resolve("@fontsource/ibm-plex-sans/package.json");
    const fontDir = path.join(path.dirname(pkgPath), "files");

    Font.register({
      family: "IBM Plex Sans",
      fonts: [
        { src: path.join(fontDir, "ibm-plex-sans-latin-400-normal.woff"), fontWeight: 400 },
        { src: path.join(fontDir, "ibm-plex-sans-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
        { src: path.join(fontDir, "ibm-plex-sans-latin-500-normal.woff"), fontWeight: 500 },
        { src: path.join(fontDir, "ibm-plex-sans-latin-600-normal.woff"), fontWeight: 600 },
        { src: path.join(fontDir, "ibm-plex-sans-latin-700-normal.woff"), fontWeight: 700 },
      ],
    });
    Font.registerHyphenationCallback((word) => [word]);
    fuentesRegistradas = true;
  } catch (err) {
    console.warn("No se pudieron registrar las fuentes locales IBM Plex Sans, usando fuentes por defecto:", err);
  }
}
