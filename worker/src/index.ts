import express from "express";
import cors from "cors";
import cron from "node-cron";
import { config } from "./config";
import { enrutador } from "./http/rutas";
import { correrLote } from "./emision/lote";
import { recuperarFacturasColgadas } from "./emision/recuperar";

const app = express();
const port = config.PORT;

app.use(cors());
app.use(express.json());

// Montar rutas de API
app.use(enrutador);

app.listen(port, () => {
  console.log(`Worker de ELEVAPLUS iniciado en puerto ${port} (ambiente: ${config.NODE_ENV})`);

  // Al arrancar: verificar y recuperar facturas que hayan quedado en 'emitiendo' (idempotencia)
  recuperarFacturasColgadas(10)
    .then((res) => {
      if (res.encontradas > 0) {
        console.log(
          `[INICIO] Recuperación inicial: ${res.recuperadas} recuperadas, ${res.desvinculadas} desvinculadas.`
        );
      }
    })
    .catch((err) => {
      console.error("[INICIO] Error en verificación de facturas colgadas:", err);
    });

  // Configuración del cron nocturno (21:30 hs en TZ)
  const tz = config.TZ || "America/Argentina/Buenos_Aires";
  cron.schedule(
    "30 21 * * *",
    async () => {
      console.log(`[CRON] Disparando lote nocturno programado (${new Date().toISOString()})...`);
      try {
        await correrLote({ disparadoPor: "cron" });
      } catch (err) {
        console.error("[CRON] Error al ejecutar el lote nocturno:", err);
      }
    },
    {
      timezone: tz,
    }
  );

  console.log(`[CRON] Lote nocturno programado: '30 21 * * *' (${tz})`);
});


