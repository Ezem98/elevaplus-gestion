import { Aviso } from "@/components/ui/Aviso";
import { BarraAcciones } from "@/components/ui/BarraAcciones";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada, Etiqueta, Selector } from "@/components/ui/Campo";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { useAuth } from "@/features/auth/AuthProvider";
import { cambiarEstadoCheque } from "@/lib/cheques";
import { formatearPesos } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type {
  AmbitoMovimiento,
  CategoriaMovimiento,
  Cheque,
  Cuenta,
  EstadoMovimiento,
  MedioPago,
  MovimientoCaja,
  TipoComprobanteCompra,
  TipoMovimiento,
} from "@/lib/tipos";
import { useEffect, useState } from "react";

interface PropsFormularioMovimiento {
  tipoInicial: TipoMovimiento;
  ambitoInicial?: AmbitoMovimiento | null;
  categoriaInicialId?: string | null;
  proveedorInicial?: string | null;
  montoInicial?: number | null;
  cuentaInicialId?: string | null;
  medioInicial?: MedioPago | null;
  descripcionInicial?: string | null;
  movimientoAEditar?: MovimientoCaja | null;
  categoriaNombreInicial?: string | null;
  tieneFacturaInicial?: boolean;
  comprobanteTipoInicial?: TipoComprobanteCompra | null;
  chequeTerceroInicial?: Cheque | null;
  endosadoAInicial?: string;
  onGuardadoConId?: (movimientoId: string) => void;
  onGuardado: () => void;
  onCancelar: () => void;
}

const MEDIOS_EGRESO: { id: MedioPago; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "debito_automatico", label: "Débito automático" },
  { id: "cheque_terceros", label: "Cheque de terceros" },
  { id: "cheque_propio", label: "Cheque propio" },
  { id: "otro", label: "Otro" },
];

const MEDIOS_INGRESO: { id: MedioPago; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "cheque", label: "Cheque" },
  { id: "echeq", label: "E-cheq" },
  { id: "otro", label: "Otro" },
];

const TIPOS_COMPROBANTE: { id: TipoComprobanteCompra; label: string }[] = [
  { id: "A", label: "Factura A" },
  { id: "B", label: "Factura B" },
  { id: "C", label: "Factura C" },
  { id: "M", label: "Factura M" },
  { id: "ticket", label: "Ticket" },
  { id: "otro", label: "Otro" },
];

function Opcion({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`h-10 rounded-md border text-sm font-medium transition-colors ${
        activa
          ? "border-marca bg-marca-suave text-marca"
          : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
      }`}
    >
      {children}
    </button>
  );
}

function formatearEtiquetaChequeTercero(ch: Cheque): string {
  const clienteEmisor = ch.clientes?.nombre || ch.emisor || "Sin emisor";
  const bancoNum = [ch.banco, ch.numero ? `#${ch.numero}` : ""]
    .filter(Boolean)
    .join(" ");
  const montoStr = formatearPesos(ch.monto);
  const [, m, d] = (ch.fecha_pago || "").split("-");
  const venceStr = d && m ? `vence ${d}/${m}` : "";
  return [clienteEmisor, bancoNum, montoStr, venceStr]
    .filter(Boolean)
    .join(" · ");
}

