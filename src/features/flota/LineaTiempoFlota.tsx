import { formatearFecha, formatearPesos } from "@/lib/formato";
import type { EventoFlota } from "@/lib/tipos";
import { ETIQUETA_EVENTO_FLOTA } from "@/lib/tipos";

interface LineaTiempoFlotaProps {
  eventos: EventoFlota[];
}

export function LineaTiempoFlota({ eventos }: LineaTiempoFlotaProps) {
  if (eventos.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-tinta-suave bg-fondo rounded-md border border-borde/60">
        No hay eventos registrados en el historial técnico.
      </div>
    );
  }

  return (
    <div className="relative pl-5 border-l border-borde space-y-4 my-2">
      {eventos.map((ev) => {
        const esTaller = ev.tipo === "taller" || ev.tipo === "reparacion";
        const colorPunto = esTaller
          ? "bg-alerta ring-alerta-suave"
          : "bg-marca ring-marca-suave";

        return (
          <div key={ev.id} className="relative text-xs space-y-1">
            {/* Indicador de nodo */}
            <div
              className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ${colorPunto}`}
            />

            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-tinta text-[13px]">
                {ETIQUETA_EVENTO_FLOTA[ev.tipo] ?? ev.tipo}
              </span>
              <span className="text-tinta-suave tabular-nums">
                {formatearFecha(ev.fecha)}
                {ev.fecha_fin ? ` al ${formatearFecha(ev.fecha_fin)}` : ""}
              </span>
            </div>

            {ev.descripcion && (
              <p className="text-tinta text-xs leading-relaxed">
                {ev.descripcion}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-tinta-suave text-[11px] pt-0.5">
              {ev.km != null && (
                <span>Km: {ev.km.toLocaleString("es-AR")}</span>
              )}
              {ev.horas != null && (
                <span>Horómetro: {ev.horas.toLocaleString("es-AR")} h</span>
              )}
              {ev.costo != null && (
                <span className="font-medium text-tinta">
                  Costo: {formatearPesos(ev.costo)}
                </span>
              )}
              {ev.proveedor && <span>Proveedor: {ev.proveedor}</span>}
              {ev.proximo_vencimiento && (
                <span className="text-alerta font-medium">
                  Próx. vencimiento: {formatearFecha(ev.proximo_vencimiento)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
