import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Servicio } from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { formatearPesos } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipEstado } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";

const formateadorFecha = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function obtenerFechaHoyLarga(): string {
  const formateada = formateadorFecha.format(new Date());
  const conMayuscula = formateada.charAt(0).toUpperCase() + formateada.slice(1);
  return conMayuscula.replace(",", "");
}

export function PaginaHoy() {
  const [hoy, setHoy] = useState<Servicio[]>([]);
  const [sinCerrar, setSinCerrar] = useState<Servicio[]>([]);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [sinFacturar, setSinFacturar] = useState<number>(0);

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

    supabase
      .from("servicios")
      .select("id", { count: "exact", head: true })
      .in("estado", ["terminado", "cobrado"])
      .is("factura_id", null)
      .eq("no_facturable", false)
      .then(({ count }) => setSinFacturar(count ?? 0));
  }, []);

  const fechaHoy = obtenerFechaHoyLarga();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-tinta">Hoy</h1>
          <p className="text-sm text-tinta-suave">{fechaHoy}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-tinta-suave">Total a cobrar</div>
          <div className="text-3xl font-semibold tracking-tight">{formatearPesos(saldo)}</div>
          {sinFacturar > 0 && (
            <div className="text-sm text-tinta-suave mt-1">
              <Link to="/facturacion" className="hover:underline">
                {sinFacturar} {sinFacturar === 1 ? "servicio sin facturar" : "servicios sin facturar"}
              </Link>
            </div>
          )}
        </div>
      </header>

      {sinCerrar.length > 0 && (
        <section>
          <Aviso className="mb-3">
            {sinCerrar.length} {sinCerrar.length === 1 ? "servicio de días anteriores sin cerrar" : "servicios de días anteriores sin cerrar"}
          </Aviso>
          <ListaServicios servicios={sinCerrar} />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-tinta">Servicios de hoy</h2>
          <span className="text-lg font-semibold text-tinta-suave">({hoy.length})</span>
        </div>
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
        <Link
          key={s.id}
          to={`/servicios/${s.id}`}
          className="flex items-center gap-4 px-4 py-4 hover:bg-fondo transition-colors"
        >
          <div className="w-[60px] shrink-0 text-sm text-tinta-suave tabular-nums">
            {s.hora_programada?.slice(0, 5) ?? "—"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-tinta">
              {s.clientes?.nombre ?? "Sin cliente"}
            </div>
            <div className="truncate text-[13px] leading-[18px] text-tinta-suave">
              {ETIQUETA_TIPO[s.tipo]}
              {s.origen && s.destino ? ` · ${s.origen} → ${s.destino}` : s.descripcion ? ` · ${s.descripcion}` : ""}
            </div>
          </div>
          <div className="hidden w-28 shrink-0 text-right text-sm font-semibold tabular-nums sm:block">
            {formatearPesos(s.monto)}
          </div>
          <div className="flex w-28 shrink-0 justify-end">
            <ChipEstado estado={s.estado} />
          </div>
        </Link>
      ))}
    </Tarjeta>
  );
}
