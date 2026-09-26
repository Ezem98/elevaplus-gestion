import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada, Etiqueta, Selector } from "@/components/ui/Campo";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { formatearFecha } from "@/lib/formato";
import { supabase } from "@/lib/supabase";
import { dispararSyncGcalDebounced } from "@/lib/worker";
import type {
  AmbitoMovimiento,
  CategoriaMovimiento,
  Cuenta,
  FrecuenciaVencimiento,
  MedioPago,
  Vencimiento,
} from "@/lib/tipos";
import { generarFechas } from "@/lib/vencimientos";
import { useEffect, useMemo, useState } from "react";

interface PropsFormularioVencimiento {
  vencimientoAEditar?: Vencimiento | null;
  onGuardado: () => void;
  onCancelar: () => void;
}

const MEDIOS_EGRESO: { id: MedioPago; label: string }[] = [
  { id: "transferencia", label: "Transferencia" },
  { id: "debito_automatico", label: "Débito automático" },
  { id: "cheque_propio", label: "Cheque propio" },
  { id: "efectivo", label: "Efectivo" },
  { id: "cheque_terceros", label: "Cheque de terceros" },
  { id: "otro", label: "Otro" },
];

const FRECUENCIAS: { id: FrecuenciaVencimiento; label: string }[] = [
  { id: "mensual", label: "Mensual" },
  { id: "quincenal", label: "Quincenal" },
  { id: "semanal", label: "Semanal" },
  { id: "bimestral", label: "Bimestral" },
  { id: "anual", label: "Anual" },
  { id: "unica", label: "Única vez" },
];

const DIAS_SEMANA = [
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
  { id: 0, label: "Domingo" },
];

