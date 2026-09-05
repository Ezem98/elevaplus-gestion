import type { HTMLAttributes } from "react";

type Variante = "alerta" | "peligro";

const variantes: Record<Variante, string> = {
  alerta: "bg-alerta-suave border-alerta/20 text-alerta",
  peligro: "bg-peligro-suave border-peligro/20 text-peligro",
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
