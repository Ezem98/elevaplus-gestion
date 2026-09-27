import { useCallback, useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Download,
  Mail,
  MessageCircle,
  FileText,
  Plus,
  Trash2,
  ExternalLink,
  Calculator,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  X,
  Route,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { supabase } from "@/lib/supabase";
import { consultarPadronArca } from "@/lib/worker";
import type {
  Cliente,
  CondicionIva,
  Empresa,
  Maquina,
  Presupuesto,
  Servicio,
  TipoServicio,
  UnidadAlquiler,
  CargaDesde,
} from "@/lib/tipos";
import {
  ETIQUETA_TIPO,
  ETIQUETA_TIPO_MAQUINA,
} from "@/lib/tipos";
import {
  calcularFechaVencimiento,
  calcularEstadoPresupuesto,
  calcularTotalesAgrupadosPorMoneda,
  detectarCoincidenciasCliente,
  formatearNumeroPresupuesto,
  normalizarTelefonoWhatsApp,
  type CoincidenciaCliente,
} from "@/lib/presupuesto";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { PresupuestoPDF } from "./PresupuestoPDF";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Campo, Entrada, Selector, AreaTexto, Etiqueta } from "@/components/ui/Campo";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { ChipEstado, ChipEstadoPresupuesto, ChipNocturno } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/Boton";
import { Aviso } from "@/components/ui/Aviso";

