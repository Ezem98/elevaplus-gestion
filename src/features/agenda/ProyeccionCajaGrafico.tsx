import { formatearFechaCorta, formatearPesos } from "@/lib/formato";

export interface ProyeccionDia {
  fecha: string;
  ingresos: number;
  egresos: number;
  saldo_proyectado: number;
}

interface ProyeccionCajaGraficoProps {
  datos: ProyeccionDia[];
  cargando?: boolean;
}

function formatearCompacto(n: number): string {
  const abs = Math.abs(n);
  const signo = n < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    const mill = (abs / 1_000_000)
      .toFixed(1)
      .replace(".0", "")
      .replace(".", ",");
    return `${signo}${mill}M`;
  }
  if (abs >= 1_000) {
    const mil = Math.round(abs / 1_000);
    return `${signo}${mil}k`;
  }
  return `${signo}${abs}`;
}

export function ProyeccionCajaGrafico({
  datos,
  cargando = false,
}: ProyeccionCajaGraficoProps) {
  if (cargando) {
    return (
      <section className="bg-superficie border border-borde rounded-[10px] p-6 animate-pulse">
        <div className="h-6 w-64 bg-borde/50 rounded mb-2" />
        <div className="h-4 w-96 bg-borde/30 rounded mb-6" />
        <div className="h-48 bg-fondo rounded-[6px]" />
      </section>
    );
  }

  if (!datos || datos.length === 0) {
    return null;
  }

  // Tomar hasta 14 días
  const dias14 = datos.slice(0, 14);

  // Estadísticas clave
  const hoyStr = new Date().toISOString().slice(0, 10);
  const diaHoy = dias14[0];
  const saldoHoy = Number(diaHoy?.saldo_proyectado ?? 0);

  let minVal = Number(dias14[0]?.saldo_proyectado ?? 0);
  let minDia = dias14[0];
  let maxVal = Number(dias14[0]?.saldo_proyectado ?? 0);

  for (const d of dias14) {
    const s = Number(d.saldo_proyectado);
    if (s < minVal) {
      minVal = s;
      minDia = d;
    }
    if (s > maxVal) {
      maxVal = s;
    }
  }

  const diaFinal = dias14[dias14.length - 1];
  const saldoFinal = Number(diaFinal?.saldo_proyectado ?? 0);

  // Alturas relativas
  const tieneNegativos = minVal < 0;
  const techoPositivo = Math.max(maxVal, 100_000);
  const pisoNegativo = tieneNegativos ? Math.abs(minVal) : 0;
  const escalaTotal = techoPositivo + pisoNegativo;

  // Porcentaje de la zona positiva (arriba de la línea de cero)
  const pctZonaPositiva = (techoPositivo / escalaTotal) * 100;
  const pctZonaNegativa = 100 - pctZonaPositiva;

  return (
    <section className="bg-superficie border border-borde rounded-[10px] p-4 lg:p-6">
      {/* Encabezado */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-[16px] font-semibold text-tinta">
            Proyección de caja · próximos 14 días
          </h2>
          <p className="text-[13px] text-tinta-suave mt-0.5">
            Evolución de saldos bancarios considerando cobros esperados y
            compromisos agendados.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-tinta-suave">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-[2px] bg-marca" /> Saldo positivo
          </span>
          {tieneNegativos && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[2px] bg-peligro" /> Descubierto
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Métricas compactas */}
        <div className="lg:col-span-3 space-y-3 pr-0 lg:pr-4 lg:border-r border-borde">
          <div className="p-3 bg-fondo rounded-[6px]">
            <p className="text-[12px] text-tinta-suave">
              Saldo hoy ({formatearFechaCorta(diaHoy?.fecha)})
            </p>
            <p className="text-[18px] lg:text-[20px] font-semibold text-tinta tabular-nums mt-0.5">
              {formatearPesos(saldoHoy)}
            </p>
          </div>

          <div
            className={`p-3 rounded-[6px] border ${
              minVal < 0
                ? "bg-peligro-suave border-peligro/30 text-peligro"
                : "bg-fondo border-transparent text-tinta"
            }`}
          >
            <p
              className={`text-[12px] font-medium ${
                minVal < 0 ? "text-peligro" : "text-tinta-suave"
              }`}
            >
              Mínimo proyectado ({formatearFechaCorta(minDia?.fecha)})
            </p>
            <p
              className={`text-[18px] lg:text-[20px] font-semibold tabular-nums mt-0.5 ${
                minVal < 0 ? "text-peligro" : "text-tinta"
              }`}
            >
              {minVal < 0
                ? `−${formatearPesos(Math.abs(minVal))}`
                : formatearPesos(minVal)}
            </p>
            {minVal < 0 && (
              <p className="text-[11px] text-peligro mt-1 font-medium">
                Se proyecta descubierto
              </p>
            )}
          </div>

          <div className="p-3 bg-fondo rounded-[6px]">
            <p className="text-[12px] text-tinta-suave">
              Saldo al {formatearFechaCorta(diaFinal?.fecha)}
            </p>
            <p
              className={`text-[18px] lg:text-[20px] font-semibold tabular-nums mt-0.5 ${
                saldoFinal < 0 ? "text-peligro" : "text-tinta"
              }`}
            >
              {saldoFinal < 0
                ? `−${formatearPesos(Math.abs(saldoFinal))}`
                : formatearPesos(saldoFinal)}
            </p>
          </div>
        </div>

        {/* Gráfico de barras en divs */}
        <div className="lg:col-span-9">
          <div className="overflow-x-auto no-scrollbar pb-2">
            <div className="min-w-[540px] h-[190px] relative flex flex-col justify-between pt-2">
              {/* Zona superior: barras positivas */}
              <div
                className="relative w-full flex items-end"
                style={{ height: `${pctZonaPositiva}%` }}
              >
                <div
                  className="w-full grid gap-2 items-end h-full"
                  style={{
                    gridTemplateColumns: `repeat(${dias14.length}, minmax(0, 1fr))`,
                  }}
                >
                  {dias14.map((d) => {
                    const val = Number(d.saldo_proyectado);
                    const esPositivo = val > 0;
                    const alturaPct = esPositivo
                      ? (val / techoPositivo) * 100
                      : 0;
                    const esHoy = d.fecha === hoyStr;

                    return (
                      <div
                        key={d.fecha}
                        className="flex flex-col items-center justify-end h-full group cursor-default"
                        title={`${formatearFechaCorta(d.fecha)}: ${formatearPesos(val)} (Ingresos: ${formatearPesos(d.ingresos)}, Egresos: ${formatearPesos(d.egresos)})`}
                      >
                        {esPositivo && (
                          <span className="text-[9px] lg:text-[10px] text-tinta tabular-nums font-medium mb-1 group-hover:scale-110 transition-transform">
                            {formatearCompacto(val)}
                          </span>
                        )}
                        <div
                          className={`w-full max-w-[24px] rounded-t-[3px] transition-all ${
                            esHoy
                              ? "bg-marca hover:bg-marca-oscuro ring-1 ring-marca/40"
                              : "bg-marca/85 hover:bg-marca"
                          }`}
                          style={{
                            height: `${Math.max(esPositivo ? alturaPct : 0, esPositivo ? 4 : 0)}%`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Línea horizontal de Cero */}
              <div className="w-full border-b border-borde relative z-10" />

              {/* Zona inferior: barras negativas si existen */}
              {tieneNegativos && (
                <div
                  className="relative w-full flex items-start"
                  style={{ height: `${pctZonaNegativa}%` }}
                >
                  <div
                    className="w-full grid gap-2 items-start h-full"
                    style={{
                      gridTemplateColumns: `repeat(${dias14.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {dias14.map((d) => {
                      const val = Number(d.saldo_proyectado);
                      const esNegativo = val < 0;
                      const alturaPct = esNegativo
                        ? (Math.abs(val) / pisoNegativo) * 100
                        : 0;

                      return (
                        <div
                          key={d.fecha}
                          className="flex flex-col items-center justify-start h-full group cursor-default"
                          title={`${formatearFechaCorta(d.fecha)}: ${formatearPesos(val)}`}
                        >
                          <div
                            className="w-full max-w-[24px] bg-peligro rounded-b-[3px] hover:bg-peligro/90 transition-all"
                            style={{
                              height: `${Math.max(esNegativo ? alturaPct : 0, esNegativo ? 4 : 0)}%`,
                            }}
                          />
                          {esNegativo && (
                            <span className="text-[9px] lg:text-[10px] text-peligro tabular-nums font-semibold mt-0.5 group-hover:scale-110 transition-transform">
                              {formatearCompacto(val)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Etiquetas de fechas (número de día) */}
              <div
                className="w-full grid gap-2 pt-2 border-t border-borde/40 text-center"
                style={{
                  gridTemplateColumns: `repeat(${dias14.length}, minmax(0, 1fr))`,
                }}
              >
                {dias14.map((d) => {
                  const numDia = Number(d.fecha.slice(8, 10));
                  const esHoy = d.fecha === hoyStr;

                  return (
                    <div key={d.fecha} className="text-center">
                      <span
                        className={`text-[11px] tabular-nums block ${
                          esHoy ? "font-bold text-marca" : "text-tinta-suave"
                        }`}
                      >
                        {numDia}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
