import { obtenerInstanciaAfip, type AmbienteArca, registrarLogArca } from "./cliente";
import { supabaseAdmin } from "../supabase";

export interface DatosPadronArca {
  cuit: string;
  razon_social: string;
  condicion_iva: "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final";
  domicilio: string;
  activo: boolean;
}

interface CacheItem {
  datos: DatosPadronArca;
  expiraAt: number;
}

// Cache en memoria por CUIT (24 horas)
const cachePadron = new Map<string, CacheItem>();
const DURACION_CACHE_MS = 24 * 60 * 60 * 1000;

/**
 * Función pura que normaliza la respuesta del web service de constancia de inscripción de ARCA.
 */
export function parsearRespuestaPadron(cuit: string, res: any): DatosPadronArca | null {
  if (!res) return null;

  const datosGen = res.datosGenerales || res;
  if (!datosGen) return null;

  // Razón social o Nombre y Apellido
  const razonSocial =
    datosGen.razonSocial ||
    [datosGen.apellido, datosGen.nombre].filter(Boolean).join(" ") ||
    datosGen.nombre ||
    "";

  // Domicilio fiscal
  const domFiscal = datosGen.domicilioFiscal;
  let domicilio = "";
  if (domFiscal) {
    if (typeof domFiscal === "string") {
      domicilio = domFiscal;
    } else {
      const partes = [domFiscal.direccion, domFiscal.localidad, domFiscal.descripcionProvincia || domFiscal.provincia].filter(Boolean);
      domicilio = partes.join(", ");
    }
  }

  // Estado de la clave (activo / inactivo)
  const estadoClave = String(datosGen.estadoClave || "").toUpperCase();
  const activo = estadoClave === "ACTIVO" || estadoClave === "" || !datosGen.estadoClave;

  // Determinar condición de IVA
  let condicionIva: "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" = "consumidor_final";

  if (res.datosMonotributo || datosGen.esMonotributo) {
    condicionIva = "monotributo";
  } else if (res.datosRegimenGeneral) {
    const impuestos = res.datosRegimenGeneral.impuesto || [];
    const listaImpuestos = Array.isArray(impuestos) ? impuestos : [impuestos];

    const tieneIvaExento = listaImpuestos.some(
      (imp: any) =>
        imp.idImpuesto === 32 ||
        String(imp.descripcionImpuesto || "").toUpperCase().includes("EXENTO")
    );

    const tieneIvaInscripto = listaImpuestos.some(
      (imp: any) =>
        imp.idImpuesto === 30 ||
        String(imp.descripcionImpuesto || "").toUpperCase().includes("VALOR AGREGADO") ||
        String(imp.descripcionImpuesto || "").toUpperCase().includes("IVA")
    );

    if (tieneIvaExento) {
      condicionIva = "exento";
    } else if (tieneIvaInscripto) {
      condicionIva = "responsable_inscripto";
    }
  }

  return {
    cuit: cuit.replace(/\D/g, ""),
    razon_social: razonSocial.trim(),
    condicion_iva: condicionIva,
    domicilio: domicilio.trim(),
    activo,
  };
}

/**
 * Consulta el padrón de contribuyentes de ARCA con caché de 24 horas.
 */
export async function consultarPadron(cuitInput: string): Promise<DatosPadronArca | null> {
  const cuitLimpio = cuitInput.replace(/\D/g, "");
  if (!cuitLimpio || cuitLimpio.length < 10) {
    throw new Error("CUIT inválido.");
  }

  // 1. Revisar caché en memoria
  const cached = cachePadron.get(cuitLimpio);
  if (cached && cached.expiraAt > Date.now()) {
    return cached.datos;
  }

  // 2. Obtener ambiente de empresa
  const { data: empresa } = await supabaseAdmin
    .from("empresa")
    .select("arca_ambiente")
    .limit(1)
    .single();

  const ambienteArca: AmbienteArca = (empresa?.arca_ambiente as AmbienteArca) || "homologacion";
  const afip = obtenerInstanciaAfip({ ambiente: ambienteArca });
  const inicio = Date.now();

  try {
    const taxIdNum = Number(cuitLimpio);
    const taxpayerDetails = await afip.RegisterInscriptionProof.getTaxpayerDetails(taxIdNum);
    const duracion = Date.now() - inicio;

    await registrarLogArca({
      accion: "consultar_padron",
      ambiente: ambienteArca,
      request: { cuit: taxIdNum },
      response: taxpayerDetails,
      exito: Boolean(taxpayerDetails),
      duracion_ms: duracion,
    });

    if (!taxpayerDetails) {
      return null;
    }

    const resultado = parsearRespuestaPadron(cuitLimpio, taxpayerDetails);
    if (resultado) {
      // Guardar en caché
      cachePadron.set(cuitLimpio, {
        datos: resultado,
        expiraAt: Date.now() + DURACION_CACHE_MS,
      });
    }

    return resultado;
  } catch (error: any) {
    const duracion = Date.now() - inicio;
    await registrarLogArca({
      accion: "consultar_padron",
      ambiente: ambienteArca,
      request: { cuit: cuitLimpio },
      response: { error: error?.message || String(error) },
      exito: false,
      duracion_ms: duracion,
    });

    throw error;
  }
}
