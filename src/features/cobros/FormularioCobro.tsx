import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { MedioPago, EstadoCobro } from "@/lib/tipos";
import { formatearPesos, formatearFecha } from "@/lib/formato";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada, Etiqueta } from "@/components/ui/Campo";
import { Aviso } from "@/components/ui/Aviso";

export interface ServicioCobroItem {
  id: string;
  numero: number;
  descripcion: string | null;
  fecha_programada: string | null;
  monto: number | null;
  monto_cobrado: number;
}

interface PropsFormularioCobro {
  clienteId: string | null;
  servicios: ServicioCobroItem[];
  onGuardado: () => void;
  onCancelar: () => void;
}

const MEDIOS: { id: MedioPago; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "cheque", label: "Cheque" },
  { id: "echeq", label: "E-cheq" },
  { id: "otro", label: "Otro" },
];

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`h-10 rounded-md border text-sm font-medium transition-colors ${
        activa
          ? "border-marca bg-marca-suave text-marca"
          : "border-borde bg-superficie text-tinta-suave hover:bg-fondo"
      }`}
    >
      {children}
    </button>
  );
}

export function FormularioCobro({
  clienteId,
  servicios,
  onGuardado,
  onCancelar,
}: PropsFormularioCobro) {
  const { session } = useAuth();

  const fechaHoy = new Date().toISOString().slice(0, 10);

  const [medio, setMedio] = useState<MedioPago>("efectivo");
  const [fecha, setFecha] = useState(fechaHoy);

  // Monto inicial: suma de saldos de los servicios
  const sumaSaldosInicial = servicios.reduce(
    (acc, s) => acc + Math.max(0, (s.monto ?? 0) - s.monto_cobrado),
    0
  );
  const [monto, setMonto] = useState<string>(
    sumaSaldosInicial > 0 ? String(sumaSaldosInicial) : ""
  );

  // Transferencia
  const [referencia, setReferencia] = useState("");
  const [fechaAcreditacion, setFechaAcreditacion] = useState("");

  // Cheque / E-cheq
  const [numeroCheque, setNumeroCheque] = useState("");
  const [bancoCheque, setBancoCheque] = useState("");
  const [emisorCheque, setEmisorCheque] = useState("");
  const [fechaPagoCheque, setFechaPagoCheque] = useState("");

  // Aplicación a múltiples servicios: Record<servicio_id, montoAplicado>
  const [aplicaciones, setAplicaciones] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    servicios.forEach((s) => {
      const saldo = Math.max(0, (s.monto ?? 0) - s.monto_cobrado);
      init[s.id] = saldo;
    });
    return init;
  });

  const [guardando, setGuardando] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  // Cargar nombre del cliente como default de emisor si hay clienteId
  useEffect(() => {
    if (clienteId) {
      supabase
        .from("clientes")
        .select("nombre")
        .eq("id", clienteId)
        .single()
        .then(({ data }) => {
          if (data?.nombre) {
            setEmisorCheque((prev) => (prev ? prev : data.nombre));
          }
        });
    }
  }, [clienteId]);

  const montoNum = Number(monto) || 0;
  const esMultiServicio = servicios.length > 1;
  const esUnSoloServicio = servicios.length === 1;

  const saldoUnico = esUnSoloServicio
    ? Math.max(0, (servicios[0].monto ?? 0) - servicios[0].monto_cobrado)
    : 0;
  const superaSaldoUnico = esUnSoloServicio && montoNum > saldoUnico && saldoUnico > 0;

  const totalAplicado = Object.values(aplicaciones).reduce((a, b) => a + (Number(b) || 0), 0);
  const aplicacionesCoinciden = Math.abs(totalAplicado - montoNum) < 0.01;

  const aplicarALosMasAntiguos = () => {
    const ordenados = [...servicios].sort((a, b) => {
      if (!a.fecha_programada) return 1;
      if (!b.fecha_programada) return -1;
      return a.fecha_programada.localeCompare(b.fecha_programada);
    });

    let restante = montoNum;
    const nuevas: Record<string, number> = {};

    for (const s of ordenados) {
      const saldo = Math.max(0, (s.monto ?? 0) - s.monto_cobrado);
      if (restante > 0) {
        const aAplicar = Math.min(saldo, restante);
        nuevas[s.id] = aAplicar;
        restante -= aAplicar;
      } else {
        nuevas[s.id] = 0;
      }
    }

    if (restante > 0 && ordenados.length > 0) {
      const ultimoId = ordenados[ordenados.length - 1].id;
      nuevas[ultimoId] = (nuevas[ultimoId] || 0) + restante;
    }

    setAplicaciones(nuevas);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorValidacion(null);

    if (montoNum <= 0) {
      setErrorValidacion("El monto debe ser mayor a 0.");
      return;
    }

    if (medio === "cheque" || medio === "echeq") {
      if (!numeroCheque.trim()) {
        setErrorValidacion("El número de cheque es obligatorio.");
        return;
      }
      if (!fechaPagoCheque) {
        setErrorValidacion("La fecha de pago del cheque es obligatoria.");
        return;
      }
    }

    if (esMultiServicio && !aplicacionesCoinciden) {
      setErrorValidacion("Lo aplicado tiene que ser igual al monto cobrado.");
      return;
    }

    setGuardando(true);

    try {
      let chequeId: string | null = null;

      // 1. Si es cheque o e-cheq, insertar en cheques
      if (medio === "cheque" || medio === "echeq") {
        const { data: chequeData, error: chequeError } = await supabase
          .from("cheques")
          .insert({
            tipo: "recibido",
            es_echeq: medio === "echeq",
            numero: numeroCheque.trim() || null,
            banco: bancoCheque.trim() || null,
            emisor: emisorCheque.trim() || null,
            fecha_emision: fecha || null,
            fecha_pago: fechaPagoCheque,
            monto: montoNum,
            estado: "en_cartera",
            cliente_id: clienteId,
          })
          .select("id")
          .single();

        if (chequeError || !chequeData) {
          throw new Error(chequeError?.message || "Error al registrar el cheque.");
        }
        chequeId = chequeData.id;
      }

      // 2. Determinar estado y fecha de acreditación para el cobro
      let estadoCobro: EstadoCobro = "pendiente";
      let fechaAcred: string | null = null;

      if (medio === "efectivo" || medio === "otro") {
        estadoCobro = "acreditado";
        fechaAcred = fecha;
      } else if (medio === "cheque" || medio === "echeq") {
        estadoCobro = "pendiente";
        fechaAcred = fechaPagoCheque;
      } else if (medio === "transferencia") {
        if (fechaAcreditacion && fechaAcreditacion > fechaHoy) {
          estadoCobro = "pendiente";
          fechaAcred = fechaAcreditacion;
        } else {
          estadoCobro = "acreditado";
          fechaAcred = fechaAcreditacion || fecha;
        }
      }

      // Insertar cobro
      const { data: cobroData, error: cobroError } = await supabase
        .from("cobros")
        .insert({
          cliente_id: clienteId,
          fecha,
          fecha_acreditacion: fechaAcred,
          monto: montoNum,
          medio,
          estado: estadoCobro,
          referencia: referencia.trim() || null,
          cheque_id: chequeId,
          registrado_por: session?.user?.id ?? null,
        })
        .select("id")
        .single();

      if (cobroError || !cobroData) {
        throw new Error(cobroError?.message || "Error al registrar el cobro.");
      }

      const nuevoCobroId = cobroData.id;

      // 3. Insertar cobro_aplicaciones (solo las > 0)
      if (esUnSoloServicio) {
        const { error: aplError } = await supabase.from("cobro_aplicaciones").insert({
          cobro_id: nuevoCobroId,
          servicio_id: servicios[0].id,
          monto: montoNum,
        });
        if (aplError) throw aplError;
      } else if (esMultiServicio) {
        const filas = Object.entries(aplicaciones)
          .filter(([, montoAp]) => Number(montoAp) > 0)
          .map(([servicio_id, montoAp]) => ({
            cobro_id: nuevoCobroId,
            servicio_id,
            monto: Number(montoAp),
          }));

        if (filas.length > 0) {
          const { error: aplError } = await supabase
            .from("cobro_aplicaciones")
            .insert(filas);
          if (aplError) throw aplError;
        }
      }

      // 4. Éxito: el trigger recalculó monto_cobrado y estado
      onGuardado();
    } catch (err: any) {
      setErrorValidacion(err.message || "Ocurrió un error al guardar el cobro.");
      setGuardando(false);
    }
  };

  return (
    <Tarjeta className="p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-borde">
        <h2 className="text-base font-semibold text-tinta">Registrar cobro</h2>
        <button
          type="button"
          onClick={onCancelar}
          className="text-xs text-tinta-suave hover:text-tinta"
        >
          Cerrar
        </button>
      </div>

      <form onSubmit={handleGuardar} className="space-y-4 pb-4 md:pb-0">
        {/* Medio de pago */}
        <div>
          <Etiqueta>Medio de pago</Etiqueta>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {MEDIOS.map((m) => (
              <Opcion
                key={m.id}
                activa={medio === m.id}
                onClick={() => setMedio(m.id)}
              >
                {m.label}
              </Opcion>
            ))}
          </div>
        </div>

        {/* Monto y Fecha */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo etiqueta="Monto" id="monto_cobro">
            <Entrada
              id="monto_cobro"
              type="number"
              step="any"
              min="0.01"
              required
              placeholder="0.00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Fecha" id="fecha_cobro">
            <Entrada
              id="fecha_cobro"
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Campo>
        </div>

        {/* Campos específicos según medio */}
        {medio === "transferencia" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Referencia (nro. de operación)" id="ref_transf">
              <Entrada
                id="ref_transf"
                placeholder="Ej. OP-982341"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Fecha de acreditación (opcional)" id="fecha_acred_transf">
              <Entrada
                id="fecha_acred_transf"
                type="date"
                value={fechaAcreditacion}
                onChange={(e) => setFechaAcreditacion(e.target.value)}
              />
            </Campo>
          </div>
        )}

        {(medio === "cheque" || medio === "echeq") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Campo etiqueta="Número" id="num_cheque">
              <Entrada
                id="num_cheque"
                required
                placeholder="Nº de cheque"
                value={numeroCheque}
                onChange={(e) => setNumeroCheque(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Banco" id="banco_cheque">
              <Entrada
                id="banco_cheque"
                placeholder="Ej. Galicia, Santander..."
                value={bancoCheque}
                onChange={(e) => setBancoCheque(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Emisor" id="emisor_cheque">
              <Entrada
                id="emisor_cheque"
                placeholder="Nombre de quien emite"
                value={emisorCheque}
                onChange={(e) => setEmisorCheque(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Fecha de pago" id="pago_cheque">
              <Entrada
                id="pago_cheque"
                type="date"
                required
                value={fechaPagoCheque}
                onChange={(e) => setFechaPagoCheque(e.target.value)}
              />
            </Campo>
          </div>
        )}

        {/* Aviso si un solo servicio y monto supera saldo */}
        {superaSaldoUnico && (
          <Aviso variante="alerta">
            El monto supera el saldo del servicio; el excedente queda registrado como cobrado de más.
          </Aviso>
        )}

        {/* Aplicación a múltiples servicios */}
        {esMultiServicio && (
          <div className="space-y-3 pt-3 border-t border-borde">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-tinta">
                Aplicación a servicios
              </span>
              <button
                type="button"
                onClick={aplicarALosMasAntiguos}
                className="text-xs font-medium text-marca hover:underline"
              >
                Aplicar a los más antiguos
              </button>
            </div>

            <div className="divide-y divide-borde border border-borde rounded-md bg-superficie overflow-hidden">
              {servicios.map((s) => {
                const saldo = Math.max(0, (s.monto ?? 0) - s.monto_cobrado);
                const aAplicar = aplicaciones[s.id] ?? 0;
                const marcado = aAplicar > 0;

                return (
                  <div
                    key={s.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-fondo transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAplicaciones((prev) => ({
                            ...prev,
                            [s.id]: checked ? saldo : 0,
                          }));
                        }}
                        className="size-4 rounded border-borde text-marca focus:ring-marca cursor-pointer"
                      />
                      <div className="text-sm text-tinta">
                        <span className="font-semibold">#{s.numero}</span>
                        {s.descripcion ? ` · ${s.descripcion}` : ""}
                        {s.fecha_programada ? ` · ${formatearFecha(s.fecha_programada)}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pl-7 sm:pl-0">
                      <div className="text-right text-xs text-tinta-suave">
                        Saldo:{" "}
                        <span className="font-medium text-tinta tabular-nums">
                          {formatearPesos(saldo)}
                        </span>
                      </div>
                      <div className="w-32">
                        <Entrada
                          type="number"
                          step="any"
                          min="0"
                          value={aAplicar === 0 ? "" : aAplicar}
                          placeholder="0"
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setAplicaciones((prev) => ({
                              ...prev,
                              [s.id]: val,
                            }));
                          }}
                          className="h-8 text-right tabular-nums text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span
                className={
                  aplicacionesCoinciden
                    ? "text-tinta-suave"
                    : "text-peligro font-medium"
                }
              >
                Aplicado {formatearPesos(totalAplicado)} de {formatearPesos(montoNum)}
              </span>
            </div>
          </div>
        )}

        {errorValidacion && (
          <Aviso variante="peligro">
            {errorValidacion}
          </Aviso>
        )}

        {/* Botones de acción */}
        <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-borde bg-superficie p-3 md:static md:mx-0 md:mb-0 md:border-0 md:bg-transparent md:p-0 md:pt-2 flex flex-wrap items-center gap-2 z-10">
          <Boton type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cobro"}
          </Boton>
          <Boton
            type="button"
            variante="secundario"
            onClick={onCancelar}
            disabled={guardando}
          >
            Cancelar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
