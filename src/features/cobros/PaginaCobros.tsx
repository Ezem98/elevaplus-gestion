import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Cobro, Cheque, EstadoCheque } from "@/lib/tipos";
import { ETIQUETA_MEDIO_PAGO } from "@/lib/tipos";
import { formatearPesos, formatearFecha } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipCobro, ChipCheque } from "@/components/ui/Chip";
import { MenuAcciones, ConMenuContextual, type AccionMenu } from "@/components/ui/MenuAcciones";

type ClavePestana = "pendientes" | "cheques" | "todos";

interface PestanaConfig {
  id: ClavePestana;
  etiqueta: string;
}

const PESTANAS: PestanaConfig[] = [
  { id: "pendientes", etiqueta: "Pendientes" },
  { id: "cheques", etiqueta: "Cheques en cartera" },
  { id: "todos", etiqueta: "Todos" },
];

function normalizarPestana(param: string | null): ClavePestana {
  if (param === "cheques" || param === "todos" || param === "pendientes") {
    return param;
  }
  return "pendientes";
}

export function PaginaCobros() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pestanaActiva = normalizarPestana(searchParams.get("tab"));

  const [pendienteAcreditar, setPendienteAcreditar] = useState(0);
  const [chequesEstaSemana, setChequesEstaSemana] = useState(0);

  const [cobrosPendientes, setCobrosPendientes] = useState<Cobro[]>([]);
  const [chequesCartera, setChequesCartera] = useState<Cheque[]>([]);
  const [todosCobros, setTodosCobros] = useState<Cobro[]>([]);

  const [conteos, setConteos] = useState({
    pendientes: 0,
    cheques: 0,
    todos: 0,
  });

  const [cargando, setCargando] = useState(true);

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

  const cargarCifras = useCallback(async () => {
    // 1. Cobros pendientes de acreditar
    const { data: cData } = await supabase
      .from("cobros")
      .select("monto")
      .eq("estado", "pendiente");
    const totalPendiente = (cData ?? []).reduce(
      (acc, c) => acc + Number(c.monto),
      0
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
      0
    );
    setChequesEstaSemana(totalChequesSemana);
  }, [hoyStr, hoyMas7Str]);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    await cargarCifras();

    // Consultas para cada pestaña
    const [pendientesRes, chequesRes, todosRes] = await Promise.all([
      supabase
        .from("cobros")
        .select("*, clientes(nombre), cheques(id, numero, estado)")
        .eq("estado", "pendiente"),
      supabase
        .from("cheques")
        .select("*, clientes(nombre)")
        .eq("tipo", "recibido")
        .in("estado", ["en_cartera", "depositado"])
        .order("fecha_pago", { ascending: true }),
      supabase
        .from("cobros")
        .select("*, clientes(nombre), cheques(id, numero, estado)")
        .order("fecha", { ascending: false })
        .limit(100),
    ]);

    const pend = ((pendientesRes.data as Cobro[]) ?? []).sort((a, b) => {
      const fa = a.fecha_acreditacion || a.fecha;
      const fb = b.fecha_acreditacion || b.fecha;
      return fa.localeCompare(fb);
    });

    const ch = (chequesRes.data as Cheque[]) ?? [];
    const td = (todosRes.data as Cobro[]) ?? [];

    setCobrosPendientes(pend);
    setChequesCartera(ch);
    setTodosCobros(td);

    setConteos({
      pendientes: pend.length,
      cheques: ch.length,
      todos: td.length,
    });

    setCargando(false);
  }, [cargarCifras]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Acciones para cobros
  const marcarAcreditadoCobro = async (cobro: Cobro) => {
    try {
      if (cobro.cheque_id) {
        const { error } = await supabase
          .from("cheques")
          .update({ estado: "acreditado" })
          .eq("id", cobro.cheque_id);
        if (error) throw error;
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
        "¿Seguro que querés marcar este cobro como rechazado? Si afecta a servicios cobrados, se revertirá su estado."
      )
    ) {
      return;
    }
    try {
      if (cobro.cheque_id) {
        const { error } = await supabase
          .from("cheques")
          .update({ estado: "rechazado" })
          .eq("id", cobro.cheque_id);
        if (error) throw error;
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

  // Acciones para cheques
  const actualizarEstadoCheque = async (chequeId: string, nuevoEstado: EstadoCheque) => {
    if (nuevoEstado === "rechazado") {
      if (
        !window.confirm(
          "¿Seguro que querés marcar este cheque como rechazado? Se rechazará el cobro asociado y recalculará los servicios."
        )
      ) {
        return;
      }
    }
    try {
      const { error } = await supabase
        .from("cheques")
        .update({ estado: nuevoEstado })
        .eq("id", chequeId);
      if (error) throw error;
      cargarDatos();
    } catch (err: any) {
      alert("Error al actualizar el cheque: " + (err.message || err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado y dos cifras a la derecha */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-tinta">Cobros</h1>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-right">
          <div>
            <div className="text-xs text-tinta-suave">Pendiente de acreditar</div>
            <div className="text-xl sm:text-2xl font-semibold tracking-tight text-tinta tabular-nums">
              {formatearPesos(pendienteAcreditar)}
            </div>
          </div>
          <div>
            <div className="text-xs text-tinta-suave">Cheques esta semana</div>
            <div className="text-xl sm:text-2xl font-semibold tracking-tight text-tinta tabular-nums">
              {formatearPesos(chequesEstaSemana)}
            </div>
          </div>
        </div>
      </header>

      {/* Pestañas */}
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
              {p.etiqueta} <span className="text-tinta-suave">({conteos[p.id]})</span>
            </button>
          );
        })}
      </div>

      {/* Tabla según pestaña activa */}
      {cargando ? (
        <div className="py-12 text-center text-tinta-suave">Cargando cobros...</div>
      ) : pestanaActiva === "pendientes" ? (
        cobrosPendientes.length === 0 ? (
          <Tarjeta className="p-8 text-center text-tinta-suave">
            No hay cobros pendientes de acreditar.
          </Tarjeta>
        ) : (
          <Tarjeta className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-tinta-suave">
                <tr className="border-b border-borde">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Medio</th>
                  <th className="px-4 py-3 font-medium">Referencia / Nº cheque</th>
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
                            c.clientes?.nombre ?? "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-tinta">
                          {ETIQUETA_MEDIO_PAGO[c.medio] ?? c.medio}
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
          </Tarjeta>
        )
      ) : pestanaActiva === "cheques" ? (
        chequesCartera.length === 0 ? (
          <Tarjeta className="p-8 text-center text-tinta-suave">
            No hay cheques en cartera ni depositados.
          </Tarjeta>
        ) : (
          <Tarjeta className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-tinta-suave">
                <tr className="border-b border-borde">
                  <th className="px-4 py-3 font-medium">Fecha de pago</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Emisor</th>
                  <th className="px-4 py-3 font-medium">Banco</th>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">E-cheq</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="w-12 px-2 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {chequesCartera.map((ch) => {
                  const yaPaso = ch.fecha_pago < hoyStr;

                  const acciones: AccionMenu[] = [];
                  if (ch.estado === "en_cartera") {
                    acciones.push({
                      texto: "Marcar depositado",
                      onClick: () => actualizarEstadoCheque(ch.id, "depositado"),
                    });
                    acciones.push({
                      texto: "Marcar acreditado",
                      onClick: () => actualizarEstadoCheque(ch.id, "acreditado"),
                    });
                    acciones.push({ separador: true });
                    acciones.push({
                      texto: "Marcar rechazado",
                      onClick: () => actualizarEstadoCheque(ch.id, "rechazado"),
                      peligro: true,
                    });
                  } else if (ch.estado === "depositado") {
                    acciones.push({
                      texto: "Marcar acreditado",
                      onClick: () => actualizarEstadoCheque(ch.id, "acreditado"),
                    });
                    acciones.push({ separador: true });
                    acciones.push({
                      texto: "Marcar rechazado",
                      onClick: () => actualizarEstadoCheque(ch.id, "rechazado"),
                      peligro: true,
                    });
                  }

                  return (
                    <ConMenuContextual key={ch.id} acciones={acciones}>
                      <tr className="hover:bg-fondo transition-colors">
                        <td
                          className={`px-4 py-3 tabular-nums whitespace-nowrap ${
                            yaPaso ? "text-alerta font-medium" : "text-tinta-suave"
                          }`}
                        >
                          {formatearFecha(ch.fecha_pago)}
                        </td>
                        <td className="px-4 py-3 font-medium text-tinta">
                          {ch.cliente_id ? (
                            <Link
                              to={`/clientes/${ch.cliente_id}`}
                              className="hover:underline text-tinta"
                            >
                              {ch.clientes?.nombre ?? "—"}
                            </Link>
                          ) : (
                            ch.clientes?.nombre ?? "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-tinta-suave">
                          {ch.emisor || "—"}
                        </td>
                        <td className="px-4 py-3 text-tinta-suave">
                          {ch.banco || "—"}
                        </td>
                        <td className="px-4 py-3 text-tinta-suave tabular-nums">
                          {ch.numero || "—"}
                        </td>
                        <td className="px-4 py-3 text-tinta-suave">
                          {ch.es_echeq ? "Sí" : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-tinta tabular-nums">
                          {formatearPesos(ch.monto)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <ChipCheque estado={ch.estado} />
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
          </Tarjeta>
        )
      ) : (
        todosCobros.length === 0 ? (
          <Tarjeta className="p-8 text-center text-tinta-suave">
            No hay cobros registrados.
          </Tarjeta>
        ) : (
          <Tarjeta className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-tinta-suave">
                <tr className="border-b border-borde">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Medio</th>
                  <th className="px-4 py-3 font-medium">Referencia / Nº cheque</th>
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
                            c.clientes?.nombre ?? "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-tinta">
                          {ETIQUETA_MEDIO_PAGO[c.medio] ?? c.medio}
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
          </Tarjeta>
        )
      )}
    </div>
  );
}
