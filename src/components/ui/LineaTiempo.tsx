import type { EstadoServicio } from "@/lib/tipos";
import { ETIQUETA_ESTADO } from "@/lib/tipos";
import { formatearFechaHoraCorta } from "@/lib/formato";

export interface EventoLineaTiempo {
  id: string | number;
  estado_nuevo: EstadoServicio;
  created_at: string;
  nombre_usuario?: string | null;
  nota?: string | null;
}

interface LineaTiempoProps {
  eventos: EventoLineaTiempo[];
}

export function LineaTiempo({ eventos }: LineaTiempoProps) {
  if (eventos.length === 0) {
    return <p className="text-sm text-tinta-suave">Sin historial.</p>;
  }

  return (
    <div className="relative pl-6">
      {eventos.length > 1 && (
        <div className="absolute left-[3.5px] top-2 bottom-6 w-px bg-borde" />
      )}
      <div className="flex flex-col gap-6">
        {eventos.map((ev, index) => {
          const esUltimo = index === eventos.length - 1;

          if (esUltimo) {
            return (
              <div
                key={ev.id}
                className="relative flex flex-col bg-fondo border border-borde rounded-lg p-3 -ml-3 pl-3"
              >
                <div className="absolute -left-3 top-[18px] size-2 rounded-full bg-marca ring-4 ring-marca-suave" />
                <span className="text-sm font-semibold text-tinta">
                  {ETIQUETA_ESTADO[ev.estado_nuevo] ?? ev.estado_nuevo}
                </span>
                <span className="text-xs text-tinta-suave tabular-nums mt-0.5">
                  {formatearFechaHoraCorta(ev.created_at)}
                  {ev.nombre_usuario ? ` · ${ev.nombre_usuario}` : ""}
                </span>
                {ev.nota && (
                  <span className="text-xs text-tinta-suave italic mt-0.5">
                    {ev.nota}
                  </span>
                )}
              </div>
            );
          }

          return (
            <div key={ev.id} className="relative flex flex-col">
              <div className="absolute -left-6 top-1.5 size-2 rounded-full bg-marca" />
              <span className="text-sm font-medium text-tinta">
                {ETIQUETA_ESTADO[ev.estado_nuevo] ?? ev.estado_nuevo}
              </span>
              <span className="text-xs text-tinta-suave tabular-nums mt-0.5">
                {formatearFechaHoraCorta(ev.created_at)}
                {ev.nombre_usuario ? ` · ${ev.nombre_usuario}` : ""}
              </span>
              {ev.nota && (
                <span className="text-xs text-tinta-suave italic mt-0.5">
                  {ev.nota}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
