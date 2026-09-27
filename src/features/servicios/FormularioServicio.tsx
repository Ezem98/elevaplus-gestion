import { Aviso } from "@/components/ui/Aviso";
import { BarraAcciones } from "@/components/ui/BarraAcciones";
import { Boton } from "@/components/ui/Boton";
import {
  AreaTexto,
  Campo,
  Entrada,
  Etiqueta,
  Selector,
} from "@/components/ui/Campo";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { useAuth } from "@/features/auth/AuthProvider";
import { formatearDiaMes } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type {
  Maquina,
  Tercerizado,
  TipoServicio,
  UnidadAlquiler,
  Vehiculo,
} from "@/lib/tipos";
import {
  ETIQUETA_TIPO,
  ETIQUETA_TIPO_MAQUINA,
  ETIQUETA_UNIDAD_ALQUILER,
  formatearUnidadPlural,
} from "@/lib/tipos";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

interface ClienteOpcion {
  id: string;
  nombre: string;
}

type EstadoInicialOpcion =
  | "aceptado"
  | "programado"
  | "realizado"
  | "en_curso";

const TIPOS: TipoServicio[] = [
  "traslado",
  "alquiler_hora",
  "alquiler_periodo",
  "mantenimiento",
  "otro",
];

const UNIDADES: { valor: UnidadAlquiler; etiqueta: string }[] = [
  { valor: "dia", etiqueta: ETIQUETA_UNIDAD_ALQUILER.dia },
  { valor: "semana", etiqueta: ETIQUETA_UNIDAD_ALQUILER.semana },
  { valor: "quincena", etiqueta: ETIQUETA_UNIDAD_ALQUILER.quincena },
  { valor: "mes", etiqueta: ETIQUETA_UNIDAD_ALQUILER.mes },
];

import { calcularCantidadAlquiler, calcularDiasAlquiler } from "@/lib/alquiler";
import { esHorarioNocturno } from "@/lib/cotizador";

