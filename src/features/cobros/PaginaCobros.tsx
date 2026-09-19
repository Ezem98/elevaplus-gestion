import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada, Selector } from "@/components/ui/Campo";
import { ChipCobro } from "@/components/ui/Chip";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import {
  ConMenuContextual,
  MenuAcciones,
  type AccionMenu,
} from "@/components/ui/MenuAcciones";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { FormularioMovimiento } from "@/features/caja/FormularioMovimiento";
import { useRealtime } from "@/hooks/use-realtime";
import { cambiarEstadoCheque } from "@/lib/cheques";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type { Cheque, Cobro, Cuenta, EstadoCheque } from "@/lib/tipos";
import { ETIQUETA_ESTADO_CHEQUE, ETIQUETA_MEDIO_PAGO } from "@/lib/tipos";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FilaCheque } from "./FilaCheque";

type ClavePestana = "pendientes" | "cheques" | "todos";
type SubPestanaCheques = "cartera" | "cubrir" | "historial";

interface PestanaConfig {
  id: ClavePestana;
  etiqueta: string;
}

const PESTANAS: PestanaConfig[] = [
  { id: "pendientes", etiqueta: "Pendientes" },
  { id: "cheques", etiqueta: "Cheques" },
  { id: "todos", etiqueta: "Todos" },
];

const SUBPESTANAS_CHEQUES: { id: SubPestanaCheques; etiqueta: string }[] = [
  { id: "cartera", etiqueta: "En cartera" },
  { id: "cubrir", etiqueta: "A cubrir" },
  { id: "historial", etiqueta: "Historial" },
];

const ESTADOS_CHEQUE_FILTRO: EstadoCheque[] = [
  "en_cartera",
  "depositado",
  "acreditado",
  "descontado",
  "endosado",
  "emitido",
  "debitado",
  "rechazado",
  "anulado",
];

function normalizarPestana(param: string | null): ClavePestana {
  if (param === "cheques" || param === "todos" || param === "pendientes") {
    return param;
  }
  return "pendientes";
}

function normalizarSubPestana(param: string | null): SubPestanaCheques {
  if (param === "cubrir" || param === "historial" || param === "cartera") {
    return param;
  }
  return "cartera";
}

