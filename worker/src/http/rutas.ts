import { Router } from "express";
import { config } from "../config";
import { requerirAdminUOficina } from "./auth";
import { emitirFactura } from "../emision/emitir";

export const enrutador = Router();

// Health check
enrutador.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "elevaplus-worker",
    ambiente: config.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Emisión a demanda desde la app
enrutador.post("/emitir", requerirAdminUOficina, async (req, res) => {
  const { cliente_id, servicio_ids } = req.body;

  if (!cliente_id || typeof cliente_id !== "string") {
    res.status(400).json({ error: "Falta el campo cliente_id." });
    return;
  }

  if (!Array.isArray(servicio_ids) || servicio_ids.length === 0) {
    res.status(400).json({ error: "Debe enviar una lista servicio_ids no vacía." });
    return;
  }

  try {
    const resultado = await emitirFactura({
      clienteId: cliente_id,
      servicioIds: servicio_ids,
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
