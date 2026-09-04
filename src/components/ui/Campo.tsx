import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

const base =
  "h-10 w-full rounded-md border border-borde bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca";

export function Etiqueta({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-tinta-suave">
      {children}
    </label>
  );
}

export function Entrada({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} ${className}`} {...props} />;
}

export function Selector({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${base} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Campo({ etiqueta, id, children }: { etiqueta: string; id: string; children: ReactNode }) {
  return (
    <div>
      <Etiqueta htmlFor={id}>{etiqueta}</Etiqueta>
      {children}
    </div>
  );
}
