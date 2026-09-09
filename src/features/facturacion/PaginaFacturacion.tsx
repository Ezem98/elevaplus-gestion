import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Factura, Servicio, CondicionIva } from "@/lib/tipos";
import { ETIQUETA_CONDICION_IVA, ETIQUETA_TIPO } from "@/lib/tipos";
import { formatearPesos, formatearFecha, formatearNumeroFactura } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Entrada } from "@/components/ui/Campo";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { MenuAcciones } from "@/components/ui/MenuAcciones";
import { FormularioFactura } from "./FormularioFactura";
import { FormularioNotaCredito } from "./FormularioNotaCredito";

interface ClientePendiente {
  id: string;
  nombre: string;
  cuit: string | null;
  condicion_iva: CondicionIva | null;
}

interface GrupoCliente {
  cliente: ClientePendiente | null;
  servicios: Servicio[];
}

export function PaginaFacturacion() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");

  const pestanaActiva =
    tabParam === "facturas"
      ? "facturas"
      : tabParam === "notas_credito"
      ? "notas_credito"
      : "pendientes";

  const cambiarPestana = (nueva: "pendientes" | "facturas" | "notas_credito") => {
    setSearchParams({ tab: nueva });
  };

  // --- Estado pestaña Pendientes ---
  const [pendientes, setPendientes] = useState<Servicio[]>([]);
  const [cargandoPendientes, setCargandoPendientes] = useState(false);
  const [seleccionadosPorGrupo, setSeleccionadosPorGrupo] = useState<Record<string, string[]>>({});
  const [grupoFacturando, setGrupoFacturando] = useState<string | null>(null);

  // --- Estado pestaña Facturas ---
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [serviciosFacturas, setServiciosFacturas] = useState<Record<string, Servicio[]>>({});
  const [cargandoFacturas, setCargandoFacturas] = useState(false);
  const [busquedaFacturas, setBusquedaFacturas] = useState("");
  const [facturaExpandida, setFacturaExpandida] = useState<string | null>(null);
  const [facturaParaNC, setFacturaParaNC] = useState<Factura | null>(null);

  // --- Estado pestaña Notas de crédito ---
  const [notasCredito, setNotasCredito] = useState<any[]>([]);
  const [cargandoNC, setCargandoNC] = useState(false);

  // ==================== Cargar Pendientes ====================
  const cargarPendientes = useCallback(async () => {
    setCargandoPendientes(true);
    const { data, error } = await supabase
      .from("servicios")
      .select("id, numero, tipo, estado, descripcion, fecha_programada, monto, aplica_iva, cliente_id, no_facturable, factura_id, clientes(id, nombre, cuit, condicion_iva)")
      .in("estado", ["terminado", "cobrado"])
      .is("factura_id", null)
      .eq("no_facturable", false)
      .order("fecha_programada", { ascending: true });

    if (!error && data) {
      setPendientes(data as unknown as Servicio[]);
    }
    setCargandoPendientes(false);
  }, []);

  // ==================== Cargar Facturas ====================
  const cargarFacturas = useCallback(async () => {
    setCargandoFacturas(true);
    const { data: facs, error } = await supabase
      .from("facturas")
      .select("id, tipo, punto_venta, numero, fecha, cliente_id, neto, iva, total, anulada, notas, clientes(nombre)")
      .in("tipo", ["A", "B", "C"])
      .order("fecha", { ascending: false })
      .limit(200);

    if (!error && facs) {
      setFacturas(facs as unknown as Factura[]);
      const fIds = facs.map((f: any) => f.id);
      if (fIds.length > 0) {
        const { data: sData } = await supabase
          .from("servicios")
          .select("id, numero, tipo, descripcion, monto, factura_id")
          .in("factura_id", fIds);

        const mapa: Record<string, Servicio[]> = {};
        for (const s of (sData as any[]) || []) {
          if (!mapa[s.factura_id]) mapa[s.factura_id] = [];
          mapa[s.factura_id].push(s);
        }
        setServiciosFacturas(mapa);
      } else {
        setServiciosFacturas({});
      }
    }
    setCargandoFacturas(false);
  }, []);

  // ==================== Cargar Notas de crédito ====================
  const cargarNotasCredito = useCallback(async () => {
    setCargandoNC(true);
    const { data, error } = await supabase
      .from("facturas")
      .select(
        "id, tipo, punto_venta, numero, fecha, total, notas, cliente_id, clientes(nombre), factura_asociada:facturas!factura_asociada_id(tipo, punto_venta, numero)"
      )
      .in("tipo", ["NC_A", "NC_B"])
      .order("fecha", { ascending: false })
      .limit(200);

    if (!error && data) {
      setNotasCredito(data);
    }
    setCargandoNC(false);
  }, []);

  useEffect(() => {
    if (pestanaActiva === "pendientes") {
      cargarPendientes();
    } else if (pestanaActiva === "facturas") {
      cargarFacturas();
    } else if (pestanaActiva === "notas_credito") {
      cargarNotasCredito();
    }
  }, [pestanaActiva, cargarPendientes, cargarFacturas, cargarNotasCredito]);

  // ==================== Agrupación de pendientes ====================
  const gruposPendientes = useMemo(() => {
    const gruposMap: Record<string, GrupoCliente> = {};
    const sinCliente: Servicio[] = [];

    for (const s of pendientes) {
      if (!s.cliente_id) {
        sinCliente.push(s);
      } else {
        if (!gruposMap[s.cliente_id]) {
          gruposMap[s.cliente_id] = {
            cliente: (s.clientes as unknown as ClientePendiente) || {
              id: s.cliente_id,
              nombre: "Cliente desconocido",
              cuit: null,
              condicion_iva: null,
            },
            servicios: [],
          };
        }
        gruposMap[s.cliente_id].servicios.push(s);
      }
    }

    const listaGrupos = Object.values(gruposMap).sort((a, b) =>
      (a.cliente?.nombre || "").localeCompare(b.cliente?.nombre || "")
    );

    if (sinCliente.length > 0) {
      listaGrupos.push({
        cliente: null,
        servicios: sinCliente,
      });
    }

    return listaGrupos;
  }, [pendientes]);

  // Selección de servicios en pendientes
  const toggleSeleccionServicio = (grupoKey: string, servicioId: string) => {
    setSeleccionadosPorGrupo((prev) => {
      const actuales = prev[grupoKey] || [];
      const nuevo = actuales.includes(servicioId)
        ? actuales.filter((id) => id !== servicioId)
        : [...actuales, servicioId];
      return { ...prev, [grupoKey]: nuevo };
    });
  };

  const toggleTodosServicios = (grupoKey: string, servicios: Servicio[]) => {
    setSeleccionadosPorGrupo((prev) => {
      const actuales = prev[grupoKey] || [];
      if (actuales.length === servicios.length) {
        return { ...prev, [grupoKey]: [] };
      }
      return { ...prev, [grupoKey]: servicios.map((s) => s.id) };
    });
  };

  const handleMarcarNoFacturable = async (servicioId: string) => {
    if (
      !window.confirm(
        "¿Marcar como no facturable? Sale de esta lista. Se puede revertir desde el detalle del servicio."
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("servicios")
      .update({ no_facturable: true })
      .eq("id", servicioId);

    if (!error) {
      cargarPendientes();
    }
  };

  // Filtrado de facturas
  const facturasFiltradas = useMemo(() => {
    if (!busquedaFacturas.trim()) return facturas;
    const q = busquedaFacturas.toLowerCase().trim();
    return facturas.filter((f) => {
      const clienteNombre = f.clientes?.nombre?.toLowerCase() || "";
      const numStr = String(f.numero);
      const comprobante = formatearNumeroFactura(f.tipo, f.punto_venta, f.numero).toLowerCase();
      return (
        clienteNombre.includes(q) ||
        numStr.includes(q) ||
        comprobante.includes(q)
      );
    });
  }, [facturas, busquedaFacturas]);

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <EncabezadoPagina
        titulo="Facturación"
        subtitulo="Control de pendientes, emisión y notas de crédito"
      />

      {/* Pestañas */}
      <div className="flex border-b border-borde gap-6">
        <button
          type="button"
          onClick={() => cambiarPestana("pendientes")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            pestanaActiva === "pendientes"
              ? "border-marca text-marca font-semibold"
              : "border-transparent text-tinta-suave hover:text-tinta"
          }`}
        >
          Pendientes
          {pendientes.length > 0 && (
            <span className="ml-2 rounded-full bg-marca-suave px-2 py-0.5 text-xs text-marca font-semibold">
              {pendientes.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => cambiarPestana("facturas")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            pestanaActiva === "facturas"
              ? "border-marca text-marca font-semibold"
              : "border-transparent text-tinta-suave hover:text-tinta"
          }`}
        >
          Facturas
        </button>

        <button
          type="button"
          onClick={() => cambiarPestana("notas_credito")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            pestanaActiva === "notas_credito"
              ? "border-marca text-marca font-semibold"
              : "border-transparent text-tinta-suave hover:text-tinta"
          }`}
        >
          Notas de crédito
        </button>
      </div>

      {/* ============================================================ */}
      {/* PESTAÑA: PENDIENTES */}
      {/* ============================================================ */}
      {pestanaActiva === "pendientes" && (
        <div className="space-y-6">
          {cargandoPendientes ? (
            <div className="py-12 text-center text-tinta-suave">
              Cargando servicios pendientes...
            </div>
          ) : gruposPendientes.length === 0 ? (
            <Tarjeta className="p-8 text-center text-tinta-suave">
              No hay servicios terminados o cobrados pendientes de facturar.
            </Tarjeta>
          ) : (
            gruposPendientes.map((grupo, idx) => {
              const esSinCliente = !grupo.cliente;
              const grupoKey = grupo.cliente?.id || "sin_cliente";
              const seleccionados = seleccionadosPorGrupo[grupoKey] || [];
              const todosSeleccionados =
                grupo.servicios.length > 0 &&
                seleccionados.length === grupo.servicios.length;

              const totalNetoGrupo = grupo.servicios.reduce(
                (acc, s) => acc + (Number(s.monto) || 0),
                0
              );

              const serviciosParaFacturar = grupo.servicios.filter((s) =>
                seleccionados.includes(s.id)
              );

              const estaFacturando = grupoFacturando === grupoKey;

              return (
                <Tarjeta key={grupoKey || idx} className="p-5 space-y-4">
                  {/* Encabezado del grupo */}
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-borde">
                    <div className="flex items-start gap-3">
                      {!esSinCliente && (
                        <input
                          type="checkbox"
                          checked={todosSeleccionados}
                          onChange={() => toggleTodosServicios(grupoKey, grupo.servicios)}
                          title="Seleccionar todos"
                          className="mt-1 size-4 rounded border-borde text-marca focus:ring-marca cursor-pointer"
                        />
                      )}
                      <div>
                        {esSinCliente ? (
                          <h2 className="text-base font-semibold text-tinta">Sin cliente</h2>
                        ) : (
                          <Link
                            to={`/clientes/${grupo.cliente!.id}`}
                            className="text-base font-semibold text-tinta hover:text-marca hover:underline"
                          >
                            {grupo.cliente!.nombre}
                          </Link>
                        )}
                        <div className="text-xs text-tinta-suave mt-0.5">
                          {esSinCliente ? (
                            <span className="text-alerta">Sin cliente asignado</span>
                          ) : grupo.cliente!.cuit ? (
                            <>
                              CUIT {grupo.cliente!.cuit}
                              {" · "}
                              {grupo.cliente!.condicion_iva
                                ? ETIQUETA_CONDICION_IVA[grupo.cliente!.condicion_iva]
                                : "Sin condición IVA"}
                            </>
                          ) : (
                            <span className="text-alerta font-medium">Sin CUIT</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums text-tinta">
                          {formatearPesos(totalNetoGrupo)} <span className="font-normal text-xs text-tinta-suave">neto</span>
                        </div>
                        <div className="text-xs text-tinta-suave">
                          {grupo.servicios.length}{" "}
                          {grupo.servicios.length === 1 ? "servicio" : "servicios"}
                        </div>
                      </div>

                      {!esSinCliente && (
                        <Boton
                          disabled={seleccionados.length === 0 || estaFacturando}
                          onClick={() => setGrupoFacturando(estaFacturando ? null : grupoKey)}
                        >
                          Facturar seleccionados ({seleccionados.length})
                        </Boton>
                      )}
                    </div>
                  </div>

                  {esSinCliente && (
                    <Aviso variante="alerta">
                      Asigná un cliente para poder facturar
                    </Aviso>
                  )}

                  {/* FormularioFactura inline si está facturando este grupo */}
                  {estaFacturando && grupo.cliente && (
                    <FormularioFactura
                      cliente={grupo.cliente}
                      servicios={serviciosParaFacturar}
                      onGuardado={() => {
                        setGrupoFacturando(null);
                        cargarPendientes();
                      }}
                      onCancelar={() => setGrupoFacturando(null)}
                    />
                  )}

                  {/* Filas de servicios */}
                  <div className="divide-y divide-borde">
                    {grupo.servicios.map((s) => {
                      const seleccionado = seleccionados.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          className="flex items-center gap-3 py-2.5 text-sm hover:bg-fondo/50 transition-colors"
                        >
                          {!esSinCliente ? (
                            <input
                              type="checkbox"
                              checked={seleccionado}
                              onChange={() => toggleSeleccionServicio(grupoKey, s.id)}
                              className="size-4 rounded border-borde text-marca focus:ring-marca cursor-pointer"
                            />
                          ) : (
                            <input
                              type="checkbox"
                              disabled
                              className="size-4 rounded border-borde text-tinta-tenue opacity-40 cursor-not-allowed"
                            />
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-tinta truncate">
                                #{s.numero} · {ETIQUETA_TIPO[s.tipo]}
                                {s.descripcion ? ` · ${s.descripcion}` : ""}
                              </span>
                              {s.aplica_iva === false && (
                                <span className="rounded bg-fondo px-1.5 py-0.2 text-[11px] text-tinta-suave border border-borde">
                                  sin IVA
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-tinta-suave mt-0.5">
                              {formatearFecha(s.fecha_programada)}
                            </div>
                          </div>

                          <div className="shrink-0 text-right font-semibold tabular-nums text-tinta">
                            {formatearPesos(s.monto)}
                          </div>

                          <div className="shrink-0">
                            <MenuAcciones
                              acciones={[
                                {
                                  texto: "Ver servicio",
                                  onClick: () => navigate(`/servicios/${s.id}`),
                                },
                                {
                                  texto: "No se factura",
                                  peligro: true,
                                  onClick: () => handleMarcarNoFacturable(s.id),
                                },
                              ]}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Tarjeta>
              );
            })
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* PESTAÑA: FACTURAS */}
      {/* ============================================================ */}
      {pestanaActiva === "facturas" && (
        <div className="space-y-4">
          {/* Buscador */}
          <div className="max-w-md">
            <Entrada
              placeholder="Buscar por cliente o número de factura..."
              value={busquedaFacturas}
              onChange={(e) => setBusquedaFacturas(e.target.value)}
            />
          </div>

          {cargandoFacturas ? (
            <div className="py-12 text-center text-tinta-suave">
              Cargando facturas...
            </div>
          ) : facturasFiltradas.length === 0 ? (
            <Tarjeta className="p-8 text-center text-tinta-suave">
              {busquedaFacturas ? "No se encontraron facturas." : "No hay facturas registradas."}
            </Tarjeta>
          ) : (
            <Tarjeta>
              {/* Móvil: lista dividida */}
              <div className="divide-y divide-borde md:hidden">
                {facturasFiltradas.map((f) => {
                  const servsDeEstaFactura = serviciosFacturas[f.id] || [];
                  const expandido = facturaExpandida === f.id;
                  const registrandoNC = facturaParaNC?.id === f.id;

                  const acciones = [
                    {
                      texto: expandido ? "Ocultar servicios" : "Ver servicios",
                      onClick: () =>
                        setFacturaExpandida(expandido ? null : f.id),
                    },
                    ...(!f.anulada
                      ? [
                          {
                            texto: "Registrar nota de crédito",
                            onClick: () =>
                              setFacturaParaNC(registrandoNC ? null : f),
                          },
                        ]
                      : []),
                  ];

                  return (
                    <div key={f.id} className="divide-y divide-borde">
                      <div className="p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-tinta truncate text-sm">
                            {f.clientes?.nombre || "—"}
                          </span>
                          {f.anulada ? (
                            <span className="inline-flex items-center rounded-full border border-peligro/20 bg-peligro-suave px-2 py-0.5 text-xs font-medium text-peligro">
                              Anulada
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-borde bg-fondo px-2 py-0.5 text-xs font-medium text-tinta-suave">
                              {f.tipo}
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] text-tinta-suave truncate">
                          {formatearFecha(f.fecha)} · {formatearNumeroFactura(f.tipo, f.punto_venta, f.numero)}
                          {servsDeEstaFactura.length > 0 ? ` · ${servsDeEstaFactura.length} serv.` : ""}
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-0.5">
                          <span className="text-sm font-semibold tabular-nums text-tinta">
                            {formatearPesos(f.total)}
                          </span>
                          <MenuAcciones acciones={acciones} />
                        </div>
                      </div>

                      {/* Lista expandida móvil */}
                      {expandido && (
                        <div className="bg-fondo/80 p-3 space-y-2 text-xs">
                          <span className="font-semibold text-tinta-suave block">
                            Servicios vinculados:
                          </span>
                          {servsDeEstaFactura.length === 0 ? (
                            <div className="text-tinta-suave">
                              No hay servicios asociados actualmente.
                            </div>
                          ) : (
                            <div className="divide-y divide-borde">
                              {servsDeEstaFactura.map((s) => (
                                <div
                                  key={s.id}
                                  className="py-1.5 flex items-center justify-between gap-2"
                                >
                                  <Link
                                    to={`/servicios/${s.id}`}
                                    className="text-marca hover:underline truncate"
                                  >
                                    #{s.numero} · {s.descripcion || ETIQUETA_TIPO[s.tipo]}
                                  </Link>
                                  <span className="tabular-nums font-medium text-tinta shrink-0">
                                    {formatearPesos(s.monto)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Formulario móvil NC */}
                      {registrandoNC && (
                        <div className="bg-fondo p-3">
                          <FormularioNotaCredito
                            facturaOriginal={f}
                            onGuardado={() => {
                              setFacturaParaNC(null);
                              cargarFacturas();
                            }}
                            onCancelar={() => setFacturaParaNC(null)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: tabla */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-borde text-xs font-semibold text-tinta-suave bg-fondo/50">
                      <th className="p-3.5">Fecha</th>
                      <th className="p-3.5">Comprobante</th>
                      <th className="p-3.5">Cliente</th>
                      <th className="p-3.5 text-right">Neto</th>
                      <th className="p-3.5 text-right">IVA</th>
                      <th className="p-3.5 text-right">Total</th>
                      <th className="p-3.5 text-center">Servicios</th>
                      <th className="p-3.5 text-center">Estado</th>
                      <th className="p-3.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {facturasFiltradas.map((f) => {
                      const servsDeEstaFactura = serviciosFacturas[f.id] || [];
                      const expandido = facturaExpandida === f.id;
                      const registrandoNC = facturaParaNC?.id === f.id;

                      return (
                        <tr key={f.id} className="hover:bg-fondo/40 transition-colors">
                          <td colSpan={9} className="p-0">
                            <div className="flex items-center w-full px-3.5 py-3">
                              <div className="w-24 shrink-0 text-tinta-suave tabular-nums">
                                {formatearFecha(f.fecha)}
                              </div>

                              <div className="w-40 shrink-0 font-medium tabular-nums text-tinta">
                                {formatearNumeroFactura(f.tipo, f.punto_venta, f.numero)}
                              </div>

                              <div className="min-w-0 flex-1 truncate font-medium text-tinta pr-2">
                                {f.clientes?.nombre || "—"}
                              </div>

                              <div className="w-24 shrink-0 text-right tabular-nums text-tinta-suave">
                                {formatearPesos(f.neto)}
                              </div>

                              <div className="w-24 shrink-0 text-right tabular-nums text-tinta-suave">
                                {formatearPesos(f.iva)}
                              </div>

                              <div className="w-28 shrink-0 text-right font-semibold tabular-nums text-tinta">
                                {formatearPesos(f.total)}
                              </div>

                              <div className="w-20 shrink-0 text-center tabular-nums text-tinta">
                                {servsDeEstaFactura.length}
                              </div>

                              <div className="w-24 shrink-0 text-center">
                                {f.anulada ? (
                                  <span className="inline-flex items-center rounded-full border border-peligro/20 bg-peligro-suave px-2.5 py-0.5 text-xs font-medium text-peligro">
                                    Anulada
                                  </span>
                                ) : null}
                              </div>

                              <div className="w-10 shrink-0 text-right">
                                <MenuAcciones
                                  acciones={[
                                    {
                                      texto: expandido ? "Ocultar servicios" : "Ver servicios",
                                      onClick: () =>
                                        setFacturaExpandida(expandido ? null : f.id),
                                    },
                                    ...(!f.anulada
                                      ? [
                                          {
                                            texto: "Registrar nota de crédito",
                                            onClick: () =>
                                              setFacturaParaNC(registrandoNC ? null : f),
                                          },
                                        ]
                                      : []),
                                  ]}
                                />
                              </div>
                            </div>

                            {/* Lista expandida de servicios vinculados */}
                            {expandido && (
                              <div className="border-t border-borde bg-fondo/80 px-6 py-3 space-y-2">
                                <span className="text-xs font-semibold text-tinta-suave block">
                                  Servicios vinculados a esta factura:
                                </span>
                                {servsDeEstaFactura.length === 0 ? (
                                  <div className="text-xs text-tinta-suave">
                                    No hay servicios asociados actualmente.
                                  </div>
                                ) : (
                                  <div className="divide-y divide-borde text-xs">
                                    {servsDeEstaFactura.map((s) => (
                                      <div
                                        key={s.id}
                                        className="py-1.5 flex items-center justify-between"
                                      >
                                        <Link
                                          to={`/servicios/${s.id}`}
                                          className="text-marca hover:underline truncate"
                                        >
                                          #{s.numero} · {s.descripcion || ETIQUETA_TIPO[s.tipo]}
                                        </Link>
                                        <span className="tabular-nums font-medium text-tinta shrink-0">
                                          {formatearPesos(s.monto)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Formulario inline para nota de crédito */}
                            {registrandoNC && (
                              <div className="border-t border-borde bg-fondo p-4">
                                <FormularioNotaCredito
                                  facturaOriginal={f}
                                  onGuardado={() => {
                                    setFacturaParaNC(null);
                                    cargarFacturas();
                                  }}
                                  onCancelar={() => setFacturaParaNC(null)}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* PESTAÑA: NOTAS DE CRÉDITO */}
      {/* ============================================================ */}
      {pestanaActiva === "notas_credito" && (
        <div className="space-y-4">
          {cargandoNC ? (
            <div className="py-12 text-center text-tinta-suave">
              Cargando notas de crédito...
            </div>
          ) : notasCredito.length === 0 ? (
            <Tarjeta className="p-8 text-center text-tinta-suave">
              No hay notas de crédito registradas.
            </Tarjeta>
          ) : (
            <Tarjeta>
              {/* Móvil: lista dividida */}
              <div className="divide-y divide-borde md:hidden">
                {notasCredito.map((nc) => {
                  const comprobante = formatearNumeroFactura(
                    nc.tipo,
                    nc.punto_venta,
                    nc.numero
                  );
                  const corrigeA = nc.factura_asociada
                    ? formatearNumeroFactura(
                        nc.factura_asociada.tipo,
                        nc.factura_asociada.punto_venta,
                        nc.factura_asociada.numero
                      )
                    : "—";

                  return (
                    <div key={nc.id} className="p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-tinta truncate text-sm">
                          {nc.clientes?.nombre || "—"}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-alerta/20 bg-alerta-suave px-2 py-0.5 text-xs font-medium text-alerta">
                          {nc.tipo}
                        </span>
                      </div>
                      <div className="text-[13px] text-tinta-suave truncate">
                        {formatearFecha(nc.fecha)} · {comprobante}
                        {nc.factura_asociada ? ` · Corrige a ${corrigeA}` : ""}
                      </div>
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-xs text-tinta-suave truncate max-w-[200px]">
                          {nc.notas || ""}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-tinta">
                          {formatearPesos(nc.total)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: tabla */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-borde text-xs font-semibold text-tinta-suave bg-fondo/50">
                      <th className="p-3.5">Fecha</th>
                      <th className="p-3.5">Comprobante</th>
                      <th className="p-3.5">Cliente</th>
                      <th className="p-3.5">Corrige a</th>
                      <th className="p-3.5 text-right">Monto</th>
                      <th className="p-3.5">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {notasCredito.map((nc) => {
                      const comprobante = formatearNumeroFactura(
                        nc.tipo,
                        nc.punto_venta,
                        nc.numero
                      );
                      const corrigeA = nc.factura_asociada
                        ? formatearNumeroFactura(
                            nc.factura_asociada.tipo,
                            nc.factura_asociada.punto_venta,
                            nc.factura_asociada.numero
                          )
                        : "—";

                      return (
                        <tr key={nc.id} className="hover:bg-fondo/40 transition-colors">
                          <td className="p-3.5 text-tinta-suave tabular-nums">
                            {formatearFecha(nc.fecha)}
                          </td>
                          <td className="p-3.5 font-medium tabular-nums text-tinta">
                            {comprobante}
                          </td>
                          <td className="p-3.5 font-medium text-tinta">
                            {nc.clientes?.nombre || "—"}
                          </td>
                          <td className="p-3.5 text-tinta-suave tabular-nums">
                            {corrigeA}
                          </td>
                          <td className="p-3.5 text-right font-semibold tabular-nums text-tinta">
                            {formatearPesos(nc.total)}
                          </td>
                          <td className="p-3.5 text-tinta-suave">
                            {nc.notas || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}
        </div>
      )}
    </div>
  );
}
