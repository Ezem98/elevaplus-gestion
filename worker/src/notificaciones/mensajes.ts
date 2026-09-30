export interface DatosViajeNotificacion {
  fecha: string;
  hora?: string | null;
  cliente: string;
  origen?: string | null;
  destino?: string | null;
}

export interface ViajeResumenChofer {
  hora?: string | null;
  cliente: string;
}

export interface MensajePush {
  titulo: string;
  cuerpo: string;
  textoCompleto: string;
}

/**
 * Simplifica la razón social eliminando tipos societarios comunes al final (S.A., SRL, etc.)
 * para que en los resúmenes compactos quede 'Huma', 'Deza', etc.
 */
export function simplificarNombreCliente(nombre: string): string {
  if (!nombre) return "";
  const recortado = nombre.trim();
  const limpio = recortado
    .replace(/\s+(?:S\.?A\.?S\.?|S\.?R\.?L\.?|S\.?A\.?|S\.?H\.?)$/i, "")
    .trim();
  return limpio || recortado;
}

/**
 * Retorna el día de la semana y fecha en formato rioplatense (ej. 'jueves 2/10').
 */
export function formatearDiaYFecha(isoFecha: string): string {
  const [y, m, d] = isoFecha.split("-").map(Number);
  const dias = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  const diaSemana = dias[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${diaSemana} ${d}/${m}`;
}

export function formatearHora(hora?: string | null): string {
  if (!hora) return "";
  return hora.slice(0, 5);
}

export function armarDetalleTrayecto(
  origen?: string | null,
  destino?: string | null,
): string {
  if (origen && destino) {
    return `${origen} → ${destino}`;
  }
  if (destino) {
    return destino;
  }
  if (origen) {
    return origen;
  }
  return "";
}

/**
 * Mensaje al asignar un servicio programado:
 * "Nuevo viaje: jueves 2/10 08:00 · Huma S.A. · Burzaco → Avellaneda"
 */
export function armarMensajeNuevoViaje(datos: DatosViajeNotificacion): MensajePush {
  const diaFecha = formatearDiaYFecha(datos.fecha);
  const hora = formatearHora(datos.hora);
  const fechaHora = hora ? `${diaFecha} ${hora}` : diaFecha;
  const cliente = datos.cliente.trim();
  const trayecto = armarDetalleTrayecto(datos.origen, datos.destino);

  const partes = [fechaHora, cliente, trayecto].filter(Boolean);
  const cuerpo = partes.join(" · ");
  const titulo = "Nuevo viaje";
  const textoCompleto = `${titulo}: ${cuerpo}`;

  return {
    titulo,
    cuerpo,
    textoCompleto,
  };
}

/**
 * Mensaje al reprogramar la fecha de un viaje:
 * "Cambió el viaje de Huma S.A.: jueves 2/10 08:00 · Burzaco → Avellaneda"
 */
export function armarMensajeViajeModificado(
  datos: DatosViajeNotificacion,
): MensajePush {
  const diaFecha = formatearDiaYFecha(datos.fecha);
  const hora = formatearHora(datos.hora);
  const fechaHora = hora ? `${diaFecha} ${hora}` : diaFecha;
  const cliente = datos.cliente.trim();
  const trayecto = armarDetalleTrayecto(datos.origen, datos.destino);

  const partesCuerpo = [fechaHora, trayecto].filter(Boolean);
  const cuerpo = partesCuerpo.join(" · ");
  const titulo = `Cambió el viaje de ${cliente}`;
  const textoCompleto = `${titulo}: ${cuerpo}`;

  return {
    titulo,
    cuerpo,
    textoCompleto,
  };
}

/**
 * Resumen del día para el chofer a las 7:00 hs:
 * "Hoy tenés 2 viajes: 08:00 Huma · 14:00 Deza"
 * Retorna null si no tiene viajes (sin viajes, nada).
 */
export function armarResumenDiaChofer(
  viajes: ViajeResumenChofer[],
): MensajePush | null {
  if (!viajes || viajes.length === 0) {
    return null;
  }

  const items = viajes.map((v) => {
    const hora = formatearHora(v.hora);
    const clienteCorto = simplificarNombreCliente(v.cliente);
    return hora ? `${hora} ${clienteCorto}` : clienteCorto;
  });

  const cant = viajes.length;
  const titulo = cant === 1 ? "Hoy tenés 1 viaje" : `Hoy tenés ${cant} viajes`;
  const cuerpo = items.join(" · ");
  const textoCompleto = `${titulo}: ${cuerpo}`;

  return {
    titulo,
    cuerpo,
    textoCompleto,
  };
}

/**
 * Arma el título del push de recordatorio a oficina considerando vencimientos y servicios sin chofer.
 */
export function armarTituloRecordatorioHoy(
  cantVencimientos: number,
  cantServiciosSinChofer: number,
): string {
  if (cantVencimientos > 0 && cantServiciosSinChofer > 0) {
    const textoVenc =
      cantVencimientos === 1 ? "1 vencimiento" : `${cantVencimientos} vencimientos`;
    const textoSinChofer =
      cantServiciosSinChofer === 1
        ? "1 servicio sin chofer"
        : `${cantServiciosSinChofer} servicios sin chofer`;
    return `Hoy tenés ${textoVenc} y ${textoSinChofer}`;
  }
  if (cantVencimientos > 0) {
    return `Hoy tenés ${cantVencimientos} ${
      cantVencimientos === 1 ? "vencimiento" : "vencimientos"
    }`;
  }
  if (cantServiciosSinChofer > 0) {
    return `Hoy tenés ${cantServiciosSinChofer} ${
      cantServiciosSinChofer === 1
        ? "servicio sin chofer"
        : "servicios sin chofer"
    }`;
  }
  return "Sin compromisos para hoy";
}
