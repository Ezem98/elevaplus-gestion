import { formatearPesos } from "@/lib/formato";
import type { ItemAgenda } from "@/lib/tipos";
import { useState } from "react";
import { ItemAgendaCard } from "./ItemAgendaCard";

interface VistaMesProps {
  mesIso: string; // YYYY-MM
  items: ItemAgenda[];
  cargando?: boolean;
  onMarcarPagado: (instanciaId: string, item: ItemAgenda) => void;
  onOmitir: (instanciaId: string, item: ItemAgenda) => void;
  onEditarVencimiento: (vencimientoId: string) => void;
}

function obtenerHoyIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface CeldaDia {
  fecha: string;
  numeroDia: number;
  esDelMes: boolean;
  esHoy: boolean;
}

function generarMatrizMes(mesIso: string): CeldaDia[] {
  const [añoStr, mesStr] = mesIso.split("-");
  const año = parseInt(añoStr, 10);
  const mes = parseInt(mesStr, 10); // 1-12

  const primerDiaMes = new Date(Date.UTC(año, mes - 1, 1));
  const ultimoDiaMes = new Date(Date.UTC(año, mes, 0));
  const totalDias = ultimoDiaMes.getUTCDate();

  // Día de la semana del día 1 (0 = domingo, 1 = lunes, ..., 6 = sábado)
  // Convertimos a lunes = 0, ..., domingo = 6
  let diaSemanaInicio = primerDiaMes.getUTCDay() - 1;
  if (diaSemanaInicio === -1) diaSemanaInicio = 6;

  const celdas: CeldaDia[] = [];
  const hoyIso = obtenerHoyIso();

  // Días del mes anterior para completar la primera semana
  if (diaSemanaInicio > 0) {
    const ultimoDiaMesAnt = new Date(Date.UTC(año, mes - 1, 0)).getUTCDate();
    for (let i = diaSemanaInicio - 1; i >= 0; i--) {
      const num = ultimoDiaMesAnt - i;
      const fecha = new Date(Date.UTC(año, mes - 2, num))
        .toISOString()
        .slice(0, 10);
      celdas.push({
        fecha,
        numeroDia: num,
        esDelMes: false,
        esHoy: fecha === hoyIso,
      });
    }
  }

  // Días del mes actual
  for (let d = 1; d <= totalDias; d++) {
    const fecha = new Date(Date.UTC(año, mes - 1, d))
      .toISOString()
      .slice(0, 10);
    celdas.push({
      fecha,
      numeroDia: d,
      esDelMes: true,
      esHoy: fecha === hoyIso,
    });
  }

  // Días del mes siguiente para completar la última semana
  const resto = celdas.length % 7;
  if (resto > 0) {
    const faltan = 7 - resto;
    for (let d = 1; d <= faltan; d++) {
      const fecha = new Date(Date.UTC(año, mes, d)).toISOString().slice(0, 10);
      celdas.push({
        fecha,
        numeroDia: d,
        esDelMes: false,
        esHoy: fecha === hoyIso,
      });
    }
  }

  return celdas;
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

export function VistaMes({
  mesIso,
  items,
  cargando = false,
  onMarcarPagado,
  onOmitir,
  onEditarVencimiento,
}: VistaMesProps) {
  const hoyIso = obtenerHoyIso();
  const celdas = generarMatrizMes(mesIso);

  // Inicializar día seleccionado con hoy si está en el mes o el primer día con ítems
  const [diaSeleccionado, setDiaSeleccionado] = useState<string>(() => {
    if (items.some((it) => it.fecha === hoyIso)) return hoyIso;
    if (items.length > 0) return items[0].fecha;
    return `${mesIso}-01`;
  });

  // Mapeo de ítems por fecha
  const itemsPorFecha = new Map<string, ItemAgenda[]>();
  for (const it of items) {
    const list = itemsPorFecha.get(it.fecha) ?? [];
    list.push(it);
    itemsPorFecha.set(it.fecha, list);
  }

  const itemsDiaSeleccionado = itemsPorFecha.get(diaSeleccionado) ?? [];
  const netoDiaSeleccionado = calcularNeto(itemsDiaSeleccionado);

  const nombresDias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="space-y-6">
      {/* Grilla del calendario mensual */}
      <div className="bg-superficie border border-borde rounded-[10px] overflow-hidden">
        {/* Encabezado días de la semana */}
        <div className="grid grid-cols-7 border-b border-borde bg-fondo text-center">
          {nombresDias.map((nom) => (
            <div
              key={nom}
              className="py-2.5 text-[12px] font-semibold text-tinta-suave"
            >
              {nom}
            </div>
          ))}
        </div>

        {/* Celdas de días */}
        <div className="grid grid-cols-7 divide-x divide-y divide-borde">
          {celdas.map((c) => {
            const itemsCelda = itemsPorFecha.get(c.fecha) ?? [];
            const tieneItems = itemsCelda.length > 0;
            const neto = calcularNeto(itemsCelda);
            const esSeleccionado = c.fecha === diaSeleccionado;

            return (
              <button
                key={c.fecha}
                type="button"
                onClick={() => setDiaSeleccionado(c.fecha)}
                className={`p-2 min-h-[85px] lg:min-h-[105px] text-left flex flex-col justify-between transition-colors cursor-pointer relative ${
                  !c.esDelMes
                    ? "bg-fondo/40 text-tinta-tenue opacity-60"
                    : esSeleccionado
                      ? "bg-marca-suave/30 ring-2 ring-marca ring-inset"
                      : c.esHoy
                        ? "bg-marca-suave/10 hover:bg-fondo"
                        : "bg-superficie hover:bg-fondo/50"
                }`}
              >
                {/* Cabecera de la celda: número de día */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center text-[12px] font-semibold rounded-full ${
                      c.esHoy
                        ? "w-6 h-6 bg-marca text-white"
                        : esSeleccionado
                          ? "text-marca font-bold"
                          : c.esDelMes
                            ? "text-tinta"
                            : "text-tinta-tenue"
                    }`}
                  >
                    {c.numeroDia}
                  </span>

                  {tieneItems && (
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-tinta/5 text-tinta-suave tabular-nums">
                      {itemsCelda.length}
                    </span>
                  )}
                </div>

                {/* Contenido / Resumen diario */}
                <div className="mt-1 space-y-1">
                  {tieneItems ? (
                    <div>
                      {/* Mostrar hasta 2 títulos compactos en desktop */}
                      <div className="hidden lg:block space-y-0.5 mb-1">
                        {itemsCelda.slice(0, 2).map((it) => (
                          <div
                            key={it.clave}
                            className="text-[10px] truncate text-tinta-suave leading-tight"
                          >
                            • {it.titulo}
                          </div>
                        ))}
                        {itemsCelda.length > 2 && (
                          <div className="text-[9px] text-tinta-tenue">
                            +{itemsCelda.length - 2} más
                          </div>
                        )}
                      </div>

                      {/* Neto del día */}
                      {neto !== 0 && (
                        <div
                          className={`text-[11px] font-semibold tabular-nums ${
                            neto > 0 ? "text-ok" : "text-peligro"
                          }`}
                        >
                          {neto > 0
                            ? `+${formatearPesos(neto)}`
                            : `−${formatearPesos(Math.abs(neto))}`}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel de detalle del día seleccionado */}
      <section className="bg-superficie border border-borde rounded-[10px] overflow-hidden">
        <div className="p-4 bg-fondo border-b border-borde flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-[14px] font-semibold text-tinta">
              Detalle del {diaSeleccionado}
            </h3>
            <p className="text-[12px] text-tinta-suave">
              {itemsDiaSeleccionado.length}{" "}
              {itemsDiaSeleccionado.length === 1
                ? "compromiso registrado"
                : "compromisos registrados"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[12px] text-tinta-suave">
              Total neto del día:
            </span>
            <span
              className={`text-[14px] font-bold tabular-nums ${
                netoDiaSeleccionado > 0
                  ? "text-ok"
                  : netoDiaSeleccionado < 0
                    ? "text-peligro"
                    : "text-tinta"
              }`}
            >
              {netoDiaSeleccionado > 0
                ? `+${formatearPesos(netoDiaSeleccionado)}`
                : netoDiaSeleccionado < 0
                  ? `−${formatearPesos(Math.abs(netoDiaSeleccionado))}`
                  : "$ 0"}
            </span>
          </div>
        </div>

        <div className="divide-y divide-borde">
          {cargando ? (
            <div className="p-6 text-center text-tinta-suave animate-pulse">
              Cargando compromisos...
            </div>
          ) : itemsDiaSeleccionado.length === 0 ? (
            <div className="p-8 text-center text-tinta-tenue text-[13px]">
              No hay vencimientos ni compromisos registrados para este día.
            </div>
          ) : (
            itemsDiaSeleccionado.map((it) => (
              <ItemAgendaCard
                key={it.clave}
                item={it}
                onMarcarPagado={onMarcarPagado}
                onOmitir={onOmitir}
                onEditarVencimiento={onEditarVencimiento}
                modo="lista"
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
