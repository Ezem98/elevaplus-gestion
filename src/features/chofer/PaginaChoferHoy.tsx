import { useCallback, useEffect, useState, useRef } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRealtime } from "@/hooks/use-realtime";
import type { Servicio, EstadoServicio } from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { formatearFecha } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { ChipEstado, ChipNocturno } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { PantallaCobraste } from "./PantallaCobraste";
import { PantallaNoPlanificado } from "./PantallaNoPlanificado";

function obtenerFechaLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function obtenerFechaHoyTexto(): string {
  const d = new Date();
  const dia = d.getDate();
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  return `Hoy, ${dia} de ${meses[d.getMonth()]}`;
}

export function PaginaChoferHoy() {
  const { perfil } = useAuth();
  const [pestaña, setPestaña] = useState<"hoy" | "historial">("hoy");
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [historial, setHistorial] = useState<Servicio[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Estados de navegación / subpantallas
  const [servicioCobrando, setServicioCobrando] = useState<Servicio | null>(null);
  const [mostrarNoPlanificado, setMostrarNoPlanificado] = useState(false);

  // Inline de foto de remito al tocar "Terminé"
  const [finalizandoId, setFinalizandoId] = useState<string | null>(null);
  const [fotoRemito, setFotoRemito] = useState<File | null>(null);
  const [fotoRemitoUrl, setFotoRemitoUrl] = useState<string | null>(null);
  const [guardandoTerminado, setGuardandoTerminado] = useState(false);
  const inputRemitoRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    // RLS filtra: el chofer solo ve los servicios asignados a él o creados por él
    const { data: servs } = await supabase
      .from("servicios")
      .select("*, clientes(nombre)")
      .in("estado", ["programado", "en_curso", "terminado"])
      .order("fecha_programada")
      .order("hora_programada");

    setServicios((servs as Servicio[]) ?? []);

    // Consulta de últimos 7 días
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const hace7Dias = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const { data: hist } = await supabase
      .from("servicios")
      .select("*, clientes(nombre)")
      .in("estado", ["terminado", "cobrado", "facturado"])
      .gte("fecha_programada", hace7Dias)
      .order("fecha_programada", { ascending: false })
      .order("hora_programada", { ascending: false });

    setHistorial((hist as Servicio[]) ?? []);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useRealtime(["servicios", "servicio_choferes"], cargar);

  async function cambiarEstado(id: string, nuevo: EstadoServicio) {
    setError(null);
    const { error: errRpc } = await supabase.rpc("cambiar_estado", {
      p_servicio_id: id,
      p_nuevo: nuevo,
    });
    if (errRpc) {
      setError(errRpc.message || "No se pudo actualizar el estado. Probá de nuevo.");
    }
    cargar();
  }

  function seleccionarFotoRemito(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFotoRemito(file);
      const url = URL.createObjectURL(file);
      setFotoRemitoUrl(url);
    }
  }

  function cancelarFotoRemito() {
    setFotoRemito(null);
    if (fotoRemitoUrl) {
      URL.revokeObjectURL(fotoRemitoUrl);
      setFotoRemitoUrl(null);
    }
    if (inputRemitoRef.current) {
      inputRemitoRef.current.value = "";
    }
  }

  async function ejecutarTermine(servicio: Servicio, conFoto: boolean) {
    setError(null);
    setGuardandoTerminado(true);
    const usuarioId = perfil?.id;

    try {
      if (conFoto && fotoRemito && usuarioId) {
        const storagePath = `servicios/${servicio.id}/remito-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("adjuntos")
          .upload(storagePath, fotoRemito, {
            contentType: fotoRemito.type || "image/jpeg",
          });
        if (uploadError) throw uploadError;

        const { error: insertAdjError } = await supabase.from("adjuntos").insert({
          servicio_id: servicio.id,
          tipo: "remito",
          storage_path: storagePath,
          subido_por: usuarioId,
        });
        if (insertAdjError) throw insertAdjError;
      }

      // Cambiar estado vía RPC
      const { error: rpcError } = await supabase.rpc("cambiar_estado", {
        p_servicio_id: servicio.id,
        p_nuevo: "terminado",
      });
      if (rpcError) throw rpcError;

      // Limpiar estados locales de finalización
      setFinalizandoId(null);
      cancelarFotoRemito();
      await cargar();

      // Abrir inmediatamente la pantalla de cobro para este servicio
      setServicioCobrando(servicio);
    } catch (err: any) {
      setError(err?.message ?? "Error al finalizar el servicio.");
    } finally {
      setGuardandoTerminado(false);
    }
  }

  // Si está cobrando un servicio, mostramos PantallaCobraste
  if (servicioCobrando) {
    return (
      <PantallaCobraste
        servicio={servicioCobrando}
        onListo={() => {
          setServicioCobrando(null);
          cargar();
        }}
      />
    );
  }

  // Si abrió el alta de servicio no planificado, mostramos PantallaNoPlanificado
  if (mostrarNoPlanificado) {
    return (
      <PantallaNoPlanificado
        onCancelar={() => setMostrarNoPlanificado(false)}
        onCreado={(nuevo) => {
          setMostrarNoPlanificado(false);
          setServicioCobrando(nuevo);
          cargar();
        }}
      />
    );
  }

  const hoyStr = obtenerFechaLocal();

  // Servicios de otros días sin cerrar (fecha anterior y estado programado o en_curso)
  const sinCerrar = servicios.filter(
    (s) =>
      s.fecha_programada &&
      s.fecha_programada < hoyStr &&
      (s.estado === "programado" || s.estado === "en_curso")
  );

  // Servicios de hoy (o sin fecha fijada)
  const serviciosHoy = servicios.filter(
    (s) => !s.fecha_programada || s.fecha_programada >= hoyStr
  );

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col pb-12 select-none">
      {/* Selector de pestañas: Hoy | Últimos 7 días */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-borde bg-superficie p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setPestaña("hoy")}
          className={`h-11 rounded-md text-sm font-semibold transition-all ${
            pestaña === "hoy"
              ? "bg-marca text-white shadow-sm"
              : "text-tinta-suave hover:text-tinta hover:bg-fondo"
          }`}
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => setPestaña("historial")}
          className={`h-11 rounded-md text-sm font-semibold transition-all ${
            pestaña === "historial"
              ? "bg-marca text-white shadow-sm"
              : "text-tinta-suave hover:text-tinta hover:bg-fondo"
          }`}
        >
          Últimos 7 días
        </button>
      </div>

      {error && (
        <Aviso variante="peligro" className="mb-4">
          {error}
        </Aviso>
      )}

      {pestaña === "hoy" ? (
        <>
          {/* Encabezado del día */}
          <div className="mb-3 flex items-baseline justify-between pt-1">
            <div>
              <h1 className="text-xl font-semibold text-tinta">Mis servicios</h1>
              <p className="mt-0.5 text-xs text-tinta-suave">
                {obtenerFechaHoyTexto()}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-borde bg-superficie px-2.5 py-1 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-ok animate-pulse" />
              <span className="text-xs font-medium text-tinta-suave">En ruta</span>
            </div>
          </div>

          {/* Aviso de servicios de días anteriores sin cerrar */}
          {sinCerrar.length > 0 && (
            <div className="mb-4 flex flex-col gap-3">
              <Aviso variante="alerta">
                Tenés {sinCerrar.length}{" "}
                {sinCerrar.length === 1
                  ? "servicio de otros días sin cerrar"
                  : "servicios de otros días sin cerrar"}
              </Aviso>
              {sinCerrar.map((s) => (
                <TarjetaServicioItem
                  key={s.id}
                  servicio={s}
                  finalizandoId={finalizandoId}
                  fotoRemito={fotoRemito}
                  fotoRemitoUrl={fotoRemitoUrl}
                  guardandoTerminado={guardandoTerminado}
                  inputRemitoRef={inputRemitoRef}
                  onIniciar={() => cambiarEstado(s.id, "en_curso")}
                  onMostrarTerminar={() => {
                    cancelarFotoRemito();
                    setFinalizandoId(s.id);
                  }}
                  onCancelarTerminar={() => {
                    cancelarFotoRemito();
                    setFinalizandoId(null);
                  }}
                  onSeleccionarFoto={seleccionarFotoRemito}
                  onQuitarFoto={cancelarFotoRemito}
                  onTerminar={(conFoto) => ejecutarTermine(s, conFoto)}
                  onCobrar={() => setServicioCobrando(s)}
                />
              ))}
            </div>
          )}

          {/* Lista de servicios de hoy */}
          <div className="flex flex-col gap-3">
            {serviciosHoy.length === 0 && sinCerrar.length === 0 && (
              <Tarjeta className="p-8 text-center text-sm text-tinta-suave shadow-sm">
                No tenés servicios asignados hoy.
              </Tarjeta>
            )}

            {serviciosHoy.map((s) => (
              <TarjetaServicioItem
                key={s.id}
                servicio={s}
                finalizandoId={finalizandoId}
                fotoRemito={fotoRemito}
                fotoRemitoUrl={fotoRemitoUrl}
                guardandoTerminado={guardandoTerminado}
                inputRemitoRef={inputRemitoRef}
                onIniciar={() => cambiarEstado(s.id, "en_curso")}
                onMostrarTerminar={() => {
                  cancelarFotoRemito();
                  setFinalizandoId(s.id);
                }}
                onCancelarTerminar={() => {
                  cancelarFotoRemito();
                  setFinalizandoId(null);
                }}
                onSeleccionarFoto={seleccionarFotoRemito}
                onQuitarFoto={cancelarFotoRemito}
                onTerminar={(conFoto) => ejecutarTermine(s, conFoto)}
                onCobrar={() => setServicioCobrando(s)}
              />
            ))}
          </div>

          {/* Botón secundario al pie: Trabajo no planificado */}
          <div className="mt-6 pt-2">
            <Boton
              type="button"
              variante="secundario"
              tamano="lg"
              className="w-full shadow-sm"
              onClick={() => setMostrarNoPlanificado(true)}
            >
              Hice un trabajo que no está en la lista
            </Boton>
          </div>
        </>
      ) : (
        /* Pestaña Historial: Últimos 7 días */
        <div className="flex flex-col gap-3">
          <div className="mb-1">
            <h2 className="text-base font-semibold text-tinta">
              Historial (últimos 7 días)
            </h2>
            <p className="text-xs text-tinta-suave">
              Servicios registrados y finalizados recientemente.
            </p>
          </div>

          {historial.length === 0 ? (
            <Tarjeta className="p-8 text-center text-sm text-tinta-suave shadow-sm">
              No tenés servicios finalizados en los últimos 7 días.
            </Tarjeta>
          ) : (
            historial.map((s) => (
              <Tarjeta key={s.id} className="flex flex-col gap-2 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-tinta">
                      {s.clientes?.nombre ?? "Sin cliente"}
                    </div>
                    <div className="mt-0.5 text-xs text-tinta-suave">
                      {formatearFecha(s.fecha_programada)}{" "}
                      {s.hora_programada
                        ? `· ${s.hora_programada.slice(0, 5)}`
                        : ""}{" "}
                      · {ETIQUETA_TIPO[s.tipo]}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {s.nocturno && <ChipNocturno />}
                    <ChipEstado estado={s.estado} />
                  </div>
                </div>

                {(s.origen || s.destino) && (
                  <div className="text-xs text-tinta-suave">
                    {s.origen ?? "—"} → {s.destino ?? "—"}
                  </div>
                )}
              </Tarjeta>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Componente para renderizar la tarjeta de cada servicio
interface TarjetaServicioItemProps {
  servicio: Servicio;
  finalizandoId: string | null;
  fotoRemito: File | null;
  fotoRemitoUrl: string | null;
  guardandoTerminado: boolean;
  inputRemitoRef: React.RefObject<HTMLInputElement | null>;
  onIniciar: () => void;
  onMostrarTerminar: () => void;
  onCancelarTerminar: () => void;
  onSeleccionarFoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onQuitarFoto: () => void;
  onTerminar: (conFoto: boolean) => void;
  onCobrar: () => void;
}

function TarjetaServicioItem({
  servicio: s,
  finalizandoId,
  fotoRemito,
  fotoRemitoUrl,
  guardandoTerminado,
  inputRemitoRef,
  onIniciar,
  onMostrarTerminar,
  onCancelarTerminar,
  onSeleccionarFoto,
  onQuitarFoto,
  onTerminar,
  onCobrar,
}: TarjetaServicioItemProps) {
  const estaFinalizando = finalizandoId === s.id;

  return (
    <Tarjeta className="flex flex-col gap-3 p-4 shadow-sm">
      {/* Fila superior: Cliente y Chip */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold leading-tight text-tinta">
            {s.clientes?.nombre ?? "Sin cliente"}
          </div>
          <div className="mt-0.5 text-sm text-tinta-suave">
            {s.hora_programada?.slice(0, 5) ?? ""} · {ETIQUETA_TIPO[s.tipo]}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {s.nocturno && <ChipNocturno />}
          <ChipEstado estado={s.estado} />
        </div>
      </div>

      {/* Bloque Desde / Hasta en dos líneas */}
      {(s.origen || s.destino) && (
        <div className="flex flex-col gap-2 rounded-lg bg-fondo p-3 text-sm">
          <div>
            <span className="block text-xs font-medium text-tinta-suave">
              Desde
            </span>
            <span className="font-medium text-tinta">{s.origen ?? "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-tinta-suave">
              Hasta
            </span>
            <span className="font-medium text-tinta">{s.destino ?? "—"}</span>
          </div>
        </div>
      )}

      {/* Carga si existe */}
      {s.carga && (
        <div className="flex items-center gap-2 rounded-lg bg-marca-suave/40 px-3 py-2">
          <div className="min-w-0">
            <span className="block text-xs text-tinta-suave">Carga</span>
            <p className="truncate text-sm font-medium text-tinta">{s.carga}</p>
          </div>
        </div>
      )}

      {/* Acciones al pie de la tarjeta */}
      <div className="mt-1">
        {s.estado === "programado" && (
          <Boton
            type="button"
            tamano="lg"
            className="w-full shadow-sm"
            onClick={onIniciar}
          >
            Iniciar
          </Boton>
        )}

        {s.estado === "en_curso" && !estaFinalizando && (
          <Boton
            type="button"
            tamano="lg"
            className="w-full shadow-sm"
            onClick={onMostrarTerminar}
          >
            Terminé
          </Boton>
        )}

        {s.estado === "en_curso" && estaFinalizando && (
          <div className="flex flex-col gap-3 rounded-lg border border-borde bg-fondo p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-tinta">
                Sacá una foto del remito (opcional)
              </span>
              <button
                type="button"
                onClick={onCancelarTerminar}
                className="text-xs text-tinta-suave hover:text-peligro"
              >
                Cancelar
              </button>
            </div>

            <input
              ref={inputRemitoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onSeleccionarFoto}
            />

            {!fotoRemito ? (
              <Boton
                type="button"
                variante="secundario"
                className="w-full h-12"
                onClick={() => inputRemitoRef.current?.click()}
              >
                <Camera className="h-5 w-5 text-marca" />
                <span>Sacar foto</span>
              </Boton>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-borde bg-superficie p-2">
                {fotoRemitoUrl && (
                  <img
                    src={fotoRemitoUrl}
                    alt="Miniatura remito"
                    className="h-10 w-10 rounded object-cover border border-borde"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-mono font-medium text-tinta">
                    {fotoRemito.name}
                  </p>
                  <p className="text-[10px] text-ok font-semibold">Listo para subir</p>
                </div>
                <button
                  type="button"
                  onClick={onQuitarFoto}
                  className="p-1 text-tinta-suave hover:text-peligro"
                  aria-label="Quitar foto"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <Boton
                type="button"
                variante="secundario"
                tamano="lg"
                className="flex-1 text-xs"
                disabled={guardandoTerminado}
                onClick={() => onTerminar(false)}
              >
                Terminé sin foto
              </Boton>
              <Boton
                type="button"
                tamano="lg"
                className="flex-1"
                disabled={guardandoTerminado || !fotoRemito}
                onClick={() => onTerminar(true)}
              >
                {guardandoTerminado ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <span>Terminé</span>
                )}
              </Boton>
            </div>
          </div>
        )}

        {s.estado === "terminado" && (
          <div className="flex flex-col gap-2">
            <p className="text-center text-xs text-tinta-suave">
              Completado · Cobro pendiente
            </p>
            <Boton
              type="button"
              variante="secundario"
              tamano="lg"
              className="w-full"
              onClick={onCobrar}
            >
              Registrar cobro
            </Boton>
          </div>
        )}
      </div>
    </Tarjeta>
  );
}
