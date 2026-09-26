const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatearPesos(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return pesos.format(valor);
}

export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatearFechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

export function formatearFechaHoraCorta(
  iso: string | null | undefined,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = d.getMonth() + 1;
  const horas = String(d.getHours()).padStart(2, "0");
  const minutos = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes} ${horas}:${minutos}`;
}

export function formatearNumeroFactura(
  tipo: string | null | undefined,
  puntoVenta: number | null | undefined,
  numero: number | string | null | undefined,
): string {
  const pv = String(puntoVenta ?? 0).padStart(4, "0");
  const num = String(numero ?? 0).padStart(8, "0");
  const t = tipo ?? "";
  let prefijo = t;
  if (t.startsWith("NC_")) {
    prefijo = `NC ${t.slice(3)}`;
  } else if (t.startsWith("ND_")) {
    prefijo = `ND ${t.slice(3)}`;
  }
  return `${prefijo} ${pv}-${num}`.trim();
}

export function proximoCuartoDeHora(fecha: Date): string {
  const d = new Date(fecha.getTime());
  const minutos = d.getMinutes();
  const segundos = d.getSeconds();
  const ms = d.getMilliseconds();

  const restoMinutos = minutos % 15;
  let minutosParaSumar = 0;

  if (restoMinutos === 0 && segundos === 0 && ms === 0) {
    minutosParaSumar = 0;
  } else {
    minutosParaSumar = 15 - restoMinutos;
  }

  d.setMinutes(minutos + minutosParaSumar, 0, 0);
  const horas = String(d.getHours()).padStart(2, "0");
  const minFinal = String(d.getMinutes()).padStart(2, "0");
  return `${horas}:${minFinal}`;
}

export function formatearMes(periodo: string | null | undefined): string {
  if (!periodo) return "—";
  const partes = periodo.slice(0, 7).split("-");
  if (partes.length < 2) return periodo;
  const [año, mes] = partes;
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const idx = parseInt(mes, 10) - 1;
  return `${meses[idx] ?? mes} ${año}`;
}

export function parsearMonto(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const limpio = texto.replace(/[^\d,]/g, "");
  if (!/\d/.test(limpio)) return null;

  let procesado = limpio;
  if (procesado.startsWith(",")) {
    procesado = "0" + procesado;
  }

  const partes = procesado.split(",");
  const parteEntera = partes[0] || "0";
  const tieneComa = partes.length > 1;
  const parteDecimal = tieneComa ? partes.slice(1).join("").slice(0, 2) : "";

  const normalizado =
    parteDecimal.length > 0 ? `${parteEntera}.${parteDecimal}` : parteEntera;

  const num = parseFloat(normalizado);
  return isNaN(num) ? null : num;
}

export function formatearMontoEntrada(
  numero: number | null | undefined,
): string {
  if (numero == null || isNaN(numero)) return "";

  const partes = numero.toString().split(".");
  const enteroStr = partes[0];
  const decimalStr = partes[1] ? partes[1].slice(0, 2) : "";

  const enteroFormateado = enteroStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (decimalStr.length > 0) {
    return `${enteroFormateado},${decimalStr}`;
  }
  return enteroFormateado;
}

export function formatearTextoMonto(texto: string): string {
  if (!texto) return "";

  const soloValidos = texto.replace(/[^\d,]/g, "");
  if (!soloValidos) return "";

  let procesado = soloValidos;
  if (procesado.startsWith(",")) {
    procesado = "0" + procesado;
  }

  const partes = procesado.split(",");
  let parteEntera = partes[0];
  const tieneComa = partes.length > 1;
  const parteDecimal = tieneComa ? partes.slice(1).join("").slice(0, 2) : "";

  if (parteEntera.length > 1 && parteEntera.startsWith("0")) {
    parteEntera = parteEntera.replace(/^0+/, "") || "0";
  }

  const enteroFormateado = parteEntera.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (tieneComa) {
    return `${enteroFormateado},${parteDecimal}`;
  }
  return enteroFormateado;
}

export function modificarDias(iso: string, cantDias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + cantDias));
  return f.toISOString().slice(0, 10);
}

export function obtenerLunesSemana(fecha: string | Date = new Date()): string {
  if (typeof fecha === "string") {
    const [y, m, dia] = fecha.slice(0, 10).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, dia));
    const diaSemana = d.getUTCDay(); // 0 = dom, 1 = lun, ..., 6 = sab
    const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunes = new Date(Date.UTC(y, m - 1, dia + diff));
    return lunes.toISOString().slice(0, 10);
  } else {
    const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    const diaSemana = d.getDay();
    const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
    d.setDate(d.getDate() + diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dia}`;
  }
}

export function formatearRangoSemana(
  fecha: string | Date = new Date(),
): string {
  const lunesIso = obtenerLunesSemana(fecha);
  const [y1, m1, d1] = lunesIso.split("-").map(Number);
  const fechaLunes = new Date(Date.UTC(y1, m1 - 1, d1));
  const fechaDomingo = new Date(Date.UTC(y1, m1 - 1, d1 + 6));

  const diaLunes = fechaLunes.getUTCDate();
  const mesLunesNum = fechaLunes.getUTCMonth();
  const anioLunes = fechaLunes.getUTCFullYear();

  const diaDomingo = fechaDomingo.getUTCDate();
  const mesDomingoNum = fechaDomingo.getUTCMonth();
  const anioDomingo = fechaDomingo.getUTCFullYear();

  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  const mesLunes = meses[mesLunesNum];
  const mesDomingo = meses[mesDomingoNum];

  if (anioLunes !== anioDomingo) {
    return `${diaLunes} de ${mesLunes} de ${anioLunes} al ${diaDomingo} de ${mesDomingo} de ${anioDomingo}`;
  }

  if (mesLunesNum !== mesDomingoNum) {
    return `${diaLunes} de ${mesLunes} al ${diaDomingo} de ${mesDomingo}`;
  }

  return `${diaLunes} al ${diaDomingo} de ${mesLunes}`;
}

export function formatearSemanaCorta(lunesIso: string): string {
  const [y1, m1, d1] = lunesIso.split("-").map(Number);
  const fechaLunes = new Date(Date.UTC(y1, m1 - 1, d1));
  const fechaDomingo = new Date(Date.UTC(y1, m1 - 1, d1 + 6));

  const diaLunes = fechaLunes.getUTCDate();
  const mesLunesNum = fechaLunes.getUTCMonth();
  const diaDomingo = fechaDomingo.getUTCDate();
  const mesDomingoNum = fechaDomingo.getUTCMonth();

  const mesesCortos = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];

  if (mesLunesNum === mesDomingoNum) {
    return `${diaLunes}-${diaDomingo} ${mesesCortos[mesLunesNum]}`;
  }
  return `${diaLunes} ${mesesCortos[mesLunesNum]} - ${diaDomingo} ${mesesCortos[mesDomingoNum]}`;
}

export function formatearCompacto(n: number): string {
  const abs = Math.abs(n);
  const signo = n < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    const mill = (abs / 1_000_000)
      .toFixed(1)
      .replace(".0", "")
      .replace(".", ",");
    return `${signo}${mill}M`;
  }
  if (abs >= 1_000) {
    const mil = Math.round(abs / 1_000);
    return `${signo}${mil}k`;
  }
  return `${signo}${abs}`;
}
