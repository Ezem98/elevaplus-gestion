import cors from "cors";
import express from "express";
import cron from "node-cron";
import { generarInstancias } from "./agenda/instancias";
import { recordatoriosHoy, recordatoriosManana } from "./agenda/recordatorios";
import { resumenChoferesHoy } from "./agenda/resumenChoferes";
import { resumenSemanal } from "./agenda/resumenSemanal";
import { config } from "./config";
import { correrLote } from "./emision/lote";
import { recuperarFacturasColgadas } from "./emision/recuperar";
import { sincronizarCalendario } from "./gcal/sincronizar";
import { enrutador } from "./http/rutas";
import { limpiarStorageHuerfanos } from "./storage/limpiarHuerfanos";

const app = express();
const port = config.PORT;

app.use(cors());
app.use(express.json());

// Montar rutas de API
app.use(enrutador);

app.listen(port, () => {
  console.log(
    `Worker de ELEVAPLUS iniciado en puerto ${port} (ambiente: ${config.NODE_ENV})`,
  );

  // Al arrancar: verificar y recuperar facturas que hayan quedado en 'emitiendo' (idempotencia)
  recuperarFacturasColgadas(10)
    .then((res) => {
      if (res.encontradas > 0) {
        console.log(
          `[INICIO] Recuperación inicial: ${res.recuperadas} recuperadas, ${res.desvinculadas} desvinculadas.`,
        );
      }
    })
    .catch((err) => {
      console.error(
        "[INICIO] Error en verificación de facturas colgadas:",
        err,
      );
    });

  const tz = config.TZ || "America/Argentina/Buenos_Aires";

  // 1. Cron nocturno facturación (21:30 hs)
  cron.schedule(
    "30 21 * * *",
    async () => {
      console.log(
        `[CRON] Disparando lote nocturno programado (${new Date().toISOString()})...`,
      );
      try {
        await correrLote({ disparadoPor: "cron" });
      } catch (err) {
        console.error("[CRON] Error al ejecutar el lote nocturno:", err);
      }
    },
    { timezone: tz },
  );

  // 2. Cron 00:30 hs - Generación de instancias de vencimientos (+90 días)
  cron.schedule(
    "30 0 * * *",
    async () => {
      console.log(
        `[CRON] Disparando generación de instancias (${new Date().toISOString()})...`,
      );
      try {
        await generarInstancias();
      } catch (err) {
        console.error("[CRON] Error al generar instancias:", err);
      }
    },
    { timezone: tz },
  );

  // 3. Cron 07:00 hs lunes - Resumen semanal por correo a empresa.email
  cron.schedule(
    "0 7 * * 1",
    async () => {
      console.log(
        `[CRON] Disparando resumen semanal (${new Date().toISOString()})...`,
      );
      try {
        await resumenSemanal();
      } catch (err) {
        console.error("[CRON] Error al enviar resumen semanal:", err);
      }
    },
    { timezone: tz },
  );

  // 4. Cron 08:00 hs - Recordatorios de compromisos del día y alerta de fondos de cheques
  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log(
        `[CRON] Disparando recordatorios de hoy (${new Date().toISOString()})...`,
      );
      try {
        await recordatoriosHoy();
      } catch (err) {
        console.error("[CRON] Error en recordatorios de hoy:", err);
      }
    },
    { timezone: tz },
  );

  // 5. Cron 09:00 hs - Recordatorios de compromisos de mañana
  cron.schedule(
    "0 9 * * *",
    async () => {
      console.log(
        `[CRON] Disparando recordatorios de mañana (${new Date().toISOString()})...`,
      );
      try {
        await recordatoriosManana();
      } catch (err) {
        console.error("[CRON] Error en recordatorios de mañana:", err);
      }
    },
    { timezone: tz },
  );

  // 6. Cron 01:00 hs - Sincronización con Google Calendar
  cron.schedule(
    "0 1 * * *",
    async () => {
      console.log(
        `[CRON] Disparando sincronización con Google Calendar (${new Date().toISOString()})...`,
      );
      try {
        await sincronizarCalendario();
      } catch (err) {
        console.error(
          "[CRON] Error al sincronizar con Google Calendar:",
          err,
        );
      }
    },
    { timezone: tz },
  );

  // 7. Cron 07:00 hs diario - Resumen del día para choferes
  cron.schedule(
    "0 7 * * *",
    async () => {
      console.log(
        `[CRON] Disparando resumen del día para choferes (${new Date().toISOString()})...`,
      );
      try {
        await resumenChoferesHoy();
      } catch (err) {
        console.error(
          "[CRON] Error al ejecutar resumen del día para choferes:",
          err,
        );
      }
    },
    { timezone: tz },
  );

  // 8. Cron domingo 04:00 hs - Limpieza de archivos huérfanos en Storage (solo informe salvo STORAGE_LIMPIEZA_BORRAR=true)
  cron.schedule(
    "0 4 * * 0",
    async () => {
      console.log(
        `[CRON] Disparando limpieza de Storage (${new Date().toISOString()})...`,
      );
      try {
        await limpiarStorageHuerfanos();
      } catch (err) {
        console.error("[CRON] Error en la limpieza de Storage:", err);
      }
    },
    { timezone: tz },
  );

  console.log(`[CRON] Crons programados en zona horaria ${tz}:`);
  console.log(`  - Facturación nocturna: 21:30 hs (30 21 * * *)`);
  console.log(`  - Generación de instancias: 00:30 hs (30 0 * * *)`);
  console.log(`  - Sincronización Google Calendar: 01:00 hs (0 1 * * *)`);
  console.log(`  - Resumen del día choferes: 07:00 hs (0 7 * * *)`);
  console.log(`  - Resumen semanal lunes: 07:00 hs (0 7 * * 1)`);
  console.log(`  - Recordatorios de hoy: 08:00 hs (0 8 * * *)`);
  console.log(`  - Recordatorios de mañana: 09:00 hs (0 9 * * *)`);
  console.log(`  - Limpieza de Storage: domingo 04:00 hs (0 4 * * 0)`);
});
