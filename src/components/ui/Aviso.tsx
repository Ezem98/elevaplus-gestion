import type { HTMLAttributes } from "react";

type Variante = "alerta" | "peligro" | "info" | "exito";

const variantes: Record<Variante, string> = {
  alerta: "bg-alerta-suave border-alerta/20 text-alerta",
  peligro: "bg-peligro-suave border-peligro/20 text-peligro",
  info: "bg-acento/10 border-acento/20 text-acento",
  exito: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
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
