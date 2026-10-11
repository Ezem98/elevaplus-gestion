import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Boton } from "@/components/ui/Boton";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Aviso } from "@/components/ui/Aviso";
import { ChipEstado } from "@/components/ui/Chip";
import type { AsistentePropuesta, EstadoServicio } from "@/lib/tipos";
import { formatearPesos, formatearDolares, formatearFecha } from "@/lib/formato";
import { confirmarPropuesta, descartarPropuesta } from "./rpc";
import { Check, ExternalLink, Trash2, Edit3, AlertCircle } from "lucide-react";

interface TarjetaPropuestaProps {
  propuesta: AsistentePropuesta;
  onActualizada?: (propuestaActualizada: AsistentePropuesta) => void;
}

export function TarjetaPropuesta({
  propuesta: propInicial,
  onActualizada,
}: TarjetaPropuestaProps) {
  const navigate = useNavigate();
  const [prop, setProp] = useState<AsistentePropuesta>(propInicial);
  const [procesando, setProcesando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const datos = (prop.datos || {}) as Record<string, any>;
  const estado = prop.estado;
  const esCambioEstado = prop.accion === "cambiar_estado";

  const sinChofer =
    !esCambioEstado &&
    (!datos.choferes ||
      !Array.isArray(datos.choferes) ||
      datos.choferes.length === 0);

  const handleConfirmar = async () => {
    if (procesando || estado !== "pendiente") return;
    setProcesando(true);
    setErrorLocal(null);

    try {
      const res = await confirmarPropuesta(prop.id);
      if (res.ok) {
        const actualizada: AsistentePropuesta = {
          ...prop,
          estado: "confirmada",
          resultado_id: res.resultado_id || null,
          resuelta_at: new Date().toISOString(),
        };
        setProp(actualizada);
        onActualizada?.(actualizada);
      } else if (res.estado === "vencida") {
        const actualizada: AsistentePropuesta = {
          ...prop,
          estado: "vencida",
          resuelta_at: new Date().toISOString(),
        };
        setProp(actualizada);
        onActualizada?.(actualizada);
      } else {
        const err = res.error || "No se pudo confirmar la propuesta.";
        setErrorLocal(err);
        const actualizada: AsistentePropuesta = {
          ...prop,
          estado: "fallida",
          error: err,
          resuelta_at: new Date().toISOString(),
        };
        setProp(actualizada);
        onActualizada?.(actualizada);
      }
    } catch (err: any) {
      setErrorLocal(err?.message || "Error al confirmar la propuesta.");
    } finally {
      setProcesando(false);
    }
  };

  const handleDescartar = async () => {
    if (procesando || estado !== "pendiente") return;
    setProcesando(true);
    setErrorLocal(null);

    try {
      const res = await descartarPropuesta(prop.id);
      if (res.ok) {
        const actualizada: AsistentePropuesta = {
          ...prop,
          estado: "descartada",
          resuelta_at: new Date().toISOString(),
        };
        setProp(actualizada);
        onActualizada?.(actualizada);
      } else {
        setErrorLocal(res.error || "No se pudo descartar la propuesta.");
      }
    } catch (err: any) {
      setErrorLocal(err?.message || "Error al descartar la propuesta.");
    } finally {
      setProcesando(false);
    }
  };

  const handleRevisar = () => {
    navigate("/servicios/nuevo", {
      state: { propuesta: datos },
    });
  };

  // Precio a mostrar (solo para alta de servicio)
  let precioTexto: string | null = null;
  if (!esCambioEstado) {
    if (datos.moneda === "USD" && (datos.monto_moneda != null || datos.monto != null)) {
      precioTexto = formatearDolares(datos.monto_moneda ?? datos.monto);
    } else if (datos.monto != null) {
      precioTexto = formatearPesos(datos.monto);
    }
  }

  return (
    <Tarjeta
      data-testid="tarjeta-propuesta"
      className="mt-2 overflow-hidden border-marca/30 bg-superficie shadow-sm"
    >
      {/* Encabezado de la tarjeta */}
      <div className="border-b border-borde bg-marca-suave/40 px-3.5 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-marca">
          {esCambioEstado ? "Cambio de estado" : "Propuesta de servicio"}
        </span>
        <span
          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
            estado === "confirmada"
              ? "bg-ok-suave text-ok"
              : estado === "descartada"
                ? "bg-fondo text-tinta-suave"
                : estado === "vencida"
                  ? "bg-alerta-suave text-alerta"
                  : estado === "fallida"
                    ? "bg-peligro-suave text-peligro"
                    : "bg-marca text-white"
          }`}
        >
          {estado === "confirmada"
            ? "Confirmada"
            : estado === "descartada"
              ? "Descartada"
              : estado === "vencida"
                ? "Vencida"
                : estado === "fallida"
                  ? "Fallida"
                  : "Pendiente"}
        </span>
      </div>

      <div className="p-3.5 space-y-3 text-sm">
        {/* Pares etiqueta/valor según tipo de propuesta */}
        {esCambioEstado ? (
          <div className="grid grid-cols-1 gap-1.5 text-xs">
            <div className="flex justify-between items-baseline py-0.5 border-b border-borde/40">
              <span className="text-tinta-suave">Servicio:</span>
              <span className="font-medium text-tinta text-right">
                {datos.numero ? `#${datos.numero} · ` : ""}
                {datos.cliente || "Sin cliente"}
                {datos.fecha ? ` · ${formatearFecha(datos.fecha)}` : ""}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-borde/40">
              <span className="text-tinta-suave">Estado:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {datos.estado_actual && (
                  <ChipEstado estado={datos.estado_actual as EstadoServicio} />
                )}
                <span className="text-tinta-suave text-xs">→</span>
                {datos.nuevo_estado && (
                  <ChipEstado estado={datos.nuevo_estado as EstadoServicio} />
                )}
              </div>
            </div>

            {datos.nota && (
              <div className="flex justify-between items-baseline py-0.5 border-b border-borde/40">
                <span className="text-tinta-suave">Nota:</span>
                <span className="font-medium text-tinta text-right">{datos.nota}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 text-xs">
            {datos.tipo && (
              <div className="flex justify-between items-baseline py-0.5 border-b border-borde/40">
                <span className="text-tinta-suave">Tipo:</span>
                <span className="font-medium text-tinta capitalize">
                  {String(datos.tipo).replace("_", " ")}
                </span>
              </div>
            )}

            {datos.fecha_programada && (
              <div className="flex justify-between items-baseline py-0.5 border-b border-borde/40">
                <span className="text-tinta-suave">Fecha y hora:</span>
                <span className="font-medium text-tinta">
                  {formatearFecha(datos.fecha_programada)}
                  {datos.hora_programada ? ` · ${datos.hora_programada} hs` : ""}
                </span>
              </div>
            )}

            {datos.tipo === "traslado" && (datos.origen || datos.destino) && (
              <div className="flex justify-between items-baseline py-0.5 border-b border-borde/40">
                <span className="text-tinta-suave">Recorrido:</span>
                <span className="font-medium text-tinta text-right">
                  {datos.origen || "—"} → {datos.destino || "—"}
                  {datos.ida_y_vuelta ? " (ida y vuelta)" : " (solo ida)"}
                  {datos.km ? `, ${datos.km} km` : ""}
                </span>
              </div>
            )}

            {(datos.direccion_trabajo || datos.localidad_trabajo) && (
              <div className="flex justify-between items-baseline py-0.5 border-b border-borde/40">
                <span className="text-tinta-suave">Dirección:</span>
                <span className="font-medium text-tinta text-right">
                  {datos.direccion_trabajo || ""}
                  {datos.localidad_trabajo ? ` (${datos.localidad_trabajo})` : ""}
                </span>
              </div>
            )}

            {datos.trabajo_a_realizar && (
              <div className="flex justify-between items-baseline py-0.5 border-b border-borde/40">
                <span className="text-tinta-suave">Trabajo:</span>
                <span className="font-medium text-tinta text-right">
                  {datos.trabajo_a_realizar}
                </span>
              </div>
            )}

            {precioTexto && (
              <div className="flex justify-between items-baseline pt-1">
                <span className="font-medium text-tinta-suave">Precio sugerido:</span>
                <span className="text-sm font-semibold text-marca">
                  {precioTexto}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Resumen textual si existe */}
        {prop.resumen && (
          <div className="rounded bg-fondo p-2 text-xs text-tinta whitespace-pre-line border border-borde/50">
            {prop.resumen}
          </div>
        )}

        {/* Advertencias */}
        {sinChofer && estado === "pendiente" && (
          <div className="flex items-center gap-1.5 rounded-md bg-alerta-suave px-2.5 py-1.5 text-xs text-alerta">
            <AlertCircle className="size-4 shrink-0" />
            <span>Sin chofer asignado (los choferes no lo van a ver hasta asignarlo).</span>
          </div>
        )}

        {/* Mensajes según estado */}
        {estado === "confirmada" && (
          <Aviso variante="exito" className="flex items-center justify-between text-xs">
            <span>
              {esCambioEstado
                ? "¡Estado actualizado con éxito!"
                : "¡Servicio creado con éxito!"}
            </span>
            {(prop.resultado_id || datos.servicio_id) && (
              <Link
                to={`/servicios/${prop.resultado_id || datos.servicio_id}`}
                className="inline-flex items-center gap-1 font-semibold text-ok underline hover:opacity-80"
              >
                Ver servicio <ExternalLink className="size-3.5" />
              </Link>
            )}
          </Aviso>
        )}

        {estado === "vencida" && (
          <Aviso variante="alerta" className="text-xs">
            Esta propuesta venció; pedímela de nuevo.
          </Aviso>
        )}

        {estado === "fallida" && (
          <Aviso variante="peligro" className="text-xs">
            {errorLocal ||
              prop.error ||
              (esCambioEstado
                ? "Ocurrió un error al cambiar el estado del servicio."
                : "Ocurrió un error al crear el servicio.")}
          </Aviso>
        )}

        {estado === "descartada" && (
          <Aviso variante="neutro" className="text-xs text-tinta-suave">
            Propuesta descartada.
          </Aviso>
        )}

        {/* Botones de acción (solo si estado es 'pendiente') */}
        {estado === "pendiente" && (
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
            <Boton
              type="button"
              variante="primario"
              tamano="md"
              className="flex-1 text-xs"
              onClick={handleConfirmar}
              disabled={procesando}
            >
              <Check className="size-4" />
              {procesando ? "Confirmando…" : "Confirmar"}
            </Boton>

            {esCambioEstado ? (
              datos.servicio_id && (
                <Link
                  to={`/servicios/${datos.servicio_id}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-borde bg-superficie px-3 py-2 text-xs font-medium text-tinta hover:bg-fondo transition-colors flex-1"
                >
                  <ExternalLink className="size-4" />
                  Ver servicio
                </Link>
              )
            ) : (
              <Boton
                type="button"
                variante="secundario"
                tamano="md"
                className="flex-1 text-xs"
                onClick={handleRevisar}
                disabled={procesando}
              >
                <Edit3 className="size-4" />
                Revisar en el formulario
              </Boton>
            )}

            <Boton
              type="button"
              variante="fantasma"
              tamano="md"
              className="text-xs text-tinta-suave hover:text-peligro"
              onClick={handleDescartar}
              disabled={procesando}
              title="Descartar propuesta"
            >
              <Trash2 className="size-4" />
              Descartar
            </Boton>
          </div>
        )}
      </div>
    </Tarjeta>
  );
}
