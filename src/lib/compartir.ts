export interface ParametrosCompartirArchivo {
  archivo: File;
  titulo?: string;
  texto?: string;
}

export function puedeCompartirArchivo(archivo: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    return navigator.canShare({ files: [archivo] }) === true;
  } catch {
    return false;
  }
}

// "sin_activacion": el navegador exige que share() se llame enseguida después del toque;
// si antes hubo que generar y subir el PDF, el permiso puede vencer (NotAllowedError).
export type ResultadoCompartir = "compartido" | "cancelado" | "sin_activacion" | "no_soportado";

export async function compartirArchivo({
  archivo,
  titulo,
  texto,
}: ParametrosCompartirArchivo): Promise<ResultadoCompartir> {
  if (!puedeCompartirArchivo(archivo) || typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "no_soportado";
  }

  try {
    const datos: ShareData = {
      files: [archivo],
    };
    if (titulo) datos.title = titulo;
    if (texto) datos.text = texto;

    await navigator.share(datos);
    return "compartido";
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return "cancelado";
    }
    if (err?.name === "NotAllowedError") {
      return "sin_activacion";
    }
    return "no_soportado";
  }
}

export function descargarBlob(blob: Blob, nombre: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return;
  }
  const urlBlob = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = urlBlob;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(urlBlob), 5000);
}
