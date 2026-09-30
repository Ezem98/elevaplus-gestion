import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { useAuth } from "@/features/auth/AuthProvider";

export interface OpcionesBorrador<T> {
  onRestaurar?: (datos: T) => void;
  onDescartar?: () => void;
  tieneContenido?: (datos: T) => boolean;
  deshabilitado?: boolean;
}

/**
 * Sanitiza recursivamente el estado antes de guardarlo en localStorage.
 * Elimina cualquier campo con nombres sensibles de contraseñas, funciones o blobs.
 */
export function sanitizarBorrador<T>(valor: T): T {
  if (valor === null || typeof valor !== "object") {
    return valor;
  }
  if (Array.isArray(valor)) {
    return valor.map((item) => sanitizarBorrador(item)) as unknown as T;
  }
  const resultado: Record<string, any> = {};
  for (const [k, v] of Object.entries(valor as Record<string, any>)) {
    // Nunca guardar contraseñas
    if (/^(password|clave|contrase[nñ]a)$/i.test(k)) {
      continue;
    }
    // Omitir funciones y objetos no serializables como Blob/File
    if (typeof v === "function") {
      continue;
    }
    if (typeof Blob !== "undefined" && v instanceof Blob) {
      continue;
    }
    resultado[k] = sanitizarBorrador(v);
  }
  return resultado as T;
}

/**
 * Limpia todos los borradores almacenados en localStorage para un usuario específico o para todos.
 */
export function limpiarTodosLosBorradores(usuarioId?: string) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const prefijo = usuarioId ? `borrador_${usuarioId}_` : "borrador_";
  const aBorrar: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(prefijo) || (usuarioId ? false : key.startsWith("borrador_")))) {
      aBorrar.push(key);
    }
  }
  for (const k of aBorrar) {
    localStorage.removeItem(k);
  }
}

function evaluacionPorDefectoTieneContenido(obj: any): boolean {
  if (!obj || typeof obj !== "object") return Boolean(obj);
  return Object.values(obj).some((val) => {
    if (val === null || val === undefined || val === "" || val === false) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "object") return evaluacionPorDefectoTieneContenido(val);
    return true;
  });
}

export interface SobreBorrador<T> {
  guardadoEn: number;
  datos: T;
}

export const LIMITE_EXPIRACION_BORRADOR_MS = 3 * 24 * 60 * 60 * 1000; // 3 días

/**
 * Formatea la antigüedad del borrador en español rioplatense (ej. "hace 2 horas", "hace unos segundos").
 */
export function formatearAntiguedad(
  timestamp: number | Date,
  ahora: number = Date.now(),
): string {
  const t = typeof timestamp === "number" ? timestamp : timestamp.getTime();
  const diffMs = Math.max(0, ahora - t);
  const minutos = Math.floor(diffMs / 60000);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);

  if (dias >= 1) {
    return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  }
  if (horas >= 1) {
    return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
  }
  if (minutos >= 1) {
    return minutos === 1 ? "hace 1 minuto" : `hace ${minutos} minutos`;
  }
  return "hace unos segundos";
}

/**
 * Hook para guardar automáticamente borradores de formularios en localStorage cada 2 segundos.
 * Identifica la clave por formulario y usuario.
 * Descarta automáticamente los borradores con más de 3 días de antigüedad.
 * Muestra el aviso "Recuperamos lo que estabas cargando hace X" con "Descartar".
 */
