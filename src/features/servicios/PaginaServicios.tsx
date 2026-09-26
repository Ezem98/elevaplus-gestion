import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { ChipEstado, ChipNocturno } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import {
  ConMenuContextual,
  MenuAcciones,
  type AccionMenu,
} from "@/components/ui/MenuAcciones";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { useRealtime } from "@/hooks/use-realtime";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type { EstadoServicio, Servicio } from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

type ClaveFiltro =
  | "todos"
  | "presupuestos"
  | "en_curso"
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
    estados: ["consulta", "presupuestado"],
  },
  {
    id: "en_curso",
    etiqueta: "En curso",
    estados: ["aceptado", "programado", "en_curso", "terminado"],
  },
  {
    id: "alquileres_activos",
    etiqueta: "Alquileres activos",
    estados: ["en_curso"],
  },
  { id: "cobrados", etiqueta: "Cobrados", estados: ["cobrado", "facturado"] },
  { id: "cancelados", etiqueta: "Cancelados", estados: ["cancelado"] },
];

function normalizarFiltro(param: string | null): ClaveFiltro {
  if (!param) return "en_curso";
  const p = param.toLowerCase().replace("-", "_");
  if (
    p === "todos" ||
    p === "presupuestos" ||
    p === "en_curso" ||
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
  const [conteos, setConteos] = useState<Record<ClaveFiltro, number>>({
    todos: 0,
    presupuestos: 0,
    en_curso: 0,
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
    const { data, error } = await supabase.from("servicios").select("tipo, estado");
    if (error) {
      console.error("Error al cargar conteos de servicios:", error.message);
      return;
    }
    if (!data) return;

    const nuevos: Record<ClaveFiltro, number> = {
      todos: 0,
      presupuestos: 0,
      en_curso: 0,
      alquileres_activos: 0,
      cobrados: 0,
      cancelados: 0,
    };
    nuevos.todos = data.length;
    for (const item of data) {
      const e = item.estado as EstadoServicio;
      if (item.tipo === "alquiler_periodo" && e === "en_curso") {
        nuevos.alquileres_activos++;
      }
      if (e === "consulta" || e === "presupuestado") {
        nuevos.presupuestos++;
      } else if (
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

  const cargarServicios = useCallback(async () => {
    setErrorCarga(null);
    let q = supabase
      .from("servicios")
      .select("*, clientes(nombre), alquileres!alquileres_servicio_id_fkey(fecha_desde, fecha_hasta)")
      .order("fecha_programada", { ascending: false, nullsFirst: false })
      .limit(100);

    if (filtroActivo === "alquileres_activos") {
      q = q.eq("tipo", "alquiler_periodo").eq("estado", "en_curso");
    } else {
      const pestana = PESTANAS.find((p) => p.id === filtroActivo);
      if (pestana && pestana.estados.length > 0) {
        q = q.in("estado", pestana.estados);
      }
    }

    const { data, error } = await q;
    if (error) {
      console.error("Error al cargar lista de servicios:", error.message);
      setErrorCarga(`Error al cargar los servicios: ${error.message}`);
      return;
    }
    if (!data) {
      setServicios([]);
      return;
    }
    setServicios(data as Servicio[]);
  }, [filtroActivo]);

  const cargar = useCallback(async () => {
    await Promise.all([cargarConteos(), cargarServicios()]);
  }, [cargarConteos, cargarServicios]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useRealtime(["servicios"], cargar);

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

    await Promise.all([cargarServicios(), cargarConteos()]);
  };

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Servicios"
        acciones={
          <Link to="/servicios/nuevo">
            <Boton>Nuevo servicio</Boton>
          </Link>
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

      {errorCarga && <Aviso variante="peligro">{errorCarga}</Aviso>}

      <Tarjeta className="overflow-hidden">
        {/* Vista móvil (< md): lista dividida */}
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
                  <div className="text-[13px] text-tinta-suave truncate">
                    {filtroActivo === "alquileres_activos" &&
                    s.alquileres?.fecha_hasta
                      ? `Vence ${formatearFecha(s.alquileres.fecha_hasta)} · ${ETIQUETA_TIPO[s.tipo]}`
                      : `${formatearFecha(s.fecha_programada)} · ${ETIQUETA_TIPO[s.tipo]}`}
                  </div>
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
                      <td className="px-4 py-3 text-tinta-suave">{s.numero}</td>
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
                          className="hover:underline"
                        >
                          {s.clientes?.nombre ?? "—"}
                        </Link>
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
                    className="px-4 py-10 text-center text-tinta-suave"
                  >
                    No hay servicios con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
