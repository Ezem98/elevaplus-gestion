import { Resend } from "resend";
import { config } from "../config";

export interface ParametrosEnvioMailResend {
  para: string;
  asunto: string;
  texto: string;
  html: string;
  nombreAdjunto: string;
  contenidoAdjunto: Buffer;
  replyTo?: string;
}

export interface ResultadoEnvioMail {
  exito: boolean;
  id?: string;
  destinatario: string;
  motivo?: string;
}

/**
 * Filtra el destinatario según el ambiente y la lista blanca configurada en MAIL_LISTA_BLANCA.
 * En producción permite cualquier dirección válida.
 * En staging / desarrollo solo permite destinatarios incluidos explícitamente en la lista blanca.
 */
export function filtrarDestinatarioPorListaBlanca(
  emailDestino: string,
  ambiente: string = config.NODE_ENV,
  listaBlancaRaw: string = config.MAIL_LISTA_BLANCA
): { permitido: boolean; emailFinal?: string; motivo?: string } {
  if (ambiente === "production") {
    return { permitido: true, emailFinal: emailDestino };
  }

  if (!listaBlancaRaw || listaBlancaRaw.trim() === "") {
    return {
      permitido: false,
      motivo: "MAIL_LISTA_BLANCA no configurada en ambiente de pruebas.",
    };
  }

  const permitidos = listaBlancaRaw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const destinoLimpio = emailDestino.trim().toLowerCase();

  if (permitidos.includes(destinoLimpio)) {
    return { permitido: true, emailFinal: emailDestino };
  }

  return {
    permitido: false,
    motivo: `El destinatario '${emailDestino}' no está incluido en la lista blanca (${permitidos.join(", ")}).`,
  };
}

/**
 * Envía un correo electrónico con Resend adjuntando el archivo PDF.
 */
export async function enviarMailConResend(
  params: ParametrosEnvioMailResend
): Promise<ResultadoEnvioMail> {
  const { para, asunto, texto, html, nombreAdjunto, contenidoAdjunto, replyTo } = params;

  // 1. Validar lista blanca según ambiente
  const chequeoLista = filtrarDestinatarioPorListaBlanca(para);
  if (!chequeoLista.permitido) {
    console.warn(`[MAIL] Envío bloqueado por política de lista blanca: ${chequeoLista.motivo}`);
    return {
      exito: false,
      destinatario: para,
      motivo: chequeoLista.motivo,
    };
  }

  const emailDestino = chequeoLista.emailFinal || para;

  // 2. Si no hay RESEND_API_KEY configurada (modo desarrollo/mock)
  if (!config.RESEND_API_KEY || config.RESEND_API_KEY === "dummy_resend_key") {
    console.log(
      `[MAIL-MOCK] Simulación de envío: De: ${config.RESEND_REMITENTE} -> Para: ${emailDestino} | Asunto: "${asunto}" | Adjunto: ${nombreAdjunto} (${contenidoAdjunto.length} bytes)`
    );
    return {
      exito: true,
      id: `mock-${Date.now()}`,
      destinatario: emailDestino,
    };
  }

  // 3. Enviar con Resend SDK
  try {
    const resend = new Resend(config.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: config.RESEND_REMITENTE,
      to: [emailDestino],
      replyTo: replyTo || undefined,
      subject: asunto,
      text: texto,
      html,
      attachments: [
        {
          filename: nombreAdjunto,
          content: contenidoAdjunto,
        },
      ],
    });

    if (error) {
      console.error("[MAIL] Error retornado por Resend:", error);
      return {
        exito: false,
        destinatario: emailDestino,
        motivo: error.message,
      };
    }

    console.log(`[MAIL] Correo enviado exitosamente vía Resend. ID: ${data?.id}`);
    return {
      exito: true,
      id: data?.id,
      destinatario: emailDestino,
    };
  } catch (err: any) {
    console.error("[MAIL] Excepción al enviar correo con Resend:", err);
    return {
      exito: false,
      destinatario: emailDestino,
      motivo: err?.message || String(err),
    };
  }
}
