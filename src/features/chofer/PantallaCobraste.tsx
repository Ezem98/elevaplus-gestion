import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada } from "@/components/ui/Campo";
import { EntradaMonto } from "@/components/ui/EntradaMonto";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import type { Servicio } from "@/lib/tipos";
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  DollarSign,
  Loader2,
  X,
} from "lucide-react";
import { useRef, useMemo, useState } from "react";
import { useBorrador } from "@/hooks/useBorrador";

interface PantallaCobrasteProps {
  servicio: Servicio;
  onListo: () => void;
}

type OpcionCobro = "despues" | "efectivo" | "cheque";

function obtenerFechaLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

export function PantallaCobraste({ servicio, onListo }: PantallaCobrasteProps) {
  const { perfil } = useAuth();
  const [opcion, setOpcion] = useState<OpcionCobro>("efectivo");
  const [monto, setMonto] = useState<number | null>(servicio.monto ?? null);
  const [numeroCheque, setNumeroCheque] = useState("");
  const [bancoCheque, setBancoCheque] = useState("");
  const [fechaPagoCheque, setFechaPagoCheque] = useState(obtenerFechaLocal());

  const estadoCobraste = useMemo(
    () => ({
      opcion,
      monto,
      numeroCheque,
      bancoCheque,
      fechaPagoCheque,
    }),
    [opcion, monto, numeroCheque, bancoCheque, fechaPagoCheque],
  );

  const { AvisoBorrador, limpiar: limpiarBorrador } = useBorrador(
    `chofer_cobraste_${servicio.id}`,
    estadoCobraste,
    {
      tieneContenido: (d) =>
        Boolean(
          d.opcion !== "efectivo" ||
            d.numeroCheque?.trim() ||
            d.bancoCheque?.trim() ||
            (d.monto !== null && d.monto !== servicio.monto),
        ),
      onRestaurar: (d) => {
        if (d.opcion) setOpcion(d.opcion);
        if (d.monto !== undefined) setMonto(d.monto);
        if (d.numeroCheque !== undefined) setNumeroCheque(d.numeroCheque);
        if (d.bancoCheque !== undefined) setBancoCheque(d.bancoCheque);
        if (d.fechaPagoCheque !== undefined) setFechaPagoCheque(d.fechaPagoCheque);
      },
      onDescartar: () => {
        setOpcion("efectivo");
        setMonto(servicio.monto ?? null);
        setNumeroCheque("");
        setBancoCheque("");
        setFechaPagoCheque(obtenerFechaLocal());
      },
    },
  );

  const [fotoArchivo, setFotoArchivo] = useState<File | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function manejarSeleccionFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFotoArchivo(file);
      const url = URL.createObjectURL(file);
      setFotoUrl(url);
    }
  }

  function quitarFoto() {
    setFotoArchivo(null);
    if (fotoUrl) {
      URL.revokeObjectURL(fotoUrl);
      setFotoUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function manejarGuardar() {
    setError(null);

    // Caso 1: No cobró (paga después)
    if (opcion === "despues") {
      limpiarBorrador();
      onListo();
      return;
    }

    // Validar monto
    if (!monto || monto <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }

    const usuarioId = perfil?.id;
    if (!usuarioId) {
      setError("No hay una sesión activa de usuario.");
      return;
    }

    setGuardando(true);
    const hoy = obtenerFechaLocal();

    try {
      if (opcion === "efectivo") {
        // Buscar cuenta Efectivo (con fallback a null)
        let cuentaId: string | null = null;
        try {
          const { data: cuentaData } = await supabase
            .from("cuentas")
            .select("id")
            .eq("nombre", "Efectivo")
            .maybeSingle();
          if (cuentaData?.id) {
            cuentaId = cuentaData.id;
          }
        } catch {
          // Fallback a null si no se puede leer cuentas
          cuentaId = null;
        }

        // Insertar cobro en efectivo
        const { data: cobro, error: cobroError } = await supabase
          .from("cobros")
          .insert({
            cliente_id: servicio.cliente_id,
            fecha: hoy,
            fecha_acreditacion: hoy,
            monto: monto,
            medio: "efectivo",
            estado: "acreditado",
            registrado_por: usuarioId,
            cuenta_id: cuentaId,
          })
          .select("id")
          .single();

        if (cobroError) throw cobroError;

        // Si hay foto de comprobante, subirla y vincularla
        if (fotoArchivo) {
          const storagePath = `servicios/${servicio.id}/cheque-${Date.now()}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("adjuntos")
            .upload(storagePath, fotoArchivo, {
              contentType: fotoArchivo.type || "image/jpeg",
            });
          if (uploadError) throw uploadError;

          const { error: adjError } = await supabase.from("adjuntos").insert({
            servicio_id: servicio.id,
            cobro_id: cobro.id,
            tipo: "cheque",
            storage_path: storagePath,
            subido_por: usuarioId,
          });
          if (adjError) throw adjError;
        }

        // Insertar cobro_aplicaciones sin .select()
        const { error: aplicError } = await supabase
          .from("cobro_aplicaciones")
          .insert({
            cobro_id: cobro.id,
            servicio_id: servicio.id,
            monto: monto,
          });

        if (aplicError) throw aplicError;
      } else if (opcion === "cheque") {
        // Generar id de cheque en cliente para evitar .select()
        const chequeId = crypto.randomUUID();

        // Insertar en cheques sin .select()
        const { error: chequeError } = await supabase.from("cheques").insert({
          id: chequeId,
          tipo: "recibido",
          es_echeq: false,
          numero: numeroCheque.trim() || null,
          banco: bancoCheque.trim() || null,
          emisor: servicio.clientes?.nombre || "Cliente",
          monto: monto,
          fecha_pago: fechaPagoCheque || hoy,
          cliente_id: servicio.cliente_id,
          estado: "en_cartera",
        });

        if (chequeError) throw chequeError;

        // Insertar en cobros
        const { data: cobro, error: cobroError } = await supabase
          .from("cobros")
          .insert({
            cliente_id: servicio.cliente_id,
            fecha: hoy,
            monto: monto,
            medio: "cheque",
            estado: "pendiente",
            cheque_id: chequeId,
            registrado_por: usuarioId,
          })
          .select("id")
          .single();

        if (cobroError) throw cobroError;

        // Si hay foto de comprobante, subirla y vincularla
        if (fotoArchivo) {
          const storagePath = `servicios/${servicio.id}/cheque-${Date.now()}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("adjuntos")
            .upload(storagePath, fotoArchivo, {
              contentType: fotoArchivo.type || "image/jpeg",
            });
          if (uploadError) throw uploadError;

          const { error: adjError } = await supabase.from("adjuntos").insert({
            servicio_id: servicio.id,
            cobro_id: cobro.id,
            tipo: "cheque",
            storage_path: storagePath,
            subido_por: usuarioId,
          });
          if (adjError) throw adjError;
        }

        // Insertar cobro_aplicaciones sin .select()
        const { error: aplicError } = await supabase
          .from("cobro_aplicaciones")
          .insert({
            cobro_id: cobro.id,
            servicio_id: servicio.id,
            monto: monto,
          });

        if (aplicError) throw aplicError;
      }

      limpiarBorrador();
      setRegistrado(true);
      setTimeout(() => {
        onListo();
      }, 2000);
    } catch (err: any) {
      setError(err?.message ?? "Error al registrar el cobro.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[390px] flex-col pb-8">
      {/* Encabezado de paso */}
      <div className="mb-3 flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ok-suave text-ok text-xs">
            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-ok">
            Servicio finalizado
          </span>
        </div>
        <span className="text-xs text-tinta-tenue">Paso 2 de 2</span>
      </div>

      {/* Tarjeta de encabezado */}
      <div className="mb-4 flex items-start justify-between rounded-xl border border-borde bg-superficie p-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-tinta">
            ¿Cobraste?
          </h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Servicio #{servicio.numero} ·{" "}
            {servicio.clientes?.nombre ?? "Sin cliente"}
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-suave text-marca">
          <DollarSign className="h-6 w-6" />
        </div>
      </div>

      <div className="mb-4">
        <AvisoBorrador />
      </div>

      {error && (
        <Aviso variante="peligro" className="mb-4">
          {error}
        </Aviso>
      )}

      {/* Opciones de cobro apiladas de 56 px */}
      <div className="flex flex-col gap-2">
        {/* Opción 1: No, lo paga después */}
        <button
          type="button"
          onClick={() => setOpcion("despues")}
          className={`flex h-14 w-full items-center justify-between rounded-lg px-4 text-left shadow-sm transition-all active:scale-[0.99] ${
            opcion === "despues"
              ? "border-2 border-marca bg-marca-suave text-marca font-semibold"
              : "border border-borde bg-superficie text-tinta font-medium"
          }`}
        >
          <span className="text-sm">No, lo paga después</span>
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full ${
              opcion === "despues" ? "bg-marca" : "border border-borde bg-fondo"
            }`}
          >
            {opcion === "despues" && (
              <div className="h-2 w-2 rounded-full bg-superficie" />
            )}
          </div>
        </button>

        {/* Opción 2: Efectivo */}
        <button
          type="button"
          onClick={() => setOpcion("efectivo")}
          className={`flex h-14 w-full items-center justify-between rounded-lg px-4 text-left shadow-sm transition-all active:scale-[0.99] ${
            opcion === "efectivo"
              ? "border-2 border-marca bg-marca-suave text-marca font-semibold"
              : "border border-borde bg-superficie text-tinta font-medium"
          }`}
        >
          <span className="text-sm">Efectivo</span>
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full ${
              opcion === "efectivo"
                ? "bg-marca"
                : "border border-borde bg-fondo"
            }`}
          >
            {opcion === "efectivo" && (
              <div className="h-2 w-2 rounded-full bg-superficie" />
            )}
          </div>
        </button>

        {/* Opción 3: Cheque */}
        <button
          type="button"
          onClick={() => setOpcion("cheque")}
          className={`flex h-14 w-full items-center justify-between rounded-lg px-4 text-left shadow-sm transition-all active:scale-[0.99] ${
            opcion === "cheque"
              ? "border-2 border-marca bg-marca-suave text-marca font-semibold"
              : "border border-borde bg-superficie text-tinta font-medium"
          }`}
        >
          <span className="text-sm">Cheque</span>
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full ${
              opcion === "cheque" ? "bg-marca" : "border border-borde bg-fondo"
            }`}
          >
            {opcion === "cheque" && (
              <div className="h-2 w-2 rounded-full bg-superficie" />
            )}
          </div>
        </button>
      </div>

      {/* Sección condicional para Efectivo o Cheque */}
      {opcion !== "despues" && (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-tinta-suave">
              Monto recibido
            </label>
            <div className="relative flex h-14 w-full items-center rounded-lg border border-borde bg-superficie px-3 shadow-sm focus-within:border-marca">
              <span className="mr-2 select-none text-xl font-semibold text-tinta-suave">
                $
              </span>
              <EntradaMonto
                valor={monto}
                onChange={setMonto}
                placeholder="0"
                className="!h-12 !border-0 !pl-0 !text-xl !font-semibold !shadow-none focus:!ring-0"
              />
            </div>
          </div>

          {/* Campos específicos de Cheque */}
          {opcion === "cheque" && (
            <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-3 shadow-sm">
              <Campo etiqueta="Número de cheque" id="num-cheque">
                <Entrada
                  id="num-cheque"
                  placeholder="Ej: 00482910"
                  value={numeroCheque}
                  onChange={(e) => setNumeroCheque(e.target.value)}
                />
              </Campo>

              <Campo etiqueta="Banco" id="banco-cheque">
                <Entrada
                  id="banco-cheque"
                  placeholder="Ej: Galicia"
                  value={bancoCheque}
                  onChange={(e) => setBancoCheque(e.target.value)}
                />
              </Campo>

              <Campo etiqueta="Fecha de pago" id="fecha-pago-cheque">
                <Entrada
                  id="fecha-pago-cheque"
                  type="date"
                  value={fechaPagoCheque}
                  onChange={(e) => setFechaPagoCheque(e.target.value)}
                />
              </Campo>
            </div>
          )}

          {/* Botón secundario para foto del comprobante */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={manejarSeleccionFoto}
            />

            {!fotoArchivo ? (
              <Boton
                type="button"
                variante="secundario"
                tamano="lg"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-5 w-5 text-marca" />
                <span>Sacar foto del comprobante</span>
              </Boton>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-ok/30 bg-ok-suave p-3 text-sm text-ok">
                <div className="flex items-center gap-2 overflow-hidden">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="truncate font-mono text-xs">
                    {fotoArchivo.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={quitarFoto}
                  className="p-1 text-tinta-suave hover:text-peligro"
                  aria-label="Quitar foto"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botón de acción principal */}
      <div className="mt-6">
        {registrado ? (
          <div className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-ok font-semibold text-white shadow-md">
            <CheckCircle2 className="h-6 w-6" />
            <span>Cobro registrado</span>
          </div>
        ) : (
          <Boton
            type="button"
            tamano="lg"
            className="w-full shadow-md"
            disabled={guardando}
            onClick={manejarGuardar}
          >
            {guardando ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <span>Listo</span>
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </Boton>
        )}
        <p className="mt-3 text-center text-xs text-tinta-tenue">
          Al guardar, el servicio queda registrado y notifica a despacho.
        </p>
      </div>
    </div>
  );
}
