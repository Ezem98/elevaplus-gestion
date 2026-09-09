import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type InputHTMLAttributes,
} from "react";
import {
  parsearMonto,
  formatearMontoEntrada,
  formatearTextoMonto,
} from "@/lib/formato";

export interface EntradaMontoProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  valor: number | null;
  onChange: (valor: number | null) => void;
}

export function EntradaMonto({
  valor,
  onChange,
  className = "",
  placeholder = "",
  disabled = false,
  id,
  name,
  required,
  autoFocus,
  onFocus,
  onBlur,
  ...props
}: EntradaMontoProps) {
  const [texto, setTexto] = useState<string>(() => formatearMontoEntrada(valor));
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number | null>(null);

  // Sincronizar texto cuando cambia el valor numérico desde el exterior
  useEffect(() => {
    const valorActualParsed = parsearMonto(texto);
    if (valor !== valorActualParsed) {
      setTexto(formatearMontoEntrada(valor));
    }
  }, [valor]);

  // Restaurar la posición calculada del cursor luego de reformatear
  useEffect(() => {
    if (cursorRef.current !== null && inputRef.current) {
      const pos = cursorRef.current;
      inputRef.current.setSelectionRange(pos, pos);
      cursorRef.current = null;
    }
  });

  const manejarCambio = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const selStart = e.target.selectionStart ?? rawValue.length;

    // Contar dígitos y verificar presencia de coma a la izquierda del cursor
    const textoAntesCursor = rawValue.slice(0, selStart);
    const digitosAntes = (textoAntesCursor.match(/\d/g) || []).length;
    const tieneComaAntes = textoAntesCursor.includes(",");

    // Formatear texto aplicando reglas es-AR (puntos de miles, coma decimal, max 2 decimales)
    const nuevoTexto = formatearTextoMonto(rawValue);
    setTexto(nuevoTexto);

    // Calcular la nueva posición del cursor contando dígitos en el texto reformateado
    let nuevaPos = 0;
    let digitosContados = 0;
    let pasoComa = false;

    for (let i = 0; i < nuevoTexto.length; i++) {
      if (digitosContados === digitosAntes && (!tieneComaAntes || pasoComa)) {
        nuevaPos = i;
        break;
      }
      const char = nuevoTexto[i];
      if (/\d/.test(char)) {
        digitosContados++;
      } else if (char === ",") {
        pasoComa = true;
      }
      if (digitosContados === digitosAntes && (!tieneComaAntes || pasoComa)) {
        nuevaPos = i + 1;
        break;
      }
    }
    if (digitosContados < digitosAntes || (tieneComaAntes && !pasoComa)) {
      nuevaPos = nuevoTexto.length;
    }

    cursorRef.current = nuevaPos;

    // Notificar al componente padre el valor numérico (o null si está vacío)
    const valorNumerico = parsearMonto(nuevoTexto);
    onChange(valorNumerico);
  };

  const manejarKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Si el usuario presiona Backspace y el caracter inmediato a la izquierda es un punto separador de miles,
    // saltamos el punto para que se borre el dígito anterior.
    if (e.key === "Backspace" && inputRef.current) {
      const { selectionStart, selectionEnd } = inputRef.current;
      if (
        selectionStart != null &&
        selectionStart === selectionEnd &&
        selectionStart > 1 &&
        texto[selectionStart - 1] === "."
      ) {
        e.preventDefault();
        const nuevaCadena =
          texto.slice(0, selectionStart - 2) + texto.slice(selectionStart);
        const formateado = formatearTextoMonto(nuevaCadena);
        setTexto(formateado);

        const digitosAntes = (texto.slice(0, selectionStart - 2).match(/\d/g) || []).length;
        let pos = 0;
        let count = 0;
        for (let i = 0; i < formateado.length; i++) {
          if (/\d/.test(formateado[i])) count++;
          if (count === digitosAntes) {
            pos = i + 1;
            break;
          }
        }
        cursorRef.current = pos;
        onChange(parsearMonto(formateado));
      }
    }
    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
  };

  const manejarFocus = (e: FocusEvent<HTMLInputElement>) => {
    // Al enfocar vacío, sin ceros
    if (valor === null || valor === undefined) {
      setTexto("");
    }
    if (onFocus) onFocus(e);
  };

  const manejarBlur = (e: FocusEvent<HTMLInputElement>) => {
    // Normalizar si quedó con coma colgando (ej: "1.500,")
    if (texto.endsWith(",")) {
      const limpio = texto.slice(0, -1);
      setTexto(limpio);
    }
    if (onBlur) onBlur(e);
  };

  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-tinta-suave select-none">
        $
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        id={id}
        name={name}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        value={texto}
        onChange={manejarCambio}
        onKeyDown={manejarKeyDown}
        onFocus={manejarFocus}
        onBlur={manejarBlur}
        placeholder={placeholder}
        className={`h-10 w-full rounded-md border border-borde bg-superficie pl-7 pr-3 text-sm text-tinta tabular-nums placeholder:text-tinta-tenue focus:border-marca ${className}`}
        {...props}
      />
    </div>
  );
}