export function useBorrador<T extends Record<string, any>>(
  clave: string,
  estado: T,
  opciones?: OpcionesBorrador<T>,
) {
  const { session, perfil } = useAuth();
  const usuarioId = perfil?.id || session?.user?.id || "anon";
  const storageKey = `borrador_${usuarioId}_${clave}`;

  const [hayBorrador, setHayBorrador] = useState(false);
  const [antiguedadTexto, setAntiguedadTexto] = useState<string>("");
  const inicializadoRef = useRef(false);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const opcionesRef = useRef(opciones);
  opcionesRef.current = opciones;

  const tieneContenidoFn = opciones?.tieneContenido || evaluacionPorDefectoTieneContenido;

  // Restaurar borrador al abrir / montar o al cambiar de clave
  useEffect(() => {
    if (opcionesRef.current?.deshabilitado || !clave) {
      setHayBorrador(false);
      setAntiguedadTexto("");
      return;
    }

    setHayBorrador(false);
    setAntiguedadTexto("");

    try {
      const guardado = localStorage.getItem(storageKey);
      if (guardado) {
        const parsed = JSON.parse(guardado);
        if (parsed && typeof parsed === "object") {
          let datos: T;
          let guardadoEn: number;

          if ("guardadoEn" in parsed && "datos" in parsed) {
            guardadoEn =
              typeof parsed.guardadoEn === "number"
                ? parsed.guardadoEn
                : new Date(parsed.guardadoEn).getTime();
            datos = parsed.datos;
          } else {
            // Compatibilidad con borradores previos sin sobre
            guardadoEn = Date.now();
            datos = parsed as T;
          }

          const ahora = Date.now();
          // Descartar solos los de más de 3 días
          if (ahora - guardadoEn > LIMITE_EXPIRACION_BORRADOR_MS) {
            localStorage.removeItem(storageKey);
            setHayBorrador(false);
            setAntiguedadTexto("");
            return;
          }

          if (datos && typeof datos === "object" && tieneContenidoFn(datos)) {
            setHayBorrador(true);
            setAntiguedadTexto(formatearAntiguedad(guardadoEn, ahora));
            opcionesRef.current?.onRestaurar?.(datos);
          }
        }
      }
    } catch (err) {
      console.warn("[useBorrador] Error al recuperar borrador:", err);
    } finally {
      inicializadoRef.current = true;
    }
  }, [storageKey, clave]);

  // Guardado automático cada 2 segundos
  useEffect(() => {
    if (opciones?.deshabilitado || !clave || !inicializadoRef.current) return;

    const timer = setTimeout(() => {
      try {
        const sanitizado = sanitizarBorrador(estadoRef.current);
        if (tieneContenidoFn(sanitizado)) {
          const sobre: SobreBorrador<T> = {
            guardadoEn: Date.now(),
            datos: sanitizado,
          };
          localStorage.setItem(storageKey, JSON.stringify(sobre));
        }
      } catch (err) {
        console.warn("[useBorrador] Error al guardar borrador en localStorage:", err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [estado, storageKey, clave, opciones?.deshabilitado]);

  // Guardar antes de recargar la página (beforeunload)
  useEffect(() => {
    if (opciones?.deshabilitado || !clave) return;

    const alRecargar = () => {
      try {
        if (inicializadoRef.current) {
          const sanitizado = sanitizarBorrador(estadoRef.current);
          if (tieneContenidoFn(sanitizado)) {
            const sobre: SobreBorrador<T> = {
              guardadoEn: Date.now(),
              datos: sanitizado,
            };
            localStorage.setItem(storageKey, JSON.stringify(sobre));
          }
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeunload", alRecargar);
    return () => window.removeEventListener("beforeunload", alRecargar);
  }, [storageKey, clave, opciones?.deshabilitado]);

  // Descartar borrador
  const descartar = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn("[useBorrador] Error al descartar borrador:", err);
    }
    setHayBorrador(false);
    setAntiguedadTexto("");
    opcionesRef.current?.onDescartar?.();
  }, [storageKey]);

  // Limpiar borrador al guardar con éxito
  const limpiar = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn("[useBorrador] Error al limpiar borrador:", err);
    }
    setHayBorrador(false);
    setAntiguedadTexto("");
  }, [storageKey]);

  // Componente de aviso UI
  const ComponenteAviso = useCallback(() => {
    if (!hayBorrador) return null;
    const textoAviso = antiguedadTexto
      ? `Recuperamos lo que estabas cargando ${antiguedadTexto}`
      : "Recuperamos lo que estabas cargando";
    return (
      <Aviso variante="info" className="flex items-center justify-between gap-3">
        <span>{textoAviso}</span>
        <Boton
          type="button"
          variante="secundario"
          onClick={descartar}
          className="h-7 px-2.5 text-xs"
        >
          Descartar
        </Boton>
      </Aviso>
    );
  }, [hayBorrador, antiguedadTexto, descartar]);

  return {
    hayBorrador,
    antiguedadTexto,
    descartar,
    limpiar,
    AvisoBorrador: ComponenteAviso,
  };
}
