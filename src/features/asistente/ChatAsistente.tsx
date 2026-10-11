import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  enviarMensajeAsistente,
  enviarAudioAsistente,
} from "@/lib/worker";
import type {
  AsistenteConversacion,
  AsistenteMensaje,
  AsistentePropuesta,
} from "@/lib/tipos";
import { NOMBRE_ASISTENTE } from "./constantes";
import { TarjetaPropuesta } from "./TarjetaPropuesta";
import { BotonMicrofono } from "./BotonMicrofono";
import { Boton } from "@/components/ui/Boton";
import { Aviso } from "@/components/ui/Aviso";
import {
  Send,
  Plus,
  History,
  Mic,
  MessageSquare,
  AlertCircle,
  X,
} from "lucide-react";

interface ChatAsistenteProps {
  onCerrar?: () => void;
}

export function ChatAsistente({ onCerrar }: ChatAsistenteProps) {
  const [conversaciones, setConversaciones] = useState<AsistenteConversacion[]>(
    [],
  );
  const [conversacionActivaId, setConversacionActivaId] = useState<
    string | null
  >(null);
  const [mensajes, setMensajes] = useState<AsistenteMensaje[]>([]);
  const [propuestasPorId, setPropuestasPorId] = useState<
    Record<string, AsistentePropuesta>
  >({});

  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const autoScroll = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  };

  // Cargar lista de conversaciones del usuario
  const cargarConversaciones = useCallback(async () => {
    const { data, error } = await supabase
      .from("asistente_conversaciones")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[CHIMUELO] Error al cargar conversaciones:", error.message);
      return;
    }

    if (data) {
      setConversaciones(data as AsistenteConversacion[]);
    }
  }, []);

  // Cargar mensajes y propuestas de la conversación activa
  const cargarMensajes = useCallback(async (convId: string) => {
    const [resMsg, resProp] = await Promise.all([
      supabase
        .from("asistente_mensajes")
        .select("*")
        .eq("conversacion_id", convId)
        .order("created_at", { ascending: true }),
      supabase
        .from("asistente_propuestas")
        .select("*")
        .eq("conversacion_id", convId),
    ]);

    if (resMsg.error) {
      console.error("[CHIMUELO] Error al cargar mensajes:", resMsg.error.message);
      return;
    }

    const mapaPropuestas: Record<string, AsistentePropuesta> = {};
    if (resProp.data) {
      for (const p of resProp.data as AsistentePropuesta[]) {
        mapaPropuestas[p.id] = p;
      }
    }
    setPropuestasPorId(mapaPropuestas);

    if (resMsg.data) {
      setMensajes(resMsg.data as AsistenteMensaje[]);
      autoScroll();
    }
  }, []);

  useEffect(() => {
    cargarConversaciones();
  }, [cargarConversaciones]);

  useEffect(() => {
    if (conversacionActivaId) {
      cargarMensajes(conversacionActivaId);
    } else {
      setMensajes([]);
      setPropuestasPorId({});
    }
  }, [conversacionActivaId, cargarMensajes]);

  const iniciarNuevaConversacion = () => {
    setConversacionActivaId(null);
    setMensajes([]);
    setPropuestasPorId({});
    setErrorGeneral(null);
    setMostrarHistorial(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const seleccionarConversacion = (convId: string) => {
    setConversacionActivaId(convId);
    setErrorGeneral(null);
    setMostrarHistorial(false);
  };

  const enviarTexto = async (textoAEnviar?: string) => {
    const mensajeTexto = (textoAEnviar ?? texto).trim();
    if (!mensajeTexto || pensando) return;

    setErrorGeneral(null);
    setTexto("");
    setPensando(true);

    // Mensaje optimista
    const tempId = `temp_${Date.now()}`;
    const msgOptimista: AsistenteMensaje = {
      id: tempId,
      conversacion_id: conversacionActivaId || "",
      rol: "usuario",
      contenido: mensajeTexto,
      fue_audio: false,
      audio_segundos: null,
      herramientas: null,
      propuesta_id: null,
      modelo: null,
      prompt_version: null,
      tokens_entrada: null,
      tokens_salida: null,
      costo_usd: null,
      error: null,
      created_at: new Date().toISOString(),
    };

    setMensajes((prev) => [...prev, msgOptimista]);
    autoScroll();

    try {
      const respuesta = await enviarMensajeAsistente({
        conversacionId: conversacionActivaId || undefined,
        texto: mensajeTexto,
      });

      if (!conversacionActivaId && respuesta.conversacion_id) {
        setConversacionActivaId(respuesta.conversacion_id);
        cargarConversaciones();
      }

      // Si vino propuesta, indexarla
      if (respuesta.propuesta) {
        setPropuestasPorId((prev) => ({
          ...prev,
          [respuesta.propuesta!.id]: respuesta.propuesta!,
        }));
      }

      setMensajes((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        respuesta.mensaje_usuario,
        respuesta.mensaje_asistente,
      ]);
      autoScroll();
    } catch (err: any) {
      setErrorGeneral(err?.message || "Ocurrió un error al consultar a Chimuelo.");
      // Quitar el optimista si falló
      setMensajes((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setPensando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleAudioGrabado = async (blob: Blob, duracionSegundos: number) => {
    if (pensando) return;

    setErrorGeneral(null);
    setPensando(true);

    try {
      const respuesta = await enviarAudioAsistente({
        blob,
        duracionSegundos,
        conversacionId: conversacionActivaId || undefined,
      });

      if (!conversacionActivaId && respuesta.conversacion_id) {
        setConversacionActivaId(respuesta.conversacion_id);
        cargarConversaciones();
      }

      if (respuesta.propuesta) {
        setPropuestasPorId((prev) => ({
          ...prev,
          [respuesta.propuesta!.id]: respuesta.propuesta!,
        }));
      }

      setMensajes((prev) => [
        ...prev,
        respuesta.mensaje_usuario,
        respuesta.mensaje_asistente,
      ]);
      autoScroll();
    } catch (err: any) {
      setErrorGeneral(
        err?.message || "Ocurrió un error al procesar el mensaje de audio.",
      );
    } finally {
      setPensando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="flex h-full flex-col bg-fondo">
      {/* Encabezado del chat */}
      <header className="flex h-14 items-center justify-between border-b border-borde bg-superficie px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <img
            src="/chimuelo.svg"
            alt={NOMBRE_ASISTENTE}
            className="h-9 w-9 rounded-full border border-borde bg-superficie object-cover shadow-xs"
          />
          <div>
            <h2 className="text-sm font-semibold text-tinta leading-tight flex items-center gap-1.5">
              {NOMBRE_ASISTENTE}
              <span className="h-2 w-2 rounded-full bg-ok" title="En línea" />
            </h2>
            <p className="text-[11px] text-tinta-suave leading-tight">
              Asistente de oficina
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Boton
            type="button"
            variante="fantasma"
            tamano="md"
            onClick={() => setMostrarHistorial((prev) => !prev)}
            className="h-8 px-2.5 text-xs text-tinta-suave hover:text-tinta"
            title="Historial de conversaciones"
          >
            <History className="size-4" />
            <span className="hidden sm:inline">Historial</span>
          </Boton>

          <Boton
            type="button"
            variante="fantasma"
            tamano="md"
            onClick={iniciarNuevaConversacion}
            className="h-8 px-2.5 text-xs text-marca hover:bg-marca-suave"
            title="Nueva conversación"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nueva</span>
          </Boton>

          {onCerrar && (
            <Boton
              type="button"
              variante="fantasma"
              tamano="md"
              onClick={onCerrar}
              className="h-8 w-8 p-0 text-tinta-suave hover:text-peligro"
              title="Cerrar panel"
              aria-label="Cerrar panel"
            >
              <X className="size-4" />
            </Boton>
          )}
        </div>
      </header>

      {/* Historial desplegable / panel */}
      {mostrarHistorial && (
        <div className="border-b border-borde bg-superficie p-3 max-h-60 overflow-y-auto space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between pb-1 border-b border-borde/40 text-xs font-semibold text-tinta-suave">
            <span>Conversaciones anteriores</span>
            <button
              onClick={() => setMostrarHistorial(false)}
              className="text-tinta-suave hover:text-tinta text-xs"
            >
              Cerrar
            </button>
          </div>

          {conversaciones.length === 0 ? (
            <p className="py-2 text-center text-xs text-tinta-suave">
              Todavía no hay conversaciones guardadas.
            </p>
          ) : (
            conversaciones.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => seleccionarConversacion(c.id)}
                className={`w-full text-left rounded px-2.5 py-1.5 text-xs transition-colors flex items-center justify-between gap-2 ${
                  c.id === conversacionActivaId
                    ? "bg-marca-suave text-marca font-medium"
                    : "text-tinta hover:bg-fondo"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <MessageSquare className="size-3.5 shrink-0 opacity-70" />
                  <span className="truncate">
                    {c.titulo || "Nueva conversación"}
                  </span>
                </div>
                <span className="text-[10px] text-tinta-suave shrink-0">
                  {new Date(c.updated_at).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Mensajes del chat */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 text-sm"
      >
        {errorGeneral && (
          <Aviso
            variante="peligro"
            className="flex items-center gap-2 text-xs"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorGeneral}</span>
          </Aviso>
        )}

        {mensajes.length === 0 && !pensando && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 space-y-4">
            <img
              src="/chimuelo.svg"
              alt={NOMBRE_ASISTENTE}
              className="h-20 w-20 rounded-full border-2 border-borde bg-superficie shadow-md"
            />
            <div className="space-y-1">
              <h3 className="font-semibold text-tinta text-base">
                ¡Hola! Soy {NOMBRE_ASISTENTE}
              </h3>
              <p className="text-xs text-tinta-suave max-w-xs">
                Pedime cargar traslados, alquileres o consultar deudas, saldos y
                disponibilidad de choferes.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 justify-center max-w-sm pt-2">
              <button
                type="button"
                onClick={() =>
                  enviarTexto(
                    "Cargame un traslado para mañana, de Burzaco a Avellaneda, para Deza, a las 9",
                  )
                }
                className="text-left text-xs bg-superficie border border-borde rounded-full px-3 py-1.5 text-tinta hover:border-marca/50 hover:bg-marca-suave/30 transition-colors"
              >
                "Cargame un traslado para mañana…"
              </button>
              <button
                type="button"
                onClick={() => enviarTexto("¿Cuánto me debe Deza?")}
                className="text-left text-xs bg-superficie border border-borde rounded-full px-3 py-1.5 text-tinta hover:border-marca/50 hover:bg-marca-suave/30 transition-colors"
              >
                "¿Cuánto me debe Deza?"
              </button>
              <button
                type="button"
                onClick={() => enviarTexto("¿Qué choferes están disponibles hoy?")}
                className="text-left text-xs bg-superficie border border-borde rounded-full px-3 py-1.5 text-tinta hover:border-marca/50 hover:bg-marca-suave/30 transition-colors"
              >
                "¿Quién está libre hoy?"
              </button>
            </div>
          </div>
        )}

        {mensajes.map((m) => {
          const esUsuario = m.rol === "usuario";
          const propuesta = m.propuesta_id
            ? propuestasPorId[m.propuesta_id]
            : null;

          return (
            <div
              key={m.id}
              className={`flex flex-col ${
                esUsuario ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-sm leading-relaxed shadow-2xs ${
                  esUsuario
                    ? "bg-marca text-white rounded-br-xs"
                    : "bg-superficie border border-borde text-tinta rounded-bl-xs"
                }`}
              >
                {/* Indicador de audio si vino grabado */}
                {m.fue_audio && (
                  <div
                    className={`flex items-center gap-1 text-[11px] mb-1 font-medium ${
                      esUsuario ? "text-white/80" : "text-tinta-suave"
                    }`}
                  >
                    <Mic className="size-3 text-marca" />
                    <span>Mensaje de voz transcripto</span>
                  </div>
                )}

                <div className="whitespace-pre-line break-words">
                  {m.contenido}
                </div>
              </div>

              {/* Tarjeta de propuesta asociada si existe */}
              {propuesta && (
                <div className="w-full max-w-[90%] sm:max-w-md">
                  <TarjetaPropuesta
                    propuesta={propuesta}
                    onActualizada={(act) =>
                      setPropuestasPorId((prev) => ({
                        ...prev,
                        [act.id]: act,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Indicador de pensando */}
        {pensando && (
          <div className="flex items-center gap-2 mr-auto text-xs text-tinta-suave bg-superficie border border-borde rounded-2xl rounded-bl-xs px-3.5 py-2.5 shadow-2xs animate-pulse">
            <img
              src="/chimuelo.svg"
              alt=""
              className="h-5 w-5 rounded-full object-cover"
            />
            <span className="font-medium">
              {NOMBRE_ASISTENTE} está pensando…
            </span>
          </div>
        )}
      </div>

      {/* Barra de entrada de texto y micrófono */}
      <footer className="border-t border-borde bg-superficie p-3 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviarTexto();
          }}
          className="flex items-center gap-2"
        >
          {/* Botón de micrófono de 56px */}
          <BotonMicrofono
            onAudioGrabado={handleAudioGrabado}
            deshabilitado={pensando}
          />

          {/* Campo de texto */}
          <input
            ref={inputRef}
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`Hablá con ${NOMBRE_ASISTENTE}…`}
            disabled={pensando}
            className="flex-1 h-12 rounded-full border border-borde bg-fondo px-4 text-sm text-tinta placeholder:text-tinta-suave/70 focus-visible:outline-2 focus-visible:outline-marca disabled:opacity-60 transition-colors"
          />

          {/* Botón de enviar texto */}
          <button
            type="submit"
            disabled={!texto.trim() || pensando}
            className="h-12 w-12 rounded-full bg-marca text-white flex items-center justify-center hover:bg-marca-oscuro active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 focus-visible:outline-2"
            title="Enviar mensaje"
            aria-label="Enviar mensaje"
          >
            <Send className="size-5" />
          </button>
        </form>
      </footer>
    </div>
  );
}
