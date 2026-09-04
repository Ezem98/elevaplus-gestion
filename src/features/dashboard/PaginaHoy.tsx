import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Servicio } from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { formatearPesos } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipEstado } from "@/components/ui/Chip";

export function PaginaHoy() {
  const [hoy, setHoy] = useState<Servicio[]>([]);
  const [sinCerrar, setSinCerrar] = useState<Servicio[]>([]);
  const [saldo, setSaldo] = useState<number | null>(null);

  useEffect(() => {
    const fecha = new Date().toISOString().slice(0, 10);
    supabase
      .from("servicios")
      .select("*, clientes(nombre)")
      .eq("fecha_programada", fecha)
      .not("estado", "in", "(cancelado)")
      .order("hora_programada")
      .then(({ data }) => setHoy((data as Servicio[]) ?? []));

    supabase
      .from("servicios")
      .select("*, clientes(nombre)")
      .lt("fecha_programada", fecha)
      .in("estado", ["programado", "en_curso"])
      .order("fecha_programada")
      .then(({ data }) => setSinCerrar((data as Servicio[]) ?? []));

    supabase
      .from("cuenta_corriente")
      .select("saldo")
      .then(({ data }) => setSaldo((data ?? []).reduce((acc, r) => acc + Number(r.saldo), 0)));
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Hoy</h1>
        <div className="text-right">
          <div className="text-sm text-tinta-suave">Total a cobrar</div>
          <div className="text-2xl font-semibold">{formatearPesos(saldo)}</div>
        </div>
      </header>

      {sinCerrar.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-alerta">
            {sinCerrar.length} {sinCerrar.length === 1 ? "servicio de días anteriores sin cerrar" : "servicios de días anteriores sin cerrar"}
          </h2>
          <ListaServicios servicios={sinCerrar} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-tinta-suave">Servicios de hoy</h2>
        {hoy.length === 0 ? (
          <Tarjeta className="p-8 text-center text-tinta-suave">
            No hay servicios programados para hoy.{" "}
            <Link to="/servicios/nuevo" className="text-marca underline">Cargar uno</Link>
          </Tarjeta>
        ) : (
          <ListaServicios servicios={hoy} />
        )}
      </section>
    </div>
  );
}

function ListaServicios({ servicios }: { servicios: Servicio[] }) {
  return (
    <Tarjeta className="divide-y divide-borde">
      {servicios.map((s) => (
        <Link key={s.id} to={`/servicios/${s.id}`} className="flex items-center gap-4 p-4 hover:bg-fondo">
          <div className="w-14 shrink-0 text-sm text-tinta-suave">{s.hora_programada?.slice(0, 5) ?? "—"}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{s.clientes?.nombre ?? "Sin cliente"}</div>
            <div className="truncate text-sm text-tinta-suave">
              {ETIQUETA_TIPO[s.tipo]}
              {s.origen && s.destino ? ` · ${s.origen} → ${s.destino}` : s.descripcion ? ` · ${s.descripcion}` : ""}
            </div>
          </div>
          <div className="hidden text-sm sm:block">{formatearPesos(s.monto)}</div>
          <ChipEstado estado={s.estado} />
        </Link>
      ))}
    </Tarjeta>
  );
}
