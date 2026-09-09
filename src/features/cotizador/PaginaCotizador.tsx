import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Vehiculo, ParametrosCotizador } from "@/lib/tipos";
import { cotizar } from "@/lib/cotizador";
import { formatearPesos } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Campo, Entrada, Selector } from "@/components/ui/Campo";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { Boton } from "@/components/ui/Boton";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";

interface ClienteOpcion {
  id: string;
  nombre: string;
}

export function PaginaCotizador() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clienteParam = searchParams.get("cliente");
  const { session } = useAuth();

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [params, setParams] = useState<ParametrosCotizador | null>(null);
  const [clientes, setClientes] = useState<ClienteOpcion[]>([]);

  const [km, setKm] = useState<string>("30");
  const [vehiculoId, setVehiculoId] = useState("");
  const [cargaMayor50, setCargaMayor50] = useState(false);
  const [idaYVuelta, setIdaYVuelta] = useState(true);
  const [clienteId, setClienteId] = useState("");
  const [importeManual, setImporteManual] = useState<number | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const importeFinal = importeManual != null ? importeManual : desglose?.importe ?? null;

  const handleCrearPresupuesto = async () => {
    if (importeFinal == null) return;
    setGuardando(true);
    setError(null);

    try {
      const descripcion = `Traslado cotizado — ${vehiculo?.nombre ?? ""}, ${km} km ${idaYVuelta ? "ida y vuelta" : "solo ida"}, carga ${cargaMayor50 ? "más" : "menos"} del 50 %`;

      const { data, error: errorInsert } = await supabase
        .from("servicios")
        .insert({
          tipo: "traslado",
          cliente_id: clienteId ? clienteId : null,
          km: Number(km) || 0,
          ida_y_vuelta: idaYVuelta,
          vehiculo_id: vehiculoId || null,
          monto: importeFinal,
          descripcion,
          creado_por: session?.user?.id,
        })
        .select("id")
        .single();

      if (errorInsert || !data?.id) {
        setError("No se pudo crear el presupuesto. Probá de nuevo.");
        setGuardando(false);
        return;
      }

      const { error: errorRpc } = await supabase.rpc("cambiar_estado", {
        p_servicio_id: data.id,
        p_nuevo: "presupuestado",
        p_nota: "Presupuesto generado desde el cotizador",
      });

      if (errorRpc) {
        setError("No se pudo crear el presupuesto. Probá de nuevo.");
        setGuardando(false);
        return;
      }

      navigate(`/servicios/${data.id}`);
    } catch {
      setError("No se pudo crear el presupuesto. Probá de nuevo.");
      setGuardando(false);
    }
  };

  const clientePreseleccionado = useMemo(() => {
    if (!clienteParam) return null;
    return clientes.find((c) => c.id === clienteParam) ?? null;
  }, [clienteParam, clientes]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <EncabezadoPagina
        titulo="Cotizador"
        subtitulo={
          clientePreseleccionado
            ? `Presupuesto para ${clientePreseleccionado.nombre}`
            : "Cálculo de tarifas de traslado según kilómetros y vehículo"
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Tarjeta className="space-y-4 p-5">
          <Campo etiqueta="Distancia (solo ida)" id="km">
            <div className="relative flex items-center">
              <Entrada
                id="km"
                type="number"
                min={0}
                step={0.5}
                value={km}
                onChange={(e) => setKm(e.target.value)}
                className="pr-10"
              />
              <span className="pointer-events-none absolute right-3 text-sm text-tinta-suave">
                km
              </span>
            </div>
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
          <Campo etiqueta="Cliente" id="cliente">
            <Selector id="cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Sin cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </Selector>
          </Campo>
        </Tarjeta>

        <Tarjeta className="flex flex-col p-5">
          <div className="text-sm text-tinta-suave">Importe sugerido</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{formatearPesos(desglose?.importe)}</div>

          <div className="my-4 border-t border-borde" />

          {desglose && params && vehiculo && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3 text-tinta-suave">
                <span>
                  {idaYVuelta
                    ? `Base (${km} km × 2 × ${formatearPesos(params.precio_km)})`
                    : `Base (${km} km × ${formatearPesos(params.precio_km)})`}
                </span>
                <span className="text-tinta tabular-nums">{formatearPesos(desglose.base)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-tinta-suave">
                <span>{`${vehiculo.nombre} (× ${desglose.coefVehiculo.toLocaleString("es-AR")})`}</span>
                <span className="text-tinta tabular-nums">{formatearPesos(desglose.deltaVehiculo)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-tinta-suave">
                <span>
                  {`${cargaMayor50 ? "Carga más del 50 %" : "Carga menos del 50 %"} (× ${desglose.coefCarga.toLocaleString("es-AR")})`}
                </span>
                <span className="text-tinta tabular-nums">{formatearPesos(desglose.deltaCarga)}</span>
              </div>
              <div className="my-2 border-t border-borde" />
              <div className="flex items-center justify-between gap-3 font-medium text-tinta">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatearPesos(desglose.subtotal)}</span>
              </div>
              {desglose.aplicoMinimo && (
                <div className="flex items-center justify-between gap-3 font-medium text-alerta">
                  <span>Se aplica el mínimo</span>
                  <span className="tabular-nums">{formatearPesos(params.monto_minimo)}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto pt-5">
            <Campo etiqueta="Ajustar a mano (opcional)" id="manual">
              <EntradaMonto
                id="manual"
                placeholder={desglose ? String(desglose.importe) : ""}
                valor={importeManual}
                onChange={setImporteManual}
              />
            </Campo>
            <p className="mt-1 text-xs text-tinta-suave">Podés redondear o ingresar un valor acordado</p>
            <Boton
              className="mt-3 w-full"
              disabled={importeFinal == null || guardando}
              onClick={handleCrearPresupuesto}
            >
              Crear presupuesto por {formatearPesos(importeFinal)}
            </Boton>
            {error && (
              <p className="mt-2 text-sm text-peligro">{error}</p>
            )}
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
