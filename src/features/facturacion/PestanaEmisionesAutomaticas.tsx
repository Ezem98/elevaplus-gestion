import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Play, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/hooks/use-realtime";
import { correrLoteFacturacion } from "@/lib/worker";
import type { LoteEmision } from "@/lib/tipos";
import { formatearPesos, formatearFecha } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Aviso } from "@/components/ui/Aviso";

const MOTIVOS_DESCARTE: Record<string, string> = {
  sin_cuit: "Cliente Responsable Inscripto sin CUIT cargado",
  sin_condicion_iva: "Sin condición de IVA especificada",
  requiere_dni: "Consumidor final > $300.000 requiere DNI o CUIT",
  sin_monto: "Servicio con monto en cero o no definido",
  sin_iva_en_a: "Factura A con todos los servicios exentos",
  error_emision: "Error durante la autorización en ARCA",
};

interface PestanaEmisionesAutomaticasProps {
  esAdmin: boolean;
}

export function PestanaEmisionesAutomaticas({ esAdmin }: PestanaEmisionesAutomaticasProps) {
  const [lotes, setLotes] = useState<LoteEmision[]>([]);
  const [cargando, setCargando] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  const [mensajeCorrida, setMensajeCorrida] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);
  const [loteExpandido, setLoteExpandido] = useState<string | null>(null);

  const cargarLotes = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("lotes_emision")
      .select("*")
      .order("iniciado_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setLotes(data as unknown as LoteEmision[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarLotes();
  }, [cargarLotes]);

  // Suscribirse a cambios en tiempo real
  useRealtime(["lotes_emision"], () => {
    cargarLotes();
  });

  const handleCorrerAhora = async () => {
    if (!confirm("¿Deseás ejecutar la corrida de facturación automática ahora?")) {
      return;
    }

    setCorriendo(true);
    setMensajeCorrida(null);

    try {
      const res = await correrLoteFacturacion();
      if (!res.ok) {
        setMensajeCorrida({
          tipo: "error",
          texto: res.error || "Error al ejecutar el lote de facturación.",
        });
      } else {
        const cant = res.facturasEmitidas ?? 0;
        const obs = res.descartados?.length ?? 0;
        setMensajeCorrida({
          tipo: "exito",
          texto: `Lote completado: ${cant} factura(s) emitida(s) · ${obs} servicio(s) observados.`,
        });
      }
      await cargarLotes();
    } catch (err: any) {
      setMensajeCorrida({
        tipo: "error",
        texto: err?.message || "Ocurrió un error inesperado al disparar el lote.",
      });
    } finally {
      setCorriendo(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Barra superior con resumen y botón de corrida */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-superficie border border-borde">
        <div>
          <h2 className="text-base font-semibold text-tinta">Emisiones automáticas nocturnas</h2>
          <p className="text-xs text-tinta-suave mt-0.5">
            El sistema evalúa las políticas de facturación y emite automáticamente todas las noches a las 21:30 hs.
          </p>
        </div>

        {esAdmin && (
          <Boton
            type="button"
            onClick={handleCorrerAhora}
            disabled={corriendo}
            className="shrink-0"
          >
            {corriendo ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Corriendo lote…
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-4 w-4 fill-current" />
                Correr ahora
              </>
            )}
          </Boton>
        )}
      </div>

      {mensajeCorrida && (
        <Aviso variante={mensajeCorrida.tipo === "error" ? "peligro" : "info"}>
          {mensajeCorrida.texto}
        </Aviso>
      )}

      {/* Lista de corridas */}
      {cargando && lotes.length === 0 ? (
        <div className="py-12 text-center text-tinta-suave">Cargando corridas...</div>
      ) : lotes.length === 0 ? (
        <Tarjeta className="p-8 text-center text-tinta-suave">
          Aún no se registraron corridas del proceso de facturación automática.
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          {lotes.map((lote) => {
            const expandido = loteExpandido === lote.id;
            const tieneDescartados = lote.descartados && lote.descartados.length > 0;
            const esTope = lote.error === "tope_superado";
            const horaInicio = new Date(lote.iniciado_at).toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const esCron = lote.disparado_por === "cron";

            return (
              <Tarjeta key={lote.id} className="p-5 space-y-4 border-borde">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Fecha y disparador */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-base text-tinta">
                        {formatearFecha(lote.fecha)}
                      </span>
                      <span className="text-xs text-tinta-suave">({horaInicio} hs)</span>

                      {/* Pill de disparador */}
                      <span className="rounded-full bg-fondo border border-borde px-2.5 py-0.5 text-xs text-tinta-suave font-medium">
                        {esCron ? "Automático nocturno" : "Disparo manual"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-tinta-suave">
                      <span>
                        Emitidas:{" "}
                        <strong className="text-tinta font-semibold">
                          {lote.facturas_emitidas}
                        </strong>
                      </span>
                      <span>·</span>
                      <span>
                        Total:{" "}
                        <strong className="text-tinta font-semibold tabular-nums">
                          {formatearPesos(lote.monto_total)}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Estado del lote */}
                  <div className="flex items-center gap-3">
                    {lote.error ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-peligro-suave border border-peligro/20 px-3 py-1 text-xs font-semibold text-peligro">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {esTope ? "Tope diario superado" : `Error: ${lote.error}`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completado
                      </span>
                    )}

                    {tieneDescartados && (
                      <button
                        type="button"
                        onClick={() => setLoteExpandido(expandido ? null : lote.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-alerta hover:underline cursor-pointer ml-2"
                      >
                        {expandido ? (
                          <>
                            Ocultar {lote.descartados.length} descartados
                            <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            Ver {lote.descartados.length} descartados
                            <ChevronRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Desplegable de servicios y clientes descartados */}
                {expandido && tieneDescartados && (
                  <div className="mt-3 pt-3 border-t border-borde space-y-3 bg-fondo/50 p-4 rounded-lg">
                    <h4 className="text-xs font-semibold text-tinta uppercase tracking-wider">
                      Observaciones y servicios pendientes de revisión:
                    </h4>

                    <div className="divide-y divide-borde">
                      {lote.descartados.map((item, dIdx) => {
                        const motivoTexto =
                          MOTIVOS_DESCARTE[item.motivo || ""] || item.error || item.motivo || "No especificado";

                        return (
                          <div key={dIdx} className="py-2.5 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="font-semibold text-tinta">
                                {item.cliente_id ? (
                                  <Link
                                    to={`/clientes/${item.cliente_id}`}
                                    className="hover:text-marca hover:underline"
                                  >
                                    {item.cliente || "Cliente"}
                                  </Link>
                                ) : (
                                  item.cliente || "Cliente"
                                )}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-alerta">
                                <AlertCircle className="h-3.5 w-3.5" />
                                {motivoTexto}
                              </span>
                            </div>

                            {item.servicios && item.servicios.length > 0 && (
                              <div className="flex flex-wrap gap-2 pl-2">
                                {item.servicios.map((s) => (
                                  <Link
                                    key={s.id}
                                    to={`/servicios/${s.id}`}
                                    className="inline-flex items-center rounded border border-borde bg-superficie px-2 py-0.5 text-xs text-marca hover:underline"
                                  >
                                    #{s.numero} {s.descripcion ? `· ${s.descripcion}` : ""}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Tarjeta>
            );
          })}
        </div>
      )}
    </div>
  );
}
