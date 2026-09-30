import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Trash2,
  Edit2,
  Search,
  Calculator,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  X,
  Route,
} from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { supabase } from "@/lib/supabase";
import type {
  Cliente,
  Empresa,
  Maquina,
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
  armarCondiciones,
  calcularTotalesAgrupadosPorMoneda,
} from "@/lib/presupuesto";
import { formatearMontoEntrada, formatearPesos } from "@/lib/formato";
import { netoSeguro } from "@/lib/seguro";
import { PresupuestoPDF } from "./PresupuestoPDF";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Campo, Entrada, Selector, AreaTexto, Etiqueta } from "@/components/ui/Campo";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { Boton } from "@/components/ui/Boton";
import { BarraAcciones } from "@/components/ui/BarraAcciones";
import { Aviso } from "@/components/ui/Aviso";
import { useBorrador } from "@/hooks/useBorrador";

interface ItemBorrador {
  idTemp: string;
  tipo: TipoServicio;
  descripcion: string;
  monto: number;
  moneda: "ARS" | "USD";
  monto_moneda?: number | null;
  cotizacion?: number | null;
  aplica_iva: boolean;
  nocturno: boolean;
  origen?: string;
  destino?: string;
  km?: number | null;
  ida_y_vuelta?: boolean;
  fecha_programada?: string | null;
  hora_programada?: string | null;
  maquina_id?: string | null;
  paradas?: {
    orden?: number;
    direccion: string;
    localidad?: string;
    carga?: string;
    carga_desde?: CargaDesde;
    notas?: string;
  }[];
  seguro_importe?: number | null;
  monto_seguro?: number | null;
  alquiler?: {
    fecha_desde: string;
    fecha_hasta: string;
    unidad: UnidadAlquiler;
    cantidad: number;
    precio_unidad: number;
  } | null;
}

