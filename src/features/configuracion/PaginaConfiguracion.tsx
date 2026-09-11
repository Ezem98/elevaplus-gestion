import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { CondicionIva, Empresa, ParametrosCotizador, Servicio, AmbienteArca } from "@/lib/tipos";
import { ETIQUETA_CONDICION_IVA } from "@/lib/tipos";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { armarCondiciones } from "@/lib/presupuesto";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { BarraAcciones } from "@/components/ui/BarraAcciones";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { AreaTexto, Campo, Entrada, Etiqueta, Selector } from "@/components/ui/Campo";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { Aviso } from "@/components/ui/Aviso";

export function PaginaConfiguracion() {
  const [tabConfig, setTabConfig] = useState<"empresa" | "facturacion_arca" | "presupuestos" | "cotizador">("empresa");

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

  // --- Estado Facturación Electrónica ARCA ---
  const [arcaAmbiente, setArcaAmbiente] = useState<AmbienteArca>("homologacion");
  const [puntoVentaWs, setPuntoVentaWs] = useState<number | string>(3);
  const [topeDiarioFacturas, setTopeDiarioFacturas] = useState<number | string>(20);
  const [topeDiarioMonto, setTopeDiarioMonto] = useState<number | null>(20000000);
  const [cbu, setCbu] = useState("");
  const [aliasCbu, setAliasCbu] = useState("");
  const [banco, setBanco] = useState("");
  const [emailFacturacion, setEmailFacturacion] = useState("");
  const [textoPieFactura, setTextoPieFactura] = useState("");
  const [guardandoArca, setGuardandoArca] = useState(false);
  const [mensajeArca, setMensajeArca] = useState<string | null>(null);
  const [errorArca, setErrorArca] = useState<string | null>(null);
  const [modalConfirmarProd, setModalConfirmarProd] = useState(false);

  // --- Estado Presupuestos ---
  const [validezDias, setValidezDias] = useState<number | string>(15);
  const [precioEsperaCamion, setPrecioEsperaCamion] = useState<number | null>(null);
  const [precioEsperaAutoelevador, setPrecioEsperaAutoelevador] = useState<number | null>(null);
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
  const [nuevoPrecioKm, setNuevoPrecioKm] = useState<number | null>(null);
  const [nuevoMontoMinimo, setNuevoMontoMinimo] = useState<number | null>(null);
  const [nuevoKmMinimo, setNuevoKmMinimo] = useState<number | string>("");
  const [nuevoPrecioGasoil, setNuevoPrecioGasoil] = useState<number | null>(null);
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
      setPrecioEsperaCamion(emp.precio_hora_espera_camion ?? null);
      setPrecioEsperaAutoelevador(emp.precio_hora_espera_autoelevador ?? null);
      setTextoEsperaAutoelevador(emp.presupuesto_espera_autoelevador || "");
      setCondicionesExtra(emp.presupuesto_condiciones_extra || "");

      setArcaAmbiente(emp.arca_ambiente || "homologacion");
      setPuntoVentaWs(emp.punto_venta_ws ?? 3);
      setTopeDiarioFacturas(emp.tope_diario_facturas ?? 20);
      setTopeDiarioMonto(emp.tope_diario_monto ?? 20000000);
      setCbu(emp.cbu || "");
      setAliasCbu(emp.alias_cbu || "");
      setBanco(emp.banco || "");
      setEmailFacturacion(emp.email_facturacion || "facturacion@eleva-plus.com.ar");
      setTextoPieFactura(emp.texto_pie_factura || "");
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
      setNuevoPrecioKm(vigente.precio_km ?? null);
      setNuevoMontoMinimo(vigente.monto_minimo ?? null);
      setNuevoKmMinimo(vigente.km_minimo);
      setNuevoPrecioGasoil(vigente.precio_gasoil ?? null);
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

  // --- Guardar Facturación Electrónica ARCA ---
  const handleGuardarArca = async (e: FormEvent) => {
    e.preventDefault();
    setGuardandoArca(true);
    setErrorArca(null);

    const { error } = await supabase
      .from("empresa")
      .update({
        arca_ambiente: arcaAmbiente,
        punto_venta_ws: Math.max(1, Math.floor(Number(puntoVentaWs) || 3)),
        tope_diario_facturas: Math.max(1, Math.floor(Number(topeDiarioFacturas) || 20)),
        tope_diario_monto: topeDiarioMonto || 20000000,
        cbu: cbu.trim() || null,
        alias_cbu: aliasCbu.trim() || null,
        banco: banco.trim() || null,
        email_facturacion: emailFacturacion.trim() || null,
        texto_pie_factura: textoPieFactura.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    setGuardandoArca(false);

    if (error) {
      setErrorArca(error.message);
    } else {
      setMensajeArca("Guardado");
      setTimeout(() => {
        setMensajeArca(null);
      }, 2000);
    }
  };

  // --- Guardar Presupuestos ---

  const handleGuardarPresupuesto = async (e: FormEvent) => {
    e.preventDefault();
    setGuardandoPresupuesto(true);
    setErrorPresupuesto(null);

    const { error } = await supabase
      .from("empresa")
      .update({
        presupuesto_validez_dias: Math.max(1, Math.floor(Number(validezDias) || 15)),
        precio_hora_espera_camion: precioEsperaCamion,
        precio_hora_espera_autoelevador: precioEsperaAutoelevador,
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

    const { error } = await supabase
      .from("parametros_cotizador")
      .insert({
        vigente_desde: nuevoVigenteDesde,
        precio_km: nuevoPrecioKm ?? 0,
        monto_minimo: nuevoMontoMinimo ?? 0,
        km_minimo: Number(nuevoKmMinimo) || 1,
        precio_gasoil: nuevoPrecioGasoil,
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
    precio_hora_espera_camion: precioEsperaCamion,
    precio_hora_espera_autoelevador: precioEsperaAutoelevador,
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
      <EncabezadoPagina
        titulo="Configuración"
        subtitulo="Datos de la empresa, términos de presupuestos y parámetros del cotizador"
      />

      {/* Selector de pestañas en celular para separar los 3 formularios */}
      <div className="flex border-b border-borde md:hidden">
        <button
          type="button"
          onClick={() => setTabConfig("empresa")}
          className={`flex-1 py-2.5 text-center text-sm font-medium border-b-2 transition-colors ${
            tabConfig === "empresa"
              ? "border-marca text-marca"
              : "border-transparent text-tinta-suave hover:text-tinta"
          }`}
        >
          Empresa
        </button>
        <button
          type="button"
          onClick={() => setTabConfig("facturacion_arca")}
          className={`flex-1 py-2.5 text-center text-sm font-medium border-b-2 transition-colors ${
            tabConfig === "facturacion_arca"
              ? "border-marca text-marca"
              : "border-transparent text-tinta-suave hover:text-tinta"
          }`}
        >
          Facturación ARCA
        </button>
        <button
          type="button"
          onClick={() => setTabConfig("presupuestos")}
          className={`flex-1 py-2.5 text-center text-sm font-medium border-b-2 transition-colors ${
            tabConfig === "presupuestos"
              ? "border-marca text-marca"
              : "border-transparent text-tinta-suave hover:text-tinta"
          }`}
        >
          Presupuestos
        </button>

        <button
          type="button"
          onClick={() => setTabConfig("cotizador")}
          className={`flex-1 py-2.5 text-center text-sm font-medium border-b-2 transition-colors ${
            tabConfig === "cotizador"
              ? "border-marca text-marca"
              : "border-transparent text-tinta-suave hover:text-tinta"
          }`}
        >
          Cotizador
        </button>
      </div>

      {/* 1. Tarjeta Empresa */}
      <Tarjeta className={`p-6 ${tabConfig === "empresa" ? "block" : "hidden md:block"}`}>
        <h2 className="text-lg font-semibold text-tinta mb-4">Empresa</h2>

        {errorEmpresa && <Aviso variante="peligro" className="mb-4">{errorEmpresa}</Aviso>}

        <form onSubmit={handleGuardarEmpresa} className="space-y-4 pb-[72px] md:pb-0">
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
                placeholder="Ej: 30-12345678-9"
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
                placeholder="Ej: Av. Espora 1200"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Teléfono" id="emp-telefono">
              <Entrada
                id="emp-telefono"
                placeholder="Ej: 11 3276-5635"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Email" id="emp-email">
              <Entrada
                id="emp-email"
                type="email"
                placeholder="Ej: compras@empresa.com.ar"
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

          {mensajeEmpresa && (
            <p className="text-sm font-medium text-ok">{mensajeEmpresa}</p>
          )}

          <BarraAcciones>
            <Boton type="submit" disabled={guardandoEmpresa}>
              {guardandoEmpresa ? "Guardando…" : "Guardar empresa"}
            </Boton>
          </BarraAcciones>
        </form>
      </Tarjeta>

      {/* 2. Tarjeta Facturación Electrónica ARCA */}
      <Tarjeta className={`p-6 ${tabConfig === "facturacion_arca" ? "block" : "hidden md:block"}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-tinta">Facturación electrónica (ARCA)</h2>
            <p className="text-xs text-tinta-suave mt-0.5">
              Configuración de Web Service (WSFEv1), ambiente, topes diarios y datos de pago
            </p>
          </div>
          {arcaAmbiente === "homologacion" ? (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Homologación
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Producción
            </span>
          )}
        </div>

        {errorArca && <Aviso variante="peligro" className="mb-4">{errorArca}</Aviso>}

        <form onSubmit={handleGuardarArca} className="space-y-4 pb-[72px] md:pb-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo
              etiqueta="Ambiente ARCA"
              id="arca-ambiente"
              ayuda="En homologación los comprobantes no tienen validez fiscal."
            >
              <Selector
                id="arca-ambiente"
                value={arcaAmbiente}
                onChange={(e) => {
                  const nuevo = e.target.value as AmbienteArca;
                  if (nuevo === "produccion" && arcaAmbiente !== "produccion") {
                    setModalConfirmarProd(true);
                  } else {
                    setArcaAmbiente(nuevo);
                  }
                }}
              >
                <option value="homologacion">Homologación (pruebas)</option>
                <option value="produccion">Producción (oficial)</option>
              </Selector>
            </Campo>

            <Campo
              etiqueta="Punto de venta WS"
              id="arca-pv"
              ayuda="Punto de venta habilitado en ARCA tipo Web Service."
            >
              <Entrada
                id="arca-pv"
                type="number"
                min="1"
                max="9999"
                required
                value={puntoVentaWs}
                onChange={(e) => setPuntoVentaWs(e.target.value)}
              />
            </Campo>

            <Campo
              etiqueta="Tope diario de facturas"
              id="arca-tope-facturas"
              ayuda="Cantidad máxima de facturas que el lote emitirá sin pausar."
            >
              <Entrada
                id="arca-tope-facturas"
                type="number"
                min="1"
                required
                value={topeDiarioFacturas}
                onChange={(e) => setTopeDiarioFacturas(e.target.value)}
              />
            </Campo>

            <Campo
              etiqueta="Tope diario de monto"
              id="arca-tope-monto"
              ayuda="Si el lote supera este monto acumulado, no emitirá."
            >
              <EntradaMonto
                id="arca-tope-monto"
                valor={topeDiarioMonto}
                onChange={(val) => setTopeDiarioMonto(val)}
                placeholder="20.000.000"
              />

            </Campo>
          </div>

          <div className="border-t border-borde pt-4 mt-4">
            <h3 className="text-sm font-semibold text-tinta mb-3">
              Datos para el pago (aparecen en PDF y correos)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Campo etiqueta="Banco" id="arca-banco">
                <Entrada
                  id="arca-banco"
                  placeholder="Ej: Banco Galicia"
                  value={banco}
                  onChange={(e) => setBanco(e.target.value)}
                />
              </Campo>

              <Campo etiqueta="CBU" id="arca-cbu">
                <Entrada
                  id="arca-cbu"
                  placeholder="22 dígitos"
                  value={cbu}
                  onChange={(e) => setCbu(e.target.value)}
                />
              </Campo>

              <Campo etiqueta="Alias CBU" id="arca-alias">
                <Entrada
                  id="arca-alias"
                  placeholder="Ej: ELEVA.PLUS.PAGOS"
                  value={aliasCbu}
                  onChange={(e) => setAliasCbu(e.target.value)}
                />
              </Campo>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 pt-2">
            <Campo
              etiqueta="Email remitente de facturación"
              id="arca-email"
              ayuda="Email remitente para el envío de facturas a clientes."
            >
              <Entrada
                id="arca-email"
                type="email"
                placeholder="facturacion@eleva-plus.com.ar"
                value={emailFacturacion}
                onChange={(e) => setEmailFacturacion(e.target.value)}
              />
            </Campo>

            <Campo
              etiqueta="Texto para el pie de factura"
              id="arca-pie"
              ayuda="Leyenda o notas adicionales en el pie del PDF."
            >
              <AreaTexto
                id="arca-pie"
                rows={2}
                placeholder="Ej: Esta factura debe ser cancelada dentro del plazo acordado."
                value={textoPieFactura}
                onChange={(e) => setTextoPieFactura(e.target.value)}
              />
            </Campo>
          </div>

          {mensajeArca && (
            <p className="text-sm font-medium text-ok">{mensajeArca}</p>
          )}

          <BarraAcciones>
            <Boton type="submit" disabled={guardandoArca}>
              {guardandoArca ? "Guardando…" : "Guardar facturación"}
            </Boton>
          </BarraAcciones>
        </form>
      </Tarjeta>

      {/* 3. Tarjeta Presupuestos */}
      <Tarjeta className={`p-6 ${tabConfig === "presupuestos" ? "block" : "hidden md:block"}`}>

        <h2 className="text-lg font-semibold text-tinta mb-4">Presupuestos</h2>

        {errorPresupuesto && <Aviso variante="peligro" className="mb-4">{errorPresupuesto}</Aviso>}

        <form onSubmit={handleGuardarPresupuesto} className="space-y-4 pb-[72px] md:pb-0">
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
              <EntradaMonto
                id="pres-espera-camion"
                placeholder="Opcional"
                valor={precioEsperaCamion}
                onChange={setPrecioEsperaCamion}
              />
              <p className="mt-1 text-xs text-tinta-suave">
                Si está vacío, el presupuesto no menciona la espera en traslados
              </p>
            </div>

            <div>
              <Etiqueta htmlFor="pres-espera-autoelevador">Precio hora de espera del autoelevador</Etiqueta>
              <EntradaMonto
                id="pres-espera-autoelevador"
                placeholder="Opcional"
                valor={precioEsperaAutoelevador}
                onChange={setPrecioEsperaAutoelevador}
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

          {mensajePresupuesto && (
            <p className="text-sm font-medium text-ok">{mensajePresupuesto}</p>
          )}

          <BarraAcciones>
            <Boton type="submit" disabled={guardandoPresupuesto}>
              {guardandoPresupuesto ? "Guardando…" : "Guardar presupuestos"}
            </Boton>
          </BarraAcciones>
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
      <Tarjeta className={`p-6 ${tabConfig === "cotizador" ? "block" : "hidden md:block"}`}>
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

          <form onSubmit={handleGuardarParametros} className="space-y-4 pb-[72px] md:pb-0">
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
                <EntradaMonto
                  id="param-precio-km"
                  required
                  valor={nuevoPrecioKm}
                  onChange={setNuevoPrecioKm}
                />
              </div>

              <div>
                <Etiqueta htmlFor="param-minimo">Mínimo</Etiqueta>
                <EntradaMonto
                  id="param-minimo"
                  required
                  valor={nuevoMontoMinimo}
                  onChange={setNuevoMontoMinimo}
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
                <EntradaMonto
                  id="param-gasoil"
                  placeholder="Opcional"
                  valor={nuevoPrecioGasoil}
                  onChange={setNuevoPrecioGasoil}
                />
              </div>
            </div>

            {mensajeParametros && (
              <p className="text-sm font-medium text-ok">{mensajeParametros}</p>
            )}

            <BarraAcciones>
              <Boton type="submit" disabled={guardandoParametros}>
                {guardandoParametros ? "Guardando…" : "Guardar nuevos valores"}
              </Boton>
            </BarraAcciones>

            <p className="text-xs text-tinta-suave">
              Los valores anteriores quedan en el historial.
            </p>
          </form>
        </div>
      </Tarjeta>

      {/* Modal de confirmación para ambiente de Producción */}
      {modalConfirmarProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Tarjeta className="max-w-md p-6 space-y-4 shadow-xl border-peligro/30">
            <h3 className="text-lg font-bold text-peligro">
              Confirmar pase a PRODUCCIÓN
            </h3>
            <p className="text-sm text-tinta leading-relaxed">
              Estás a punto de activar el ambiente de <strong>PRODUCCIÓN</strong> de ARCA.
              A partir de este momento, todos los comprobantes emitidos tendrán <strong>validez legal y fiscal real</strong>.
            </p>
            <p className="text-xs text-tinta-suave">
              Asegurate de contar con el certificado digital de producción y el punto de venta Web Service habilitado en la web de ARCA.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Boton
                type="button"
                variante="secundario"
                onClick={() => setModalConfirmarProd(false)}
              >
                Cancelar
              </Boton>
              <Boton
                type="button"
                variante="peligro"
                onClick={() => {
                  setArcaAmbiente("produccion");
                  setModalConfirmarProd(false);
                }}
              >
                Sí, pasar a Producción
              </Boton>
            </div>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}

