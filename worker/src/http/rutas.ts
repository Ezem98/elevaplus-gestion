import { Router } from "express";
import { generarInstancias } from "../agenda/instancias";
import { recordatoriosHoy, recordatoriosManana } from "../agenda/recordatorios";
import { resumenSemanal } from "../agenda/resumenSemanal";
import { consultarPadron } from "../arca/padron";
import { config } from "../config";
import { emitirFactura } from "../emision/emitir";
import { correrLote } from "../emision/lote";
import { enviarFacturaEmail } from "../mail/enviar";
import { requerirAdminUOficina, requerirWorkerSecretOAdmin } from "./auth";
import { gcalRouter } from "./gcal";
import { sincronizarCalendario } from "../gcal/sincronizar";

export const enrutador = Router();

// Sub-rutas de Google Calendar
enrutador.use("/gcal", gcalRouter);

// Health check
enrutador.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "elevaplus-worker",
    ambiente: config.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Emisión a demanda de un conjunto específico de servicios
enrutador.post("/emitir", requerirAdminUOficina, async (req, res) => {
  const { cliente_id, servicio_ids, servicios, cotizaciones } = req.body;

  if (!cliente_id || typeof cliente_id !== "string") {
    res.status(400).json({ error: "Falta el campo cliente_id." });
    return;
  }

  let listaServicios: Array<{ id: string; cotizacion?: number }> = [];
  if (Array.isArray(servicios) && servicios.length > 0) {
    listaServicios = servicios.map((s: any) => ({
      id: typeof s === "string" ? s : s.id,
      cotizacion:
        typeof s === "object" && s.cotizacion != null
          ? Number(s.cotizacion)
          : cotizaciones && cotizaciones[s.id || s] != null
            ? Number(cotizaciones[s.id || s])
            : undefined,
    }));
  } else if (Array.isArray(servicio_ids) && servicio_ids.length > 0) {
    listaServicios = servicio_ids.map((id: string) => ({
      id,
      cotizacion:
        cotizaciones && cotizaciones[id] != null
          ? Number(cotizaciones[id])
          : undefined,
    }));
  }

  if (listaServicios.length === 0) {
    res
      .status(400)
      .json({ error: "Debe enviar una lista servicio_ids no vacía." });
    return;
  }

  try {
    const resultado = await emitirFactura({
      clienteId: cliente_id,
      servicios: listaServicios,
      servicioIds: listaServicios.map((s) => s.id),
      cotizaciones,
    });

    res.status(200).json({
      ok: true,
      ...resultado,
    });
  } catch (err: any) {
    console.error("Error al emitir factura a demanda:", err);
    res.status(400).json({
      ok: false,
      error: err?.message || "Ocurrió un error al emitir la factura en ARCA.",
    });
  }
});

// Disparo de lote nocturno o a demanda (botón 'Correr ahora' o cron externo)
enrutador.post("/lote", requerirWorkerSecretOAdmin, async (req, res) => {
  try {
    const usuarioId = req.usuario?.id;
    const disparadoPor =
      usuarioId && usuarioId !== "worker_secret"
        ? `manual:${usuarioId}`
        : "manual";

    const resultado = await correrLote({ disparadoPor });

    res.status(200).json({
      ok: true,
      ...resultado,
    });
  } catch (err: any) {
    console.error("Error al ejecutar corrida de lote:", err);
    res.status(500).json({
      ok: false,
      error:
        err?.message || "Ocurrió un error al ejecutar el lote de facturación.",
    });
  }
});

// Reenvío de factura por correo electrónico
enrutador.post(
  "/reenviar-mail",
  requerirWorkerSecretOAdmin,
  async (req, res) => {
    const { factura_id } = req.body;

    if (!factura_id || typeof factura_id !== "string") {
      res.status(400).json({ error: "Falta el campo factura_id." });
      return;
    }

    try {
      const resultado = await enviarFacturaEmail(factura_id);
      if (!resultado.exito) {
        res.status(400).json({
          ok: false,
          motivo: resultado.motivo,
          error: `No se pudo enviar el correo: ${resultado.motivo || "desconocido"}`,
        });
        return;
      }

      res.status(200).json({
        ok: true,
        destinatario: resultado.destinatario,
      });
    } catch (err: any) {
      console.error("Error al reenviar factura por correo:", err);
      res.status(500).json({
        ok: false,
        error: err?.message || "Ocurrió un error al reenviar la factura.",
      });
    }
  },
);

// Consulta de constancia de inscripción en padrón de ARCA
enrutador.get("/padron/:cuit", requerirAdminUOficina, async (req, res) => {
  const cuitParam = req.params.cuit;
  const cuit = Array.isArray(cuitParam) ? cuitParam[0] : cuitParam;
  if (!cuit) {
    res.status(400).json({ error: "Falta el parámetro CUIT." });
    return;
  }

  try {
    const datos = await consultarPadron(cuit);
    if (!datos) {
      res.status(404).json({
        ok: false,
        error: "El CUIT no se encuentra en el padrón de ARCA.",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      ...datos,
    });
  } catch (err: any) {
    console.error("Error al consultar padrón de ARCA:", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Ocurrió un error al consultar el padrón de ARCA.",
    });
  }
});

// Disparo manual de tareas del worker (instancias, recordatorios, resumen semanal)
enrutador.post(
  "/tareas/:nombre",
  requerirWorkerSecretOAdmin,
  async (req, res) => {
    const nombreParam = req.params.nombre;
    const nombre = Array.isArray(nombreParam) ? nombreParam[0] : nombreParam;
    const forzar = req.query.forzar === "1" || req.query.forzar === "true";

    try {
      let resultado: any;
      switch (nombre) {
        case "instancias":
          resultado = await generarInstancias({ forzar });
          break;
        case "recordatorios-hoy":
          resultado = await recordatoriosHoy({ forzar });
          break;
        case "recordatorios-manana":
          resultado = await recordatoriosManana({ forzar });
          break;
        case "resumen-semanal":
          resultado = await resumenSemanal({ forzar });
          break;
        case "calendario":
          resultado = await sincronizarCalendario({ forzar });
          break;
        default:
          res.status(400).json({
            ok: false,
            error: `Tarea desconocida: '${nombre}'. Tareas válidas: instancias, recordatorios-hoy, recordatorios-manana, resumen-semanal, calendario.`,
          });
          return;
      }

      res.status(200).json({
        ok: true,
        tarea: nombre,
        forzar,
        ...resultado,
      });
    } catch (err: any) {
      console.error(`[TAREAS] Error al ejecutar tarea '${nombre}':`, err);
      res.status(500).json({
        ok: false,
        error: err?.message || `Error al ejecutar la tarea '${nombre}'.`,
      });
    }
  },
);
