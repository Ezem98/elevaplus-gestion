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
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import type { Cuenta, TipoEventoFlota } from "@/lib/tipos";
import { ETIQUETA_EVENTO_FLOTA } from "@/lib/tipos";
import { useEffect, useState, type FormEvent } from "react";

interface FormularioEventoFlotaProps {
  vehiculoId?: string | null;
  maquinaId?: string | null;
  unidadNombre: string;
  esMaquina: boolean;
  kmOHorasActual?: number | null;
  tipoInicial?: TipoEventoFlota;
  onGuardado: () => void;
  onCancelar: () => void;
}

export function FormularioEventoFlota({
  vehiculoId,
  maquinaId,
  unidadNombre,
  esMaquina,
  kmOHorasActual,
  tipoInicial = "service",
  onGuardado,
  onCancelar,
}: FormularioEventoFlotaProps) {
  const { session } = useAuth();

  const [tipo, setTipo] = useState<TipoEventoFlota>(tipoInicial);
  const [fecha, setFecha] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [fechaFin, setFechaFin] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [lectura, setLectura] = useState<number | string>(kmOHorasActual ?? "");
  const [costo, setCosto] = useState<number | null>(null);
  const [registrarEnCaja, setRegistrarEnCaja] = useState(false);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState<string>("");
  const [proveedor, setProveedor] = useState("");
  const [proximoVencimiento, setProximoVencimiento] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("cuentas")
      .select("*")
      .eq("activa", true)
      .order("orden")
      .then(({ data }) => {
        const lista = (data as Cuenta[]) ?? [];
        setCuentas(lista);
        if (lista.length > 0) {
          setCuentaId(lista[0].id);
        }
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    try {
      let movimientoId: string | null = null;

      // 1. Si se indicó registrar como gasto en caja y hay costo
      if (registrarEnCaja && costo && costo > 0) {
        // Buscar categoría "Mantenimiento y reparaciones" o crear/usar la primera de tipo egreso y ámbito empresa
        const { data: catData } = await supabase
          .from("categorias_movimiento")
          .select("id")
          .eq("ambito", "empresa")
          .eq("tipo", "egreso")
          .ilike("nombre", "%Mantenimiento%")
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
            proveedor: proveedor.trim() || null,
            descripcion:
              descripcion.trim() ||
              `${ETIQUETA_EVENTO_FLOTA[tipo]} - ${unidadNombre}`,
            cuenta_id: cuentaId || null,
            monto: costo,
            estado: "pagado",
            fecha_acreditacion: fecha,
            registrado_por: session?.user?.id ?? null,
          })
          .select("id")
          .single();

        if (movErr) throw movErr;
        movimientoId = movCreado?.id ?? null;
      }

      // 2. Insertar evento de flota
      const valorLectura =
        lectura !== "" && !isNaN(Number(lectura)) ? Number(lectura) : null;

      const { error: evErr } = await supabase.from("eventos_flota").insert({
        vehiculo_id: vehiculoId ?? null,
        maquina_id: maquinaId ?? null,
        fecha: fecha,
        fecha_fin: fechaFin || null,
        tipo: tipo,
        descripcion: descripcion.trim() || null,
        km: !esMaquina ? valorLectura : null,
        horas: esMaquina ? valorLectura : null,
        costo: costo ?? null,
        movimiento_id: movimientoId,
        proximo_vencimiento: proximoVencimiento || null,
        proveedor: proveedor.trim() || null,
        creado_por: session?.user?.id ?? null,
      });

      if (evErr) throw evErr;

      // 3. Actualizar campos derivados en el vehículo o máquina
      if (!esMaquina && vehiculoId) {
        const updates: Record<string, any> = {};
        if (valorLectura != null) updates.km_actual = valorLectura;
        if (tipo === "taller" && !fechaFin) updates.estado = "taller";
        if (tipo === "vtv" && proximoVencimiento)
          updates.vtv_vence = proximoVencimiento;
        if (tipo === "seguro" && proximoVencimiento)
          updates.seguro_vence = proximoVencimiento;
        if (tipo === "seguro" && proveedor.trim())
          updates.seguro_compania = proveedor.trim();

        if (Object.keys(updates).length > 0) {
          await supabase.from("vehiculos").update(updates).eq("id", vehiculoId);
        }
      } else if (esMaquina && maquinaId) {
        const updates: Record<string, any> = {};
        if (valorLectura != null) updates.horas_actual = valorLectura;
        if (tipo === "taller" && !fechaFin) updates.estado = "taller";
        if (tipo === "service") {
          updates.ultimo_service = fecha;
          if (proximoVencimiento) updates.proximo_service = proximoVencimiento;
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from("maquinas").update(updates).eq("id", maquinaId);
        }
      }

      onGuardado();
    } catch (err: any) {
      setError(err.message || "Error al registrar el evento de flota");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-fondo border border-borde rounded-lg p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between pb-2 border-b border-borde">
        <h4 className="font-semibold text-tinta">
          Registrar evento en {unidadNombre}
        </h4>
        <button
          type="button"
          onClick={onCancelar}
          className="text-xs text-tinta-suave hover:text-tinta font-medium"
        >
          Cancelar
        </button>
      </div>

      {error && <Aviso variante="peligro">{error}</Aviso>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo etiqueta="Tipo de evento" id="evento-tipo">
            <Selector
              id="evento-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoEventoFlota)}
            >
              {(Object.keys(ETIQUETA_EVENTO_FLOTA) as TipoEventoFlota[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_EVENTO_FLOTA[t]}
                  </option>
                ),
              )}
            </Selector>
          </Campo>

          <Campo etiqueta="Fecha" id="evento-fecha">
            <Entrada
              id="evento-fecha"
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Campo>

          {tipo === "taller" && (
            <Campo
              etiqueta="Fecha fin (opcional si ya salió)"
              id="evento-fecha-fin"
            >
              <Entrada
                id="evento-fecha-fin"
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </Campo>
          )}

          <Campo
            etiqueta={
              esMaquina ? "Horómetro actual (horas)" : "Kilometraje actual"
            }
            id="evento-lectura"
          >
            <Entrada
              id="evento-lectura"
              type="number"
              step="0.1"
              placeholder={esMaquina ? "Ej: 1450" : "Ej: 125000"}
              value={lectura}
              onChange={(e) => setLectura(e.target.value)}
            />
          </Campo>

          <div>
            <Etiqueta htmlFor="evento-costo">Costo del evento</Etiqueta>
            <EntradaMonto
              id="evento-costo"
              placeholder="Opcional"
              valor={costo}
              onChange={(val) => {
                setCosto(val);
                if (!val || val <= 0) setRegistrarEnCaja(false);
              }}
            />
          </div>

          <Campo etiqueta="Proveedor / Taller" id="evento-proveedor">
            <Entrada
              id="evento-proveedor"
              placeholder="Ej: Mecánica Martínez, Toyota San Martín"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
            />
          </Campo>

          <Campo
            etiqueta="Próximo vencimiento o service"
            id="evento-prox-venc"
            ayuda="Aparecerá en la Agenda de vencimientos"
          >
            <Entrada
              id="evento-prox-venc"
              type="date"
              value={proximoVencimiento}
              onChange={(e) => setProximoVencimiento(e.target.value)}
            />
          </Campo>
        </div>

        {costo != null && costo > 0 && (
          <div className="p-3 bg-superficie rounded border border-borde space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-tinta select-none">
              <input
                type="checkbox"
                checked={registrarEnCaja}
                onChange={(e) => setRegistrarEnCaja(e.target.checked)}
                className="rounded border-borde text-marca focus:ring-marca"
              />
              Registrar como gasto en Caja (Mantenimiento)
            </label>

            {registrarEnCaja && (
              <div className="pt-2">
                <Campo etiqueta="Cuenta de pago" id="evento-cuenta">
                  <Selector
                    id="evento-cuenta"
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

        <Campo etiqueta="Descripción o diagnóstico" id="evento-descripcion">
          <AreaTexto
            id="evento-descripcion"
            rows={2}
            placeholder="Detalle de trabajos realizados, repuestos cambiados o fallas..."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Campo>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-borde">
          <Boton
            type="button"
            variante="secundario"
            className="h-8 px-3 text-xs"
            onClick={onCancelar}
            disabled={guardando}
          >
            Cancelar
          </Boton>
          <Boton
            type="submit"
            className="h-8 px-3 text-xs"
            disabled={guardando}
          >
            {guardando ? "Guardando..." : "Guardar evento"}
          </Boton>
        </div>
      </form>
    </div>
  );
}
