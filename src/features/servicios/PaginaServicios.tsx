import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import {
  ChipEstado,
  ChipEstadoParada,
  ChipEstadoPresupuesto,
  ChipNocturno,
} from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import {
  ConMenuContextual,
  MenuAcciones,
  type AccionMenu,
} from "@/components/ui/MenuAcciones";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { useRealtime } from "@/hooks/use-realtime";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import {
  calcularEstadoPresupuesto,
  calcularFechaVencimiento,
  calcularTotalesAgrupadosPorMoneda,
} from "@/lib/presupuesto";
import { supabase } from "@/lib/supabase";
import type {
  EstadoPresupuesto,
  EstadoServicio,
  Presupuesto,
  Servicio,
} from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { Route } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

type ClaveFiltro =
  | "todos"
  | "presupuestos"
  | "en_curso"
  | "incompletos"
  | "alquileres_activos"
  | "cobrados"
  | "cancelados";

interface PestanaFiltro {
  id: ClaveFiltro;
  etiqueta: string;
  estados: EstadoServicio[];
}

const PESTANAS: PestanaFiltro[] = [
  { id: "todos", etiqueta: "Todos", estados: [] },
  {
    id: "presupuestos",
    etiqueta: "Presupuestos",
    estados: [],
  },
  {
    id: "en_curso",
    etiqueta: "En curso",
    estados: ["aceptado", "programado", "en_curso", "terminado"],
  },
  {
    id: "incompletos",
    etiqueta: "Recorridos incompletos",
    estados: [],
  },
  {
    id: "alquileres_activos",
    etiqueta: "Alquileres activos",
    estados: ["en_curso"],
  },
  { id: "cobrados", etiqueta: "Cobrados", estados: ["cobrado", "facturado"] },
  { id: "cancelados", etiqueta: "Cancelados", estados: ["cancelado"] },
];

const SUB_FILTROS_PRESUPUESTO: Array<{
  id: "todos" | EstadoPresupuesto;
  etiqueta: string;
}> = [
  { id: "todos", etiqueta: "Todos" },
  { id: "borrador", etiqueta: "Borrador" },
  { id: "enviado", etiqueta: "Enviado" },
  { id: "aceptado", etiqueta: "Aceptado" },
  { id: "rechazado", etiqueta: "Rechazado" },
  { id: "vencido", etiqueta: "Vencido" },
];

function normalizarFiltro(param: string | null): ClaveFiltro {
  if (!param) return "en_curso";
  const p = param.toLowerCase().replace("-", "_");
  if (
    p === "todos" ||
    p === "presupuestos" ||
    p === "en_curso" ||
    p === "incompletos" ||
    p === "alquileres_activos" ||
    p === "cobrados" ||
    p === "cancelados"
  ) {
    return p;
  }
  return "en_curso";
}

