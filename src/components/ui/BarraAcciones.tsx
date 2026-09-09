import type { ReactNode } from "react";

export interface BarraAccionesProps {
  children: ReactNode;
  className?: string;
}

export function BarraAcciones({ children, className = "" }: BarraAccionesProps) {
  return (
    <div
      className={`fixed inset-x-0 bottom-[60px] z-20 flex gap-2 border-t border-borde bg-superficie px-4 py-3 [&>*]:flex-1 md:static md:flex md:justify-end md:gap-2 md:border-0 md:bg-transparent md:px-0 md:py-0 md:pt-6 md:[&>*]:flex-initial ${className}`}
    >
      {children}
    </div>
  );
}
