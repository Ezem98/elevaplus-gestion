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

export const herramientaAgendaProxima: HerramientaAsistente = {
  nombre: "agenda_proxima",
  descripcion:
    "Consulta los compromisos, vencimientos, cobros y eventos de agenda en los próximos días (por defecto 7 días), agrupados por día.",
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

    const { data: items, error } = await ctx.supabase
      .from("agenda")
      .select("clave, fecha, sentido, titulo, detalle, monto, estado, url")
      .gte("fecha", ctx.hoy)
      .lte("fecha", fechaHasta)
      .order("fecha", { ascending: true });

    if (error) {
      return {
        error: `Error al consultar la agenda: ${error.message}`,
      };
    }

    const lista = items || [];
    const agrupado: Record<string, any[]> = {};

    for (const item of lista) {
      const f = item.fecha;
      if (!agrupado[f]) {
        agrupado[f] = [];
      }
      agrupado[f].push({
        clave: item.clave,
        sentido: item.sentido,
        titulo: item.titulo,
        detalle: item.detalle || null,
        monto: item.monto != null ? Number(item.monto) : null,
        monto_formateado: item.monto != null ? formatearMoneda(Number(item.monto)) : null,
        estado: item.estado,
        url: item.url,
      });
    }

    let resumen = "";
    if (lista.length === 0) {
      resumen = `No hay eventos ni vencimientos agendados para los próximos ${cantDias} días.`;
    } else {
      const diasLineas = Object.entries(agrupado).map(([f, evts]) => {
        const descEvts = evts
          .map((e) => `  * [${e.sentido}] ${e.titulo}${e.detalle ? " (" + e.detalle + ")" : ""}${e.monto_formateado ? " " + e.monto_formateado : ""}`)
          .join("\n");
        return `Día ${f}:\n${descEvts}`;
      });
      resumen = `Agenda para los próximos ${cantDias} días (${lista.length} eventos):\n` + diasLineas.join("\n\n");
    }

    return {
      dias: cantDias,
      fecha_desde: ctx.hoy,
      fecha_hasta: fechaHasta,
      total_eventos: lista.length,
      agrupado_por_dia: agrupado,
      resumen,
    };
  },
};
