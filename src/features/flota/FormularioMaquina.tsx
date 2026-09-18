import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { AreaTexto, Campo, Entrada, Selector } from "@/components/ui/Campo";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { supabase } from "@/lib/supabase";
import type { EstadoMaquina, Maquina, TipoMaquina } from "@/lib/tipos";
import { ETIQUETA_TIPO_MAQUINA } from "@/lib/tipos";
import { useState, type FormEvent } from "react";

interface FormularioMaquinaProps {
  maquinaAEditar?: Maquina | null;
  onGuardado: () => void;
  onCancelar: () => void;
}

export function FormularioMaquina({
  maquinaAEditar,
  onGuardado,
  onCancelar,
}: FormularioMaquinaProps) {
  const esEdicion = Boolean(maquinaAEditar);

  const [codigoInterno, setCodigoInterno] = useState(
    maquinaAEditar?.codigo_interno ?? "",
  );
  const [tipo, setTipo] = useState<TipoMaquina>(
    maquinaAEditar?.tipo ?? "autoelevador",
  );
  const [marca, setMarca] = useState(maquinaAEditar?.marca ?? "");
  const [modelo, setModelo] = useState(maquinaAEditar?.modelo ?? "");
  const [capacidad, setCapacidad] = useState(maquinaAEditar?.capacidad ?? "");
  const [anio, setAnio] = useState<number | string>(maquinaAEditar?.anio ?? "");
  const [horasActual, setHorasActual] = useState<number | string>(
    maquinaAEditar?.horas_actual ?? "",
  );
  const [numeroSerie, setNumeroSerie] = useState(
    maquinaAEditar?.numero_serie ?? "",
  );
  const [combustible, setCombustible] = useState(
    maquinaAEditar?.combustible ?? "",
  );
  const [ultimoService, setUltimoService] = useState(
    maquinaAEditar?.ultimo_service ?? "",
  );
  const [proximoService, setProximoService] = useState(
    maquinaAEditar?.proximo_service ?? "",
  );
  const [estado, setEstado] = useState<EstadoMaquina>(
    maquinaAEditar?.estado ?? "disponible",
  );
  const [notas, setNotas] = useState(maquinaAEditar?.notas ?? "");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!codigoInterno.trim()) {
      setError("El código interno es obligatorio (ej: AE-01)");
      return;
    }

    setGuardando(true);
    setError(null);

    const payload = {
      codigo_interno: codigoInterno.trim().toUpperCase(),
      tipo,
      marca: marca.trim() || null,
      modelo: modelo.trim() || null,
      capacidad: capacidad.trim() || null,
      anio: anio !== "" && !isNaN(Number(anio)) ? Number(anio) : null,
      horas_actual:
        horasActual !== "" && !isNaN(Number(horasActual))
          ? Number(horasActual)
          : null,
      numero_serie: numeroSerie.trim() || null,
      combustible: combustible.trim() || null,
      ultimo_service: ultimoService || null,
      proximo_service: proximoService || null,
      estado,
      notas: notas.trim() || null,
      activo: estado !== "baja",
    };

    try {
      if (esEdicion && maquinaAEditar) {
        const { error: err } = await supabase
          .from("maquinas")
          .update(payload)
          .eq("id", maquinaAEditar.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("maquinas").insert(payload);
        if (err) throw err;
      }
      onGuardado();
    } catch (err: any) {
      setError(err.message || "Error al guardar la máquina");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta className="p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-borde">
        <h3 className="text-base font-semibold text-tinta">
          {esEdicion
            ? `Editar máquina ${maquinaAEditar?.codigo_interno}`
            : "Agregar nueva máquina"}
        </h3>
        <button
          type="button"
          onClick={onCancelar}
          className="text-xs text-tinta-suave hover:text-tinta font-medium"
        >
          Cerrar
        </button>
      </div>

      {error && <Aviso variante="peligro">{error}</Aviso>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Campo etiqueta="Código interno *" id="maq-codigo">
            <Entrada
              id="maq-codigo"
              required
              placeholder="Ej: AE-01"
              value={codigoInterno}
              onChange={(e) => setCodigoInterno(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Tipo de máquina *" id="maq-tipo">
            <Selector
              id="maq-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoMaquina)}
            >
              {(Object.keys(ETIQUETA_TIPO_MAQUINA) as TipoMaquina[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_MAQUINA[t]}
                  </option>
                ),
              )}
            </Selector>
          </Campo>

          <Campo etiqueta="Marca" id="maq-marca">
            <Entrada
              id="maq-marca"
              placeholder="Ej: Toyota, Heli, Genie"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Modelo" id="maq-modelo">
            <Entrada
              id="maq-modelo"
              placeholder="Ej: 8FD25, GS-1930"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Capacidad / Altura" id="maq-capacidad">
            <Entrada
              id="maq-capacidad"
              placeholder="Ej: 2,5 t, 12 m"
              value={capacidad}
              onChange={(e) => setCapacidad(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Combustible / Alimentación" id="maq-combustible">
            <Entrada
              id="maq-combustible"
              placeholder="Ej: Diésel, Nafta/GNC, Eléctrica"
              value={combustible}
              onChange={(e) => setCombustible(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Horómetro actual (horas)" id="maq-horas">
            <Entrada
              id="maq-horas"
              type="number"
              step="0.1"
              placeholder="Ej: 3420"
              value={horasActual}
              onChange={(e) => setHorasActual(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Año de fabricación" id="maq-anio">
            <Entrada
              id="maq-anio"
              type="number"
              min="1980"
              max="2035"
              placeholder="Ej: 2021"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Número de serie" id="maq-serie">
            <Entrada
              id="maq-serie"
              placeholder="Ej: TY-9872134"
              value={numeroSerie}
              onChange={(e) => setNumeroSerie(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Último service" id="maq-ult-service">
            <Entrada
              id="maq-ult-service"
              type="date"
              value={ultimoService}
              onChange={(e) => setUltimoService(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Próximo service" id="maq-prox-service">
            <Entrada
              id="maq-prox-service"
              type="date"
              value={proximoService}
              onChange={(e) => setProximoService(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Estado operativo" id="maq-estado">
            <Selector
              id="maq-estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoMaquina)}
            >
              <option value="disponible">Disponible</option>
              <option value="alquilada">Alquilada</option>
              <option value="taller">En taller</option>
              <option value="baja">De baja</option>
            </Selector>
          </Campo>
        </div>

        <Campo etiqueta="Notas técnicas / Ubicación" id="maq-notas">
          <AreaTexto
            id="maq-notas"
            rows={2}
            placeholder="Ubicación habitual (Base Adrogué), accesorios especiales..."
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </Campo>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-borde">
          <Boton
            type="button"
            variante="secundario"
            onClick={onCancelar}
            disabled={guardando}
          >
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando
              ? "Guardando..."
              : esEdicion
                ? "Guardar cambios"
                : "Crear máquina"}
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
