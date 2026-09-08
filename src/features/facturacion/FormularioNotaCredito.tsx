import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Factura, TipoFactura } from "@/lib/tipos";
import { Boton } from "@/components/ui/Boton";
import { Entrada, Etiqueta, AreaTexto } from "@/components/ui/Campo";
import { Aviso } from "@/components/ui/Aviso";

interface FormularioNotaCreditoProps {
  facturaOriginal: Factura;
  onGuardado: () => void;
  onCancelar: () => void;
}

export function FormularioNotaCredito({
  facturaOriginal,
  onGuardado,
  onCancelar,
}: FormularioNotaCreditoProps) {
  const tipoNC: TipoFactura = facturaOriginal.tipo === "A" ? "NC_A" : "NC_B";

  const [puntoVenta, setPuntoVenta] = useState<number>(facturaOriginal.punto_venta);
  const [numero, setNumero] = useState<string>("");
  const [numeroModificadoManualmente, setNumeroModificadoManualmente] = useState(false);
  const [esNumeroSugerido, setEsNumeroSugerido] = useState(false);
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState<number>(facturaOriginal.total);
  const [motivo, setMotivo] = useState<string>("");

  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  useEffect(() => {
    if (numeroModificadoManualmente) return;

    let cancelado = false;
    async function consultarUltimoNumero() {
      const { data } = await supabase
        .from("facturas")
        .select("numero")
        .eq("tipo", tipoNC)
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
  }, [tipoNC, puntoVenta, numeroModificadoManualmente]);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numero.trim()) {
      setErrorGuardar("El número de comprobante es obligatorio.");
      return;
    }
    if (!motivo.trim()) {
      setErrorGuardar("El motivo de la nota de crédito es obligatorio.");
      return;
    }
    if (monto <= 0) {
      setErrorGuardar("El monto debe ser mayor a 0.");
      return;
    }

    setGuardando(true);
    setErrorGuardar(null);

    const numParsed = parseInt(numero, 10);
    const pvParsed = Number(puntoVenta) || facturaOriginal.punto_venta;

    // Calcular desglose neto/iva proporcional
    let netoNC = monto;
    let ivaNC = 0;
    if (facturaOriginal.total > 0) {
      const ratio = monto / facturaOriginal.total;
      netoNC = Math.round((facturaOriginal.neto * ratio + Number.EPSILON) * 100) / 100;
      ivaNC = Math.round((facturaOriginal.iva * ratio + Number.EPSILON) * 100) / 100;
    }

    try {
      const { error: errInsert } = await supabase.from("facturas").insert({
        tipo: tipoNC,
        punto_venta: pvParsed,
        numero: numParsed,
        fecha,
        cliente_id: facturaOriginal.cliente_id,
        neto: netoNC,
        iva: ivaNC,
        total: monto,
        notas: motivo.trim(),
        factura_asociada_id: facturaOriginal.id,
      });

      if (errInsert) {
        if (errInsert.code === "23505") {
          setErrorGuardar("Ya existe una nota de crédito con ese número en ese punto de venta.");
        } else {
          setErrorGuardar(errInsert.message || "Error al registrar la nota de crédito.");
        }
        setGuardando(false);
        return;
      }

      // Si el monto cubre el total o más, anular factura original y revertir servicios
      if (monto >= facturaOriginal.total) {
        // Consultar servicios vinculados a la factura original
        const { data: servs, error: errFetchServs } = await supabase
          .from("servicios")
          .select("id, monto, monto_cobrado")
          .eq("factura_id", facturaOriginal.id);

        if (errFetchServs) throw errFetchServs;

        // Marcar anulada la factura
        const { error: errAnular } = await supabase
          .from("facturas")
          .update({ anulada: true })
          .eq("id", facturaOriginal.id);

        if (errAnular) throw errAnular;

        // Desvincular factura_id en servicios
        const { error: errServs } = await supabase
          .from("servicios")
          .update({ factura_id: null })
          .eq("factura_id", facturaOriginal.id);

        if (errServs) throw errServs;

        // Por cada servicio cambiar estado con RPC cambiar_estado
        if (servs && servs.length > 0) {
          for (const s of servs) {
            const nuevoEstado =
              Number(s.monto_cobrado) >= Number(s.monto) ? "cobrado" : "terminado";
            const { error: rpcErr } = await supabase.rpc("cambiar_estado", {
              p_servicio_id: s.id,
              p_nuevo: nuevoEstado,
              p_nota: `Factura anulada por NC ${numParsed}`,
            });

            if (rpcErr) {
              setErrorGuardar("Solo la administradora puede anular facturas.");
              setGuardando(false);
              return;
            }
          }
        }
      }

      onGuardado();
    } catch (err: any) {
      setErrorGuardar(err.message || "Ocurrió un error al registrar la nota de crédito.");
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={handleGuardar} className="mt-3 p-4 rounded-lg border border-borde bg-fondo space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-borde">
        <h3 className="text-sm font-semibold text-tinta">
          Registrar nota de crédito ({tipoNC === "NC_A" ? "NC A" : "NC B"})
        </h3>
        <span className="text-xs text-tinta-suave">
          Factura original: {facturaOriginal.tipo} {String(facturaOriginal.punto_venta).padStart(4, "0")}-{String(facturaOriginal.numero).padStart(8, "0")}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <Etiqueta htmlFor="nc_pv">Punto de venta</Etiqueta>
          <Entrada
            id="nc_pv"
            type="number"
            min={1}
            value={puntoVenta}
            onChange={(e) => setPuntoVenta(parseInt(e.target.value, 10) || 1)}
            required
          />
        </div>

        <div>
          <Etiqueta htmlFor="nc_num">Número</Etiqueta>
          <Entrada
            id="nc_num"
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
          <Etiqueta htmlFor="nc_fecha">Fecha</Etiqueta>
          <Entrada
            id="nc_fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </div>

        <div>
          <Etiqueta htmlFor="nc_monto">Monto total</Etiqueta>
          <Entrada
            id="nc_monto"
            type="number"
            step="0.01"
            min={0.01}
            value={monto}
            onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
            required
          />
        </div>
      </div>

      <div>
        <Etiqueta htmlFor="nc_motivo">Motivo (obligatorio)</Etiqueta>
        <AreaTexto
          id="nc_motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo de la emisión de la nota de crédito..."
          required
          className="h-16"
        />
      </div>

      {errorGuardar && <Aviso variante="peligro">{errorGuardar}</Aviso>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton type="submit" disabled={guardando}>
          {guardando ? "Registrando..." : "Registrar nota de crédito"}
        </Boton>
      </div>
    </form>
  );
}
