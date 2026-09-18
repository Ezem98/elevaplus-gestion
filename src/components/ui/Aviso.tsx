import type { HTMLAttributes } from "react";

type Variante = "alerta" | "peligro" | "info" | "exito" | "neutro";

const variantes: Record<Variante, string> = {
  alerta: "bg-alerta-suave border-alerta/20 text-alerta",
  peligro: "bg-peligro-suave border-peligro/20 text-peligro",
  info: "bg-marca-suave border-marca/20 text-marca",
  exito: "bg-ok-suave border-ok/20 text-ok",
  neutro: "bg-superficie border-borde text-tinta",
};

export function Aviso({
  variante = "alerta",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variante?: Variante }) {
  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm font-medium ${variantes[variante]} ${className}`}
      {...props}
    />
  );
}
