import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Servicio, EstadoServicio } from "@/lib/tipos";
import { ETIQUETA_TIPO, ETIQUETA_ESTADO } from "@/lib/tipos";
import { formatearPesos, formatearFecha } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipEstado } from "@/components/ui/Chip";
import { Selector } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";

const ESTADOS = Object.keys(ETIQUETA_ESTADO) as EstadoServicio[];

export function PaginaServicios() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [estado, setEstado] = useState<EstadoServicio | "">("");

  useEffect(() => {
    let q = supabase.from("servicios").select("*, clientes(nombre)").order("fecha_programada", { ascending: false }).limit(100);
    if (estado) q = q.eq("estado", estado);
    q.then(({ data }) => setServicios((data as Servicio[]) ?? []));
  }, [estado]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Servicios</h1>
        <div className="flex gap-2">
          <Selector value={estado} onChange={(e) => setEstado(e.target.value as EstadoServicio | "")} className="w-44">
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>
            ))}
          </Selector>
          <Link to="/servicios/nuevo"><Boton>Nuevo servicio</Boton></Link>
        </div>
      </header>

      <Tarjeta className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-tinta-suave">
            <tr className="border-b border-borde">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3 text-right font-medium">Cobrado</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {servicios.map((s) => (
              <tr key={s.id} className="border-b border-borde last:border-0 hover:bg-fondo">
                <td className="px-4 py-3 text-tinta-suave">{s.numero}</td>
                <td className="px-4 py-3">{formatearFecha(s.fecha_programada)}</td>
                <td className="px-4 py-3 font-medium"><Link to={`/servicios/${s.id}`}>{s.clientes?.nombre ?? "—"}</Link></td>
                <td className="px-4 py-3 text-tinta-suave">{ETIQUETA_TIPO[s.tipo]}</td>
                <td className="px-4 py-3 text-right">{formatearPesos(s.monto)}</td>
                <td className="px-4 py-3 text-right">{formatearPesos(s.monto_cobrado)}</td>
                <td className="px-4 py-3"><ChipEstado estado={s.estado} /></td>
              </tr>
            ))}
            {servicios.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-tinta-suave">No hay servicios con ese filtro.</td></tr>
            )}
          </tbody>
        </table>
      </Tarjeta>
    </div>
  );
}
