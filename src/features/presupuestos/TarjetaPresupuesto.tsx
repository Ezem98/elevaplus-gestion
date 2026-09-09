import { useEffect, useState } from "react";
import { Download, Mail, MessageCircle, ExternalLink } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { supabase } from "@/lib/supabase";
import type { Alquiler, Empresa, Servicio } from "@/lib/tipos";
import {
  armarCondiciones,
  armarItems,
  formatearNumeroPresupuesto,
  normalizarTelefonoWhatsApp,
} from "@/lib/presupuesto";
import { PresupuestoPDF } from "./PresupuestoPDF";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Campo, Entrada, AreaTexto } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";
import { BarraAcciones } from "@/components/ui/BarraAcciones";
import { Aviso } from "@/components/ui/Aviso";

export interface TarjetaPresupuestoProps {
  servicio: Servicio;
  empresa: Empresa | null;
  alquiler: Alquiler | null;
  onActualizado: () => Promise<void>;
  ocultarAcciones?: boolean;
}

function formatearFechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const horas = String(d.getHours()).padStart(2, "0");
  const minutos = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes} ${horas}:${minutos}`;
}

export function TarjetaPresupuesto({
  servicio,
  empresa,
  alquiler,
  onActualizado,
  ocultarAcciones = false,
}: TarjetaPresupuestoProps) {
  const [validezDias, setValidezDias] = useState<number>(() => {
    return servicio.presupuesto_validez_dias ?? empresa?.presupuesto_validez_dias ?? 15;
  });

  const [condicionesExtra, setCondicionesExtra] = useState<string>(() => {
    return servicio.presupuesto_condiciones ?? empresa?.presupuesto_condiciones_extra ?? "";
  });

  const [urlFirmada, setUrlFirmada] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  // Sincronizar si cambian los datos de servicio o empresa
  useEffect(() => {
    if (servicio.presupuesto_validez_dias != null) {
      setValidezDias(servicio.presupuesto_validez_dias);
    } else if (empresa?.presupuesto_validez_dias != null) {
      setValidezDias(empresa.presupuesto_validez_dias);
    }

    if (servicio.presupuesto_condiciones != null) {
      setCondicionesExtra(servicio.presupuesto_condiciones);
    } else if (empresa?.presupuesto_condiciones_extra != null) {
      setCondicionesExtra(empresa.presupuesto_condiciones_extra);
    }
  }, [
    servicio.presupuesto_validez_dias,
    servicio.presupuesto_condiciones,
    empresa?.presupuesto_validez_dias,
    empresa?.presupuesto_condiciones_extra,
  ]);

  // Cargar URL firmada si ya se generó antes
  useEffect(() => {
    let activo = true;

    async function cargarUrlFirmada() {
      if (!servicio.presupuesto_pdf_path) {
        setUrlFirmada(null);
        return;
      }

      const { data, error } = await supabase.storage
        .from("adjuntos")
        .createSignedUrl(servicio.presupuesto_pdf_path, 7 * 24 * 60 * 60);

      if (activo && !error && data?.signedUrl) {
        setUrlFirmada(data.signedUrl);
      }
    }

    cargarUrlFirmada();

    return () => {
      activo = false;
    };
  }, [servicio.presupuesto_pdf_path, servicio.presupuesto_generado_at]);

  const tieneMonto = servicio.monto != null && Number(servicio.monto) > 0;
  const telefonoNormalizado = normalizarTelefonoWhatsApp(servicio.clientes?.telefono);
  const tieneTelefono = Boolean(telefonoNormalizado);
  const tieneEmail = Boolean(servicio.clientes?.email?.trim());

  // Vista previa de condiciones
  const condicionesPreview = empresa
    ? armarCondiciones({
        empresa,
        servicio,
        validezDias,
        extra: condicionesExtra,
      })
    : [];

  const armarNombreArchivo = () => {
    const numPad = String(servicio.numero).padStart(4, "0");
    const primerNombre = servicio.clientes?.nombre
      ? servicio.clientes.nombre.trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, "")
      : "";
    const sufijo = primerNombre ? `-${primerNombre}` : "";
    return `Presupuesto-${numPad}${sufijo}.pdf`;
  };

  const generarBlobPDF = async (): Promise<Blob> => {
    if (!empresa) {
      throw new Error("No se pudieron cargar los datos de la empresa.");
    }

    const doc = (
      <PresupuestoPDF
        empresa={empresa}
        servicio={{
          ...servicio,
          presupuesto_validez_dias: validezDias,
          presupuesto_condiciones: condicionesExtra,
          alquileres: alquiler,
        }}
        validezDias={validezDias}
        extra={condicionesExtra}
      />
    );

    return await pdf(doc).toBlob();
  };

  const subirYGuardar = async (blob: Blob): Promise<{ storagePath: string; urlFirmada: string }> => {
    const storagePath = `presupuestos/${servicio.id}/presupuesto-${servicio.numero}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("adjuntos")
      .upload(storagePath, blob, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Error al guardar el PDF: ${uploadError.message}`);
    }

    const fechaGenerado = new Date().toISOString();

    const { error: updError } = await supabase
      .from("servicios")
      .update({
        presupuesto_validez_dias: validezDias,
        presupuesto_condiciones: condicionesExtra.trim() || null,
        presupuesto_pdf_path: storagePath,
        presupuesto_generado_at: fechaGenerado,
      })
      .eq("id", servicio.id);

    if (updError) {
      throw new Error(`Error al actualizar el servicio: ${updError.message}`);
    }

    // Si está en consulta, avanzar a presupuestado mediante RPC
    if (servicio.estado === "consulta") {
      const { error: rpcError } = await supabase.rpc("cambiar_estado", {
        p_servicio_id: servicio.id,
        p_nuevo: "presupuestado",
        p_nota: "Presupuesto generado",
      });

      if (rpcError) {
        throw new Error(`Error al cambiar estado: ${rpcError.message}`);
      }
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from("adjuntos")
      .createSignedUrl(storagePath, 7 * 24 * 60 * 60);

    if (signedError || !signedData?.signedUrl) {
      throw new Error("Error al generar la URL de descarga.");
    }

    setUrlFirmada(signedData.signedUrl);

    return {
      storagePath,
      urlFirmada: signedData.signedUrl,
    };
  };

  const armarTextoMensaje = (link: string): string => {
    const items = armarItems({ ...servicio, alquileres: alquiler });
    const descripcionCorta = items[0]?.descripcion || servicio.descripcion || "el servicio";
    const numeroFormateado = formatearNumeroPresupuesto(servicio.numero);

    return `Hola, te paso el presupuesto ${numeroFormateado} de ELEVAPLUS por ${descripcionCorta}: ${link}. Cualquier duda, escribime. ¡Gracias!`;
  };

  const handleDescargar = async () => {
    try {
      setProcesando(true);
      setErrorAccion(null);

      const blob = await generarBlobPDF();

      // Disparar descarga local inmediatamente
      const nombreArchivo = armarNombreArchivo();
      const urlBlob = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = nombreArchivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(urlBlob);

      // Guardar también en storage y en el servicio
      await subirYGuardar(blob);
      await onActualizado();
    } catch (err: any) {
      setErrorAccion(err.message || "No se pudo descargar el presupuesto.");
    } finally {
      setProcesando(false);
    }
  };

  const handleEnviarWhatsApp = async () => {
    try {
      if (!telefonoNormalizado) return;
      setProcesando(true);
      setErrorAccion(null);

      const blob = await generarBlobPDF();
      const { urlFirmada: link } = await subirYGuardar(blob);
      await onActualizado();

      const mensaje = armarTextoMensaje(link);
      const waUrl = `https://wa.me/${telefonoNormalizado}?text=${encodeURIComponent(mensaje)}`;
      window.open(waUrl, "_blank");
    } catch (err: any) {
      setErrorAccion(err.message || "No se pudo enviar por WhatsApp.");
    } finally {
      setProcesando(false);
    }
  };

  const handleEnviarMail = async () => {
    try {
      const email = servicio.clientes?.email?.trim();
      if (!email) return;

      setProcesando(true);
      setErrorAccion(null);

      const blob = await generarBlobPDF();
      const { urlFirmada: link } = await subirYGuardar(blob);
      await onActualizado();

      const numeroFormateado = formatearNumeroPresupuesto(servicio.numero);
      const mensaje = armarTextoMensaje(link);
      const asunto = `Presupuesto ${numeroFormateado} - ELEVAPLUS`;
      const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;
      window.open(mailtoUrl, "_blank");
    } catch (err: any) {
      setErrorAccion(err.message || "No se pudo enviar por correo.");
    } finally {
      setProcesando(false);
    }
  };

  return (
    <Tarjeta className="p-5 space-y-4 pb-[72px] md:pb-5">
      <div className="flex items-center justify-between pb-3 border-b border-borde">
        <h2 className="text-base font-semibold text-tinta">Presupuesto</h2>
        {servicio.presupuesto_generado_at && (
          <div className="flex items-center gap-1.5 text-xs text-tinta-suave">
            <span>
              Última versión generada el {formatearFechaHora(servicio.presupuesto_generado_at)}
            </span>
            {urlFirmada && (
              <a
                href={urlFirmada}
                target="_blank"
                rel="noopener noreferrer"
                className="text-marca hover:underline inline-flex items-center gap-0.5 ml-1 font-medium"
              >
                <span>Ver PDF</span>
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Formulario de parámetros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Campo etiqueta="Validez (días)" id="validez_dias">
            <Entrada
              id="validez_dias"
              type="number"
              min="1"
              max="90"
              value={validezDias}
              onChange={(e) => setValidezDias(Number(e.target.value) || 0)}
              disabled={procesando}
            />
          </Campo>
        </div>

        <div className="md:col-span-2">
          <Campo etiqueta="Condiciones adicionales (opcional)" id="condiciones_extra">
            <AreaTexto
              id="condiciones_extra"
              rows={2}
              placeholder="Ej: Seguro a cargo del cliente, operador provisto, etc."
              value={condicionesExtra}
              onChange={(e) => setCondicionesExtra(e.target.value)}
              disabled={procesando}
            />
          </Campo>
        </div>
      </div>

      {/* Vista previa de condiciones */}
      {condicionesPreview.length > 0 && (
        <div className="rounded-md border border-borde bg-fondo p-3 text-xs text-tinta-suave space-y-1.5">
          <span className="font-semibold text-tinta block">Vista previa de condiciones:</span>
          {condicionesPreview.map((linea, idx) => (
            <div key={idx} className="flex items-start gap-1.5">
              <span className="text-tinta-tenue select-none">•</span>
              <span>{linea}</span>
            </div>
          ))}
        </div>
      )}

      {/* Alerta si no tiene monto */}
      {!tieneMonto && (
        <Aviso variante="alerta">
          Cargá el monto para generar el presupuesto.
        </Aviso>
      )}

      {errorAccion && (
        <Aviso variante="peligro">
          {errorAccion}
        </Aviso>
      )}

      {/* Botones de acción */}
      {!ocultarAcciones && (
        <BarraAcciones>
          <Boton
            variante="secundario"
            onClick={handleEnviarMail}
            disabled={!tieneMonto || procesando || !tieneEmail}
            title={!tieneEmail ? "El cliente no tiene email cargado" : undefined}
          >
            <Mail className="size-4 text-sky-600" />
            <span className="hidden sm:inline">Enviar por </span>Mail
          </Boton>

          <Boton
            variante="secundario"
            onClick={handleEnviarWhatsApp}
            disabled={!tieneMonto || procesando || !tieneTelefono}
            title={!tieneTelefono ? "El cliente no tiene teléfono cargado" : undefined}
          >
            <MessageCircle className="size-4 text-emerald-600" />
            <span className="hidden sm:inline">Enviar por </span>WhatsApp
          </Boton>

          <Boton
            variante="primario"
            onClick={handleDescargar}
            disabled={!tieneMonto || procesando}
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Descargar </span>PDF
          </Boton>
        </BarraAcciones>
      )}
    </Tarjeta>
  );
}
