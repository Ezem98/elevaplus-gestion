import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type {
  TipoMovimiento,
  AmbitoMovimiento,
  EstadoMovimiento,
  MedioPago,
  TipoComprobanteCompra,
  Cuenta,
  CategoriaMovimiento,
  MovimientoCaja,
} from "@/lib/tipos";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { BarraAcciones } from "@/components/ui/BarraAcciones";
import { Campo, Entrada, Etiqueta, Selector } from "@/components/ui/Campo";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { Aviso } from "@/components/ui/Aviso";

interface PropsFormularioMovimiento {
  tipoInicial: TipoMovimiento;
  ambitoInicial?: AmbitoMovimiento | null;
  movimientoAEditar?: MovimientoCaja | null;
  onGuardado: () => void;
  onCancelar: () => void;
}

const MEDIOS: { id: MedioPago; label: string }[] = [
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

export function FormularioMovimiento({
  tipoInicial,
  ambitoInicial,
  movimientoAEditar,
  onGuardado,
  onCancelar,
}: PropsFormularioMovimiento) {
  const { session } = useAuth();
  const fechaHoy = new Date().toISOString().slice(0, 10);

  const tipo = movimientoAEditar ? movimientoAEditar.tipo : tipoInicial;
  const esEdicion = !!movimientoAEditar;

  const [ambito, setAmbito] = useState<AmbitoMovimiento | null>(
    movimientoAEditar?.ambito ?? (tipo === "transferencia" ? null : ambitoInicial ?? null)
  );
  const [errorAmbito, setErrorAmbito] = useState<string | null>(null);
  const [fecha, setFecha] = useState(movimientoAEditar?.fecha ?? fechaHoy);
  const [categoriaId, setCategoriaId] = useState<string>(
    movimientoAEditar?.categoria_id ?? ""
  );
  const [proveedor, setProveedor] = useState(
    movimientoAEditar?.proveedor ?? ""
  );
  const [descripcion, setDescripcion] = useState(
    movimientoAEditar?.descripcion ?? ""
  );
  const [monto, setMonto] = useState<number | null>(
    movimientoAEditar?.monto ?? null
  );
  const [medio, setMedio] = useState<MedioPago>(
    movimientoAEditar?.medio ?? (tipo === "transferencia" ? "transferencia" : "efectivo")
  );
  const [cuentaId, setCuentaId] = useState<string>(
    movimientoAEditar?.cuenta_id ?? ""
  );
  const [cuentaDestinoId, setCuentaDestinoId] = useState<string>(
    movimientoAEditar?.cuenta_destino_id ?? ""
  );
  const [estado, setEstado] = useState<EstadoMovimiento>(
    movimientoAEditar?.estado ?? "pagado"
  );
  const [fechaAcreditacion, setFechaAcreditacion] = useState(
    movimientoAEditar?.fecha_acreditacion ?? ""
  );

  // Comprobante
  const [tieneFactura, setTieneFactura] = useState(
    movimientoAEditar?.tiene_comprobante ?? false
  );
  const [comprobanteTipo, setComprobanteTipo] = useState<TipoComprobanteCompra>(
    movimientoAEditar?.comprobante_tipo ?? "A"
  );
  const [puntoVenta, setPuntoVenta] = useState<string>(
    movimientoAEditar?.comprobante_punto_venta != null
      ? String(movimientoAEditar.comprobante_punto_venta)
      : ""
  );
  const [numeroComprobante, setNumeroComprobante] = useState<string>(
    movimientoAEditar?.comprobante_numero != null
      ? String(movimientoAEditar.comprobante_numero)
      : ""
  );
  const [cuitProveedor, setCuitProveedor] = useState(
    movimientoAEditar?.proveedor_cuit ?? ""
  );
  const [neto, setNeto] = useState<number | null>(
    movimientoAEditar?.neto ?? null
  );
  const [iva, setIva] = useState<number | null>(
    movimientoAEditar?.iva ?? null
  );
  const [archivoComprobante, setArchivoComprobante] = useState<File | null>(null);
  const [comprobantePath] = useState<string | null>(
    movimientoAEditar?.comprobante_path ?? null
  );

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [categorias, setCategorias] = useState<CategoriaMovimiento[]>([]);
  const [proveedoresSugeridos, setProveedoresSugeridos] = useState<string[]>([]);

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
          if (!movimientoAEditar && data.length > 0 && !categoriaId) {
            setCategoriaId(data[0].id);
          }
        }
      });
  }, [ambito, tipo, movimientoAEditar]);

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
                .filter((p): p is string => Boolean(p))
            )
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
    if (nuevoNeto == null || nuevoNeto <= 0) return;

    if (comprobanteTipo === "A") {
      const ivaSugerido = +(nuevoNeto * 0.21).toFixed(2);
      setIva(ivaSugerido);
      setMonto(+(nuevoNeto + ivaSugerido).toFixed(2));
    } else {
      setMonto(nuevoNeto);
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

    if (!monto || monto <= 0) {
      setErrorValidacion("El monto debe ser mayor a 0.");
      return;
    }

    if (tipo === "transferencia") {
      if (!cuentaId || !cuentaDestinoId) {
        setErrorValidacion("Debés seleccionar la cuenta origen y la cuenta destino.");
        return;
      }
      if (cuentaId === cuentaDestinoId) {
        setErrorValidacion("La cuenta origen y la cuenta destino no pueden ser la misma.");
        return;
      }
    } else {
      if (!cuentaId) {
        setErrorValidacion("Debés seleccionar una cuenta.");
        return;
      }
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
        categoria_id: tipo === "transferencia" ? null : (categoriaId || null),
        proveedor: tipo === "transferencia" ? null : (proveedor.trim() || null),
        descripcion: descripcion.trim() || null,
        medio: tipo === "transferencia" ? "transferencia" : medio,
        cuenta_id: cuentaId,
        cuenta_destino_id: tipo === "transferencia" ? cuentaDestinoId : null,
        monto: monto,
        estado,
        fecha_acreditacion: estado === "pendiente" ? (fechaAcreditacion || null) : null,
        tiene_comprobante: tipo === "egreso" && ambito === "empresa" && tieneFactura,
        comprobante_tipo:
          tipo === "egreso" && ambito === "empresa" && tieneFactura
            ? comprobanteTipo
            : null,
        comprobante_punto_venta:
          tipo === "egreso" && ambito === "empresa" && tieneFactura && puntoVenta
            ? Number(puntoVenta)
            : null,
        comprobante_numero:
          tipo === "egreso" && ambito === "empresa" && tieneFactura && numeroComprobante
            ? Number(numeroComprobante)
            : null,
        proveedor_cuit:
          tipo === "egreso" && ambito === "empresa" && tieneFactura
            ? (cuitProveedor.trim() || null)
            : null,
        neto:
          tipo === "egreso" && ambito === "empresa" && tieneFactura && neto != null
            ? neto
            : null,
        iva:
          tipo === "egreso" && ambito === "empresa" && tieneFactura && iva != null
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
      } else {
        const { error } = await supabase.from("movimientos_caja").insert({
          id: idRegistro,
          ...datos,
          registrado_por: session?.user?.id ?? null,
        });
        if (error) throw error;
      }

      onGuardado();
    } catch (err: any) {
      setErrorValidacion(err.message || "Ocurrió un error al guardar el movimiento.");
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
                placeholder={tipo === "egreso" ? "Ej. YPF, Edesur..." : "Ej. Particular, Venta..."}
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
              valor={monto}
              onChange={handleMontoChange}
            />
          </Campo>

          {tipo !== "transferencia" ? (
            <div>
              <Etiqueta>Medio</Etiqueta>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {MEDIOS.map((m) => (
                  <Opcion
                    key={m.id}
                    activa={medio === m.id}
                    onClick={() => setMedio(m.id)}
                  >
                    {m.label}
                  </Opcion>
                ))}
              </div>
            </div>
          ) : (
            <div />
          )}
        </div>

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
        ) : (
          <Campo etiqueta="Cuenta" id="cuenta_movimiento">
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
                          e.target.value as TipoComprobanteCompra
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
                  <Etiqueta htmlFor="comp_archivo">Foto del comprobante</Etiqueta>
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
                      Ya tiene comprobante adjunto: {comprobantePath.split("/").pop()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {errorValidacion && (
          <Aviso variante="peligro">{errorValidacion}</Aviso>
        )}

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
