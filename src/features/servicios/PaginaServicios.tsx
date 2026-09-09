import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Servicio, EstadoServicio } from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { formatearPesos, formatearFecha } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipEstado } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/Boton";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { MenuAcciones, ConMenuContextual, type AccionMenu } from "@/components/ui/MenuAcciones";

type ClaveFiltro = "todos" | "presupuestos" | "en_curso" | "cobrados" | "cancelados";

interface PestanaFiltro {
  id: ClaveFiltro;
  etiqueta: string;
  estados: EstadoServicio[];
}

const PESTANAS: PestanaFiltro[] = [
  { id: "todos", etiqueta: "Todos", estados: [] },
  { id: "presupuestos", etiqueta: "Presupuestos", estados: ["consulta", "presupuestado"] },
  { id: "en_curso", etiqueta: "En curso", estados: ["aceptado", "programado", "en_curso", "terminado"] },
  { id: "cobrados", etiqueta: "Cobrados", estados: ["cobrado", "facturado"] },
  { id: "cancelados", etiqueta: "Cancelados", estados: ["cancelado"] },
];

function normalizarFiltro(param: string | null): ClaveFiltro {
  if (!param) return "en_curso";
  const p = param.toLowerCase().replace("-", "_");
  if (p === "todos" || p === "presupuestos" || p === "en_curso" || p === "cobrados" || p === "cancelados") {
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
    cobrados: 0,
    cancelados: 0,
  });

  const cambiarFiltro = (nuevo: ClaveFiltro) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("filtro", nuevo);
      return next;
    });
  };

  const cargarConteos = useCallback(async () => {
    const { data } = await supabase.from("servicios").select("estado");
    const nuevos: Record<ClaveFiltro, number> = {
      todos: 0,
      presupuestos: 0,
      en_curso: 0,
      cobrados: 0,
      cancelados: 0,
    };
    if (data) {
      nuevos.todos = data.length;
      for (const item of data) {
        const e = item.estado as EstadoServicio;
        if (e === "consulta" || e === "presupuestado") {
          nuevos.presupuestos++;
        } else if (e === "aceptado" || e === "programado" || e === "en_curso" || e === "terminado") {
          nuevos.en_curso++;
        } else if (e === "cobrado" || e === "facturado") {
          nuevos.cobrados++;
        } else if (e === "cancelado") {
          nuevos.cancelados++;
        }
      }
    }
    setConteos(nuevos);
  }, []);

  const cargarServicios = useCallback(async () => {
    let q = supabase
      .from("servicios")
      .select("*, clientes(nombre)")
      .order("fecha_programada", { ascending: false })
      .limit(100);

    const pestana = PESTANAS.find((p) => p.id === filtroActivo);
    if (pestana && pestana.estados.length > 0) {
      q = q.in("estado", pestana.estados);
    }

    const { data } = await q;
    setServicios((data as Servicio[]) ?? []);
  }, [filtroActivo]);

  useEffect(() => {
    cargarConteos();
  }, [cargarConteos]);

  useEffect(() => {
    cargarServicios();
  }, [cargarServicios]);

  const handleCancelar = async (s: Servicio) => {
    const confirmado = window.confirm(`¿Seguro que querés cancelar el servicio #${s.numero}?`);
    if (!confirmado) return;

    await supabase.rpc("cambiar_estado", {
      p_servicio_id: s.id,
      p_nuevo: "cancelado",
      p_nota: "Cancelado desde la lista",
    });

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
              {p.etiqueta} <span className="text-tinta-suave">({conteos[p.id]})</span>
            </button>
          );
        })}
      </div>

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
                    <ChipEstado estado={s.estado} />
                  </div>
                  <div className="text-[13px] text-tinta-suave truncate">
                    {formatearFecha(s.fecha_programada)} · {ETIQUETA_TIPO[s.tipo]}
                  </div>
                  <div className="text-right text-sm font-medium tabular-nums text-tinta">
                    {formatearPesos(s.monto)}
                  </div>
                </div>
                <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                      <td className="px-4 py-3">{formatearFecha(s.fecha_programada)}</td>
                      <td className="px-4 py-3 font-medium">
                        <Link
                          to={`/servicios/${s.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
                          {s.clientes?.nombre ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-tinta-suave">{ETIQUETA_TIPO[s.tipo]}</td>
                      <td className="px-4 py-3 text-right">{formatearPesos(s.monto)}</td>
                      <td className="px-4 py-3 text-right">{formatearPesos(s.monto_cobrado)}</td>
                      <td className="px-4 py-3">
                        <ChipEstado estado={s.estado} />
                      </td>
                      <td className="w-12 px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <MenuAcciones acciones={acciones} />
                      </td>
                    </tr>
                  </ConMenuContextual>
                );
              })}
              {servicios.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-tinta-suave">
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
