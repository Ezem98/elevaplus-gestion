import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import type { Servicio, TipoServicio } from "@/lib/tipos";
import {
  Camera,
  Check,
  Loader2,
  Mic,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PantallaNoPlanificadoProps {
  onCancelar: () => void;
  onCreado: (servicio: Servicio) => void;
}

interface ClienteOpcion {
  id: string;
  nombre: string;
}

const TIPOS_SERVICIO: { tipo: TipoServicio; etiqueta: string }[] = [
  { tipo: "traslado", etiqueta: "Traslado" },
  { tipo: "alquiler_hora", etiqueta: "Alquiler por hora" },
  { tipo: "mantenimiento", etiqueta: "Mantenimiento" },
  { tipo: "otro", etiqueta: "Otro" },
];

function obtenerFechaLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

export function PantallaNoPlanificado({
  onCancelar,
  onCreado,
}: PantallaNoPlanificadoProps) {
  const { perfil } = useAuth();

  // Clientes
  const [clientes, setClientes] = useState<ClienteOpcion[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [clienteSeleccionado, setClienteSeleccionado] =
    useState<ClienteOpcion | null>(null);
  const [esClienteNuevo, setEsClienteNuevo] = useState(false);

  // Tipo de servicio
  const [tipo, setTipo] = useState<TipoServicio>("traslado");

  // Foto (Obligatoria)
  const [fotoArchivo, setFotoArchivo] = useState<File | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Nota de voz (Opcional)
  const [soportaAudio, setSoportaAudio] = useState(false);
  const [mimeTypeAudio, setMimeTypeAudio] = useState<string>("");
  const [grabando, setGrabando] = useState(false);
  const [segundosGrabacion, setSegundosGrabacion] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerGrabacionRef = useRef<any>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Estado de guardado y errores
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar clientes activos
  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        setClientes((data as ClienteOpcion[]) ?? []);
      });
  }, []);

  // Verificar soporte de MediaRecorder y formatos
  useEffect(() => {
    if (typeof window !== "undefined" && typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        setSoportaAudio(true);
        setMimeTypeAudio("audio/webm");
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        setSoportaAudio(true);
        setMimeTypeAudio("audio/mp4");
      } else {
        setSoportaAudio(false);
      }
    } else {
      setSoportaAudio(false);
    }
  }, []);

  // Limpieza de URLs al desmontar
  useEffect(() => {
    return () => {
      if (fotoUrl) URL.revokeObjectURL(fotoUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (timerGrabacionRef.current) clearInterval(timerGrabacionRef.current);
    };
  }, [fotoUrl, audioUrl]);

  // Manejo de foto
  function manejarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFotoArchivo(file);
      const url = URL.createObjectURL(file);
      setFotoUrl(url);
    }
  }

  function quitarFoto() {
    setFotoArchivo(null);
    if (fotoUrl) {
      URL.revokeObjectURL(fotoUrl);
      setFotoUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // Manejo de grabación de audio
  async function toggleGrabacion() {
    if (grabando) {
      // Detener
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (timerGrabacionRef.current) {
        clearInterval(timerGrabacionRef.current);
        timerGrabacionRef.current = null;
      }
      setGrabando(false);
    } else {
      // Iniciar
      setError(null);
      chunksRef.current = [];
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const recorder = new MediaRecorder(stream, { mimeType: mimeTypeAudio });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeTypeAudio });
          setAudioBlob(blob);
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          // Detener tracks para liberar el micrófono
          stream.getTracks().forEach((track) => track.stop());
        };

        recorder.start();
        setGrabando(true);
        setSegundosGrabacion(0);
        timerGrabacionRef.current = setInterval(() => {
          setSegundosGrabacion((prev) => prev + 1);
        }, 1000);
      } catch (err: any) {
        setError("No se pudo acceder al micrófono para grabar audio.");
      }
    }
  }

  function descartarAudio() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBlob(null);
    setSegundosGrabacion(0);
  }

  // Filtrado de clientes
  const clientesFiltrados = clientes
    .filter((c) =>
      c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()),
    )
    .slice(0, 6);

  // Guardado
  async function manejarGuardar() {
    setError(null);

    // Validación: Foto de remito obligatoria
    if (!fotoArchivo) {
      setError("La foto del remito es obligatoria.");
      return;
    }

    // Validación: Cliente seleccionado o nuevo
    if (!clienteSeleccionado && !esClienteNuevo) {
      setError("Seleccioná un cliente o marcá cliente nuevo.");
      return;
    }

    const usuarioId = perfil?.id;
    if (!usuarioId) {
      setError("No hay una sesión activa de usuario.");
      return;
    }

    setGuardando(true);
    const hoy = obtenerFechaLocal();
    const ahora = new Date().toISOString();

    const clienteId = esClienteNuevo ? null : (clienteSeleccionado?.id ?? null);
    const notasCliente = esClienteNuevo
      ? `Cliente nuevo: ${busqueda.trim() || "Sin nombre"}`
      : null;

    try {
      // 1. Insertar servicio no planificado en estado 'terminado'
      const { data: nuevoServicio, error: servError } = await supabase
        .from("servicios")
        .insert({
          tipo,
          cliente_id: clienteId,
          estado: "terminado",
          no_planificado: true,
          creado_por: usuarioId,
          fecha_programada: hoy,
          fecha_inicio: ahora,
          fecha_fin: ahora,
          descripcion: null,
          notas: notasCliente,
        })
        .select("*, clientes(nombre)")
        .single();

      if (servError) throw servError;

      // 2. Insertar en servicio_choferes
      const { error: scError } = await supabase
        .from("servicio_choferes")
        .insert({
          servicio_id: nuevoServicio.id,
          chofer_id: usuarioId,
        });

      if (scError) throw scError;

      // 3. Subir foto obligatoria a Storage y registrar adjunto
      const fotoPath = `servicios/${nuevoServicio.id}/remito-${Date.now()}.jpg`;
      const { error: uploadFotoError } = await supabase.storage
        .from("adjuntos")
        .upload(fotoPath, fotoArchivo, {
          contentType: fotoArchivo.type || "image/jpeg",
        });

      if (uploadFotoError) throw uploadFotoError;

      const { error: adjFotoError } = await supabase.from("adjuntos").insert({
        servicio_id: nuevoServicio.id,
        tipo: "remito",
        storage_path: fotoPath,
        subido_por: usuarioId,
      });

      if (adjFotoError) throw adjFotoError;

      // 4. Si hay nota de voz, subir a Storage y registrar adjunto
      if (audioBlob) {
        const ext = mimeTypeAudio.includes("mp4") ? "mp4" : "webm";
        const audioPath = `servicios/${nuevoServicio.id}/audio-${Date.now()}.${ext}`;
        const { error: uploadAudioError } = await supabase.storage
          .from("adjuntos")
          .upload(audioPath, audioBlob, {
            contentType: mimeTypeAudio,
          });

        if (uploadAudioError) throw uploadAudioError;

        const { error: adjAudioError } = await supabase
          .from("adjuntos")
          .insert({
            servicio_id: nuevoServicio.id,
            tipo: "audio",
            storage_path: audioPath,
            subido_por: usuarioId,
          });

        if (adjAudioError) throw adjAudioError;
      }

      // 5. Transicionar directamente a PantallaCobraste para este servicio
      onCreado(nuevoServicio as Servicio);
    } catch (err: any) {
      setError(err?.message ?? "Error al guardar el servicio no planificado.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[390px] flex-col pb-8">
      {/* Header superior con botón Cancelar */}
      <div className="mb-4 flex h-14 items-center justify-between border-b border-borde bg-superficie px-1">
        <h1 className="text-base font-semibold text-tinta">
          Servicio no planificado
        </h1>
        <button
          type="button"
          onClick={onCancelar}
          className="text-sm font-medium text-tinta-suave hover:text-peligro"
        >
          Cancelar
        </button>
      </div>

      {error && (
        <Aviso variante="peligro" className="mb-4">
          {error}
        </Aviso>
      )}

      {/* Campo 1: Cliente */}
      <div className="mb-5">
        <label className="mb-2 block text-sm font-semibold text-tinta">
          Cliente
        </label>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-tinta-tenue" />
          <input
            type="text"
            className="h-12 w-full rounded-md border border-borde bg-superficie pl-10 pr-3 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca focus:outline-none"
            placeholder="Buscar o elegir cliente"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setClienteSeleccionado(null);
              setEsClienteNuevo(false);
            }}
          />
        </div>

        {/* Lista de coincidencias y botón de cliente nuevo */}
        <div className="overflow-hidden rounded-md border border-borde bg-superficie">
          {clientesFiltrados.map((c) => {
            const seleccionado =
              !esClienteNuevo && clienteSeleccionado?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setClienteSeleccionado(c);
                  setEsClienteNuevo(false);
                  setBusqueda(c.nombre);
                }}
                className={`flex w-full items-center justify-between border-b border-borde px-3.5 py-3 text-left text-sm transition-colors last:border-b-0 ${
                  seleccionado
                    ? "bg-marca-suave font-medium text-marca"
                    : "text-tinta hover:bg-fondo active:bg-marca-suave/50"
                }`}
              >
                <span>{c.nombre}</span>
                {seleccionado && <Check className="h-4 w-4 text-marca" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setEsClienteNuevo(true);
              setClienteSeleccionado(null);
            }}
            className={`flex w-full items-center gap-2 px-3.5 py-3 text-left text-sm font-medium transition-colors ${
              esClienteNuevo
                ? "bg-marca-suave font-semibold text-marca"
                : "bg-fondo text-marca hover:bg-marca-suave/30"
            }`}
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>
              Cliente nuevo:{" "}
              {busqueda.trim() ? `"${busqueda.trim()}"` : "usar lo que escribí"}
            </span>
          </button>
        </div>
      </div>

      {/* Campo 2: Tipo de servicio (Grilla 2x2) */}
      <div className="mb-5">
        <label className="mb-2 block text-sm font-semibold text-tinta">
          Tipo de servicio
        </label>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_SERVICIO.map((item) => {
            const activo = tipo === item.tipo;
            return (
              <button
                key={item.tipo}
                type="button"
                onClick={() => setTipo(item.tipo)}
                className={`flex h-14 items-center justify-center rounded-md border px-2 text-center text-sm font-medium transition-all active:scale-[0.99] ${
                  activo
                    ? "border-marca bg-marca-suave font-semibold text-marca shadow-sm"
                    : "border-borde bg-superficie text-tinta hover:bg-fondo"
                }`}
              >
                {item.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      {/* Campo 3: Foto del remito (OBLIGATORIA) */}
      <div className="mb-5">
        <div className="mb-2 flex items-baseline justify-between">
          <label className="block text-sm font-semibold text-tinta">
            Foto del remito
          </label>
          <span className="text-xs font-medium text-peligro">Obligatoria</span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={manejarFoto}
        />

        {!fotoArchivo ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-borde bg-fondo text-marca transition-colors hover:bg-marca-suave/20"
          >
            <Camera className="h-7 w-7 text-marca" />
            <span className="text-sm font-medium">Sacar foto del remito</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-md border border-borde bg-superficie p-3">
            {fotoUrl && (
              <img
                src={fotoUrl}
                alt="Vista previa remito"
                className="h-11 w-11 rounded object-cover border border-borde"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-tinta font-mono">
                {fotoArchivo.name}
              </p>
              <p className="text-[11px] text-tinta-suave">
                {(fotoArchivo.size / 1024).toFixed(0)} KB · Foto adjunta
              </p>
            </div>
            <button
              type="button"
              onClick={quitarFoto}
              className="p-1 text-tinta-suave hover:text-peligro"
              aria-label="Quitar foto"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Campo 4: Nota de voz (OPCIONAL) */}
      {soportaAudio && (
        <div className="mb-6">
          <label className="mb-2 block text-sm font-semibold text-tinta">
            Nota de voz{" "}
            <span className="text-xs font-normal text-tinta-suave">
              (opcional)
            </span>
          </label>

          {!audioUrl ? (
            <button
              type="button"
              onClick={toggleGrabacion}
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-md border text-sm font-medium transition-all ${
                grabando
                  ? "border-peligro bg-peligro-suave text-peligro animate-pulse"
                  : "border-borde bg-superficie text-tinta hover:bg-fondo"
              }`}
            >
              {grabando ? (
                <>
                  <Square className="h-4 w-4 fill-current" />
                  <span>Detener grabación ({segundosGrabacion} s)</span>
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 text-tinta-suave" />
                  <span>Grabar nota de voz</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-md border border-borde bg-superficie p-2.5">
              <audio controls src={audioUrl} className="h-8 flex-1" />
              <button
                type="button"
                onClick={descartarAudio}
                className="p-1.5 text-tinta-suave hover:text-peligro"
                aria-label="Borrar nota de voz"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pie y botón de guardado */}
      <div className="mt-4">
        <p className="mb-2 text-center text-xs text-tinta-suave">
          La oficina completa el precio y los datos después.
        </p>
        <Boton
          type="button"
          tamano="lg"
          className="w-full shadow-md"
          disabled={guardando}
          onClick={manejarGuardar}
        >
          {guardando ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Guardando...</span>
            </>
          ) : (
            <span>Guardar</span>
          )}
        </Boton>
      </div>
    </div>
  );
}
