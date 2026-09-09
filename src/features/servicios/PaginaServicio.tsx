import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Servicio, EstadoServicio, ServicioChofer, TipoMaquina, MedioPago, EstadoCobro, Alquiler, Empresa } from "@/lib/tipos";
import { ETIQUETA_TIPO, ETIQUETA_TIPO_MAQUINA, ETIQUETA_MEDIO_PAGO, formatearUnidadPlural } from "@/lib/tipos";
import { formatearPesos, formatearFecha, formatearNumeroFactura, proximoCuartoDeHora } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipEstado } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/Boton";
import { Entrada, Etiqueta, Selector } from "@/components/ui/Campo";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { LineaTiempo, type EventoLineaTiempo } from "@/components/ui/LineaTiempo";
import { FormularioCobro } from "@/features/cobros/FormularioCobro";
import { TarjetaPresupuesto } from "@/features/presupuestos/TarjetaPresupuesto";

interface CobroAplicadoItem {
  monto: number;
  cobros: {
    fecha: string;
    medio: MedioPago;
    estado: EstadoCobro;
    referencia: string | null;
  } | null;
}

interface AdjuntoItem {
  id: string;
  storage_path: string;
  tipo: string;
  created_at: string;
  urlFirmada: string;
  nombreArchivo: string;
  esImagen: boolean;
}

function esExtensionImagen(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"].includes(extension);
}

function obtenerNombreArchivo(storagePath: string): string {
  const base = storagePath.split("/").pop() ?? storagePath;
  return base.replace(/^\d+-/, "") || base;
}

function formatearDuracion(inicioIso: string, finIso: string): string {
  const inicio = new Date(inicioIso).getTime();
  const fin = new Date(finIso).getTime();
  const diffMin = Math.max(0, Math.round((fin - inicio) / (1000 * 60)));
  const horas = Math.floor(diffMin / 60);
  const min = diffMin % 60;

  if (horas === 0) {
    return `${min} min`;
  }
  if (min === 0) {
    return `${horas} h`;
  }
  return `${horas} h ${min} min`;
}

