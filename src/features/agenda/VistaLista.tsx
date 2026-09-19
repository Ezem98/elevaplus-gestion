import { formatearFecha, formatearPesos } from "@/lib/formato";
import type { ItemAgenda } from "@/lib/tipos";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ItemAgendaCard } from "./ItemAgendaCard";

interface VistaListaProps {
  items: ItemAgenda[];
  cargando?: boolean;
  onMarcarPagado: (instanciaId: string, item: ItemAgenda) => void;
  onOmitir: (instanciaId: string, item: ItemAgenda) => void;
  onEditarVencimiento: (vencimientoId: string) => void;
}

export function VistaLista({
  items,
  cargando = false,
  onMarcarPagado,
  onOmitir,
  onEditarVencimiento,
}: VistaListaProps) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroSentido, setFiltroSentido] = useState<
    "todos" | "ingreso" | "egreso" | "info"
  >("todos");

  const itemsFiltrados = useMemo(() => {
    return items.filter((it) => {
      if (filtroSentido !== "todos" && it.sentido !== filtroSentido) {
        return false;
      }
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const coincideTitulo = it.titulo.toLowerCase().includes(q);
        const coincideDetalle = it.detalle
          ? it.detalle.toLowerCase().includes(q)
          : false;
        if (!coincideTitulo && !coincideDetalle) return false;
      }
      return true;
    });
  }, [items, busqueda, filtroSentido]);

  // Agrupar por fecha
  const fechasOrdenadas = useMemo(() => {
    const setFechas = new Set<string>();
    for (const it of itemsFiltrados) {
      setFechas.add(it.fecha);
    }
    return Array.from(setFechas).sort();
  }, [itemsFiltrados]);

  // Totales
  const { totalIngresos, totalEgresos, neto } = useMemo(() => {
    let ing = 0;
    let egr = 0;
    for (const it of itemsFiltrados) {
      if (it.sentido === "ingreso" && it.monto != null) {
        ing += Number(it.monto);
      } else if (it.sentido === "egreso" && it.monto != null) {
        egr += Number(it.monto);
      }
    }
    return { totalIngresos: ing, totalEgresos: egr, neto: ing - egr };
  }, [itemsFiltrados]);

  return (
    <div className="space-y-4">
      {/* Barra de filtros de lista */}
      <div className="bg-superficie border border-borde rounded-[10px] p-3 flex flex-wrap items-center justify-between gap-3">
        {/* Buscador */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-tinta-suave absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por título o detalle..."
            className="w-full pl-9 pr-3 py-1.5 text-[13px] bg-fondo border border-borde rounded-[6px] focus:outline-none focus:border-marca text-tinta placeholder:text-tinta-tenue"
          />
        </div>

        {/* Filtro de sentido */}
        <div className="inline-flex bg-fondo border border-borde rounded-[6px] p-0.5 text-[12px]">
          <button
            type="button"
            onClick={() => setFiltroSentido("todos")}
            className={`px-3 py-1 font-medium rounded-[4px] transition-colors ${
              filtroSentido === "todos"
                ? "bg-superficie text-marca shadow-xs"
                : "text-tinta-suave hover:text-tinta"
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFiltroSentido("ingreso")}
            className={`px-3 py-1 font-medium rounded-[4px] transition-colors ${
              filtroSentido === "ingreso"
                ? "bg-superficie text-ok shadow-xs"
                : "text-tinta-suave hover:text-tinta"
            }`}
          >
            Ingresos
          </button>
          <button
            type="button"
            onClick={() => setFiltroSentido("egreso")}
            className={`px-3 py-1 font-medium rounded-[4px] transition-colors ${
              filtroSentido === "egreso"
                ? "bg-superficie text-peligro shadow-xs"
                : "text-tinta-suave hover:text-tinta"
            }`}
          >
            Egresos
          </button>
          <button
            type="button"
            onClick={() => setFiltroSentido("info")}
            className={`px-3 py-1 font-medium rounded-[4px] transition-colors ${
              filtroSentido === "info"
                ? "bg-superficie text-marca shadow-xs"
                : "text-tinta-suave hover:text-tinta"
            }`}
          >
            Info
          </button>
        </div>
      </div>

      {/* Tabla / Lista agrupada por fecha */}
      <div className="bg-superficie border border-borde rounded-[10px] overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center text-tinta-suave animate-pulse">
            Cargando ítems de la agenda...
          </div>
        ) : itemsFiltrados.length === 0 ? (
          <div className="p-12 text-center text-tinta-tenue text-[13px]">
            No se encontraron compromisos para los filtros seleccionados.
          </div>
        ) : (
          <div className="divide-y divide-borde">
            {fechasOrdenadas.map((f) => {
              const itemsDia = itemsFiltrados.filter((it) => it.fecha === f);

              return (
                <div key={f} className="divide-y divide-borde/50">
                  {/* Encabezado del día */}
                  <div className="bg-fondo px-4 py-2 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-tinta">
                      {formatearFecha(f)}
                    </span>
                    <span className="text-[11px] text-tinta-suave">
                      {itemsDia.length}{" "}
                      {itemsDia.length === 1 ? "compromiso" : "compromisos"}
                    </span>
                  </div>

                  {/* Tarjetas en fila */}
                  {itemsDia.map((it) => (
                    <ItemAgendaCard
                      key={it.clave}
                      item={it}
                      onMarcarPagado={onMarcarPagado}
                      onOmitir={onOmitir}
                      onEditarVencimiento={onEditarVencimiento}
                      modo="lista"
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Resumen al pie */}
        {itemsFiltrados.length > 0 && (
          <div className="p-4 bg-fondo border-t border-borde flex items-center justify-between flex-wrap gap-4 text-[13px]">
            <span className="text-tinta-suave">
              {itemsFiltrados.length} compromisos listados
            </span>
            <div className="flex items-center gap-6">
              <span className="text-tinta-suave">
                Ingresos:{" "}
                <strong className="text-ok tabular-nums font-semibold">
                  +{formatearPesos(totalIngresos)}
                </strong>
              </span>
              <span className="text-tinta-suave">
                Egresos:{" "}
                <strong className="text-tinta tabular-nums font-semibold">
                  {formatearPesos(totalEgresos)}
                </strong>
              </span>
              <span className="text-tinta-suave">
                Neto:{" "}
                <strong
                  className={`tabular-nums font-bold ${
                    neto > 0
                      ? "text-ok"
                      : neto < 0
                        ? "text-peligro"
                        : "text-tinta"
                  }`}
                >
                  {neto > 0
                    ? `+${formatearPesos(neto)}`
                    : neto < 0
                      ? `−${formatearPesos(Math.abs(neto))}`
                      : "$ 0"}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
