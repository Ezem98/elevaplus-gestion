import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { CondicionIva, Empresa, ParametrosCotizador, Servicio } from "@/lib/tipos";
import { ETIQUETA_CONDICION_IVA } from "@/lib/tipos";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { armarCondiciones } from "@/lib/presupuesto";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { AreaTexto, Campo, Entrada, Etiqueta, Selector } from "@/components/ui/Campo";
import { Aviso } from "@/components/ui/Aviso";

export function PaginaConfiguracion() {
  // --- Estado Empresa ---
  const [razonSocial, setRazonSocial] = useState("");
  const [cuit, setCuit] = useState("");
  const [condicionIva, setCondicionIva] = useState<CondicionIva>("responsable_inscripto");
  const [domicilio, setDomicilio] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [emailSecundario, setEmailSecundario] = useState("");
  const [instagram, setInstagram] = useState("");
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false);
  const [mensajeEmpresa, setMensajeEmpresa] = useState<string | null>(null);
  const [errorEmpresa, setErrorEmpresa] = useState<string | null>(null);

  // --- Estado Presupuestos ---
  const [validezDias, setValidezDias] = useState<number | string>(15);
  const [precioEsperaCamion, setPrecioEsperaCamion] = useState<number | string>("");
  const [precioEsperaAutoelevador, setPrecioEsperaAutoelevador] = useState<number | string>("");
  const [textoEsperaAutoelevador, setTextoEsperaAutoelevador] = useState("");
  const [condicionesExtra, setCondicionesExtra] = useState("");
  const [guardandoPresupuesto, setGuardandoPresupuesto] = useState(false);
  const [mensajePresupuesto, setMensajePresupuesto] = useState<string | null>(null);
  const [errorPresupuesto, setErrorPresupuesto] = useState<string | null>(null);

  // --- Estado Cotizador ---
  const [parametros, setParametros] = useState<ParametrosCotizador[]>([]);
  const [cargandoParametros, setCargandoParametros] = useState(false);
  const [nuevoVigenteDesde, setNuevoVigenteDesde] = useState(() => {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [nuevoPrecioKm, setNuevoPrecioKm] = useState<number | string>("");
  const [nuevoMontoMinimo, setNuevoMontoMinimo] = useState<number | string>("");
  const [nuevoKmMinimo, setNuevoKmMinimo] = useState<number | string>("");
  const [nuevoPrecioGasoil, setNuevoPrecioGasoil] = useState<number | string>("");
  const [guardandoParametros, setGuardandoParametros] = useState(false);
  const [mensajeParametros, setMensajeParametros] = useState<string | null>(null);
  const [errorParametros, setErrorParametros] = useState<string | null>(null);

  const cargarEmpresa = async () => {
    const { data } = await supabase
      .from("empresa")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (data) {
      const emp = data as Empresa;
      setRazonSocial(emp.razon_social || "");
      setCuit(emp.cuit || "");
      setCondicionIva(emp.condicion_iva || "responsable_inscripto");
      setDomicilio(emp.domicilio || "");
      setTelefono(emp.telefono || "");
      setEmail(emp.email || "");
      setEmailSecundario(emp.email_secundario || "");
      setInstagram(emp.instagram || "");

      setValidezDias(emp.presupuesto_validez_dias ?? 15);
      setPrecioEsperaCamion(emp.precio_hora_espera_camion ?? "");
      setPrecioEsperaAutoelevador(emp.precio_hora_espera_autoelevador ?? "");
      setTextoEsperaAutoelevador(emp.presupuesto_espera_autoelevador || "");
      setCondicionesExtra(emp.presupuesto_condiciones_extra || "");
    }
  };

  const cargarParametros = async () => {
    setCargandoParametros(true);
    const { data } = await supabase
      .from("parametros_cotizador")
      .select("*")
      .order("vigente_desde", { ascending: false })
      .order("id", { ascending: false });

    const lista = (data as ParametrosCotizador[]) ?? [];
    setParametros(lista);

    if (lista.length > 0) {
      const vigente = lista[0];
      setNuevoPrecioKm(vigente.precio_km);
      setNuevoMontoMinimo(vigente.monto_minimo);
      setNuevoKmMinimo(vigente.km_minimo);
      setNuevoPrecioGasoil(vigente.precio_gasoil ?? "");
    }
    setCargandoParametros(false);
  };

  useEffect(() => {
    cargarEmpresa();
    cargarParametros();
  }, []);

  // --- Guardar Empresa ---
  const handleGuardarEmpresa = async (e: FormEvent) => {
    e.preventDefault();
    setGuardandoEmpresa(true);
    setErrorEmpresa(null);

    const { error } = await supabase
      .from("empresa")
      .update({
        razon_social: razonSocial.trim(),
        cuit: cuit.trim(),
        condicion_iva: condicionIva,
        domicilio: domicilio.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        email_secundario: emailSecundario.trim() || null,
        instagram: instagram.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    setGuardandoEmpresa(false);

    if (error) {
      setErrorEmpresa(error.message);
    } else {
      setMensajeEmpresa("Guardado");
      setTimeout(() => {
        setMensajeEmpresa(null);
      }, 2000);
    }
  };

  // --- Guardar Presupuestos ---
  const handleGuardarPresupuesto = async (e: FormEvent) => {
    e.preventDefault();
    setGuardandoPresupuesto(true);
    setErrorPresupuesto(null);

    const parsedPrecioCamion =
      precioEsperaCamion !== "" && !isNaN(Number(precioEsperaCamion))
        ? Number(precioEsperaCamion)
        : null;

    const parsedPrecioAutoelevador =
      precioEsperaAutoelevador !== "" && !isNaN(Number(precioEsperaAutoelevador))
        ? Number(precioEsperaAutoelevador)
        : null;

    const { error } = await supabase
      .from("empresa")
      .update({
        presupuesto_validez_dias: Math.max(1, Math.floor(Number(validezDias) || 15)),
        precio_hora_espera_camion: parsedPrecioCamion,
        precio_hora_espera_autoelevador: parsedPrecioAutoelevador,
        presupuesto_espera_autoelevador: textoEsperaAutoelevador.trim(),
        presupuesto_condiciones_extra: condicionesExtra.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    setGuardandoPresupuesto(false);

    if (error) {
      setErrorPresupuesto(error.message);
    } else {
      setMensajePresupuesto("Guardado");
      setTimeout(() => {
        setMensajePresupuesto(null);
      }, 2000);
    }
  };

  // --- Guardar Nuevos Parámetros Cotizador ---
  const handleGuardarParametros = async (e: FormEvent) => {
    e.preventDefault();
    setGuardandoParametros(true);
    setErrorParametros(null);

    const parsedGasoil =
      nuevoPrecioGasoil !== "" && !isNaN(Number(nuevoPrecioGasoil))
        ? Number(nuevoPrecioGasoil)
        : null;

    const { error } = await supabase
      .from("parametros_cotizador")
      .insert({
        vigente_desde: nuevoVigenteDesde,
        precio_km: Number(nuevoPrecioKm) || 0,
        monto_minimo: Number(nuevoMontoMinimo) || 0,
        km_minimo: Number(nuevoKmMinimo) || 1,
        precio_gasoil: parsedGasoil,
      });

    setGuardandoParametros(false);

    if (error) {
      setErrorParametros(error.message);
    } else {
      setMensajeParametros("Guardado");
      setTimeout(() => {
        setMensajeParametros(null);
      }, 2000);
      await cargarParametros();
    }
  };

  // --- Vista previa en vivo de condiciones ---
  const empresaPreview = {
    presupuesto_espera_autoelevador: textoEsperaAutoelevador,
    presupuesto_espera_camion: null,
    precio_hora_espera_camion:
      precioEsperaCamion !== "" && !isNaN(Number(precioEsperaCamion))
        ? Number(precioEsperaCamion)
        : null,
    precio_hora_espera_autoelevador:
      precioEsperaAutoelevador !== "" && !isNaN(Number(precioEsperaAutoelevador))
        ? Number(precioEsperaAutoelevador)
        : null,
  };

  const diasValidezPreview = Math.max(1, Math.floor(Number(validezDias) || 15));
  const extraPreview = condicionesExtra.trim() || null;

  const servicioEjemploTraslado: Pick<Servicio, "tipo" | "aplica_iva"> = {
    tipo: "traslado",
    aplica_iva: true,
  };

  const servicioEjemploAlquiler: Pick<Servicio, "tipo" | "aplica_iva"> = {
    tipo: "alquiler_hora",
    aplica_iva: true,
  };

  const condicionesTraslado = armarCondiciones({
    empresa: empresaPreview,
    servicio: servicioEjemploTraslado,
    validezDias: diasValidezPreview,
    extra: extraPreview,
  });

  const condicionesAlquiler = armarCondiciones({
    empresa: empresaPreview,
    servicio: servicioEjemploAlquiler,
    validezDias: diasValidezPreview,
    extra: extraPreview,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-tinta">Configuración</h1>
        <p className="text-sm text-tinta-suave">
          Datos de la empresa, términos de presupuestos y parámetros del cotizador
        </p>
      </div>

      {/* 1. Tarjeta Empresa */}
      <Tarjeta className="p-6">
        <h2 className="text-lg font-semibold text-tinta mb-4">Empresa</h2>

        {errorEmpresa && <Aviso variante="peligro" className="mb-4">{errorEmpresa}</Aviso>}

        <form onSubmit={handleGuardarEmpresa} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Razón social" id="emp-razon-social">
              <Entrada
                id="emp-razon-social"
                required
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="CUIT" id="emp-cuit">
              <Entrada
                id="emp-cuit"
                required
                placeholder="27-XXXXXXXX-X"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Condición IVA" id="emp-condicion-iva">
              <Selector
                id="emp-condicion-iva"
                value={condicionIva}
                onChange={(e) => setCondicionIva(e.target.value as CondicionIva)}
              >
                <option value="responsable_inscripto">{ETIQUETA_CONDICION_IVA.responsable_inscripto}</option>
                <option value="monotributo">{ETIQUETA_CONDICION_IVA.monotributo}</option>
                <option value="exento">{ETIQUETA_CONDICION_IVA.exento}</option>
                <option value="consumidor_final">{ETIQUETA_CONDICION_IVA.consumidor_final}</option>
              </Selector>
            </Campo>

            <Campo etiqueta="Domicilio" id="emp-domicilio">
              <Entrada
                id="emp-domicilio"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Teléfono" id="emp-telefono">
              <Entrada
                id="emp-telefono"
                placeholder="+54 9 11 ..."
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Email" id="emp-email">
              <Entrada
                id="emp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Email secundario" id="emp-email-secundario">
              <Entrada
                id="emp-email-secundario"
                type="email"
                value={emailSecundario}
                onChange={(e) => setEmailSecundario(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Instagram" id="emp-instagram">
              <Entrada
                id="emp-instagram"
                placeholder="@usuario"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
              />
            </Campo>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Boton type="submit" disabled={guardandoEmpresa}>
              {guardandoEmpresa ? "Guardando…" : "Guardar"}
            </Boton>
            {mensajeEmpresa && (
              <span className="text-sm font-medium text-ok">
                {mensajeEmpresa}
              </span>
            )}
          </div>
        </form>
      </Tarjeta>

      {/* 2. Tarjeta Presupuestos */}
      <Tarjeta className="p-6">
        <h2 className="text-lg font-semibold text-tinta mb-4">Presupuestos</h2>

        {errorPresupuesto && <Aviso variante="peligro" className="mb-4">{errorPresupuesto}</Aviso>}

        <form onSubmit={handleGuardarPresupuesto} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo etiqueta="Validez por defecto (días)" id="pres-validez">
              <Entrada
                id="pres-validez"
                type="number"
                min="1"
                required
                value={validezDias}
                onChange={(e) => setValidezDias(e.target.value)}
              />
            </Campo>

            <div>
              <Etiqueta htmlFor="pres-espera-camion">Precio hora de espera del camión</Etiqueta>
              <Entrada
                id="pres-espera-camion"
                type="number"
                min="0"
                step="any"
                placeholder="Opcional"
                value={precioEsperaCamion}
                onChange={(e) => setPrecioEsperaCamion(e.target.value)}
              />
              <p className="mt-1 text-xs text-tinta-suave">
                Si está vacío, el presupuesto no menciona la espera en traslados
              </p>
            </div>

            <div>
              <Etiqueta htmlFor="pres-espera-autoelevador">Precio hora de espera del autoelevador</Etiqueta>
              <Entrada
                id="pres-espera-autoelevador"
                type="number"
                min="0"
                step="any"
                placeholder="Opcional"
                value={precioEsperaAutoelevador}
                onChange={(e) => setPrecioEsperaAutoelevador(e.target.value)}
              />
              <p className="mt-1 text-xs text-tinta-suave">
                Si está vacío se usa el texto de abajo
              </p>
            </div>

            <Campo etiqueta="Texto de espera del autoelevador" id="pres-texto-autoelevador">
              <Entrada
                id="pres-texto-autoelevador"
                value={textoEsperaAutoelevador}
                onChange={(e) => setTextoEsperaAutoelevador(e.target.value)}
              />
            </Campo>
          </div>

          <div>
            <Etiqueta htmlFor="pres-condiciones-extra">Condiciones adicionales por defecto</Etiqueta>
            <AreaTexto
              id="pres-condiciones-extra"
              rows={3}
              value={condicionesExtra}
              onChange={(e) => setCondicionesExtra(e.target.value)}
            />
            <p className="mt-1 text-xs text-tinta-suave">
              Aparecen en todos los presupuestos; se pueden editar en cada uno
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Boton type="submit" disabled={guardandoPresupuesto}>
              {guardandoPresupuesto ? "Guardando…" : "Guardar"}
            </Boton>
            {mensajePresupuesto && (
              <span className="text-sm font-medium text-ok">
                {mensajePresupuesto}
              </span>
            )}
          </div>
        </form>

        {/* Vista previa en gris */}
        <div className="mt-6 rounded-md border border-borde bg-fondo p-4 text-xs text-tinta-suave space-y-4">
          <div>
            <p className="font-semibold text-tinta uppercase tracking-wider text-[11px] mb-2">
              Vista previa de condiciones — Traslado
            </p>
            <ul className="list-disc list-inside space-y-1">
              {condicionesTraslado.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>

          <div className="border-t border-borde/60 pt-3">
            <p className="font-semibold text-tinta uppercase tracking-wider text-[11px] mb-2">
              Vista previa de condiciones — Alquiler por hora
            </p>
            <ul className="list-disc list-inside space-y-1">
              {condicionesAlquiler.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </Tarjeta>

      {/* 3. Tarjeta Cotizador */}
      <Tarjeta className="p-6">
        <h2 className="text-lg font-semibold text-tinta mb-4">Cotizador</h2>

        {errorParametros && <Aviso variante="peligro" className="mb-4">{errorParametros}</Aviso>}

        {/* Tabla de parámetros */}
        <div className="overflow-x-auto rounded-md border border-borde">
          <table className="w-full text-sm">
            <thead className="bg-fondo text-left text-tinta-suave">
              <tr className="border-b border-borde">
                <th className="px-4 py-2.5 font-medium">Vigente desde</th>
                <th className="px-4 py-2.5 font-medium">Precio por km</th>
                <th className="px-4 py-2.5 font-medium">Mínimo</th>
                <th className="px-4 py-2.5 font-medium">Km mínimo</th>
                <th className="px-4 py-2.5 font-medium">Gasoil</th>
              </tr>
            </thead>
            <tbody>
              {parametros.map((p, idx) => (
                <tr
                  key={p.id}
                  className={`border-b border-borde/50 ${
                    idx === 0
                      ? "bg-marca-suave font-medium text-marca"
                      : "hover:bg-fondo"
                  }`}
                >
                  <td className="px-4 py-2.5">
                    {formatearFecha(p.vigente_desde)}
                    {idx === 0 && (
                      <span className="ml-2 rounded bg-marca/10 px-1.5 py-0.5 text-xs font-semibold text-marca">
                        Vigente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{formatearPesos(p.precio_km)}</td>
                  <td className="px-4 py-2.5">{formatearPesos(p.monto_minimo)}</td>
                  <td className="px-4 py-2.5">{p.km_minimo} km</td>
                  <td className="px-4 py-2.5">
                    {p.precio_gasoil != null ? formatearPesos(p.precio_gasoil) : "—"}
                  </td>
                </tr>
              ))}
              {parametros.length === 0 && !cargandoParametros && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-tinta-suave">
                    No hay parámetros registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Formulario inline Nuevos parámetros */}
        <div className="mt-6 border-t border-borde pt-5">
          <h3 className="text-sm font-semibold text-tinta mb-3">Nuevos parámetros</h3>

          <form onSubmit={handleGuardarParametros} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div>
                <Etiqueta htmlFor="param-vigente">Vigente desde</Etiqueta>
                <Entrada
                  id="param-vigente"
                  type="date"
                  required
                  value={nuevoVigenteDesde}
                  onChange={(e) => setNuevoVigenteDesde(e.target.value)}
                />
              </div>

              <div>
                <Etiqueta htmlFor="param-precio-km">Precio por km</Etiqueta>
                <Entrada
                  id="param-precio-km"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={nuevoPrecioKm}
                  onChange={(e) => setNuevoPrecioKm(e.target.value)}
                />
              </div>

              <div>
                <Etiqueta htmlFor="param-minimo">Mínimo</Etiqueta>
                <Entrada
                  id="param-minimo"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={nuevoMontoMinimo}
                  onChange={(e) => setNuevoMontoMinimo(e.target.value)}
                />
              </div>

              <div>
                <Etiqueta htmlFor="param-km-min">Km mínimo</Etiqueta>
                <Entrada
                  id="param-km-min"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={nuevoKmMinimo}
                  onChange={(e) => setNuevoKmMinimo(e.target.value)}
                />
              </div>

              <div>
                <Etiqueta htmlFor="param-gasoil">Gasoil</Etiqueta>
                <Entrada
                  id="param-gasoil"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Opcional"
                  value={nuevoPrecioGasoil}
                  onChange={(e) => setNuevoPrecioGasoil(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Boton type="submit" disabled={guardandoParametros}>
                {guardandoParametros ? "Guardando…" : "Guardar nuevos valores"}
              </Boton>
              {mensajeParametros && (
                <span className="text-sm font-medium text-ok">
                  {mensajeParametros}
                </span>
              )}
            </div>

            <p className="text-xs text-tinta-suave">
              Los valores anteriores quedan en el historial.
            </p>
          </form>
        </div>
      </Tarjeta>
    </div>
  );
}
