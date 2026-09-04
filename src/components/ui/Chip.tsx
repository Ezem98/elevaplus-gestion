import type { EstadoServicio } from "@/lib/tipos";
import { ETIQUETA_ESTADO } from "@/lib/tipos";

const color: Record<EstadoServicio, string> = {
  consulta: "bg-fondo text-tinta-suave border-borde",
  presupuestado: "bg-fondo text-tinta-suave border-borde",
  aceptado: "bg-marca-suave text-marca border-marca/20",
  programado: "bg-marca-suave text-marca border-marca/20",
  en_curso: "bg-alerta-suave text-alerta border-alerta/20",
  terminado: "bg-alerta-suave text-alerta border-alerta/20",
  cobrado: "bg-ok-suave text-ok border-ok/20",
  facturado: "bg-ok-suave text-ok border-ok/20",
  cancelado: "bg-peligro-suave text-peligro border-peligro/20",
};

export function ChipEstado({ estado }: { estado: EstadoServicio }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${color[estado]}`}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}
