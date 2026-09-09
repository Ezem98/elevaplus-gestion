import { X } from "lucide-react";
import { router } from "@/app/router";

export interface AvisoItem {
  id: string;
  titulo: string;
  detalle?: string;
  accion?: {
    texto: string;
    a: string;
  };
}

interface ToastProps {
  toasts: AvisoItem[];
  onCerrar: (id: string) => void;
}

export function Toast({ toasts, onCerrar }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none flex flex-col gap-2 bottom-[72px] left-4 right-4 items-center md:bottom-6 md:left-auto md:right-6 md:items-end"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-lg bg-tinta px-4 py-3 text-sm text-white shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2"
          role="status"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{t.titulo}</p>
            {t.detalle && (
              <p className="mt-0.5 text-xs text-tinta-tenue">{t.detalle}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {t.accion && (
              <button
                type="button"
                onClick={() => {
                  router.navigate(t.accion!.a);
                  onCerrar(t.id);
                }}
                className="text-marca-suave font-medium hover:underline text-sm whitespace-nowrap"
              >
                {t.accion.texto}
              </button>
            )}
            <button
              type="button"
              onClick={() => onCerrar(t.id)}
              className="rounded p-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar aviso"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
