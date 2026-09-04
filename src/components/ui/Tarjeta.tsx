import type { HTMLAttributes } from "react";

export function Tarjeta({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-borde bg-superficie ${className}`} {...props} />;
}
