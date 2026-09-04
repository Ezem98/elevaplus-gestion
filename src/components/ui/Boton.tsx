import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario" | "peligro" | "fantasma";
type Tamano = "md" | "lg";

const variantes: Record<Variante, string> = {
  primario: "bg-marca text-white hover:bg-marca-oscuro disabled:bg-marca/50",
  secundario: "bg-superficie text-tinta border border-borde hover:bg-fondo disabled:text-tinta-tenue",
  peligro: "bg-peligro text-white hover:bg-red-800 disabled:bg-peligro/50",
  fantasma: "bg-transparent text-marca hover:bg-marca-suave",
};
const tamanos: Record<Tamano, string> = {
  md: "h-10 px-4 text-sm",
  lg: "h-14 px-6 text-base",
};

export function Boton({
  variante = "primario",
  tamano = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamano?: Tamano }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${variantes[variante]} ${tamanos[tamano]} ${className}`}
      {...props}
    />
  );
}
