import { useCallback, useEffect, useState, useRef } from "react";
import { Camera, X, Loader2, Route } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRealtime } from "@/hooks/use-realtime";
import type { Servicio, EstadoServicio } from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { formatearFecha } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { ChipEstado, ChipNocturno, ChipEstadoParada, ChipCargaAsegurada } from "@/components/ui/Chip";
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

function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function formatearDiaSemana(fechaIso: string, hoyIso: string): string {
  const d = new Date(`${fechaIso}T00:00:00`);
  const diaSemana = d.toLocaleDateString("es-AR", { weekday: "long" });
  const diaMes = d.getDate();
  const mes = d.toLocaleDateString("es-AR", { month: "long" });
  const conMayus = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
  if (fechaIso === hoyIso) {
    return `Hoy · ${conMayus} ${diaMes} de ${mes}`;
  }
  return `${conMayus} ${diaMes} de ${mes}`;
}

export function PaginaChoferHoy() {
  const { perfil } = useAuth();
  const [pestaña, setPestaña] = useState<"hoy" | "mi_semana" | "historial">("hoy");
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
    const { data: servs, error: servsError } = await supabase
      .from("servicios")
      .select("*, clientes!servicios_cliente_id_fkey(nombre), paradas!paradas_servicio_id_fkey(*), maquinas!servicios_maquina_id_fkey(codigo_interno, tipo)")
      .in("estado", ["programado", "en_curso", "terminado"])
      .order("fecha_programada")
      .order("hora_programada");

    if (servsError) {
      console.error("Error al cargar servicios del chofer:", servsError.message);
    }
    const servsFormateados = (servs as Servicio[])?.map((s) => ({
      ...s,
      paradas: s.paradas ? [...s.paradas].sort((a, b) => a.orden - b.orden) : [],
    })) ?? [];
    setServicios(servsFormateados);

    // Consulta de últimos 7 días
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const hace7Dias = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const { data: hist, error: histError } = await supabase
      .from("servicios")
      .select("*, clientes!servicios_cliente_id_fkey(nombre), paradas!paradas_servicio_id_fkey(*), maquinas!servicios_maquina_id_fkey(codigo_interno, tipo)")
      .in("estado", ["terminado", "cobrado", "facturado"])
      .gte("fecha_programada", hace7Dias)
      .order("fecha_programada", { ascending: false })
      .order("hora_programada", { ascending: false });

    if (histError) {
      console.error("Error al cargar historial del chofer:", histError.message);
    }
    const histFormateados = (hist as Servicio[])?.map((s) => ({
      ...s,
      paradas: s.paradas ? [...s.paradas].sort((a, b) => a.orden - b.orden) : [],
    })) ?? [];
    setHistorial(histFormateados);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useRealtime(["servicios", "servicio_choferes", "paradas"], cargar);

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

  async function ejecutarTermine(
    servicio: Servicio,
    conFoto: boolean,
    ultimaParada: number | null = null
  ) {
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

      // Si tiene paradas, cerrar con cerrar_recorrido
      if (servicio.paradas && servicio.paradas.length > 0) {
        const { error: rpcError } = await supabase.rpc("cerrar_recorrido", {
          p_servicio_id: servicio.id,
          p_ultima_parada: ultimaParada,
        });
        if (rpcError) throw rpcError;
      } else {
        // Cambiar estado vía RPC cambiar_estado
        const { error: rpcError } = await supabase.rpc("cambiar_estado", {
          p_servicio_id: servicio.id,
          p_nuevo: "terminado",
        });
        if (rpcError) throw rpcError;
      }

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
    (s) => !s.fecha_programada || s.fecha_programada === hoyStr
  );

  // Servicios programados para los próximos 7 días
  const limiteSemanaStr = sumarDias(hoyStr, 7);
  const serviciosSemana = servicios.filter(
    (s) =>
      s.estado === "programado" &&
      s.fecha_programada &&
      s.fecha_programada >= hoyStr &&
      s.fecha_programada <= limiteSemanaStr
  );

  // Agrupar servicios de la semana por fecha
  const serviciosPorDia: Record<string, Servicio[]> = {};
  for (const s of serviciosSemana) {
    const f = s.fecha_programada!;
    if (!serviciosPorDia[f]) {
      serviciosPorDia[f] = [];
    }
    serviciosPorDia[f].push(s);
  }
  const fechasSemanaOrdenadas = Object.keys(serviciosPorDia).sort();

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col pb-12 select-none">
      {/* Selector de pestañas: Hoy | Mi semana | Últimos 7 días */}
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg border border-borde bg-superficie p-1 shadow-sm">
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
          onClick={() => setPestaña("mi_semana")}
          className={`h-11 rounded-md text-sm font-semibold transition-all ${
            pestaña === "mi_semana"
              ? "bg-marca text-white shadow-sm"
              : "text-tinta-suave hover:text-tinta hover:bg-fondo"
          }`}
        >
          Mi semana
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

      {pestaña === "hoy" && (
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
                  onTerminar={(conFoto, ultimaParada) => ejecutarTermine(s, conFoto, ultimaParada)}
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
                onTerminar={(conFoto, ultimaParada) => ejecutarTermine(s, conFoto, ultimaParada)}
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
      )}

      {pestaña === "mi_semana" && (
        <div className="flex flex-col gap-4">
          <div className="mb-1">
            <h1 className="text-xl font-semibold text-tinta">Mi semana</h1>
            <p className="mt-0.5 text-xs text-tinta-suave">
              Servicios programados para los próximos 7 días
            </p>
          </div>

          {fechasSemanaOrdenadas.length === 0 ? (
            <Tarjeta className="p-8 text-center text-sm text-tinta-suave shadow-sm">
              No tenés servicios programados para los próximos 7 días.
            </Tarjeta>
          ) : (
            <div className="flex flex-col gap-6">
              {fechasSemanaOrdenadas.map((fecha) => (
                <div key={fecha} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 border-b border-borde pb-1.5">
                    <span className="text-sm font-semibold text-tinta">
                      {formatearDiaSemana(fecha, hoyStr)}
                    </span>
                    <span className="text-xs text-tinta-suave">
                      · {serviciosPorDia[fecha].length}{" "}
                      {serviciosPorDia[fecha].length === 1
                        ? "servicio"
                        : "servicios"}
                    </span>
                  </div>
                  {serviciosPorDia[fecha].map((s) => (
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
                      onTerminar={(conFoto, ultimaParada) =>
                        ejecutarTermine(s, conFoto, ultimaParada)
                      }
                      onCobrar={() => setServicioCobrando(s)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {pestaña === "historial" && (
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
                    {s.tipo === "traslado" && s.seguro_importe != null && (
                      <ChipCargaAsegurada />
                    )}
                    {s.nocturno && <ChipNocturno />}
                    <ChipEstado estado={s.estado} />
                  </div>
                </div>

                {s.paradas && s.paradas.length > 0 ? (
                  <div className="flex items-center gap-1.5 text-xs text-tinta-suave">
                    <Route className="h-3.5 w-3.5 shrink-0 text-marca" />
                    <span>
                      {s.origen ?? "—"} → {s.paradas.length}{" "}
                      {s.paradas.length === 1 ? "parada" : "paradas"}
                    </span>
                  </div>
                ) : (s.origen || s.destino) ? (
                  <div className="text-xs text-tinta-suave">
                    {s.origen ?? "—"} → {s.destino ?? "—"}
                  </div>
                ) : (s.direccion_trabajo || s.localidad_trabajo) ? (
                  <div className="text-xs text-tinta-suave">
                    {s.direccion_trabajo}{s.localidad_trabajo ? `, ${s.localidad_trabajo}` : ""}
                  </div>
                ) : null}

                {s.trabajo_a_realizar && (
                  <div className="text-xs text-tinta-suave">
                    <span className="font-medium text-tinta">Trabajo:</span> {s.trabajo_a_realizar}
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
  onTerminar: (conFoto: boolean, ultimaParada?: number | null) => void;
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
  const tieneParadas = Boolean(s.paradas && s.paradas.length > 0);
  const [pasoRecorrido, setPasoRecorrido] = useState<"pregunta" | "seleccion" | "foto">("pregunta");
  const [ultimaParadaElegida, setUltimaParadaElegida] = useState<number | null>(null);

  useEffect(() => {
    if (!estaFinalizando) {
      setPasoRecorrido("pregunta");
      setUltimaParadaElegida(null);
    }
  }, [estaFinalizando]);

  return (
    <Tarjeta className="flex flex-col gap-3 p-4 shadow-sm">
      {/* Fila superior: Cliente y Chip */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold leading-tight text-tinta">
            {s.clientes?.nombre ?? "Sin cliente"}
          </div>
          <div className="mt-0.5 text-sm text-tinta-suave">
            {s.hora_programada?.slice(0, 5) ?? ""}{s.hora_programada ? " · " : ""}
            {s.rol_vinculo === "traslado_maquina"
              ? "Traslado de máquina"
              : ETIQUETA_TIPO[s.tipo]}
          </div>
          {s.rol_vinculo === "traslado_maquina" && s.maquinas?.codigo_interno && (
            <div className="text-xs font-semibold text-marca mt-0.5">
              Traslado de la máquina {s.maquinas.codigo_interno}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {s.tipo === "traslado" && s.seguro_importe != null && (
            <ChipCargaAsegurada />
          )}
          {s.nocturno && <ChipNocturno />}
          <ChipEstado estado={s.estado} />
        </div>
      </div>

      {/* Recorrido con paradas o Bloque Desde / Hasta */}
      {tieneParadas ? (
        <div className="flex flex-col gap-2 rounded-lg bg-fondo p-3 text-sm">
          <div>
            <span className="block text-xs font-medium text-tinta-suave">
              Origen
            </span>
            <span className="font-medium text-tinta">{s.origen ?? "—"}</span>
          </div>
          <div className="mt-1 border-t border-borde/60 pt-2 flex flex-col gap-2.5">
            <span className="block text-xs font-medium text-tinta-suave">
              Recorrido ({s.paradas!.length} {s.paradas!.length === 1 ? "parada" : "paradas"})
            </span>
            {s.paradas!.map((p) => (
              <div key={p.id ?? p.orden} className="flex items-start gap-2 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-marca-suave text-[11px] font-bold text-marca">
                  {p.orden}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-tinta">
                    {p.direccion}
                    {p.localidad && (
                      <span className="font-normal text-tinta-suave">, {p.localidad}</span>
                    )}
                  </div>
                  {p.carga && (
                    <div className="mt-0.5 text-tinta-suave">
                      <span className="font-medium text-tinta">Carga:</span> {p.carga}
                      {p.carga_desde === "parada_anterior" && (
                        <span className="italic ml-1 text-marca font-normal">
                          (se carga en parada anterior)
                        </span>
                      )}
                    </div>
                  )}
                  {p.notas && (
                    <div className="mt-0.5 text-tinta-suave italic">{p.notas}</div>
                  )}
                  {p.estado && p.estado !== "pendiente" && (
                    <div className="mt-1">
                      <ChipEstadoParada estado={p.estado} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (s.origen || s.destino) ? (
        <div className="flex flex-col gap-2 rounded-lg bg-fondo p-3 text-sm">
          <div>
            <span className="block text-xs font-medium text-tinta-suave">
              Desde
            </span>
            <span className="font-medium text-tinta">{s.origen ?? "—"}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-tinta-suave">
              {s.rol_vinculo === "traslado_maquina" ? "Dirección" : "Hasta"}
            </span>
            <span className="font-medium text-tinta">{s.destino ?? "—"}</span>
          </div>
        </div>
      ) : (s.direccion_trabajo || s.localidad_trabajo) ? (
        <div className="flex flex-col gap-2 rounded-lg bg-fondo p-3 text-sm">
          <div>
            <span className="block text-xs font-medium text-tinta-suave">
              Dirección
            </span>
            <span className="font-medium text-tinta">
              {s.direccion_trabajo}
              {s.localidad_trabajo ? `, ${s.localidad_trabajo}` : ""}
            </span>
          </div>
        </div>
      ) : null}

      {/* Trabajo a realizar si existe */}
      {s.trabajo_a_realizar && (
        <div className="flex items-center gap-2 rounded-lg bg-marca-suave/40 px-3 py-2">
          <div className="min-w-0">
            <span className="block text-xs text-tinta-suave">Trabajo a realizar</span>
            <p className="text-sm font-medium text-tinta">{s.trabajo_a_realizar}</p>
          </div>
        </div>
      )}

      {/* Carga si existe (solo si no tiene paradas, ya que las paradas detallan la carga) */}
      {!tieneParadas && s.carga && (
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
            {tieneParadas && pasoRecorrido === "pregunta" ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-tinta">
                    ¿Hiciste todo el recorrido?
                  </span>
                  <button
                    type="button"
                    onClick={onCancelarTerminar}
                    className="text-xs text-tinta-suave hover:text-peligro"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-xs text-tinta-suave">
                  El recorrido tiene {s.paradas!.length} {s.paradas!.length === 1 ? "parada" : "paradas"}.
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <Boton
                    type="button"
                    tamano="lg"
                    className="w-full"
                    onClick={() => {
                      setUltimaParadaElegida(null);
                      setPasoRecorrido("foto");
                    }}
                  >
                    Sí, recorrido completo
                  </Boton>
                  <Boton
                    type="button"
                    variante="secundario"
                    tamano="lg"
                    className="w-full"
                    onClick={() => setPasoRecorrido("seleccion")}
                  >
                    No, llegué hasta…
                  </Boton>
                </div>
              </>
            ) : tieneParadas && pasoRecorrido === "seleccion" ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-tinta">
                    ¿Hasta qué parada llegaste?
                  </span>
                  <button
                    type="button"
                    onClick={() => setPasoRecorrido("pregunta")}
                    className="text-xs text-tinta-suave hover:text-tinta"
                  >
                    Volver
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
                  {s.paradas!.map((p) => (
                    <button
                      key={p.id ?? p.orden}
                      type="button"
                      onClick={() => {
                        setUltimaParadaElegida(p.orden);
                        setPasoRecorrido("foto");
                      }}
                      className="flex items-center gap-2 rounded-lg border border-borde bg-superficie p-2.5 text-left text-xs font-medium text-tinta hover:border-marca transition-colors"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-marca-suave text-[11px] font-bold text-marca">
                        {p.orden}
                      </span>
                      <span className="truncate flex-1">
                        {p.direccion} {p.localidad ? `(${p.localidad})` : ""}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setUltimaParadaElegida(0);
                      setPasoRecorrido("foto");
                    }}
                    className="mt-1 flex items-center justify-center rounded-lg border border-peligro/30 bg-peligro-suave p-2.5 text-center text-xs font-semibold text-peligro hover:bg-peligro/20 transition-colors"
                  >
                    No llegué a ninguna
                  </button>
                </div>
              </>
            ) : (
              <>
                {tieneParadas && (
                  <div className="flex items-center justify-between rounded-md bg-superficie px-2.5 py-1.5 border border-borde text-xs">
                    <span className="text-tinta font-medium">
                      {ultimaParadaElegida === null
                        ? `Recorrido completo (${s.paradas!.length} paradas)`
                        : ultimaParadaElegida === 0
                        ? "No llegué a ninguna parada"
                        : `Llegué hasta parada ${ultimaParadaElegida} de ${s.paradas!.length}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPasoRecorrido("pregunta")}
                      className="text-marca text-xs font-medium hover:underline"
                    >
                      Cambiar
                    </button>
                  </div>
                )}
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
                    onClick={() => onTerminar(false, ultimaParadaElegida)}
                  >
                    Terminé sin foto
                  </Boton>
                  <Boton
                    type="button"
                    tamano="lg"
                    className="flex-1"
                    disabled={guardandoTerminado || !fotoRemito}
                    onClick={() => onTerminar(true, ultimaParadaElegida)}
                  >
                    {guardandoTerminado ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <span>Terminé</span>
                    )}
                  </Boton>
                </div>
              </>
            )}
          </div>
        )}

        {s.estado === "terminado" && (
          <div className="flex flex-col gap-2">
            <p className="text-center text-xs text-tinta-suave">
              {s.notas ? s.notas : "Completado"} · Cobro pendiente
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
