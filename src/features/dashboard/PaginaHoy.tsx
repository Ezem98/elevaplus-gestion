import { Aviso } from "@/components/ui/Aviso";
import { ChipEstado, ChipNocturno } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { useRealtime } from "@/hooks/use-realtime";
import { formatearFechaCorta, formatearPesos } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type { ItemAgenda, Servicio } from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { CalendarDays, ChevronRight, UserX, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface NovedadHoy {
  id: string;
  tipo: string;
  fecha: string;
  fecha_hasta: string | null;
  notas: string | null;
  empleado_nombre: string | null;
  perfiles: { nombre: string } | null;
}

interface MaquinaTaller {
  id: string;
  codigo_interno: string;
  marca: string;
  modelo: string | null;
  tipo: string;
}

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
  const [descartadosLote, setDescartadosLote] = useState<number>(0);
  const [novedadesHoy, setNovedadesHoy] = useState<NovedadHoy[]>([]);
  const [maquinasTaller, setMaquinasTaller] = useState<MaquinaTaller[]>([]);
  const [venceHoy, setVenceHoy] = useState<ItemAgenda[]>([]);
  const [atrasadosAgenda, setAtrasadosAgenda] = useState<ItemAgenda[]>([]);

  const cargar = useCallback(async () => {
    const fecha = new Date().toISOString().slice(0, 10);
    const [
      resHoy,
      resSinCerrar,
      resSaldo,
      resSinFacturar,
      resUltimoLote,
      resNovedades,
      resMaquinas,
      resVenceHoy,
      resAtrasados,
    ] = await Promise.all([
      supabase
        .from("servicios")
        .select("*, clientes(nombre)")
        .eq("fecha_programada", fecha)
        .not("estado", "in", "(cancelado)")
        .order("hora_programada"),
      supabase
        .from("servicios")
        .select("*, clientes(nombre)")
        .lt("fecha_programada", fecha)
        .in("estado", ["programado", "en_curso"])
        .order("fecha_programada"),
      supabase.from("cuenta_corriente").select("saldo"),
      supabase
        .from("servicios")
        .select("id", { count: "exact", head: true })
        .in("estado", ["terminado", "cobrado"])
        .is("factura_id", null)
        .eq("no_facturable", false),
      supabase
        .from("lotes_emision")
        .select("id, descartados, finalizado_at")
        .order("iniciado_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("novedades_empleado")
        .select(
          "id, tipo, fecha, fecha_hasta, notas, empleado_nombre, perfiles(nombre)",
        )
        .lte("fecha", fecha)
        .order("fecha", { ascending: false }),
      supabase
        .from("maquinas")
        .select("id, codigo_interno, marca, modelo, tipo")
        .eq("estado", "taller")
        .order("codigo_interno"),
      supabase
        .from("agenda")
        .select("*")
        .eq("fecha", fecha)
        .order("sentido", { ascending: true }),
      supabase
        .from("agenda")
        .select("clave, fecha, titulo, monto, sentido")
        .lt("fecha", fecha)
        .neq("sentido", "info")
        .order("fecha", { ascending: false }),
    ]);

    if (resHoy.data) setHoy(resHoy.data as unknown as Servicio[]);
    if (resSinCerrar.data)
      setSinCerrar(resSinCerrar.data as unknown as Servicio[]);
    if (resSaldo.data) {
      setSaldo(resSaldo.data.reduce((acc, r) => acc + Number(r.saldo), 0));
    }
    if (resSinFacturar.count != null) {
      setSinFacturar(resSinFacturar.count);
    }
    if (
      resUltimoLote.data?.descartados &&
      Array.isArray(resUltimoLote.data.descartados) &&
      resUltimoLote.data.descartados.length > 0
    ) {
      const fin = resUltimoLote.data.finalizado_at
        ? new Date(resUltimoLote.data.finalizado_at).getTime()
        : 0;
      const haceHoras = (Date.now() - fin) / (1000 * 60 * 60);
      if (haceHoras <= 36) {
        setDescartadosLote(resUltimoLote.data.descartados.length);
      } else {
        setDescartadosLote(0);
      }
    } else {
      setDescartadosLote(0);
    }

    if (resNovedades.data) {
      const activas = (resNovedades.data as unknown as NovedadHoy[]).filter(
        (n) => {
          if (
            !["ausente", "medico", "vacaciones", "licencia", "franco"].includes(
              n.tipo,
            )
          ) {
            return false;
          }
          const hasta = n.fecha_hasta || n.fecha;
          return n.fecha <= fecha && hasta >= fecha;
        },
      );
      setNovedadesHoy(activas);
    }

    if (resMaquinas.data) {
      setMaquinasTaller(resMaquinas.data as MaquinaTaller[]);
    }

    if (resVenceHoy.data) {
      setVenceHoy(resVenceHoy.data as ItemAgenda[]);
    }

    if (resAtrasados.data) {
      setAtrasadosAgenda(resAtrasados.data as ItemAgenda[]);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useRealtime(
    [
      "servicios",
      "cobros",
      "cobro_aplicaciones",
      "facturas",
      "lotes_emision",
      "novedades_empleado",
      "maquinas",
      "vencimientos",
      "vencimiento_instancias",
    ],
    cargar,
  );

  const fechaHoy = obtenerFechaHoyLarga();
  const fechaHoyCorta = obtenerFechaHoyCorta();

  return (
    <div className="space-y-6 md:space-y-8">
      <EncabezadoPagina
        titulo="Hoy"
        subtitulo={<span className="hidden md:inline">{fechaHoy}</span>}
        acciones={
          <div className="hidden text-right md:block">
            <div className="text-sm text-tinta-suave">Total a cobrar</div>
            <div className="text-3xl font-semibold tracking-tight">
              {formatearPesos(saldo)}
            </div>
            {sinFacturar > 0 && (
              <div className="mt-1 text-sm text-tinta-suave">
                <Link to="/facturacion" className="hover:underline">
                  {sinFacturar}{" "}
                  {sinFacturar === 1
                    ? "servicio sin facturar"
                    : "servicios sin facturar"}
                </Link>
              </div>
            )}
          </div>
        }
      />
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
                  {sinFacturar}{" "}
                  {sinFacturar === 1
                    ? "servicio sin facturar"
                    : "servicios sin facturar"}
                </span>
                <ChevronRight className="h-[14px] w-[14px]" />
              </Link>
            </div>
          )}
        </Tarjeta>
      </div>

      {descartadosLote > 0 && (
        <Aviso variante="alerta">
          <span>
            {descartadosLote}{" "}
            {descartadosLote === 1
              ? "servicio no se pudo facturar anoche"
              : "servicios no se pudieron facturar anoche"}
            {" · "}
            <Link
              to="/facturacion?tab=emisiones_automaticas"
              className="underline font-semibold hover:opacity-80"
            >
              Ver descartados
            </Link>
          </span>
        </Aviso>
      )}

      {atrasadosAgenda.length > 0 && (
        <Aviso variante="alerta">
          <span>
            {atrasadosAgenda.length}{" "}
            {atrasadosAgenda.length === 1
              ? "vencimiento atrasado"
              : "vencimientos atrasados"}
            {" · "}
            <Link
              to="/agenda"
              className="underline font-semibold hover:opacity-80"
            >
              Ver en Agenda
            </Link>
          </span>
        </Aviso>
      )}

      {sinCerrar.length > 0 && (
        <section>
          <Aviso className="mb-3">
            {sinCerrar.length}{" "}
            {sinCerrar.length === 1
              ? "servicio de días anteriores sin cerrar"
              : "servicios de días anteriores sin cerrar"}
          </Aviso>
          <ListaServicios servicios={sinCerrar} />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-tinta">
              Servicios de hoy
            </h2>
            <span className="text-lg font-semibold text-tinta-suave">
              ({hoy.length})
            </span>
          </div>
          <span className="text-xs text-tinta-suave md:hidden">
            {fechaHoyCorta}
          </span>
        </div>
        {hoy.length === 0 ? (
          <Tarjeta className="p-8 text-center text-tinta-suave">
            No hay servicios programados para hoy.{" "}
            <Link to="/servicios/nuevo" className="text-marca underline">
              Cargar uno
            </Link>
          </Tarjeta>
        ) : (
          <ListaServicios servicios={hoy} />
        )}
      </section>

      {/* Sección Vence hoy con compromisos de la agenda */}
      {venceHoy.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-marca" />
              <h2 className="text-lg font-semibold text-tinta">Vence hoy</h2>
              <span className="text-lg font-semibold text-tinta-suave">
                ({venceHoy.length})
              </span>
            </div>
            <Link
              to="/agenda"
              className="text-xs font-semibold text-marca hover:underline"
            >
              Ver agenda completa →
            </Link>
          </div>

          <Tarjeta className="divide-y divide-borde">
            {venceHoy.slice(0, 5).map((it) => (
              <Link
                key={it.clave}
                to={it.url || "/agenda"}
                className="flex items-center justify-between p-3.5 hover:bg-fondo transition-colors"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-[14px] font-semibold text-tinta truncate">
                    {it.titulo}
                  </p>
                  {it.detalle && (
                    <p className="text-[12px] text-tinta-suave truncate">
                      {it.detalle}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {it.sentido === "info" || it.monto == null ? (
                    <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-marca-suave text-marca">
                      Informativo
                    </span>
                  ) : it.sentido === "ingreso" ? (
                    <span className="text-[13px] font-semibold text-ok tabular-nums">
                      +{formatearPesos(it.monto)}
                    </span>
                  ) : (
                    <span className="text-[13px] font-medium text-tinta tabular-nums">
                      {formatearPesos(it.monto)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </Tarjeta>
          {venceHoy.length > 5 && (
            <p className="mt-2 text-center text-xs text-tinta-suave">
              +{venceHoy.length - 5} compromisos más.{" "}
              <Link to="/agenda" className="text-marca underline">
                Ver todos en la agenda
              </Link>
            </p>
          )}
        </section>
      )}

      {/* Avisos neutros de flota y personal debajo de Servicios */}
      {(novedadesHoy.length > 0 || maquinasTaller.length > 0) && (
        <section className="space-y-2">
          {novedadesHoy.map((n) => (
            <Aviso
              key={n.id}
              variante="neutro"
              className="flex items-center gap-2.5"
            >
              <UserX className="h-4 w-4 shrink-0 text-tinta-suave" />
              <span>{textoNovedad(n)}</span>
            </Aviso>
          ))}
          {maquinasTaller.map((m) => (
            <Aviso
              key={m.id}
              variante="neutro"
              className="flex items-center gap-2.5"
            >
              <Wrench className="h-4 w-4 shrink-0 text-tinta-suave" />
              <span>
                Autoelevador {m.codigo_interno} ({m.marca}) está en taller
              </span>
            </Aviso>
          ))}
        </section>
      )}
    </div>
  );
}

function textoNovedad(n: NovedadHoy): string {
  const nombre = n.perfiles?.nombre || n.empleado_nombre || "Empleado";
  const hastaStr = n.fecha_hasta
    ? ` hasta el ${formatearFechaCorta(n.fecha_hasta)}`
    : "";
  switch (n.tipo) {
    case "vacaciones":
      return `${nombre} está de vacaciones${hastaStr}`;
    case "medico":
      return `${nombre} está ausente por parte médico${hastaStr}`;
    case "licencia":
      return `${nombre} tiene licencia${hastaStr}`;
    case "franco":
      return `${nombre} tiene franco`;
    case "ausente":
    default:
      return `${nombre} está ausente${hastaStr}`;
  }
}

function ListaServicios({ servicios }: { servicios: Servicio[] }) {
  return (
    <Tarjeta className="divide-y divide-borde">
      {servicios.map((s) => {
        const hora = s.hora_programada?.slice(0, 5);
        const tipo = ETIQUETA_TIPO[s.tipo];
        const detalle =
          s.origen && s.destino
            ? `${s.origen} → ${s.destino}`
            : (s.descripcion ?? "");
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
            <div className="flex shrink-0 items-center justify-end gap-1.5">
              {s.nocturno && <ChipNocturno />}
              <ChipEstado estado={s.estado} />
            </div>
          </Link>
        );
      })}
    </Tarjeta>
  );
}