export function FormularioMovimiento({
  tipoInicial,
  ambitoInicial,
  categoriaInicialId,
  proveedorInicial,
  montoInicial,
  cuentaInicialId,
  medioInicial,
  descripcionInicial,
  movimientoAEditar,
  categoriaNombreInicial,
  tieneFacturaInicial,
  comprobanteTipoInicial,
  chequeTerceroInicial,
  endosadoAInicial,
  onGuardadoConId,
  onGuardado,
  onCancelar,
}: PropsFormularioMovimiento) {
  const { session } = useAuth();
  const fechaHoy = new Date().toISOString().slice(0, 10);

  const tipo = movimientoAEditar ? movimientoAEditar.tipo : tipoInicial;
  const esEdicion = !!movimientoAEditar;

  const [ambito, setAmbito] = useState<AmbitoMovimiento | null>(
    movimientoAEditar?.ambito ??
      (tipo === "transferencia" ? null : (ambitoInicial ?? null)),
  );
  const [errorAmbito, setErrorAmbito] = useState<string | null>(null);
  const [fecha, setFecha] = useState(movimientoAEditar?.fecha ?? fechaHoy);
  const [categoriaId, setCategoriaId] = useState<string>(
    movimientoAEditar?.categoria_id ?? categoriaInicialId ?? "",
  );
  const [proveedor, setProveedor] = useState(
    movimientoAEditar?.proveedor ?? endosadoAInicial ?? proveedorInicial ?? "",
  );
  const [descripcion, setDescripcion] = useState(
    movimientoAEditar?.descripcion ?? descripcionInicial ?? "",
  );
  const [monto, setMonto] = useState<number | null>(
    movimientoAEditar?.monto ??
      (chequeTerceroInicial
        ? chequeTerceroInicial.monto
        : (montoInicial ?? null)),
  );
  const [medio, setMedio] = useState<MedioPago>(
    movimientoAEditar?.medio ??
      (chequeTerceroInicial
        ? "cheque_terceros"
        : (medioInicial ??
          (tipo === "transferencia" ? "transferencia" : "efectivo"))),
  );
  const [cuentaId, setCuentaId] = useState<string>(
    movimientoAEditar?.cuenta_id ?? cuentaInicialId ?? "",
  );
  const [cuentaDestinoId, setCuentaDestinoId] = useState<string>(
    movimientoAEditar?.cuenta_destino_id ?? "",
  );
  const [estado, setEstado] = useState<EstadoMovimiento>(
    movimientoAEditar?.estado ?? (chequeTerceroInicial ? "pagado" : "pagado"),
  );
  const [fechaAcreditacion, setFechaAcreditacion] = useState(
    movimientoAEditar?.fecha_acreditacion ?? "",
  );

  // Cheques de terceros (endoso)
  const [chequesEnCartera, setChequesEnCartera] = useState<Cheque[]>([]);
  const [chequeTerceroId, setChequeTerceroId] = useState<string>(
    chequeTerceroInicial?.id ?? "",
  );
  const [endosadoA, setEndosadoA] = useState<string>(
    endosadoAInicial ?? movimientoAEditar?.proveedor ?? "",
  );

  // Cheque propio (emisión)
  const [numeroChequePropio, setNumeroChequePropio] = useState<string>("");
  const [fechaPagoChequePropio, setFechaPagoChequePropio] =
    useState<string>(fechaHoy);
  const [esEcheqPropio, setEsEcheqPropio] = useState<boolean>(false);

  // Comprobante
  const [tieneFactura, setTieneFactura] = useState(
    movimientoAEditar?.tiene_comprobante ?? (tieneFacturaInicial ?? false),
  );
  const [comprobanteTipo, setComprobanteTipo] = useState<TipoComprobanteCompra>(
    movimientoAEditar?.comprobante_tipo ?? (comprobanteTipoInicial ?? "A"),
  );
  const [puntoVenta, setPuntoVenta] = useState<string>(
    movimientoAEditar?.comprobante_punto_venta != null
      ? String(movimientoAEditar.comprobante_punto_venta)
      : "",
  );
  const [numeroComprobante, setNumeroComprobante] = useState<string>(
    movimientoAEditar?.comprobante_numero != null
      ? String(movimientoAEditar.comprobante_numero)
      : "",
  );
  const [cuitProveedor, setCuitProveedor] = useState(
    movimientoAEditar?.proveedor_cuit ?? "",
  );
  const [neto, setNeto] = useState<number | null>(() => {
    if (movimientoAEditar?.neto != null) return movimientoAEditar.neto;
    if (tieneFacturaInicial && montoInicial && (comprobanteTipoInicial ?? "A") === "A") {
      return +(montoInicial / 1.21).toFixed(2);
    }
    return montoInicial ?? null;
  });
  const [iva, setIva] = useState<number | null>(() => {
    if (movimientoAEditar?.iva != null) return movimientoAEditar.iva;
    if (tieneFacturaInicial && montoInicial && (comprobanteTipoInicial ?? "A") === "A") {
      const n = +(montoInicial / 1.21).toFixed(2);
      return +(montoInicial - n).toFixed(2);
    }
    return null;
  });
  const [archivoComprobante, setArchivoComprobante] = useState<File | null>(
    null,
  );
  const [comprobantePath] = useState<string | null>(
    movimientoAEditar?.comprobante_path ?? null,
  );

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [categorias, setCategorias] = useState<CategoriaMovimiento[]>([]);
  const [proveedoresSugeridos, setProveedoresSugeridos] = useState<string[]>(
    [],
  );

  const [guardando, setGuardando] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  // Cargar cuentas activas
  useEffect(() => {
    supabase
      .from("cuentas")
      .select("*")
      .eq("activa", true)
      .order("orden", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setCuentas(data);
          if (!movimientoAEditar) {
            if (data.length > 0 && !cuentaId) {
              setCuentaId(data[0].id);
            }
            if (data.length > 1 && !cuentaDestinoId) {
              setCuentaDestinoId(data[1].id);
            }
          }
        }
      });
  }, [movimientoAEditar]);

  // Cargar categorías según ámbito y tipo
  useEffect(() => {
    if (tipo === "transferencia") return;
    if (!ambito) {
      setCategorias([]);
      setCategoriaId("");
      return;
    }
    supabase
      .from("categorias_movimiento")
      .select("*")
      .eq("activa", true)
      .eq("ambito", ambito)
      .eq("tipo", tipo)
      .order("orden", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setCategorias(data);
          if (!movimientoAEditar && data.length > 0) {
            if (categoriaNombreInicial) {
              const catEncontrada = data.find(
                (c) =>
                  c.nombre.toLowerCase().trim() ===
                  categoriaNombreInicial.toLowerCase().trim(),
              );
              if (catEncontrada) {
                setCategoriaId(catEncontrada.id);
                return;
              }
            }
            if (!categoriaId) {
              setCategoriaId(data[0].id);
            }
          }
        }
      });
  }, [ambito, tipo, movimientoAEditar, categoriaNombreInicial]);

  // Cargar cheques en cartera para endoso (solo egresos)
  useEffect(() => {
    if (tipo !== "egreso") return;
    supabase
      .from("cheques")
      .select("*, clientes(nombre)")
      .eq("tipo", "recibido")
      .eq("estado", "en_cartera")
      .order("fecha_pago", { ascending: true })
      .then(({ data }) => {
        if (data) {
          let lista = data as Cheque[];
          if (
            chequeTerceroInicial &&
            !lista.some((c) => c.id === chequeTerceroInicial.id)
          ) {
            lista = [chequeTerceroInicial, ...lista];
          }
          setChequesEnCartera(lista);
          if (chequeTerceroInicial) {
            setChequeTerceroId(chequeTerceroInicial.id);
            setMonto(chequeTerceroInicial.monto);
          }
        }
      });
  }, [tipo, chequeTerceroInicial]);

  const handleSeleccionarChequeTercero = (id: string) => {
    setChequeTerceroId(id);
    const ch = chequesEnCartera.find((c) => c.id === id);
    if (ch) {
      setMonto(ch.monto);
      if (!endosadoA && proveedor) {
        setEndosadoA(proveedor);
      }
    }
  };

  // Cargar proveedores ya usados para datalist
  useEffect(() => {
    supabase
      .from("movimientos_caja")
      .select("proveedor")
      .not("proveedor", "is", null)
      .then(({ data }) => {
        if (data) {
          const unicos = Array.from(
            new Set(
              data
                .map((d) => d.proveedor?.trim())
                .filter((p): p is string => Boolean(p)),
            ),
          ).sort();
          setProveedoresSugeridos(unicos);
        }
      });
  }, []);

  // Recálculo cuando cambia el Monto general
  const handleMontoChange = (val: number | null) => {
    setMonto(val);
    if (val != null && val > 0 && tieneFactura) {
      if (comprobanteTipo === "A") {
        const n = +(val / 1.21).toFixed(2);
        const i = +(val - n).toFixed(2);
        setNeto(n);
        setIva(i);
      } else {
        setNeto(val);
        setIva(null);
      }
    }
  };

  // Recálculo cuando cambia el Neto
  const handleNetoChange = (nuevoNeto: number | null) => {
    setNeto(nuevoNeto);
    if (nuevoNeto != null && nuevoNeto > 0 && comprobanteTipo === "A") {
      const ivaSugerido = +(nuevoNeto * 0.21).toFixed(2);
      setIva(ivaSugerido);
      setMonto(+(nuevoNeto + ivaSugerido).toFixed(2));
    } else {
      setMonto(nuevoNeto);
      setIva(null);
    }
  };

  // Recálculo cuando cambia el IVA
  const handleIvaChange = (nuevoIva: number | null) => {
    setIva(nuevoIva);
    const n = neto || 0;
    const i = nuevoIva || 0;
    if (n > 0) {
      setMonto(+(n + i).toFixed(2));
    }
  };

  // Cambio de tipo de comprobante
  const handleTipoComprobanteChange = (nuevoTipo: TipoComprobanteCompra) => {
    setComprobanteTipo(nuevoTipo);
    const n = neto || 0;
    if (n > 0) {
      if (nuevoTipo === "A") {
        const ivaSugerido = +(n * 0.21).toFixed(2);
        setIva(ivaSugerido);
        setMonto(+(n + ivaSugerido).toFixed(2));
      } else {
        setIva(null);
        setMonto(n);
      }
    }
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorValidacion(null);
    setErrorAmbito(null);

    if (tipo !== "transferencia" && !ambito) {
      setErrorAmbito("Elegí si es un gasto de la empresa o personal");
      return;
    }

    if (medio === "cheque_terceros") {
      if (!chequeTerceroId) {
        setErrorValidacion(
          "Debés seleccionar un cheque de terceros en cartera.",
        );
        return;
      }
      if (!endosadoA.trim()) {
        setErrorValidacion("Debés indicar a quién se endosa el cheque.");
        return;
      }
    } else if (medio === "cheque_propio") {
      if (!cuentaId) {
        setErrorValidacion(
          "Debés seleccionar la cuenta bancaria del cheque propio.",
        );
        return;
      }
      if (!fechaPagoChequePropio) {
        setErrorValidacion("Debés indicar la fecha de pago del cheque propio.");
        return;
      }
    } else if (tipo === "transferencia") {
      if (!cuentaId || !cuentaDestinoId) {
        setErrorValidacion(
          "Debés seleccionar la cuenta origen y la cuenta destino.",
        );
        return;
      }
      if (cuentaId === cuentaDestinoId) {
        setErrorValidacion(
          "La cuenta origen y la cuenta destino no pueden ser la misma.",
        );
        return;
      }
    } else {
      if (!cuentaId) {
        setErrorValidacion("Debés seleccionar una cuenta.");
        return;
      }
    }

    if (!monto || monto <= 0) {
      setErrorValidacion("El monto debe ser mayor a 0.");
      return;
    }

    setGuardando(true);

    try {
      const idRegistro = movimientoAEditar?.id ?? crypto.randomUUID();
      let pathFinal = comprobantePath;

      // Subir archivo a Storage si se seleccionó uno nuevo
      if (archivoComprobante) {
        const ext = archivoComprobante.name.split(".").pop() || "jpg";
        const nombreArchivo = `${Date.now()}.${ext}`;
        const storagePath = `comprobantes/${idRegistro}/${nombreArchivo}`;

        const { error: uploadError } = await supabase.storage
          .from("adjuntos")
          .upload(storagePath, archivoComprobante, { upsert: true });

        if (uploadError) {
          throw new Error(`Error al subir comprobante: ${uploadError.message}`);
        }
        pathFinal = storagePath;
      }

      const datos = {
        fecha,
        tipo,
        ambito: tipo === "transferencia" ? null : ambito,
        categoria_id: tipo === "transferencia" ? null : categoriaId || null,
        proveedor: tipo === "transferencia" ? null : proveedor.trim() || null,
        descripcion: descripcion.trim() || null,
        medio: tipo === "transferencia" ? "transferencia" : medio,
        cuenta_id: cuentaId,
        cuenta_destino_id: tipo === "transferencia" ? cuentaDestinoId : null,
        monto: monto,
        estado,
        fecha_acreditacion:
          estado === "pendiente" ? fechaAcreditacion || null : null,
        tiene_comprobante:
          tipo === "egreso" && ambito === "empresa" && tieneFactura,
        comprobante_tipo:
          tipo === "egreso" && ambito === "empresa" && tieneFactura
            ? comprobanteTipo
            : null,
        comprobante_punto_venta:
          tipo === "egreso" &&
          ambito === "empresa" &&
          tieneFactura &&
          puntoVenta
            ? Number(puntoVenta)
            : null,
        comprobante_numero:
          tipo === "egreso" &&
          ambito === "empresa" &&
          tieneFactura &&
          numeroComprobante
            ? Number(numeroComprobante)
            : null,
        proveedor_cuit:
          tipo === "egreso" && ambito === "empresa" && tieneFactura
            ? cuitProveedor.trim() || null
            : null,
        neto:
          tipo === "egreso" &&
          ambito === "empresa" &&
          tieneFactura &&
          neto != null
            ? neto
            : null,
        iva:
          tipo === "egreso" &&
          ambito === "empresa" &&
          tieneFactura &&
          iva != null
            ? iva
            : null,
        comprobante_path:
          tipo === "egreso" && ambito === "empresa" && tieneFactura
            ? pathFinal
            : null,
      };

      if (esEdicion) {
        const { error } = await supabase
          .from("movimientos_caja")
          .update(datos)
          .eq("id", idRegistro);
        if (error) throw error;
      } else if (medio === "cheque_terceros") {
        const datosMov = {
          ...datos,
          cuenta_id: null,
          estado: "pagado" as EstadoMovimiento,
          fecha_acreditacion: null,
          cheque_id: chequeTerceroId,
          proveedor: proveedor.trim() || endosadoA.trim() || null,
        };
        const { error: movError } = await supabase
          .from("movimientos_caja")
          .insert({
            id: idRegistro,
            ...datosMov,
            registrado_por: session?.user?.id ?? null,
          });
        if (movError) throw movError;

        await cambiarEstadoCheque({
          chequeId: chequeTerceroId,
          nuevoEstado: "endosado",
          fecha,
          endosadoA: endosadoA.trim(),
          movimientoId: idRegistro,
          nota: `Endosado para pago a ${endosadoA.trim()}`,
        });
      } else if (medio === "cheque_propio") {
        const chId = crypto.randomUUID();
        const datosMov = {
          ...datos,
          cuenta_id: cuentaId,
          estado: "pendiente" as EstadoMovimiento,
          fecha_acreditacion: fechaPagoChequePropio,
          cheque_id: null,
        };
        // 1. Insert movimiento
        const { error: movError } = await supabase
          .from("movimientos_caja")
          .insert({
            id: idRegistro,
            ...datosMov,
            registrado_por: session?.user?.id ?? null,
          });
        if (movError) throw movError;

        // 2. Insert cheque emitido vinculado al movimiento
        const { error: chError } = await supabase.from("cheques").insert({
          id: chId,
          tipo: "emitido",
          estado: "emitido",
          cuenta_id: cuentaId,
          pagado_a: proveedor.trim() || null,
          monto: monto,
          fecha_emision: fecha,
          fecha_pago: fechaPagoChequePropio,
          numero: numeroChequePropio.trim() || null,
          es_echeq: esEcheqPropio,
          movimiento_id: idRegistro,
        });
        if (chError) throw chError;

        // 3. Vincular cheque_id al movimiento
        const { error: updateMovError } = await supabase
          .from("movimientos_caja")
          .update({ cheque_id: chId })
          .eq("id", idRegistro);
        if (updateMovError) throw updateMovError;
      } else {
        const { error } = await supabase.from("movimientos_caja").insert({
          id: idRegistro,
          ...datos,
          registrado_por: session?.user?.id ?? null,
        });
        if (error) throw error;
      }

      if (onGuardadoConId) {
        onGuardadoConId(idRegistro);
      }
      onGuardado();
    } catch (err: any) {
      setErrorValidacion(
        err.message || "Ocurrió un error al guardar el movimiento.",
      );
      setGuardando(false);
    }
  };

  const titulo = esEdicion
    ? tipo === "egreso"
      ? "Editar gasto"
      : tipo === "ingreso"
        ? "Editar ingreso"
        : "Editar transferencia"
    : tipo === "egreso"
      ? "Nuevo gasto"
      : tipo === "ingreso"
        ? "Nuevo ingreso"
        : "Transferencia";

  return (
    <Tarjeta className="p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-borde">
        <h2 className="text-base font-semibold text-tinta">{titulo}</h2>
        <button
          type="button"
          onClick={onCancelar}
          className="text-xs text-tinta-suave hover:text-tinta"
        >
          Cerrar
        </button>
      </div>

      <form onSubmit={handleGuardar} className="space-y-4 pb-[72px] md:pb-0">
        {/* Ámbito */}
        {tipo !== "transferencia" && (
          <div>
            <Etiqueta>Ámbito</Etiqueta>
            <div className="grid grid-cols-2 gap-2 max-w-xs">
              <Opcion
                activa={ambito === "empresa"}
                onClick={() => {
                  setAmbito("empresa");
                  setErrorAmbito(null);
                }}
              >
                Empresa
              </Opcion>
              <Opcion
                activa={ambito === "personal"}
                onClick={() => {
                  setAmbito("personal");
                  setErrorAmbito(null);
                }}
              >
                Personal
              </Opcion>
            </div>
            {errorAmbito && (
              <p className="text-sm text-peligro mt-1.5">{errorAmbito}</p>
            )}
          </div>
        )}

        {/* Fecha y Categoría */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo etiqueta="Fecha" id="fecha_movimiento">
            <Entrada
              id="fecha_movimiento"
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Campo>

          {tipo !== "transferencia" && (
            <Campo etiqueta="Categoría" id="categoria_movimiento">
              <Selector
                id="categoria_movimiento"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Seleccionar categoría...
                </option>
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
          )}
        </div>

        {/* Proveedor / Origen y Descripción */}
        {tipo !== "transferencia" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo
              etiqueta={tipo === "egreso" ? "Proveedor" : "Origen / Cliente"}
              id="proveedor_movimiento"
            >
              <Entrada
                id="proveedor_movimiento"
                list="proveedores-sugeridos"
                placeholder={
                  tipo === "egreso"
                    ? "Ej. YPF, Edesur..."
                    : "Ej. Particular, Venta..."
                }
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
              />
              <datalist id="proveedores-sugeridos">
                {proveedoresSugeridos.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Campo>

            <Campo etiqueta="Descripción" id="desc_movimiento">
              <Entrada
                id="desc_movimiento"
                placeholder="Detalle del movimiento"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </Campo>
          </div>
        )}

        {tipo === "transferencia" && (
          <Campo etiqueta="Descripción" id="desc_movimiento">
            <Entrada
              id="desc_movimiento"
              placeholder="Motivo de la transferencia (opcional)"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </Campo>
        )}

        {/* Monto y Medio */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo etiqueta="Monto" id="monto_movimiento">
            <EntradaMonto
              id="monto_movimiento"
              required
              disabled={medio === "cheque_terceros"}
              valor={monto}
              onChange={handleMontoChange}
            />
            {medio === "cheque_terceros" && (
              <span className="text-[11px] text-tinta-suave block mt-1">
                El monto queda fijado al valor del cheque endosado.
              </span>
            )}
          </Campo>

          {tipo !== "transferencia" ? (
            <div>
              <Etiqueta>Medio</Etiqueta>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {(tipo === "egreso" ? MEDIOS_EGRESO : MEDIOS_INGRESO).map(
                  (m) => (
                    <Opcion
                      key={m.id}
                      activa={medio === m.id}
                      onClick={() => {
                        setMedio(m.id);
                        if (m.id === "cheque_terceros") {
                          setEstado("pagado");
                        } else if (m.id === "cheque_propio") {
                          setEstado("pendiente");
                        }
                      }}
                    >
                      {m.label}
                    </Opcion>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div />
          )}
        </div>

        {/* Campos adicionales para Cheque de terceros */}
        {tipo === "egreso" && medio === "cheque_terceros" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-fondo rounded-lg border border-borde">
            <Campo etiqueta="Cheque en cartera" id="cheque_tercero_sel">
              {chequesEnCartera.length === 0 ? (
                <p className="text-xs text-peligro mt-1">
                  No hay cheques en cartera disponibles para endosar.
                </p>
              ) : (
                <Selector
                  id="cheque_tercero_sel"
                  value={chequeTerceroId}
                  onChange={(e) =>
                    handleSeleccionarChequeTercero(e.target.value)
                  }
                  required
                >
                  <option value="" disabled>
                    Seleccionar cheque a endosar...
                  </option>
                  {chequesEnCartera.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {formatearEtiquetaChequeTercero(ch)}
                    </option>
                  ))}
                </Selector>
              )}
            </Campo>

            <Campo etiqueta="Endosado a" id="endosado_a_input">
              <Entrada
                id="endosado_a_input"
                placeholder="Persona o empresa beneficiaria"
                value={endosadoA}
                onChange={(e) => setEndosadoA(e.target.value)}
                required
              />
            </Campo>
          </div>
        )}

        {/* Campos adicionales para Cheque propio */}
        {tipo === "egreso" && medio === "cheque_propio" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-fondo rounded-lg border border-borde">
            <Campo etiqueta="Número de cheque" id="num_cheque_propio">
              <Entrada
                id="num_cheque_propio"
                placeholder="Ej: 00045231"
                value={numeroChequePropio}
                onChange={(e) => setNumeroChequePropio(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Fecha de pago" id="fecha_pago_cheque_propio">
              <Entrada
                id="fecha_pago_cheque_propio"
                type="date"
                required
                value={fechaPagoChequePropio}
                onChange={(e) => setFechaPagoChequePropio(e.target.value)}
              />
            </Campo>

            <div className="sm:col-span-2 flex items-center pt-1">
              <label className="flex items-center gap-2 text-sm font-medium text-tinta cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={esEcheqPropio}
                  onChange={(e) => setEsEcheqPropio(e.target.checked)}
                  className="size-4 rounded border-borde text-marca focus:ring-marca"
                />
                Es E-cheq
              </label>
            </div>
          </div>
        )}

        {/* Cuenta(s) */}
        {tipo === "transferencia" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Cuenta origen" id="cuenta_origen">
              <Selector
                id="cuenta_origen"
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Seleccionar cuenta origen...
                </option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>

            <Campo etiqueta="Cuenta destino" id="cuenta_destino">
              <Selector
                id="cuenta_destino"
                value={cuentaDestinoId}
                onChange={(e) => setCuentaDestinoId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Seleccionar cuenta destino...
                </option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>
        ) : medio === "cheque_terceros" ? (
          <div className="text-xs text-tinta-suave italic">
            El cheque de terceros no afecta ninguna cuenta bancaria; el valor se
            transfiere por endoso.
          </div>
        ) : (
          <Campo
            etiqueta={
              medio === "cheque_propio"
                ? "Cuenta bancaria (chequera)"
                : "Cuenta"
            }
            id="cuenta_movimiento"
          >
            <Selector
              id="cuenta_movimiento"
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              required
            >
              <option value="" disabled>
                Seleccionar cuenta...
              </option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
        )}

        {/* Estado y Fecha de acreditación */}
        {medio === "cheque_terceros" ? (
          <p className="text-xs text-tinta-suave">
            El egreso queda registrado como{" "}
            <strong className="text-tinta">pagado</strong> con el cheque
            endosado.
          </p>
        ) : medio === "cheque_propio" ? (
          <p className="text-xs text-tinta-suave">
            El egreso queda <strong className="text-tinta">pendiente</strong>{" "}
            hasta la fecha de pago, cuando se debitará de la cuenta.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Etiqueta>Estado</Etiqueta>
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                <Opcion
                  activa={estado === "pagado"}
                  onClick={() => setEstado("pagado")}
                >
                  Pagado
                </Opcion>
                <Opcion
                  activa={estado === "pendiente"}
                  onClick={() => setEstado("pendiente")}
                >
                  Pendiente
                </Opcion>
              </div>
            </div>

            {estado === "pendiente" && (
              <Campo etiqueta="Fecha de acreditación" id="fecha_acred_mov">
                <Entrada
                  id="fecha_acred_mov"
                  type="date"
                  value={fechaAcreditacion}
                  onChange={(e) => setFechaAcreditacion(e.target.value)}
                />
              </Campo>
            )}
          </div>
        )}

        {/* Checkbox "Tiene factura" (solo egresos de empresa) */}
        {tipo === "egreso" && ambito === "empresa" && (
          <div className="pt-2 border-t border-borde space-y-4">
            <label className="flex items-center gap-2.5 text-sm font-medium text-tinta cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tieneFactura}
                onChange={(e) => setTieneFactura(e.target.checked)}
                className="size-4 rounded border-borde text-marca focus:ring-marca cursor-pointer"
              />
              Tiene factura / comprobante
            </label>

            {tieneFactura && (
              <div className="space-y-4 pl-6 border-l-2 border-marca/30 bg-fondo/50 p-4 rounded-r-md">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Campo etiqueta="Tipo de comprobante" id="comp_tipo">
                    <Selector
                      id="comp_tipo"
                      value={comprobanteTipo}
                      onChange={(e) =>
                        handleTipoComprobanteChange(
                          e.target.value as TipoComprobanteCompra,
                        )
                      }
                    >
                      {TIPOS_COMPROBANTE.map((tc) => (
                        <option key={tc.id} value={tc.id}>
                          {tc.label}
                        </option>
                      ))}
                    </Selector>
                  </Campo>

                  <Campo etiqueta="Punto de venta" id="comp_pv">
                    <Entrada
                      id="comp_pv"
                      type="number"
                      min="1"
                      max="99999"
                      placeholder="1"
                      value={puntoVenta}
                      onChange={(e) => setPuntoVenta(e.target.value)}
                    />
                  </Campo>

                  <Campo etiqueta="Número" id="comp_num">
                    <Entrada
                      id="comp_num"
                      type="number"
                      min="1"
                      placeholder="Nº comprobante"
                      value={numeroComprobante}
                      onChange={(e) => setNumeroComprobante(e.target.value)}
                    />
                  </Campo>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Campo etiqueta="CUIT del proveedor" id="comp_cuit">
                    <Entrada
                      id="comp_cuit"
                      placeholder="30-..."
                      value={cuitProveedor}
                      onChange={(e) => setCuitProveedor(e.target.value)}
                    />
                  </Campo>

                  <Campo etiqueta="Neto" id="comp_neto">
                    <EntradaMonto
                      id="comp_neto"
                      valor={neto}
                      onChange={handleNetoChange}
                    />
                  </Campo>

                  <Campo etiqueta="IVA" id="comp_iva">
                    <EntradaMonto
                      id="comp_iva"
                      valor={iva}
                      onChange={handleIvaChange}
                    />
                  </Campo>
                </div>

                {/* Adjuntar foto de comprobante */}
                <div>
                  <Etiqueta htmlFor="comp_archivo">
                    Foto del comprobante
                  </Etiqueta>
                  <input
                    id="comp_archivo"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setArchivoComprobante(e.target.files[0]);
                      }
                    }}
                    className="block w-full text-xs text-tinta-suave file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-marca-suave file:text-marca hover:file:bg-marca hover:file:text-white cursor-pointer"
                  />
                  {comprobantePath && !archivoComprobante && (
                    <p className="mt-1 text-xs text-ok">
                      Ya tiene comprobante adjunto:{" "}
                      {comprobantePath.split("/").pop()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {errorValidacion && <Aviso variante="peligro">{errorValidacion}</Aviso>}

        <BarraAcciones>
          <Boton
            type="button"
            variante="secundario"
            onClick={onCancelar}
            disabled={guardando}
          >
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </Boton>
        </BarraAcciones>
      </form>
    </Tarjeta>
  );
}
