import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { AreaTexto, Campo, Entrada } from "@/components/ui/Campo";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { supabase } from "@/lib/supabase";
import type { Tercerizado } from "@/lib/tipos";
import { useState, type FormEvent } from "react";

interface FormularioTercerizadoProps {
  tercerizadoAEditar?: Tercerizado | null;
  onGuardado: () => void;
  onCancelar: () => void;
}

export function FormularioTercerizado({
  tercerizadoAEditar,
  onGuardado,
  onCancelar,
}: FormularioTercerizadoProps) {
  const esEdicion = Boolean(tercerizadoAEditar);

  const [nombre, setNombre] = useState(tercerizadoAEditar?.nombre ?? "");
  const [tipo, setTipo] = useState(tercerizadoAEditar?.tipo ?? "carretón");
  const [telefono, setTelefono] = useState(tercerizadoAEditar?.telefono ?? "");
  const [cuit, setCuit] = useState(tercerizadoAEditar?.cuit ?? "");
  const [notas, setNotas] = useState(tercerizadoAEditar?.notas ?? "");
  const [activo, setActivo] = useState(tercerizadoAEditar?.activo ?? true);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("El nombre del transportista o proveedor es obligatorio");
      return;
    }

    setGuardando(true);
    setError(null);

    const payload = {
      nombre: nombre.trim(),
      tipo: tipo.trim() || null,
      telefono: telefono.trim() || null,
      cuit: cuit.trim() || null,
      notas: notas.trim() || null,
      activo,
    };

    try {
      if (esEdicion && tercerizadoAEditar) {
        const { error: err } = await supabase
          .from("tercerizados")
          .update(payload)
          .eq("id", tercerizadoAEditar.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from("tercerizados")
          .insert(payload);
        if (err) throw err;
      }
      onGuardado();
    } catch (err: any) {
      setError(err.message || "Error al guardar tercerizado");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta className="p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-borde">
        <h3 className="text-base font-semibold text-tinta">
          {esEdicion
            ? `Editar tercerizado ${tercerizadoAEditar?.nombre}`
            : "Agregar nuevo proveedor tercerizado"}
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
          <Campo etiqueta="Nombre / Razón social *" id="terc-nombre">
            <Entrada
              id="terc-nombre"
              required
              placeholder="Ej: Trans-Norte, Grúas San Martín"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Tipo de equipo / servicio" id="terc-tipo">
            <Entrada
              id="terc-tipo"
              placeholder="Ej: Carretón, Camión plancha, Grúa"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="Teléfono de contacto" id="terc-tel">
            <Entrada
              id="terc-tel"
              placeholder="Ej: 11 4455-6677"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </Campo>

          <Campo etiqueta="CUIT" id="terc-cuit">
            <Entrada
              id="terc-cuit"
              placeholder="Ej: 30-12345678-9"
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
            />
          </Campo>
        </div>

        <Campo etiqueta="Notas" id="terc-notas">
          <AreaTexto
            id="terc-notas"
            rows={2}
            placeholder="Choferes habituales, bases operativas, condiciones de pago..."
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </Campo>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-tinta select-none cursor-pointer">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="rounded border-borde text-marca focus:ring-marca"
            />
            Proveedor activo
          </label>
        </div>

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
                : "Crear tercerizado"}
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
