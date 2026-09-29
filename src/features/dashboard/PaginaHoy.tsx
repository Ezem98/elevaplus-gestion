import { Aviso } from "@/components/ui/Aviso";
import { ChipEstado, ChipNocturno } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { useRealtime } from "@/hooks/use-realtime";
import { formatearFechaCorta, formatearPesos } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type { ItemAgenda, Servicio } from "@/lib/tipos";
import { ETIQUETA_TIPO } from "@/lib/tipos";
import { CalendarDays, ChevronRight, Route, UserX, Wrench } from "lucide-react";
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

function obtenerFechaLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function obtenerFechaMananaLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

interface ServicioAtencionHoy {
  id: string;
  numero: number | null;
  estado: string;
  fecha_programada: string | null;
  descripcion: string | null;
  clientes: { nombre: string } | null;
  servicio_choferes: { chofer_id: string }[];
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
  const [incompletosSinReprogramar, setIncompletosSinReprogramar] = useState(0);
  const [serviciosAtencion, setServiciosAtencion] = useState<ServicioAtencionHoy[]>([]);

  const cargar = useCallback(async () => {
    const fecha = obtenerFechaLocal();
    const fechaManana = obtenerFechaMananaLocal();
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
      resIncompletos,
      resAtencion,
    ] = await Promise.all([
      supabase
        .from("servicios")
        .select(
          "*, clientes!servicios_cliente_id_fkey(nombre), paradas!paradas_servicio_id_fkey(*)",
        )
        .eq("fecha_programada", fecha)
        .not("estado", "in", "(cancelado)")
        .order("hora_programada"),
      supabase
        .from("servicios")
        .select(
          "*, clientes!servicios_cliente_id_fkey(nombre), alquileres!alquileres_servicio_id_fkey(fecha_hasta), paradas!paradas_servicio_id_fkey(*)",
        )
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
      supabase
        .from("servicios")
        .select("id, paradas!paradas_servicio_id_fkey!inner(id, estado)")
        .eq("paradas.estado", "no_realizada"),
      supabase
        .from("servicios")
        .select(
          "id, numero, estado, fecha_programada, descripcion, clientes!servicios_cliente_id_fkey(nombre), servicio_choferes(chofer_id)",
        )
        .in("fecha_programada", [fecha, fechaManana])
        .not("estado", "in", "(cancelado,terminado,cobrado,facturado)")
        .order("fecha_programada"),
    ]);

    if (resHoy.error) {
      console.error("Error al cargar servicios de hoy:", resHoy.error.message);
    } else if (resHoy.data) {
      const hoyOrdenados = (resHoy.data as unknown as Servicio[]).map((s) => ({
        ...s,
        paradas: Array.isArray(s.paradas)
          ? [...s.paradas].sort((a, b) => a.orden - b.orden)
          : s.paradas,
      }));
      setHoy(hoyOrdenados);
    }
    if (resSinCerrar.error) {
      console.error(
        "Error al cargar servicios sin cerrar:",
        resSinCerrar.error.message,
      );
    } else if (resSinCerrar.data) {
      const filtrados = (resSinCerrar.data as any[])
        .filter((s) => {
          if (s.tipo === "alquiler_periodo" && s.estado === "en_curso") {
            const fechaHasta = Array.isArray(s.alquileres)
              ? s.alquileres[0]?.fecha_hasta
              : s.alquileres?.fecha_hasta;
            if (fechaHasta && fechaHasta >= fecha) {
              return false;
            }
          }
          return true;
        })
        .map((s) => ({
          ...s,
          paradas: Array.isArray(s.paradas)
            ? [...s.paradas].sort((a, b) => a.orden - b.orden)
            : s.paradas,
        }));
      setSinCerrar(filtrados as unknown as Servicio[]);
    }

    if (resIncompletos.data) {
      const ids = Array.from(
        new Set(resIncompletos.data.map((s: any) => s.id)),
      );
      if (ids.length > 0) {
        const { data: continuaciones } = await supabase
          .from("servicios")
          .select("continuacion_de")
          .in("continuacion_de", ids)
          .neq("estado", "cancelado");
        const setConCont = new Set(
          (continuaciones || []).map((c: any) => c.continuacion_de),
        );
        setIncompletosSinReprogramar(
          ids.filter((id) => !setConCont.has(id)).length,
        );
      } else {
        setIncompletosSinReprogramar(0);
      }
    } else {
      setIncompletosSinReprogramar(0);
    }

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

    if (resAtencion.error) {
      console.error(
        "Error al cargar servicios que requieren atención:",
        resAtencion.error.message,
      );
    } else if (resAtencion.data) {
      const atencion = (resAtencion.data as any[]).filter((s) => {
        const sinChofer =
          !s.servicio_choferes || s.servicio_choferes.length === 0;
        return s.estado === "aceptado" || sinChofer;
      });
      setServiciosAtencion(atencion);
    } else {
      setServiciosAtencion([]);
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
      "paradas",
      "servicio_choferes",
    ],
    cargar,
  );

