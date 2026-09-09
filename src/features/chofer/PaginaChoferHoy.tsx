import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/hooks/use-realtime";
import type { Servicio, EstadoServicio } from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { ChipEstado } from "@/components/ui/Chip";

export function PaginaChoferHoy() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    // RLS ya filtra: el chofer solo ve los servicios asignados a él.
    supabase
      .from("servicios")
      .select("*, clientes(nombre)")
      .in("estado", ["programado", "en_curso", "terminado"])
      .order("fecha_programada")
      .order("hora_programada")
      .then(({ data }) => setServicios((data as Servicio[]) ?? []));
  }, []);

  useEffect(cargar, [cargar]);

  useRealtime(["servicios", "servicio_choferes"], cargar);

  async function cambiar(id: string, nuevo: EstadoServicio) {
    setError(null);
    const { error } = await supabase.rpc("cambiar_estado", { p_servicio_id: id, p_nuevo: nuevo });
    if (error) setError("No se pudo actualizar. Probá de nuevo.");
    cargar();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Mis servicios</h1>
      {error && <p className="rounded-md bg-peligro-suave p-3 text-sm text-peligro">{error}</p>}

      {servicios.length === 0 && (
        <Tarjeta className="p-8 text-center text-tinta-suave">No tenés servicios asignados.</Tarjeta>
      )}

      {servicios.map((s) => (
        <Tarjeta key={s.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-tight">{s.clientes?.nombre ?? "Sin cliente"}</div>
              <div className="mt-0.5 text-sm text-tinta-suave">{s.hora_programada?.slice(0, 5) ?? ""} · {ETIQUETA_TIPO[s.tipo]}</div>
            </div>
            <ChipEstado estado={s.estado} />
          </div>

          {(s.origen || s.destino) && (
            <div className="mt-3 text-sm">
              <div><span className="text-tinta-suave">Desde</span> {s.origen ?? "—"}</div>
              <div><span className="text-tinta-suave">Hasta</span> {s.destino ?? "—"}</div>
            </div>
          )}
          {s.carga && <div className="mt-1 text-sm"><span className="text-tinta-suave">Carga</span> {s.carga}</div>}

          <div className="mt-4">
            {s.estado === "programado" && (
              <Boton tamano="lg" className="w-full" onClick={() => cambiar(s.id, "en_curso")}>Iniciar</Boton>
            )}
            {s.estado === "en_curso" && (
              <Boton tamano="lg" className="w-full" onClick={() => cambiar(s.id, "terminado")}>Terminé</Boton>
            )}
            {s.estado === "terminado" && (
              <p className="text-center text-sm text-tinta-suave">Terminado. Registrar cobro: pendiente de implementar.</p>
            )}
          </div>
        </Tarjeta>
      ))}
    </div>
  );
}
