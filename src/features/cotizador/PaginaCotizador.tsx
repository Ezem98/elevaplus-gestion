import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Vehiculo, ParametrosCotizador } from "@/lib/tipos";
import { cotizar } from "@/lib/cotizador";
import { formatearPesos } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Campo, Entrada, Selector } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";

export function PaginaCotizador() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [params, setParams] = useState<ParametrosCotizador | null>(null);

  const [km, setKm] = useState(30);
  const [vehiculoId, setVehiculoId] = useState("");
  const [cargaMayor50, setCargaMayor50] = useState(false);
  const [idaYVuelta, setIdaYVuelta] = useState(true);
  const [importeManual, setImporteManual] = useState<string>("");

  useEffect(() => {
    supabase
      .from("vehiculos")
      .select("*")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        const v = (data as Vehiculo[]) ?? [];
        setVehiculos(v);
        if (v[0] && !vehiculoId) setVehiculoId(v[0].id);
      });
    supabase
      .from("parametros_cotizador")
      .select("*")
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setParams((data as ParametrosCotizador) ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vehiculo = vehiculos.find((v) => v.id === vehiculoId);

  const desglose = useMemo(() => {
    if (!vehiculo || !params) return null;
    return cotizar(
      { km: Number(km) || 0, vehiculo, cargaMayor50, idaYVuelta },
      { precio_km: Number(params.precio_km), monto_minimo: Number(params.monto_minimo), km_minimo: Number(params.km_minimo) },
    );
  }, [km, vehiculo, cargaMayor50, idaYVuelta, params]);

  const importeFinal = importeManual !== "" ? Number(importeManual) : desglose?.importe ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Cotizador de traslados</h1>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <Tarjeta className="space-y-4 p-5">
          <Campo etiqueta="Distancia (km, solo ida)" id="km">
            <Entrada id="km" type="number" min={0} step={0.5} value={km} onChange={(e) => setKm(Number(e.target.value))} />
          </Campo>
          <Campo etiqueta="Vehículo" id="vehiculo">
            <Selector id="vehiculo" value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)}>
              {vehiculos.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </Selector>
          </Campo>
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-tinta-suave">Carga</legend>
            <div className="grid grid-cols-2 gap-2">
              <Opcion activa={!cargaMayor50} onClick={() => setCargaMayor50(false)}>Menos del 50 %</Opcion>
              <Opcion activa={cargaMayor50} onClick={() => setCargaMayor50(true)}>Más del 50 %</Opcion>
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-tinta-suave">Recorrido</legend>
            <div className="grid grid-cols-2 gap-2">
              <Opcion activa={!idaYVuelta} onClick={() => setIdaYVuelta(false)}>Solo ida</Opcion>
              <Opcion activa={idaYVuelta} onClick={() => setIdaYVuelta(true)}>Ida y vuelta</Opcion>
            </div>
          </fieldset>
        </Tarjeta>

        <Tarjeta className="flex flex-col p-5">
          <div className="text-sm text-tinta-suave">Importe sugerido</div>
          <div className="mt-1 text-3xl font-semibold">{formatearPesos(desglose?.importe)}</div>

          {desglose && (
            <dl className="mt-4 space-y-1.5 border-t border-borde pt-4 text-sm">
              <Fila k={`${desglose.kmFacturables} km × ${formatearPesos(params!.precio_km)}`} v={formatearPesos(desglose.base)} />
              <Fila k={`× ${desglose.coefVehiculo} (${vehiculo?.nombre})`} />
              <Fila k={`× ${desglose.coefCarga} (carga)`} />
              <Fila k="Subtotal" v={formatearPesos(desglose.subtotal)} />
              {desglose.aplicoMinimo && <Fila k="Se aplica el mínimo" v={formatearPesos(params!.monto_minimo)} destacada />}
            </dl>
          )}

          <div className="mt-auto pt-5">
            <Campo etiqueta="Ajustar a mano (opcional)" id="manual">
              <Entrada id="manual" type="number" placeholder={String(desglose?.importe ?? "")} value={importeManual} onChange={(e) => setImporteManual(e.target.value)} />
            </Campo>
            <Boton className="mt-3 w-full" disabled={importeFinal == null} onClick={() => alert("Crear presupuesto: pendiente de conectar con Servicios")}>
              Crear presupuesto por {formatearPesos(importeFinal)}
            </Boton>
          </div>
        </Tarjeta>
      </div>

      {params && (
        <p className="text-xs text-tinta-tenue">
          Parámetros vigentes desde {params.vigente_desde}: {formatearPesos(params.precio_km)}/km, mínimo {formatearPesos(params.monto_minimo)}.
        </p>
      )}
    </div>
  );
}

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`h-10 rounded-md border text-sm font-medium ${activa ? "border-marca bg-marca-suave text-marca" : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"}`}
    >
      {children}
    </button>
  );
}

function Fila({ k, v, destacada }: { k: string; v?: string; destacada?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${destacada ? "font-medium text-alerta" : "text-tinta-suave"}`}>
      <dt>{k}</dt>
      {v && <dd className="text-tinta">{v}</dd>}
    </div>
  );
}
