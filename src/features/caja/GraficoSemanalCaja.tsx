import { Tarjeta } from "@/components/ui/Tarjeta";
import { formatearCompacto, formatearPesos } from "@/lib/formato";

export interface DiaResumenSemanal {
  fecha: string;
  etiquetaDia: string;
  esHoy: boolean;
  ingresos: number;
  egresos: number;
}

interface GraficoSemanalCajaProps {
  dias: DiaResumenSemanal[];
}

export function GraficoSemanalCaja({ dias }: GraficoSemanalCajaProps) {
  const maxValor = Math.max(...dias.flatMap((d) => [d.ingresos, d.egresos]), 1);

  return (
    <Tarjeta className="p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-tinta">
          Ingresos y egresos diarios
        </h3>
        <div className="flex items-center gap-4 text-xs text-tinta-suave">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-ok" /> Ingresos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-peligro/70" /> Egresos
          </span>
        </div>
      </div>

      <div className="w-full h-[140px]">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 w-full h-full items-end">
          {dias.map((d) => {
            const alturaIngresosPct = (d.ingresos / maxValor) * 78;
            const alturaEgresosPct = (d.egresos / maxValor) * 78;

            return (
              <div
                key={d.fecha}
                className="flex flex-col items-center justify-between h-full pt-1"
              >
                {/* Barras lado a lado */}
                <div className="w-full flex-1 flex items-end justify-center gap-1 sm:gap-1.5">
                  {/* Barra de ingreso */}
                  <div
                    className="flex-1 max-w-[16px] sm:max-w-[22px] flex flex-col items-center justify-end h-full group"
                    title={`Ingresos (${d.etiquetaDia}): ${formatearPesos(d.ingresos)}`}
                  >
                    {d.ingresos > 0 && (
                      <span className="text-[10px] tabular-nums font-medium text-ok mb-0.5 leading-none truncate max-w-full text-center">
                        {formatearCompacto(d.ingresos)}
                      </span>
                    )}
                    <div
                      className="w-full rounded-t-[2px] bg-ok transition-all"
                      style={{
                        height: `${Math.max(alturaIngresosPct, d.ingresos > 0 ? 4 : 0)}%`,
                      }}
                    />
                  </div>

                  {/* Barra de egreso */}
                  <div
                    className="flex-1 max-w-[16px] sm:max-w-[22px] flex flex-col items-center justify-end h-full group"
                    title={`Egresos (${d.etiquetaDia}): ${formatearPesos(d.egresos)}`}
                  >
                    {d.egresos > 0 && (
                      <span className="text-[10px] tabular-nums font-medium text-peligro mb-0.5 leading-none truncate max-w-full text-center">
                        {formatearCompacto(d.egresos)}
                      </span>
                    )}
                    <div
                      className="w-full rounded-t-[2px] bg-peligro/70 transition-all"
                      style={{
                        height: `${Math.max(alturaEgresosPct, d.egresos > 0 ? 4 : 0)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Línea horizontal de base */}
                <div className="w-full border-b border-borde my-1" />

                {/* Etiqueta del día */}
                <span
                  className={`text-[10px] tabular-nums tracking-tight truncate text-center ${
                    d.esHoy ? "font-medium text-marca" : "text-tinta-suave"
                  }`}
                >
                  {d.etiquetaDia}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Tarjeta>
  );
}
