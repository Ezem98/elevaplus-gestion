import { config } from "../../config";
import type { ContextoHerramienta, HerramientaAsistente } from "../tipos";

const PROVINCIAS_Y_PAISES = [
  "buenos aires",
  "bs as",
  "bs. as.",
  "caba",
  "capital federal",
  "catamarca",
  "chaco",
  "chubut",
  "cordoba",
  "córdoba",
  "corrientes",
  "entre rios",
  "entre ríos",
  "formosa",
  "jujuy",
  "la pampa",
  "la rioja",
  "mendoza",
  "misiones",
  "neuquen",
  "neuquén",
  "rio negro",
  "río negro",
  "salta",
  "san juan",
  "san luis",
  "santa cruz",
  "santa fe",
  "santiago del estero",
  "tierra del fuego",
  "tucuman",
  "tucumán",
  "argentina",
  "uruguay",
  "brasil",
  "brazil",
  "chile",
  "paraguay",
  "bolivia",
];

/**
 * Agrega ", Buenos Aires, Argentina" si el texto no menciona provincia o país.
 */
export function normalizarDireccion(direccion: string): string {
  const dir = direccion.trim();
  if (!dir) return dir;
  const dirMinuscula = dir.toLowerCase();
  const mencionaProvinciaOPais = PROVINCIAS_Y_PAISES.some((lugar) => {
    const regex = new RegExp(`(^|[^a-záéíóúñ])${lugar}([^a-záéíóúñ]|$)`, "i");
    return regex.test(dirMinuscula);
  });

  if (mencionaProvinciaOPais) {
    return dir;
  }
  const limpia = dir.replace(/,\s*$/, "");
  return `${limpia}, Buenos Aires, Argentina`;
}

export interface ResultadoCalcularDistancia {
  km?: number;
  duracion_min?: number;
  origen?: string;
  destino?: string;
  resumen?: string;
  error?: string;
}

export interface OpcionesCalcularDistancia {
  apiKey?: string;
  esFalso?: boolean;
  fetchFn?: typeof fetch;
}

export async function calcularDistanciaRuta(
  args: { origen: string; destino: string },
  opciones?: OpcionesCalcularDistancia,
): Promise<ResultadoCalcularDistancia> {
  const origen = args?.origen?.trim();
  const destino = args?.destino?.trim();

  if (!origen || !destino) {
    return {
      error: "Debe indicar origen y destino para calcular la distancia.",
    };
  }

  const esFalso =
    opciones?.esFalso ?? config.ASISTENTE_MODELO === "falso";

  if (esFalso) {
    return {
      km: 105.4,
      duracion_min: 95,
      origen: args.origen,
      destino: args.destino,
      resumen: `Distancia: 105.4 km (aprox. 95 min en auto por ruta de ${args.origen} a ${args.destino})`,
    };
  }

  const apiKey = opciones?.apiKey ?? config.GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    return {
      error: "El cálculo de distancia no está configurado; pasame los km",
    };
  }

  const dirOrigen = normalizarDireccion(origen);
  const dirDestino = normalizarDireccion(destino);

  const body = {
    origin: { address: dirOrigen },
    destination: { address: dirDestino },
    travelMode: "DRIVE",
    regionCode: "ar",
    languageCode: "es-AR",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask":
      "routes.distanceMeters,routes.duration,routes.legs.startLocation,routes.legs.endLocation",
  };

  const fetchFn = opciones?.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetchFn(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorDetalle = `Respuesta HTTP ${res.status}`;
      try {
        const jsonError = await res.json();
        if (jsonError?.error?.message) {
          errorDetalle = String(jsonError.error.message);
        }
      } catch {
        // Ignorar error al parsear JSON
      }
      if (apiKey) {
        errorDetalle = errorDetalle.split(apiKey).join("[OCULTA]");
      }
      return {
        error: `Error al calcular la distancia: ${errorDetalle}`,
      };
    }

    const data = await res.json();
    const ruta = data?.routes?.[0];

    if (!ruta || ruta.distanceMeters == null) {
      return {
        error: `No se encontró una ruta entre "${args.origen}" y "${args.destino}".`,
      };
    }

    const km = Math.round((ruta.distanceMeters / 1000) * 10) / 10;

    let segundos = 0;
    if (typeof ruta.duration === "string") {
      segundos = parseFloat(ruta.duration.replace("s", ""));
    } else if (typeof ruta.duration === "number") {
      segundos = ruta.duration;
    }
    const duracion_min = Math.round(segundos / 60);

    const resumen = `Distancia: ${km} km (aprox. ${duracion_min} min en auto por ruta de ${args.origen} a ${args.destino})`;

    return {
      km,
      duracion_min,
      origen: args.origen,
      destino: args.destino,
      resumen,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    let errorMsg =
      err?.name === "AbortError"
        ? "Se agotó el tiempo de espera (10 s) al consultar el servicio de mapas."
        : (err?.message || "Error desconocido al consultar el servicio de mapas.");
    if (apiKey) {
      errorMsg = errorMsg.split(apiKey).join("[OCULTA]");
    }
    return {
      error: `Error al calcular la distancia: ${errorMsg}`,
    };
  }
}

export const herramientaCalcularDistancia: HerramientaAsistente = {
  nombre: "calcular_distancia",
  descripcion:
    "Calcula la distancia en kilómetros por ruta y tiempo estimado de viaje entre dos direcciones usando Google Maps Platform Routes API.",
  parametros: {
    type: "object",
    properties: {
      origen: {
        type: "string",
        description:
          "Dirección o localidad de origen (ej: 'Burzaco', 'Av. Hipólito Yrigoyen 15000, Longchamps')",
      },
      destino: {
        type: "string",
        description:
          "Dirección o localidad de destino (ej: 'Campana', 'Ruta 2 km 40, Brandsen')",
      },
    },
    required: ["origen", "destino"],
    additionalProperties: false,
  },
  roles: ["admin", "oficina"],
  async ejecutar(_ctx: ContextoHerramienta, args: { origen: string; destino: string }) {
    return await calcularDistanciaRuta(args);
  },
};