export function FormularioServicio() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clienteParam = searchParams.get("cliente");
  const { session } = useAuth();

  // Opciones de base de datos
  const [clientes, setClientes] = useState<ClienteOpcion[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [tercerizados, setTercerizados] = useState<Tercerizado[]>([]);
  const [tercerizadoId, setTercerizadoId] = useState("");
  const [terceroNombre, setTerceroNombre] = useState("");
  const [costoTercero, setCostoTercero] = useState<number | null>(null);

  // 1. Tipo
  const [tipo, setTipo] = useState<TipoServicio>("traslado");

  // 2. Cliente
  const [clienteId, setClienteId] = useState("");
  const [clienteSinDefinir, setClienteSinDefinir] = useState(false);

  // 3. Campos según tipo
  // Traslado
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [carga, setCarga] = useState("");
  const [km, setKm] = useState<number | string>("");
  const [idaYVuelta, setIdaYVuelta] = useState(false);
  const [vehiculoId, setVehiculoId] = useState("");

  // Alquiler por hora
  const [maquinaId, setMaquinaId] = useState("");
  const [horasEstimadas, setHorasEstimadas] = useState<number | string>("");

  // Alquiler por período
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [unidad, setUnidad] = useState<UnidadAlquiler>("dia");
  const [precioUnidad, setPrecioUnidad] = useState<number | null>(null);
  const [renovacionAutomatica, setRenovacionAutomatica] = useState(false);
  const [alertarDiasAntes, setAlertarDiasAntes] = useState<number | string>(5);

  // Mantenimiento
  const [maquinaCliente, setMaquinaCliente] = useState("");

  // 4. Campos comunes
  const [descripcion, setDescripcion] = useState("");
  const [fechaProgramada, setFechaProgramada] = useState("");
  const [horaProgramada, setHoraProgramada] = useState("");
  const [nocturno, setNocturno] = useState(false);
  const [franjaNocturna, setFranjaNocturna] = useState<{
    desde: string;
    hasta: string;
  }>({
    desde: "20:00",
    hasta: "06:00",
  });
  const [monto, setMonto] = useState<number | null>(null);
  const [montoEditadoManualmente, setMontoEditadoManualmente] = useState(false);
  const [aplicaIva, setAplicaIva] = useState(true);
  const [remito, setRemito] = useState("");
  const [ordenCompra, setOrdenCompra] = useState("");
  const [notas, setNotas] = useState("");

  // 5. Estado inicial
  const [estadoInicial, setEstadoInicial] =
    useState<EstadoInicialOpcion>("aceptado");
  const [horaFin, setHoraFin] = useState("");
  const [choferesDisponibles, setChoferesDisponibles] = useState<
    { id: string; nombre: string }[]
  >([]);
  const [choferesSeleccionados, setChoferesSeleccionados] = useState<string[]>(
    [],
  );
  const [yaSeCobro, setYaSeCobro] = useState(false);
  const [avisoFechaPasada, setAvisoFechaPasada] = useState<string | null>(null);

  // Estados de interfaz
  const [guardando, setGuardando] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const toggleChofer = (choferId: string) => {
    setChoferesSeleccionados((prev) =>
      prev.includes(choferId)
        ? prev.filter((cid) => cid !== choferId)
        : [...prev, choferId],
    );
  };

  const verificarFechasPasadas = (
    tipoActual: TipoServicio,
    fProg: string,
    fDesde: string,
    fHasta: string,
  ) => {
    const hoyLocal = new Date(Date.now() - 3 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    if (tipoActual === "alquiler_periodo") {
      if (fDesde && fDesde < hoyLocal) {
        if (fHasta && fHasta < hoyLocal) {
          setEstadoInicial("realizado");
          setAvisoFechaPasada(
            "La fecha es pasada: se carga como servicio ya realizado",
          );
        } else {
          setEstadoInicial("en_curso");
          setAvisoFechaPasada(
            "El alquiler empezó antes de hoy y sigue vigente",
          );
        }
      } else {
        setAvisoFechaPasada(null);
        setEstadoInicial((prev) =>
          prev === "realizado" || prev === "en_curso" ? "programado" : prev,
        );
      }
    } else {
      if (fProg && fProg < hoyLocal) {
        setEstadoInicial("realizado");
        setAvisoFechaPasada(
          "La fecha es pasada: se carga como servicio ya realizado",
        );
      } else {
        setAvisoFechaPasada(null);
        setEstadoInicial((prev) =>
          prev === "realizado" || prev === "en_curso" ? "programado" : prev,
        );
      }
    }
  };

  // Cargar clientes, vehículos y máquinas
  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        const lista = (data as ClienteOpcion[]) ?? [];
        setClientes(lista);
        if (clienteParam && lista.some((c) => c.id === clienteParam)) {
          setClienteId(clienteParam);
        }
      });

    supabase
      .from("vehiculos")
      .select("*")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        setVehiculos((data as Vehiculo[]) ?? []);
      });

    supabase
      .from("maquinas")
      .select("*")
      .eq("activo", true)
      .order("codigo_interno")
      .then(({ data }) => {
        setMaquinas((data as Maquina[]) ?? []);
      });

    supabase
      .from("perfiles")
      .select("id, nombre")
      .eq("rol", "chofer")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        setChoferesDisponibles(data ?? []);
      });

    supabase
      .from("tercerizados")
      .select("*")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        setTercerizados((data as Tercerizado[]) ?? []);
      });

    supabase
      .from("parametros_cotizador")
      .select("nocturno_desde, nocturno_hasta")
      .order("id", { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setFranjaNocturna({
            desde: data.nocturno_desde
              ? data.nocturno_desde.slice(0, 5)
              : "20:00",
            hasta: data.nocturno_hasta
              ? data.nocturno_hasta.slice(0, 5)
              : "06:00",
          });
        }
      });
  }, [clienteParam]);

  // Cálculo automático de cantidad para Alquiler por período
  const diasTotales = useMemo(() => {
    if (tipo !== "alquiler_periodo") return 0;
    return calcularDiasAlquiler(fechaDesde, fechaHasta);
  }, [tipo, fechaDesde, fechaHasta]);

  const cantidadCalculada = useMemo(() => {
    if (tipo !== "alquiler_periodo") return 0;
    return calcularCantidadAlquiler(diasTotales, unidad);
  }, [tipo, diasTotales, unidad]);

  const recalcularMonto = (
    nuevaDesde: string,
    nuevaHasta: string,
    nuevaUnidad: UnidadAlquiler,
    nuevoPrecio: number | null,
  ) => {
    if (montoEditadoManualmente) return;
    const dias = calcularDiasAlquiler(nuevaDesde, nuevaHasta);
    const cant = calcularCantidadAlquiler(dias, nuevaUnidad);
    if (cant > 0 && nuevoPrecio != null) {
      setMonto(nuevoPrecio * cant);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorValidacion(null);
    setErrorGuardar(null);

    // Validaciones
    if (!clienteSinDefinir && !clienteId) {
      setErrorValidacion(
        "Seleccioná un cliente o marcá que es un cliente sin definir.",
      );
      return;
    }

    if (tipo === "mantenimiento" && !maquinaCliente.trim()) {
      setErrorValidacion("Ingresá la máquina del cliente.");
      return;
    }

    if (!descripcion.trim() && tipo !== "alquiler_periodo") {
      setErrorValidacion("Ingresá una descripción.");
      return;
    }

    if (tipo === "traslado") {
      if (!origen.trim() || !destino.trim()) {
        setErrorValidacion("Origen y destino son obligatorios para traslados.");
        return;
      }
      if (!carga.trim()) {
        setErrorValidacion("Detallá qué se traslada.");
        return;
      }
    }

    if (tipo === "alquiler_periodo") {
      if (!fechaDesde || !fechaHasta) {
        setErrorValidacion("Las fechas de inicio y fin son obligatorias.");
        return;
      }
      if (fechaHasta < fechaDesde) {
        setErrorValidacion(
          "La fecha de fin no puede ser anterior a la de inicio.",
        );
        return;
      }
      if (!precioUnidad || precioUnidad <= 0) {
        setErrorValidacion("Ingresá un precio por unidad válido.");
        return;
      }
    }

    if (estadoInicial === "programado" && !fechaProgramada) {
      setErrorValidacion("Para programarlo hace falta la fecha");
      return;
    }

    if (estadoInicial === "realizado" || estadoInicial === "en_curso") {
      const fechaBase =
        tipo === "alquiler_periodo" ? fechaDesde : fechaProgramada;
      if (!fechaBase) {
        setErrorValidacion(
          estadoInicial === "en_curso"
            ? "Para registrar un alquiler en curso hace falta la fecha de inicio."
            : "Para registrar un servicio ya realizado hace falta la fecha.",
        );
        return;
      }
      if (horaFin && horaProgramada && horaFin < horaProgramada) {
        setErrorValidacion(
          "La hora de fin no puede ser anterior a la de inicio.",
        );
        return;
      }
      const horaIni = horaProgramada
        ? horaProgramada.length === 5
          ? `${horaProgramada}:00`
          : horaProgramada
        : "12:00:00";
      const fechaInicioDate = new Date(`${fechaBase}T${horaIni}-03:00`);
      if (fechaInicioDate > new Date()) {
        setErrorValidacion(
          estadoInicial === "en_curso"
            ? "Un alquiler en curso no puede tener fecha de inicio futura."
            : "Un servicio realizado no puede tener fecha futura.",
        );
        return;
      }
    }

    setGuardando(true);

    try {
      let fechaInicioIso: string | null = null;
      let fechaFinIso: string | null = null;

      if (estadoInicial === "realizado" || estadoInicial === "en_curso") {
        const fechaBase =
          tipo === "alquiler_periodo" ? fechaDesde : fechaProgramada;
        const horaIni = horaProgramada
          ? horaProgramada.length === 5
            ? `${horaProgramada}:00`
            : horaProgramada
          : "12:00:00";
        fechaInicioIso = `${fechaBase}T${horaIni}-03:00`;

        if (estadoInicial === "realizado") {
          if (tipo === "alquiler_periodo") {
            const horaF = horaFin
              ? horaFin.length === 5
                ? `${horaFin}:00`
                : horaFin
              : "12:00:00";
            fechaFinIso = `${fechaHasta}T${horaF}-03:00`;
          } else {
            if (horaFin) {
              const horaF = horaFin.length === 5 ? `${horaFin}:00` : horaFin;
              fechaFinIso = `${fechaBase}T${horaF}-03:00`;
            } else {
              fechaFinIso = fechaInicioIso;
            }
          }
        } else {
          fechaFinIso = null;
        }
      }

      // 1. Armar payload de servicios (campos de otros tipos van en null)
      const payloadServicio: Record<string, any> = {
        tipo,
        cliente_id: clienteSinDefinir ? null : clienteId || null,
        creado_por: session?.user?.id ?? null,
        monto: monto ?? 0,
        aplica_iva: aplicaIva,
        fecha_programada: fechaProgramada || fechaDesde || null,
        hora_programada: horaProgramada
          ? horaProgramada.length === 5
            ? `${horaProgramada}:00`
            : horaProgramada
          : null,
        fecha_inicio: fechaInicioIso,
        fecha_fin: fechaFinIso,
        nocturno:
          tipo === "traslado" || tipo === "alquiler_hora" ? nocturno : false,
        remito: remito.trim() || null,
        orden_compra: ordenCompra.trim() || null,
        descripcion: descripcion.trim() || null,
        notas: notas.trim() || null,
        tercerizado: Boolean(tercerizadoId),
        tercerizado_id:
          tercerizadoId && tercerizadoId !== "otro" ? tercerizadoId : null,
        tercero_nombre:
          tercerizadoId === "otro"
            ? terceroNombre.trim() || null
            : (tercerizados.find((t) => t.id === tercerizadoId)?.nombre ??
              (terceroNombre.trim() || null)),
        costo_tercero: costoTercero,
      };

      if (tipo === "traslado") {
        payloadServicio.origen = origen.trim() || null;
        payloadServicio.destino = destino.trim() || null;
        payloadServicio.carga = carga.trim() || null;
        payloadServicio.km = km !== "" ? Number(km) : null;
        payloadServicio.ida_y_vuelta = idaYVuelta;
        payloadServicio.vehiculo_id = vehiculoId || null;
        payloadServicio.maquina_id = null;
      } else if (tipo === "alquiler_hora") {
        payloadServicio.origen = null;
        payloadServicio.destino = null;
        payloadServicio.carga =
          horasEstimadas !== "" ? `${horasEstimadas} h` : null;
        payloadServicio.km = null;
        payloadServicio.ida_y_vuelta = false;
        payloadServicio.vehiculo_id = vehiculoId || null;
        payloadServicio.maquina_id = maquinaId || null;
      } else if (tipo === "alquiler_periodo") {
        payloadServicio.origen = null;
        payloadServicio.destino = null;
        payloadServicio.carga = null;
        payloadServicio.km = null;
        payloadServicio.ida_y_vuelta = false;
        payloadServicio.vehiculo_id = null;
        payloadServicio.maquina_id = maquinaId || null;
      } else if (tipo === "mantenimiento") {
        payloadServicio.origen = null;
        payloadServicio.destino = null;
        payloadServicio.carga = maquinaCliente.trim() || null;
        payloadServicio.km = null;
        payloadServicio.ida_y_vuelta = false;
        payloadServicio.vehiculo_id = vehiculoId || null;
        payloadServicio.maquina_id = null;
      } else {
        // otro
        payloadServicio.origen = null;
        payloadServicio.destino = null;
        payloadServicio.carga = null;
        payloadServicio.km = null;
        payloadServicio.ida_y_vuelta = false;
        payloadServicio.vehiculo_id = null;
        payloadServicio.maquina_id = null;
      }

      // Insertar servicio sin estado (queda en consulta)
      const { data: servicioInsertado, error: errorInsertServicio } =
        await supabase
          .from("servicios")
          .insert(payloadServicio)
          .select("id")
          .single();

      if (errorInsertServicio || !servicioInsertado?.id) {
        setErrorGuardar("No se pudo guardar el servicio. Probá de nuevo.");
        setGuardando(false);
        return;
      }

      const nuevoId = servicioInsertado.id;

      // Si es alquiler por período, insertar en la tabla alquileres
      if (tipo === "alquiler_periodo") {
        const { error: errorAlquiler } = await supabase
          .from("alquileres")
          .insert({
            servicio_id: nuevoId,
            fecha_desde: fechaDesde,
            fecha_hasta: fechaHasta,
            unidad,
            cantidad: cantidadCalculada || 1,
            precio_unidad: precioUnidad ?? 0,
            renovacion_automatica: renovacionAutomatica,
            alertar_dias_antes: Number(alertarDiasAntes) || 5,
          });

        if (errorAlquiler) {
          setErrorGuardar("No se pudo guardar el servicio. Probá de nuevo.");
          setGuardando(false);
          return;
        }
      }

      // Transiciones de estado encadenadas con cambiar_estado RPC
      if (estadoInicial === "aceptado") {
        // consulta → presupuestado → aceptado
        const { error: errorRpc1 } = await supabase.rpc("cambiar_estado", {
          p_servicio_id: nuevoId,
          p_nuevo: "presupuestado",
        });
        if (errorRpc1) {
          setErrorGuardar("No se pudo guardar el servicio. Probá de nuevo.");
          setGuardando(false);
          return;
        }

        const { error: errorRpc2 } = await supabase.rpc("cambiar_estado", {
          p_servicio_id: nuevoId,
          p_nuevo: "aceptado",
        });
        if (errorRpc2) {
          setErrorGuardar("No se pudo guardar el servicio. Probá de nuevo.");
          setGuardando(false);
          return;
        }
      } else if (estadoInicial === "programado") {
        // consulta → programado directo
        const { error: errorRpc } = await supabase.rpc("cambiar_estado", {
          p_servicio_id: nuevoId,
          p_nuevo: "programado",
          p_nota: "Programado al cargar",
        });
        if (errorRpc) {
          setErrorGuardar("No se pudo guardar el servicio. Probá de nuevo.");
          setGuardando(false);
          return;
        }
      } else if (
        estadoInicial === "realizado" ||
        estadoInicial === "en_curso"
      ) {
        // Choferes: asignar insertando en servicio_choferes después del insert del servicio y antes de la RPC
        if (choferesSeleccionados.length > 0) {
          const { error: errInsertChoferes } = await supabase
            .from("servicio_choferes")
            .insert(
              choferesSeleccionados.map((chofer_id) => ({
                servicio_id: nuevoId,
                chofer_id,
              })),
            );

          if (errInsertChoferes) {
            console.error(
              "[FormularioServicio] Error al asignar choferes:",
              errInsertChoferes.message,
              errInsertChoferes,
            );
            setErrorGuardar(
              `No se pudieron asignar los choferes: ${errInsertChoferes.message}`,
            );
            setGuardando(false);
            return;
          }
        }

        const { error: errorRpc } = await supabase.rpc(
          "registrar_servicio_realizado",
          {
            p_servicio_id: nuevoId,
            p_estado_final:
              estadoInicial === "en_curso" ? "en_curso" : "terminado",
          },
        );
        if (errorRpc) {
          console.error(
            "[FormularioServicio] Error en registrar_servicio_realizado:",
            errorRpc.message,
            errorRpc,
          );
          navigate(
            `/servicios/${nuevoId}?aviso=${encodeURIComponent(
              `El servicio quedó creado pero no se pudo registrar como realizado: ${errorRpc.message}`,
            )}`,
          );
          return;
        }
      }

      if (
        (estadoInicial === "realizado" || estadoInicial === "en_curso") &&
        yaSeCobro
      ) {
        navigate(`/servicios/${nuevoId}?cobrar=1`);
      } else {
        navigate(`/servicios/${nuevoId}`);
      }
    } catch {
      setErrorGuardar("No se pudo guardar el servicio. Probá de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <EncabezadoPagina
        titulo="Nuevo servicio"
        subtitulo="Completá los datos del servicio a realizar"
        volverA="/servicios"
      />

      <Tarjeta className="p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-6 pb-[72px] md:pb-0">
          {/* 1. Tipo de servicio */}
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-tinta-suave">
              Tipo de servicio
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {TIPOS.map((t) => {
                const activo = tipo === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTipo(t);
                      verificarFechasPasadas(
                        t,
                        fechaProgramada,
                        fechaDesde,
                        fechaHasta,
                      );
                    }}
                    aria-pressed={activo}
                    className={`min-h-10 px-3 py-2 rounded-md border text-center text-sm font-medium transition-colors ${
                      activo
                        ? "border-marca bg-marca-suave text-marca"
                        : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                    }`}
                  >
                    {ETIQUETA_TIPO[t]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* 2. Cliente */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Etiqueta htmlFor="cliente">
                Cliente{" "}
                {!clienteSinDefinir && <span className="text-peligro">*</span>}
              </Etiqueta>
              <Link
                to="/clientes/nuevo"
                className="text-sm font-medium text-marca hover:underline"
              >
                Crear cliente
              </Link>
            </div>
            <Selector
              id="cliente"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              disabled={clienteSinDefinir}
              className={
                clienteSinDefinir ? "opacity-50 cursor-not-allowed" : ""
              }
            >
              <option value="">Seleccionar cliente...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
            <label className="flex items-center gap-2 text-sm text-tinta-suave cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clienteSinDefinir}
                onChange={(e) => {
                  setClienteSinDefinir(e.target.checked);
                  if (e.target.checked) setClienteId("");
                }}
                className="rounded border-borde text-marca focus:ring-marca"
              />
              Cliente nuevo o sin definir
            </label>
          </div>

          {/* 3. Campos según tipo */}
          {tipo === "traslado" && (
            <div className="space-y-4 rounded-lg border border-borde bg-fondo/50 p-4">
              <h3 className="text-sm font-semibold text-tinta">
                Detalles del traslado
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo etiqueta="Origen" id="origen">
                  <Entrada
                    id="origen"
                    value={origen}
                    onChange={(e) => setOrigen(e.target.value)}
                    placeholder="Lugar de retiro"
                  />
                </Campo>

                <Campo etiqueta="Destino" id="destino">
                  <Entrada
                    id="destino"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    placeholder="Lugar de entrega"
                  />
                </Campo>

                <Campo etiqueta="Carga" id="carga">
                  <Entrada
                    id="carga"
                    value={carga}
                    onChange={(e) => setCarga(e.target.value)}
                    placeholder="Ej: autoelevador 2.5t, contenedor"
                  />
                </Campo>

                <Campo etiqueta="Km (solo ida)" id="km">
                  <div className="relative flex items-center">
                    <Entrada
                      id="km"
                      type="number"
                      min={0}
                      step={0.5}
                      value={km}
                      onChange={(e) => setKm(e.target.value)}
                      placeholder="0"
                      className="pr-10"
                    />
                    <span className="pointer-events-none absolute right-3 text-sm text-tinta-suave">
                      km
                    </span>
                  </div>
                </Campo>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <fieldset>
                  <legend className="mb-1.5 block text-sm font-medium text-tinta-suave">
                    Recorrido
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIdaYVuelta(false)}
                      aria-pressed={!idaYVuelta}
                      className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                        !idaYVuelta
                          ? "border-marca bg-marca-suave text-marca"
                          : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                      }`}
                    >
                      Solo ida
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdaYVuelta(true)}
                      aria-pressed={idaYVuelta}
                      className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                        idaYVuelta
                          ? "border-marca bg-marca-suave text-marca"
                          : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                      }`}
                    >
                      Ida y vuelta
                    </button>
                  </div>
                </fieldset>

                <Campo etiqueta="Vehículo" id="vehiculo">
                  <Selector
                    id="vehiculo"
                    value={vehiculoId}
                    onChange={(e) => setVehiculoId(e.target.value)}
                  >
                    <option value="">Sin vehículo asignado</option>
                    {vehiculos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </div>
            </div>
          )}

          {tipo === "alquiler_hora" && (
            <div className="space-y-4 rounded-lg border border-borde bg-fondo/50 p-4">
              <h3 className="text-sm font-semibold text-tinta">
                Detalles del alquiler por hora
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo etiqueta="Máquina *" id="maquina">
                  <Selector
                    id="maquina"
                    value={maquinaId}
                    onChange={(e) => setMaquinaId(e.target.value)}
                  >
                    <option value="">Seleccionar máquina...</option>
                    {maquinas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo_interno ? `${m.codigo_interno} · ` : ""}
                        {ETIQUETA_TIPO_MAQUINA[m.tipo] ?? m.tipo}
                      </option>
                    ))}
                  </Selector>
                </Campo>

                <Campo etiqueta="Horas estimadas" id="horas_estimadas">
                  <div className="relative flex items-center">
                    <Entrada
                      id="horas_estimadas"
                      type="number"
                      min={0}
                      step={0.5}
                      value={horasEstimadas}
                      onChange={(e) => setHorasEstimadas(e.target.value)}
                      placeholder="Ej: 4"
                      className="pr-10"
                    />
                    <span className="pointer-events-none absolute right-3 text-sm text-tinta-suave">
                      hs
                    </span>
                  </div>
                </Campo>
              </div>

              <Campo
                etiqueta="Vehículo (para el traslado de la máquina)"
                id="vehiculo_traslado"
              >
                <Selector
                  id="vehiculo_traslado"
                  value={vehiculoId}
                  onChange={(e) => setVehiculoId(e.target.value)}
                >
                  <option value="">Sin vehículo asignado</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
            </div>
          )}

          {tipo === "alquiler_periodo" && (
            <div className="space-y-4 rounded-lg border border-borde bg-fondo/50 p-4">
              <h3 className="text-sm font-semibold text-tinta">
                Detalles del alquiler por período
              </h3>
              <Campo etiqueta="Máquina *" id="maquina_periodo">
                <Selector
                  id="maquina_periodo"
                  value={maquinaId}
                  onChange={(e) => setMaquinaId(e.target.value)}
                >
                  <option value="">Seleccionar máquina...</option>
                  {maquinas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.codigo_interno ? `${m.codigo_interno} · ` : ""}
                      {ETIQUETA_TIPO_MAQUINA[m.tipo] ?? m.tipo}
                    </option>
                  ))}
                </Selector>
              </Campo>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo etiqueta="Fecha desde *" id="fecha_desde">
                  <Entrada
                    id="fecha_desde"
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFechaDesde(val);
                      if (!fechaProgramada) setFechaProgramada(val);
                      recalcularMonto(val, fechaHasta, unidad, precioUnidad);
                      verificarFechasPasadas(
                        "alquiler_periodo",
                        fechaProgramada || val,
                        val,
                        fechaHasta,
                      );
                    }}
                  />
                </Campo>

                <Campo etiqueta="Fecha hasta *" id="fecha_hasta">
                  <Entrada
                    id="fecha_hasta"
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFechaHasta(val);
                      recalcularMonto(fechaDesde, val, unidad, precioUnidad);
                      verificarFechasPasadas(
                        "alquiler_periodo",
                        fechaProgramada,
                        fechaDesde,
                        val,
                      );
                    }}
                  />
                </Campo>
              </div>

              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-tinta-suave">
                  Unidad
                </legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {UNIDADES.map((u) => {
                    const activa = unidad === u.valor;
                    return (
                      <button
                        key={u.valor}
                        type="button"
                        onClick={() => {
                          setUnidad(u.valor);
                          recalcularMonto(
                            fechaDesde,
                            fechaHasta,
                            u.valor,
                            precioUnidad,
                          );
                        }}
                        aria-pressed={activa}
                        className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                          activa
                            ? "border-marca bg-marca-suave text-marca"
                            : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                        }`}
                      >
                        {u.etiqueta}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <Campo etiqueta="Cantidad calculada" id="cantidad_calculada">
                  <div className="flex h-10 w-full items-center rounded-md border border-borde bg-superficie px-3 text-sm font-medium text-tinta">
                    {cantidadCalculada > 0 ? (
                      <span>
                        {cantidadCalculada}{" "}
                        {formatearUnidadPlural(unidad, cantidadCalculada)}
                        {unidad !== "dia" && diasTotales > 0 && (
                          <span className="text-xs text-tinta-suave font-normal ml-2">
                            ({diasTotales} {diasTotales === 1 ? "día" : "días"})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-tinta-tenue">
                        Completá las fechas
                      </span>
                    )}
                  </div>
                </Campo>

                <Campo etiqueta="Precio por unidad *" id="precio_unidad">
                  <EntradaMonto
                    id="precio_unidad"
                    valor={precioUnidad}
                    onChange={(val) => {
                      setPrecioUnidad(val);
                      recalcularMonto(fechaDesde, fechaHasta, unidad, val);
                    }}
                  />
                </Campo>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center pt-2">
                <label className="flex items-center gap-2 text-sm text-tinta cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={renovacionAutomatica}
                    onChange={(e) => setRenovacionAutomatica(e.target.checked)}
                    className="rounded border-borde text-marca focus:ring-marca"
                  />
                  Renovación automática
                </label>

                <Campo etiqueta="Avisar días antes" id="alertar_dias_antes">
                  <Entrada
                    id="alertar_dias_antes"
                    type="number"
                    min={1}
                    max={60}
                    value={alertarDiasAntes}
                    onChange={(e) => setAlertarDiasAntes(e.target.value)}
                    placeholder="5"
                  />
                </Campo>
              </div>
            </div>
          )}

          {tipo === "mantenimiento" && (
            <div className="space-y-4 rounded-lg border border-borde bg-fondo/50 p-4">
              <h3 className="text-sm font-semibold text-tinta">
                Detalles del mantenimiento
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo etiqueta="Máquina del cliente *" id="maquina_cliente">
                  <Entrada
                    id="maquina_cliente"
                    value={maquinaCliente}
                    onChange={(e) => setMaquinaCliente(e.target.value)}
                    placeholder="Ej: autoelevador Toyota 2,5 t"
                  />
                </Campo>

                <Campo
                  etiqueta="Vehículo (opcional)"
                  id="vehiculo_mantenimiento"
                >
                  <Selector
                    id="vehiculo_mantenimiento"
                    value={vehiculoId}
                    onChange={(e) => setVehiculoId(e.target.value)}
                  >
                    <option value="">Sin vehículo asignado</option>
                    {vehiculos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </div>
            </div>
          )}

          {/* 4. Campos comunes */}
          <div className="space-y-4 pt-2">
            <h3 className="text-base font-semibold text-tinta border-b border-borde pb-2">
              Información general
            </h3>

            <Campo
              etiqueta={
                tipo === "mantenimiento" || tipo === "otro"
                  ? "Descripción *"
                  : "Descripción (opcional)"
              }
              id="descripcion"
            >
              <AreaTexto
                id="descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={
                  tipo === "mantenimiento"
                    ? "Detalle de los trabajos a realizar..."
                    : "Descripción o detalle de la tarea..."
                }
              />
            </Campo>

            <div
              className={`grid grid-cols-1 ${estadoInicial === "realizado" ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-4`}
            >
              <Campo
                etiqueta={
                  estadoInicial === "realizado"
                    ? "Fecha del trabajo *"
                    : "Fecha programada"
                }
                id="fecha_programada"
              >
                <Entrada
                  id="fecha_programada"
                  type="date"
                  value={fechaProgramada}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFechaProgramada(val);
                    verificarFechasPasadas(tipo, val, fechaDesde, fechaHasta);
                  }}
                />
              </Campo>

              <Campo
                etiqueta={
                  estadoInicial === "realizado" || estadoInicial === "en_curso"
                    ? "Hora de inicio"
                    : "Hora programada"
                }
                id="hora_programada"
              >
                <Entrada
                  id="hora_programada"
                  type="time"
                  value={horaProgramada}
                  onChange={(e) => setHoraProgramada(e.target.value)}
                />
              </Campo>

              {estadoInicial === "realizado" && (
                <Campo etiqueta="Hora de fin (opcional)" id="hora_fin">
                  <Entrada
                    id="hora_fin"
                    type="time"
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                  />
                </Campo>
              )}
            </div>

            {(tipo === "traslado" || tipo === "alquiler_hora") && (
              <div className="space-y-3">
                <fieldset>
                  <legend className="mb-1.5 block text-sm font-medium text-tinta-suave">
                    Servicio nocturno
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNocturno(false)}
                      aria-pressed={!nocturno}
                      className={`min-h-[44px] px-3 py-2 rounded-md border text-center text-sm font-medium transition-colors ${
                        !nocturno
                          ? "border-marca bg-marca-suave text-marca font-semibold"
                          : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                      }`}
                    >
                      Día
                    </button>
                    <button
                      type="button"
                      onClick={() => setNocturno(true)}
                      aria-pressed={nocturno}
                      className={`min-h-[44px] px-3 py-2 rounded-md border text-center text-sm font-medium transition-colors ${
                        nocturno
                          ? "border-marca bg-marca-suave text-marca font-semibold"
                          : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                      }`}
                    >
                      Noche
                    </button>
                  </div>
                </fieldset>

                {esHorarioNocturno(
                  horaProgramada,
                  franjaNocturna.desde,
                  franjaNocturna.hasta,
                ) &&
                  !nocturno && (
                    <Aviso
                      variante="alerta"
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <span>
                        Es horario nocturno, ¿lo marcás como servicio nocturno?
                      </span>
                      <Boton
                        type="button"
                        variante="fantasma"
                        onClick={() => setNocturno(true)}
                        className="min-h-[44px] text-xs font-semibold shrink-0"
                      >
                        Marcar como nocturno
                      </Boton>
                    </Aviso>
                  )}
              </div>
            )}

            <div>
              <Campo etiqueta="Monto *" id="monto">
                <EntradaMonto
                  id="monto"
                  valor={monto}
                  onChange={(val) => {
                    setMonto(val);
                    setMontoEditadoManualmente(true);
                  }}
                />
              </Campo>

              {tipo === "traslado" && (
                <p className="mt-1 text-xs text-tinta-suave">
                  Para calcular el precio con la fórmula, usá el{" "}
                  <Link
                    to={
                      clienteId
                        ? `/cotizador?cliente=${clienteId}`
                        : "/cotizador"
                    }
                    className="text-marca underline hover:text-marca-oscuro"
                  >
                    Cotizador
                  </Link>
                  .
                </p>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-tinta cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={aplicaIva}
                  onChange={(e) => setAplicaIva(e.target.checked)}
                  className="rounded border-borde text-marca focus:ring-marca"
                />
                Aplica IVA
              </label>
            </div>

            {/* Tercerización */}
            <div className="p-4 rounded-md border border-borde bg-fondo space-y-3">
              <h4 className="text-sm font-semibold text-tinta">
                Tercerización
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo etiqueta="Tercerizado" id="tercerizado_id">
                  <Selector
                    id="tercerizado_id"
                    value={tercerizadoId}
                    onChange={(e) => {
                      setTercerizadoId(e.target.value);
                      if (!e.target.value) {
                        setCostoTercero(null);
                        setTerceroNombre("");
                      }
                    }}
                  >
                    <option value="">No (flota propia)</option>
                    {tercerizados.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} {t.tipo ? `(${t.tipo})` : ""}
                      </option>
                    ))}
                    <option value="otro">Otro transportista / grúa...</option>
                  </Selector>
                </Campo>

                {tercerizadoId !== "" && (
                  <div>
                    <Etiqueta htmlFor="costo_tercero">
                      Costo del tercero
                    </Etiqueta>
                    <EntradaMonto
                      id="costo_tercero"
                      valor={costoTercero}
                      onChange={setCostoTercero}
                      placeholder="Monto acordado con el tercero"
                    />
                  </div>
                )}
              </div>

              {tercerizadoId === "otro" && (
                <Campo
                  etiqueta="Nombre del transportista / grúa"
                  id="tercero_nombre"
                >
                  <Entrada
                    id="tercero_nombre"
                    placeholder="Ej: Auxilios San Cayetano"
                    value={terceroNombre}
                    onChange={(e) => setTerceroNombre(e.target.value)}
                  />
                </Campo>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo etiqueta="Remito" id="remito">
                <Entrada
                  id="remito"
                  value={remito}
                  onChange={(e) => setRemito(e.target.value)}
                  placeholder="Número de remito"
                />
              </Campo>

              <Campo etiqueta="Orden de compra" id="orden_compra">
                <Entrada
                  id="orden_compra"
                  value={ordenCompra}
                  onChange={(e) => setOrdenCompra(e.target.value)}
                  placeholder="Número de OC"
                />
              </Campo>
            </div>

            <Campo etiqueta="Notas" id="notas">
              <AreaTexto
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Comentarios internos o instrucciones adicionales..."
              />
            </Campo>
          </div>

          {/* 5. Estado inicial */}
          <div className="space-y-3 pt-2">
            <h3 className="text-base font-semibold text-tinta border-b border-borde pb-2">
              Estado inicial
            </h3>
            {avisoFechaPasada && (
              <Aviso variante="info">{avisoFechaPasada}</Aviso>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setEstadoInicial("aceptado")}
                aria-pressed={estadoInicial === "aceptado"}
                className={`p-3 rounded-md border text-left transition-colors ${
                  estadoInicial === "aceptado"
                    ? "border-marca bg-marca-suave text-marca"
                    : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${estadoInicial === "aceptado" ? "text-marca" : "text-tinta"}`}
                >
                  Aceptado
                </div>
                <div className="text-xs text-tinta-suave mt-0.5">
                  Ya confirmó, falta programar
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEstadoInicial("programado")}
                aria-pressed={estadoInicial === "programado"}
                className={`p-3 rounded-md border text-left transition-colors ${
                  estadoInicial === "programado"
                    ? "border-marca bg-marca-suave text-marca"
                    : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${estadoInicial === "programado" ? "text-marca" : "text-tinta"}`}
                >
                  Programado
                </div>
                <div className="text-xs text-tinta-suave mt-0.5">
                  Ya tiene fecha asignada
                </div>
              </button>

              {(() => {
                const hoyLocal = new Date(Date.now() - 3 * 3600 * 1000)
                  .toISOString()
                  .slice(0, 10);
                const esAlquilerVigente =
                  tipo === "alquiler_periodo" &&
                  Boolean(
                    fechaDesde &&
                    fechaDesde < hoyLocal &&
                    (!fechaHasta || hoyLocal <= fechaHasta),
                  );
                const etiquetaOpcionCuatro = esAlquilerVigente
                  ? `En curso desde el ${formatearDiaMes(fechaDesde)}`
                  : "Ya realizado";
                const subetiquetaOpcionCuatro = esAlquilerVigente
                  ? "El servicio continúa vigente"
                  : "El trabajo ya fue ejecutado";
                const valorOpcionCuatro: EstadoInicialOpcion = esAlquilerVigente
                  ? "en_curso"
                  : "realizado";
                const activo =
                  estadoInicial === valorOpcionCuatro ||
                  (esAlquilerVigente && estadoInicial === "en_curso") ||
                  (!esAlquilerVigente && estadoInicial === "realizado");

                return (
                  <button
                    type="button"
                    onClick={() => setEstadoInicial(valorOpcionCuatro)}
                    aria-pressed={activo}
                    className={`p-3 rounded-md border text-left transition-colors ${
                      activo
                        ? "border-marca bg-marca-suave text-marca"
                        : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
                    }`}
                  >
                    <div
                      className={`text-sm font-semibold ${
                        activo ? "text-marca" : "text-tinta"
                      }`}
                    >
                      {etiquetaOpcionCuatro}
                    </div>
                    <div className="text-xs text-tinta-suave mt-0.5">
                      {subetiquetaOpcionCuatro}
                    </div>
                  </button>
                );
              })()}
            </div>

            {/* Choferes y cobro para Ya realizado / En curso */}
            {(estadoInicial === "realizado" ||
              estadoInicial === "en_curso") && (
              <div className="space-y-4 pt-3 mt-3 border-t border-borde">
                <div>
                  <Etiqueta>Choferes asignados</Etiqueta>
                  {choferesDisponibles.length === 0 ? (
                    <p className="text-xs text-tinta-suave">
                      No hay choferes disponibles.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {choferesDisponibles.map((ch) => {
                        const seleccionado = choferesSeleccionados.includes(
                          ch.id,
                        );
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

                <div className="pt-2">
                  <label className="flex items-center gap-2 text-sm text-tinta font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={yaSeCobro}
                      onChange={(e) => setYaSeCobro(e.target.checked)}
                      className="rounded border-borde text-marca focus:ring-marca"
                    />
                    ¿Ya se cobró?
                  </label>
                  <p className="text-xs text-tinta-suave mt-0.5 ml-6">
                    Abre el formulario para registrar el cobro con la fecha del
                    servicio.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Errores */}
          {errorValidacion && (
            <Aviso variante="peligro">{errorValidacion}</Aviso>
          )}

          {errorGuardar && <Aviso variante="peligro">{errorGuardar}</Aviso>}

          {/* 6. Acciones */}
          <BarraAcciones>
            <Boton
              type="button"
              variante="secundario"
              onClick={() => navigate(-1)}
              disabled={guardando}
            >
              Cancelar
            </Boton>
            <Boton type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar servicio"}
            </Boton>
          </BarraAcciones>
        </form>
      </Tarjeta>
    </div>
  );
}
