import crypto from "node:crypto";
import fs from "node:fs";

const copias = [
  {
    origen: "src/lib/vencimientos.ts",
    destino: "worker/src/lib/vencimientos.ts",
  },
];

let errores = 0;

for (const { origen, destino } of copias) {
  if (!fs.existsSync(origen)) {
    console.error(`❌ Archivo origen no encontrado: ${origen}`);
    errores++;
    continue;
  }
  if (!fs.existsSync(destino)) {
    console.error(`❌ Archivo destino no encontrado: ${destino}`);
    errores++;
    continue;
  }

  const hashOrigen = crypto
    .createHash("sha256")
    .update(fs.readFileSync(origen))
    .digest("hex");
  const hashDestino = crypto
    .createHash("sha256")
    .update(fs.readFileSync(destino))
    .digest("hex");

  if (hashOrigen !== hashDestino) {
    console.error(
      `❌ Discrepancia detectada entre ${origen} y ${destino}. El worker debe mantener una copia idéntica del original.`
    );
    errores++;
  }
}

if (errores > 0) {
  process.exit(1);
} else {
  console.log("✓ Copias de librerías sincronizadas e idénticas.");
}

