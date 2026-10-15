export interface EstadoChat {
  conversacionId: string | null;
  texto: string;
}

const VACIO: EstadoChat = { conversacionId: null, texto: "" };

const clave = (usuarioId: string) => `chimuelo_${usuarioId}`;

/**
 * Lee la conversación abierta y el texto a medio escribir de esta pestaña.
 * Se usa sessionStorage: sobrevive a una recarga o a que el celular descarte la
 * app en segundo plano, pero no se comparte entre pestañas ni queda al cerrarla.
 */
export function leerEstadoChat(usuarioId: string): EstadoChat {
  try {
    const crudo = sessionStorage.getItem(clave(usuarioId));
    if (!crudo) return VACIO;
    const datos = JSON.parse(crudo) as Partial<EstadoChat>;
    return {
      conversacionId: typeof datos.conversacionId === "string" ? datos.conversacionId : null,
      texto: typeof datos.texto === "string" ? datos.texto : "",
    };
  } catch {
    return VACIO;
  }
}

export function guardarEstadoChat(usuarioId: string, estado: EstadoChat) {
  try {
    if (!estado.conversacionId && !estado.texto) {
      sessionStorage.removeItem(clave(usuarioId));
      return;
    }
    sessionStorage.setItem(clave(usuarioId), JSON.stringify(estado));
  } catch {
    // sessionStorage no disponible (modo privado): seguimos sin persistir
  }
}
