import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import {
  AreaTexto,
  Campo,
  Entrada,
  Etiqueta,
  Selector,
} from "@/components/ui/Campo";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRealtime } from "@/hooks/use-realtime";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import type { Cuenta, NovedadEmpleado, Perfil, TipoNovedad } from "@/lib/tipos";
import { ETIQUETA_TIPO_NOVEDAD } from "@/lib/tipos";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Trash2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

export function SeccionEmpleados() {
  const { session } = useAuth();

  const [empleados, setEmpleados] = useState<Perfil[]>([]);
  const [novedades, setNovedades] = useState<NovedadEmpleado[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);

  // Empleado seleccionado para formulario de nueva novedad
  const [empleadoSeleccionado, setEmpleadoSeleccionado] =
    useState<Perfil | null>(null);
  const [empleadoExpandidoId, setEmpleadoExpandidoId] = useState<string | null>(
    null,
  );

  // Campos de nueva novedad
  const [tipo, setTipo] = useState<TipoNovedad>("vacaciones");
  const [fecha, setFecha] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [fechaHasta, setFechaHasta] = useState("");
  const [monto, setMonto] = useState<number | null>(null);
  const [registrarEnCaja, setRegistrarEnCaja] = useState(true);
  const [cuentaId, setCuentaId] = useState<string>("");
  const [notas, setNotas] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    const [resEmp, resNov, resCuentas] = await Promise.all([
      supabase
        .from("perfiles")
        .select("*")
        .in("rol", ["chofer", "oficina"])
        .eq("activo", true)
        .order("nombre"),
      supabase
        .from("novedades_empleado")
        .select("*, perfiles(nombre, rol)")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("cuentas").select("*").eq("activa", true).order("orden"),
    ]);

    if (resEmp.data) setEmpleados(resEmp.data as Perfil[]);
    if (resNov.data) setNovedades(resNov.data as NovedadEmpleado[]);
    if (resCuentas.data) {
      const lista = (resCuentas.data as Cuenta[]) ?? [];
      setCuentas(lista);
      if (lista.length > 0 && !cuentaId) {
        setCuentaId(lista[0].id);
      }
    }
    setCargando(false);
  }, [cuentaId]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useRealtime(
    ["novedades_empleado", "perfiles", "movimientos_caja"],
    cargarDatos,
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!empleadoSeleccionado) return;

    setGuardando(true);
    setError(null);

    try {
      let movimientoId: string | null = null;

      // 1. Si es adelanto y se registra en caja
      if (tipo === "adelanto" && monto && monto > 0 && registrarEnCaja) {
        const { data: catData } = await supabase
          .from("categorias_movimiento")
          .select("id")
          .eq("ambito", "empresa")
          .eq("tipo", "egreso")
          .ilike("nombre", "%Sueldos%")
          .limit(1)
          .maybeSingle();

        const catId = catData?.id ?? null;

        const { data: movCreado, error: movErr } = await supabase
          .from("movimientos_caja")
          .insert({
            fecha: fecha,
            tipo: "egreso",
            ambito: "empresa",
            categoria_id: catId,
            proveedor: empleadoSeleccionado.nombre,
            descripcion: `Adelanto de sueldo - ${empleadoSeleccionado.nombre}`,
            cuenta_id: cuentaId || null,
            monto: monto,
            estado: "pagado",
            fecha_acreditacion: fecha,
            registrado_por: session?.user?.id ?? null,
          })
          .select("id")
          .single();

        if (movErr) throw movErr;
        movimientoId = movCreado?.id ?? null;
      }

      // 2. Insertar novedad
      const { error: novErr } = await supabase
        .from("novedades_empleado")
        .insert({
          empleado_id: empleadoSeleccionado.id,
          empleado_nombre: empleadoSeleccionado.nombre,
          tipo,
          fecha,
          fecha_hasta: fechaHasta || null,
          monto: tipo === "adelanto" ? monto : null,
          movimiento_id: movimientoId,
          notas: notas.trim() || null,
          creado_por: session?.user?.id ?? null,
        });

      if (novErr) throw novErr;

      setMensajeExito(`Novedad registrada para ${empleadoSeleccionado.nombre}`);
      setTimeout(() => setMensajeExito(null), 3000);

      // Limpiar formulario
      setEmpleadoSeleccionado(null);
      setNotas("");
      setFechaHasta("");
      setMonto(null);
      cargarDatos();
    } catch (err: any) {
      setError(err.message || "Error al registrar la novedad");
    } finally {
      setGuardando(false);
    }
  };

  const eliminarNovedad = async (id: string) => {
    if (!confirm("¿Confirmás que querés eliminar esta novedad?")) return;
    const { error: err } = await supabase
      .from("novedades_empleado")
      .delete()
      .eq("id", id);
    if (err) {
      alert("Error al eliminar: " + err.message);
    } else {
      cargarDatos();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-tinta">
          Personal y Novedades
        </h2>
        <p className="text-xs text-tinta-suave mt-0.5">
          Gestión de choferes y personal de oficina, registro de ausencias,
          licencias y adelantos con reflejo en Caja y Agenda.
        </p>
      </div>

      {mensajeExito && (
        <Aviso variante="exito" className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
          <span>{mensajeExito}</span>
        </Aviso>
      )}

      {error && <Aviso variante="peligro">{error}</Aviso>}

      {/* Formulario modal o inline si hay un empleado seleccionado */}
      {empleadoSeleccionado && (
        <Tarjeta className="p-5 space-y-4 border-marca/40 bg-marca-suave/20">
          <div className="flex items-center justify-between pb-3 border-b border-borde">
            <h3 className="text-sm font-semibold text-tinta">
              Registrar novedad para{" "}
              <strong>{empleadoSeleccionado.nombre}</strong>
            </h3>
            <button
              type="button"
              onClick={() => setEmpleadoSeleccionado(null)}
              className="text-xs text-tinta-suave hover:text-tinta font-medium"
            >
              Cancelar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Campo etiqueta="Tipo de novedad *" id="nov-tipo">
                <Selector
                  id="nov-tipo"
                  value={tipo}
                  onChange={(e) => {
                    const nuevoTipo = e.target.value as TipoNovedad;
                    setTipo(nuevoTipo);
                    if (nuevoTipo !== "adelanto") {
                      setMonto(null);
                    }
                  }}
                >
                  {(Object.keys(ETIQUETA_TIPO_NOVEDAD) as TipoNovedad[]).map(
                    (t) => (
                      <option key={t} value={t}>
                        {ETIQUETA_TIPO_NOVEDAD[t]}
                      </option>
                    ),
                  )}
                </Selector>
              </Campo>

              <Campo etiqueta="Fecha desde *" id="nov-fecha">
                <Entrada
                  id="nov-fecha"
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Campo>

              {(tipo === "vacaciones" ||
                tipo === "licencia" ||
                tipo === "medico") && (
                <Campo etiqueta="Fecha hasta (inclusive)" id="nov-fecha-hasta">
                  <Entrada
                    id="nov-fecha-hasta"
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                  />
                </Campo>
              )}

              {tipo === "adelanto" && (
                <div>
                  <Etiqueta htmlFor="nov-monto">Monto del adelanto *</Etiqueta>
                  <EntradaMonto
                    id="nov-monto"
                    placeholder="Monto"
                    valor={monto}
                    onChange={setMonto}
                  />
                </div>
              )}
            </div>

            {tipo === "adelanto" && monto != null && monto > 0 && (
              <div className="p-3 bg-superficie rounded border border-borde space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-tinta select-none">
                  <input
                    type="checkbox"
                    checked={registrarEnCaja}
                    onChange={(e) => setRegistrarEnCaja(e.target.checked)}
                    className="rounded border-borde text-marca focus:ring-marca"
                  />
                  Registrar como egreso en Caja ("Sueldos y cargas sociales")
                </label>

                {registrarEnCaja && (
                  <div className="pt-2">
                    <Campo etiqueta="Cuenta de pago" id="nov-cuenta">
                      <Selector
                        id="nov-cuenta"
                        value={cuentaId}
                        onChange={(e) => setCuentaId(e.target.value)}
                      >
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </Selector>
                    </Campo>
                  </div>
                )}
              </div>
            )}

            <Campo etiqueta="Notas / Justificación" id="nov-notas">
              <AreaTexto
                id="nov-notas"
                rows={2}
                placeholder="Observaciones, certificado médico, acuerdo de devolución..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </Campo>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-borde">
              <Boton
                type="button"
                variante="secundario"
                className="h-8 px-3 text-xs"
                onClick={() => setEmpleadoSeleccionado(null)}
                disabled={guardando}
              >
                Cancelar
              </Boton>
              <Boton
                type="submit"
                className="h-8 px-3 text-xs"
                disabled={guardando}
              >
                {guardando ? "Guardando..." : "Guardar novedad"}
              </Boton>
            </div>
          </form>
        </Tarjeta>
      )}

      {/* Lista de empleados */}
      <Tarjeta className="overflow-hidden">
        <div className="p-4 border-b border-borde flex items-center justify-between">
          <span className="text-xs font-semibold text-tinta-suave uppercase tracking-wider">
            Equipo de trabajo ({empleados.length})
          </span>
        </div>

        <div className="divide-y divide-borde">
          {empleados.map((emp) => {
            const novedadesEmp = novedades.filter(
              (n) => n.empleado_id === emp.id,
            );
            const estaExpandido = empleadoExpandidoId === emp.id;

            // Verificar si hoy tiene novedad activa
            const hoyStr = new Date().toISOString().slice(0, 10);
            const novedadHoy = novedadesEmp.find((n) => {
              if (n.fecha === hoyStr) return true;
              if (n.fecha_hasta && n.fecha <= hoyStr && n.fecha_hasta >= hoyStr)
                return true;
              return false;
            });

            return (
              <div
                key={emp.id}
                className="p-4 hover:bg-fondo/60 transition-colors space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-marca-suave text-marca flex items-center justify-center font-semibold text-sm">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-tinta text-sm">
                          {emp.nombre}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            emp.rol === "chofer"
                              ? "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                              : "bg-marca-suave text-marca border border-marca/20"
                          }`}
                        >
                          {emp.rol === "chofer" ? "Chofer" : "Oficina"}
                        </span>
                      </div>
                      <div className="text-xs text-tinta-suave mt-0.5 flex items-center gap-2">
                        {emp.telefono ? (
                          <span>Tel: {emp.telefono}</span>
                        ) : (
                          <span>Sin teléfono</span>
                        )}
                        {novedadHoy && (
                          <span className="text-alerta font-medium">
                            · Hoy: {ETIQUETA_TIPO_NOVEDAD[novedadHoy.tipo]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Boton
                      type="button"
                      variante="secundario"
                      className="h-8 px-3 text-xs"
                      onClick={() => {
                        setEmpleadoSeleccionado(emp);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Registrar novedad
                    </Boton>

                    <button
                      type="button"
                      onClick={() =>
                        setEmpleadoExpandidoId(estaExpandido ? null : emp.id)
                      }
                      className="h-8 px-2 rounded-md border border-borde text-xs font-medium text-tinta-suave hover:text-tinta hover:bg-fondo flex items-center gap-1 transition-colors"
                      title={
                        estaExpandido ? "Ocultar historial" : "Ver historial"
                      }
                    >
                      <span>Historial ({novedadesEmp.length})</span>
                      {estaExpandido ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Historial expandido del empleado */}
                {estaExpandido && (
                  <div className="mt-3 pt-3 border-t border-borde space-y-2">
                    <h4 className="text-xs font-semibold text-tinta-suave uppercase tracking-wider">
                      Historial de novedades
                    </h4>

                    {novedadesEmp.length === 0 ? (
                      <p className="text-xs text-tinta-suave py-2 italic">
                        No hay novedades registradas para este empleado.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {novedadesEmp.map((nov) => {
                          const chipClases =
                            nov.tipo === "vacaciones"
                              ? "bg-marca-suave text-marca border-marca/20"
                              : nov.tipo === "medico"
                                ? "bg-alerta-suave text-alerta border-alerta/20"
                                : nov.tipo === "ausente"
                                  ? "bg-peligro-suave text-peligro border-peligro/20"
                                  : nov.tipo === "adelanto"
                                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                                    : "bg-fondo text-tinta border-borde";

                          return (
                            <div
                              key={nov.id}
                              className="p-2.5 rounded bg-fondo border border-borde/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${chipClases}`}
                                  >
                                    {ETIQUETA_TIPO_NOVEDAD[nov.tipo]}
                                  </span>
                                  <span className="font-medium text-tinta">
                                    {formatearFecha(nov.fecha)}
                                    {nov.fecha_hasta
                                      ? ` al ${formatearFecha(nov.fecha_hasta)}`
                                      : ""}
                                  </span>
                                  {nov.monto != null && (
                                    <span className="font-semibold text-ok">
                                      {formatearPesos(nov.monto)}
                                    </span>
                                  )}
                                </div>
                                {nov.notas && (
                                  <p className="text-tinta-suave italic">
                                    {nov.notas}
                                  </p>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => eliminarNovedad(nov.id)}
                                className="text-tinta-tenue hover:text-peligro self-end sm:self-auto p-1 transition-colors"
                                title="Eliminar novedad"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {empleados.length === 0 && !cargando && (
            <div className="p-8 text-center text-xs text-tinta-suave">
              No hay choferes ni administrativos registrados en el sistema.
            </div>
          )}
        </div>
      </Tarjeta>
    </div>
  );
}
