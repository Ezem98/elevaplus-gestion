import { calcularTotales, type TotalesFactura } from "./facturacion";
import { formatearMontoEntrada, formatearPesos } from "./formato";
import type { Empresa, EstadoPresupuesto, Servicio, TipoServicio } from "./tipos";
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
  servicio?:
    | Pick<Servicio, "tipo" | "aplica_iva" | "moneda">
    | Partial<Servicio>;
  servicios?: Array<
    Pick<Servicio, "tipo" | "aplica_iva" | "moneda"> | Partial<Servicio>
  >;
  validezDias: number;
  extra?: string | null;
}

export interface ItemPresupuesto {
  descripcion: string;
  detalle: string;
  cantidad: string;
  precioUnitario: number;
  importe: number;
  moneda?: "ARS" | "USD";
}

export function formatearNumeroPresupuesto(numero: number | string | null | undefined): string {
  const n = Math.max(0, Math.floor(Number(numero) || 0));
  return `N° ${String(n).padStart(4, "0")}`;
}

export function armarCondiciones({
  empresa,
  servicio,
  servicios,
  validezDias,
  extra,
}: ArmarCondicionesParams): string[] {
  const listaServicios = servicios ?? (servicio ? [servicio] : []);
  const lineas: string[] = [];

  // Validez
  lineas.push(`Validez: ${validezDias} días corridos.`);

  // Moneda e IVA
  const algunoConIva = listaServicios.some((s) => s.aplica_iva);
  const algunoUsd = listaServicios.some((s) => s.moneda === "USD");
  const algunoArs = listaServicios.some((s) => (s.moneda || "ARS") === "ARS");
  if (algunoUsd && algunoArs) {
    lineas.push(
      algunoConIva
        ? "Precios en pesos argentinos y dólares estadounidenses, sin IVA."
        : "Precios en pesos argentinos y dólares estadounidenses.",
    );
  } else if (algunoUsd) {
    lineas.push(
      algunoConIva
        ? "Precios en dólares estadounidenses, sin IVA."
        : "Precios en dólares estadounidenses.",
    );
  } else {
    if (algunoConIva) {
      lineas.push("Precios en pesos argentinos, sin IVA.");
    } else {
      lineas.push("Precios en pesos argentinos.");
    }
  }

  // Forma de pago
  const tieneAlquilerPeriodo = listaServicios.some((s) => s.tipo === "alquiler_periodo");
  if (tieneAlquilerPeriodo) {
    lineas.push("Forma de pago: según plazo acordado.");
  } else {
    lineas.push("Forma de pago: al finalizar el servicio.");
  }

  // Cláusula de espera según tipo
  const tieneAlquilerHora = listaServicios.some((s) => s.tipo === "alquiler_hora");
  const tieneTraslado = listaServicios.some((s) => s.tipo === "traslado");

  if (tieneAlquilerHora) {
    if (empresa.precio_hora_espera_autoelevador != null) {
      lineas.push(`La hora de espera se cobra ${formatearPesos(empresa.precio_hora_espera_autoelevador)}.`);
    } else if (empresa.presupuesto_espera_autoelevador && empresa.presupuesto_espera_autoelevador.trim()) {
      lineas.push(empresa.presupuesto_espera_autoelevador.trim());
    }
  }

  if (tieneTraslado) {
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
  const moneda = servicio.moneda === "USD" ? "USD" : "ARS";
  let importe =
    moneda === "USD" && servicio.monto_moneda != null
      ? Number(servicio.monto_moneda)
      : Number(servicio.monto) || 0;
  let cantidad = "1";
  let precioUnitario = importe;

  const datosAlquiler = servicio.alquileres ?? (servicio as any).alquiler;

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

  // Detalle: recorrido con paradas u origen → destino, km e ida y vuelta, vehículo, según lo que exista
  const partesTrayecto: string[] = [];
  if (servicio.paradas && servicio.paradas.length > 0) {
    const puntos: string[] = [];
    if (servicio.origen && servicio.origen.trim()) {
      puntos.push(servicio.origen.trim());
    }
    const paradasOrdenadas = [...servicio.paradas].sort((a, b) => a.orden - b.orden);
    for (const p of paradasOrdenadas) {
      if (p.direccion && p.direccion.trim()) {
        puntos.push(p.direccion.trim());
      }
    }
    if (puntos.length > 0) {
      partesTrayecto.push(puntos.join(" → "));
    }
  } else if (servicio.origen && servicio.destino) {
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

  const itemPrincipal: ItemPresupuesto = {
    descripcion,
    detalle,
    cantidad,
    precioUnitario,
    importe,
    ...(servicio.moneda ? { moneda: servicio.moneda } : {}),
  };

  if (
    servicio.tipo === "traslado" &&
    servicio.monto_seguro != null &&
    Number(servicio.monto_seguro) > 0
  ) {
    const montoSeguro = Number(servicio.monto_seguro);
    const montoServicio = Math.round((importe - montoSeguro) * 100) / 100;
    const itemServicio: ItemPresupuesto = {
      ...itemPrincipal,
      precioUnitario: montoServicio,
      importe: montoServicio,
    };
    const seguroImporteValor =
      servicio.seguro_importe != null ? servicio.seguro_importe : montoSeguro;
    const itemSeguro: ItemPresupuesto = {
      descripcion: `Seguro de carga (IVA incluido: $ ${formatearMontoEntrada(seguroImporteValor)})`,
      detalle: "",
      cantidad: "1",
      precioUnitario: montoSeguro,
      importe: montoSeguro,
      ...(servicio.moneda ? { moneda: servicio.moneda } : {}),
    };
    return [itemServicio, itemSeguro];
  }

  return [itemPrincipal];
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

export function normalizarTelefonoComparacion(telefono: string | null | undefined): string {
  if (!telefono) return "";
  let d = telefono.replace(/\D/g, "");
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.startsWith("15")) d = d.slice(2);
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, "$1$2");
  return d;
}

export function calcularEstadoPresupuesto(
  presupuestoOEstado:
    | EstadoPresupuesto
    | { estado: EstadoPresupuesto; fecha?: string | null; validez_dias?: number | null },
  fecha?: string,
  validezDias?: number
): EstadoPresupuesto {
  if (typeof presupuestoOEstado === "object" && presupuestoOEstado !== null) {
    return calcularEstadoPresupuesto(
      presupuestoOEstado.estado,
      presupuestoOEstado.fecha || new Date().toISOString().slice(0, 10),
      presupuestoOEstado.validez_dias ?? 15
    );
  }
  const estado = presupuestoOEstado;
  if (estado !== "enviado") return estado;
  const hoyLocal = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const f = new Date(`${fecha || hoyLocal}T00:00:00`);
  f.setDate(f.getDate() + (validezDias || 15));
  const vence = f.toISOString().slice(0, 10);
  if (vence < hoyLocal) {
    return "vencido";
  }
  return estado;
}

export function calcularFechaVencimiento(fecha: string, validezDias: number): string {
  const f = new Date(`${fecha}T00:00:00`);
  f.setDate(f.getDate() + (validezDias || 15));
  return f.toISOString().slice(0, 10);
}

export interface CoincidenciaCliente {
  cliente: {
    id: string;
    nombre: string;
    cuit?: string | null;
    telefono?: string | null;
    email?: string | null;
    direccion?: string | null;
    localidad?: string | null;
  };
  criterios: string[];
}

export function detectarCoincidenciasCliente(
  prospecto: {
    nombre?: string | null;
    cuit?: string | null;
    telefono?: string | null;
  },
  clientes: Array<{
    id: string;
    nombre: string;
    cuit?: string | null;
    telefono?: string | null;
    email?: string | null;
    direccion?: string | null;
    localidad?: string | null;
  }>
): CoincidenciaCliente[] {
  const resultados: CoincidenciaCliente[] = [];
  const cuitLimpio = prospecto.cuit?.replace(/\D/g, "") || "";
  const telLimpio = normalizarTelefonoComparacion(prospecto.telefono);
  const palabras = (prospecto.nombre || "")
    .toLowerCase()
    .split(/[\s,.-]+/)
    .filter((p) => p.length >= 3);

  for (const c of clientes) {
    const criterios: string[] = [];

    // 1. CUIT exacto
    const cCuit = c.cuit?.replace(/\D/g, "") || "";
    if (cuitLimpio && cCuit && cuitLimpio === cCuit) {
      criterios.push("Mismo CUIT");
    }

    // 2. Teléfono normalizado
    const cTel = normalizarTelefonoComparacion(c.telefono);
    if (telLimpio && cTel && telLimpio.length >= 6 && cTel.length >= 6 && telLimpio === cTel) {
      criterios.push("Mismo teléfono");
    }

    // 3. Nombre por palabras
    const cNombre = (c.nombre || "").toLowerCase();
    const coincidenPalabras = palabras.filter((p) => cNombre.includes(p));
    if (coincidenPalabras.length > 0) {
      criterios.push(`Nombre similar ("${coincidenPalabras.join('", "')}")`);
    }

    if (criterios.length > 0) {
      resultados.push({ cliente: c, criterios });
    }
  }

  return resultados;
}

export interface TotalesMonedaGrupo {
  moneda: "ARS" | "USD";
  neto: number;
  iva: number;
  total: number;
  tieneIva: boolean;
}

export function calcularTotalesAgrupadosPorMoneda(
  servicios: Array<{
    monto: number | null;
    aplica_iva: boolean;
    moneda?: string | null;
    monto_moneda?: number | null;
  }>
): Record<"ARS" | "USD", TotalesMonedaGrupo | null> {
  const arsItems = servicios.filter((s) => (s.moneda || "ARS") === "ARS");
  const usdItems = servicios.filter((s) => s.moneda === "USD");

  const procesarGrupo = (
    items: typeof servicios,
    moneda: "ARS" | "USD"
  ): TotalesMonedaGrupo | null => {
    if (items.length === 0) return null;
    let neto = 0;
    let iva = 0;
    let tieneIva = false;

    for (const item of items) {
      const val =
        moneda === "USD"
          ? Number(item.monto_moneda) || Number(item.monto) || 0
          : Number(item.monto) || 0;
      if (item.aplica_iva) {
        tieneIva = true;
        neto += val;
        iva += Math.round(val * 0.21 * 100) / 100;
      } else {
        neto += val;
      }
    }

    const total = Math.round((neto + iva) * 100) / 100;
    return { moneda, neto, iva, total, tieneIva };
  };

  return {
    ARS: procesarGrupo(arsItems, "ARS"),
    USD: procesarGrupo(usdItems, "USD"),
  };
}