export function PaginaServicio() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();

  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [eventos, setEventos] = useState<EventoLineaTiempo[]>([]);
  const [choferes, setChoferes] = useState<ServicioChofer[]>([]);
  const [adjuntos, setAdjuntos] = useState<AdjuntoItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorEstado, setErrorEstado] = useState<string | null>(null);

  const [mostrarProgramar, setMostrarProgramar] = useState(false);
  const [guardandoProg, setGuardandoProg] = useState(false);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [cobrosAplicados, setCobrosAplicados] = useState<CobroAplicadoItem[]>([]);
  const [alquiler, setAlquiler] = useState<Alquiler | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  const [fechaProg, setFechaProg] = useState("");
  const [horaProg, setHoraProg] = useState("");
  const [vehiculoId, setVehiculoId] = useState("");
  const [maquinaId, setMaquinaId] = useState("");
  const [choferesSeleccionados, setChoferesSeleccionados] = useState<string[]>([]);

  const [listaVehiculos, setListaVehiculos] = useState<{ id: string; nombre: string }[]>([]);
  const [listaMaquinas, setListaMaquinas] = useState<{ id: string; codigo_interno: string | null; tipo: TipoMaquina }[]>([]);
  const [listaChoferes, setListaChoferes] = useState<{ id: string; nombre: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subiendoArchivos, setSubiendoArchivos] = useState(false);
  const [errorAdjuntos, setErrorAdjuntos] = useState<string | null>(null);

  const cargarAdjuntos = useCallback(async (servicioId: string) => {
    const { data, error } = await supabase
      .from("adjuntos")
      .select("*")
      .eq("servicio_id", servicioId)
      .order("created_at", { ascending: true });

    if (error || !data) return [];

    const items: AdjuntoItem[] = await Promise.all(
      data.map(async (a: any) => {
        const { data: urlData } = await supabase.storage
          .from("adjuntos")
          .createSignedUrl(a.storage_path, 3600);

        const nombre = obtenerNombreArchivo(a.storage_path);
        return {
          id: a.id,
          storage_path: a.storage_path,
          tipo: a.tipo,
          created_at: a.created_at,
          urlFirmada: urlData?.signedUrl ?? "",
          nombreArchivo: nombre,
          esImagen: esExtensionImagen(a.storage_path),
        };
      })
    );

    return items;
  }, []);

  const cargarDatos = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    const [
      { data: sData, error: sError },
      { data: eData },
      { data: scData },
      { data: caData },
      { data: alqData },
      { data: empData },
      adjuntosLista,
    ] = await Promise.all([
      supabase
        .from("servicios")
        .select("*, clientes(nombre, cuit, condicion_iva, telefono, email, direccion, localidad), vehiculos(nombre), maquinas(codigo_interno, tipo), facturas(id, tipo, punto_venta, numero, fecha)")
        .eq("id", id)
        .single(),
      supabase
        .from("servicio_eventos")
        .select("*, perfiles(nombre)")
        .eq("servicio_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("servicio_choferes")
        .select("chofer_id, perfiles(nombre)")
        .eq("servicio_id", id),
      supabase
        .from("cobro_aplicaciones")
        .select("monto, cobros(fecha, medio, estado, referencia)")
        .eq("servicio_id", id),
      supabase
        .from("alquileres")
        .select("*")
        .eq("servicio_id", id)
        .maybeSingle(),
      supabase
        .from("empresa")
        .select("*")
        .eq("id", 1)
        .maybeSingle(),
      cargarAdjuntos(id),
    ]);

    if (sError || !sData) {
      setServicio(null);
      setCargando(false);
      return;
    }

    setServicio(sData as Servicio);
    setEmpresa((empData as Empresa) ?? null);
    setAlquiler((alqData as Alquiler) ?? null);
    setEventos(
      (eData ?? []).map((e: any) => ({
        id: e.id,
        estado_nuevo: e.estado_nuevo,
        created_at: e.created_at,
        nombre_usuario: e.perfiles?.nombre ?? null,
        nota: e.nota ?? null,
      }))
    );
    setChoferes((scData as unknown as ServicioChofer[]) ?? []);
    setCobrosAplicados((caData as any) ?? []);
    setAdjuntos(adjuntosLista);
    setCargando(false);
  }, [id, cargarAdjuntos]);


  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    Promise.all([
      supabase
        .from("vehiculos")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre"),
      supabase
        .from("maquinas")
        .select("id, codigo_interno, tipo")
        .eq("activo", true)
        .order("codigo_interno"),
      supabase
        .from("perfiles")
        .select("id, nombre")
        .eq("rol", "chofer")
        .eq("activo", true)
        .order("nombre"),
    ]).then(([vRes, mRes, cRes]) => {
      setListaVehiculos(vRes.data ?? []);
      setListaMaquinas((mRes.data as any) ?? []);
      setListaChoferes(cRes.data ?? []);
    });
  }, []);

  const abrirProgramar = () => {
    if (!servicio) return;
    if (servicio.fecha_programada) {
      setFechaProg(servicio.fecha_programada);
      setHoraProg(servicio.hora_programada ? servicio.hora_programada.slice(0, 5) : "");
    } else {
      setFechaProg(new Date().toISOString().slice(0, 10));
      setHoraProg(proximoCuartoDeHora(new Date()));
    }
    setVehiculoId(servicio.vehiculo_id ?? "");
    setMaquinaId(servicio.maquina_id ?? "");
    setChoferesSeleccionados(choferes.map((c) => c.chofer_id));
    setMostrarProgramar(true);
  };

  const toggleChofer = (choferId: string) => {
    setChoferesSeleccionados((prev) =>
      prev.includes(choferId) ? prev.filter((cid) => cid !== choferId) : [...prev, choferId]
    );
  };

  const handleConfirmarProgramacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!servicio || !fechaProg) return;

    setGuardandoProg(true);
    setErrorEstado(null);

    try {
      const { error: errServicio } = await supabase
        .from("servicios")
        .update({
          fecha_programada: fechaProg,
          hora_programada: horaProg || null,
          vehiculo_id: vehiculoId || null,
          maquina_id: maquinaId || null,
        })
        .eq("id", servicio.id);

      if (errServicio) throw errServicio;

      const { error: errDelete } = await supabase
        .from("servicio_choferes")
        .delete()
        .eq("servicio_id", servicio.id);

      if (errDelete) throw errDelete;

      if (choferesSeleccionados.length > 0) {
        const { error: errInsert } = await supabase
          .from("servicio_choferes")
          .insert(
            choferesSeleccionados.map((chofer_id) => ({
              servicio_id: servicio.id,
              chofer_id,
            }))
          );

        if (errInsert) throw errInsert;
      }

      if (servicio.estado === "aceptado") {
        const { error: errRpc } = await supabase.rpc("cambiar_estado", {
          p_servicio_id: servicio.id,
          p_nuevo: "programado",
          p_nota: `Programado para ${fechaProg}`,
        });
        if (errRpc) throw errRpc;
      }

      setMostrarProgramar(false);
      await cargarDatos();
    } catch (err: any) {
      setErrorEstado("No se pudo programar el servicio. Probá de nuevo.");
    } finally {
      setGuardandoProg(false);
    }
  };

  const ejecutarCambioEstado = async (nuevoEstado: EstadoServicio, nota?: string | null) => {
    if (!servicio) return;
    setErrorEstado(null);
    const { error } = await supabase.rpc("cambiar_estado", {
      p_servicio_id: servicio.id,
      p_nuevo: nuevoEstado,
      p_nota: nota ?? null,
    });

    if (error) {
      setErrorEstado("No se pudo cambiar el estado. Probá de nuevo.");
      return;
    }

    await cargarDatos();
  };

  const handleSeleccionarArchivos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !servicio) return;

    const usuarioId = session?.user?.id;
    if (!usuarioId) {
      setErrorAdjuntos("Debés iniciar sesión para subir adjuntos.");
      return;
    }

    setSubiendoArchivos(true);
    setErrorAdjuntos(null);

    try {
      for (const file of Array.from(files)) {
        const nombreSaneado = file.name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9._-]/g, "");
        const storagePath = `servicios/${servicio.id}/${Date.now()}-${nombreSaneado}`;

        const { error: uploadError } = await supabase.storage
          .from("adjuntos")
          .upload(storagePath, file);

        if (uploadError) throw uploadError;

        const tipo = file.name.toLowerCase().includes("remito") ? "remito" : "foto";

        const { error: insertError } = await supabase.from("adjuntos").insert({
          servicio_id: servicio.id,
          tipo,
          storage_path: storagePath,
          subido_por: usuarioId,
        });

        if (insertError) throw insertError;
      }

      const nuevosAdjuntos = await cargarAdjuntos(servicio.id);
      setAdjuntos(nuevosAdjuntos);
    } catch (err: any) {
      setErrorAdjuntos("No se pudieron subir los archivos. Probá de nuevo.");
    } finally {
      setSubiendoArchivos(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (cargando) {
    return (
      <div className="py-12 text-center text-tinta-suave">
        Cargando servicio...
      </div>
    );
  }

  if (!servicio) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-tinta-suave">Servicio no encontrado.</p>
        <Link to="/servicios">
          <Boton variante="secundario">Volver a servicios</Boton>
        </Link>
      </div>
    );
  }

  let fechaTexto = "—";
  if (servicio.fecha_programada) {
    fechaTexto = formatearFecha(servicio.fecha_programada);
    if (servicio.hora_programada) {
      fechaTexto += ` ${servicio.hora_programada.slice(0, 5)}`;
    }
  }

  let maquinaTexto = "—";
  if (servicio.maquinas) {
    const partes: string[] = [];
    if (servicio.maquinas.codigo_interno) {
      partes.push(servicio.maquinas.codigo_interno);
    }
    if (servicio.maquinas.tipo) {
      partes.push(ETIQUETA_TIPO_MAQUINA[servicio.maquinas.tipo] ?? servicio.maquinas.tipo);
    }
    maquinaTexto = partes.join(" · ") || "—";
  }

  const choferesTexto =
    choferes.length > 0
      ? choferes
          .map((c) => {
            if (!c.perfiles) return null;
            return Array.isArray(c.perfiles) ? c.perfiles[0]?.nombre : c.perfiles.nombre;
          })
          .filter(Boolean)
          .join(", ") || "—"
      : "—";

  const kmTexto =
    servicio.km != null
      ? `${servicio.km} km${servicio.ida_y_vuelta ? " (ida y vuelta)" : ""}`
      : "—";

  const monto = Number(servicio.monto) || 0;
  const cobrado = Number(servicio.monto_cobrado) || 0;

  const mostrarAvisoVencimiento = Boolean(
    servicio.tipo === "alquiler_periodo" &&
    servicio.estado === "en_curso" &&
    alquiler?.fecha_hasta &&
    (() => {
      const partes = alquiler.fecha_hasta.split("-").map(Number);
      if (partes.length !== 3) return false;
      const [y, m, d] = partes;
      const hastaUtc = Date.UTC(y, m - 1, d);
      const ahora = new Date();
      const hoyUtc = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      const diffDias = Math.round((hastaUtc - hoyUtc) / (1000 * 60 * 60 * 24));
      return diffDias <= (alquiler.alertar_dias_antes ?? 5);
    })()
  );

  const fechaHastaDdMm = alquiler?.fecha_hasta
    ? `${alquiler.fecha_hasta.split("-")[2]}/${alquiler.fecha_hasta.split("-")[1]}`
    : "";

  let cobroPillTexto = "Pendiente de cobro";
  let cobroPillClase = "bg-alerta-suave text-alerta";
  let cobroColor = "text-alerta";

  if (cobrado === 0) {
    cobroPillTexto = "Pendiente de cobro";
    cobroPillClase = "bg-alerta-suave text-alerta";
    cobroColor = "text-alerta";
  } else if (monto > 0 && cobrado < monto) {
    cobroPillTexto = "Cobrado parcial";
    cobroPillClase = "bg-alerta-suave text-alerta";
    cobroColor = "text-alerta";
  } else {
    cobroPillTexto = "Cobrado";
    cobroPillClase = "bg-ok-suave text-ok";
    cobroColor = "text-ok";
  }

  return (
    <div className="space-y-6">
      {/* Encabezado con volver a Servicios */}
      <EncabezadoPagina
        volverA="/servicios"
        titulo={
          <div className="flex flex-wrap items-center gap-3">
            <span>Servicio #{servicio.numero}</span>
            <ChipEstado estado={servicio.estado} />
            {servicio.no_facturable && (
              <span className="rounded-full bg-fondo px-2.5 py-0.5 text-xs font-medium text-tinta-suave border border-borde">
                No se factura
              </span>
            )}
          </div>
        }
        subtitulo={
          <>
            {servicio.cliente_id ? (
              <Link to={`/clientes/${servicio.cliente_id}`} className="hover:underline text-tinta font-medium">
                {servicio.clientes?.nombre ?? "—"}
              </Link>
            ) : (
              <span>{servicio.clientes?.nombre ?? "—"}</span>
            )}
            {" · "}
            {ETIQUETA_TIPO[servicio.tipo] ?? servicio.tipo}
          </>
        }
      />

      {servicio.no_planificado && (
        <Aviso variante="alerta">
          Cargado por el chofer en la calle. Completá cliente y monto.
        </Aviso>
      )}
      {mostrarAvisoVencimiento && (
        <Aviso variante="alerta">
          Este alquiler vence el {fechaHastaDdMm}. ¿Renovar?
        </Aviso>
      )}

      {/* Formulario inline Registrar cobro */}
      {mostrarCobro && (
        <FormularioCobro
          clienteId={servicio.cliente_id}
          servicios={[
            {
              id: servicio.id,
              numero: servicio.numero,
              descripcion: servicio.descripcion,
              fecha_programada: servicio.fecha_programada,
              monto: servicio.monto,
              monto_cobrado: servicio.monto_cobrado,
            },
          ]}
          onGuardado={() => {
            setMostrarCobro(false);
            cargarDatos();
          }}
          onCancelar={() => setMostrarCobro(false)}
        />
      )}

      {/* Formulario inline Programar */}
      {mostrarProgramar && (

        <Tarjeta className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-tinta">Programar servicio</h2>
            <button
              type="button"
              onClick={() => setMostrarProgramar(false)}
              className="text-xs text-tinta-suave hover:text-tinta"
            >
              Cerrar
            </button>
          </div>
          <form onSubmit={handleConfirmarProgramacion} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Etiqueta htmlFor="fecha_prog">Fecha</Etiqueta>
                <Entrada
                  id="fecha_prog"
                  type="date"
                  required
                  value={fechaProg}
                  onChange={(e) => setFechaProg(e.target.value)}
                />
              </div>
              <div>
                <Etiqueta htmlFor="hora_prog">Hora</Etiqueta>
                <Entrada
                  id="hora_prog"
                  type="time"
                  value={horaProg}
                  onChange={(e) => setHoraProg(e.target.value)}
                />
              </div>
              <div>
                <Etiqueta htmlFor="vehiculo_prog">Vehículo</Etiqueta>
                <Selector
                  id="vehiculo_prog"
                  value={vehiculoId}
                  onChange={(e) => setVehiculoId(e.target.value)}
                >
                  <option value="">Sin vehículo</option>
                  {listaVehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
                </Selector>
              </div>
              <div>
                <Etiqueta htmlFor="maquina_prog">Máquina</Etiqueta>
                <Selector
                  id="maquina_prog"
                  value={maquinaId}
                  onChange={(e) => setMaquinaId(e.target.value)}
                >
                  <option value="">Sin máquina</option>
                  {listaMaquinas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.codigo_interno ? `${m.codigo_interno} · ` : ""}
                      {ETIQUETA_TIPO_MAQUINA[m.tipo] ?? m.tipo}
                    </option>
                  ))}
                </Selector>
              </div>
            </div>

            <div>
              <Etiqueta>Choferes</Etiqueta>
              {listaChoferes.length === 0 ? (
                <p className="text-xs text-tinta-suave">No hay choferes disponibles.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {listaChoferes.map((ch) => {
                    const seleccionado = choferesSeleccionados.includes(ch.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleChofer(ch.id)}
                        aria-pressed={seleccionado}
                        className={`h-10 px-3 rounded-md border text-sm font-medium transition-colors text-center ${
                          seleccionado
                            ? "border-marca bg-marca-suave text-marca"
                            : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                        }`}
                      >
                        {ch.nombre}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-20 -mx-4 border-t border-borde bg-superficie p-3 flex flex-wrap items-center justify-end gap-2 md:static md:mx-0 md:bg-transparent md:p-0 md:pt-2 md:border-t-0">
              <Boton type="submit" disabled={guardandoProg}>
                {guardandoProg ? "Guardando..." : "Confirmar programación"}
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                onClick={() => setMostrarProgramar(false)}
                disabled={guardandoProg}
              >
                Cancelar
              </Boton>
            </div>
          </form>
        </Tarjeta>
      )}

      {/* Dos columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Columna izquierda: Datos y Notas */}
        <div className="space-y-6">
          <Tarjeta className="p-5 space-y-4">
            {/* Encabezado con 'Datos del servicio' y 'Registrado el...' */}
            <div className="flex items-center justify-between pb-3 border-b border-borde">
              <h2 className="text-base font-semibold text-tinta">Datos del servicio</h2>
              <span className="text-xs text-tinta-suave">
                Registrado el {formatearFecha(servicio.created_at)}
              </span>
            </div>

            {/* Grilla de datos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {/* Recorrido ocupando 2 columnas */}
              <div className="md:col-span-2">
                <span className="text-xs font-medium text-tinta-suave block">Recorrido</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-tinta">
                  {servicio.origen && servicio.destino ? (
                    <>
                      <span className="font-medium">{servicio.origen}</span>
                      <ArrowRight className="size-4 text-tinta-suave shrink-0" />
                      <span className="font-medium">{servicio.destino}</span>
                    </>
                  ) : servicio.origen ? (
                    <span className="font-medium">{servicio.origen}</span>
                  ) : servicio.destino ? (
                    <span className="font-medium">{servicio.destino}</span>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-tinta-suave block">Fecha programada</span>
                <div className="text-tinta font-medium mt-0.5">{fechaTexto}</div>
              </div>

              {servicio.fecha_inicio && servicio.fecha_fin && (
                <div>
                  <span className="text-xs font-medium text-tinta-suave block">Duración</span>
                  <div className="text-tinta font-medium mt-0.5">
                    {formatearDuracion(servicio.fecha_inicio, servicio.fecha_fin)}
                  </div>
                </div>
              )}

              <div>
                <span className="text-xs font-medium text-tinta-suave block">Carga</span>
                <div className="text-tinta font-medium mt-0.5">{servicio.carga || "—"}</div>
              </div>

              <div>
                <span className="text-xs font-medium text-tinta-suave block">Km</span>
                <div className="text-tinta font-medium mt-0.5">{kmTexto}</div>
              </div>

              <div>
                <span className="text-xs font-medium text-tinta-suave block">Vehículo</span>
                <div className="text-tinta font-medium mt-0.5">{servicio.vehiculos?.nombre || "—"}</div>
              </div>

              <div>
                <span className="text-xs font-medium text-tinta-suave block">Máquina</span>
                <div className="text-tinta font-medium mt-0.5">{maquinaTexto}</div>
              </div>

              <div>
                <span className="text-xs font-medium text-tinta-suave block">Choferes</span>
                <div className="text-tinta font-medium mt-0.5">{choferesTexto}</div>
              </div>

              <div>
                <span className="text-xs font-medium text-tinta-suave block">Remito</span>
                <div className="text-tinta font-medium mt-0.5 tabular-nums">{servicio.remito || "—"}</div>
              </div>

              <div>
                <span className="text-xs font-medium text-tinta-suave block">Orden de compra</span>
                <div className="text-tinta font-medium mt-0.5 tabular-nums">{servicio.orden_compra || "—"}</div>
              </div>

              {servicio.factura_id && (
                <div>
                  <span className="text-xs font-medium text-tinta-suave block">Factura</span>
                  <div className="text-tinta font-medium mt-0.5">
                    <Link
                      to="/facturacion?tab=facturas"
                      className="text-marca hover:underline"
                    >
                      Factura:{" "}
                      {servicio.facturas
                        ? `${formatearNumeroFactura(
                            servicio.facturas.tipo,
                            servicio.facturas.punto_venta,
                            servicio.facturas.numero
                          )} · ${formatearFecha(servicio.facturas.fecha)}`
                        : "Ver en facturación"}
                    </Link>
                  </div>
                </div>
              )}

              {servicio.tipo === "alquiler_periodo" && alquiler && (
                <>
                  <div>
                    <span className="text-xs font-medium text-tinta-suave block">Período</span>
                    <div className="text-tinta font-medium mt-0.5">
                      {formatearFecha(alquiler.fecha_desde)} → {formatearFecha(alquiler.fecha_hasta)}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-tinta-suave block">Unidad y cantidad</span>
                    <div className="text-tinta font-medium mt-0.5">
                      {alquiler.cantidad} {formatearUnidadPlural(alquiler.unidad, alquiler.cantidad)}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-tinta-suave block">Precio por unidad</span>
                    <div className="text-tinta font-medium mt-0.5 tabular-nums">
                      {formatearPesos(alquiler.precio_unidad)}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-tinta-suave block">Renovación automática</span>
                    <div className="text-tinta font-medium mt-0.5">
                      {alquiler.renovacion_automatica ? "Sí" : "No"}
                    </div>
                  </div>
                </>
              )}

              <div className="md:col-span-2">
                <span className="text-xs font-medium text-tinta-suave block">Descripción</span>
                <div className="text-tinta whitespace-pre-wrap mt-0.5">{servicio.descripcion || "—"}</div>
              </div>

              {/* Monto y Cobrado van últimos con pt-3 border-t border-borde */}
              <div className="pt-3 border-t border-borde">
                <span className="text-xs font-medium text-tinta-suave block">Monto</span>
                <div className="text-base font-semibold text-tinta tabular-nums mt-0.5">
                  {formatearPesos(servicio.monto)}
                </div>
              </div>

              <div className="pt-3 border-t border-borde">
                <span className="text-xs font-medium text-tinta-suave block">Cobrado</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className={`text-base font-semibold tabular-nums ${cobroColor}`}>
                    {formatearPesos(servicio.monto_cobrado)}
                  </span>
                  <span className={`inline-flex items-center text-[12px] font-medium rounded-full px-2 py-px ${cobroPillClase}`}>
                    {cobroPillTexto}
                  </span>
                </div>
                {cobrosAplicados.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {cobrosAplicados.map((ca, idx) => {
                      const c = ca.cobros;
                      if (!c) return null;
                      const fechaObj = new Date(c.fecha.length === 10 ? `${c.fecha}T00:00:00` : c.fecha);
                      const diaMes = `${String(fechaObj.getDate()).padStart(2, "0")}/${String(fechaObj.getMonth() + 1).padStart(2, "0")}`;
                      const medioTexto = ETIQUETA_MEDIO_PAGO[c.medio] ?? c.medio;

                      return (
                        <div key={idx} className="text-xs text-tinta-suave">
                          {diaMes} · {medioTexto} · {formatearPesos(ca.monto)}
                          {c.estado === "pendiente" && (
                            <span className="text-alerta"> · pendiente</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>


            {/* Sección Adjuntos (N) */}
            <div className="pt-5 border-t border-borde">
              <h3 className="text-sm font-semibold text-tinta mb-3">
                Adjuntos ({adjuntos.length})
              </h3>
              <div className="flex flex-wrap items-start gap-4">
                {adjuntos.map((adj) => (
                  <a
                    key={adj.id}
                    href={adj.urlFirmada}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col items-center gap-1.5 focus:outline-none"
                    title={adj.nombreArchivo}
                  >
                    <div className="w-24 h-24 rounded-md border border-borde bg-fondo flex items-center justify-center overflow-hidden transition-colors group-hover:border-marca">
                      {adj.esImagen && adj.urlFirmada ? (
                        <img
                          src={adj.urlFirmada}
                          alt={adj.nombreArchivo}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText className="size-8 text-tinta-suave group-hover:text-marca transition-colors" />
                      )}
                    </div>
                    <span
                      className="w-24 truncate text-center text-xs text-tinta"
                      title={adj.nombreArchivo}
                    >
                      {adj.nombreArchivo}
                    </span>
                  </a>
                ))}

                {/* Botón Agregar */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    disabled={subiendoArchivos}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-md border-2 border-dashed border-borde hover:border-marca hover:bg-fondo flex flex-col items-center justify-center gap-1 text-tinta-suave hover:text-marca transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {subiendoArchivos ? (
                      <span className="text-xs font-medium">Subiendo…</span>
                    ) : (
                      <>
                        <Plus className="size-5" />
                        <span className="text-xs font-medium">Agregar</span>
                      </>
                    )}
                  </button>
                  <span className="w-24 truncate text-center text-xs text-transparent select-none">
                    &nbsp;
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  onChange={handleSeleccionarArchivos}
                />
              </div>
              {errorAdjuntos && (
                <Aviso variante="peligro" className="mt-3">
                  {errorAdjuntos}
                </Aviso>
              )}
            </div>

            {/* Barra de acciones dentro de la tarjeta Datos con pt-6 mt-6 border-t border-borde */}
            <div className="pt-6 mt-6 border-t border-borde space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {servicio.estado === "consulta" && (
                  <Boton onClick={() => ejecutarCambioEstado("presupuestado", "Presupuestado")}>
                    Marcar presupuestado
                  </Boton>
                )}

                {servicio.estado === "presupuestado" && (
                  <Boton onClick={() => ejecutarCambioEstado("aceptado", "Aceptado por el cliente")}>
                    Aceptado por el cliente
                  </Boton>
                )}

                {servicio.estado === "aceptado" && (
                  <Boton onClick={abrirProgramar}>
                    Programar
                  </Boton>
                )}

                {servicio.estado === "programado" && (
                  <>
                    <Boton onClick={() => ejecutarCambioEstado("en_curso", "Iniciado")}>
                      Iniciar
                    </Boton>
                    <Boton variante="secundario" onClick={() => setMostrarCobro(true)}>
                      Registrar cobro
                    </Boton>
                    <Boton variante="secundario" onClick={abrirProgramar}>
                      Programar de nuevo
                    </Boton>
                  </>
                )}

                {servicio.estado === "en_curso" && (
                  <>
                    <Boton onClick={() => ejecutarCambioEstado("terminado", "Terminado")}>
                      Terminé
                    </Boton>
                    <Boton variante="secundario" onClick={() => setMostrarCobro(true)}>
                      Registrar cobro
                    </Boton>
                  </>
                )}

                {servicio.estado === "terminado" && (
                  <>
                    <Boton onClick={() => setMostrarCobro(true)}>
                      Registrar cobro
                    </Boton>
                    {!servicio.factura_id && !servicio.no_facturable && (
                      <Link to="/facturacion">
                        <Boton variante="secundario">Facturar</Boton>
                      </Link>
                    )}
                  </>
                )}

                {servicio.estado === "cobrado" && (
                  <>
                    <Boton variante="secundario" onClick={() => setMostrarCobro(true)}>
                      Registrar cobro
                    </Boton>
                    {!servicio.factura_id && !servicio.no_facturable && (
                      <Link to="/facturacion">
                        <Boton variante="secundario">Facturar</Boton>
                      </Link>
                    )}
                  </>
                )}

                {servicio.no_facturable && (
                  <Boton
                    variante="secundario"
                    onClick={async () => {
                      const { error } = await supabase
                        .from("servicios")
                        .update({ no_facturable: false })
                        .eq("id", servicio.id);
                      if (!error) {
                        await cargarDatos();
                      }
                    }}
                  >
                    Volver a facturable
                  </Boton>
                )}


                {servicio.estado !== "cancelado" && servicio.estado !== "facturado" && (
                  <Boton
                    variante="peligro"
                    onClick={async () => {
                      if (window.confirm(`¿Seguro que querés cancelar el servicio #${servicio.numero}?`)) {
                        await ejecutarCambioEstado("cancelado", "Cancelado desde oficina");
                      }
                    }}
                  >
                    Cancelar
                  </Boton>
                )}
              </div>

              {errorEstado && (
                <Aviso variante="peligro">
                  {errorEstado}
                </Aviso>
              )}
            </div>
          </Tarjeta>

          {/* Tarjeta Presupuesto debajo de Datos para consulta, presupuestado y aceptado */}
          {["consulta", "presupuestado", "aceptado"].includes(servicio.estado) && (
            <TarjetaPresupuesto
              servicio={servicio}
              empresa={empresa}
              alquiler={alquiler}
              onActualizado={cargarDatos}
            />
          )}

          {/* Tarjeta Notas si tiene contenido */}
          {servicio.notas?.trim() && (
            <Tarjeta className="p-5 space-y-3">
              <h2 className="text-sm font-medium text-tinta">Notas</h2>
              <div className="text-sm text-tinta-suave bg-fondo rounded-md border border-borde p-3 whitespace-pre-wrap">
                {servicio.notas}
              </div>
            </Tarjeta>
          )}
        </div>

        {/* Columna derecha: Tarjeta Historial */}
        <Tarjeta className="p-5 space-y-4">
          <h2 className="text-lg font-semibold text-tinta">Historial</h2>
          <LineaTiempo eventos={eventos} />
        </Tarjeta>
      </div>
    </div>
  );
}

