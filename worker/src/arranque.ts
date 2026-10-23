// Punto de entrada del worker: primero trae los secretos de Infisical y recién después
// carga el resto, porque config.ts lee process.env apenas se importa.
import { cargarSecretos } from "./secretos";

cargarSecretos({ servicio: "worker" })
  .then((r) => {
    if (r) console.log(`[INICIO] ${r.cantidad} secretos leídos de Infisical`);
    require("./index");
  })
  .catch((err: unknown) => {
    console.error("[INICIO] No se pudieron leer los secretos:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
