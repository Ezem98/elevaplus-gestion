import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { MenuAcciones, type AccionMenu } from "@/components/ui/MenuAcciones";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { useRealtime } from "@/hooks/use-realtime";
import { formatearFechaCorta } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type { EventoFlota, Maquina, Tercerizado, Vehiculo } from "@/lib/tipos";
import { ETIQUETA_TIPO_MAQUINA } from "@/lib/tipos";
import { CheckCircle2, ChevronUp, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FormularioEventoFlota } from "./FormularioEventoFlota";
import { FormularioMaquina } from "./FormularioMaquina";
import { FormularioTercerizado } from "./FormularioTercerizado";
import { FormularioVehiculo } from "./FormularioVehiculo";
import { LineaTiempoFlota } from "./LineaTiempoFlota";

type TabFlota = "maquinas" | "vehiculos" | "tercerizados";

interface AlquilerActivoMaquina {
  maquina_id: string;
  cliente_nombre: string;
  fecha_hasta: string | null;
}

export function PaginaFlota() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabActiva = (searchParams.get("tab") as TabFlota) || "maquinas";

  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [tercerizados, setTercerizados] = useState<Tercerizado[]>([]);
  const [alquileresActivos, setAlquileresActivos] = useState<
    Record<string, AlquilerActivoMaquina>
  >({});
  const [eventosMap, setEventosMap] = useState<Record<string, EventoFlota[]>>(
    {},
  );

  const [filtroTexto, setFiltroTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Estados de formularios inline
  const [mostrarFormularioAlta, setMostrarFormularioAlta] = useState(false);
  const [maquinaAEditar, setMaquinaAEditar] = useState<Maquina | null>(null);
  const [vehiculoAEditar, setVehiculoAEditar] = useState<Vehiculo | null>(null);
  const [tercerizadoAEditar, setTercerizadoAEditar] =
    useState<Tercerizado | null>(null);

  // Estados de detalle expandido por unidad (para ver historial o registrar evento)
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [modoExpandido, setModoExpandido] = useState<"historial" | "evento">(
    "historial",
  );

  const cambiarTab = (tab: TabFlota) => {
    setSearchParams({ tab });
    setMostrarFormularioAlta(false);
    setMaquinaAEditar(null);
    setVehiculoAEditar(null);
    setTercerizadoAEditar(null);
    setExpandidoId(null);
  };

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    const [resMaq, resVeh, resTerc, resAlq, resEv] = await Promise.all([
      supabase.from("maquinas").select("*").order("codigo_interno"),
      supabase.from("vehiculos").select("*").order("nombre"),
      supabase.from("tercerizados").select("*").order("nombre"),
      // Servicios en curso para ver máquinas alquiladas y cliente
      supabase
        .from("servicios")
        .select("id, maquina_id, clientes!servicios_cliente_id_fkey(nombre), alquileres!alquileres_servicio_id_fkey(fecha_hasta)")
        .eq("estado", "en_curso")
        .not("maquina_id", "is", null),
      // Últimos eventos de flota
      supabase
        .from("eventos_flota")
        .select("*")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (resMaq.error) console.error("Error al cargar maquinas:", resMaq.error.message);
    if (resVeh.error) console.error("Error al cargar vehiculos:", resVeh.error.message);
    if (resTerc.error) console.error("Error al cargar tercerizados:", resTerc.error.message);
    if (resAlq.error) console.error("Error al cargar alquileres de flota:", resAlq.error.message);
    if (resEv.error) console.error("Error al cargar eventos de flota:", resEv.error.message);

    if (resMaq.data) setMaquinas(resMaq.data as Maquina[]);
    if (resVeh.data) setVehiculos(resVeh.data as Vehiculo[]);
    if (resTerc.data) setTercerizados(resTerc.data as Tercerizado[]);

    // Mapear alquileres activos por maquina_id
    const alqMap: Record<string, AlquilerActivoMaquina> = {};
    if (resAlq.data) {
      for (const s of resAlq.data as any[]) {
        if (s.maquina_id) {
          alqMap[s.maquina_id] = {
            maquina_id: s.maquina_id,
            cliente_nombre: s.clientes?.nombre ?? "Cliente",
            fecha_hasta: s.alquileres?.fecha_hasta ?? null,
          };
        }
      }
    }
    setAlquileresActivos(alqMap);

    // Mapear eventos por vehiculo_id y por maquina_id
    const evMap: Record<string, EventoFlota[]> = {};
    if (resEv.data) {
      for (const ev of resEv.data as EventoFlota[]) {
        const idClave = ev.maquina_id
          ? `m_${ev.maquina_id}`
          : `v_${ev.vehiculo_id}`;
        if (!evMap[idClave]) evMap[idClave] = [];
        evMap[idClave].push(ev);
      }
    }
    setEventosMap(evMap);

    setCargando(false);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useRealtime(
    ["maquinas", "vehiculos", "tercerizados", "eventos_flota", "servicios"],
    cargarDatos,
  );

  // Acciones rápidas de taller y estado
  const mandarATaller = async (
    tipo: "maquina" | "vehiculo",
    id: string,
    nombre: string,
  ) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const tabla = tipo === "maquina" ? "maquinas" : "vehiculos";

    const { error: evErr } = await supabase.from("eventos_flota").insert({
      maquina_id: tipo === "maquina" ? id : null,
      vehiculo_id: tipo === "vehiculo" ? id : null,
      fecha: hoy,
      tipo: "taller",
      descripcion: `Ingreso a taller de ${nombre}`,
    });
    if (evErr) {
      alert("Error al registrar ingreso a taller: " + evErr.message);
      return;
    }

    await supabase.from(tabla).update({ estado: "taller" }).eq("id", id);
    setMensajeExito(`${nombre} enviado a taller.`);
    setTimeout(() => setMensajeExito(null), 3000);
    cargarDatos();
  };

  const volverDelTaller = async (
    tipo: "maquina" | "vehiculo",
    id: string,
    nombre: string,
  ) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const tabla = tipo === "maquina" ? "maquinas" : "vehiculos";
    const colId = tipo === "maquina" ? "maquina_id" : "vehiculo_id";

    // Cerrar el último evento abierto de taller si existe
    const { data: ultEvento } = await supabase
      .from("eventos_flota")
      .select("id")
      .eq(colId, id)
      .eq("tipo", "taller")
      .is("fecha_fin", null)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultEvento) {
      await supabase
        .from("eventos_flota")
        .update({ fecha_fin: hoy })
        .eq("id", ultEvento.id);
    }

    await supabase.from(tabla).update({ estado: "disponible" }).eq("id", id);
    setMensajeExito(`${nombre} volvió del taller y está disponible.`);
    setTimeout(() => setMensajeExito(null), 3000);
    cargarDatos();
  };

  const darDeBaja = async (
    tipo: "maquina" | "vehiculo",
    id: string,
    nombre: string,
  ) => {
    if (!confirm(`¿Confirmás que querés dar de baja a ${nombre}?`)) return;
    const tabla = tipo === "maquina" ? "maquinas" : "vehiculos";
    await supabase
      .from(tabla)
      .update({ estado: "baja", activo: false })
      .eq("id", id);
    setMensajeExito(`${nombre} dado de baja.`);
    setTimeout(() => setMensajeExito(null), 3000);
    cargarDatos();
  };

  // Contadores y métricas globales de flota
  const metricas = useMemo(() => {
    const totalMaqDisp = maquinas.filter(
      (m) => m.estado === "disponible",
    ).length;
    const totalMaqAlq = maquinas.filter((m) => m.estado === "alquilada").length;
    const totalMaqTaller = maquinas.filter((m) => m.estado === "taller").length;

    const totalVehDisp = vehiculos.filter(
      (v) => v.estado === "disponible" || v.estado === "en_servicio",
    ).length;
    const totalVehTaller = vehiculos.filter(
      (v) => v.estado === "taller",
    ).length;

    return {
      disponibles: totalMaqDisp + totalVehDisp,
      enCliente: totalMaqAlq,
      enTaller: totalMaqTaller + totalVehTaller,
    };
  }, [maquinas, vehiculos]);

  // Filtro de búsqueda
  const maquinasFiltradas = useMemo(() => {
    if (!filtroTexto.trim()) return maquinas;
    const q = filtroTexto.toLowerCase();
    return maquinas.filter(
      (m) =>
        m.codigo_interno?.toLowerCase().includes(q) ||
        m.marca?.toLowerCase().includes(q) ||
        m.modelo?.toLowerCase().includes(q) ||
        m.tipo.toLowerCase().includes(q),
    );
  }, [maquinas, filtroTexto]);

  const vehiculosFiltrados = useMemo(() => {
    if (!filtroTexto.trim()) return vehiculos;
    const q = filtroTexto.toLowerCase();
    return vehiculos.filter(
      (v) =>
        v.nombre.toLowerCase().includes(q) ||
        v.patente?.toLowerCase().includes(q) ||
        v.marca?.toLowerCase().includes(q) ||
        v.modelo?.toLowerCase().includes(q),
    );
  }, [vehiculos, filtroTexto]);

  const tercerizadosFiltrados = useMemo(() => {
    if (!filtroTexto.trim()) return tercerizados;
    const q = filtroTexto.toLowerCase();
    return tercerizados.filter(
      (t) =>
        t.nombre.toLowerCase().includes(q) ||
        t.tipo?.toLowerCase().includes(q) ||
        t.cuit?.includes(q),
    );
  }, [tercerizados, filtroTexto]);

  // VTV vence pronto? (dentro de 30 días o vencida)
  const esVtvPronta = (fechaVtv?: string | null): boolean => {
    if (!fechaVtv) return false;
    const diffMs = new Date(fechaVtv).getTime() - new Date().getTime();
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDias <= 30;
  };

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Flota"
        subtitulo="Control de disponibilidad técnica, asignación de alquileres y unidades de transporte."
        acciones={
          <div className="flex items-center gap-2 px-3 py-1.5 bg-superficie rounded-md border border-borde text-xs text-tinta-suave">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span>{metricas.disponibles} disponibles</span>
            </span>
            <span className="text-borde">|</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-marca" />
              <span>{metricas.enCliente} en cliente</span>
            </span>
            <span className="text-borde">|</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-alerta" />
              <span>{metricas.enTaller} en taller</span>
            </span>
          </div>
        }
      />

      {mensajeExito && (
        <Aviso variante="exito" className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
          <span>{mensajeExito}</span>
        </Aviso>
      )}

      {/* Navegación de pestañas y botón de alta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-borde pb-2">
        <div className="flex items-center gap-6 -mb-[9px]">
          <button
            type="button"
            onClick={() => cambiarTab("maquinas")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              tabActiva === "maquinas"
                ? "border-marca text-marca"
                : "border-transparent text-tinta-suave hover:text-tinta"
            }`}
          >
            <span>Máquinas</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                tabActiva === "maquinas"
                  ? "bg-marca-suave text-marca"
                  : "bg-fondo text-tinta-suave border border-borde"
              }`}
            >
              {maquinas.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => cambiarTab("vehiculos")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              tabActiva === "vehiculos"
                ? "border-marca text-marca"
                : "border-transparent text-tinta-suave hover:text-tinta"
            }`}
          >
            <span>Vehículos</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                tabActiva === "vehiculos"
                  ? "bg-marca-suave text-marca"
                  : "bg-fondo text-tinta-suave border border-borde"
              }`}
            >
              {vehiculos.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => cambiarTab("tercerizados")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              tabActiva === "tercerizados"
                ? "border-marca text-marca"
                : "border-transparent text-tinta-suave hover:text-tinta"
            }`}
          >
            <span>Tercerizados</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                tabActiva === "tercerizados"
                  ? "bg-marca-suave text-marca"
                  : "bg-fondo text-tinta-suave border border-borde"
              }`}
            >
              {tercerizados.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Filtrar por código o nombre..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className="h-9 w-60 pl-8 pr-3 bg-superficie border border-borde rounded-md text-xs text-tinta placeholder:text-tinta-tenue focus:outline-none focus:border-marca"
            />
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-tinta-tenue pointer-events-none" />
          </div>

          <Boton
            type="button"
            className="h-8 px-3 text-xs"
            onClick={() => {
              setMostrarFormularioAlta((prev) => !prev);
              setMaquinaAEditar(null);
              setVehiculoAEditar(null);
              setTercerizadoAEditar(null);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            <span>
              {tabActiva === "maquinas"
                ? "Agregar máquina"
                : tabActiva === "vehiculos"
                  ? "Agregar vehículo"
                  : "Agregar tercerizado"}
            </span>
          </Boton>
        </div>
      </div>

      {/* Formularios inline de Alta y Edición */}
      {tabActiva === "maquinas" &&
        (mostrarFormularioAlta || maquinaAEditar) && (
          <FormularioMaquina
            maquinaAEditar={maquinaAEditar}
            onGuardado={() => {
              setMostrarFormularioAlta(false);
              setMaquinaAEditar(null);
              cargarDatos();
            }}
            onCancelar={() => {
              setMostrarFormularioAlta(false);
              setMaquinaAEditar(null);
            }}
          />
        )}

      {tabActiva === "vehiculos" &&
        (mostrarFormularioAlta || vehiculoAEditar) && (
          <FormularioVehiculo
            vehiculoAEditar={vehiculoAEditar}
            onGuardado={() => {
              setMostrarFormularioAlta(false);
              setVehiculoAEditar(null);
              cargarDatos();
            }}
            onCancelar={() => {
              setMostrarFormularioAlta(false);
              setVehiculoAEditar(null);
            }}
          />
        )}

      {tabActiva === "tercerizados" &&
        (mostrarFormularioAlta || tercerizadoAEditar) && (
          <FormularioTercerizado
            tercerizadoAEditar={tercerizadoAEditar}
            onGuardado={() => {
              setMostrarFormularioAlta(false);
              setTercerizadoAEditar(null);
              cargarDatos();
            }}
            onCancelar={() => {
              setMostrarFormularioAlta(false);
              setTercerizadoAEditar(null);
            }}
          />
        )}

      {cargando && maquinas.length === 0 && vehiculos.length === 0 && (
        <div className="py-12 text-center text-sm text-tinta-suave">
          Cargando unidades y estado operativo de la flota...
        </div>
      )}

      {/* TAB 1: MÁQUINAS */}
      {!cargando && tabActiva === "maquinas" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {maquinasFiltradas.map((m) => {
            const alq = alquileresActivos[m.id];
            const eventosUnidad = eventosMap[`m_${m.id}`] ?? [];
            const estaExpandido = expandidoId === m.id;

            // Clases ChipEstado
            const estadoClases =
              m.estado === "disponible"
                ? "bg-ok-suave text-ok border-ok/20"
                : m.estado === "alquilada"
                  ? "bg-marca-suave text-marca border-marca/20"
                  : m.estado === "taller"
                    ? "bg-alerta-suave text-alerta border-alerta/20"
                    : "bg-fondo text-tinta-tenue border-borde";

            const estadoTexto =
              m.estado === "disponible"
                ? "Disponible"
                : m.estado === "alquilada"
                  ? "Alquilada"
                  : m.estado === "taller"
                    ? "En taller"
                    : "De baja";

            // Acciones del menú
            const accionesMenu: AccionMenu[] = [
              {
                texto: "Ver historial técnico",
                onClick: () => {
                  if (estaExpandido && modoExpandido === "historial") {
                    setExpandidoId(null);
                  } else {
                    setExpandidoId(m.id);
                    setModoExpandido("historial");
                  }
                },
              },
              {
                texto: "Registrar evento / service",
                onClick: () => {
                  setExpandidoId(m.id);
                  setModoExpandido("evento");
                },
              },
              {
                texto: "Editar datos de máquina",
                onClick: () => {
                  setMaquinaAEditar(m);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                },
              },
              ...(m.estado !== "taller"
                ? [
                    {
                      texto: "Mandar a taller",
                      onClick: () =>
                        mandarATaller(
                          "maquina",
                          m.id,
                          m.codigo_interno ?? "Máquina",
                        ),
                    },
                  ]
                : [
                    {
                      texto: "Volvió del taller",
                      onClick: () =>
                        volverDelTaller(
                          "maquina",
                          m.id,
                          m.codigo_interno ?? "Máquina",
                        ),
                    },
                  ]),
              ...(m.estado !== "baja"
                ? [
                    {
                      texto: "Dar de baja",
                      peligro: true,
                      onClick: () =>
                        darDeBaja(
                          "maquina",
                          m.id,
                          m.codigo_interno ?? "Máquina",
                        ),
                    },
                  ]
                : []),
            ];

            return (
              <div
                key={m.id}
                className="bg-superficie border border-borde rounded-[10px] p-5 flex flex-col justify-between gap-4 hover:border-marca/60 transition-colors shadow-xs"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold tracking-tight text-tinta">
                      {m.codigo_interno ?? "S/C"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estadoClases}`}
                      >
                        {estadoTexto}
                      </span>
                      <MenuAcciones acciones={accionesMenu} />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-tinta">
                      {ETIQUETA_TIPO_MAQUINA[m.tipo]}{" "}
                      {m.marca ? `· ${m.marca}` : ""}{" "}
                      {m.modelo ? `(${m.modelo})` : ""}
                    </span>
                    <span className="text-xs text-tinta-suave">
                      {m.capacidad ? `Capacidad ${m.capacidad}` : ""}
                      {m.combustible ? ` / ${m.combustible}` : ""}
                    </span>
                  </div>

                  {/* Línea gris derivada según requerimiento */}
                  <div className="p-2.5 rounded-md bg-fondo border border-borde/70 flex items-center gap-2 text-xs">
                    {m.estado === "alquilada" ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-marca shrink-0" />
                        <span className="font-medium text-tinta">
                          Alquilada a {alq?.cliente_nombre ?? "Cliente"}
                          {alq?.fecha_hasta
                            ? ` hasta ${formatearFechaCorta(alq.fecha_hasta)}`
                            : ""}
                        </span>
                      </>
                    ) : m.estado === "taller" ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-alerta shrink-0" />
                        <span className="font-medium text-alerta">
                          En taller mecánico para revisión
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-ok shrink-0" />
                        <span className="text-tinta-suave">
                          {m.ultimo_service
                            ? `Último service ${formatearFechaCorta(m.ultimo_service)}`
                            : "Sin service previo registrado"}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Pie con horómetro y próximo service */}
                <div className="pt-3 border-t border-borde flex items-center justify-between text-xs text-tinta-suave">
                  <span>
                    Horómetro:{" "}
                    <strong className="text-tinta font-semibold">
                      {m.horas_actual != null
                        ? `${m.horas_actual.toLocaleString("es-AR")} h`
                        : "—"}
                    </strong>
                  </span>
                  <span>
                    Próx. service:{" "}
                    <strong className="text-tinta font-semibold">
                      {m.proximo_service
                        ? formatearFechaCorta(m.proximo_service)
                        : "—"}
                    </strong>
                  </span>
                </div>

                {/* Detalle expandible con línea de tiempo o formulario de evento */}
                {estaExpandido && (
                  <div className="mt-3 pt-3 border-t border-borde space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModoExpandido("historial")}
                          className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
                            modoExpandido === "historial"
                              ? "border-marca text-marca"
                              : "border-transparent text-tinta-suave hover:text-tinta"
                          }`}
                        >
                          Historial ({eventosUnidad.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setModoExpandido("evento")}
                          className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
                            modoExpandido === "evento"
                              ? "border-marca text-marca"
                              : "border-transparent text-tinta-suave hover:text-tinta"
                          }`}
                        >
                          + Registrar evento
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandidoId(null)}
                        className="text-tinta-suave hover:text-tinta"
                        title="Ocultar detalle"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                    </div>

                    {modoExpandido === "historial" ? (
                      <LineaTiempoFlota eventos={eventosUnidad} />
                    ) : (
                      <FormularioEventoFlota
                        maquinaId={m.id}
                        unidadNombre={m.codigo_interno ?? "Máquina"}
                        esMaquina={true}
                        kmOHorasActual={m.horas_actual}
                        onGuardado={() => {
                          cargarDatos();
                          setModoExpandido("historial");
                        }}
                        onCancelar={() => setModoExpandido("historial")}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {maquinasFiltradas.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-tinta-suave bg-superficie rounded-lg border border-borde">
              No hay máquinas registradas o ninguna coincide con la búsqueda.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VEHÍCULOS */}
      {!cargando && tabActiva === "vehiculos" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehiculosFiltrados.map((v) => {
            const eventosUnidad = eventosMap[`v_${v.id}`] ?? [];
            const estaExpandido = expandidoId === v.id;
            const vtvPronta = esVtvPronta(v.vtv_vence);

            const estadoClases =
              v.estado === "disponible" || v.estado === "en_servicio"
                ? "bg-ok-suave text-ok border-ok/20"
                : v.estado === "taller"
                  ? "bg-alerta-suave text-alerta border-alerta/20"
                  : "bg-fondo text-tinta-tenue border-borde";

            const estadoTexto =
              v.estado === "disponible" || v.estado === "en_servicio"
                ? "Operativo"
                : v.estado === "taller"
                  ? "En taller"
                  : "De baja";

            const accionesMenu: AccionMenu[] = [
              {
                texto: "Ver historial técnico",
                onClick: () => {
                  if (estaExpandido && modoExpandido === "historial") {
                    setExpandidoId(null);
                  } else {
                    setExpandidoId(v.id);
                    setModoExpandido("historial");
                  }
                },
              },
              {
                texto: "Registrar evento / service",
                onClick: () => {
                  setExpandidoId(v.id);
                  setModoExpandido("evento");
                },
              },
              {
                texto: "Editar datos de vehículo",
                onClick: () => {
                  setVehiculoAEditar(v);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                },
              },
              ...(v.estado !== "taller"
                ? [
                    {
                      texto: "Mandar a taller",
                      onClick: () => mandarATaller("vehiculo", v.id, v.nombre),
                    },
                  ]
                : [
                    {
                      texto: "Volvió del taller",
                      onClick: () =>
                        volverDelTaller("vehiculo", v.id, v.nombre),
                    },
                  ]),
              ...(v.estado !== "baja"
                ? [
                    {
                      texto: "Dar de baja",
                      peligro: true,
                      onClick: () => darDeBaja("vehiculo", v.id, v.nombre),
                    },
                  ]
                : []),
            ];

            return (
              <div
                key={v.id}
                className="bg-superficie border border-borde rounded-[10px] p-5 flex flex-col justify-between gap-4 hover:border-marca/60 transition-colors shadow-xs"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold tracking-tight text-tinta">
                      {v.nombre}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estadoClases}`}
                      >
                        {estadoTexto}
                      </span>
                      <MenuAcciones acciones={accionesMenu} />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-tinta">
                      {v.patente ?? "Sin patente"}{" "}
                      {v.marca ? `· ${v.marca}` : ""}{" "}
                      {v.modelo ? `(${v.modelo})` : ""}
                    </span>
                    <span className="text-xs text-tinta-suave">
                      {v.tipo === "camion"
                        ? "Camión de transporte"
                        : v.tipo === "camioneta"
                          ? "Camioneta auxilio"
                          : "Trailer homologado"}
                      {v.anio ? ` · Año ${v.anio}` : ""}
                    </span>
                  </div>

                  {/* Línea derivada con VTV y seguro */}
                  <div className="p-2.5 rounded-md bg-fondo border border-borde/70 flex flex-col gap-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-tinta-suave">VTV:</span>
                      <span
                        className={
                          vtvPronta
                            ? "text-alerta font-bold"
                            : "text-tinta font-medium"
                        }
                      >
                        {v.vtv_vence
                          ? `Vence ${formatearFechaCorta(v.vtv_vence)}`
                          : "Sin fecha registrada"}
                      </span>
                    </div>

                    {v.seguro_compania && (
                      <div className="flex items-center justify-between text-tinta-suave text-[11px]">
                        <span>Seguro ({v.seguro_compania}):</span>
                        <span>
                          {v.seguro_vence
                            ? `Vto. ${formatearFechaCorta(v.seguro_vence)}`
                            : "Al día"}
                        </span>
                      </div>
                    )}

                    {v.notas_flota && (
                      <p className="text-[11px] text-tinta-suave italic pt-1 border-t border-borde/40 truncate">
                        {v.notas_flota}
                      </p>
                    )}
                  </div>
                </div>

                {/* Pie con kilometraje */}
                <div className="pt-3 border-t border-borde flex items-center justify-between text-xs text-tinta-suave">
                  <span>
                    Kilometraje:{" "}
                    <strong className="text-tinta font-semibold">
                      {v.km_actual != null
                        ? `${v.km_actual.toLocaleString("es-AR")} km`
                        : "—"}
                    </strong>
                  </span>
                  <span className="text-ok font-medium">Habilitado</span>
                </div>

                {/* Detalle expandible */}
                {estaExpandido && (
                  <div className="mt-3 pt-3 border-t border-borde space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModoExpandido("historial")}
                          className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
                            modoExpandido === "historial"
                              ? "border-marca text-marca"
                              : "border-transparent text-tinta-suave hover:text-tinta"
                          }`}
                        >
                          Historial ({eventosUnidad.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setModoExpandido("evento")}
                          className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
                            modoExpandido === "evento"
                              ? "border-marca text-marca"
                              : "border-transparent text-tinta-suave hover:text-tinta"
                          }`}
                        >
                          + Registrar evento
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandidoId(null)}
                        className="text-tinta-suave hover:text-tinta"
                        title="Ocultar detalle"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                    </div>

                    {modoExpandido === "historial" ? (
                      <LineaTiempoFlota eventos={eventosUnidad} />
                    ) : (
                      <FormularioEventoFlota
                        vehiculoId={v.id}
                        unidadNombre={v.nombre}
                        esMaquina={false}
                        kmOHorasActual={v.km_actual}
                        onGuardado={() => {
                          cargarDatos();
                          setModoExpandido("historial");
                        }}
                        onCancelar={() => setModoExpandido("historial")}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {vehiculosFiltrados.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-tinta-suave bg-superficie rounded-lg border border-borde">
              No hay vehículos registrados o ninguno coincide con la búsqueda.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TERCERIZADOS */}
      {!cargando && tabActiva === "tercerizados" && (
        <Tarjeta className="overflow-hidden">
          <div className="p-4 border-b border-borde flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-tinta">
                Proveedores tercerizados
              </h3>
              <p className="text-xs text-tinta-suave">
                Carretones, camiones plancha y grúas contratadas para traslados
                y auxilios.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-fondo border-b border-borde text-xs font-semibold text-tinta-suave">
                  <th className="py-3 px-4">Nombre / Empresa</th>
                  <th className="py-3 px-4">Tipo de equipo</th>
                  <th className="py-3 px-4">Teléfono</th>
                  <th className="py-3 px-4">CUIT</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde text-tinta">
                {tercerizadosFiltrados.map((t) => (
                  <tr key={t.id} className="hover:bg-fondo transition-colors">
                    <td className="py-3 px-4 font-semibold text-tinta">
                      <div>{t.nombre}</div>
                      {t.notas && (
                        <div className="text-xs font-normal text-tinta-suave truncate max-w-xs">
                          {t.notas}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-tinta-suave">
                      {t.tipo ?? "—"}
                    </td>
                    <td className="py-3 px-4 tabular-nums text-tinta-suave">
                      {t.telefono ?? "—"}
                    </td>
                    <td className="py-3 px-4 tabular-nums text-tinta-suave">
                      {t.cuit ?? "—"}
                    </td>
                    <td className="py-3 px-4">
                      {t.activo ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-ok-suave text-ok border border-ok/20">
                          Activo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-fondo text-tinta-suave border border-borde">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Boton
                        type="button"
                        variante="secundario"
                        className="h-8 px-3 text-xs"
                        onClick={() => {
                          setTercerizadoAEditar(t);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Editar
                      </Boton>
                    </td>
                  </tr>
                ))}
                {tercerizadosFiltrados.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-tinta-suave text-xs"
                    >
                      No hay proveedores tercerizados cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
