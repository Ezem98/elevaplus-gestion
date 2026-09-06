import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { CondicionPago } from "@/lib/tipos";
import { ETIQUETA_CONDICION_PAGO } from "@/lib/tipos";
import { formatearPesos } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Entrada } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";
import { MenuAcciones } from "@/components/ui/MenuAcciones";

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
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);

  const cargarClientes = useCallback(async () => {
    setCargando(true);
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

  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Clientes</h1>
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
      </header>

      <Tarjeta className="overflow-x-auto">
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
            {clientesFiltrados.map((c) => (
              <tr
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuAbiertoId(c.id);
                }}
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
                  <MenuAcciones
                    abierto={menuAbiertoId === c.id}
                    onAbiertoChange={(abierto) => {
                      setMenuAbiertoId(abierto ? c.id : null);
                    }}
                    acciones={[
                      { texto: "Ver ficha", onClick: () => navigate(`/clientes/${c.id}`) },
                      { texto: "Nuevo presupuesto", onClick: () => navigate(`/cotizador?cliente=${c.id}`) },
                      { texto: "Editar", onClick: () => navigate(`/clientes/${c.id}/editar`) },
                      { separador: true },
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
                    ]}
                  />
                </td>
              </tr>
            ))}
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
                    "No se encontraron clientes con ese criterio."
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
      </Tarjeta>
    </div>
  );
}