export function PaginaCobros() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pestanaActiva = normalizarPestana(searchParams.get("tab"));
  const subPestanaCheques = normalizarSubPestana(searchParams.get("subtab"));

  const [pendienteAcreditar, setPendienteAcreditar] = useState(0);
  const [chequesEstaSemana, setChequesEstaSemana] = useState(0);

  const [cobrosPendientes, setCobrosPendientes] = useState<Cobro[]>([]);
  const [chequesCartera, setChequesCartera] = useState<Cheque[]>([]);
  const [chequesCubrir, setChequesCubrir] = useState<Cheque[]>([]);
  const [chequesHistorial, setChequesHistorial] = useState<Cheque[]>([]);
  const [todosCobros, setTodosCobros] = useState<Cobro[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [proyeccionesPorCuenta, setProyeccionesPorCuenta] = useState<
    Record<string, Record<string, number>>
  >({});

  const [conteos, setConteos] = useState({
    pendientes: 0,
    cheques: 0,
    todos: 0,
    cartera: 0,
    cubrir: 0,
    historial: 0,
  });

  const [cargando, setCargando] = useState(true);

  // Estado para flujo de endoso inline
  const [chequeParaEndosar, setChequeParaEndosar] = useState<{
    cheque: Cheque;
    aQuien: string;
  } | null>(null);

  // Filtros de historial de cheques
  const [filtroTipo, setFiltroTipo] = useState<
    "todos" | "recibido" | "emitido"
  >("todos");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | EstadoCheque>(
    "todos",
  );
  const [filtroCuenta, setFiltroCuenta] = useState<string>("todas");
  const [filtroDesde, setFiltroDesde] = useState<string>("");
  const [filtroHasta, setFiltroHasta] = useState<string>("");
  const [busquedaHistorial, setBusquedaHistorial] = useState<string>("");

  const hoyStr = new Date().toISOString().slice(0, 10);
  const d7 = new Date();
  d7.setDate(d7.getDate() + 7);
  const hoyMas7Str = d7.toISOString().slice(0, 10);

  const cambiarPestana = (tab: ClavePestana) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  const cambiarSubPestana = (subtab: SubPestanaCheques) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("subtab", subtab);
      return next;
    });
  };

  const cargarCifras = useCallback(async () => {
    // 1. Cobros pendientes de acreditar
    const { data: cData } = await supabase
      .from("cobros")
      .select("monto")
      .eq("estado", "pendiente");
    const totalPendiente = (cData ?? []).reduce(
      (acc, c) => acc + Number(c.monto),
      0,
    );
    setPendienteAcreditar(totalPendiente);

    // 2. Cheques en cartera / depositados con fecha_pago en [hoy, hoy+7]
    const { data: chData } = await supabase
      .from("cheques")
      .select("monto")
      .eq("tipo", "recibido")
      .in("estado", ["en_cartera", "depositado"])
      .gte("fecha_pago", hoyStr)
      .lte("fecha_pago", hoyMas7Str);
    const totalChequesSemana = (chData ?? []).reduce(
      (acc, ch) => acc + Number(ch.monto),
      0,
    );
    setChequesEstaSemana(totalChequesSemana);
  }, [hoyStr, hoyMas7Str]);

  const cargarDatos = useCallback(
    async (mostrarSpinner = false) => {
      if (mostrarSpinner) setCargando(true);
      await cargarCifras();

      // Consultas para cada pestaña y entidad
      const [
        pendientesRes,
        chequesCarteraRes,
        chequesCubrirRes,
        chequesHistorialRes,
        todosRes,
        cuentasRes,
      ] = await Promise.all([
        supabase
          .from("cobros")
          .select(
            "*, clientes(nombre), cheques(id, numero, estado), cuentas(id, nombre)",
          )
          .eq("estado", "pendiente"),
        supabase
          .from("cheques")
          .select("*, clientes(nombre), cuentas(id, nombre)")
          .eq("tipo", "recibido")
          .in("estado", ["en_cartera", "depositado"])
          .order("fecha_pago", { ascending: true }),
        supabase
          .from("cheques")
          .select("*, clientes(nombre), cuentas(id, nombre)")
          .eq("tipo", "emitido")
          .eq("estado", "emitido")
          .order("fecha_pago", { ascending: true }),
        supabase
          .from("cheques")
          .select("*, clientes(nombre), cuentas(id, nombre)")
          .order("fecha_pago", { ascending: false }),
        supabase
          .from("cobros")
          .select(
            "*, clientes(nombre), cheques(id, numero, estado), cuentas(id, nombre)",
          )
          .order("fecha", { ascending: false })
          .limit(100),
        supabase.from("cuentas").select("*").eq("activa", true).order("orden"),
      ]);

      const pend = ((pendientesRes.data as Cobro[]) ?? []).sort((a, b) => {
        const fa = a.fecha_acreditacion || a.fecha;
        const fb = b.fecha_acreditacion || b.fecha;
        return fa.localeCompare(fb);
      });

      const cartera = (chequesCarteraRes.data as Cheque[]) ?? [];
      const cubrir = (chequesCubrirRes.data as Cheque[]) ?? [];
      const historial = (chequesHistorialRes.data as Cheque[]) ?? [];
      const td = (todosRes.data as Cobro[]) ?? [];
      const ctas = (cuentasRes.data as Cuenta[]) ?? [];

      setCobrosPendientes(pend);
      setChequesCartera(cartera);
      setChequesCubrir(cubrir);
      setChequesHistorial(historial);
      setTodosCobros(td);
      setCuentas(ctas);

      setConteos({
        pendientes: pend.length,
        cheques: cartera.length + cubrir.length,
        todos: td.length,
        cartera: cartera.length,
        cubrir: cubrir.length,
        historial: historial.length,
      });

      // Proyección de caja para cheques a cubrir
      // Agrupamos por cuenta_id única de los cheques a cubrir y llamamos proyeccion_caja una sola vez por cuenta
      const cuentasIdsUnicas = Array.from(
        new Set(
          cubrir
            .map((ch) => ch.cuenta_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (cuentasIdsUnicas.length > 0) {
        const proyeccionesRes = await Promise.all(
          cuentasIdsUnicas.map(async (ctaId) => {
            const { data } = await supabase.rpc("proyeccion_caja", {
              p_dias: 60,
              p_cuenta_id: ctaId,
            });
            return {
              ctaId,
              data:
                (data as { fecha: string; saldo_proyectado: number }[]) ?? [],
            };
          }),
        );

        const proyeccionesMap: Record<string, Record<string, number>> = {};
        for (const { ctaId, data } of proyeccionesRes) {
          proyeccionesMap[ctaId] = {};
          for (const fila of data) {
            proyeccionesMap[ctaId][fila.fecha] = Number(fila.saldo_proyectado);
          }
        }
        setProyeccionesPorCuenta(proyeccionesMap);
      } else {
        setProyeccionesPorCuenta({});
      }

      setCargando(false);
    },
    [cargarCifras],
  );

  const cargar = useCallback(() => {
    return cargarDatos(false);
  }, [cargarDatos]);

  useEffect(() => {
    cargarDatos(true);
  }, [cargarDatos]);

  useRealtime(["cobros", "cheques", "cheque_eventos"], cargar);

  // Acciones para cobros (usan la RPC cambiarEstadoCheque cuando corresponde)
  const marcarAcreditadoCobro = async (cobro: Cobro) => {
    try {
      if (cobro.cheque_id) {
        await cambiarEstadoCheque({
          chequeId: cobro.cheque_id,
          nuevoEstado: "acreditado",
          fecha: cobro.fecha_acreditacion || hoyStr,
        });
      } else {
        const { error } = await supabase
          .from("cobros")
          .update({
            estado: "acreditado",
            fecha_acreditacion: cobro.fecha_acreditacion || hoyStr,
          })
          .eq("id", cobro.id);
        if (error) throw error;
      }
      cargarDatos();
    } catch (err: any) {
      alert("Error al marcar como acreditado: " + (err.message || err));
    }
  };

  const marcarRechazadoCobro = async (cobro: Cobro) => {
    if (
      !window.confirm(
        "¿Seguro que querés marcar este cobro como rechazado? Si afecta a servicios cobrados, se revertirá su estado.",
      )
    ) {
      return;
    }
    try {
      if (cobro.cheque_id) {
        await cambiarEstadoCheque({
          chequeId: cobro.cheque_id,
          nuevoEstado: "rechazado",
          motivo: "Rechazado desde módulo de cobros",
          fecha: hoyStr,
        });
      } else {
        const { error } = await supabase
          .from("cobros")
          .update({ estado: "rechazado" })
          .eq("id", cobro.id);
        if (error) throw error;
      }
      cargarDatos();
    } catch (err: any) {
      alert("Error al marcar como rechazado: " + (err.message || err));
    }
  };

  // Helper para consultar saldo proyectado a la fecha de pago de un cheque a cubrir
  const obtenerSaldoProyectado = (cheque: Cheque): number | null => {
    if (!cheque.cuenta_id) return null;
    const cuentaMap = proyeccionesPorCuenta[cheque.cuenta_id];
    if (!cuentaMap) return null;
    if (cheque.fecha_pago in cuentaMap) {
      return cuentaMap[cheque.fecha_pago];
    }
    if (cheque.fecha_pago < hoyStr && hoyStr in cuentaMap) {
      return cuentaMap[hoyStr];
    }
    return null;
  };

  // Filtrado de cheques en Historial
  const chequesHistorialFiltrados = useMemo(() => {
    return chequesHistorial.filter((ch) => {
      if (filtroTipo !== "todos" && ch.tipo !== filtroTipo) return false;
      if (filtroEstado !== "todos" && ch.estado !== filtroEstado) return false;
      if (filtroCuenta !== "todas" && ch.cuenta_id !== filtroCuenta)
        return false;
      if (filtroDesde && ch.fecha_pago < filtroDesde) return false;
      if (filtroHasta && ch.fecha_pago > filtroHasta) return false;
      if (busquedaHistorial.trim()) {
        const q = busquedaHistorial.toLowerCase().trim();
        const num = (ch.numero || "").toLowerCase();
        const emisor = (ch.emisor || "").toLowerCase();
        const pagadoA = (ch.pagado_a || "").toLowerCase();
        const cliente = (ch.clientes?.nombre || "").toLowerCase();
        const banco = (ch.banco || "").toLowerCase();
        const cta = (ch.cuentas?.nombre || "").toLowerCase();
        if (
          !num.includes(q) &&
          !emisor.includes(q) &&
          !pagadoA.includes(q) &&
          !cliente.includes(q) &&
          !banco.includes(q) &&
          !cta.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    chequesHistorial,
    filtroTipo,
    filtroEstado,
    filtroCuenta,
    filtroDesde,
    filtroHasta,
    busquedaHistorial,
  ]);

  const tieneFiltrosHistorial =
    filtroTipo !== "todos" ||
    filtroEstado !== "todos" ||
    filtroCuenta !== "todas" ||
    filtroDesde !== "" ||
    filtroHasta !== "" ||
    busquedaHistorial.trim() !== "";

  const limpiarFiltrosHistorial = () => {
    setFiltroTipo("todos");
    setFiltroEstado("todos");
    setFiltroCuenta("todas");
    setFiltroDesde("");
    setFiltroHasta("");
    setBusquedaHistorial("");
  };

  return (
    <div className="space-y-6">
      {/* Encabezado y dos cifras a la derecha */}
      <EncabezadoPagina
        titulo="Cobros"
        acciones={
          <div className="flex flex-wrap items-center gap-6 text-right">
            <div>
              <div className="text-xs text-tinta-suave">
                Pendiente de acreditar
              </div>
              <div className="text-xl sm:text-2xl font-semibold tracking-tight text-tinta tabular-nums">
                {formatearPesos(pendienteAcreditar)}
              </div>
            </div>
            <div>
              <div className="text-xs text-tinta-suave">
                Cheques esta semana
              </div>
              <div className="text-xl sm:text-2xl font-semibold tracking-tight text-tinta tabular-nums">
                {formatearPesos(chequesEstaSemana)}
              </div>
            </div>
          </div>
        }
      />

      {/* Pestañas principales */}
      <div className="flex flex-wrap gap-2">
        {PESTANAS.map((p) => {
          const activa = pestanaActiva === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => cambiarPestana(p.id)}
              aria-pressed={activa}
              className={`h-10 px-4 rounded-md border text-sm font-medium transition-colors ${
                activa
                  ? "border-marca bg-marca-suave text-marca"
                  : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
              }`}
            >
              {p.etiqueta}{" "}
              <span className="text-tinta-suave">({conteos[p.id]})</span>
            </button>
          );
        })}
      </div>

      {/* Contenido según pestaña activa */}
      {cargando ? (
        <div className="py-12 text-center text-tinta-suave">
          Cargando datos...
        </div>
      ) : pestanaActiva === "pendientes" ? (
        cobrosPendientes.length === 0 ? (
          <Tarjeta className="p-8 text-center text-tinta-suave">
            No hay cobros pendientes de acreditar.
          </Tarjeta>
        ) : (
          <Tarjeta>
            {/* Móvil: lista dividida */}
            <div className="divide-y divide-borde md:hidden">
              {cobrosPendientes.map((c) => {
                const refCheque = c.cheques?.numero
                  ? `Cheque #${c.cheques.numero}`
                  : c.referencia || "—";

                const acciones: AccionMenu[] = [
                  {
                    texto: "Marcar acreditado",
                    onClick: () => marcarAcreditadoCobro(c),
                  },
                  { separador: true },
                  {
                    texto: "Marcar rechazado",
                    onClick: () => marcarRechazadoCobro(c),
                    peligro: true,
                  },
                ];

                return (
                  <div key={c.id} className="p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      {c.cliente_id ? (
                        <Link
                          to={`/clientes/${c.cliente_id}`}
                          className="font-semibold text-tinta hover:underline truncate text-sm"
                        >
                          {c.clientes?.nombre ?? "—"}
                        </Link>
                      ) : (
                        <span className="font-semibold text-tinta truncate text-sm">
                          {c.clientes?.nombre ?? "—"}
                        </span>
                      )}
                      <ChipCobro estado={c.estado} />
                    </div>
                    <div className="text-[13px] text-tinta-suave truncate">
                      {formatearFecha(c.fecha)} ·{" "}
                      {ETIQUETA_MEDIO_PAGO[c.medio] ?? c.medio}
                      {c.cuentas?.nombre ? ` · ${c.cuentas.nombre}` : ""}
                      {refCheque !== "—" ? ` · ${refCheque}` : ""}
                      {c.fecha_acreditacion
                        ? ` · Acredita ${formatearFecha(c.fecha_acreditacion)}`
                        : ""}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-0.5">
                      <span className="text-sm font-semibold tabular-nums text-tinta">
                        {formatearPesos(c.monto)}
                      </span>
                      <MenuAcciones acciones={acciones} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: tabla */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-tinta-suave">
                  <tr className="border-b border-borde">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Medio</th>
                    <th className="px-4 py-3 font-medium">Cuenta</th>
                    <th className="px-4 py-3 font-medium">
                      Referencia / Nº cheque
                    </th>
                    <th className="px-4 py-3 font-medium">Acredita</th>
                    <th className="px-4 py-3 text-right font-medium">Monto</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="w-12 px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {cobrosPendientes.map((c) => {
                    const refCheque = c.cheques?.numero
                      ? `Cheque #${c.cheques.numero}`
                      : c.referencia || "—";

                    const acciones: AccionMenu[] = [
                      {
                        texto: "Marcar acreditado",
                        onClick: () => marcarAcreditadoCobro(c),
                      },
                      { separador: true },
                      {
                        texto: "Marcar rechazado",
                        onClick: () => marcarRechazadoCobro(c),
                        peligro: true,
                      },
                    ];

                    return (
                      <ConMenuContextual key={c.id} acciones={acciones}>
                        <tr className="hover:bg-fondo transition-colors">
                          <td className="px-4 py-3 text-tinta-suave tabular-nums whitespace-nowrap">
                            {formatearFecha(c.fecha)}
                          </td>
                          <td className="px-4 py-3 font-medium text-tinta">
                            {c.cliente_id ? (
                              <Link
                                to={`/clientes/${c.cliente_id}`}
                                className="hover:underline text-tinta"
                              >
                                {c.clientes?.nombre ?? "—"}
                              </Link>
                            ) : (
                              (c.clientes?.nombre ?? "—")
                            )}
                          </td>
                          <td className="px-4 py-3 text-tinta">
                            {ETIQUETA_MEDIO_PAGO[c.medio] ?? c.medio}
                          </td>
                          <td className="px-4 py-3 text-tinta-suave">
                            {c.cuentas?.nombre ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-tinta-suave tabular-nums">
                            {refCheque}
                          </td>
                          <td className="px-4 py-3 text-tinta-suave tabular-nums whitespace-nowrap">
                            {c.fecha_acreditacion
                              ? formatearFecha(c.fecha_acreditacion)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-tinta tabular-nums">
                            {formatearPesos(c.monto)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <ChipCobro estado={c.estado} />
                          </td>
                          <td className="px-2 py-3 text-right">
                            <MenuAcciones acciones={acciones} />
                          </td>
                        </tr>
                      </ConMenuContextual>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )
      ) : pestanaActiva === "cheques" ? (
        <div className="space-y-4">
          {/* Subpestañas de cheques */}
          <div className="flex flex-wrap gap-2 border-b border-borde pb-3">
            {SUBPESTANAS_CHEQUES.map((sp) => {
              const activa = subPestanaCheques === sp.id;
              return (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => cambiarSubPestana(sp.id)}
                  aria-pressed={activa}
                  className={`h-8 px-3 rounded text-xs font-medium transition-colors ${
                    activa
                      ? "bg-marca text-white shadow-sm"
                      : "bg-superficie text-tinta-suave hover:bg-fondo border border-borde"
                  }`}
                >
                  {sp.etiqueta}{" "}
                  <span
                    className={activa ? "text-white/80" : "text-tinta-suave"}
                  >
                    ({conteos[sp.id]})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Si se inició el flujo de endoso inline */}
          {chequeParaEndosar && (
            <Tarjeta className="p-4 sm:p-6 space-y-4 border-marca bg-superficie">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-tinta">
                    Registrar gasto con cheque endosado
                  </h3>
                  <p className="text-xs text-tinta-suave">
                    Cheque #{chequeParaEndosar.cheque.numero || ""} por{" "}
                    {formatearPesos(chequeParaEndosar.cheque.monto)} para{" "}
                    <strong className="text-tinta">
                      {chequeParaEndosar.aQuien}
                    </strong>
                  </p>
                </div>
                <Boton
                  variante="secundario"
                  tamano="md"
                  onClick={() => setChequeParaEndosar(null)}
                >
                  Cancelar endoso
                </Boton>
              </div>
              <FormularioMovimiento
                tipoInicial="egreso"
                chequeTerceroInicial={chequeParaEndosar.cheque}
                endosadoAInicial={chequeParaEndosar.aQuien}
                onGuardado={() => {
                  setChequeParaEndosar(null);
                  cargarDatos();
                }}
                onCancelar={() => setChequeParaEndosar(null)}
              />
            </Tarjeta>
          )}

          {/* Subpestaña 1: En cartera */}
          {subPestanaCheques === "cartera" &&
            (chequesCartera.length === 0 ? (
              <Tarjeta className="p-8 text-center text-tinta-suave">
                No hay cheques en cartera ni depositados.
              </Tarjeta>
            ) : (
              <Tarjeta>
                {/* Móvil: lista dividida */}
                <div className="divide-y divide-borde md:hidden">
                  {chequesCartera.map((ch) => (
                    <FilaCheque
                      key={ch.id}
                      cheque={ch}
                      cuentas={cuentas}
                      vista="cartera"
                      modo="movil"
                      onActualizado={cargarDatos}
                      onEndosar={(cheque, aQuien) =>
                        setChequeParaEndosar({ cheque, aQuien })
                      }
                    />
                  ))}
                </div>

                {/* Desktop: tabla */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-tinta-suave">
                      <tr className="border-b border-borde">
                        <th className="px-4 py-3 font-medium">Fecha de pago</th>
                        <th className="px-4 py-3 font-medium">Número</th>
                        <th className="px-4 py-3 font-medium">Banco</th>
                        <th className="px-4 py-3 font-medium">Emisor</th>
                        <th className="px-4 py-3 font-medium">Cliente</th>
                        <th className="px-4 py-3 font-medium">E-cheq</th>
                        <th className="px-4 py-3 text-right font-medium">
                          Monto
                        </th>
                        <th className="px-4 py-3 font-medium">Estado</th>
                        <th className="w-12 px-2 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borde">
                      {chequesCartera.map((ch) => (
                        <FilaCheque
                          key={ch.id}
                          cheque={ch}
                          cuentas={cuentas}
                          vista="cartera"
                          modo="desktop"
                          onActualizado={cargarDatos}
                          onEndosar={(cheque, aQuien) =>
                            setChequeParaEndosar({ cheque, aQuien })
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            ))}

          {/* Subpestaña 2: A cubrir */}
          {subPestanaCheques === "cubrir" &&
            (chequesCubrir.length === 0 ? (
              <Tarjeta className="p-8 text-center text-tinta-suave">
                No hay cheques propios pendientes de débito a cubrir.
              </Tarjeta>
            ) : (
              <Tarjeta>
                {/* Móvil: lista dividida */}
                <div className="divide-y divide-borde md:hidden">
                  {chequesCubrir.map((ch) => (
                    <FilaCheque
                      key={ch.id}
                      cheque={ch}
                      cuentas={cuentas}
                      saldoProyectado={obtenerSaldoProyectado(ch)}
                      vista="cubrir"
                      modo="movil"
                      onActualizado={cargarDatos}
                      onEndosar={(cheque, aQuien) =>
                        setChequeParaEndosar({ cheque, aQuien })
                      }
                    />
                  ))}
                </div>

                {/* Desktop: tabla */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-tinta-suave">
                      <tr className="border-b border-borde">
                        <th className="px-4 py-3 font-medium">Fecha de pago</th>
                        <th className="px-4 py-3 font-medium">Número</th>
                        <th className="px-4 py-3 font-medium">Cuenta origen</th>
                        <th className="px-4 py-3 font-medium">Destinatario</th>
                        <th className="px-4 py-3 font-medium">Cliente</th>
                        <th className="px-4 py-3 font-medium">E-cheq</th>
                        <th className="px-4 py-3 text-right font-medium">
                          Monto
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Saldo proyectado
                        </th>
                        <th className="px-4 py-3 font-medium">Estado</th>
                        <th className="w-12 px-2 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borde">
                      {chequesCubrir.map((ch) => (
                        <FilaCheque
                          key={ch.id}
                          cheque={ch}
                          cuentas={cuentas}
                          saldoProyectado={obtenerSaldoProyectado(ch)}
                          vista="cubrir"
                          modo="desktop"
                          onActualizado={cargarDatos}
                          onEndosar={(cheque, aQuien) =>
                            setChequeParaEndosar({ cheque, aQuien })
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            ))}

          {/* Subpestaña 3: Historial */}
          {subPestanaCheques === "historial" && (
            <div className="space-y-3">
              {/* Filtros de historial */}
              <Tarjeta className="p-3.5 sm:p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="sm:col-span-2">
                    <Campo etiqueta="Buscar" id="busq_historial">
                      <Entrada
                        id="busq_historial"
                        placeholder="Nº cheque, emisor, banco, cliente..."
                        value={busquedaHistorial}
                        onChange={(e) => setBusquedaHistorial(e.target.value)}
                      />
                    </Campo>
                  </div>

                  <Campo etiqueta="Tipo" id="filtro_tipo">
                    <Selector
                      id="filtro_tipo"
                      value={filtroTipo}
                      onChange={(e) =>
                        setFiltroTipo(
                          e.target.value as "todos" | "recibido" | "emitido",
                        )
                      }
                    >
                      <option value="todos">Todos los tipos</option>
                      <option value="recibido">Recibidos (terceros)</option>
                      <option value="emitido">Emitidos (propios)</option>
                    </Selector>
                  </Campo>

                  <Campo etiqueta="Estado" id="filtro_estado">
                    <Selector
                      id="filtro_estado"
                      value={filtroEstado}
                      onChange={(e) =>
                        setFiltroEstado(
                          e.target.value as "todos" | EstadoCheque,
                        )
                      }
                    >
                      <option value="todos">Todos los estados</option>
                      {ESTADOS_CHEQUE_FILTRO.map((st) => (
                        <option key={st} value={st}>
                          {ETIQUETA_ESTADO_CHEQUE[st] ?? st}
                        </option>
                      ))}
                    </Selector>
                  </Campo>

                  <Campo etiqueta="Cuenta" id="filtro_cuenta">
                    <Selector
                      id="filtro_cuenta"
                      value={filtroCuenta}
                      onChange={(e) => setFiltroCuenta(e.target.value)}
                    >
                      <option value="todas">Todas las cuentas</option>
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </Selector>
                  </Campo>

                  <div className="grid grid-cols-2 gap-2">
                    <Campo etiqueta="Desde" id="filtro_desde">
                      <Entrada
                        id="filtro_desde"
                        type="date"
                        value={filtroDesde}
                        onChange={(e) => setFiltroDesde(e.target.value)}
                      />
                    </Campo>
                    <Campo etiqueta="Hasta" id="filtro_hasta">
                      <Entrada
                        id="filtro_hasta"
                        type="date"
                        value={filtroHasta}
                        onChange={(e) => setFiltroHasta(e.target.value)}
                      />
                    </Campo>
                  </div>
                </div>

                {tieneFiltrosHistorial && (
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-tinta-suave">
                      Mostrando {chequesHistorialFiltrados.length} de{" "}
                      {chequesHistorial.length} cheques
                    </span>
                    <button
                      type="button"
                      onClick={limpiarFiltrosHistorial}
                      className="text-marca hover:underline font-medium"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                )}
              </Tarjeta>

              {chequesHistorialFiltrados.length === 0 ? (
                <Tarjeta className="p-8 text-center text-tinta-suave">
                  No se encontraron cheques con los filtros seleccionados.
                </Tarjeta>
              ) : (
                <Tarjeta>
                  {/* Móvil: lista dividida */}
                  <div className="divide-y divide-borde md:hidden">
                    {chequesHistorialFiltrados.map((ch) => (
                      <FilaCheque
                        key={ch.id}
                        cheque={ch}
                        cuentas={cuentas}
                        vista="historial"
                        modo="movil"
                        onActualizado={cargarDatos}
                        onEndosar={(cheque, aQuien) =>
                          setChequeParaEndosar({ cheque, aQuien })
                        }
                      />
                    ))}
                  </div>

                  {/* Desktop: tabla */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-tinta-suave">
                        <tr className="border-b border-borde">
                          <th className="px-4 py-3 font-medium">
                            Fecha de pago
                          </th>
                          <th className="px-4 py-3 font-medium">Número</th>
                          <th className="px-4 py-3 font-medium">
                            Banco / Cuenta
                          </th>
                          <th className="px-4 py-3 font-medium">
                            Emisor / Destinatario
                          </th>
                          <th className="px-4 py-3 font-medium">Cliente</th>
                          <th className="px-4 py-3 font-medium">E-cheq</th>
                          <th className="px-4 py-3 text-right font-medium">
                            Monto
                          </th>
                          <th className="px-4 py-3 font-medium">Estado</th>
                          <th className="w-12 px-2 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-borde">
                        {chequesHistorialFiltrados.map((ch) => (
                          <FilaCheque
                            key={ch.id}
                            cheque={ch}
                            cuentas={cuentas}
                            vista="historial"
                            modo="desktop"
                            onActualizado={cargarDatos}
                            onEndosar={(cheque, aQuien) =>
                              setChequeParaEndosar({ cheque, aQuien })
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Tarjeta>
              )}
            </div>
          )}
        </div>
      ) : /* Pestaña 3: Todos los cobros */
      todosCobros.length === 0 ? (
        <Tarjeta className="p-8 text-center text-tinta-suave">
          No hay cobros registrados.
        </Tarjeta>
      ) : (
        <Tarjeta>
          {/* Móvil: lista dividida */}
          <div className="divide-y divide-borde md:hidden">
            {todosCobros.map((c) => {
              const refCheque = c.cheques?.numero
                ? `Cheque #${c.cheques.numero}`
                : c.referencia || "—";

              const acciones: AccionMenu[] = [];
              if (c.estado === "pendiente") {
                acciones.push({
                  texto: "Marcar acreditado",
                  onClick: () => marcarAcreditadoCobro(c),
                });
                acciones.push({ separador: true });
                acciones.push({
                  texto: "Marcar rechazado",
                  onClick: () => marcarRechazadoCobro(c),
                  peligro: true,
                });
              } else if (c.estado === "acreditado") {
                acciones.push({
                  texto: "Marcar rechazado",
                  onClick: () => marcarRechazadoCobro(c),
                  peligro: true,
                });
              }

              return (
                <div key={c.id} className="p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    {c.cliente_id ? (
                      <Link
                        to={`/clientes/${c.cliente_id}`}
                        className="font-semibold text-tinta hover:underline truncate text-sm"
                      >
                        {c.clientes?.nombre ?? "—"}
                      </Link>
                    ) : (
                      <span className="font-semibold text-tinta truncate text-sm">
                        {c.clientes?.nombre ?? "—"}
                      </span>
                    )}
                    <ChipCobro estado={c.estado} />
                  </div>
                  <div className="text-[13px] text-tinta-suave truncate">
                    {formatearFecha(c.fecha)} ·{" "}
                    {ETIQUETA_MEDIO_PAGO[c.medio] ?? c.medio}
                    {c.cuentas?.nombre ? ` · ${c.cuentas.nombre}` : ""}
                    {refCheque !== "—" ? ` · ${refCheque}` : ""}
                    {c.fecha_acreditacion
                      ? ` · Acredita ${formatearFecha(c.fecha_acreditacion)}`
                      : ""}
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <span className="text-sm font-semibold tabular-nums text-tinta">
                      {formatearPesos(c.monto)}
                    </span>
                    {acciones.length > 0 ? (
                      <MenuAcciones acciones={acciones} />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-tinta-suave">
                <tr className="border-b border-borde">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Medio</th>
                  <th className="px-4 py-3 font-medium">Cuenta</th>
                  <th className="px-4 py-3 font-medium">
                    Referencia / Nº cheque
                  </th>
                  <th className="px-4 py-3 font-medium">Acredita</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="w-12 px-2 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {todosCobros.map((c) => {
                  const refCheque = c.cheques?.numero
                    ? `Cheque #${c.cheques.numero}`
                    : c.referencia || "—";

                  const acciones: AccionMenu[] = [];
                  if (c.estado === "pendiente") {
                    acciones.push({
                      texto: "Marcar acreditado",
                      onClick: () => marcarAcreditadoCobro(c),
                    });
                    acciones.push({ separador: true });
                    acciones.push({
                      texto: "Marcar rechazado",
                      onClick: () => marcarRechazadoCobro(c),
                      peligro: true,
                    });
                  } else if (c.estado === "acreditado") {
                    acciones.push({
                      texto: "Marcar rechazado",
                      onClick: () => marcarRechazadoCobro(c),
                      peligro: true,
                    });
                  }

                  return (
                    <ConMenuContextual key={c.id} acciones={acciones}>
                      <tr className="hover:bg-fondo transition-colors">
                        <td className="px-4 py-3 text-tinta-suave tabular-nums whitespace-nowrap">
                          {formatearFecha(c.fecha)}
                        </td>
                        <td className="px-4 py-3 font-medium text-tinta">
                          {c.cliente_id ? (
                            <Link
                              to={`/clientes/${c.cliente_id}`}
                              className="hover:underline text-tinta"
                            >
                              {c.clientes?.nombre ?? "—"}
                            </Link>
                          ) : (
                            (c.clientes?.nombre ?? "—")
                          )}
                        </td>
                        <td className="px-4 py-3 text-tinta">
                          {ETIQUETA_MEDIO_PAGO[c.medio] ?? c.medio}
                        </td>
                        <td className="px-4 py-3 text-tinta-suave">
                          {c.cuentas?.nombre ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-tinta-suave tabular-nums">
                          {refCheque}
                        </td>
                        <td className="px-4 py-3 text-tinta-suave tabular-nums whitespace-nowrap">
                          {c.fecha_acreditacion
                            ? formatearFecha(c.fecha_acreditacion)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-tinta tabular-nums">
                          {formatearPesos(c.monto)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <ChipCobro estado={c.estado} />
                        </td>
                        <td className="px-2 py-3 text-right">
                          {acciones.length > 0 ? (
                            <MenuAcciones acciones={acciones} />
                          ) : null}
                        </td>
                      </tr>
                    </ConMenuContextual>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
