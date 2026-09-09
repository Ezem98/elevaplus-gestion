import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { TipoCliente, CondicionIva, CondicionPago } from "@/lib/tipos";
import { ETIQUETA_TIPO_CLIENTE, ETIQUETA_CONDICION_IVA, ETIQUETA_CONDICION_PAGO } from "@/lib/tipos";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Campo, Entrada, Selector, AreaTexto } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";

export function FormularioCliente() {
  const { id } = useParams<{ id: string }>();
  const esEdicion = Boolean(id);
  const navigate = useNavigate();

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCliente>("empresa");
  const [cuit, setCuit] = useState("");
  const [condicionIva, setCondicionIva] = useState<CondicionIva | "">("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [condicionPago, setCondicionPago] = useState<CondicionPago>("contado");
  const [diasPago, setDiasPago] = useState<number | string>(0);
  const [notas, setNotas] = useState("");

  const [cargando, setCargando] = useState(esEdicion);
  const [guardando, setGuardando] = useState(false);
  const [errorNombre, setErrorNombre] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setCargando(true);
    supabase
      .from("clientes")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (data && !error) {
          setNombre(data.nombre ?? "");
          setTipo(data.tipo ?? "empresa");
          setCuit(data.cuit ?? "");
          setCondicionIva(data.condicion_iva ?? "");
          setTelefono(data.telefono ?? "");
          setEmail(data.email ?? "");
          setDireccion(data.direccion ?? "");
          setLocalidad(data.localidad ?? "");
          setCondicionPago(data.condicion_pago ?? "contado");
          setDiasPago(data.dias_pago ?? 0);
          setNotas(data.notas ?? "");
        }
        setCargando(false);
      });
  }, [id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorNombre(true);
      return;
    }
    setErrorNombre(false);
    setErrorGuardar(null);
    setGuardando(true);

    const payload = {
      nombre: nombre.trim(),
      tipo,
      cuit: cuit.trim() || null,
      condicion_iva: condicionIva || null,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      direccion: direccion.trim() || null,
      localidad: localidad.trim() || null,
      condicion_pago: condicionPago,
      dias_pago: condicionPago !== "contado" ? Number(diasPago) || 0 : 0,
      notas: notas.trim() || null,
    };

    try {
      if (esEdicion && id) {
        const { error } = await supabase
          .from("clientes")
          .update(payload)
          .eq("id", id);

        if (error) {
          setErrorGuardar("No se pudo guardar. Probá de nuevo.");
          setGuardando(false);
          return;
        }
        navigate(`/clientes/${id}`);
      } else {
        const { data, error } = await supabase
          .from("clientes")
          .insert(payload)
          .select("id")
          .single();

        if (error || !data?.id) {
          setErrorGuardar("No se pudo guardar. Probá de nuevo.");
          setGuardando(false);
          return;
        }
        navigate(`/clientes/${data.id}`);
      }
    } catch {
      setErrorGuardar("No se pudo guardar. Probá de nuevo.");
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-tinta-suave">
        Cargando datos del cliente...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <EncabezadoPagina
        volverA={esEdicion && id ? `/clientes/${id}` : "/clientes"}
        titulo={esEdicion ? "Editar cliente" : "Nuevo cliente"}
      />

      <Tarjeta className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4 pb-4 md:pb-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Campo etiqueta="Nombre *" id="nombre">
                <Entrada
                  id="nombre"
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    if (errorNombre && e.target.value.trim()) setErrorNombre(false);
                  }}
                  placeholder="Razón social o nombre"
                />
                {errorNombre && (
                  <p className="mt-1 text-sm text-peligro">Ingresá el nombre del cliente</p>
                )}
              </Campo>
            </div>

            <Campo etiqueta="Tipo" id="tipo">
              <Selector
                id="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoCliente)}
              >
                <option value="empresa">{ETIQUETA_TIPO_CLIENTE.empresa}</option>
                <option value="particular">{ETIQUETA_TIPO_CLIENTE.particular}</option>
                <option value="municipio">{ETIQUETA_TIPO_CLIENTE.municipio}</option>
              </Selector>
            </Campo>

            <Campo etiqueta="CUIT" id="cuit">
              <Entrada
                id="cuit"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                placeholder="Ej: 30-12345678-9"
              />
            </Campo>

            <Campo etiqueta="Condición IVA" id="condicion_iva">
              <Selector
                id="condicion_iva"
                value={condicionIva}
                onChange={(e) => setCondicionIva(e.target.value as CondicionIva | "")}
              >
                <option value="">Sin especificar</option>
                <option value="responsable_inscripto">{ETIQUETA_CONDICION_IVA.responsable_inscripto}</option>
                <option value="monotributo">{ETIQUETA_CONDICION_IVA.monotributo}</option>
                <option value="exento">{ETIQUETA_CONDICION_IVA.exento}</option>
                <option value="consumidor_final">{ETIQUETA_CONDICION_IVA.consumidor_final}</option>
              </Selector>
            </Campo>

            <Campo etiqueta="Teléfono" id="telefono">
              <Entrada
                id="telefono"
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej: 11 6391-6614"
              />
            </Campo>

            <Campo etiqueta="Email" id="email">
              <Entrada
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ej: compras@empresa.com.ar"
              />
            </Campo>

            <Campo etiqueta="Dirección" id="direccion">
              <Entrada
                id="direccion"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Ej: Av. Espora 1200"
              />
            </Campo>

            <Campo etiqueta="Localidad" id="localidad">
              <Entrada
                id="localidad"
                value={localidad}
                onChange={(e) => setLocalidad(e.target.value)}
                placeholder="Ej: Burzaco, Quilmes"
              />
            </Campo>

            <Campo etiqueta="Condición de pago" id="condicion_pago">
              <Selector
                id="condicion_pago"
                value={condicionPago}
                onChange={(e) => setCondicionPago(e.target.value as CondicionPago)}
              >
                <option value="contado">{ETIQUETA_CONDICION_PAGO.contado}</option>
                <option value="transferencia_diferida">{ETIQUETA_CONDICION_PAGO.transferencia_diferida}</option>
                <option value="cuenta_corriente">{ETIQUETA_CONDICION_PAGO.cuenta_corriente}</option>
              </Selector>
            </Campo>

            {condicionPago !== "contado" && (
              <Campo etiqueta="Días de pago" id="dias_pago">
                <Entrada
                  id="dias_pago"
                  type="number"
                  min={0}
                  step={1}
                  value={diasPago}
                  onChange={(e) => setDiasPago(e.target.value)}
                  placeholder="30"
                />
              </Campo>
            )}

            <div className="md:col-span-2">
              <Campo etiqueta="Notas" id="notas">
                <AreaTexto
                  id="notas"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Comentarios, contactos adicionales o acuerdos particulares"
                />
              </Campo>
            </div>
          </div>

          {errorGuardar && (
            <p className="text-sm text-peligro">{errorGuardar}</p>
          )}

          <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-borde bg-superficie p-3 md:static md:mx-0 md:mb-0 md:bg-transparent md:p-0 md:pt-4 flex items-center justify-end gap-3 z-10">
            <Boton
              type="button"
              variante="secundario"
              onClick={() => navigate(-1)}
            >
              Cancelar
            </Boton>
            <Boton
              type="submit"
              disabled={guardando}
            >
              Guardar cliente
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