export function PaginaPresupuesto() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [avisoNavegacion] = useState<string | null>(
    (location.state as any)?.aviso || null,
  );

  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [urlFirmada, setUrlFirmada] = useState<string | null>(null);

  // Edición de condiciones y validez
  const [validezDias, setValidezDias] = useState<number>(15);
  const [condiciones, setCondiciones] = useState<string>("");
  const [guardandoCondiciones, setGuardandoCondiciones] = useState(false);
  const [exitoCondiciones, setExitoCondiciones] = useState(false);

  // Formulario inline para agregar ítem
  const [mostrarAgregarItem, setMostrarAgregarItem] = useState(false);
  const [itemTipo, setItemTipo] = useState<TipoServicio>("traslado");
  const [itemDescripcion, setItemDescripcion] = useState("");
  const [itemMonto, setItemMonto] = useState<number | null>(null);
  const [itemAplicaIva, setItemAplicaIva] = useState(true);
  const [itemNocturno, setItemNocturno] = useState(false);
  const [itemOrigen, setItemOrigen] = useState("");
  const [itemDestino, setItemDestino] = useState("");
  const [itemKm, setItemKm] = useState<number | null>(null);
  const [itemIdaYVuelta, setItemIdaYVuelta] = useState(false);
  const [itemFechaProg, setItemFechaProg] = useState("");
  const [itemHoraProg, setItemHoraProg] = useState("");
  const [itemMaquinaId, setItemMaquinaId] = useState("");

  // Paradas de ítem temporal (solo para traslado)
  const [itemParadas, setItemParadas] = useState<
    {
      id: string;
      direccion: string;
      localidad: string;
      carga: string;
      carga_desde: CargaDesde;
      notas: string;
    }[]
  >([]);
  const inputUltimaParadaItemRef = useRef<HTMLInputElement>(null);

  const agregarParadaItem = () => {
    if (itemParadas.length === 0) {
      const p1 = {
        id: crypto.randomUUID(),
        direccion: itemDestino,
        localidad: "",
        carga: "",
        carga_desde: "origen" as CargaDesde,
        notas: "",
      };
      const p2 = {
        id: crypto.randomUUID(),
        direccion: "",
        localidad: "",
        carga: "",
        carga_desde: "origen" as CargaDesde,
        notas: "",
      };
      setItemParadas([p1, p2]);
      setTimeout(() => {
        inputUltimaParadaItemRef.current?.focus();
      }, 50);
    } else {
      const nueva = {
        id: crypto.randomUUID(),
        direccion: "",
        localidad: "",
        carga: "",
        carga_desde: "origen" as CargaDesde,
        notas: "",
      };
      setItemParadas((prev) => [...prev, nueva]);
      setTimeout(() => {
        inputUltimaParadaItemRef.current?.focus();
      }, 50);
    }
  };

  const quitarParadaItem = (index: number) => {
    setItemParadas((prev) => {
      const actualizadas = prev.filter((_, i) => i !== index);
      if (actualizadas.length <= 1) {
        setItemDestino(actualizadas[0]?.direccion || "");
        return [];
      }
      return actualizadas;
    });
  };

  const moverParadaItem = (index: number, direccion: "arriba" | "abajo") => {
    setItemParadas((prev) => {
      const actualizadas = [...prev];
      const targetIndex = direccion === "arriba" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= actualizadas.length) return prev;
      const temp = actualizadas[index];
      actualizadas[index] = actualizadas[targetIndex];
      actualizadas[targetIndex] = temp;
      return actualizadas;
    });
  };

  const actualizarParadaItem = (
    index: number,
    campo: "direccion" | "localidad" | "carga" | "carga_desde" | "notas",
    valor: any,
  ) => {
    setItemParadas((prev) => {
      const actualizadas = [...prev];
      actualizadas[index] = { ...actualizadas[index], [campo]: valor };
      return actualizadas;
    });
  };

  const [alqDesde, setAlqDesde] = useState("");
  const [alqHasta, setAlqHasta] = useState("");
  const [alqUnidad, setAlqUnidad] = useState<UnidadAlquiler>("dia");
  const [alqCantidad, setAlqCantidad] = useState<number>(1);
  const [alqPrecioUnidad, setAlqPrecioUnidad] = useState<number | null>(null);
  const [errorItem, setErrorItem] = useState<string | null>(null);
  const [guardandoItem, setGuardandoItem] = useState(false);

  // Flujo inline para aceptar prospecto (§4.3)
  const [modoAceptarProspecto, setModoAceptarProspecto] = useState<
    "inactivo" | "coincidencias" | "crear_cliente"
  >("inactivo");
  const [coincidencias, setCoincidencias] = useState<CoincidenciaCliente[]>([]);

  // Formulario nuevo cliente inline
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCuit, setNuevoCuit] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevoCondicionIva, setNuevoCondicionIva] = useState<CondicionIva | "">("");
  const [buscandoArca, setBuscandoArca] = useState(false);
  const [alertaArca, setAlertaArca] = useState<string | null>(null);
  const [errorCrearCliente, setErrorCrearCliente] = useState<string | null>(null);

  // Carga de datos
  const cargarDatos = useCallback(async () => {
    if (!id) return;
    setErrorGlobal(null);

    const [
      { data: presData, error: presError },
      { data: servData, error: servError },
      { data: empData },
      { data: maqData },
      { data: cliData },
    ] = await Promise.all([
      supabase
        .from("presupuestos")
        .select("*, clientes!presupuestos_cliente_id_fkey(*)")
        .eq("id", id)
        .single(),
      supabase
        .from("servicios")
        .select(
          "*, maquinas!servicios_maquina_id_fkey(codigo_interno, tipo), alquileres!alquileres_servicio_id_fkey(*), paradas!paradas_servicio_id_fkey(*)",
        )
        .eq("presupuesto_id", id)
        .order("created_at", { ascending: true }),
      supabase.from("empresa").select("*").eq("id", 1).maybeSingle(),
      supabase.from("maquinas").select("*").eq("activo", true).order("codigo_interno"),
      supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
    ]);

    if (presError) {
      console.error("[PaginaPresupuesto] Error al cargar presupuesto:", presError.message);
      setErrorGlobal(`No se pudo cargar el presupuesto: ${presError.message}`);
      setCargando(false);
      return;
    }

    if (servError) {
      console.error("[PaginaPresupuesto] Error al cargar ítems del presupuesto:", servError.message);
      setErrorGlobal(`Error al cargar ítems: ${servError.message}`);
    }

    if (presData) {
      setPresupuesto(presData as Presupuesto);
      setValidezDias(presData.validez_dias ?? 15);
      setCondiciones(presData.condiciones ?? "");

      // Si tiene PDF generado, obtener URL firmada
      if (presData.pdf_path) {
        supabase.storage
          .from("adjuntos")
          .createSignedUrl(presData.pdf_path, 7 * 24 * 60 * 60)
          .then(({ data }) => {
            if (data?.signedUrl) {
              setUrlFirmada(data.signedUrl);
            }
          });
      }
    }

    if (servData) {
      const servsFormateados = (servData as Servicio[]).map((s) => ({
        ...s,
        paradas: s.paradas ? [...s.paradas].sort((a, b) => a.orden - b.orden) : [],
      }));
      setServicios(servsFormateados);
    }
    if (empData) setEmpresa(empData as Empresa);
    if (maqData) setMaquinas(maqData as Maquina[]);
    if (cliData) setClientes(cliData as Cliente[]);

    setCargando(false);
  }, [id]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  if (cargando) {
    return (
      <div className="p-8 text-center text-sm text-tinta-suave">
        Cargando presupuesto...
      </div>
    );
  }

  if (!presupuesto) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <EncabezadoPagina
          volverA="/servicios?filtro=presupuestos"
          titulo="Presupuesto no encontrado"
        />
        {errorGlobal && <Aviso variante="peligro">{errorGlobal}</Aviso>}
      </div>
    );
  }

  const estadoCalculado = calcularEstadoPresupuesto(presupuesto);

  // Chequear si se modificaron ítems después de generar el PDF
  const itemsModificadosDespuesDeGenerar = Boolean(
    presupuesto.generado_at &&
      servicios.some((s) => new Date(s.created_at) > new Date(presupuesto.generado_at!)),
  );

  // Teléfono y email del destinatario
  const telefonoDestinatario =
    presupuesto.clientes?.telefono || presupuesto.prospecto_telefono;
  const telefonoNormalizado = normalizarTelefonoWhatsApp(telefonoDestinatario);
  const emailDestinatario =
    presupuesto.clientes?.email || presupuesto.prospecto_email;

  // Totales de ítems no cancelados
  const serviciosActivos = servicios.filter((s) => s.estado !== "cancelado");
  const totalesAgrupados = calcularTotalesAgrupadosPorMoneda(serviciosActivos);

  // Nombre de archivo de descarga
  const armarNombreArchivo = () => {
    const numPad = String(presupuesto.numero).padStart(4, "0");
    const nombreDest =
      presupuesto.clientes?.nombre || presupuesto.prospecto_nombre || "";
    const primerNombre = nombreDest
      ? nombreDest.trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, "")
      : "";
    const sufijo = primerNombre ? `-${primerNombre}` : "";
    return `Presupuesto-${numPad}${sufijo}.pdf`;
  };

  // Generar y subir PDF
  const generarYSubirPDF = async (): Promise<{ url: string; blob: Blob }> => {
    if (!empresa) {
      throw new Error("No se pudieron cargar los datos de la empresa.");
    }

    const doc = (
      <PresupuestoPDF
        empresa={empresa}
        presupuesto={presupuesto}
        servicios={serviciosActivos}
        validezDias={validezDias}
        extra={condiciones}
      />
    );

    const blob = await pdf(doc).toBlob();
    const storagePath = `presupuestos/${presupuesto.id}/presupuesto-${presupuesto.numero}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("adjuntos")
      .upload(storagePath, blob, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Error al guardar el PDF: ${uploadError.message}`);
    }

    // Actualizar condiciones si fueron modificadas
    if (
      validezDias !== presupuesto.validez_dias ||
      condiciones.trim() !== (presupuesto.condiciones || "").trim()
    ) {
      const { error: condError } = await supabase
        .from("presupuestos")
        .update({
          validez_dias: validezDias,
          condiciones: condiciones.trim() || null,
        })
        .eq("id", presupuesto.id);

      if (condError) {
        throw new Error(`Error al actualizar condiciones del presupuesto: ${condError.message}`);
      }
    }

    // Marcar presupuesto como enviado y avanzar ítems en consulta a presupuestado vía RPC
    const { error: rpcEnvError } = await supabase.rpc(
      "marcar_presupuesto_enviado",
      {
        p_presupuesto_id: presupuesto.id,
        p_pdf_path: storagePath,
      },
    );

    if (rpcEnvError) {
      throw new Error(`Error al marcar presupuesto como enviado: ${rpcEnvError.message}`);
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from("adjuntos")
      .createSignedUrl(storagePath, 7 * 24 * 60 * 60);

    if (signedError || !signedData?.signedUrl) {
      throw new Error("Error al generar la URL de descarga del PDF.");
    }

    setUrlFirmada(signedData.signedUrl);
    return { url: signedData.signedUrl, blob };
  };

  // Manejador: Descargar PDF
  const handleDescargarPDF = async () => {
    try {
      setProcesando(true);
      setErrorGlobal(null);

      const { blob } = await generarYSubirPDF();

      // Disparar descarga local usando el blob generado
      const urlBlob = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = armarNombreArchivo();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(urlBlob), 5000);

      await cargarDatos();
    } catch (err: any) {
      setErrorGlobal(err.message || "No se pudo generar el PDF.");
    } finally {
      setProcesando(false);
    }
  };

  // Manejador: Enviar por WhatsApp
  const handleEnviarWhatsApp = async () => {
    try {
      if (!telefonoNormalizado) return;
      setProcesando(true);
      setErrorGlobal(null);

      const url =
        urlFirmada && !itemsModificadosDespuesDeGenerar
          ? urlFirmada
          : (await generarYSubirPDF()).url;

      const numFormateado = formatearNumeroPresupuesto(presupuesto.numero);
      const texto = `Hola, te paso el presupuesto ${numFormateado} de ELEVAPLUS: ${url}. Cualquier duda, escribime. ¡Gracias!`;
      const urlWa = `https://wa.me/${telefonoNormalizado}?text=${encodeURIComponent(texto)}`;

      window.open(urlWa, "_blank");

      await cargarDatos();
    } catch (err: any) {
      setErrorGlobal(err.message || "Error al preparar envío por WhatsApp.");
    } finally {
      setProcesando(false);
    }
  };

  // Manejador: Enviar por Mail
  const handleEnviarMail = async () => {
    try {
      if (!emailDestinatario) return;
      setProcesando(true);
      setErrorGlobal(null);

      const url =
        urlFirmada && !itemsModificadosDespuesDeGenerar
          ? urlFirmada
          : (await generarYSubirPDF()).url;

      const numFormateado = formatearNumeroPresupuesto(presupuesto.numero);
      const asunto = `Presupuesto ${numFormateado} - ELEVAPLUS`;
      const cuerpo = `Hola, te paso el presupuesto ${numFormateado} de ELEVAPLUS: ${url}.\n\nCualquier duda, estamos a disposición.\n\n¡Gracias!`;
      const mailto = `mailto:${emailDestinatario}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

      window.location.href = mailto;

      await cargarDatos();
    } catch (err: any) {
      setErrorGlobal(err.message || "Error al preparar envío por email.");
    } finally {
      setProcesando(false);
    }
  };

  // Guardar condiciones y validez
  const handleGuardarCondiciones = async () => {
    try {
      setGuardandoCondiciones(true);
      setExitoCondiciones(false);
      setErrorGlobal(null);

      const { error } = await supabase
        .from("presupuestos")
        .update({
          validez_dias: validezDias,
          condiciones: condiciones.trim() || null,
        })
        .eq("id", presupuesto.id);

      if (error) {
        throw new Error(`Error al guardar condiciones: ${error.message}`);
      }

      setExitoCondiciones(true);
      setTimeout(() => setExitoCondiciones(false), 3000);
      await cargarDatos();
    } catch (err: any) {
      setErrorGlobal(err.message);
    } finally {
      setGuardandoCondiciones(false);
    }
  };

  // Cancelar un ítem
  const handleCancelarItem = async (s: Servicio) => {
    if (
      !window.confirm(
        `¿Seguro que querés cancelar este ítem (${ETIQUETA_TIPO[s.tipo]} #${s.numero})?`,
      )
    ) {
      return;
    }

    try {
      setProcesando(true);
      const { error } = await supabase.rpc("cambiar_estado", {
        p_servicio_id: s.id,
        p_nuevo: "cancelado",
        p_nota: "Cancelado del presupuesto",
      });

      if (error) {
        throw new Error(error.message);
      }

      await cargarDatos();
    } catch (err: any) {
      setErrorGlobal(`Error al cancelar ítem: ${err.message}`);
    } finally {
      setProcesando(false);
    }
  };

  // Agregar un nuevo ítem al presupuesto existente
  const handleAgregarItem = async () => {
    setErrorItem(null);

    let montoFinal = itemMonto;
    let alqDatos = null;

    if (itemTipo === "traslado" && itemParadas.length > 0) {
      for (let i = 0; i < itemParadas.length; i++) {
        if (!itemParadas[i].direccion.trim()) {
          setErrorItem("Cada parada necesita una dirección.");
          return;
        }
      }
    }

    if (itemTipo === "alquiler_periodo") {
      if (!alqDesde || !alqHasta) {
        setErrorItem("Indicá las fechas de inicio y fin del alquiler.");
        return;
      }
      if (!alqPrecioUnidad || alqPrecioUnidad <= 0) {
        setErrorItem("Ingresá un precio por unidad válido.");
        return;
      }
      montoFinal = alqCantidad * alqPrecioUnidad;
      alqDatos = {
        fecha_desde: alqDesde,
        fecha_hasta: alqHasta,
        unidad: alqUnidad,
        cantidad: alqCantidad,
        precio_unidad: alqPrecioUnidad,
      };
    } else {
      if (montoFinal == null || montoFinal <= 0) {
        setErrorItem("Ingresá un monto mayor a cero.");
        return;
      }
    }

    try {
      setGuardandoItem(true);

      const item = {
        tipo: itemTipo,
        descripcion: itemDescripcion.trim() || null,
        monto: montoFinal,
        moneda: "ARS",
        aplica_iva: itemAplicaIva,
        nocturno: itemNocturno,
        origen: itemOrigen.trim() || null,
        destino:
          itemTipo === "traslado" && itemParadas.length > 0
            ? itemParadas[itemParadas.length - 1].direccion.trim()
            : itemDestino.trim() || null,
        km: itemKm != null ? itemKm : null,
        ida_y_vuelta: itemIdaYVuelta,
        fecha_programada: itemFechaProg || null,
        hora_programada: itemHoraProg || null,
        maquina_id: itemMaquinaId || null,
        paradas:
          itemTipo === "traslado" && itemParadas.length > 0
            ? itemParadas.map((p, idx) => ({
                orden: idx + 1,
                direccion: p.direccion.trim(),
                localidad: p.localidad.trim() || null,
                carga: p.carga.trim() || null,
                carga_desde: p.carga_desde,
                notas: p.notas.trim() || null,
              }))
            : null,
        alquiler: alqDatos,
      };

      const { error: errRpc } = await supabase.rpc("agregar_items_presupuesto", {
        p_presupuesto_id: presupuesto.id,
        p_items: [item],
      });

      if (errRpc) throw new Error(errRpc.message);

      setMostrarAgregarItem(false);
      setItemDescripcion("");
      setItemMonto(null);
      setItemOrigen("");
      setItemDestino("");
      setItemKm(null);
      setItemIdaYVuelta(false);
      setItemFechaProg("");
      setItemHoraProg("");
      setItemMaquinaId("");
      setItemParadas([]);
      setAlqDesde("");
      setAlqHasta("");
      setAlqUnidad("dia");
      setAlqCantidad(1);
      setAlqPrecioUnidad(null);

      await cargarDatos();
    } catch (err: any) {
      setErrorItem(err.message || "Error al agregar ítem.");
    } finally {
      setGuardandoItem(false);
    }
  };

  // Rechazar presupuesto
  const handleRechazarPresupuesto = async () => {
    if (
      !window.confirm(
        `¿Seguro que querés marcar el presupuesto #${presupuesto.numero} como rechazado? Los ítems pendientes pasarán a cancelado.`,
      )
    ) {
      return;
    }

    try {
      setProcesando(true);
      setErrorGlobal(null);

      const { error: presError } = await supabase.rpc("rechazar_presupuesto", {
        p_presupuesto_id: presupuesto.id,
        p_motivo: null,
      });

      if (presError) throw new Error(presError.message);

      await cargarDatos();
    } catch (err: any) {
      setErrorGlobal(`Error al rechazar presupuesto: ${err.message}`);
    } finally {
      setProcesando(false);
    }
  };

  // Iniciar flujo de aceptación
  const handleIniciarAceptar = async () => {
    setErrorGlobal(null);

    // 1. Si ya tiene cliente asignado, llamar directo a la RPC
    if (presupuesto.cliente_id) {
      try {
        setProcesando(true);
        const { error } = await supabase.rpc("aceptar_presupuesto", {
          p_presupuesto_id: presupuesto.id,
          p_cliente_id: presupuesto.cliente_id,
          p_cliente_nuevo: null,
        });

        if (error) throw new Error(error.message);
        await cargarDatos();
      } catch (err: any) {
        setErrorGlobal(`Error al aceptar presupuesto: ${err.message}`);
      } finally {
        setProcesando(false);
      }
      return;
    }

    // 2. Es un prospecto: buscar duplicados
    const prospectoObj = {
      nombre: presupuesto.prospecto_nombre || "",
      telefono: presupuesto.prospecto_telefono || null,
      cuit: presupuesto.prospecto_cuit || null,
      email: presupuesto.prospecto_email || null,
    };

    const matches = detectarCoincidenciasCliente(prospectoObj, clientes);

    if (matches.length > 0) {
      setCoincidencias(matches);
      setModoAceptarProspecto("coincidencias");
    } else {
      // Precompletar formulario para nuevo cliente
      setNuevoNombre(presupuesto.prospecto_nombre || "");
      setNuevoCuit(presupuesto.prospecto_cuit || "");
      setNuevoTelefono(presupuesto.prospecto_telefono || "");
      setNuevoEmail(presupuesto.prospecto_email || "");
      setNuevoCondicionIva("");
      setModoAceptarProspecto("crear_cliente");
    }
  };

  // Asignar cliente existente coincidente y aceptar
  const handleAsignarClienteExistente = async (clienteId: string) => {
    try {
      setProcesando(true);
      setErrorGlobal(null);

      const { error } = await supabase.rpc("aceptar_presupuesto", {
        p_presupuesto_id: presupuesto.id,
        p_cliente_id: clienteId,
        p_cliente_nuevo: null,
      });

      if (error) throw new Error(error.message);

      setModoAceptarProspecto("inactivo");
      await cargarDatos();
    } catch (err: any) {
      setErrorGlobal(`Error al asignar cliente y aceptar: ${err.message}`);
    } finally {
      setProcesando(false);
    }
  };

  // Buscar en ARCA desde el formulario inline
  const handleBuscarArca = async () => {
    const cuitLimpio = nuevoCuit.replace(/\D/g, "");
    if (cuitLimpio.length < 10) {
      setAlertaArca("Ingresá un CUIT válido (11 dígitos) para buscar en ARCA.");
      return;
    }

    setBuscandoArca(true);
    setAlertaArca(null);

    try {
      const res = await consultarPadronArca(cuitLimpio);
      if (!res.ok || !res.cuit) {
        setAlertaArca(res.error || "El CUIT no fue encontrado en el padrón de ARCA.");
        return;
      }

      if (res.razon_social) {
        setNuevoNombre(res.razon_social);
      }
      if (res.condicion_iva) {
        setNuevoCondicionIva(res.condicion_iva as CondicionIva);
      }
      setAlertaArca(`Datos encontrados en ARCA: ${res.razon_social}`);
    } catch (err: any) {
      setAlertaArca(err.message || "Error al consultar ARCA.");
    } finally {
      setBuscandoArca(false);
    }
  };

  // Crear cliente nuevo y aceptar presupuesto
  const handleCrearClienteYAceptar = async () => {
    setErrorCrearCliente(null);
    if (!nuevoNombre.trim()) {
      setErrorCrearCliente("El nombre o razón social es obligatorio.");
      return;
    }

    try {
      setProcesando(true);

      // Aceptar presupuesto creando el nuevo cliente atómicamente adentro de la transacción
      const { error: rpcErr } = await supabase.rpc("aceptar_presupuesto", {
        p_presupuesto_id: presupuesto.id,
        p_cliente_id: null,
        p_cliente_nuevo: {
          nombre: nuevoNombre.trim(),
          cuit: nuevoCuit.trim() || null,
          telefono: nuevoTelefono.trim() || null,
          email: nuevoEmail.trim() || null,
          condicion_iva: nuevoCondicionIva || null,
        },
      });

      if (rpcErr) throw new Error(rpcErr.message);

      setModoAceptarProspecto("inactivo");
      await cargarDatos();
    } catch (err: any) {
      setErrorCrearCliente(err.message || "Error al crear cliente.");
    } finally {
      setProcesando(false);
    }
  };

  const puedeModificar = ["borrador", "enviado"].includes(presupuesto.estado);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Encabezado */}
      <EncabezadoPagina
        volverA="/servicios?filtro=presupuestos"
        titulo={
          <div className="flex flex-wrap items-center gap-3">
            <span>Presupuesto #{presupuesto.numero}</span>
            <ChipEstadoPresupuesto estado={estadoCalculado} />
          </div>
        }
        subtitulo={
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {presupuesto.cliente_id && presupuesto.clientes ? (
              <Link
                to={`/clientes/${presupuesto.cliente_id}`}
                className="font-medium text-tinta hover:underline"
              >
                {presupuesto.clientes.nombre}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium text-tinta">
                <span className="text-[11px] font-semibold uppercase tracking-wider bg-marca-suave text-marca px-1.5 py-0.5 rounded">
                  Prospecto
                </span>
                {presupuesto.prospecto_nombre}
              </span>
            )}
            <span className="text-tinta-suave">·</span>
            <span className="text-tinta-suave">
              {formatearFecha(presupuesto.fecha)}
            </span>
            <span className="text-tinta-suave">·</span>
            <span className="text-tinta-suave">
              Vence el{" "}
              {formatearFecha(
                calcularFechaVencimiento(presupuesto.fecha, presupuesto.validez_dias),
              )}
            </span>
          </div>
        }
      />

      {errorGlobal && <Aviso variante="peligro">{errorGlobal}</Aviso>}
      {avisoNavegacion && <Aviso variante="alerta">{avisoNavegacion}</Aviso>}

      {/* Aviso si se modificó luego de enviar */}
      {itemsModificadosDespuesDeGenerar && (
        <Aviso variante="alerta">
          Cambiaste el presupuesto después de enviarlo. Generá el PDF de nuevo.
        </Aviso>
      )}

      {/* INFORMACIÓN DEL DESTINATARIO */}
      <Tarjeta className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-tinta">Destinatario</h2>
        {presupuesto.cliente_id && presupuesto.clientes ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-xs text-tinta-suave block">Cliente</span>
              <Link
                to={`/clientes/${presupuesto.cliente_id}`}
                className="font-medium text-marca hover:underline"
              >
                {presupuesto.clientes.nombre}
              </Link>
            </div>
            <div>
              <span className="text-xs text-tinta-suave block">CUIT</span>
              <span className="font-medium text-tinta">
                {presupuesto.clientes.cuit || "—"}
              </span>
            </div>
            <div>
              <span className="text-xs text-tinta-suave block">Contacto</span>
              <span className="text-tinta">
                {[presupuesto.clientes.telefono, presupuesto.clientes.email]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-xs text-tinta-suave block">Prospecto</span>
              <span className="font-medium text-tinta">
                {presupuesto.prospecto_nombre}
              </span>
            </div>
            <div>
              <span className="text-xs text-tinta-suave block">CUIT</span>
              <span className="font-medium text-tinta">
                {presupuesto.prospecto_cuit || "—"}
              </span>
            </div>
            <div>
              <span className="text-xs text-tinta-suave block">Contacto</span>
              <span className="text-tinta">
                {[presupuesto.prospecto_telefono, presupuesto.prospecto_email]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
            </div>
          </div>
        )}
      </Tarjeta>

      {/* SECCIÓN ÍTEMS */}
      <Tarjeta className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-tinta">
            Ítems ({servicios.length})
          </h2>
          {puedeModificar && !mostrarAgregarItem && (
            <div className="flex gap-2">
              <Boton
                type="button"
                variante="secundario"
                className="h-8 text-xs gap-1"
                onClick={() => setMostrarAgregarItem(true)}
              >
                <Plus className="size-3.5" />
                Agregar ítem
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                className="h-8 text-xs gap-1"
                onClick={() =>
                  navigate(`/cotizador?presupuesto=${presupuesto.id}`)
                }
              >
                <Calculator className="size-3.5" />
                Cotizar un traslado
              </Boton>
            </div>
          )}
        </div>

        {servicios.length === 0 ? (
          <div className="p-6 text-center border-2 border-dashed border-borde rounded-md text-sm text-tinta-suave">
            No hay ítems en este presupuesto.
          </div>
        ) : (
          <div className="divide-y divide-borde border border-borde rounded-md overflow-hidden bg-superficie">
            {servicios.map((s) => (
              <div
                key={s.id}
                className="p-3.5 flex items-center justify-between gap-3 hover:bg-fondo/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-marca">
                      {ETIQUETA_TIPO[s.tipo] ?? s.tipo}
                    </span>
                    {s.nocturno && <ChipNocturno />}
                    <ChipEstado estado={s.estado} />
                  </div>
                  <div className="text-sm font-medium text-tinta mt-0.5">
                    {s.descripcion ||
                      (s.origen && s.destino
                        ? `${s.origen} → ${s.destino}`
                        : "Servicio")}
                  </div>
                  {s.paradas && s.paradas.length > 0 ? (
                    <div className="text-xs text-tinta-suave flex items-center gap-1.5 mt-0.5">
                      <Route className="size-3 text-marca shrink-0" />
                      <span>
                        {s.origen || "—"} → {s.paradas.length}{" "}
                        {s.paradas.length === 1 ? "parada" : "paradas"}
                      </span>
                      {s.km && <span>({s.km} km)</span>}
                    </div>
                  ) : s.origen && s.destino && s.descripcion ? (
                    <div className="text-xs text-tinta-suave flex items-center gap-1 mt-0.5">
                      <span>{s.origen}</span>
                      <ArrowRight className="size-3 text-tinta-suave shrink-0" />
                      <span>{s.destino}</span>
                      {s.km && <span>({s.km} km)</span>}
                    </div>
                  ) : null}
                  {s.tipo === "alquiler_periodo" && (s.alquileres || (s as any).alquiler) && (
                    <div className="text-xs text-tinta-suave mt-0.5">
                      Período: {(s.alquileres || (s as any).alquiler).fecha_desde} →{" "}
                      {(s.alquileres || (s as any).alquiler).fecha_hasta}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-tinta tabular-nums">
                      {s.moneda === "USD"
                        ? `U$S ${s.monto_moneda ?? s.monto}`
                        : formatearPesos(s.monto)}
                    </div>
                    {s.aplica_iva && (
                      <div className="text-[10px] text-tinta-suave">+ IVA</div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Link
                      to={`/servicios/${s.id}`}
                      className="p-1.5 text-tinta-suave hover:text-marca rounded transition-colors text-xs inline-flex items-center gap-1 font-medium border border-borde px-2 h-7"
                    >
                      <span>Ver</span>
                      <ExternalLink className="size-3" />
                    </Link>

                    {puedeModificar && s.estado !== "cancelado" && (
                      <button
                        type="button"
                        onClick={() => handleCancelarItem(s)}
                        className="p-1.5 text-tinta-suave hover:text-peligro rounded transition-colors"
                        title="Cancelar ítem"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Formulario inline para agregar ítem */}
        {mostrarAgregarItem && (
          <div className="p-4 rounded-md border border-marca/40 bg-fondo space-y-4 mt-2">
            <h3 className="text-sm font-semibold text-tinta">Agregar ítem</h3>
            {errorItem && <Aviso variante="peligro">{errorItem}</Aviso>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <Campo etiqueta="Tipo de servicio" id="ni_tipo">
                  <Selector
                    id="ni_tipo"
                    value={itemTipo}
                    onChange={(e) => {
                      const nuevoTipo = e.target.value as TipoServicio;
                      setItemTipo(nuevoTipo);
                      if (nuevoTipo !== "traslado") {
                        setItemParadas([]);
                      }
                    }}
                  >
                    <option value="traslado">Traslado</option>
                    <option value="alquiler_hora">Alquiler por hora</option>
                    <option value="alquiler_periodo">Alquiler por período</option>
                    <option value="mantenimiento">Mantenimiento</option>
                    <option value="otro">Otro</option>
                  </Selector>
                </Campo>
              </div>

              <div>
                <Campo etiqueta="Máquina" id="ni_maq">
                  <Selector
                    id="ni_maq"
                    value={itemMaquinaId}
                    onChange={(e) => setItemMaquinaId(e.target.value)}
                  >
                    <option value="">Sin máquina asignada</option>
                    {maquinas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo_interno ? `${m.codigo_interno} · ` : ""}
                        {ETIQUETA_TIPO_MAQUINA[m.tipo] ?? m.tipo}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </div>

              <div className="sm:col-span-2">
                <Campo etiqueta="Descripción" id="ni_desc">
                  <Entrada
                    id="ni_desc"
                    value={itemDescripcion}
                    onChange={(e) => setItemDescripcion(e.target.value)}
                    placeholder="Detalle o trabajo a realizar..."
                  />
                </Campo>
              </div>

              {itemTipo === "traslado" && (
                <>
                  <div>
                    <Campo etiqueta="Origen" id="ni_orig">
                      <Entrada
                        id="ni_orig"
                        value={itemOrigen}
                        onChange={(e) => setItemOrigen(e.target.value)}
                        placeholder="Ej: Base Canning"
                      />
                    </Campo>
                  </div>

                  {itemParadas.length === 0 ? (
                    <div>
                      <Campo etiqueta="Destino" id="ni_dest">
                        <Entrada
                          id="ni_dest"
                          value={itemDestino}
                          onChange={(e) => setItemDestino(e.target.value)}
                          placeholder="Ej: Planta Burzaco"
                        />
                      </Campo>
                      <div className="mt-2">
                        <Boton
                          type="button"
                          variante="secundario"
                          onClick={agregarParadaItem}
                          className="text-xs h-8"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          + Agregar parada
                        </Boton>
                      </div>
                    </div>
                  ) : (
                    <div className="sm:col-span-2 space-y-3 rounded-lg border border-borde bg-superficie p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-tinta">
                          Paradas del recorrido ({itemParadas.length})
                        </span>
                        <span className="text-xs text-tinta-suave">
                          Reordená con flechas
                        </span>
                      </div>

                      <div className="space-y-3">
                        {itemParadas.map((p, idx) => {
                          const esUltima = idx === itemParadas.length - 1;
                          return (
                            <div
                              key={p.id}
                              className="rounded-lg border border-borde bg-fondo p-3 space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-tinta">
                                  Parada {idx + 1}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moverParadaItem(idx, "arriba")}
                                    disabled={idx === 0}
                                    title="Subir parada"
                                    aria-label={`Subir parada ${idx + 1}`}
                                    className="p-1 rounded text-tinta-suave hover:text-tinta disabled:opacity-30 disabled:hover:text-tinta-suave cursor-pointer disabled:cursor-not-allowed"
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moverParadaItem(idx, "abajo")}
                                    disabled={idx === itemParadas.length - 1}
                                    title="Bajar parada"
                                    aria-label={`Bajar parada ${idx + 1}`}
                                    className="p-1 rounded text-tinta-suave hover:text-tinta disabled:opacity-30 disabled:hover:text-tinta-suave cursor-pointer disabled:cursor-not-allowed"
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => quitarParadaItem(idx)}
                                    title="Quitar parada"
                                    aria-label={`Quitar parada ${idx + 1}`}
                                    className="p-1 rounded text-tinta-suave hover:text-peligro cursor-pointer ml-1"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Campo etiqueta="Dirección *" id={`ni_parada_dir_${idx}`}>
                                  <Entrada
                                    id={`ni_parada_dir_${idx}`}
                                    ref={esUltima ? inputUltimaParadaItemRef : undefined}
                                    value={p.direccion}
                                    onChange={(e) =>
                                      actualizarParadaItem(idx, "direccion", e.target.value)
                                    }
                                    placeholder="Ej: Av. San Martín 123"
                                    required
                                  />
                                </Campo>

                                <Campo etiqueta="Localidad" id={`ni_parada_loc_${idx}`}>
                                  <Entrada
                                    id={`ni_parada_loc_${idx}`}
                                    value={p.localidad}
                                    onChange={(e) =>
                                      actualizarParadaItem(idx, "localidad", e.target.value)
                                    }
                                    placeholder="Ej: Lanús"
                                  />
                                </Campo>

                                <Campo etiqueta="Qué se deja" id={`ni_parada_carga_${idx}`}>
                                  <Entrada
                                    id={`ni_parada_carga_${idx}`}
                                    value={p.carga}
                                    onChange={(e) =>
                                      actualizarParadaItem(idx, "carga", e.target.value)
                                    }
                                    placeholder="Ej: Pallet 1, mercadería"
                                  />
                                </Campo>

                                <Campo etiqueta="Se carga en" id={`ni_parada_cd_${idx}`}>
                                  <Selector
                                    id={`ni_parada_cd_${idx}`}
                                    value={p.carga_desde}
                                    onChange={(e) =>
                                      actualizarParadaItem(
                                        idx,
                                        "carga_desde",
                                        e.target.value as CargaDesde,
                                      )
                                    }
                                  >
                                    <option value="origen">Origen</option>
                                    <option value="parada_anterior">
                                      Parada anterior
                                    </option>
                                  </Selector>
                                </Campo>

                                <div className="sm:col-span-2">
                                  <Campo
                                    etiqueta="Notas de la parada"
                                    id={`ni_parada_notas_${idx}`}
                                  >
                                    <Entrada
                                      id={`ni_parada_notas_${idx}`}
                                      value={p.notas}
                                      onChange={(e) =>
                                        actualizarParadaItem(idx, "notas", e.target.value)
                                      }
                                      placeholder="Indicaciones para el chofer (opcional)"
                                    />
                                  </Campo>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <Boton
                        type="button"
                        variante="secundario"
                        onClick={agregarParadaItem}
                        className="text-xs h-8"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        + Agregar parada
                      </Boton>
                    </div>
                  )}

                  <div>
                    <Campo etiqueta="Kilómetros" id="ni_km">
                      <Entrada
                        id="ni_km"
                        type="number"
                        min="0"
                        value={itemKm ?? ""}
                        onChange={(e) =>
                          setItemKm(e.target.value ? Number(e.target.value) : null)
                        }
                      />
                    </Campo>
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      id="ni_ida_vuelta"
                      type="checkbox"
                      checked={itemIdaYVuelta}
                      onChange={(e) => setItemIdaYVuelta(e.target.checked)}
                      className="size-4 text-marca rounded border-borde focus:ring-marca"
                    />
                    <label htmlFor="ni_ida_vuelta" className="text-sm font-medium text-tinta cursor-pointer">
                      Ida y vuelta
                    </label>
                  </div>
                </>
              )}

              {itemTipo === "alquiler_periodo" ? (
                <>
                  <div>
                    <Campo etiqueta="Fecha desde" id="ni_alq_desde">
                      <Entrada
                        id="ni_alq_desde"
                        type="date"
                        value={alqDesde}
                        onChange={(e) => setAlqDesde(e.target.value)}
                      />
                    </Campo>
                  </div>
                  <div>
                    <Campo etiqueta="Fecha hasta" id="ni_alq_hasta">
                      <Entrada
                        id="ni_alq_hasta"
                        type="date"
                        value={alqHasta}
                        onChange={(e) => setAlqHasta(e.target.value)}
                      />
                    </Campo>
                  </div>
                  <div>
                    <Campo etiqueta="Unidad" id="ni_alq_unidad">
                      <Selector
                        id="ni_alq_unidad"
                        value={alqUnidad}
                        onChange={(e) => setAlqUnidad(e.target.value as UnidadAlquiler)}
                      >
                        <option value="dia">Día</option>
                        <option value="semana">Semana</option>
                        <option value="quincena">Quincena</option>
                        <option value="mes">Mes</option>
                      </Selector>
                    </Campo>
                  </div>
                  <div>
                    <Campo etiqueta="Cantidad" id="ni_alq_cant">
                      <Entrada
                        id="ni_alq_cant"
                        type="number"
                        min="1"
                        value={alqCantidad}
                        onChange={(e) => setAlqCantidad(Math.max(1, Number(e.target.value)))}
                      />
                    </Campo>
                  </div>
                  <div>
                    <Campo etiqueta="Precio por unidad ($)" id="ni_alq_precio">
                      <EntradaMonto
                        id="ni_alq_precio"
                        valor={alqPrecioUnidad}
                        onChange={setAlqPrecioUnidad}
                      />
                    </Campo>
                  </div>
                  <div>
                    <Etiqueta>Monto calculado</Etiqueta>
                    <div className="h-10 flex items-center text-sm font-semibold text-tinta tabular-nums">
                      {formatearPesos(alqCantidad * (alqPrecioUnidad || 0))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Campo etiqueta="Fecha programada" id="ni_fecha">
                      <Entrada
                        id="ni_fecha"
                        type="date"
                        value={itemFechaProg}
                        onChange={(e) => setItemFechaProg(e.target.value)}
                      />
                    </Campo>
                  </div>
                  <div>
                    <Campo etiqueta="Monto ($)" id="ni_monto">
                      <EntradaMonto
                        id="ni_monto"
                        valor={itemMonto}
                        onChange={setItemMonto}
                      />
                    </Campo>
                  </div>
                </>
              )}

              <div className="sm:col-span-2 flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemAplicaIva}
                    onChange={(e) => setItemAplicaIva(e.target.checked)}
                    className="size-4 text-marca rounded border-borde focus:ring-marca"
                  />
                  <span className="text-sm text-tinta font-medium">Aplica IVA (21%)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemNocturno}
                    onChange={(e) => setItemNocturno(e.target.checked)}
                    className="size-4 text-marca rounded border-borde focus:ring-marca"
                  />
                  <span className="text-sm text-tinta font-medium">Servicio nocturno</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-borde">
              <Boton
                type="button"
                variante="secundario"
                onClick={() => setMostrarAgregarItem(false)}
                disabled={guardandoItem}
              >
                Cancelar
              </Boton>
              <Boton
                type="button"
                onClick={handleAgregarItem}
                disabled={guardandoItem}
              >
                {guardandoItem ? "Guardando..." : "Confirmar ítem"}
              </Boton>
            </div>
          </div>
        )}
      </Tarjeta>

      {/* TOTALES POR MONEDA */}
      <Tarjeta className="p-5 space-y-4">
        <h2 className="text-base font-semibold text-tinta">Totales</h2>

        {serviciosActivos.length === 0 ? (
          <div className="text-sm text-tinta-suave">$ 0,00</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {totalesAgrupados.ARS && (
              <div className="p-3.5 rounded-md border border-borde bg-fondo space-y-1.5">
                <div className="text-xs font-semibold text-tinta uppercase tracking-wider">
                  Totales en Pesos (ARS)
                </div>
                <div className="flex justify-between text-sm text-tinta-suave">
                  <span>Subtotal neto:</span>
                  <span className="tabular-nums font-medium">
                    {formatearPesos(totalesAgrupados.ARS.neto)}
                  </span>
                </div>
                {totalesAgrupados.ARS.tieneIva && (
                  <div className="flex justify-between text-sm text-tinta-suave">
                    <span>IVA (21%):</span>
                    <span className="tabular-nums font-medium">
                      {formatearPesos(totalesAgrupados.ARS.iva)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-tinta pt-1 border-t border-borde">
                  <span>Total:</span>
                  <span className="tabular-nums">
                    {formatearPesos(totalesAgrupados.ARS.total)}
                  </span>
                </div>
              </div>
            )}

            {totalesAgrupados.USD && (
              <div className="p-3.5 rounded-md border border-borde bg-fondo space-y-1.5">
                <div className="text-xs font-semibold text-tinta uppercase tracking-wider">
                  Totales en Dólares (USD)
                </div>
                <div className="flex justify-between text-sm text-tinta-suave">
                  <span>Subtotal neto:</span>
                  <span className="tabular-nums font-medium">
                    U$S {totalesAgrupados.USD.neto.toLocaleString("es-AR")}
                  </span>
                </div>
                {totalesAgrupados.USD.tieneIva && (
                  <div className="flex justify-between text-sm text-tinta-suave">
                    <span>IVA (21%):</span>
                    <span className="tabular-nums font-medium">
                      U$S {totalesAgrupados.USD.iva.toLocaleString("es-AR")}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-tinta pt-1 border-t border-borde">
                  <span>Total:</span>
                  <span className="tabular-nums">
                    U$S {totalesAgrupados.USD.total.toLocaleString("es-AR")}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Tarjeta>

      {/* CONDICIONES Y VALIDEZ */}
      <Tarjeta className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-tinta">
            Condiciones y validez
          </h2>
          {exitoCondiciones && (
            <span className="text-xs text-ok font-medium">
              ¡Condiciones guardadas!
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Campo etiqueta="Validez (días)" id="cond_validez">
              <Entrada
                id="cond_validez"
                type="number"
                min="1"
                disabled={!puedeModificar}
                value={validezDias}
                onChange={(e) => setValidezDias(Math.max(1, Number(e.target.value)))}
              />
            </Campo>
          </div>
          <div className="sm:col-span-2">
            <Campo etiqueta="Condiciones adicionales" id="cond_extra">
              <AreaTexto
                id="cond_extra"
                rows={2}
                disabled={!puedeModificar}
                value={condiciones}
                onChange={(e) => setCondiciones(e.target.value)}
              />
            </Campo>
          </div>
        </div>

        {puedeModificar && (
          <div className="flex justify-end">
            <Boton
              type="button"
              variante="secundario"
              className="text-xs h-8"
              onClick={handleGuardarCondiciones}
              disabled={guardandoCondiciones}
            >
              {guardandoCondiciones ? "Guardando..." : "Guardar condiciones"}
            </Boton>
          </div>
        )}
      </Tarjeta>

      {/* FLUJO INLINE: ACEPTAR PROSPECTO (§4.3) */}
      {modoAceptarProspecto === "coincidencias" && (
        <Tarjeta className="p-5 space-y-4 border-marca bg-marca-suave/10">
          <div className="flex items-center gap-2 text-marca">
            <AlertTriangle className="size-5 shrink-0" />
            <h3 className="font-semibold text-sm">
              ¿Este prospecto corresponde a alguno de estos clientes existentes?
            </h3>
          </div>

          <div className="divide-y divide-borde border border-borde rounded-md bg-superficie">
            {coincidencias.map(({ cliente: c, criterios }) => (
              <div
                key={c.id}
                className="p-3 flex items-center justify-between gap-3 hover:bg-fondo/60"
              >
                <div>
                  <div className="font-semibold text-sm text-tinta">
                    {c.nombre}
                  </div>
                  <div className="text-xs text-tinta-suave flex flex-wrap gap-2 mt-0.5">
                    {c.cuit && <span>CUIT: {c.cuit}</span>}
                    {c.telefono && <span>Tel: {c.telefono}</span>}
                  </div>
                  <div className="text-[11px] text-marca font-medium mt-1">
                    Coincidencia: {criterios.join(", ")}
                  </div>
                </div>

                <Boton
                  type="button"
                  className="h-8 text-xs shrink-0"
                  onClick={() => handleAsignarClienteExistente(c.id)}
                  disabled={procesando}
                >
                  Asignar a este cliente
                </Boton>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-2">
            <Boton
              type="button"
              variante="secundario"
              className="text-xs"
              onClick={() => setModoAceptarProspecto("inactivo")}
            >
              Cancelar
            </Boton>

            <Boton
              type="button"
              variante="secundario"
              className="text-xs"
              onClick={() => {
                setNuevoNombre(presupuesto.prospecto_nombre || "");
                setNuevoCuit(presupuesto.prospecto_cuit || "");
                setNuevoTelefono(presupuesto.prospecto_telefono || "");
                setNuevoEmail(presupuesto.prospecto_email || "");
                setModoAceptarProspecto("crear_cliente");
              }}
            >
              No, crear cliente nuevo
            </Boton>
          </div>
        </Tarjeta>
      )}

      {modoAceptarProspecto === "crear_cliente" && (
        <Tarjeta className="p-5 space-y-4 border-marca bg-superficie">
          <h3 className="font-semibold text-sm text-tinta">
            Crear cliente nuevo desde prospecto
          </h3>

          {errorCrearCliente && (
            <Aviso variante="peligro">{errorCrearCliente}</Aviso>
          )}

          {alertaArca && <Aviso variante="info">{alertaArca}</Aviso>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="sm:col-span-2">
              <Campo etiqueta="Nombre o razón social" id="nc_nombre">
                <Entrada
                  id="nc_nombre"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                />
              </Campo>
            </div>

            <div>
              <Campo etiqueta="CUIT" id="nc_cuit">
                <div className="flex gap-2">
                  <Entrada
                    id="nc_cuit"
                    value={nuevoCuit}
                    onChange={(e) => setNuevoCuit(e.target.value)}
                    placeholder="30-12345678-9"
                  />
                  <Boton
                    type="button"
                    variante="secundario"
                    className="shrink-0 text-xs px-3"
                    onClick={handleBuscarArca}
                    disabled={buscandoArca || !nuevoCuit.trim()}
                  >
                    {buscandoArca ? "Buscando..." : "Buscar en ARCA"}
                  </Boton>
                </div>
              </Campo>
            </div>

            <div>
              <Campo etiqueta="Condición frente al IVA" id="nc_iva">
                <Selector
                  id="nc_iva"
                  value={nuevoCondicionIva}
                  onChange={(e) =>
                    setNuevoCondicionIva(e.target.value as CondicionIva | "")
                  }
                >
                  <option value="">Seleccionar condición...</option>
                  <option value="responsable_inscripto">Responsable Inscripto</option>
                  <option value="monotributo">Monotributo</option>
                  <option value="exento">Exento</option>
                  <option value="consumidor_final">Consumidor Final</option>
                </Selector>
              </Campo>
            </div>

            <div>
              <Campo etiqueta="Teléfono" id="nc_tel">
                <Entrada
                  id="nc_tel"
                  type="tel"
                  value={nuevoTelefono}
                  onChange={(e) => setNuevoTelefono(e.target.value)}
                />
              </Campo>
            </div>

            <div>
              <Campo etiqueta="Email" id="nc_email">
                <Entrada
                  id="nc_email"
                  type="email"
                  value={nuevoEmail}
                  onChange={(e) => setNuevoEmail(e.target.value)}
                />
              </Campo>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-borde">
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setModoAceptarProspecto("inactivo")}
              disabled={procesando}
            >
              Cancelar
            </Boton>
            <Boton
              type="button"
              onClick={handleCrearClienteYAceptar}
              disabled={procesando}
            >
              {procesando ? "Guardando..." : "Guardar cliente y aceptar presupuesto"}
            </Boton>
          </div>
        </Tarjeta>
      )}

      {/* ACCIONES DEL PRESUPUESTO */}
      <Tarjeta className="p-5 space-y-4">
        <h2 className="text-base font-semibold text-tinta">Acciones</h2>

        <div className="flex flex-wrap items-center gap-3">
          <Boton
            type="button"
            onClick={handleDescargarPDF}
            disabled={procesando}
            className="gap-1.5"
          >
            <Download className="size-4" />
            {presupuesto.pdf_path ? "Descargar PDF" : "Generar PDF"}
          </Boton>

          {urlFirmada && (
            <a
              href={urlFirmada}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-marca hover:underline px-2"
            >
              <FileText className="size-4" />
              Ver PDF actual
            </a>
          )}

          {telefonoNormalizado && (
            <Boton
              type="button"
              variante="secundario"
              onClick={handleEnviarWhatsApp}
              disabled={procesando}
              className="gap-1.5"
            >
              <MessageCircle className="size-4" />
              Enviar por WhatsApp
            </Boton>
          )}

          {emailDestinatario && (
            <Boton
              type="button"
              variante="secundario"
              onClick={handleEnviarMail}
              disabled={procesando}
              className="gap-1.5"
            >
              <Mail className="size-4" />
              Enviar por mail
            </Boton>
          )}

          {["borrador", "enviado"].includes(presupuesto.estado) && (
            <>
              <div className="h-6 w-px bg-borde hidden sm:block" />

              <Boton
                type="button"
                onClick={handleIniciarAceptar}
                disabled={procesando || modoAceptarProspecto !== "inactivo"}
                className="gap-1.5 bg-ok hover:bg-ok/90 text-white"
              >
                <CheckCircle2 className="size-4" />
                Aceptado
              </Boton>

              <Boton
                type="button"
                variante="peligro"
                onClick={handleRechazarPresupuesto}
                disabled={procesando || modoAceptarProspecto !== "inactivo"}
                className="gap-1.5"
              >
                <XCircle className="size-4" />
                Rechazado
              </Boton>
            </>
          )}
        </div>
      </Tarjeta>
    </div>
  );
}
