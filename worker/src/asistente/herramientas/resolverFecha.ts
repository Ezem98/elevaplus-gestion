import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";

const NOMBRES_DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

const MAPA_DIAS: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  miércoles: 3,
  mie: 3,
  mié: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
  sáb: 6,
};

export interface ResultadoResolucionFecha {
  fecha?: string; // YYYY-MM-DD
  dia_semana?: string; // e.g. "jueves"
  formato_humano?: string; // e.g. "jueves 15/10"
  ambiguo: boolean;
  motivo?: string;
  opciones?: string[];
}

/**
 * Normaliza una fecha ISO (YYYY-MM-DD) a sus componentes numéricos [año, mes 1-12, día 1-31]
 */
function parsearFechaISO(iso: string): [number, number, number] {
  const [a, m, d] = iso.split("-").map(Number);
  return [a, m, d];
}

/**
 * Formatea año, mes y día a YYYY-MM-DD
 */
function formatearISO(a: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${a}-${mm}-${dd}`;
}

/**
 * Obtiene el día de la semana (0 domingo ... 6 sábado) para una fecha YYYY-MM-DD
 */
function obtenerDiaSemanaIndex(iso: string): number {
  const [a, m, d] = parsearFechaISO(iso);
  // Usar UTC a mediodía para evitar cualquier salto horario
  const fecha = new Date(Date.UTC(a, m - 1, d, 12, 0, 0));
  return fecha.getUTCDay();
}

/**
 * Suma N días a una fecha ISO
 */
function sumarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = parsearFechaISO(iso);
  const fecha = new Date(Date.UTC(a, m - 1, d, 12, 0, 0));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return formatearISO(
    fecha.getUTCFullYear(),
    fecha.getUTCMonth() + 1,
    fecha.getUTCDate(),
  );
}

/**
 * Cantidad de días en un mes específico
 */
function diasEnMes(ano: number, mes1a12: number): number {
  return new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
}

/**
 * Lógica pura de resolución de fecha a partir de una fecha de hoy de referencia.
 */
export function resolverFechaLogica(
  texto: string,
  hoyISO: string,
): ResultadoResolucionFecha {
  if (!texto || typeof texto !== "string") {
    return {
      ambiguo: true,
      motivo: "No se proporcionó ningún texto de fecha.",
    };
  }

  const limpio = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // sin acentos para comparación

  const [anoHoy, mesHoy, diaHoy] = parsearFechaISO(hoyISO);
  const diaSemanaHoy = obtenerDiaSemanaIndex(hoyISO);

  // 1. "hoy"
  if (limpio === "hoy") {
    const diaSem = NOMBRES_DIAS[diaSemanaHoy];
    return {
      fecha: hoyISO,
      dia_semana: diaSem,
      formato_humano: `${diaSem} ${diaHoy}/${mesHoy}`,
      ambiguo: false,
    };
  }

  // 2. "mañana" / "manana"
  if (limpio === "manana" || limpio === "de manana") {
    const mananaISO = sumarDiasISO(hoyISO, 1);
    const [, mMan, dMan] = parsearFechaISO(mananaISO);
    const diaSem = NOMBRES_DIAS[obtenerDiaSemanaIndex(mananaISO)];
    return {
      fecha: mananaISO,
      dia_semana: diaSem,
      formato_humano: `${diaSem} ${dMan}/${mMan}`,
      ambiguo: false,
    };
  }

  // 3. "pasado" / "pasado mañana"
  if (limpio === "pasado" || limpio === "pasado manana") {
    const pasadoISO = sumarDiasISO(hoyISO, 2);
    const [, mPas, dPas] = parsearFechaISO(pasadoISO);
    const diaSem = NOMBRES_DIAS[obtenerDiaSemanaIndex(pasadoISO)];
    return {
      fecha: pasadoISO,
      dia_semana: diaSem,
      formato_humano: `${diaSem} ${dPas}/${mPas}`,
      ambiguo: false,
    };
  }

  // 4. Formato directo YYYY-MM-DD
  const matchISO = limpio.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (matchISO) {
    const a = Number(matchISO[1]);
    const m = Number(matchISO[2]);
    const d = Number(matchISO[3]);
    const isoValida = formatearISO(a, m, d);
    const diaSem = NOMBRES_DIAS[obtenerDiaSemanaIndex(isoValida)];
    return {
      fecha: isoValida,
      dia_semana: diaSem,
      formato_humano: `${diaSem} ${d}/${m}`,
      ambiguo: false,
    };
  }

  // 5. Formato DD/MM o DD/MM/YYYY (o con guion DD-MM)
  const matchSlash = limpio.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (matchSlash) {
    const d = Number(matchSlash[1]);
    const m = Number(matchSlash[2]);
    let a = matchSlash[3] ? Number(matchSlash[3]) : anoHoy;
    if (a < 100) a += 2000;

    // Si no especificó año y la fecha ya pasó este año en meses previos, proyectar al año siguiente
    if (!matchSlash[3] && (m < mesHoy || (m === mesHoy && d < diaHoy))) {
      a += 1;
    }

    const isoValida = formatearISO(a, m, d);
    const diaSem = NOMBRES_DIAS[obtenerDiaSemanaIndex(isoValida)];
    return {
      fecha: isoValida,
      dia_semana: diaSem,
      formato_humano: `${diaSem} ${d}/${m}`,
      ambiguo: false,
    };
  }

  // 6. Días de la semana ("el lunes", "proximo jueves", "este viernes", "martes", etc.)
  const regexDiaSemana =
    /^(?:el\s+|este\s+|el\s+proximo\s+|proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)$/;
  const matchDiaSemana = limpio.match(regexDiaSemana);
  if (matchDiaSemana) {
    const nombreDia = matchDiaSemana[1];
    const diaDestinoIdx = MAPA_DIAS[nombreDia];
    const esProximoExplicito = limpio.includes("proximo");
    const esEsteExplicito = limpio.includes("este");

    // Caso de ambigüedad si hoy es el mismo día
    if (diaDestinoIdx === diaSemanaHoy) {
      if (esProximoExplicito) {
        const fechaProx = sumarDiasISO(hoyISO, 7);
        const [, mP, dP] = parsearFechaISO(fechaProx);
        const diaSem = NOMBRES_DIAS[diaDestinoIdx];
        return {
          fecha: fechaProx,
          dia_semana: diaSem,
          formato_humano: `${diaSem} ${dP}/${mP}`,
          ambiguo: false,
        };
      }
      if (esEsteExplicito) {
        const diaSem = NOMBRES_DIAS[diaSemanaHoy];
        return {
          fecha: hoyISO,
          dia_semana: diaSem,
          formato_humano: `${diaSem} ${diaHoy}/${mesHoy}`,
          ambiguo: false,
        };
      }
      // Sin calificador claro: "el jueves" un día jueves
      const diaSem = NOMBRES_DIAS[diaSemanaHoy];
      const proximoIso = sumarDiasISO(hoyISO, 7);
      return {
        ambiguo: true,
        motivo: `Hoy es ${diaSem}. Aclarame si te referís a hoy (${diaHoy}/${mesHoy}) o al próximo ${diaSem} (${proximoIso}).`,
        opciones: [hoyISO, proximoIso],
      };
    }

    // Calcular cuántos días faltan hasta el día de la semana
    let delta = (diaDestinoIdx - diaSemanaHoy + 7) % 7;
    if (delta === 0) delta = 7;
    if (esProximoExplicito && delta < 7) {
      // "el próximo X" suele referirse a la próxima semana si ya está muy cerca o según uso común
      // pero si delta > 0 ya es la próxima ocurrencia
    }

    const fechaDestino = sumarDiasISO(hoyISO, delta);
    const [, mDest, dDest] = parsearFechaISO(fechaDestino);
    const diaSem = NOMBRES_DIAS[diaDestinoIdx];
    return {
      fecha: fechaDestino,
      dia_semana: diaSem,
      formato_humano: `${diaSem} ${dDest}/${mDest}`,
      ambiguo: false,
    };
  }

  // 7. Número suelto de día de mes ("el 15", "15", "el 3", "dia 20")
  const matchDiaNumero = limpio.match(/^(?:el\s+|dia\s+)?(\d{1,2})$/);
  if (matchDiaNumero) {
    const diaObjetivo = Number(matchDiaNumero[1]);
    if (diaObjetivo < 1 || diaObjetivo > 31) {
      return {
        ambiguo: true,
        motivo: `El día ${diaObjetivo} no es válido en el calendario.`,
      };
    }

    // Si coincide con el día de hoy
    if (diaObjetivo === diaHoy) {
      const proxMes = mesHoy === 12 ? 1 : mesHoy + 1;
      const proxAno = mesHoy === 12 ? anoHoy + 1 : anoHoy;
      const isoProxMes = formatearISO(proxAno, proxMes, diaObjetivo);
      return {
        ambiguo: true,
        motivo: `Hoy es día ${diaHoy}. Aclarame si te referís a hoy o al ${diaObjetivo}/${proxMes}.`,
        opciones: [hoyISO, isoProxMes],
      };
    }

    // Si el día es mayor a hoy, pertenece al mes actual
    if (diaObjetivo > diaHoy) {
      const maxDiasEsteMes = diasEnMes(anoHoy, mesHoy);
      if (diaObjetivo > maxDiasEsteMes) {
        return {
          ambiguo: true,
          motivo: `El mes actual solo tiene ${maxDiasEsteMes} días.`,
        };
      }
      const fechaCalculada = formatearISO(anoHoy, mesHoy, diaObjetivo);
      const diaSem = NOMBRES_DIAS[obtenerDiaSemanaIndex(fechaCalculada)];
      return {
        fecha: fechaCalculada,
        dia_semana: diaSem,
        formato_humano: `${diaSem} ${diaObjetivo}/${mesHoy}`,
        ambiguo: false,
      };
    }

    // Cruce de mes: el día es menor a hoy -> pasa al mes siguiente
    const mesSiguiente = mesHoy === 12 ? 1 : mesHoy + 1;
    const anoSiguiente = mesHoy === 12 ? anoHoy + 1 : anoHoy;
    const maxDiasMesSig = diasEnMes(anoSiguiente, mesSiguiente);

    if (diaObjetivo > maxDiasMesSig) {
      return {
        ambiguo: true,
        motivo: `El mes siguiente solo tiene ${maxDiasMesSig} días.`,
      };
    }

    const fechaCalculada = formatearISO(
      anoSiguiente,
      mesSiguiente,
      diaObjetivo,
    );
    const diaSem = NOMBRES_DIAS[obtenerDiaSemanaIndex(fechaCalculada)];
    return {
      fecha: fechaCalculada,
      dia_semana: diaSem,
      formato_humano: `${diaSem} ${diaObjetivo}/${mesSiguiente}`,
      ambiguo: false,
    };
  }

  // No interpretado
  return {
    ambiguo: true,
    motivo: `No pude interpretar la fecha "${texto}". Podés usar "hoy", "mañana", un día de la semana o formato DD/MM.`,
  };
}

export const herramientaResolverFecha: HerramientaAsistente = {
  nombre: "resolver_fecha",
  descripcion:
    "Resuelve expresiones temporales en lenguaje natural ('hoy', 'mañana', 'pasado', 'el jueves', 'el 15', '15/10') a una fecha ISO (YYYY-MM-DD) y día de la semana en la zona horaria de Argentina. Si es ambigua, lo indica.",
  parametros: {
    type: "object",
    properties: {
      texto: {
        type: "string",
        description:
          "Texto con la fecha relativa o absoluta (ej: 'mañana', 'el jueves', '15', '20/10')",
      },
    },
    required: ["texto"],
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(ctx: ContextoHerramienta, args: { texto: string }) {
    const res = resolverFechaLogica(args.texto, ctx.hoy);
    return res;
  },
};
