import { calcularTotales, type TotalesFactura } from "./facturacion";
import { formatearPesos } from "./formato";
import type { Empresa, Servicio, TipoServicio } from "./tipos";
import { ETIQUETA_TIPO, formatearUnidadPlural } from "./tipos";

export interface ArmarCondicionesParams {
  empresa:
    | Pick<
        Empresa,
        | "presupuesto_espera_autoelevador"
        | "presupuesto_espera_camion"
        | "precio_hora_espera_camion"
        | "precio_hora_espera_autoelevador"
      >
    | Partial<Empresa>;
  servicio: Pick<Servicio, "tipo" | "aplica_iva"> | Partial<Servicio>;
  validezDias: number;
  extra?: string | null;
}

export interface ItemPresupuesto {
  descripcion: string;
  detalle: string;
  cantidad: string;
  precioUnitario: number;
  importe: number;
}

export function formatearNumeroPresupuesto(numero: number | string | null | undefined): string {
  const n = Math.max(0, Math.floor(Number(numero) || 0));
  return `N° ${String(n).padStart(4, "0")}`;
}

export function armarCondiciones({
  empresa,
  servicio,
  validezDias,
  extra,
}: ArmarCondicionesParams): string[] {
  const lineas: string[] = [];

  // Validez
  lineas.push(`Validez: ${validezDias} días corridos.`);

  // Moneda e IVA
  if (servicio.aplica_iva) {
    lineas.push("Precios en pesos argentinos, sin IVA.");
  } else {
    lineas.push("Precios en pesos argentinos.");
  }

  // Forma de pago
  if (servicio.tipo === "alquiler_periodo") {
    lineas.push("Forma de pago: según plazo acordado.");
  } else {
    lineas.push("Forma de pago: al finalizar el servicio.");
  }

  // Cláusula de espera según tipo
  if (servicio.tipo === "alquiler_hora") {
    if (empresa.precio_hora_espera_autoelevador != null) {
      lineas.push(`La hora de espera se cobra ${formatearPesos(empresa.precio_hora_espera_autoelevador)}.`);
    } else if (empresa.presupuesto_espera_autoelevador && empresa.presupuesto_espera_autoelevador.trim()) {
      lineas.push(empresa.presupuesto_espera_autoelevador.trim());
    }
  } else if (servicio.tipo === "traslado") {
    if (empresa.precio_hora_espera_camion != null) {
      lineas.push(`La hora de espera del camión se cobra ${formatearPesos(empresa.precio_hora_espera_camion)}.`);
    }
  }

  // Extra si tiene texto
  if (extra && extra.trim()) {
    lineas.push(extra.trim());
  }

  return lineas;
}

export function armarItems(servicio: Partial<Servicio> & {
  alquiler?: Servicio["alquileres"];
}): ItemPresupuesto[] {
  let cantidad = "1";
  let precioUnitario = Number(servicio.monto) || 0;
  const importe = Number(servicio.monto) || 0;

  const datosAlquiler = servicio.alquileres ?? servicio.alquiler;

  if (servicio.tipo === "alquiler_periodo" && datosAlquiler) {
    const unidadTexto = formatearUnidadPlural(datosAlquiler.unidad, datosAlquiler.cantidad);
    cantidad = `${datosAlquiler.cantidad} ${unidadTexto}`;
    precioUnitario = Number(datosAlquiler.precio_unidad) || 0;
  }

  // Descripción: ETIQUETA_TIPO + carga si hay ("Traslado de autoelevador 2,5 t")
  const tipoLabel = servicio.tipo ? (ETIQUETA_TIPO[servicio.tipo as TipoServicio] ?? servicio.tipo) : "Servicio";
  let descripcion = tipoLabel;
  if (servicio.carga && servicio.carga.trim()) {
    const cargaLimpia = servicio.carga.trim();
    if (/^de\s+/i.test(cargaLimpia)) {
      descripcion = `${tipoLabel} ${cargaLimpia}`;
    } else {
      descripcion = `${tipoLabel} de ${cargaLimpia}`;
    }
  }
  if (servicio.nocturno) {
    descripcion = `${descripcion} (servicio nocturno)`;
  }

  // Detalle: origen → destino, km e ida y vuelta, vehículo, según lo que exista
  const partesTrayecto: string[] = [];
  if (servicio.origen && servicio.destino) {
    partesTrayecto.push(`${servicio.origen} → ${servicio.destino}`);
  } else if (servicio.origen) {
    partesTrayecto.push(`Origen: ${servicio.origen}`);
  } else if (servicio.destino) {
    partesTrayecto.push(`Destino: ${servicio.destino}`);
  }

  let modalidad = "";
  if (servicio.km != null && servicio.ida_y_vuelta) {
    modalidad = `ida y vuelta (${servicio.km} km)`;
  } else if (servicio.km != null) {
    modalidad = `${servicio.km} km`;
  } else if (servicio.ida_y_vuelta) {
    modalidad = "ida y vuelta";
  }

  const trayectoStr = partesTrayecto.join("");
  let recorridoYDistancia = "";
  if (trayectoStr && modalidad) {
    recorridoYDistancia = `${trayectoStr}, ${modalidad}`;
  } else {
    recorridoYDistancia = trayectoStr || modalidad;
  }

  const nombreVehiculo = servicio.vehiculos?.nombre;
  let detalle = "";
  if (recorridoYDistancia && nombreVehiculo) {
    detalle = `${recorridoYDistancia} · ${nombreVehiculo}`;
  } else if (recorridoYDistancia) {
    detalle = recorridoYDistancia;
  } else if (nombreVehiculo) {
    detalle = nombreVehiculo;
  } else if (servicio.descripcion && servicio.descripcion.trim()) {
    detalle = servicio.descripcion.trim();
  }

  return [
    {
      descripcion,
      detalle,
      cantidad,
      precioUnitario,
      importe,
    },
  ];
}

export function calcularTotalesPresupuesto(
  servicio: Pick<Servicio, "monto" | "aplica_iva"> | Partial<Servicio>
): TotalesFactura {
  return calcularTotales([{ monto: servicio.monto, aplica_iva: servicio.aplica_iva }]);
}

export function formatearFechaLarga(fechaIsoOObjeto?: string | Date | null): string {
  const d = !fechaIsoOObjeto
    ? new Date()
    : typeof fechaIsoOObjeto === "string"
      ? new Date(fechaIsoOObjeto.length === 10 ? `${fechaIsoOObjeto}T00:00:00` : fechaIsoOObjeto)
      : fechaIsoOObjeto;

  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function normalizarTelefonoWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, "");
  if (!digitos) return null;

  if (digitos.startsWith("549")) {
    return digitos;
  }
  if (digitos.startsWith("54")) {
    return `549${digitos.slice(2)}`;
  }

  let local = digitos;
  if (local.startsWith("0")) {
    local = local.slice(1);
  }
  return `549${local}`;
}
