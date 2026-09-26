import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/hooks/use-realtime";
import type { Cliente, CuentaCorrienteCliente, Servicio } from "@/lib/tipos";
import {
  ETIQUETA_TIPO,
  ETIQUETA_TIPO_CLIENTE,
  ETIQUETA_CONDICION_IVA,
  ETIQUETA_CONDICION_PAGO,
  ETIQUETA_MODO_FACTURACION,
} from "@/lib/tipos";
import { formatearPesos, formatearFecha, formatearNumeroFactura } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipEstado, ChipNocturno } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/Boton";
import { Aviso } from "@/components/ui/Aviso";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { FormularioCobro, type ServicioCobroItem } from "@/features/cobros/FormularioCobro";

export function PaginaCliente() {
  const { id } = useParams<{ id: string }>();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cc, setCc] = useState<CuentaCorrienteCliente | null>(null);
  const [movimientos, setMovimientos] = useState<Servicio[]>([]);
  const [serviciosPendientes, setServiciosPendientes] = useState<ServicioCobroItem[]>([]);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargarDatos = useCallback(async (mostrarSpinner = false) => {
    if (!id) return;
    if (mostrarSpinner) setCargando(true);

    const [clienteRes, ccRes, serviciosRes, pendientesRes] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).single(),
      supabase
        .from("cuenta_corriente")
        .select("total_servicios, total_cobrado, saldo")
        .eq("cliente_id", id)
        .maybeSingle(),
      supabase
        .from("servicios")
        .select("*, facturas(tipo, punto_venta, numero)")
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

  const cargar = useCallback(() => {
    return cargarDatos(false);
  }, [cargarDatos]);

  useEffect(() => {
    cargarDatos(true);
  }, [cargarDatos]);

  useRealtime(["servicios", "cobros"], cargar);

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
      <EncabezadoPagina
        volverA="/clientes"
        titulo={cliente.nombre}
        subtitulo={`${ETIQUETA_TIPO_CLIENTE[cliente.tipo]} · ${cliente.localidad ?? "Sin localidad"} · ${ETIQUETA_CONDICION_PAGO[cliente.condicion_pago]}${cliente.condicion_pago !== "contado" && cliente.dias_pago > 0 ? ` (${cliente.dias_pago} días)` : ""}`}
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Boton onClick={() => setMostrarCobro((prev) => !prev)}>Registrar cobro</Boton>
            <Link to={`/cotizador?cliente=${id}`}>
              <Boton variante="secundario">Nuevo presupuesto</Boton>
            </Link>
            <Link to={`/servicios/nuevo?cliente=${id}`}>
              <Boton variante="secundario">Nuevo servicio</Boton>
            </Link>
            <Link to={`/clientes/${id}/editar`}>
              <Boton variante="secundario">Editar</Boton>
            </Link>
          </div>
        }
      />

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
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      {s.nocturno && <ChipNocturno />}
                      <ChipEstado estado={s.estado} />
                    </div>
                    {(() => {
                      const fac = Array.isArray(s.facturas) ? s.facturas[0] : s.facturas;
                      if (!fac) return null;
                      return (
                        <span className="text-xs text-tinta-suave tabular-nums">
                          {formatearNumeroFactura(fac.tipo, fac.punto_venta, fac.numero)}
                        </span>
                      );
                    })()}
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
            <div className="pt-2 border-t border-borde">
              <dt className="text-tinta-suave">Facturación</dt>
              <dd className="mt-0.5 text-tinta font-medium">
                {cliente.facturacion_modo
                  ? ETIQUETA_MODO_FACTURACION[cliente.facturacion_modo]
                  : "Manual"}
                {cliente.facturacion_automatica ? " · Automática (21:30)" : " · Manual"}
              </dd>
              <p className="mt-1 text-xs text-tinta-suave">
                {cliente.enviar_factura_email
                  ? `Envía por email${cliente.email_facturacion ? ` a ${cliente.email_facturacion}` : ""}`
                  : "Sin envío automático de email"}
              </p>
            </div>
            {cliente.facturacion_automatica &&
              cliente.condicion_iva === "responsable_inscripto" &&
              !cliente.cuit && (
                <div className="pt-1">
                  <Aviso variante="peligro" className="text-xs py-2">
                    Responsable inscripto sin CUIT: no podrá emitir automáticamente.
                  </Aviso>
                </div>
              )}
          </dl>
        </Tarjeta>
      </div>
    </div>
  );
}
