import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/hooks/use-realtime";
import type { CondicionPago } from "@/lib/tipos";
import { ETIQUETA_CONDICION_PAGO } from "@/lib/tipos";
import { formatearPesos } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Entrada } from "@/components/ui/Campo";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { MenuAcciones, ConMenuContextual } from "@/components/ui/MenuAcciones";

interface ClienteFila {
  id: string;
  nombre: string;
  localidad: string | null;
  condicion_pago: CondicionPago;
  activo: boolean;
  total_servicios: number;
  total_cobrado: number;
  saldo: number;
}

export function PaginaClientes() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<ClienteFila[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargarClientes = useCallback(async (mostrarSpinner = false) => {
    if (mostrarSpinner) setCargando(true);
    const [{ data: ccData }, { data: clientesData }] = await Promise.all([
      supabase
        .from("cuenta_corriente")
        .select("cliente_id, nombre, total_servicios, total_cobrado, saldo")
        .order("saldo", { ascending: false }),
      supabase
        .from("clientes")
        .select("id, tipo, localidad, condicion_pago, activo"),
    ]);

    const mapaClientes = new Map<string, { localidad: string | null; condicion_pago: CondicionPago; activo: boolean }>();
    (clientesData ?? []).forEach((c) => {
      mapaClientes.set(c.id, {
        localidad: c.localidad,
        condicion_pago: c.condicion_pago,
        activo: c.activo,
      });
    });

    const filas: ClienteFila[] = [];
    const procesados = new Set<string>();

    (ccData ?? []).forEach((cc) => {
      const extra = mapaClientes.get(cc.cliente_id);
      procesados.add(cc.cliente_id);
      filas.push({
        id: cc.cliente_id,
        nombre: cc.nombre,
        localidad: extra?.localidad ?? null,
        condicion_pago: extra?.condicion_pago ?? "contado",
        activo: extra?.activo ?? true,
        total_servicios: Number(cc.total_servicios) || 0,
        total_cobrado: Number(cc.total_cobrado) || 0,
        saldo: Number(cc.saldo) || 0,
      });
    });

    (clientesData ?? []).forEach((c: any) => {
      if (!procesados.has(c.id)) {
        filas.push({
          id: c.id,
          nombre: c.nombre,
          localidad: c.localidad,
          condicion_pago: c.condicion_pago,
          activo: c.activo,
          total_servicios: 0,
          total_cobrado: 0,
          saldo: 0,
        });
      }
    });

    setClientes(filas);
    setCargando(false);
  }, []);

  const cargar = useCallback(() => {
    return cargarClientes(false);
  }, [cargarClientes]);

  useEffect(() => {
    cargarClientes(true);
  }, [cargarClientes]);

  useRealtime(["servicios", "cobros"], cargar);

  const handleToggleActivo = async (c: ClienteFila) => {
    if (c.activo) {
      const confirmado = window.confirm(
        `¿Desactivar a ${c.nombre}? No se borra nada, solo deja de aparecer en las listas.`
      );
      if (!confirmado) return;
    }
    await supabase
      .from("clientes")
      .update({ activo: !c.activo })
      .eq("id", c.id);
    await cargarClientes();
  };

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      if (!mostrarInactivos && !c.activo) return false;
      if (busqueda.trim() && !c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [clientes, mostrarInactivos, busqueda]);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Clientes"
        acciones={
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-64">
              <Entrada
                type="search"
                placeholder="Buscar por nombre"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-tinta-suave cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mostrarInactivos}
                onChange={(e) => setMostrarInactivos(e.target.checked)}
                className="rounded border-borde text-marca focus:ring-marca"
              />
              Mostrar inactivos
            </label>
            <Link to="/clientes/nuevo">
              <Boton>Nuevo cliente</Boton>
            </Link>
          </div>
        }
      />

      <Tarjeta className="overflow-hidden">
        {/* Vista móvil (< md): lista dividida */}
        <div className="divide-y divide-borde md:hidden">
          {clientesFiltrados.map((c) => {
            const acciones = [
              { texto: "Ver ficha", onClick: () => navigate(`/clientes/${c.id}`) },
              { texto: "Nuevo presupuesto", onClick: () => navigate(`/cotizador?cliente=${c.id}`) },
              { texto: "Nuevo servicio", onClick: () => navigate(`/servicios/nuevo?cliente=${c.id}`) },
              { texto: "Editar", onClick: () => navigate(`/clientes/${c.id}/editar`) },
              { separador: true as const },
              c.activo
                ? {
                    texto: "Desactivar",
                    onClick: () => handleToggleActivo(c),
                    peligro: true,
                  }
                : {
                    texto: "Reactivar",
                    onClick: () => handleToggleActivo(c),
                  },
            ];

            return (
              <div
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                className="flex items-start justify-between gap-3 p-4 hover:bg-fondo active:bg-fondo/80 cursor-pointer"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-tinta truncate">{c.nombre}</span>
                    {!c.activo ? (
                      <span className="rounded-full bg-fondo px-2.5 py-0.5 text-xs font-medium text-tinta-suave border border-borde">
                        Inactivo
                      </span>
                    ) : c.saldo > 0 ? (
                      <span className="rounded-full bg-alerta-suave px-2.5 py-0.5 text-xs font-medium text-alerta border border-alerta/20">
                        Debe
                      </span>
                    ) : (
                      <span className="rounded-full bg-ok-suave px-2.5 py-0.5 text-xs font-medium text-ok border border-ok/20">
                        Al día
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-tinta-suave truncate">
                    {c.localidad ?? "Sin localidad"} · {ETIQUETA_CONDICION_PAGO[c.condicion_pago] ?? c.condicion_pago}
                  </div>
                  <div
                    className={`text-right text-sm font-medium tabular-nums ${
                      c.saldo > 0 ? "text-alerta font-semibold" : "text-tinta-suave"
                    }`}
                  >
                    {formatearPesos(c.saldo)}
                  </div>
                </div>
                <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <MenuAcciones acciones={acciones} />
                </div>
              </div>
            );
          })}
          {!cargando && clientesFiltrados.length === 0 && (
            <div className="p-8 text-center text-sm text-tinta-suave">
              {clientes.length === 0 ? (
                <>
                  Todavía no hay clientes.{" "}
                  <Link to="/clientes/nuevo" className="text-marca hover:underline">
                    Cargar el primero
                  </Link>
                </>
              ) : (
                "No hay clientes que coincidan con la búsqueda."
              )}
            </div>
          )}
        </div>

        {/* Vista escritorio (>= md): tabla */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-tinta-suave">
              <tr className="border-b border-borde">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Localidad</th>
                <th className="px-4 py-3 font-medium">Condición de pago</th>
                <th className="px-4 py-3 text-right font-medium">Facturado</th>
                <th className="px-4 py-3 text-right font-medium">Cobrado</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th className="w-12 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c) => {
                const acciones = [
                  { texto: "Ver ficha", onClick: () => navigate(`/clientes/${c.id}`) },
                  { texto: "Nuevo presupuesto", onClick: () => navigate(`/cotizador?cliente=${c.id}`) },
                  { texto: "Nuevo servicio", onClick: () => navigate(`/servicios/nuevo?cliente=${c.id}`) },
                  { texto: "Editar", onClick: () => navigate(`/clientes/${c.id}/editar`) },
                  { separador: true as const },
                  c.activo
                    ? {
                        texto: "Desactivar",
                        onClick: () => handleToggleActivo(c),
                        peligro: true,
                      }
                    : {
                        texto: "Reactivar",
                        onClick: () => handleToggleActivo(c),
                      },
                ];

                return (
                  <ConMenuContextual key={c.id} acciones={acciones}>
                    <tr
                      onClick={() => navigate(`/clientes/${c.id}`)}
                      className="border-b border-borde last:border-0 hover:bg-fondo cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-tinta">
                        <Link
                          to={`/clientes/${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
                          {c.nombre}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-tinta-suave">{c.localidad ?? "—"}</td>
                      <td className="px-4 py-3 text-tinta-suave">
                        {ETIQUETA_CONDICION_PAGO[c.condicion_pago] ?? c.condicion_pago}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatearPesos(c.total_servicios)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatearPesos(c.total_cobrado)}</td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${
                          c.saldo > 0 ? "text-alerta" : "text-tinta-suave"
                        }`}
                      >
                        {formatearPesos(c.saldo)}
                      </td>
                      <td className="w-12 px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <MenuAcciones acciones={acciones} />
                      </td>
                    </tr>
                  </ConMenuContextual>
                );
              })}
              {!cargando && clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-tinta-suave">
                    {clientes.length === 0 ? (
                      <>
                        Todavía no hay clientes.{" "}
                        <Link to="/clientes/nuevo" className="text-marca hover:underline">
                          Cargar el primero
                        </Link>
                      </>
                    ) : (
                      "No hay clientes que coincidan con la búsqueda."
                    )}
                  </td>
                </tr>
              )}
              {cargando && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-tinta-suave">
                    Cargando clientes...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
