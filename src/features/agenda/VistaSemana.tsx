import { formatearPesos } from "@/lib/formato";
import type { ItemAgenda } from "@/lib/tipos";
import { ItemAgendaCard } from "./ItemAgendaCard";
import {
  ProyeccionCajaGrafico,
  type ProyeccionDia,
} from "./ProyeccionCajaGrafico";

interface VistaSemanaProps {
  fechaInicioSemana: string; // YYYY-MM-DD (lunes)
  items: ItemAgenda[];
  cargando?: boolean;
  onMarcarPagado: (instanciaId: string, item: ItemAgenda) => void;
  onOmitir: (instanciaId: string, item: ItemAgenda) => void;
  onEditarVencimiento: (vencimientoId: string) => void;
  proyeccion: ProyeccionDia[];
  cargandoProyeccion?: boolean;
}

function obtenerHoyIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generarDiasSemana(lunesIso: string) {
  const [y, m, d] = lunesIso.split("-").map(Number);
  const nombres = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];
  const hoyStr = obtenerHoyIso();
  const dias = [];

  for (let i = 0; i < 7; i++) {
    const fecha = new Date(Date.UTC(y, m - 1, d + i));
    const iso = fecha.toISOString().slice(0, 10);
    dias.push({
      fecha: iso,
      nombreDia: nombres[i],
      numeroDia: fecha.getUTCDate(),
      esHoy: iso === hoyStr,
    });
  }

  return dias;
}

function calcularNeto(items: ItemAgenda[]): number {
  let neto = 0;
  for (const it of items) {
    if (it.sentido === "info" || it.monto == null) continue;
    if (it.sentido === "ingreso") {
      neto += Number(it.monto);
    } else if (it.sentido === "egreso") {
      neto -= Number(it.monto);
    }
  }
  return neto;
}

function renderNetoTexto(neto: number) {
  if (neto > 0) {
    return (
      <span className="text-[12px] lg:text-[13px] font-semibold text-ok tabular-nums">
        +{formatearPesos(neto)}
      </span>
    );
  }
  if (neto < 0) {
    return (
      <span className="text-[12px] lg:text-[13px] font-semibold text-peligro tabular-nums">
        −{formatearPesos(Math.abs(neto))}
      </span>
    );
  }
  return (
    <span className="text-[12px] lg:text-[13px] font-medium text-tinta-suave tabular-nums">
      $ 0
    </span>
  );
}

