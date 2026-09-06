import type { EstadoServicio, EstadoCobro, EstadoCheque } from "@/lib/tipos";
import { ETIQUETA_ESTADO, ETIQUETA_ESTADO_COBRO, ETIQUETA_ESTADO_CHEQUE } from "@/lib/tipos";

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

const colorCobro: Record<EstadoCobro, string> = {
  pendiente: "bg-alerta-suave text-alerta border-alerta/20",
  acreditado: "bg-ok-suave text-ok border-ok/20",
  rechazado: "bg-peligro-suave text-peligro border-peligro/20",
};

export function ChipCobro({ estado }: { estado: EstadoCobro }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorCobro[estado]}`}>
      {ETIQUETA_ESTADO_COBRO[estado]}
    </span>
  );
}

const colorCheque: Record<EstadoCheque, string> = {
  en_cartera: "bg-marca-suave text-marca border-marca/20",
  depositado: "bg-fondo text-tinta border-borde",
  acreditado: "bg-ok-suave text-ok border-ok/20",
  rechazado: "bg-peligro-suave text-peligro border-peligro/20",
  endosado: "bg-fondo text-tinta-suave border-borde",
};

export function ChipCheque({ estado }: { estado: EstadoCheque }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorCheque[estado]}`}>
      {ETIQUETA_ESTADO_CHEQUE[estado]}
    </span>
  );
}