  const fechaHoy = obtenerFechaHoyLarga();
  const fechaHoyCorta = obtenerFechaHoyCorta();
  const fechaHoyIso = obtenerFechaLocal();

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

      {incompletosSinReprogramar > 0 && (
        <Aviso variante="alerta">
          <span>
            {incompletosSinReprogramar}{" "}
            {incompletosSinReprogramar === 1
              ? "recorrido incompleto sin reprogramar"
              : "recorridos incompletos sin reprogramar"}
            {" · "}
            <Link
              to="/servicios?filtro=incompletos"
              className="underline font-semibold hover:opacity-80"
            >
              Ver recorridos incompletos
            </Link>
          </span>
        </Aviso>
      )}

      {serviciosAtencion.length > 0 && (
        <Aviso variante="alerta">
          <div className="space-y-1.5">
            <div className="font-semibold">
              {serviciosAtencion.length === 1
                ? "Hay 1 servicio de hoy o mañana en aceptado o sin chofer asignado:"
                : `Hay ${serviciosAtencion.length} servicios de hoy o mañana en aceptado o sin chofer asignado:`}
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm font-normal">
              {serviciosAtencion.map((s) => {
                const dia =
                  s.fecha_programada === fechaHoyIso ? "Hoy" : "Mañana";
                const cliente = s.clientes?.nombre || "Sin cliente";
                const motivo =
                  s.estado === "aceptado" &&
                  (!s.servicio_choferes || s.servicio_choferes.length === 0)
                    ? "en aceptado y sin chofer"
                    : s.estado === "aceptado"
                      ? "en aceptado"
                      : "sin chofer asignado";
                return (
                  <li key={s.id}>
                    <Link
                      to={`/servicios/${s.id}`}
                      className="underline font-semibold hover:opacity-80"
                    >
                      Servicio #{s.numero ?? s.id.slice(0, 8)}
                    </Link>{" "}
                    ({dia} · {cliente}) — {motivo}
                  </li>
                );
              })}
            </ul>
          </div>
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
        const tieneParadas = Boolean(s.paradas && s.paradas.length > 0);
        const detalleNodo = tieneParadas ? (
          <span className="inline-flex items-center gap-1">
            <span>{s.origen || "Origen"}</span>
            <span>→</span>
            <Route className="inline size-3.5 text-marca shrink-0" />
            <span>
              {s.paradas!.length}{" "}
              {s.paradas!.length === 1 ? "parada" : "paradas"}
            </span>
          </span>
        ) : s.origen && s.destino ? (
          `${s.origen} → ${s.destino}`
        ) : (
          (s.descripcion ?? "")
        );

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
                {hora && `${hora} · `}
                {tipo}
                {detalleNodo ? <> · {detalleNodo}</> : null}
              </div>
              <div className="hidden truncate text-[13px] leading-[18px] text-tinta-suave md:block">
                {tipo}
                {detalleNodo ? <> · {detalleNodo}</> : null}
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
