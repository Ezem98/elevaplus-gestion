import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Cliente, CuentaCorrienteCliente, Servicio } from "@/lib/tipos";
import { ETIQUETA_TIPO, ETIQUETA_TIPO_CLIENTE, ETIQUETA_CONDICION_IVA, ETIQUETA_CONDICION_PAGO } from "@/lib/tipos";
import { formatearPesos, formatearFecha } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipEstado } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/Boton";
import { Aviso } from "@/components/ui/Aviso";
import { FormularioCobro, type ServicioCobroItem } from "@/features/cobros/FormularioCobro";

export function PaginaCliente() {
  const { id } = useParams<{ id: string }>();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cc, setCc] = useState<CuentaCorrienteCliente | null>(null);
  const [movimientos, setMovimientos] = useState<Servicio[]>([]);
  const [serviciosPendientes, setServiciosPendientes] = useState<ServicioCobroItem[]>([]);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargarDatos = useCallback(async () => {
    if (!id) return;
    setCargando(true);

    const [clienteRes, ccRes, serviciosRes, pendientesRes] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).single(),
      supabase
        .from("cuenta_corriente")
        .select("total_servicios, total_cobrado, saldo")
        .eq("cliente_id", id)
        .maybeSingle(),
      supabase
        .from("servicios")
        .select("*")
        .eq("cliente_id", id)
        .not("estado", "in", '("consulta","presupuestado","cancelado")')
        .order("fecha_programada", { ascending: false }),
      supabase
        .from("servicios")
        .select("id, numero, descripcion, fecha_programada, monto, monto_cobrado")
        .eq("cliente_id", id)
        .in("estado", ["terminado", "cobrado", "programado", "en_curso"])
        .order("fecha_programada", { ascending: true }),
    ]);

    setCliente((clienteRes.data as Cliente) ?? null);
    setCc((ccRes.data as CuentaCorrienteCliente) ?? null);
    setMovimientos((serviciosRes.data as Servicio[]) ?? []);

    const pendientes = ((pendientesRes.data as ServicioCobroItem[]) ?? []).filter(
      (s) => s.monto != null && Number(s.monto_cobrado) < Number(s.monto)
    );
    setServiciosPendientes(pendientes);
    setCargando(false);
  }, [id]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  if (cargando) {
    return (
      <div className="py-12 text-center text-tinta-suave">
        Cargando cliente...
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-tinta-suave">Cliente no encontrado</p>
        <Link to="/clientes">
          <Boton variante="secundario">Volver a clientes</Boton>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-tinta">{cliente.nombre}</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            {ETIQUETA_TIPO_CLIENTE[cliente.tipo]} · {cliente.localidad ?? "Sin localidad"} · {ETIQUETA_CONDICION_PAGO[cliente.condicion_pago]}
            {cliente.condicion_pago !== "contado" && cliente.dias_pago > 0 ? ` (${cliente.dias_pago} días)` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Boton onClick={() => setMostrarCobro((prev) => !prev)}>Registrar cobro</Boton>
          <Link to={`/cotizador?cliente=${id}`}>
            <Boton variante="secundario">Nuevo presupuesto</Boton>
          </Link>
          <Link to={`/clientes/${id}/editar`}>
            <Boton variante="secundario">Editar</Boton>
          </Link>
        </div>
      </header>

      {/* Formulario Registrar cobro o aviso de sin pendientes */}
      {mostrarCobro && (
        serviciosPendientes.length === 0 ? (
          <Aviso variante="alerta">
            Este cliente no tiene servicios con saldo pendiente.
          </Aviso>
        ) : (
          <FormularioCobro
            clienteId={id!}
            servicios={serviciosPendientes}
            onGuardado={() => {
              setMostrarCobro(false);
              cargarDatos();
            }}
            onCancelar={() => setMostrarCobro(false)}
          />
        )
      )}


      <Tarjeta className="grid grid-cols-1 divide-y divide-borde sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        <div className="p-5">
          <div className="text-sm text-tinta-suave">Facturado</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-tinta">
            {formatearPesos(cc?.total_servicios ?? 0)}
          </div>
        </div>
        <div className="p-5">
          <div className="text-sm text-tinta-suave">Cobrado</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-tinta">
            {formatearPesos(cc?.total_cobrado ?? 0)}
          </div>
        </div>
        <div className="p-5">
          <div className="text-sm text-tinta-suave">Saldo</div>
          <div
            className={`mt-1 text-3xl font-semibold tabular-nums ${
              (cc?.saldo ?? 0) > 0 ? "text-alerta" : "text-tinta"
            }`}
          >
            {formatearPesos(cc?.saldo ?? 0)}
          </div>
        </div>
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-tinta">Movimientos</h2>
          {movimientos.length === 0 ? (
            <Tarjeta className="p-8 text-center text-tinta-suave">
              Sin movimientos todavía.
            </Tarjeta>
          ) : (
            <Tarjeta className="divide-y divide-borde">
              {movimientos.map((s) => (
                <Link
                  key={s.id}
                  to={`/servicios/${s.id}`}
                  className="flex items-center gap-4 px-4 py-4 hover:bg-fondo transition-colors"
                >
                  <div className="w-[90px] shrink-0 text-sm text-tinta-suave tabular-nums">
                    {formatearFecha(s.fecha_programada)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-tinta">
                      {s.descripcion || ETIQUETA_TIPO[s.tipo]}
                    </div>
                    {s.origen && s.destino && (
                      <div className="truncate text-xs text-tinta-suave">
                        {s.origen} → {s.destino}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-tinta">
                      {formatearPesos(s.monto)}
                    </div>
                    {Number(s.monto_cobrado) > 0 && (
                      <div className="text-xs text-tinta-suave tabular-nums">
                        Cobrado {formatearPesos(s.monto_cobrado)}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex justify-end">
                    <ChipEstado estado={s.estado} />
                  </div>
                </Link>
              ))}
            </Tarjeta>
          )}
        </section>

        <Tarjeta className="p-5 space-y-4">
          <h2 className="font-semibold text-tinta">Datos</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-tinta-suave">CUIT</dt>
              <dd className="mt-0.5 text-tinta font-medium">{cliente.cuit || "—"}</dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Condición IVA</dt>
              <dd className="mt-0.5 text-tinta font-medium">
                {cliente.condicion_iva ? ETIQUETA_CONDICION_IVA[cliente.condicion_iva] : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Teléfono</dt>
              <dd className="mt-0.5 text-tinta font-medium">
                {cliente.telefono ? (
                  <a href={`tel:${cliente.telefono}`} className="text-marca hover:underline">
                    {cliente.telefono}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Email</dt>
              <dd className="mt-0.5 text-tinta font-medium">
                {cliente.email ? (
                  <a href={`mailto:${cliente.email}`} className="text-marca hover:underline break-all">
                    {cliente.email}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Dirección</dt>
              <dd className="mt-0.5 text-tinta font-medium">{cliente.direccion || "—"}</dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Notas</dt>
              <dd className="mt-0.5 text-tinta font-medium whitespace-pre-wrap">{cliente.notas || "—"}</dd>
            </div>
          </dl>
        </Tarjeta>
      </div>
    </div>
  );
}