export function PaginaServicios() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filtroActivo = normalizarFiltro(searchParams.get("filtro"));

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [subFiltroPresupuesto, setSubFiltroPresupuesto] = useState<
    "todos" | EstadoPresupuesto
  >("todos");

  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});

  const toggleExpandido = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [conteos, setConteos] = useState<Record<ClaveFiltro, number>>({
    todos: 0,
    presupuestos: 0,
    en_curso: 0,
    incompletos: 0,
    alquileres_activos: 0,
    cobrados: 0,
    cancelados: 0,
  });

  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cambiarFiltro = (nuevo: ClaveFiltro) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("filtro", nuevo);
      return next;
    });
  };

  const cargarConteos = useCallback(async () => {
    const [
      { data: servData, error: servError },
      { count: presCount, error: presError },
      { data: incompletosData, error: incError },
    ] = await Promise.all([
      supabase.from("servicios").select("tipo, estado"),
      supabase.from("presupuestos").select("id", { count: "exact", head: true }),
      supabase
        .from("servicios")
        .select("id, paradas!paradas_servicio_id_fkey!inner(id, estado)")
        .eq("paradas.estado", "no_realizada"),
    ]);

    if (servError) {
      console.error("Error al cargar conteos de servicios:", servError.message);
      setErrorCarga("No se pudieron cargar los servicios");
      return;
    }
    if (presError) {
      console.error("Error al contar presupuestos:", presError.message);
    }
    if (incError) {
      console.error(
        "Error al contar recorridos incompletos:",
        incError.message,
      );
    }
    if (!servData) return;

    const idsIncompletos = new Set(
      (incompletosData || []).map((s: any) => s.id),
    );

    const nuevos: Record<ClaveFiltro, number> = {
      todos: servData.length,
      presupuestos: presCount ?? 0,
      en_curso: 0,
      incompletos: idsIncompletos.size,
      alquileres_activos: 0,
      cobrados: 0,
      cancelados: 0,
    };

    for (const item of servData) {
      const e = item.estado as EstadoServicio;
      if (item.tipo === "alquiler_periodo" && e === "en_curso") {
        nuevos.alquileres_activos++;
      }
      if (
        e === "aceptado" ||
        e === "programado" ||
        e === "en_curso" ||
        e === "terminado"
      ) {
        nuevos.en_curso++;
      } else if (e === "cobrado" || e === "facturado") {
        nuevos.cobrados++;
      } else if (e === "cancelado") {
        nuevos.cancelados++;
      }
    }
    setConteos(nuevos);
  }, []);

  const cargarDatos = useCallback(async () => {
    setErrorCarga(null);

    if (filtroActivo === "presupuestos") {
      const { data, error } = await supabase
        .from("presupuestos")
        .select(
          "*, clientes!presupuestos_cliente_id_fkey(id, nombre), servicios!servicios_presupuesto_id_fkey(id, tipo, descripcion, monto, moneda, monto_moneda, aplica_iva, estado)",
        )
        .order("fecha", { ascending: false });

      if (error) {
        console.error("Error al cargar presupuestos:", error.message);
        setErrorCarga("No se pudieron cargar los presupuestos");
        return;
      }
      setPresupuestos((data as Presupuesto[]) || []);
    } else {
      let q = supabase
        .from("servicios")
        .select(
          "*, clientes!servicios_cliente_id_fkey(nombre), alquileres!alquileres_servicio_id_fkey(fecha_desde, fecha_hasta), paradas!paradas_servicio_id_fkey(*)",
        )
        .order("fecha_programada", { ascending: false, nullsFirst: false })
        .limit(100);

      if (filtroActivo === "alquileres_activos") {
        q = q.eq("tipo", "alquiler_periodo").eq("estado", "en_curso");
      } else if (filtroActivo === "incompletos") {
        const { data: incData, error: incError } = await supabase
          .from("servicios")
          .select("id, paradas!paradas_servicio_id_fkey!inner(id, estado)")
          .eq("paradas.estado", "no_realizada");

        if (incError) {
          console.error(
            "Error al filtrar recorridos incompletos:",
            incError.message,
          );
          setErrorCarga("No se pudieron cargar los recorridos incompletos");
          return;
        }

        const ids = Array.from(new Set((incData || []).map((s: any) => s.id)));
        if (ids.length === 0) {
          setServicios([]);
          return;
        }
        q = q.in("id", ids);
      } else {
        const pestana = PESTANAS.find((p) => p.id === filtroActivo);
        if (pestana && pestana.estados.length > 0) {
          q = q.in("estado", pestana.estados);
        }
      }

      const { data, error } = await q;
      if (error) {
        console.error("Error al cargar lista de servicios:", error.message);
        setErrorCarga("No se pudieron cargar los servicios");
        return;
      }
      const serviciosOrdenados = ((data as unknown as Servicio[]) || []).map(
        (s) => ({
          ...s,
          paradas: Array.isArray(s.paradas)
            ? [...s.paradas].sort((a, b) => a.orden - b.orden)
            : s.paradas,
        }),
      );
      setServicios(serviciosOrdenados);
    }
  }, [filtroActivo]);

  const cargar = useCallback(async () => {
    await Promise.all([cargarConteos(), cargarDatos()]);
  }, [cargarConteos, cargarDatos]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useRealtime(["servicios", "presupuestos", "paradas"], cargar);

  const handleCancelar = async (s: Servicio) => {
    const confirmado = window.confirm(
      `¿Seguro que querés cancelar el servicio #${s.numero}?`,
    );
    if (!confirmado) return;

    const { error } = await supabase.rpc("cambiar_estado", {
      p_servicio_id: s.id,
      p_nuevo: "cancelado",
      p_nota: "Cancelado desde la lista",
    });

    if (error) {
      console.error("Error al cancelar servicio:", error.message);
      alert(`No se pudo cancelar el servicio: ${error.message}`);
      return;
    }

    await Promise.all([cargarDatos(), cargarConteos()]);
  };

  const presupuestosFiltrados =
    subFiltroPresupuesto === "todos"
      ? presupuestos
      : presupuestos.filter(
          (p) => calcularEstadoPresupuesto(p) === subFiltroPresupuesto,
        );

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Servicios"
        acciones={
          filtroActivo === "presupuestos" ? (
            <Link to="/presupuestos/nuevo">
              <Boton>Nuevo presupuesto</Boton>
            </Link>
          ) : (
            <Link to="/servicios/nuevo">
              <Boton>Nuevo servicio</Boton>
            </Link>
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        {PESTANAS.map((p) => {
          const activa = filtroActivo === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => cambiarFiltro(p.id)}
              aria-pressed={activa}
              className={`h-10 px-4 rounded-md border text-sm font-medium transition-colors ${
                activa
                  ? "border-marca bg-marca-suave text-marca"
                  : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
              }`}
            >
              {p.etiqueta}{" "}
              <span className="text-tinta-suave">({conteos[p.id]})</span>
            </button>
          );
        })}
      </div>

      {filtroActivo === "presupuestos" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {SUB_FILTROS_PRESUPUESTO.map((sf) => {
            const activo = subFiltroPresupuesto === sf.id;
            return (
              <button
                key={sf.id}
                type="button"
                onClick={() => setSubFiltroPresupuesto(sf.id)}
                className={`h-7 px-3 rounded-full text-xs font-medium transition-colors ${
                  activo
                    ? "bg-marca text-white"
                    : "bg-fondo text-tinta-suave hover:text-tinta border border-borde"
                }`}
              >
                {sf.etiqueta}
              </button>
            );
          })}
        </div>
      )}

      <Tarjeta className="overflow-hidden">
        {errorCarga ? (
          <div className="p-8">
            <Aviso variante="peligro">{errorCarga}</Aviso>
          </div>
        ) : filtroActivo === "presupuestos" ? (
          <>
            {/* Vista móvil (< md): lista de presupuestos */}
            <div className="divide-y divide-borde md:hidden">
              {presupuestosFiltrados.map((p) => {
                const estadoCalculado = calcularEstadoPresupuesto(p);
                const items = p.servicios || [];
                const itemsActivos = items.filter(
                  (s: any) => s.estado !== "cancelado",
                );
                const totales = calcularTotalesAgrupadosPorMoneda(itemsActivos);
                const totalTexto =
                  [
                    totales.ARS ? formatearPesos(totales.ARS.total) : null,
                    totales.USD
                      ? `U$S ${totales.USD.total.toLocaleString("es-AR")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" + ") || "$ 0";

                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/presupuestos/${p.id}`)}
                    className="flex items-start justify-between gap-3 p-4 hover:bg-fondo active:bg-fondo/80 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-tinta truncate">
                          {p.cliente_id && p.clientes ? (
                            p.clientes.nombre
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider bg-marca-suave text-marca px-1 py-0.5 rounded">
                                Prospecto
                              </span>
                              {p.prospecto_nombre}
                            </span>
                          )}
                        </span>
                        <ChipEstadoPresupuesto estado={estadoCalculado} />
                      </div>
                      <div className="text-[13px] text-tinta-suave truncate">
                        Presupuesto #{p.numero} · {formatearFecha(p.fecha)} ·{" "}
                        {items.length} {items.length === 1 ? "ítem" : "ítems"}
                      </div>
                      <div className="flex justify-between items-center text-xs text-tinta-suave pt-0.5">
                        <span>
                          Vence{" "}
                          {formatearFecha(
                            calcularFechaVencimiento(p.fecha, p.validez_dias),
                          )}
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums text-tinta">
                          {totalTexto}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {presupuestosFiltrados.length === 0 && (
                <div className="p-8 text-center text-sm text-tinta-suave">
                  No hay presupuestos con ese filtro.
                </div>
              )}
            </div>

            {/* Vista escritorio (>= md): tabla de presupuestos */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-tinta-suave">
                  <tr className="border-b border-borde">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Para</th>
                    <th className="px-4 py-3 font-medium">Ítems</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {presupuestosFiltrados.map((p) => {
                    const estadoCalculado = calcularEstadoPresupuesto(p);
                    const items = p.servicios || [];
                    const itemsActivos = items.filter(
                      (s: any) => s.estado !== "cancelado",
                    );
                    const totales =
                      calcularTotalesAgrupadosPorMoneda(itemsActivos);
                    const totalTexto =
                      [
                        totales.ARS ? formatearPesos(totales.ARS.total) : null,
                        totales.USD
                          ? `U$S ${totales.USD.total.toLocaleString("es-AR")}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" + ") || "$ 0";

                    return (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/presupuestos/${p.id}`)}
                        className="border-b border-borde last:border-0 hover:bg-fondo cursor-pointer"
                      >
                        <td className="px-4 py-3 text-tinta-suave font-medium">
                          #{p.numero}
                        </td>
                        <td className="px-4 py-3">
                          {formatearFecha(p.fecha)}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {p.cliente_id && p.clientes ? (
                            <Link
                              to={`/presupuestos/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:underline text-tinta"
                            >
                              {p.clientes.nombre}
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider bg-marca-suave text-marca px-1.5 py-0.5 rounded">
                                Prospecto
                              </span>
                              {p.prospecto_nombre}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-tinta-suave">
                          {items.length} {items.length === 1 ? "ítem" : "ítems"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-tinta tabular-nums">
                          {totalTexto}
                        </td>
                        <td className="px-4 py-3">
                          <ChipEstadoPresupuesto estado={estadoCalculado} />
                        </td>
                        <td className="px-4 py-3 text-tinta-suave">
                          {formatearFecha(
                            calcularFechaVencimiento(p.fecha, p.validez_dias),
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {presupuestosFiltrados.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-8 text-center text-sm text-tinta-suave"
                      >
                        No hay presupuestos con ese filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* Vista móvil (< md): lista de servicios */}
            <div className="divide-y divide-borde md:hidden">
              {servicios.map((s) => {
                const acciones: AccionMenu[] = [
                  {
                    texto: "Ver detalle",
                    onClick: () => navigate(`/servicios/${s.id}`),
                  },
                  ...(s.estado !== "cancelado"
                    ? [
                        {
                          texto: "Cancelar",
                          peligro: true,
                          onClick: () => handleCancelar(s),
                        },
                      ]
                    : []),
                ];

                return (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/servicios/${s.id}`)}
                    className="flex items-start justify-between gap-3 p-4 hover:bg-fondo active:bg-fondo/80 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-tinta truncate">
                          {s.clientes?.nombre ?? "—"}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.nocturno && <ChipNocturno />}
                          <ChipEstado estado={s.estado} />
                        </div>
                      </div>
                      {s.paradas && s.paradas.length > 0 ? (
                        <div className="text-[13px] text-tinta-suave">
                          <button
                            type="button"
                            onClick={(e) => toggleExpandido(s.id, e)}
                            className="inline-flex items-center gap-1.5 text-marca hover:underline font-medium"
                          >
                            <Route className="size-3.5 shrink-0" />
                            <span>
                              {s.origen || "Origen"} → {s.paradas.length}{" "}
                              {s.paradas.length === 1 ? "parada" : "paradas"}
                            </span>
                          </button>
                          {expandidos[s.id] && (
                            <div className="mt-1.5 pl-2 border-l-2 border-marca/30 space-y-1 text-xs text-tinta">
                              <div className="text-tinta-suave">
                                Origen: {s.origen || "—"}
                              </div>
                              {s.paradas.map((p) => (
                                <div
                                  key={p.id ?? p.orden}
                                  className="flex items-center justify-between gap-1"
                                >
                                  <span className="truncate">
                                    {p.orden}. {p.direccion}
                                    {p.carga ? ` (${p.carga})` : ""}
                                  </span>
                                  <ChipEstadoParada estado={p.estado} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[13px] text-tinta-suave truncate">
                          {filtroActivo === "alquileres_activos" &&
                          s.alquileres?.fecha_hasta
                            ? `Vence ${formatearFecha(s.alquileres.fecha_hasta)} · ${ETIQUETA_TIPO[s.tipo]}`
                            : `${formatearFecha(s.fecha_programada)} · ${ETIQUETA_TIPO[s.tipo]}`}
                        </div>
                      )}
                      <div className="text-right text-sm font-medium tabular-nums text-tinta">
                        {formatearPesos(s.monto)}
                      </div>
                    </div>
                    <div
                      className="pt-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MenuAcciones acciones={acciones} />
                    </div>
                  </div>
                );
              })}
              {servicios.length === 0 && (
                <div className="p-8 text-center text-sm text-tinta-suave">
                  No hay servicios con ese filtro.
                </div>
              )}
            </div>

            {/* Vista escritorio (>= md): tabla completa */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-tinta-suave">
                  <tr className="border-b border-borde">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    {filtroActivo === "alquileres_activos" && (
                      <th className="px-4 py-3 font-medium">Vence</th>
                    )}
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 text-right font-medium">Monto</th>
                    <th className="px-4 py-3 text-right font-medium">Cobrado</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="w-12 px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {servicios.map((s) => {
                    const acciones: AccionMenu[] = [
                      {
                        texto: "Ver detalle",
                        onClick: () => navigate(`/servicios/${s.id}`),
                      },
                      ...(s.estado !== "cancelado"
                        ? [
                            {
                              texto: "Cancelar",
                              peligro: true,
                              onClick: () => handleCancelar(s),
                            },
                          ]
                        : []),
                    ];

                    return (
                      <ConMenuContextual key={s.id} acciones={acciones}>
                        <tr
                          onClick={() => navigate(`/servicios/${s.id}`)}
                          className="border-b border-borde last:border-0 hover:bg-fondo cursor-pointer"
                        >
                          <td className="px-4 py-3 text-tinta-suave">
                            {s.numero}
                          </td>
                          <td className="px-4 py-3">
                            {formatearFecha(s.fecha_programada)}
                          </td>
                          {filtroActivo === "alquileres_activos" && (
                            <td className="px-4 py-3 font-medium text-tinta">
                              {s.alquileres?.fecha_hasta
                                ? formatearFecha(s.alquileres.fecha_hasta)
                                : "—"}
                            </td>
                          )}
                          <td className="px-4 py-3 font-medium">
                            <Link
                              to={`/servicios/${s.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:underline block"
                            >
                              {s.clientes?.nombre ?? "—"}
                            </Link>
                            {s.paradas && s.paradas.length > 0 && (
                              <div className="mt-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => toggleExpandido(s.id, e)}
                                  className="inline-flex items-center gap-1 text-xs text-marca hover:underline font-normal"
                                >
                                  <Route className="size-3 shrink-0" />
                                  <span>
                                    {s.origen || "Origen"} → {s.paradas.length}{" "}
                                    {s.paradas.length === 1
                                      ? "parada"
                                      : "paradas"}
                                  </span>
                                </button>
                                {expandidos[s.id] && (
                                  <div className="mt-1 pl-2 border-l-2 border-marca/30 space-y-0.5 text-xs text-tinta font-normal">
                                    <div className="text-tinta-suave">
                                      Origen: {s.origen || "—"}
                                    </div>
                                    {s.paradas.map((p) => (
                                      <div
                                        key={p.id ?? p.orden}
                                        className="flex items-center justify-between gap-2"
                                      >
                                        <span className="truncate">
                                          {p.orden}. {p.direccion}
                                          {p.carga ? ` (${p.carga})` : ""}
                                        </span>
                                        <ChipEstadoParada estado={p.estado} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-tinta-suave">
                            {ETIQUETA_TIPO[s.tipo]}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatearPesos(s.monto)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatearPesos(s.monto_cobrado)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {s.nocturno && <ChipNocturno />}
                              <ChipEstado estado={s.estado} />
                            </div>
                          </td>
                          <td
                            className="w-12 px-2 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MenuAcciones acciones={acciones} />
                          </td>
                        </tr>
                      </ConMenuContextual>
                    );
                  })}
                  {servicios.length === 0 && (
                    <tr>
                      <td
                        colSpan={filtroActivo === "alquileres_activos" ? 9 : 8}
                        className="p-8 text-center text-sm text-tinta-suave"
                      >
                        No hay servicios con ese filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Tarjeta>
    </div>
  );
}