export function FormularioVencimiento({
  vencimientoAEditar,
  onGuardado,
  onCancelar,
}: PropsFormularioVencimiento) {
  const esEdicion = !!vencimientoAEditar;
  const hoyStr = new Date().toISOString().slice(0, 10);

  const [titulo, setTitulo] = useState(vencimientoAEditar?.titulo ?? "");
  const [ambito, setAmbito] = useState<AmbitoMovimiento>(
    vencimientoAEditar?.ambito ?? "empresa",
  );
  const [categoriaId, setCategoriaId] = useState(
    vencimientoAEditar?.categoria_id ?? "",
  );
  const [proveedor, setProveedor] = useState(
    vencimientoAEditar?.proveedor ?? "",
  );
  const [montoEstimado, setMontoEstimado] = useState<number | null>(
    vencimientoAEditar?.monto_estimado ?? null,
  );
  const [cuentaSugeridaId, setCuentaSugeridaId] = useState(
    vencimientoAEditar?.cuenta_sugerida_id ?? "",
  );
  const [medioSugerido, setMedioSugerido] = useState<MedioPago>(
    vencimientoAEditar?.medio_sugerido ?? "transferencia",
  );
  const [frecuencia, setFrecuencia] = useState<FrecuenciaVencimiento>(
    vencimientoAEditar?.frecuencia ?? "mensual",
  );
  const [diaDelMes, setDiaDelMes] = useState<number>(
    vencimientoAEditar?.dia_del_mes ?? 10,
  );
  const [diaSemana, setDiaSemana] = useState<number>(
    vencimientoAEditar?.dia_semana ?? 1,
  );
  const [fechaInicio, setFechaInicio] = useState(
    vencimientoAEditar?.fecha_inicio ?? hoyStr,
  );

  // Modo de terminación
  const [terminaTipo, setTerminaTipo] = useState<"nunca" | "fecha" | "cuotas">(
    vencimientoAEditar?.cuotas_total != null
      ? "cuotas"
      : vencimientoAEditar?.fecha_fin != null
        ? "fecha"
        : "nunca",
  );
  const [fechaFin, setFechaFin] = useState(vencimientoAEditar?.fecha_fin ?? "");
  const [cuotasTotal, setCuotasTotal] = useState<number | string>(
    vencimientoAEditar?.cuotas_total ?? "",
  );
  const [cuotasPagadas, setCuotasPagadas] = useState<number>(
    vencimientoAEditar?.cuotas_pagadas ?? 0,
  );

  const [recordarDiasAntes, setRecordarDiasAntes] = useState<number>(
    vencimientoAEditar?.recordar_dias_antes ?? 1,
  );
  const [notas, setNotas] = useState(vencimientoAEditar?.notas ?? "");
  const [activo, setActivo] = useState(vencimientoAEditar?.activo ?? true);

  const [categorias, setCategorias] = useState<CategoriaMovimiento[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  // Cargar categorías y cuentas
  useEffect(() => {
    supabase
      .from("categorias_movimiento")
      .select("*")
      .eq("ambito", ambito)
      .eq("tipo", "egreso")
      .order("nombre")
      .then(({ data }) => setCategorias(data ?? []));

    supabase
      .from("cuentas")
      .select("*")
      .eq("activa", true)
      .order("orden")
      .then(({ data }) => {
        const ctas = data ?? [];
        setCuentas(ctas);
        if (!cuentaSugeridaId && ctas.length > 0) {
          setCuentaSugeridaId(ctas[0].id);
        }
      });
  }, [ambito, cuentaSugeridaId]);

  // Previsualización de instancias a 90 días
  const d90 = new Date();
  d90.setDate(d90.getDate() + 90);
  const hoyMas90Str = d90.toISOString().slice(0, 10);

  const proximasFechas = useMemo(() => {
    try {
      return generarFechas(
        {
          frecuencia,
          dia_del_mes: diaDelMes,
          dia_semana: diaSemana,
          fecha_inicio: fechaInicio,
          fecha_fin: terminaTipo === "fecha" && fechaFin ? fechaFin : null,
          cuotas_total:
            terminaTipo === "cuotas" && cuotasTotal !== ""
              ? Number(cuotasTotal)
              : null,
          cuotas_pagadas: cuotasPagadas,
        },
        hoyStr,
        hoyMas90Str,
      );
    } catch {
      return [];
    }
  }, [
    frecuencia,
    diaDelMes,
    diaSemana,
    fechaInicio,
    terminaTipo,
    fechaFin,
    cuotasTotal,
    cuotasPagadas,
    hoyStr,
    hoyMas90Str,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      setErrorValidacion("El título es obligatorio.");
      return;
    }

    setGuardando(true);
    setErrorValidacion(null);

    try {
      const payloadVencimiento = {
        titulo: titulo.trim(),
        ambito,
        categoria_id: categoriaId || null,
        proveedor: proveedor.trim() || null,
        monto_estimado: montoEstimado,
        cuenta_sugerida_id: cuentaSugeridaId || null,
        medio_sugerido: medioSugerido,
        frecuencia,
        dia_del_mes:
          frecuencia === "mensual" ||
          frecuencia === "quincenal" ||
          frecuencia === "bimestral"
            ? Number(diaDelMes)
            : null,
        dia_semana: frecuencia === "semanal" ? Number(diaSemana) : null,
        fecha_inicio: fechaInicio,
        fecha_fin: terminaTipo === "fecha" && fechaFin ? fechaFin : null,
        cuotas_total:
          terminaTipo === "cuotas" && cuotasTotal !== ""
            ? Number(cuotasTotal)
            : null,
        cuotas_pagadas: cuotasPagadas,
        recordar_dias_antes: Number(recordarDiasAntes) || 1,
        notas: notas.trim() || null,
        activo,
      };

      let vId = vencimientoAEditar?.id;

      if (esEdicion && vId) {
        const { error: updErr } = await supabase
          .from("vencimientos")
          .update(payloadVencimiento)
          .eq("id", vId);
        if (updErr) throw updErr;
      } else {
        const { data: insData, error: insErr } = await supabase
          .from("vencimientos")
          .insert(payloadVencimiento)
          .select("id")
          .single();
        if (insErr) throw insErr;
        vId = insData.id;
      }

      // Generar instancias de los próximos 90 días
      if (vId && activo && proximasFechas.length > 0) {
        const filasInstancias = proximasFechas.map((f, idx) => ({
          vencimiento_id: vId,
          fecha: f,
          numero_cuota:
            terminaTipo === "cuotas" ? cuotasPagadas + idx + 1 : null,
          monto_estimado: montoEstimado,
          estado: "pendiente",
        }));

        // onConflict (vencimiento_id, fecha) ignoreDuplicates: true respeta instancias existentes
        const { error: upsertErr } = await supabase
          .from("vencimiento_instancias")
          .upsert(filasInstancias, {
            onConflict: "vencimiento_id,fecha",
            ignoreDuplicates: true,
          });

        if (upsertErr) throw upsertErr;
      }

      // Sincronizar Google Calendar con debounce si la conexión está activa
      try {
        const { data: tieneGcal } = await supabase.rpc("tengo_google_calendar");
        if (tieneGcal) {
          dispararSyncGcalDebounced();
        }
      } catch (errGcal) {
        console.warn("[GCAL] Error al comprobar conexión de calendario al guardar vencimiento:", errGcal);
      }

      onGuardado();
    } catch (err: any) {
      setErrorValidacion(
        err.message || "Error al guardar el vencimiento recurrente.",
      );
      setGuardando(false);
    }
  };

  return (
    <Tarjeta className="p-4 sm:p-6 space-y-4 border-marca bg-superficie">
      <div className="flex items-center justify-between border-b border-borde pb-3">
        <div>
          <h2 className="text-lg font-semibold text-tinta">
            {esEdicion ? "Editar vencimiento" : "Nuevo vencimiento"}
          </h2>
          <p className="text-xs text-tinta-suave">
            Configurá las reglas recurrentes para que se agenden automáticamente
            tus compromisos de pago.
          </p>
        </div>
        <Boton variante="secundario" tamano="md" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>

      {errorValidacion && (
        <div className="p-3 bg-peligro-suave border border-peligro/20 rounded-md text-peligro text-sm">
          {errorValidacion}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Ámbito y Título */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Etiqueta>Ámbito</Etiqueta>
            <div className="grid grid-cols-2 gap-1.5 h-10">
              <button
                type="button"
                onClick={() => setAmbito("empresa")}
                className={`text-sm font-medium rounded-md border transition-colors ${
                  ambito === "empresa"
                    ? "bg-marca-suave text-marca border-marca"
                    : "bg-superficie text-tinta-suave border-borde hover:bg-fondo"
                }`}
              >
                Empresa
              </button>
              <button
                type="button"
                onClick={() => setAmbito("personal")}
                className={`text-sm font-medium rounded-md border transition-colors ${
                  ambito === "personal"
                    ? "bg-marca-suave text-marca border-marca"
                    : "bg-superficie text-tinta-suave border-borde hover:bg-fondo"
                }`}
              >
                Personal
              </button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <Campo etiqueta="Título del compromiso" id="venc_titulo">
              <Entrada
                id="venc_titulo"
                placeholder="Ej: Sueldos, Alquiler galpón, Cargas sociales F931..."
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
              />
            </Campo>
          </div>
        </div>

        {/* Proveedor, Categoría y Monto */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo etiqueta="Proveedor / Entidad" id="venc_proveedor">
            <Entrada
              id="venc_proveedor"
              placeholder="Ej: AFIP, Edenor, Juan Pérez..."
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Categoría de gasto" id="venc_categoria">
            <Selector
              id="venc_categoria"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </Campo>

          <Campo etiqueta="Monto estimado" id="venc_monto">
            <EntradaMonto
              id="venc_monto"
              valor={montoEstimado}
              onChange={(val) => setMontoEstimado(val)}
            />
          </Campo>
        </div>

        {/* Cuenta y medio sugeridos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo etiqueta="Cuenta sugerida" id="venc_cuenta">
            <Selector
              id="venc_cuenta"
              value={cuentaSugeridaId}
              onChange={(e) => setCuentaSugeridaId(e.target.value)}
            >
              <option value="">Cualquiera</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </Campo>

          <Campo etiqueta="Medio de pago sugerido" id="venc_medio">
            <Selector
              id="venc_medio"
              value={medioSugerido}
              onChange={(e) => setMedioSugerido(e.target.value as MedioPago)}
            >
              {MEDIOS_EGRESO.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Selector>
          </Campo>
        </div>

        {/* Frecuencia y Parámetros temporales */}
        <div className="p-3.5 bg-fondo rounded-lg border border-borde space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Campo etiqueta="Frecuencia" id="venc_frecuencia">
              <Selector
                id="venc_frecuencia"
                value={frecuencia}
                onChange={(e) =>
                  setFrecuencia(e.target.value as FrecuenciaVencimiento)
                }
              >
                {FRECUENCIAS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Selector>
            </Campo>

            {(frecuencia === "mensual" ||
              frecuencia === "quincenal" ||
              frecuencia === "bimestral") && (
              <Campo
                etiqueta={
                  frecuencia === "quincenal"
                    ? "Día primer pago del mes"
                    : "Día del mes (1 a 31)"
                }
                id="venc_dia_mes"
              >
                <Entrada
                  id="venc_dia_mes"
                  type="number"
                  min={1}
                  max={31}
                  value={diaDelMes}
                  onChange={(e) => setDiaDelMes(Number(e.target.value))}
                  required
                />
              </Campo>
            )}

            {frecuencia === "semanal" && (
              <Campo etiqueta="Día de la semana" id="venc_dia_semana">
                <Selector
                  id="venc_dia_semana"
                  value={diaSemana}
                  onChange={(e) => setDiaSemana(Number(e.target.value))}
                >
                  {DIAS_SEMANA.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Selector>
              </Campo>
            )}

            <Campo etiqueta="Fecha de inicio" id="venc_inicio">
              <Entrada
                id="venc_inicio"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                required
              />
            </Campo>
          </div>

          {/* Opciones de finalización */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-borde">
            <Campo etiqueta="Finalización" id="venc_termina">
              <Selector
                id="venc_termina"
                value={terminaTipo}
                onChange={(e) =>
                  setTerminaTipo(e.target.value as "nunca" | "fecha" | "cuotas")
                }
              >
                <option value="nunca">Nunca (continuo)</option>
                <option value="fecha">En una fecha determinada</option>
                <option value="cuotas">Después de N cuotas</option>
              </Selector>
            </Campo>

            {terminaTipo === "fecha" && (
              <Campo etiqueta="Fecha de fin" id="venc_fin">
                <Entrada
                  id="venc_fin"
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  required
                />
              </Campo>
            )}

            {terminaTipo === "cuotas" && (
              <>
                <Campo etiqueta="Cuotas totales" id="venc_cuotas_tot">
                  <Entrada
                    id="venc_cuotas_tot"
                    type="number"
                    min={1}
                    placeholder="Ej: 36"
                    value={cuotasTotal}
                    onChange={(e) => setCuotasTotal(e.target.value)}
                    required
                  />
                </Campo>

                <Campo etiqueta="Cuotas ya pagadas" id="venc_cuotas_pag">
                  <Entrada
                    id="venc_cuotas_pag"
                    type="number"
                    min={0}
                    value={cuotasPagadas}
                    onChange={(e) => setCuotasPagadas(Number(e.target.value))}
                  />
                </Campo>
              </>
            )}
          </div>
        </div>

        {/* Recordatorio y Notas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo etiqueta="Recordar días antes" id="venc_recordar">
            <Entrada
              id="venc_recordar"
              type="number"
              min={0}
              max={30}
              value={recordarDiasAntes}
              onChange={(e) => setRecordarDiasAntes(Number(e.target.value))}
            />
          </Campo>

          <div className="sm:col-span-2">
            <Campo etiqueta="Notas internas" id="venc_notas">
              <Entrada
                id="venc_notas"
                placeholder="Observaciones, CBU, link de pago..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </Campo>
          </div>
        </div>

        <div className="flex items-center pt-1">
          <label className="flex items-center gap-2 text-sm font-medium text-tinta cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="size-4 rounded border-borde text-marca focus:ring-marca"
            />
            Vencimiento activo (genera instancias programadas)
          </label>
        </div>

        {/* Previsualización UX al pie */}
        {proximasFechas.length > 0 ? (
          <div className="p-3 bg-marca-suave/40 border border-marca/20 rounded-md text-xs text-tinta space-y-1">
            <p className="font-semibold text-marca">
              Se van a agendar {proximasFechas.length}{" "}
              {proximasFechas.length === 1 ? "vencimiento" : "vencimientos"} en
              los próximos 90 días:
            </p>
            <p className="text-tinta-suave tabular-nums">
              {proximasFechas
                .slice(0, 6)
                .map((f) => formatearFecha(f))
                .join(" · ")}
              {proximasFechas.length > 6 &&
                ` (+${proximasFechas.length - 6} más)`}
            </p>
          </div>
        ) : (
          <div className="p-3 bg-fondo border border-borde rounded-md text-xs text-tinta-suave">
            No se generarán vencimientos en los próximos 90 días con los
            parámetros seleccionados.
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Boton
            type="button"
            variante="secundario"
            tamano="md"
            onClick={onCancelar}
            disabled={guardando}
          >
            Cancelar
          </Boton>
          <Boton type="submit" tamano="md" disabled={guardando}>
            {guardando
              ? "Guardando..."
              : esEdicion
                ? "Guardar cambios"
                : "Crear vencimiento"}
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
