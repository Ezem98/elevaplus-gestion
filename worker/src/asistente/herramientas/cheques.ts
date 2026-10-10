import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";

function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

function sumarDias(fechaIso: string, dias: number): string {
  const [a, m, d] = fechaIso.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d, 12, 0, 0));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${mm}-${dd}`;
}

export const herramientaChequesProximos: HerramientaAsistente = {
  nombre: "cheques_proximos",
  descripcion:
    "Consulta cheques a cobrar y cheques a cubrir en los próximos días (por defecto 7 días), indicando fecha de pago, banco, contraparte y monto.",
  parametros: {
    type: "object",
    properties: {
      dias: {
        type: "number",
        description: "Cantidad de días hacia adelante a consultar (default: 7)",
      },
    },
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta, args: { dias?: number }) {
    const cantDias = typeof args.dias === "number" && args.dias > 0 ? args.dias : 7;
    const fechaHasta = sumarDias(ctx.hoy, cantDias);

    // Consultar cheques en la ventana [hoy, fechaHasta]
    const { data: cheques, error } = await ctx.supabase
      .from("cheques")
      .select(
        "id, tipo, es_echeq, numero, banco, emisor, pagado_a, fecha_pago, monto, estado, notas, " +
          "clientes!cheques_cliente_id_fkey(nombre)",
      )
      .gte("fecha_pago", ctx.hoy)
      .lte("fecha_pago", fechaHasta)
      .order("fecha_pago", { ascending: true });

    if (error) {
      return {
        error: `Error al consultar cheques: ${error.message}`,
      };
    }

    const lista = cheques || [];

    const aCobrar: any[] = [];
    const aCubrir: any[] = [];
    let totalCobrar = 0;
    let totalCubrir = 0;

    for (const ch of lista as any[]) {
      const monto = Number(ch.monto || 0);
      if (ch.tipo === "recibido" && ["en_cartera", "depositado"].includes(ch.estado)) {
        totalCobrar += monto;
        aCobrar.push({
          id: ch.id,
          numero: ch.numero || "S/N",
          banco: ch.banco || "Desconocido",
          fecha_pago: ch.fecha_pago,
          monto,
          monto_formateado: formatearMoneda(monto),
          cliente: ch.clientes?.nombre || ch.emisor || "Sin emisor",
          estado: ch.estado,
          es_echeq: ch.es_echeq,
        });
      } else if (ch.tipo === "emitido" && ch.estado === "emitido") {
        totalCubrir += monto;
        aCubrir.push({
          id: ch.id,
          numero: ch.numero || "S/N",
          banco: ch.banco || "Desconocido",
          fecha_pago: ch.fecha_pago,
          monto,
          monto_formateado: formatearMoneda(monto),
          destinatario: ch.pagado_a || ch.notas || "Sin destinatario",
          estado: ch.estado,
          es_echeq: ch.es_echeq,
        });
      }
    }

    let resumen = `Cheques para los próximos ${cantDias} días (hasta ${fechaHasta}):\n`;
    if (aCobrar.length === 0) {
      resumen += "- A cobrar: ningún cheque pendiente.\n";
    } else {
      resumen += `- A cobrar: ${aCobrar.length} cheque(s) por un total de ${formatearMoneda(totalCobrar)}.\n`;
      resumen += aCobrar
        .map((c) => `  * ${c.fecha_pago}: ${c.banco} #${c.numero} (${c.cliente}) por ${c.monto_formateado}`)
        .join("\n") + "\n";
    }

    if (aCubrir.length === 0) {
      resumen += "- A cubrir: ningún cheque emitido a cubrir.";
    } else {
      resumen += `- A cubrir: ${aCubrir.length} cheque(s) por un total de ${formatearMoneda(totalCubrir)}.\n`;
      resumen += aCubrir
        .map((c) => `  * ${c.fecha_pago}: ${c.banco} #${c.numero} (${c.destinatario}) por ${c.monto_formateado}`)
        .join("\n");
    }

    return {
      dias: cantDias,
      fecha_desde: ctx.hoy,
      fecha_hasta: fechaHasta,
      a_cobrar: aCobrar,
      total_a_cobrar: totalCobrar,
      total_a_cobrar_formateado: formatearMoneda(totalCobrar),
      a_cubrir: aCubrir,
      total_a_cubrir: totalCubrir,
      total_a_cubrir_formateado: formatearMoneda(totalCubrir),
      resumen: resumen.trim(),
    };
  },
};
