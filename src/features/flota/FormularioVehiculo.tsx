import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { AreaTexto, Campo, Entrada, Selector } from "@/components/ui/Campo";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { supabase } from "@/lib/supabase";
import type { Vehiculo } from "@/lib/tipos";
import { useState, type FormEvent } from "react";

interface FormularioVehiculoProps {
  vehiculoAEditar?: Vehiculo | null;
  onGuardado: () => void;
  onCancelar: () => void;
}

export function FormularioVehiculo({
  vehiculoAEditar,
  onGuardado,
  onCancelar,
}: FormularioVehiculoProps) {
  const esEdicion = Boolean(vehiculoAEditar);

  const [nombre, setNombre] = useState(vehiculoAEditar?.nombre ?? "");
  const [tipo, setTipo] = useState<"camion" | "camioneta" | "trailer">(
    vehiculoAEditar?.tipo ?? "camion",
  );
  const [patente, setPatente] = useState(vehiculoAEditar?.patente ?? "");
  const [marca, setMarca] = useState(vehiculoAEditar?.marca ?? "");
  const [modelo, setModelo] = useState(vehiculoAEditar?.modelo ?? "");
  const [anio, setAnio] = useState<number | string>(
    vehiculoAEditar?.anio ?? "",
  );
  const [kmActual, setKmActual] = useState<number | string>(
    vehiculoAEditar?.km_actual ?? "",
  );
  const [vtvVence, setVtvVence] = useState(vehiculoAEditar?.vtv_vence ?? "");
  const [seguroVence, setSeguroVence] = useState(
    vehiculoAEditar?.seguro_vence ?? "",
  );
  const [seguroCompania, setSeguroCompania] = useState(
    vehiculoAEditar?.seguro_compania ?? "",
  );
  const [estado, setEstado] = useState<
    "disponible" | "en_servicio" | "taller" | "baja"
  >(vehiculoAEditar?.estado ?? "disponible");
  const [notasFlota, setNotasFlota] = useState(
    vehiculoAEditar?.notas_flota ?? "",
  );

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("El nombre del vehículo es obligatorio (ej: Ford Cargo)");
      return;
    }

    setGuardando(true);
    setError(null);

    const payload = {
      nombre: nombre.trim(),
      tipo,
      patente: patente.trim().toUpperCase() || null,
      marca: marca.trim() || null,
      modelo: modelo.trim() || null,
      anio: anio !== "" && !isNaN(Number(anio)) ? Number(anio) : null,
      km_actual:
        kmActual !== "" && !isNaN(Number(kmActual)) ? Number(kmActual) : null,
      vtv_vence: vtvVence || null,
      seguro_vence: seguroVence || null,
      seguro_compania: seguroCompania.trim() || null,
      estado,
      notas_flota: notasFlota.trim() || null,
      activo: estado !== "baja",
    };

    try {
      if (esEdicion && vehiculoAEditar) {
        const { error: err } = await supabase
          .from("vehiculos")
          .update(payload)
          .eq("id", vehiculoAEditar.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("vehiculos").insert({
          ...payload,
          coef_precio: 1,
          coef_carga_menor_50: 1,
          coef_carga_mayor_50: 1,
        });
        if (err) throw err;
      }
      onGuardado();
    } catch (err: any) {
      setError(err.message || "Error al guardar el vehículo");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta className="p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-borde">
        <h3 className="text-base font-semibold text-tinta">
          {esEdicion
            ? `Editar vehículo ${vehiculoAEditar?.nombre}`
            : "Agregar nuevo vehículo"}
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
          <Campo etiqueta="Nombre de unidad *" id="veh-nombre">
            <Entrada
              id="veh-nombre"
              required
              placeholder="Ej: Ford Cargo, Ranger"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Tipo de vehículo *" id="veh-tipo">
            <Selector
              id="veh-tipo"
              value={tipo}
              onChange={(e) =>
                setTipo(e.target.value as "camion" | "camioneta" | "trailer")
              }
            >
              <option value="camion">Camión</option>
              <option value="camioneta">Camioneta</option>
              <option value="trailer">Trailer</option>
            </Selector>
          </Campo>

          <Campo etiqueta="Patente / Dominio" id="veh-patente">
            <Entrada
              id="veh-patente"
              placeholder="Ej: AA 924 CD"
              value={patente}
              onChange={(e) => setPatente(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Marca" id="veh-marca">
            <Entrada
              id="veh-marca"
              placeholder="Ej: Ford, Volkswagen, Fiat"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Modelo" id="veh-modelo">
            <Entrada
              id="veh-modelo"
              placeholder="Ej: Cargo 1722, Fiorino Fire"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Año" id="veh-anio">
            <Entrada
              id="veh-anio"
              type="number"
              min="1990"
              max="2035"
              placeholder="Ej: 2018"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Kilometraje actual" id="veh-km">
            <Entrada
              id="veh-km"
              type="number"
              step="0.1"
              placeholder="Ej: 145000"
              value={kmActual}
              onChange={(e) => setKmActual(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Vencimiento VTV" id="veh-vtv">
            <Entrada
              id="veh-vtv"
              type="date"
              value={vtvVence}
              onChange={(e) => setVtvVence(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Compañía de seguro" id="veh-seguro-cia">
            <Entrada
              id="veh-seguro-cia"
              placeholder="Ej: Federación Patronal, La Segunda"
              value={seguroCompania}
              onChange={(e) => setSeguroCompania(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Vencimiento de póliza" id="veh-seguro-vence">
            <Entrada
              id="veh-seguro-vence"
              type="date"
              value={seguroVence}
              onChange={(e) => setSeguroVence(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Estado operativo" id="veh-estado">
            <Selector
              id="veh-estado"
              value={estado}
              onChange={(e) =>
                setEstado(
                  e.target.value as
                    | "disponible"
                    | "en_servicio"
                    | "taller"
                    | "baja",
                )
              }
            >
              <option value="disponible">Operativo / Disponible</option>
              <option value="en_servicio">En servicio</option>
              <option value="taller">En taller</option>
              <option value="baja">De baja</option>
            </Selector>
          </Campo>
        </div>

        <Campo etiqueta="Notas técnicas / Asignación" id="veh-notas">
          <AreaTexto
            id="veh-notas"
            rows={2}
            placeholder="Chofer asignado, capacidad útil de carga, detalles de auxilio..."
            value={notasFlota}
            onChange={(e) => setNotasFlota(e.target.value)}
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
                : "Crear vehículo"}
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
