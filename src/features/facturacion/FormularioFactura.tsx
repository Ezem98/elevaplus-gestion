import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PUNTO_VENTA_DEFAULT } from "@/lib/config";
import { formatearPesos, formatearNumeroFactura } from "@/lib/formato";
import { sugerirTipoFactura, calcularTotales } from "@/lib/facturacion";
import type { CondicionIva, Servicio, TipoFactura } from "@/lib/tipos";
import { ETIQUETA_CONDICION_IVA, ETIQUETA_TIPO } from "@/lib/tipos";
import { Boton } from "@/components/ui/Boton";
import { Entrada, Etiqueta, AreaTexto } from "@/components/ui/Campo";
import { Aviso } from "@/components/ui/Aviso";

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
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState<string>("");

  const [copiado, setCopiado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const totales = useMemo(() => calcularTotales(servicios), [servicios]);

  const faltaCuitParaA = tipo === "A" && (!cliente.cuit || !cliente.cuit.trim());

  const handleCopiarArca = async () => {
    const lineasServicios = servicios.map((s) => {
      const desc = s.descripcion?.trim() || `${ETIQUETA_TIPO[s.tipo]} #${s.numero}`;
      return `${desc} — ${formatearPesos(s.monto)}`;
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
    if (faltaCuitParaA) {
      setErrorGuardar("Una Factura A requiere CUIT del cliente.");
      return;
    }

    setGuardando(true);
    setErrorGuardar(null);

    const numParsed = parseInt(numero, 10);
    const pvParsed = Number(puntoVenta) || PUNTO_VENTA_DEFAULT;

    try {
      const { data: facturaInsertada, error: errInsert } = await supabase
        .from("facturas")
        .insert({
          tipo: tipo as TipoFactura,
          punto_venta: pvParsed,
          numero: numParsed,
          fecha,
          cliente_id: cliente.id,
          neto: totales.neto,
          iva: totales.iva,
          total: totales.total,
          notas: notas.trim() || null,
        })
        .select("id")
        .single();

      if (errInsert) {
        if (errInsert.code === "23505") {
          setErrorGuardar("Ya existe una factura con ese número en ese punto de venta.");
        } else {
          setErrorGuardar(errInsert.message || "Error al crear la factura.");
        }
        setGuardando(false);
        return;
      }

      // Actualizar servicios asociados
      const servicioIds = servicios.map((s) => s.id);
      const { error: errServicios } = await supabase
        .from("servicios")
        .update({ factura_id: facturaInsertada.id })
        .in("id", servicioIds);

      if (errServicios) {
        setErrorGuardar("Factura creada, pero falló al asociar los servicios: " + errServicios.message);
        setGuardando(false);
        return;
      }

      // Cambiar estado de cada servicio a facturado con la RPC
      const numeroFormateado = formatearNumeroFactura(tipo, pvParsed, numParsed);
      for (const s of servicios) {
        await supabase.rpc("cambiar_estado", {
          p_servicio_id: s.id,
          p_nuevo: "facturado",
          p_nota: `Factura ${numeroFormateado}`,
        });
      }

      onGuardado();
    } catch (err: any) {
      setErrorGuardar(err.message || "Ocurrió un error inesperado.");
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={handleGuardar} className="mt-4 border-t border-borde pt-4 space-y-4">
      {/* Resumen de los servicios incluidos */}
      <div className="rounded-md border border-borde bg-fondo p-3 space-y-2">
        <span className="text-xs font-semibold text-tinta-suave uppercase tracking-wider block">
          Servicios a incluir ({servicios.length})
        </span>
        <div className="divide-y divide-borde text-sm">
          {servicios.map((s) => (
            <div key={s.id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="truncate text-tinta">
                #{s.numero} · {s.descripcion || ETIQUETA_TIPO[s.tipo]}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-tinta">
                {formatearPesos(s.monto)}
              </span>
            </div>
          ))}
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
            onChange={(e) => setNumero(e.target.value)}
            placeholder="1234"
            required
            autoFocus
          />
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

      {/* Botones de acción */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Boton
          type="button"
          variante="fantasma"
          onClick={handleCopiarArca}
          title="Copia los datos de facturación para cargar en el portal de ARCA"
        >
          {copiado ? "Copiado" : "Copiar datos para ARCA"}
        </Boton>

        <div className="flex items-center gap-2">
          <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando || faltaCuitParaA}>
            {guardando ? "Guardando..." : "Guardar factura"}
          </Boton>
        </div>
      </div>
    </form>
  );
}
