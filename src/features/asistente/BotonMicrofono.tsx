import { useEffect, useRef, useState } from "react";
import { Mic, Square, X, AlertCircle } from "lucide-react";

interface BotonMicrofonoProps {
  onAudioGrabado: (blob: Blob, duracionSegundos: number) => void;
  deshabilitado?: boolean;
}

export function BotonMicrofono({
  onAudioGrabado,
  deshabilitado = false,
}: BotonMicrofonoProps) {
  const [soportado, setSoportado] = useState(true);
  const [errorPermiso, setErrorPermiso] = useState<string | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trozosAudioRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canceladoRef = useRef(false);
  const mimeTypeRef = useRef<string>("audio/webm");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !navigator?.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setSoportado(false);
    }
  }, []);

  const limpiarGrabacion = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    trozosAudioRef.current = [];
    setGrabando(false);
    setSegundos(0);
  };

  const iniciarGrabacion = async () => {
    if (deshabilitado || grabando) return;
    setErrorPermiso(null);
    canceladoRef.current = false;
    trozosAudioRef.current = [];

    // Determinar formato compatible (Safari usa audio/mp4)
    let mimeType = "audio/webm";
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      mimeType = "audio/webm;codecs=opus";
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      mimeType = "audio/webm";
    } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
      mimeType = "audio/mp4";
    }
    mimeTypeRef.current = mimeType;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          trozosAudioRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (!canceladoRef.current && trozosAudioRef.current.length > 0) {
          const tipoFinal = mimeTypeRef.current.split(";")[0] || "audio/webm";
          const audioBlob = new Blob(trozosAudioRef.current, {
            type: tipoFinal,
          });
          onAudioGrabado(audioBlob, segundosRef.current);
        }
        limpiarGrabacion();
      };

      mediaRecorder.start(250);
      setGrabando(true);
      setSegundos(0);

      const inicio = Date.now();
      timerRef.current = setInterval(() => {
        const transcurrido = Math.floor((Date.now() - inicio) / 1000);
        setSegundos(transcurrido);
        segundosRef.current = transcurrido;

        // Corte automático a los 120 s (2 minutos)
        if (transcurrido >= 120) {
          detenerYEnviar();
        }
      }, 500);
    } catch (err: any) {
      limpiarGrabacion();
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setErrorPermiso("Sin permiso de micrófono en el navegador.");
      } else {
        setErrorPermiso("No se pudo acceder al micrófono.");
      }
    }
  };

  const segundosRef = useRef(0);
  segundosRef.current = segundos;

  const detenerYEnviar = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      canceladoRef.current = false;
      mediaRecorderRef.current.stop();
    }
  };

  const cancelarGrabacion = () => {
    canceladoRef.current = true;
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    } else {
      limpiarGrabacion();
    }
  };

  if (!soportado || errorPermiso) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-tinta-suave px-2 py-1 bg-fondo rounded border border-borde/60"
        title={errorPermiso || "Micrófono no soportado en este navegador"}
      >
        <AlertCircle className="size-3.5 text-alerta shrink-0" />
        <span className="truncate max-w-[120px]">
          {errorPermiso ? "Sin permiso mic" : "Mic no disponible"}
        </span>
      </div>
    );
  }

  const minutosStr = String(Math.floor(segundos / 60)).padStart(2, "0");
  const segundosStr = String(segundos % 60).padStart(2, "0");

  if (grabando) {
    return (
      <div className="flex items-center gap-2">
        {/* Temporizador y botón cancelar */}
        <div className="flex items-center gap-2 bg-peligro-suave border border-peligro/30 rounded-full px-3 py-1 text-xs font-semibold text-peligro animate-pulse">
          <span className="h-2 w-2 rounded-full bg-peligro" />
          <span>
            {minutosStr}:{segundosStr}
          </span>
          <button
            type="button"
            onClick={cancelarGrabacion}
            className="ml-1 rounded-full p-1 text-peligro hover:bg-peligro/20 transition-colors"
            title="Cancelar grabación"
            aria-label="Cancelar grabación"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Botón de 56px para detener y enviar */}
        <button
          type="button"
          onClick={detenerYEnviar}
          className="h-14 w-14 rounded-full bg-peligro text-white flex items-center justify-center shadow-md hover:bg-peligro/90 active:scale-95 transition-all shrink-0 focus-visible:outline-2"
          title="Tocar para enviar audio"
          aria-label="Tocar para enviar audio"
        >
          <Square className="size-6 fill-current" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={iniciarGrabacion}
      disabled={deshabilitado}
      className="h-14 w-14 rounded-full bg-marca text-white flex items-center justify-center shadow-md hover:bg-marca-oscuro active:scale-95 transition-all shrink-0 disabled:bg-marca/40 disabled:cursor-not-allowed focus-visible:outline-2"
      title="Tocar para grabar audio"
      aria-label="Tocar para grabar mensaje de audio"
    >
      <Mic className="size-6" />
    </button>
  );
}
