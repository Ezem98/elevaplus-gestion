import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import type { RespuestaEmitirArca } from "@/lib/worker";

export type EtapaEmision = "emitiendo" | "generando_pdf" | "enviando_mail" | "exito" | "error";

interface ModalProgresoEmisionProps {
  abierto: boolean;
  etapa: EtapaEmision;
  clienteNombre: string;
  cantidadServicios: number;
  resultado?: RespuestaEmitirArca | null;
  error?: string | null;
  onCerrar: () => void;
  onVerFacturas: () => void;
}

export function ModalProgresoEmision({
  abierto,
  etapa,
  clienteNombre,
  cantidadServicios,
  resultado,
  error,
  onCerrar,
  onVerFacturas,
}: ModalProgresoEmisionProps) {
  if (!abierto) return null;

  const esCargando = etapa === "emitiendo" || etapa === "generando_pdf" || etapa === "enviando_mail";
  const esExito = etapa === "exito";
  const esError = etapa === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
      <Tarjeta className="max-w-md w-full p-6 space-y-6 shadow-2xl border-borde">
        {/* Encabezado */}
        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold text-tinta">
            {esExito
              ? "¡Factura emitida con éxito!"
              : esError
              ? "Error al emitir en ARCA"
              : "Emitiendo factura electrónica"}
          </h3>
          <p className="text-xs text-tinta-suave">
            Cliente: <span className="font-semibold text-tinta">{clienteNombre}</span> ({cantidadServicios}{" "}
            {cantidadServicios === 1 ? "servicio" : "servicios"})
          </p>
        </div>

        {/* Estado en progreso */}
        {esCargando && (
          <div className="py-6 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-marca" />
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium text-tinta">
                {etapa === "emitiendo" && "Solicitando CAE en ARCA..."}
                {etapa === "generando_pdf" && "Generando documento PDF y código QR..."}
                {etapa === "enviando_mail" && "Enviando factura por correo electrónico..."}
              </p>
              <p className="text-xs text-tinta-suave">
                Por favor, no cierres esta ventana mientras se procesa.
              </p>
            </div>
          </div>
        )}

        {/* Estado Éxito */}
        {esExito && resultado && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-emerald-500/10 p-3 border border-emerald-500/20">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>

            <div className="rounded-lg bg-fondo/80 p-4 border border-borde space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-xs text-tinta-suave font-medium">Comprobante</span>
                <span className="font-bold text-tinta tabular-nums">
                  Factura {resultado.tipo} {String(resultado.punto_venta).padStart(4, "0")}-
                  {String(resultado.numero).padStart(8, "0")}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-tinta-suave font-medium">CAE asignado</span>
                <span className="font-mono text-xs font-semibold text-tinta tabular-nums">
                  {resultado.cae}
                </span>
              </div>
              {resultado.cae_vencimiento && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-tinta-suave font-medium">Vencimiento CAE</span>
                  <span className="text-xs text-tinta tabular-nums">{resultado.cae_vencimiento}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Boton variante="secundario" onClick={onCerrar}>
                Cerrar
              </Boton>
              <Boton onClick={onVerFacturas}>
                Ver en Facturas
              </Boton>
            </div>
          </div>
        )}

        {/* Estado Error */}
        {esError && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-peligro-suave p-3 border border-peligro/20">
                <AlertTriangle className="h-10 w-10 text-peligro" />
              </div>
            </div>

            <div className="rounded-lg bg-peligro-suave/40 p-4 border border-peligro/20 text-sm space-y-1">
              <p className="font-semibold text-peligro">Motivo del rechazo:</p>
              <p className="text-xs text-tinta leading-relaxed">{error || "Error desconocido devuelto por ARCA."}</p>
            </div>

            <p className="text-xs text-tinta-suave text-center">
              Los servicios siguen en pendientes y no fueron modificados.
            </p>

            <div className="flex justify-end pt-2">
              <Boton variante="secundario" onClick={onCerrar}>
                Cerrar
              </Boton>
            </div>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
