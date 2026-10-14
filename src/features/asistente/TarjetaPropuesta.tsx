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
  const esServicioRealizado = prop.accion === "crear_servicio_realizado";
  const esPresupuesto = prop.accion === "crear_presupuesto";

  const sinChofer =
    !esCambioEstado &&
    !esPresupuesto &&
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
      state: {
        propuesta: {
          ...datos,
          ...(esServicioRealizado ? { estadoInicial: "realizado" } : {}),
        },
      },
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
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-marca">
            {esCambioEstado
              ? "Cambio de estado"
              : esServicioRealizado
                ? "Servicio ya realizado"
                : esPresupuesto
                  ? "Presupuesto"
                  : "Propuesta de servicio"}
          </span>
          {esServicioRealizado && (
            <span
              data-testid="badge-ya-realizado"
              className="text-[10px] font-bold uppercase tracking-wider bg-alerta-suave text-alerta px-2 py-0.5 rounded border border-alerta/30"
            >
              Ya realizado
            </span>
          )}
          {esPresupuesto && datos.es_prospecto && (
            <span
              data-testid="badge-prospecto"
              className="text-[10px] font-bold uppercase tracking-wider bg-marca-suave text-marca px-2 py-0.5 rounded border border-marca/30"
            >
              Prospecto
            </span>
          )}
        </div>
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
        {esPresupuesto ? (
          <div className="space-y-2.5 text-xs">
            {/* Cliente o Prospecto */}
            <div className="flex justify-between items-baseline py-0.5 border-b border-borde/40">
              <span className="text-tinta-suave">
                {datos.es_prospecto ? "Prospecto:" : "Cliente:"}
              </span>
              <span className="font-medium text-tinta text-right">
                {datos.cliente || datos.presupuesto?.prospecto_nombre || "Sin cliente"}
                {datos.es_prospecto && datos.presupuesto?.prospecto_telefono
                  ? ` · Tel: ${datos.presupuesto.prospecto_telefono}`
                  : ""}
              </span>
            </div>

            {/* Tabla de ítems */}
            {Array.isArray(datos.items) && datos.items.length > 0 && (
              <div className="overflow-x-auto rounded border border-borde/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-fondo text-tinta-suave border-b border-borde/60">
                    <tr>
                      <th className="py-1 px-2 font-medium">Descripción</th>
                      <th className="py-1 px-2 font-medium text-center">Cant.</th>
                      <th className="py-1 px-2 font-medium text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde/40 bg-superficie">
                    {datos.items.map((it: any, idx: number) => {
                      const cantTexto = it.alquiler?.cantidad
                        ? `${it.alquiler.cantidad} ${
                            it.alquiler.unidad === "dia"
                              ? it.alquiler.cantidad === 1 ? "día" : "días"
                              : it.alquiler.unidad === "mes"
                                ? it.alquiler.cantidad === 1 ? "mes" : "meses"
                                : it.alquiler.unidad || "u."
                          }`
                        : it.cantidad
                          ? `${it.cantidad} ${it.unidad || "u."}`
                          : "1";

                      const precioItem =
                        it.moneda === "USD"
                          ? formatearDolares(it.monto_moneda ?? it.precio ?? it.monto)
                          : formatearPesos(it.monto ?? it.precio);

                      return (
                        <tr key={idx} className="hover:bg-fondo/40">
                          <td className="py-1.5 px-2 font-medium text-tinta">
                            <div>{it.descripcion || it.tipo}</div>
                            {it.tipo === "traslado" && (it.origen || it.destino) && (
                              <div className="text-[11px] text-tinta-suave font-normal">
                                {it.origen || "—"} → {it.destino || "—"}
                                {it.ida_y_vuelta ? " (ida y vuelta)" : ""}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-center text-tinta-suave whitespace-nowrap">
                            {cantTexto}
                          </td>
                          <td className="py-1.5 px-2 text-right font-medium text-tinta whitespace-nowrap">
                            {precioItem}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totales por moneda */}
            <div className="flex flex-col gap-1 pt-1 border-t border-borde/40">
              {datos.totales?.ARS != null && (
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-tinta-suave">Total ARS:</span>
                  <span className="text-sm font-bold text-marca">
                    {formatearPesos(datos.totales.ARS)}
                  </span>
                </div>
              )}
              {datos.totales?.USD != null && (
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-tinta-suave">Total USD:</span>
                  <span className="text-sm font-bold text-marca">
                    {formatearDolares(datos.totales.USD)}
                  </span>
                </div>
              )}
            </div>

            {/* Validez */}
            <div className="flex justify-between items-baseline py-0.5 border-t border-borde/40 text-[11px]">
              <span className="text-tinta-suave">Validez:</span>
              <span className="font-medium text-tinta">
                {datos.validez_dias || datos.presupuesto?.validez_dias || 15} días
              </span>
            </div>

            {/* Condiciones si existen */}
            {(datos.condiciones || datos.presupuesto?.condiciones) && (
              <div className="flex justify-between items-baseline py-0.5 border-t border-borde/40 text-[11px]">
                <span className="text-tinta-suave">Condiciones:</span>
                <span className="font-medium text-tinta text-right">
                  {datos.condiciones || datos.presupuesto?.condiciones}
                </span>
              </div>
            )}
          </div>
        ) : esCambioEstado ? (
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
              <div
                className={`flex justify-between items-baseline py-0.5 border-b border-borde/40 ${
                  esServicioRealizado
                    ? "bg-alerta-suave/40 px-2 py-1 rounded"
                    : ""
                }`}
              >
                <span
                  className={
                    esServicioRealizado
                      ? "font-semibold text-alerta"
                      : "text-tinta-suave"
                  }
                >
                  {esServicioRealizado ? "Fecha (ya ejecutado):" : "Fecha y hora:"}
                </span>
                <span
                  className={
                    esServicioRealizado
                      ? "font-bold text-tinta"
                      : "font-medium text-tinta"
                  }
                >
                  {formatearFecha(datos.fecha_programada)}
                  {datos.hora_programada ? ` · ${datos.hora_programada} hs` : ""}
                  {esServicioRealizado && (
                    <span className="ml-1 text-[11px] font-medium text-alerta">
                      (pasada)
                    </span>
                  )}
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
                <span className="font-medium text-tinta-suave">
                  {esServicioRealizado ? "Precio:" : "Precio sugerido:"}
                </span>
                <span className="text-sm font-semibold text-marca">
                  {precioTexto}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Resumen textual si existe (solo para servicios y cambios de estado) */}
        {prop.resumen && !esPresupuesto && (
          <div className="rounded bg-fondo p-2 text-xs text-tinta whitespace-pre-line border border-borde/50">
            {prop.resumen}
          </div>
        )}

        {/* Advertencias */}
        {sinChofer && estado === "pendiente" && !esServicioRealizado && (
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
                : esServicioRealizado
                  ? "¡Servicio realizado registrado con éxito!"
                  : esPresupuesto
                    ? "¡Presupuesto creado con éxito!"
                    : "¡Servicio creado con éxito!"}
            </span>
            {esPresupuesto && prop.resultado_id ? (
              <Link
                to={`/presupuestos/${prop.resultado_id}`}
                className="inline-flex items-center gap-1 font-semibold text-ok underline hover:opacity-80"
              >
                Ver presupuesto <ExternalLink className="size-3.5" />
              </Link>
            ) : (prop.resultado_id || datos.servicio_id) ? (
              <Link
                to={`/servicios/${prop.resultado_id || datos.servicio_id}`}
                className="inline-flex items-center gap-1 font-semibold text-ok underline hover:opacity-80"
              >
                Ver servicio <ExternalLink className="size-3.5" />
              </Link>
            ) : null}
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
                : esServicioRealizado
                  ? "Ocurrió un error al registrar el servicio realizado."
                  : esPresupuesto
                    ? "Ocurrió un error al crear el presupuesto."
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

            {!esPresupuesto && (
              esCambioEstado ? (
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
              )
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
