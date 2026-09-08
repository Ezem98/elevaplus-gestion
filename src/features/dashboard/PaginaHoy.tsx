import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
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

const formateadorFechaCorta = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "short",
});

function obtenerFechaHoyLarga(): string {
  const formateada = formateadorFecha.format(new Date());
  const conMayuscula = formateada.charAt(0).toUpperCase() + formateada.slice(1);
  return conMayuscula.replace(",", "");
}

function obtenerFechaHoyCorta(): string {
  const formateada = formateadorFechaCorta.format(new Date());
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
  const fechaHoyCorta = obtenerFechaHoyCorta();

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-end md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-tinta">Hoy</h1>
          <p className="hidden text-sm text-tinta-suave md:block">{fechaHoy}</p>
        </div>

        {/* Total a cobrar en escritorio */}
        <div className="hidden text-right md:block">
          <div className="text-sm text-tinta-suave">Total a cobrar</div>
          <div className="text-3xl font-semibold tracking-tight">{formatearPesos(saldo)}</div>
          {sinFacturar > 0 && (
            <div className="mt-1 text-sm text-tinta-suave">
              <Link to="/facturacion" className="hover:underline">
                {sinFacturar} {sinFacturar === 1 ? "servicio sin facturar" : "servicios sin facturar"}
              </Link>
            </div>
          )}
        </div>

        {/* Total a cobrar en móvil como Tarjeta a ancho completo */}
        <div className="md:hidden">
          <Tarjeta className="p-4">
            <div className="text-[13px] text-tinta-suave">Total a cobrar</div>
            <div className="mt-1 text-[28px] font-bold tabular-nums leading-tight text-tinta">
              {formatearPesos(saldo)}
            </div>
            {sinFacturar > 0 && (
              <div className="mt-2">
                <Link
                  to="/facturacion"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-marca hover:underline"
                >
                  <span>
                    {sinFacturar} {sinFacturar === 1 ? "servicio sin facturar" : "servicios sin facturar"}
                  </span>
                  <ChevronRight className="h-[14px] w-[14px]" />
                </Link>
              </div>
            )}
          </Tarjeta>
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
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-tinta">Servicios de hoy</h2>
            <span className="text-lg font-semibold text-tinta-suave">({hoy.length})</span>
          </div>
          <span className="text-xs text-tinta-suave md:hidden">{fechaHoyCorta}</span>
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
      {servicios.map((s) => {
        const hora = s.hora_programada?.slice(0, 5);
        const tipo = ETIQUETA_TIPO[s.tipo];
        const detalle =
          s.origen && s.destino ? `${s.origen} → ${s.destino}` : s.descripcion ?? "";
        const metaMovil = [hora, tipo, detalle].filter(Boolean).join(" · ");
        const metaEscritorio = [tipo, detalle].filter(Boolean).join(" · ");

        return (
          <Link
            key={s.id}
            to={`/servicios/${s.id}`}
            className="flex items-center gap-4 px-4 py-3.5 md:py-4 hover:bg-fondo transition-colors"
          >
            <div className="hidden w-[60px] shrink-0 text-sm text-tinta-suave tabular-nums md:block">
              {hora ?? "—"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-tinta md:text-sm">
                {s.clientes?.nombre ?? "Sin cliente"}
              </div>
              <div className="truncate text-[13px] leading-[18px] text-tinta-suave md:hidden">
                {metaMovil}
              </div>
              <div className="hidden truncate text-[13px] leading-[18px] text-tinta-suave md:block">
                {metaEscritorio}
              </div>
            </div>
            <div className="hidden w-28 shrink-0 text-right text-sm font-semibold tabular-nums md:block">
              {formatearPesos(s.monto)}
            </div>
            <div className="flex shrink-0 justify-end md:w-28">
              <ChipEstado estado={s.estado} />
            </div>
          </Link>
        );
      })}
    </Tarjeta>
  );
}
