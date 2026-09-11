import { useEffect, useState } from "react";
import { X, CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ArcaLog } from "@/lib/tipos";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";

interface ModalLogArcaProps {
  facturaId: string | null;
  abierto: boolean;
  onCerrar: () => void;
}

export function ModalLogArca({ facturaId, abierto, onCerrar }: ModalLogArcaProps) {
  const [logs, setLogs] = useState<ArcaLog[]>([]);
  const [cargando, setCargando] = useState(false);
  const [expandidoId, setExpandidoId] = useState<number | null>(null);

  useEffect(() => {
    if (!abierto || !facturaId) return;

    setCargando(true);
    supabase
      .from("arca_log")
      .select("*")
      .eq("factura_id", facturaId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setLogs(data as unknown as ArcaLog[]);
        } else {
          setLogs([]);
        }
        setCargando(false);
      });
  }, [abierto, facturaId]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
      <Tarjeta className="max-w-2xl w-full max-h-[85vh] flex flex-col p-6 shadow-2xl border-borde">
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-borde">
          <div>
            <h3 className="text-lg font-bold text-tinta">Registro de llamadas ARCA</h3>
            <p className="text-xs text-tinta-suave">
              Historial de peticiones y respuestas con el Web Service oficial (WSFEv1)
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-tinta-suave hover:text-tinta p-1 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {cargando ? (
            <p className="text-center py-8 text-sm text-tinta-suave">Cargando registros...</p>
          ) : logs.length === 0 ? (
            <p className="text-center py-8 text-sm text-tinta-suave">
              No se registraron llamadas a ARCA para este comprobante (emisión manual o previa).
            </p>
          ) : (
            logs.map((log) => {
              const estaExpandido = expandidoId === log.id;
              return (
                <div
                  key={log.id}
                  className="rounded-lg border border-borde bg-fondo/50 overflow-hidden text-sm"
                >
                  <div
                    className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-fondo transition-colors"
                    onClick={() => setExpandidoId(estaExpandido ? null : log.id)}
                  >
                    <div className="flex items-center gap-2.5">
                      {log.exito ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-peligro shrink-0" />
                      )}
                      <div>
                        <span className="font-semibold text-tinta font-mono text-xs">
                          {log.accion}
                        </span>
                        <span className="ml-2 text-xs text-tinta-suave">
                          ({log.duracion_ms} ms · {log.ambiente})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-tinta-suave">
                      <span>{new Date(log.created_at).toLocaleTimeString("es-AR")}</span>
                      {estaExpandido ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                  </div>

                  {estaExpandido && (
                    <div className="p-3 border-t border-borde bg-superficie space-y-3 text-xs">
                      <div>
                        <span className="font-semibold text-tinta block mb-1">Request:</span>
                        <pre className="p-2.5 rounded bg-fondo font-mono overflow-x-auto text-[11px] text-tinta border border-borde">
                          {JSON.stringify(log.request, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <span className="font-semibold text-tinta block mb-1">Response:</span>
                        <pre className="p-2.5 rounded bg-fondo font-mono overflow-x-auto text-[11px] text-tinta border border-borde">
                          {JSON.stringify(log.response, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pie */}
        <div className="pt-3 border-t border-borde flex justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cerrar
          </Boton>
        </div>
      </Tarjeta>
    </div>
  );
}