export function PaginaNuevoPresupuesto() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Empresa
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  // Destinatario
  const [modoDestinatario, setModoDestinatario] = useState<"cliente" | "prospecto">("cliente");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");

  const [prospectoNombre, setProspectoNombre] = useState("");
  const [prospectoTelefono, setProspectoTelefono] = useState("");
  const [prospectoEmail, setProspectoEmail] = useState("");
  const [prospectoCuit, setProspectoCuit] = useState("");

  // Máquinas activas
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);

  // Ítems
  const [items, setItems] = useState<ItemBorrador[]>([]);
  const [mostrarFormItem, setMostrarFormItem] = useState(false);
  const [itemEnEdicionId, setItemEnEdicionId] = useState<string | null>(null);

  // Form ítem temporal
  const [itemTipo, setItemTipo] = useState<TipoServicio>("traslado");
  const [itemDescripcion, setItemDescripcion] = useState("");
  const [itemMonto, setItemMonto] = useState<number | null>(null);
  const [itemCargaAsegurada, setItemCargaAsegurada] = useState(false);
  const [itemSeguroImporte, setItemSeguroImporte] = useState<number | null>(null);
  const [itemPrecioServicio, setItemPrecioServicio] = useState<number | null>(null);
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

  // Alquiler período fields
  const [alqDesde, setAlqDesde] = useState("");
  const [alqHasta, setAlqHasta] = useState("");
  const [alqUnidad, setAlqUnidad] = useState<UnidadAlquiler>("dia");
  const [alqCantidad, setAlqCantidad] = useState<number>(1);
  const [alqPrecioUnidad, setAlqPrecioUnidad] = useState<number | null>(null);

  // Validez y condiciones
  const [validezDias, setValidezDias] = useState<number>(15);
  const [condiciones, setCondiciones] = useState<string>("");

  // Estados de UI
  const [guardando, setGuardando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [errorItem, setErrorItem] = useState<string | null>(null);

  const estadoPresupuesto = useMemo(
    () => ({
      modoDestinatario,
      clienteSeleccionadoId: clienteSeleccionado?.id ?? null,
      busquedaCliente,
      prospectoNombre,
      prospectoTelefono,
      prospectoEmail,
      prospectoCuit,
      items,
      validezDias,
      condiciones,
    }),
    [
      modoDestinatario,
      clienteSeleccionado,
      busquedaCliente,
      prospectoNombre,
      prospectoTelefono,
      prospectoEmail,
      prospectoCuit,
      items,
      validezDias,
      condiciones,
    ],
  );

  const { AvisoBorrador, limpiar: limpiarBorrador } = useBorrador("nuevo_presupuesto", estadoPresupuesto, {
    tieneContenido: (d) =>
      Boolean(
        d.prospectoNombre?.trim() ||
          d.clienteSeleccionadoId ||
          (Array.isArray(d.items) && d.items.length > 0) ||
          d.prospectoTelefono?.trim() ||
          d.prospectoEmail?.trim() ||
          d.prospectoCuit?.trim(),
      ),
    onRestaurar: (d) => {
      if (d.modoDestinatario) setModoDestinatario(d.modoDestinatario);
      if (d.clienteSeleccionadoId && clientes.length > 0) {
        const c = clientes.find((cli) => cli.id === d.clienteSeleccionadoId);
        if (c) setClienteSeleccionado(c);
      }
      if (d.busquedaCliente) setBusquedaCliente(d.busquedaCliente);
      if (d.prospectoNombre) setProspectoNombre(d.prospectoNombre);
      if (d.prospectoTelefono) setProspectoTelefono(d.prospectoTelefono);
      if (d.prospectoEmail) setProspectoEmail(d.prospectoEmail);
      if (d.prospectoCuit) setProspectoCuit(d.prospectoCuit);
      if (Array.isArray(d.items) && d.items.length > 0) setItems(d.items);
      if (d.validezDias) setValidezDias(d.validezDias);
      if (d.condiciones !== undefined) setCondiciones(d.condiciones);
    },
    onDescartar: () => {
      setClienteSeleccionado(null);
      setBusquedaCliente("");
      setProspectoNombre("");
      setProspectoTelefono("");
      setProspectoEmail("");
      setProspectoCuit("");
      setItems([]);
    },
  });

  // Cargar empresa, clientes y máquinas
  useEffect(() => {
    let activo = true;

    async function cargarInicial() {
      const [
        { data: empData },
        { data: cliData },
        { data: maqData },
      ] = await Promise.all([
        supabase.from("empresa").select("*").eq("id", 1).maybeSingle(),
        supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
        supabase.from("maquinas").select("*").eq("activo", true).order("codigo_interno"),
      ]);

      if (!activo) return;

      if (empData) {
        setEmpresa(empData as Empresa);
        setValidezDias(empData.presupuesto_validez_dias ?? 15);
        setCondiciones(empData.presupuesto_condiciones_extra ?? "");
      }

      if (cliData) {
        setClientes(cliData as Cliente[]);

        const clienteParam = searchParams.get("cliente");
        if (clienteParam) {
          const encontrado = cliData.find((c: any) => c.id === clienteParam);
          if (encontrado) {
            setClienteSeleccionado(encontrado as Cliente);
            setModoDestinatario("cliente");
          }
        }
      }

      if (maqData) {
        setMaquinas(maqData as Maquina[]);
      }
    }

    cargarInicial();

    return () => {
      activo = false;
    };
  }, [searchParams]);

  // Recibir ítem cotizado desde Cotizador si vino por state
  useEffect(() => {
    const state = location.state as { itemCotizado?: any } | undefined;
    if (state?.itemCotizado) {
      const cot = state.itemCotizado;
      const nuevo: ItemBorrador = {
        idTemp: crypto.randomUUID(),
        tipo: cot.tipo || "traslado",
        descripcion: cot.descripcion || "",
        monto: Number(cot.monto) || 0,
        moneda: "ARS",
        aplica_iva: cot.aplica_iva ?? true,
        nocturno: cot.nocturno ?? false,
        origen: cot.origen || "",
        destino: cot.destino || "",
        km: cot.km != null ? Number(cot.km) : null,
        ida_y_vuelta: cot.ida_y_vuelta ?? false,
        seguro_importe: cot.seguro_importe ?? null,
        monto_seguro: cot.monto_seguro ?? null,
      };

      setItems((prev) => [...prev, nuevo]);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Limpiar form de ítem
  const reiniciarFormItem = () => {
    setItemEnEdicionId(null);
    setItemTipo("traslado");
    setItemDescripcion("");
    setItemMonto(null);
    setItemCargaAsegurada(false);
    setItemSeguroImporte(null);
    setItemPrecioServicio(null);
    setItemAplicaIva(true);
    setItemNocturno(false);
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
    setErrorItem(null);
  };

  const abrirAgregarItem = () => {
    reiniciarFormItem();
    setMostrarFormItem(true);
  };

  const abrirEditarItem = (item: ItemBorrador) => {
    setItemEnEdicionId(item.idTemp);
    setItemTipo(item.tipo);
    setItemDescripcion(item.descripcion);
    setItemMonto(item.monto);
    const tieneSeg = Boolean(item.seguro_importe && item.seguro_importe > 0);
    setItemCargaAsegurada(tieneSeg);
    setItemSeguroImporte(item.seguro_importe ?? null);
    if (tieneSeg && item.monto_seguro) {
      setItemPrecioServicio(
        Math.round((item.monto - item.monto_seguro) * 100) / 100,
      );
    } else {
      setItemPrecioServicio(item.monto);
    }
    setItemAplicaIva(item.aplica_iva);
    setItemNocturno(item.nocturno);
    setItemOrigen(item.origen || "");
    setItemDestino(item.destino || "");
    setItemKm(item.km ?? null);
    setItemIdaYVuelta(item.ida_y_vuelta ?? false);
    setItemFechaProg(item.fecha_programada || "");
    setItemHoraProg(item.hora_programada || "");
    setItemMaquinaId(item.maquina_id || "");

    if (item.tipo === "traslado" && item.paradas && item.paradas.length > 0) {
      setItemParadas(
        item.paradas.map((p) => ({
          id: crypto.randomUUID(),
          direccion: p.direccion || "",
          localidad: p.localidad || "",
          carga: p.carga || "",
          carga_desde: (p.carga_desde as CargaDesde) || "origen",
          notas: p.notas || "",
        })),
      );
    } else {
      setItemParadas([]);
    }

    if (item.tipo === "alquiler_periodo" && item.alquiler) {
      setAlqDesde(item.alquiler.fecha_desde);
      setAlqHasta(item.alquiler.fecha_hasta);
      setAlqUnidad(item.alquiler.unidad);
      setAlqCantidad(item.alquiler.cantidad);
      setAlqPrecioUnidad(item.alquiler.precio_unidad);
    } else {
      setAlqDesde("");
      setAlqHasta("");
      setAlqUnidad("dia");
      setAlqCantidad(1);
      setAlqPrecioUnidad(null);
    }

    setErrorItem(null);
    setMostrarFormItem(true);
  };

  const confirmarItem = () => {
    setErrorItem(null);

    let montoFinal = itemMonto;
    let alqDatos = null;
    let seguroImporteItem: number | null = null;
    let montoSeguroItem: number | null = null;

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
      if (itemTipo === "traslado" && itemCargaAsegurada) {
        if (!itemSeguroImporte || itemSeguroImporte <= 0) {
          setErrorItem(
            "Ingresá el importe del seguro o desactivá la carga asegurada.",
          );
          return;
        }
        const precio = itemPrecioServicio ?? itemMonto ?? 0;
        if (precio <= 0) {
          setErrorItem("Ingresá el precio del servicio mayor a cero.");
          return;
        }
        seguroImporteItem = itemSeguroImporte;
        montoSeguroItem = netoSeguro(itemSeguroImporte, itemAplicaIva);
        montoFinal = precio + montoSeguroItem;
      } else if (itemTipo === "traslado") {
        montoFinal = itemPrecioServicio ?? itemMonto;
      }

      if (montoFinal == null || montoFinal <= 0) {
        setErrorItem("Ingresá un monto mayor a cero.");
        return;
      }
    }

    const itemGuardado: ItemBorrador = {
      idTemp: itemEnEdicionId || crypto.randomUUID(),
      tipo: itemTipo,
      descripcion: itemDescripcion.trim(),
      monto: montoFinal,
      moneda: "ARS",
      aplica_iva: itemAplicaIva,
      nocturno: itemNocturno,
      seguro_importe: itemTipo === "traslado" ? seguroImporteItem : null,
      monto_seguro: itemTipo === "traslado" ? montoSeguroItem : null,
      origen: itemOrigen.trim() || undefined,
      destino:
        itemTipo === "traslado" && itemParadas.length > 0
          ? itemParadas[itemParadas.length - 1].direccion.trim()
          : itemDestino.trim() || undefined,
      km: itemKm,
      ida_y_vuelta: itemIdaYVuelta,
      fecha_programada: itemFechaProg || undefined,
      hora_programada: itemHoraProg || undefined,
      maquina_id: itemMaquinaId || undefined,
      paradas:
        itemTipo === "traslado" && itemParadas.length > 0
          ? itemParadas.map((p, idx) => ({
              orden: idx + 1,
              direccion: p.direccion.trim(),
              localidad: p.localidad.trim() || undefined,
              carga: p.carga.trim() || undefined,
              carga_desde: p.carga_desde,
              notas: p.notas.trim() || undefined,
            }))
          : undefined,
      alquiler: alqDatos,
    };

    if (itemEnEdicionId) {
      setItems((prev) =>
        prev.map((it) => (it.idTemp === itemEnEdicionId ? itemGuardado : it)),
      );
    } else {
      setItems((prev) => [...prev, itemGuardado]);
    }

    setMostrarFormItem(false);
    reiniciarFormItem();
  };

  const eliminarItem = (idTemp: string) => {
    setItems((prev) => prev.filter((it) => it.idTemp !== idTemp));
  };

  // Totales en vivo
  const totalesAgrupados = calcularTotalesAgrupadosPorMoneda(items);

  // Clientes filtrados por búsqueda
  const clientesFiltrados = busquedaCliente.trim()
    ? clientes.filter((c) =>
        c.nombre.toLowerCase().includes(busquedaCliente.trim().toLowerCase()),
      )
    : clientes;

  // Condiciones armadas para vista previa
  const condicionesPreview = empresa
    ? armarCondiciones({
        empresa,
        servicios: items as any[],
        validezDias,
        extra: condiciones,
      })
    : [];

  // Guardado común
  const validarYGuardar = async (conPdf: boolean) => {
    setErrorGlobal(null);

    // 1. Validar destinatario
    if (modoDestinatario === "cliente") {
      if (!clienteSeleccionado) {
        setErrorGlobal("Seleccioná un cliente para el presupuesto.");
        return;
      }
    } else {
      if (!prospectoNombre.trim()) {
        setErrorGlobal("Ingresá el nombre o razón social del prospecto.");
        return;
      }
    }

    // 2. Validar ítems
    if (items.length === 0) {
      setErrorGlobal("Agregá al menos un ítem al presupuesto.");
      return;
    }

    try {
      setGuardando(true);

      const clienteId =
        modoDestinatario === "cliente" ? clienteSeleccionado?.id : null;
      const datosPresupuesto = {
        cliente_id: clienteId,
        prospecto_nombre:
          modoDestinatario === "prospecto" ? prospectoNombre.trim() : null,
        prospecto_telefono:
          modoDestinatario === "prospecto"
            ? prospectoTelefono.trim() || null
            : null,
        prospecto_email:
          modoDestinatario === "prospecto" ? prospectoEmail.trim() || null : null,
        prospecto_cuit:
          modoDestinatario === "prospecto" ? prospectoCuit.trim() || null : null,
        validez_dias: validezDias,
        condiciones: condiciones.trim() || null,
      };

      const itemsPayload = items.map((it) => ({
        tipo: it.tipo,
        descripcion: it.descripcion || null,
        monto: it.monto,
        moneda: it.moneda || "ARS",
        monto_moneda: it.monto_moneda || null,
        cotizacion: it.cotizacion || null,
        aplica_iva: it.aplica_iva,
        nocturno: it.nocturno,
        origen: it.origen || null,
        destino: it.destino || null,
        km: it.km != null ? it.km : null,
        ida_y_vuelta: it.ida_y_vuelta ?? false,
        fecha_programada: it.fecha_programada || null,
        hora_programada: it.hora_programada || null,
        maquina_id: it.maquina_id || null,
        seguro_importe: it.seguro_importe || null,
        monto_seguro: it.monto_seguro || null,
        paradas:
          it.tipo === "traslado" && it.paradas && it.paradas.length > 0
            ? it.paradas.map((p, idx) => ({
                orden: idx + 1,
                direccion: p.direccion.trim(),
                localidad: p.localidad?.trim() || null,
                carga: p.carga?.trim() || null,
                carga_desde: p.carga_desde || "origen",
                notas: p.notas?.trim() || null,
              }))
            : null,
        alquiler:
          it.tipo === "alquiler_periodo" && it.alquiler
            ? {
                fecha_desde: it.alquiler.fecha_desde,
                fecha_hasta: it.alquiler.fecha_hasta,
                unidad: it.alquiler.unidad,
                cantidad: it.alquiler.cantidad,
                precio_unidad: it.alquiler.precio_unidad,
              }
            : null,
      }));

      // 3. Crear presupuesto e ítems atómicamente vía RPC
      const { data: pres, error: presError } = await supabase.rpc(
        "crear_presupuesto",
        {
          p_datos: datosPresupuesto,
          p_items: itemsPayload,
        },
      );

      if (presError) {
        throw new Error(`Error al crear el presupuesto: ${presError.message}`);
      }
      if (!pres) {
        throw new Error("No se pudo obtener el presupuesto creado.");
      }

      // 4. Si no se pidió generar PDF, navegar directo al presupuesto creado
      if (!conPdf) {
        limpiarBorrador();
        navigate(`/presupuestos/${pres.id}`);
        return;
      }

      // 5. Si se pidió generar PDF:
      try {
        if (!empresa) {
          throw new Error(
            "No se pudieron cargar los datos de la empresa para el PDF.",
          );
        }

        // Consultar los servicios creados para armar el PDF completo
        const { data: servsCreados, error: servsError } = await supabase
          .from("servicios")
          .select("*, maquinas!servicios_maquina_id_fkey(codigo_interno, tipo), alquileres!alquileres_servicio_id_fkey(*), paradas!paradas_servicio_id_fkey(*)")
          .eq("presupuesto_id", pres.id)
          .order("created_at", { ascending: true });

        if (servsError) {
          throw new Error(
            `Error al consultar ítems para el PDF: ${servsError.message}`,
          );
        }

        const servsFormateados = (servsCreados as Servicio[])?.map((s) => ({
          ...s,
          paradas: s.paradas ? [...s.paradas].sort((a, b) => a.orden - b.orden) : [],
        })) ?? [];

        // Generar Blob PDF
        const doc = (
          <PresupuestoPDF
            empresa={empresa}
            presupuesto={{
              ...pres,
              clientes: clienteSeleccionado,
            }}
            servicios={servsFormateados}
            validezDias={validezDias}
            extra={condiciones}
          />
        );

        const blob = await pdf(doc).toBlob();
        const storagePath = `presupuestos/${pres.id}/presupuesto-${pres.numero}.pdf`;

        const { error: uploadError } = await supabase.storage
          .from("adjuntos")
          .upload(storagePath, blob, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Error al subir PDF: ${uploadError.message}`);
        }

        // Marcar presupuesto como enviado y avanzar ítems en consulta a presupuestado vía RPC
        const { error: rpcEnvError } = await supabase.rpc(
          "marcar_presupuesto_enviado",
          {
            p_presupuesto_id: pres.id,
            p_pdf_path: storagePath,
          },
        );

        if (rpcEnvError) {
          throw new Error(
            `Error al marcar como enviado: ${rpcEnvError.message}`,
          );
        }

        limpiarBorrador();
        navigate(`/presupuestos/${pres.id}`);
      } catch (pdfErr: any) {
        console.error("Error al generar o subir PDF:", pdfErr);
        // Si falla la generación/subida del PDF, navegar al presupuesto ya creado con aviso
        limpiarBorrador();
        navigate(`/presupuestos/${pres.id}`, {
          state: {
            aviso: `El presupuesto #${pres.numero} fue creado como borrador, pero ocurrió un error al generar el PDF (${pdfErr.message}). Podés generarlo desde acá.`,
          },
        });
      }
    } catch (err: any) {
      console.error("Error al guardar presupuesto:", err);
      setErrorGlobal(err.message || "Ocurrió un error al guardar el presupuesto.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <EncabezadoPagina
        volverA="/servicios?filtro=presupuestos"
        titulo="Nuevo presupuesto"
      />

      <AvisoBorrador />

      {errorGlobal && <Aviso variante="peligro">{errorGlobal}</Aviso>}

      {/* 1. SECCIÓN: PARA (Destinatario) */}
      <Tarjeta className="p-5 space-y-4">
        <h2 className="text-base font-semibold text-tinta">1. Para</h2>

        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={modoDestinatario === "cliente"}
            onClick={() => setModoDestinatario("cliente")}
            className={`h-9 px-4 rounded-md border text-sm font-medium transition-colors ${
              modoDestinatario === "cliente"
                ? "border-marca bg-marca-suave text-marca font-semibold"
                : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
            }`}
          >
            Cliente existente
          </button>
          <button
            type="button"
            aria-pressed={modoDestinatario === "prospecto"}
            onClick={() => setModoDestinatario("prospecto")}
            className={`h-9 px-4 rounded-md border text-sm font-medium transition-colors ${
              modoDestinatario === "prospecto"
                ? "border-marca bg-marca-suave text-marca font-semibold"
                : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
            }`}
          >
            No es cliente todavía (prospecto)
          </button>
        </div>

        {modoDestinatario === "cliente" ? (
          <div className="space-y-3 pt-2">
            {clienteSeleccionado ? (
              <div className="p-3 rounded-md border border-borde bg-fondo flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-tinta">
                    {clienteSeleccionado.nombre}
                  </div>
                  <div className="text-xs text-tinta-suave flex flex-wrap gap-2 mt-0.5">
                    {clienteSeleccionado.cuit && (
                      <span>CUIT: {clienteSeleccionado.cuit}</span>
                    )}
                    {clienteSeleccionado.telefono && (
                      <span>Tel: {clienteSeleccionado.telefono}</span>
                    )}
                    {clienteSeleccionado.email && (
                      <span>Email: {clienteSeleccionado.email}</span>
                    )}
                  </div>
                </div>
                <Boton
                  type="button"
                  variante="secundario"
                  className="h-8 text-xs shrink-0"
                  onClick={() => setClienteSeleccionado(null)}
                >
                  Cambiar
                </Boton>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="size-4 text-tinta-suave absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Entrada
                    type="search"
                    placeholder="Buscar cliente por nombre..."
                    value={busquedaCliente}
                    onChange={(e) => setBusquedaCliente(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border border-borde rounded-md divide-y divide-borde bg-superficie">
                  {clientesFiltrados.length === 0 ? (
                    <div className="p-3 text-xs text-tinta-suave text-center">
                      No se encontraron clientes.
                    </div>
                  ) : (
                    clientesFiltrados.map((cli) => (
                      <button
                        key={cli.id}
                        type="button"
                        onClick={() => {
                          setClienteSeleccionado(cli);
                          setBusquedaCliente("");
                        }}
                        className="w-full text-left p-2.5 hover:bg-fondo text-sm flex items-center justify-between"
                      >
                        <span className="font-medium text-tinta">
                          {cli.nombre}
                        </span>
                        {cli.cuit && (
                          <span className="text-xs text-tinta-suave">
                            CUIT {cli.cuit}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="sm:col-span-2">
              <Campo
                etiqueta="Nombre y apellido o razón social"
                id="prospecto_nombre"
              >
                <Entrada
                  id="prospecto_nombre"
                  value={prospectoNombre}
                  onChange={(e) => setProspectoNombre(e.target.value)}
                  placeholder="Ej: Constructora San Martín S.R.L."
                />
              </Campo>
            </div>
            <div>
              <Campo etiqueta="Teléfono" id="prospecto_tel">
                <Entrada
                  id="prospecto_tel"
                  type="tel"
                  value={prospectoTelefono}
                  onChange={(e) => setProspectoTelefono(e.target.value)}
                  placeholder="Ej: 11 4455-6677"
                />
              </Campo>
            </div>
            <div>
              <Campo etiqueta="Email" id="prospecto_email">
                <Entrada
                  id="prospecto_email"
                  type="email"
                  value={prospectoEmail}
                  onChange={(e) => setProspectoEmail(e.target.value)}
                  placeholder="contacto@empresa.com"
                />
              </Campo>
            </div>
            <div className="sm:col-span-2">
              <Campo etiqueta="CUIT" id="prospecto_cuit">
                <Entrada
                  id="prospecto_cuit"
                  value={prospectoCuit}
                  onChange={(e) => setProspectoCuit(e.target.value)}
                  placeholder="30-12345678-9"
                />
              </Campo>
            </div>
          </div>
        )}
      </Tarjeta>

      {/* 2. SECCIÓN: ÍTEMS */}
      <Tarjeta className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-tinta">2. Ítems</h2>
          <span className="text-xs text-tinta-suave">
            {items.length} {items.length === 1 ? "ítem" : "ítems"}
          </span>
        </div>

        {/* Lista resumida de ítems */}
        {items.length === 0 ? (
          <div className="p-6 text-center border-2 border-dashed border-borde rounded-md text-sm text-tinta-suave">
            No hay ítems agregados todavía. Agregá uno o cotizá un traslado.
          </div>
        ) : (
          <div className="divide-y divide-borde border border-borde rounded-md overflow-hidden bg-superficie">
            {items.map((it) => (
              <div
                key={it.idTemp}
                className="p-3 flex items-center justify-between gap-3 hover:bg-fondo/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-marca">
                      {ETIQUETA_TIPO[it.tipo] ?? it.tipo}
                    </span>
                    {it.nocturno && (
                      <span className="text-[10px] bg-marca-suave text-marca px-1.5 py-0.5 rounded font-medium">
                        Nocturno
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-tinta truncate mt-0.5">
                    {it.descripcion ||
                      (it.origen && it.destino
                        ? `${it.origen} → ${it.destino}`
                        : "Servicio")}
                  </div>
                  {it.paradas && it.paradas.length > 0 ? (
                    <div className="text-xs text-tinta-suave flex items-center gap-1.5 mt-0.5">
                      <Route className="size-3 text-marca shrink-0" />
                      <span>
                        {it.origen || "—"} → {it.paradas.length}{" "}
                        {it.paradas.length === 1 ? "parada" : "paradas"}
                      </span>
                      {it.km && <span>({it.km} km)</span>}
                    </div>
                  ) : it.origen && it.destino && it.descripcion ? (
                    <div className="text-xs text-tinta-suave flex items-center gap-1 mt-0.5">
                      <span>{it.origen}</span>
                      <ArrowRight className="size-3 text-tinta-suave shrink-0" />
                      <span>{it.destino}</span>
                      {it.km && <span>({it.km} km)</span>}
                    </div>
                  ) : null}
                  {it.alquiler && (
                    <div className="text-xs text-tinta-suave mt-0.5">
                      {it.alquiler.cantidad} {it.alquiler.unidad}(s) · {it.alquiler.fecha_desde} → {it.alquiler.fecha_hasta}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-tinta tabular-nums">
                      {it.moneda === "USD"
                        ? `U$S ${it.monto}`
                        : formatearPesos(it.monto)}
                    </div>
                    {it.aplica_iva && (
                      <div className="text-[10px] text-tinta-suave">+ IVA</div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => abrirEditarItem(it)}
                      className="p-1.5 text-tinta-suave hover:text-marca rounded transition-colors"
                      title="Editar ítem"
                    >
                      <Edit2 className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminarItem(it.idTemp)}
                      className="p-1.5 text-tinta-suave hover:text-peligro rounded transition-colors"
                      title="Quitar ítem"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Botones para agregar */}
        {!mostrarFormItem && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Boton
              type="button"
              variante="secundario"
              onClick={abrirAgregarItem}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              Agregar ítem
            </Boton>
            <Boton
              type="button"
              variante="secundario"
              onClick={() => navigate("/cotizador?modo=nuevo")}
              className="gap-1.5"
            >
              <Calculator className="size-4" />
              Cotizar un traslado
            </Boton>
          </div>
        )}

        {/* Formulario inline para agregar o editar ítem */}
        {mostrarFormItem && (
          <div className="p-4 rounded-md border border-marca/40 bg-fondo space-y-4 mt-2">
            <div className="flex items-center justify-between pb-2 border-b border-borde">
              <h3 className="text-sm font-semibold text-tinta">
                {itemEnEdicionId ? "Editar ítem" : "Nuevo ítem"}
              </h3>
            </div>

            {errorItem && <Aviso variante="peligro">{errorItem}</Aviso>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <Campo etiqueta="Tipo de servicio" id="item_tipo">
                  <Selector
                    id="item_tipo"
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
                <Campo etiqueta="Máquina" id="item_maq">
                  <Selector
                    id="item_maq"
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
                <Campo etiqueta="Descripción" id="item_desc">
                  <Entrada
                    id="item_desc"
                    value={itemDescripcion}
                    onChange={(e) => setItemDescripcion(e.target.value)}
                    placeholder="Detalle o trabajo a realizar..."
                  />
                </Campo>
              </div>

              {/* Si es traslado: origen, destino o paradas, km */}
              {itemTipo === "traslado" && (
                <>
                  <div>
                    <Campo etiqueta="Origen" id="item_orig">
                      <Entrada
                        id="item_orig"
                        value={itemOrigen}
                        onChange={(e) => setItemOrigen(e.target.value)}
                        placeholder="Ej: Base Canning"
                      />
                    </Campo>
                  </div>

                  {itemParadas.length === 0 ? (
                    <div>
                      <Campo etiqueta="Destino" id="item_dest">
                        <Entrada
                          id="item_dest"
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
                                <Campo etiqueta="Dirección *" id={`item_parada_dir_${idx}`}>
                                  <Entrada
                                    id={`item_parada_dir_${idx}`}
                                    ref={esUltima ? inputUltimaParadaItemRef : undefined}
                                    value={p.direccion}
                                    onChange={(e) =>
                                      actualizarParadaItem(idx, "direccion", e.target.value)
                                    }
                                    placeholder="Ej: Av. San Martín 123"
                                    required
                                  />
                                </Campo>

                                <Campo etiqueta="Localidad" id={`item_parada_loc_${idx}`}>
                                  <Entrada
                                    id={`item_parada_loc_${idx}`}
                                    value={p.localidad}
                                    onChange={(e) =>
                                      actualizarParadaItem(idx, "localidad", e.target.value)
                                    }
                                    placeholder="Ej: Lanús"
                                  />
                                </Campo>

                                <Campo etiqueta="Qué se deja" id={`item_parada_carga_${idx}`}>
                                  <Entrada
                                    id={`item_parada_carga_${idx}`}
                                    value={p.carga}
                                    onChange={(e) =>
                                      actualizarParadaItem(idx, "carga", e.target.value)
                                    }
                                    placeholder="Ej: Pallet 1, mercadería"
                                  />
                                </Campo>

                                <Campo etiqueta="Se carga en" id={`item_parada_cd_${idx}`}>
                                  <Selector
                                    id={`item_parada_cd_${idx}`}
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
                                    id={`item_parada_notas_${idx}`}
                                  >
                                    <Entrada
                                      id={`item_parada_notas_${idx}`}
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
                    <Campo etiqueta="Kilómetros" id="item_km">
                      <Entrada
                        id="item_km"
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
                      id="item_ida_vuelta"
                      type="checkbox"
                      checked={itemIdaYVuelta}
                      onChange={(e) => setItemIdaYVuelta(e.target.checked)}
                      className="size-4 text-marca rounded border-borde focus:ring-marca"
                    />
                    <label htmlFor="item_ida_vuelta" className="text-sm font-medium text-tinta cursor-pointer">
                      Ida y vuelta
                    </label>
                  </div>
                </>
              )}

              {/* Si es alquiler por período: fechas y unidad */}
              {itemTipo === "alquiler_periodo" ? (
                <>
                  <div>
                    <Campo etiqueta="Fecha desde" id="alq_desde">
                      <Entrada
                        id="alq_desde"
                        type="date"
                        value={alqDesde}
                        onChange={(e) => setAlqDesde(e.target.value)}
                      />
                    </Campo>
                  </div>
                  <div>
                    <Campo etiqueta="Fecha hasta" id="alq_hasta">
                      <Entrada
                        id="alq_hasta"
                        type="date"
                        value={alqHasta}
                        onChange={(e) => setAlqHasta(e.target.value)}
                      />
                    </Campo>
                  </div>
                  <div>
                    <Campo etiqueta="Unidad de alquiler" id="alq_unidad">
                      <Selector
                        id="alq_unidad"
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
                    <Campo etiqueta="Cantidad" id="alq_cant">
                      <Entrada
                        id="alq_cant"
                        type="number"
                        min="1"
                        value={alqCantidad}
                        onChange={(e) => setAlqCantidad(Math.max(1, Number(e.target.value)))}
                      />
                    </Campo>
                  </div>
                  <div>
                    <Campo etiqueta="Precio por unidad ($)" id="alq_precio">
                      <EntradaMonto
                        id="alq_precio"
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
                    <Campo etiqueta="Fecha programada" id="item_fecha">
                      <Entrada
                        id="item_fecha"
                        type="date"
                        value={itemFechaProg}
                        onChange={(e) => setItemFechaProg(e.target.value)}
                      />
                    </Campo>
                  </div>
                  <div>
                    <Campo
                      etiqueta={
                        itemTipo === "traslado" && itemCargaAsegurada
                          ? "Precio del servicio"
                          : "Monto ($)"
                      }
                      id="item_monto"
                    >
                      <EntradaMonto
                        id="item_monto"
                        valor={
                          itemTipo === "traslado"
                            ? (itemPrecioServicio ?? itemMonto)
                            : itemMonto
                        }
                        onChange={(val) => {
                          if (itemTipo === "traslado") {
                            setItemPrecioServicio(val);
                          }
                          setItemMonto(val);
                        }}
                      />
                    </Campo>
                  </div>
                </>
              )}

              {itemTipo === "traslado" && (
                <div className="sm:col-span-2 space-y-3">
                  <div className="flex items-center min-h-[44px]">
                    <label
                      htmlFor="item_carga_asegurada"
                      className="min-h-[44px] flex items-center gap-2.5 text-sm font-medium text-tinta cursor-pointer select-none"
                    >
                      <input
                        id="item_carga_asegurada"
                        type="checkbox"
                        checked={itemCargaAsegurada}
                        onChange={(e) => {
                          const act = e.target.checked;
                          setItemCargaAsegurada(act);
                          if (!act) setItemSeguroImporte(null);
                        }}
                        className="size-4 rounded border-borde text-marca focus:ring-marca cursor-pointer"
                      />
                      Carga asegurada
                    </label>
                  </div>

                  {itemCargaAsegurada && (
                    <Campo
                      etiqueta="Importe del seguro (el que pasa la aseguradora) *"
                      id="item_seguro_importe"
                    >
                      <EntradaMonto
                        id="item_seguro_importe"
                        valor={itemSeguroImporte}
                        onChange={setItemSeguroImporte}
                        placeholder="0"
                      />
                    </Campo>
                  )}

                  {itemCargaAsegurada && (
                    <div className="rounded-md bg-fondo p-3 text-sm text-tinta border border-borde">
                      Total: servicio $ {formatearMontoEntrada(itemPrecioServicio || 0)} + seguro $ {formatearMontoEntrada(itemSeguroImporte || 0)}
                    </div>
                  )}
                </div>
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
                onClick={() => setMostrarFormItem(false)}
              >
                Cancelar
              </Boton>
              <Boton type="button" onClick={confirmarItem}>
                {itemEnEdicionId ? "Guardar cambios" : "Confirmar ítem"}
              </Boton>
            </div>
          </div>
        )}
      </Tarjeta>

      {/* 3. SECCIÓN: TOTALES POR MONEDA */}
      <Tarjeta className="p-5 space-y-4">
        <h2 className="text-base font-semibold text-tinta">3. Totales</h2>

        {items.length === 0 ? (
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

      {/* 4. SECCIÓN: VALIDEZ Y CONDICIONES */}
      <Tarjeta className="p-5 space-y-4">
        <h2 className="text-base font-semibold text-tinta">4. Validez y condiciones</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Campo etiqueta="Validez (días)" id="pres_validez">
              <Entrada
                id="pres_validez"
                type="number"
                min="1"
                value={validezDias}
                onChange={(e) => setValidezDias(Math.max(1, Number(e.target.value)))}
              />
            </Campo>
          </div>
          <div className="sm:col-span-2">
            <Campo etiqueta="Condiciones adicionales" id="pres_cond">
              <AreaTexto
                id="pres_cond"
                rows={2}
                value={condiciones}
                onChange={(e) => setCondiciones(e.target.value)}
                placeholder="Condiciones específicas para este presupuesto..."
              />
            </Campo>
          </div>
        </div>

        {condicionesPreview.length > 0 && (
          <div className="mt-3 pt-3 border-t border-borde">
            <span className="text-xs font-medium text-tinta-suave block mb-2">
              Vista previa de condiciones a incluir en el PDF:
            </span>
            <ul className="list-disc list-inside text-xs text-tinta space-y-1 bg-fondo p-3 rounded-md border border-borde">
              {condicionesPreview.map((linea, idx) => (
                <li key={idx}>{linea}</li>
              ))}
            </ul>
          </div>
        )}
      </Tarjeta>

      {/* 5. ACCIONES */}
      <BarraAcciones>
        <Boton
          type="button"
          variante="secundario"
          onClick={() => navigate("/servicios?filtro=presupuestos")}
          disabled={guardando}
        >
          Cancelar
        </Boton>
        <Boton
          type="button"
          variante="secundario"
          onClick={() => validarYGuardar(false)}
          disabled={guardando}
        >
          {guardando ? "Guardando..." : "Guardar borrador"}
        </Boton>
        <Boton
          type="button"
          onClick={() => validarYGuardar(true)}
          disabled={guardando}
        >
          {guardando ? "Generando..." : "Guardar y generar PDF"}
        </Boton>
      </BarraAcciones>
    </div>
  );
}