export function VistaSemana({
  fechaInicioSemana,
  items,
  cargando = false,
  onMarcarPagado,
  onOmitir,
  onEditarVencimiento,
  proyeccion,
  cargandoProyeccion = false,
}: VistaSemanaProps) {
  const dias = generarDiasSemana(fechaInicioSemana);

  // Mapear ítems por fecha
  const itemsPorFecha = new Map<string, ItemAgenda[]>();
  for (const it of items) {
    const list = itemsPorFecha.get(it.fecha) ?? [];
    list.push(it);
    itemsPorFecha.set(it.fecha, list);
  }

  return (
    <div className="space-y-6">
      {/* 1. Grilla 7 columnas en escritorio (hidden en móviles) */}
      <div className="hidden lg:block bg-superficie border border-borde rounded-[10px] overflow-hidden">
        <div className="grid grid-cols-7 divide-x divide-borde">
          {dias.map((d) => {
            const itemsDia = itemsPorFecha.get(d.fecha) ?? [];
            const neto = calcularNeto(itemsDia);

            return (
              <div
                key={d.fecha}
                className={`flex flex-col min-h-[480px] ${
                  d.esHoy ? "bg-marca-suave/10" : ""
                }`}
              >
                {/* Cabecera del día */}
                <div
                  className={`p-3 border-b border-borde text-center ${
                    d.esHoy ? "bg-marca-suave/40" : "bg-fondo"
                  }`}
                >
                  <div
                    className={`text-[12px] font-medium ${
                      d.esHoy ? "text-marca font-semibold" : "text-tinta-suave"
                    }`}
                  >
                    {d.nombreDia}
                  </div>
                  <div
                    className={`text-[16px] font-semibold mt-0.5 ${
                      d.esHoy ? "text-marca" : "text-tinta"
                    }`}
                  >
                    {d.numeroDia}
                  </div>
                  {d.esHoy && (
                    <span className="inline-block mt-0.5 px-1.5 py-0.2 text-[9px] font-bold rounded bg-marca text-white">
                      HOY
                    </span>
                  )}
                </div>

                {/* Lista de tarjetas del día */}
                <div className="p-2 flex-1 space-y-2">
                  {cargando ? (
                    <div className="p-4 text-center">
                      <div className="h-12 bg-fondo rounded animate-pulse" />
                    </div>
                  ) : itemsDia.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-[12px] text-tinta-tenue">
                        Sin compromisos
                      </p>
                    </div>
                  ) : (
                    itemsDia.map((it) => (
                      <ItemAgendaCard
                        key={it.clave}
                        item={it}
                        onMarcarPagado={onMarcarPagado}
                        onOmitir={onOmitir}
                        onEditarVencimiento={onEditarVencimiento}
                        modo="compacto"
                      />
                    ))
                  )}
                </div>

                {/* Pie de columna: Neto diario */}
                <div className="p-2.5 border-t border-borde bg-superficie flex items-center justify-between">
                  <span className="text-[11px] text-tinta-suave">Neto</span>
                  {renderNetoTexto(neto)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Vista lista agrupada con sticky headers en móviles / tablets (hidden en lg) */}
      <div className="block lg:hidden space-y-3">
        {dias.map((d) => {
          const itemsDia = itemsPorFecha.get(d.fecha) ?? [];
          const neto = calcularNeto(itemsDia);

          return (
            <section
              key={d.fecha}
              className={`bg-superficie border rounded-[10px] overflow-hidden ${
                d.esHoy
                  ? "border-marca ring-1 ring-marca shadow-xs"
                  : "border-borde"
              }`}
            >
              {/* Encabezado sticky de día */}
              <div
                className={`sticky top-14 z-10 px-3.5 py-2.5 border-b border-borde flex items-center justify-between ${
                  d.esHoy ? "bg-marca-suave" : "bg-fondo"
                }`}
              >
                <div className="flex items-center gap-2">
                  {d.esHoy && (
                    <span className="px-1.5 py-0.5 rounded bg-marca text-white text-[10px] font-bold">
                      HOY
                    </span>
                  )}
                  <span
                    className={`text-[13px] font-bold ${
                      d.esHoy ? "text-marca" : "text-tinta"
                    }`}
                  >
                    {d.nombreDia} {d.numeroDia}
                  </span>
                  <span className="text-[11px] text-tinta-suave">
                    · {itemsDia.length}{" "}
                    {itemsDia.length === 1 ? "ítem" : "ítems"}
                  </span>
                </div>
                <div>{renderNetoTexto(neto)}</div>
              </div>

              {/* Ítems del día */}
              <div className="p-2 space-y-2">
                {cargando ? (
                  <div className="h-10 bg-fondo rounded animate-pulse" />
                ) : itemsDia.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-[12px] text-tinta-tenue">
                      Sin compromisos
                    </p>
                  </div>
                ) : (
                  itemsDia.map((it) => (
                    <ItemAgendaCard
                      key={it.clave}
                      item={it}
                      onMarcarPagado={onMarcarPagado}
                      onOmitir={onOmitir}
                      onEditarVencimiento={onEditarVencimiento}
                      modo="compacto"
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* 3. Tarjeta de proyección de caja 14 días */}
      <ProyeccionCajaGrafico datos={proyeccion} cargando={cargandoProyeccion} />
    </div>
  );
}
