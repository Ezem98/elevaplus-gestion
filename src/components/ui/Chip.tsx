import type {
  EstadoCheque,
  EstadoCobro,
  EstadoMovimiento,
  EstadoServicio,
} from "@/lib/tipos";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_ESTADO_CHEQUE,
  ETIQUETA_ESTADO_COBRO,
} from "@/lib/tipos";

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
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${color[estado]}`}
    >
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
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorCobro[estado]}`}
    >
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
  emitido: "bg-alerta-suave text-alerta border-alerta/20",
  debitado: "bg-ok-suave text-ok border-ok/20",
  anulado: "bg-fondo text-tinta-suave border-borde",
  descontado: "bg-marca-suave text-marca border-marca/20",
};

export function ChipCheque({ estado }: { estado: EstadoCheque }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorCheque[estado]}`}
    >
      {ETIQUETA_ESTADO_CHEQUE[estado]}
    </span>
  );
}

const colorMovimiento: Record<EstadoMovimiento, string> = {
  pendiente: "bg-alerta-suave text-alerta border-alerta/20",
  pagado: "bg-ok-suave text-ok border-ok/20",
};

export function ChipMovimiento({ estado }: { estado: EstadoMovimiento }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorMovimiento[estado]}`}
    >
      {estado === "pendiente" ? "Pendiente" : "Pagado"}
    </span>
  );
}
