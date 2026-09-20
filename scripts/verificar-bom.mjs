import fs from "node:fs";
import path from "node:path";

const carpetas = [".github", "supabase/migrations", "supabase/tests", "worker", "tests", "src"];
const conBOM = [];

function revisarRuta(ruta) {
  if (!fs.existsSync(ruta)) return;
  const stat = fs.statSync(ruta);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(ruta);
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      revisarRuta(path.join(ruta, entry));
    }
  } else {
    if (stat.size >= 3) {
      const fd = fs.openSync(ruta, "r");
      const buffer = Buffer.alloc(3);
      fs.readSync(fd, buffer, 0, 3, 0);
      fs.closeSync(fd);
      if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        conBOM.push(path.normalize(ruta).replace(/\\/g, "/"));
      }
    }
  }
}

for (const c of carpetas) {
  revisarRuta(c);
}

if (conBOM.length > 0) {
  console.error("❌ Se encontraron archivos con BOM UTF-8 (EF BB BF) que rompen Supabase y herramientas:");
  for (const f of conBOM) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log("✓ Sin archivos con BOM en supabase/migrations, supabase/tests, worker, tests y src.");
}
