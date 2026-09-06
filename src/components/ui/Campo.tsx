import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

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

export function AreaTexto({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`h-24 w-full rounded-md border border-borde bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca ${className}`}
      {...props}
    />
  );
}

export function Selector({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`${base} appearance-none pr-9 cursor-pointer ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-tinta-suave" />
    </div>
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
