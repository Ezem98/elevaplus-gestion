import { useEffect, useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PUNTO_VENTA_DEFAULT } from "@/lib/config";
import { formatearMontoEntrada, formatearPesos } from "@/lib/formato";
import { sugerirTipoFactura, calcularTotales } from "@/lib/facturacion";
import type { CondicionIva, Servicio, TipoFactura } from "@/lib/tipos";
import { ETIQUETA_CONDICION_IVA, ETIQUETA_TIPO } from "@/lib/tipos";
import { Boton } from "@/components/ui/Boton";
import { BarraAcciones } from "@/components/ui/BarraAcciones";
import { Entrada, Etiqueta, AreaTexto } from "@/components/ui/Campo";
import { Aviso } from "@/components/ui/Aviso";
import { useBorrador } from "@/hooks/useBorrador";

interface ClienteFactura {
  id: string;
  nombre: string;
  cuit: string | null;
  condicion_iva: CondicionIva | null;
}

interface FormularioFacturaProps {
  cliente: ClienteFactura;
  servicios: Servicio[];
  onGuardado: () => void;
  onCancelar: () => void;
}

export function FormularioFactura({
  cliente,
  servicios,
  onGuardado,
  onCancelar,
}: FormularioFacturaProps) {
  const [tipo, setTipo] = useState<"A" | "B">(() => sugerirTipoFactura(cliente.condicion_iva));
  const [puntoVenta, setPuntoVenta] = useState<number>(PUNTO_VENTA_DEFAULT);
  const [numero, setNumero] = useState<string>("");
  const [numeroModificadoManualmente, setNumeroModificadoManualmente] = useState(false);
  const [esNumeroSugerido, setEsNumeroSugerido] = useState(false);
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState<string>("");

  const [cotizaciones, setCotizaciones] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const s of servicios) {
      if (s.moneda === "USD") {
        init[s.id] = s.cotizacion ? Number(s.cotizacion) : 1250;
      }
    }
    return init;
  });

  const [copiado, setCopiado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const estadoFactura = useMemo(
    () => ({
      tipo,
      puntoVenta,
      numero,
      numeroModificadoManualmente,
      fecha,
      notas,
      cotizaciones,
    }),
    [
      tipo,
      puntoVenta,
      numero,
      numeroModificadoManualmente,
      fecha,
      notas,
      cotizaciones,
    ],
  );

  const claveBorrador = useMemo(() => {
    const idsOrdenados = servicios
      .map((s) => s.id)
      .slice()
      .sort()
      .join("_");
    return `factura_${cliente.id}_${idsOrdenados}`;
  }, [cliente.id, servicios]);

  const { AvisoBorrador, limpiar: limpiarBorrador } = useBorrador(
    claveBorrador,
    estadoFactura,
    {
      tieneContenido: (d) => Boolean(d.numero?.trim() || d.notas?.trim()),
      onRestaurar: (d) => {
        if (d.tipo) setTipo(d.tipo);
        if (d.puntoVenta !== undefined) setPuntoVenta(d.puntoVenta);
        if (d.numero !== undefined) {
          setNumero(d.numero);
          setNumeroModificadoManualmente(Boolean(d.numeroModificadoManualmente));
        }
        if (d.fecha) setFecha(d.fecha);
        if (d.notas !== undefined) setNotas(d.notas);
        if (d.cotizaciones) setCotizaciones(d.cotizaciones);
      },
      onDescartar: () => {
        setNumero("");
        setNumeroModificadoManualmente(false);
        setNotas("");
      },
    },
  );

  useEffect(() => {
    if (numeroModificadoManualmente) return;

    let cancelado = false;
    async function consultarUltimoNumero() {
      const { data } = await supabase
        .from("facturas")
        .select("numero")
        .eq("tipo", tipo)
        .eq("punto_venta", puntoVenta)
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelado) return;

      if (data && data.numero != null) {
        setNumero(String(data.numero + 1));
        setEsNumeroSugerido(true);
      } else {
        setNumero("");
        setEsNumeroSugerido(false);
      }
    }

    consultarUltimoNumero();
    return () => {
      cancelado = true;
    };
  }, [tipo, puntoVenta, numeroModificadoManualmente]);

  const serviciosEfectivos = useMemo(() => {
    return servicios.map((s) => {
      if (s.moneda === "USD") {
        const cotiz =
          cotizaciones[s.id] ?? (s.cotizacion ? Number(s.cotizacion) : 1250);
        const montoPesos =
          Math.round((s.monto_moneda ?? 0) * cotiz * 100) / 100;
        return {
          ...s,
          cotizacion: cotiz,
          monto: montoPesos,
        };
      }
      return s;
    });
  }, [servicios, cotizaciones]);

  const totales = useMemo(
    () => calcularTotales(serviciosEfectivos),
    [serviciosEfectivos],
  );

  const faltaCuitParaA = tipo === "A" && (!cliente.cuit || !cliente.cuit.trim());

  const handleCopiarArca = async () => {
    const lineasServicios = serviciosEfectivos.flatMap((s) => {
      const totalMonto = Number(s.monto) || 0;
      const montoSeguro = Number(s.monto_seguro) || 0;
      const tieneSeguro = s.tipo === "traslado" && montoSeguro > 0;

      if (tieneSeguro) {
        const montoBase = Math.round((totalMonto - montoSeguro) * 100) / 100;
        const seguroImp =
          s.seguro_importe != null ? s.seguro_importe : montoSeguro;
        const descBase =
          s.descripcion?.trim() || `${ETIQUETA_TIPO[s.tipo]} #${s.numero}`;
        return [
          `${descBase} — ${formatearPesos(montoBase)}`,
          `Seguro de carga (IVA incluido: $ ${formatearMontoEntrada(seguroImp)}) — ${formatearPesos(montoSeguro)}`,
        ];
      }

      const desc =
        s.descripcion?.trim() || `${ETIQUETA_TIPO[s.tipo]} #${s.numero}`;
      return [`${desc} — ${formatearPesos(s.monto)}`];
    });

    const texto = [
      `Razón social: ${cliente.nombre}`,
      `CUIT: ${cliente.cuit?.trim() || "Sin CUIT"}`,
      `Condición IVA: ${cliente.condicion_iva ? ETIQUETA_CONDICION_IVA[cliente.condicion_iva] : "—"}`,
      "",
      "Servicios:",
      ...lineasServicios,
      "",
      `Neto: ${formatearPesos(totales.neto)}`,
      `IVA 21%: ${formatearPesos(totales.iva)}`,
      `Total: ${formatearPesos(totales.total)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback si el navegador no permite portapapeles
    }
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numero.trim()) {
      setErrorGuardar("El número de factura es obligatorio.");
      return;
    }
    const pvParsed = Number(puntoVenta);
    if (!pvParsed || pvParsed <= 0) {
      setErrorGuardar("El punto de venta es obligatorio.");
      return;
    }
    if (faltaCuitParaA) {
      setErrorGuardar("Una Factura A requiere CUIT del cliente.");
      return;
    }

    for (const s of servicios) {
      if (s.moneda === "USD") {
        const c = cotizaciones[s.id];
        if (!c || c <= 0) {
          setErrorGuardar(`Falta la cotización del día para el servicio #${s.numero}`);
          return;
        }
      }
    }

    setGuardando(true);
    setErrorGuardar(null);

    const numParsed = parseInt(numero, 10);

    try {
      const p_datos = {
        tipo: tipo as TipoFactura,
        punto_venta: pvParsed,
        numero: numParsed,
        fecha,
        cliente_id: cliente.id,
        neto: totales.neto,
        iva: totales.iva,
        total: totales.total,
        notas: notas.trim() || null,
      };

      const p_servicios = servicios.map((s) => ({
        id: s.id,
        ...(s.moneda === "USD" ? { cotizacion: cotizaciones[s.id] } : {}),
      }));

      const { error: rpcError } = await supabase.rpc("registrar_factura", {
        p_datos,
        p_servicios,
      });

      if (rpcError) {
        if (rpcError.code === "23505" || rpcError.message.includes("unique")) {
          setErrorGuardar(
            "Ya existe una factura con ese número en ese punto de venta.",
          );
        } else {
          setErrorGuardar(rpcError.message || "Error al registrar la factura.");
        }
        setGuardando(false);
        return;
      }

      limpiarBorrador();
      onGuardado();
    } catch (err: any) {
      setErrorGuardar(err.message || "Ocurrió un error inesperado.");
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={handleGuardar} className="mt-4 border-t border-borde pt-4 space-y-4 pb-[72px] md:pb-0">
      <AvisoBorrador />
      {/* Resumen de los servicios incluidos */}
      <div className="rounded-md border border-borde bg-fondo p-3 space-y-2">
        <span className="text-sm font-medium text-tinta-suave block">
          Servicios a incluir ({servicios.length})
        </span>
        <div className="divide-y divide-borde text-sm">
          {servicios.map((s) => {
            const esUsd = s.moneda === "USD";
            const cotiz =
              cotizaciones[s.id] ?? (s.cotizacion ? Number(s.cotizacion) : 1250);
            const montoPesos = esUsd
              ? Math.round((s.monto_moneda ?? 0) * cotiz * 100) / 100
              : s.monto;

            return (
              <div
                key={s.id}
                className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <span className="truncate text-tinta font-medium block">
                    #{s.numero} · {s.descripcion || ETIQUETA_TIPO[s.tipo]}
                  </span>
                  {s.seguro_importe && (
                    <span className="text-xs text-tinta-suave block">
                      incluye seguro $ {formatearMontoEntrada(s.seguro_importe)}
                    </span>
                  )}
                </div>
                {esUsd ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm shrink-0">
                    <span className="tabular-nums font-semibold text-tinta">
                      U$S {(s.monto_moneda ?? 0).toLocaleString("es-AR")}
                    </span>
                    <span className="text-tinta-suave">× cotización</span>
                    <input
                      id={`cotiz_${s.id}`}
                      data-testid="cotizacion-factura"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={cotiz}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCotizaciones((prev) => ({ ...prev, [s.id]: val }));
                      }}
                      className="w-24 h-8 px-2 rounded border border-borde text-sm font-medium tabular-nums text-tinta bg-superficie focus:ring-1 focus:ring-marca"
                    />
                    <span className="text-tinta-suave">=</span>
                    <span className="font-semibold tabular-nums text-tinta">
                      {formatearPesos(montoPesos)}
                    </span>
                  </div>
                ) : (
                  <span className="shrink-0 font-medium tabular-nums text-tinta">
                    {formatearPesos(s.monto)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Desglose de totales */}
        <div className="pt-2 border-t border-borde flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-tinta-suave">Neto: </span>
            <span className="tabular-nums text-tinta">{formatearPesos(totales.neto)}</span>
          </div>
          <div>
            <span className="text-tinta-suave">IVA 21%: </span>
            <span className="tabular-nums text-tinta">{formatearPesos(totales.iva)}</span>
          </div>
          <div className="text-base font-semibold text-tinta">
            <span>Total: </span>
            <span className="tabular-nums">{formatearPesos(totales.total)}</span>
          </div>
        </div>
      </div>

      {/* Tipo de comprobante */}
      <div>
        <Etiqueta>Tipo de factura</Etiqueta>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTipo("A")}
            className={`h-9 px-4 rounded-md text-sm font-medium border transition-colors ${
              tipo === "A"
                ? "border-marca bg-marca text-white"
                : "border-borde bg-superficie text-tinta hover:bg-fondo"
            }`}
          >
            Factura A
          </button>
          <button
            type="button"
            onClick={() => setTipo("B")}
            className={`h-9 px-4 rounded-md text-sm font-medium border transition-colors ${
              tipo === "B"
                ? "border-marca bg-marca text-white"
                : "border-borde bg-superficie text-tinta hover:bg-fondo"
            }`}
          >
            Factura B
          </button>
        </div>
        {faltaCuitParaA && (
          <Aviso variante="alerta" className="mt-2">
            Una Factura A requiere CUIT del cliente
          </Aviso>
        )}
      </div>

      {/* Punto de venta, número y fecha */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Etiqueta htmlFor="pv">Punto de venta</Etiqueta>
          <Entrada
            id="pv"
            type="number"
            min={1}
            value={puntoVenta}
            onChange={(e) => setPuntoVenta(parseInt(e.target.value, 10) || 1)}
            required
          />
        </div>
        <div>
          <Etiqueta htmlFor="numero_factura">Número</Etiqueta>
          <Entrada
            id="numero_factura"
            type="number"
            min={1}
            value={numero}
            onChange={(e) => {
              setNumero(e.target.value);
              setNumeroModificadoManualmente(true);
              setEsNumeroSugerido(false);
            }}
            placeholder="1234"
            required
            autoFocus
          />
          {esNumeroSugerido && (
            <p className="mt-1 text-xs text-tinta-suave">
              Sugerido según la última factura registrada. Verificá con ARCA.
            </p>
          )}
        </div>
        <div>
          <Etiqueta htmlFor="fecha_factura">Fecha</Etiqueta>
          <Entrada
            id="fecha_factura"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Notas opcionales */}
      <div>
        <Etiqueta htmlFor="notas_factura">Notas (opcional)</Etiqueta>
        <AreaTexto
          id="notas_factura"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Observaciones de la factura..."
          className="h-16"
        />
      </div>

      {errorGuardar && <Aviso variante="peligro">{errorGuardar}</Aviso>}

      {/* Botón copiar datos ARCA */}
      <div className="pt-2">
        <Boton
          type="button"
          variante="secundario"
          onClick={handleCopiarArca}
          title="Copia los datos de facturación para cargar en el portal de ARCA"
          className="w-full sm:w-auto"
        >
          {copiado ? (
            <>
              <Check className="size-4" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="size-4" />
              Copiar datos para ARCA
            </>
          )}
        </Boton>
      </div>

      {/* Botones de acción */}
      <BarraAcciones>
        <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton type="submit" disabled={guardando || faltaCuitParaA}>
          {guardando ? "Guardando..." : "Guardar factura"}
        </Boton>
      </BarraAcciones>
    </form>
  );
}
