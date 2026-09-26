import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const base =
  "h-10 w-full rounded-md border border-borde bg-superficie px-3 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca";

export function Etiqueta({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-tinta-suave">
      {children}
    </label>
  );
}

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Entrada({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${base} ${className}`} {...props} />;
  }
);

export const EntradaClave = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function EntradaClave(
    { className = "", autoComplete = "current-password", disabled, ...props },
    ref
  ) {
    const [mostrar, setMostrar] = useState(false);
    const inputInternoRef = useRef<HTMLInputElement | null>(null);
    const seleccionRef = useRef<{ inicio: number | null; fin: number | null } | null>(null);

    const setRef = (el: HTMLInputElement | null) => {
      inputInternoRef.current = el;
      if (typeof ref === "function") {
        ref(el);
      } else if (ref && "current" in ref) {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
      }
    };

    const alternarMostrar = () => {
      const input = inputInternoRef.current;
      if (input) {
        seleccionRef.current = {
          inicio: input.selectionStart,
          fin: input.selectionEnd,
        };
      }
      setMostrar((prev) => !prev);
    };

    useIsomorphicLayoutEffect(() => {
      if (seleccionRef.current && inputInternoRef.current) {
        const { inicio, fin } = seleccionRef.current;
        seleccionRef.current = null;
        const input = inputInternoRef.current;
        input.focus();
        if (inicio !== null && fin !== null) {
          input.setSelectionRange(inicio, fin);
        }
        requestAnimationFrame(() => {
          if (document.activeElement === input && inicio !== null && fin !== null) {
            input.setSelectionRange(inicio, fin);
          }
        });
      }
    }, [mostrar]);

    return (
      <div className="relative">
        <Entrada
          {...props}
          ref={setRef}
          type={mostrar ? "text" : "password"}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`pr-11 ${className}`}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={mostrar ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={mostrar}
          onClick={alternarMostrar}
          onMouseDown={(e) => {
            // Evita que el clic le quite el foco al campo en el mouse
            e.preventDefault();
          }}
          className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-tinta-suave hover:text-tinta cursor-pointer transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-marca disabled:pointer-events-none disabled:opacity-50"
        >
          {mostrar ? (
            <EyeOff size={18} aria-hidden="true" />
          ) : (
            <Eye size={18} aria-hidden="true" />
          )}
        </button>
      </div>
    );
  }
);

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

export function Campo({
  etiqueta,
  id,
  ayuda,
  children,
}: {
  etiqueta: string;
  id: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Etiqueta htmlFor={id}>{etiqueta}</Etiqueta>
      {children}
      {ayuda && <p className="mt-1 text-xs text-tinta-suave">{ayuda}</p>}
    </div>
  );
}

