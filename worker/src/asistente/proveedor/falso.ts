import type {
  EntradaGeneracionModelo,
  LlamadaHerramientaModelo,
  ProveedorModelo,
  RespuestaModelo,
} from "./tipos";

/**
 * Proveedor simulado para pruebas unitarias, de integración y E2E (ASISTENTE_MODELO=falso).
 * Responde mediante guiones deterministas fijos sin realizar ninguna petición de red.
 */
export class ProveedorFalso implements ProveedorModelo {
  async generarRespuesta(
    entrada: EntradaGeneracionModelo,
  ): Promise<RespuestaModelo> {
    const ultimoMsg =
      entrada.mensajes[entrada.mensajes.length - 1]?.contenido || "";
    const todoElTexto = entrada.mensajes
      .map((m) => m.contenido)
      .join(" ")
      .toLowerCase();

    const itemsTurno = entrada.itemsTurno || [];

    // 1. Si venimos de ejecutar una o más herramientas en este turno, responder con el resumen
    const ultimaSalida = [...itemsTurno]
      .reverse()
      .find((it) => it.type === "function_call_output");

    if (ultimaSalida && ultimaSalida.output) {
      let resultadoJson: any = {};
      try {
        resultadoJson = JSON.parse(ultimaSalida.output);
      } catch {
        resultadoJson = { resumen: ultimaSalida.output };
      }

      if (resultadoJson.error) {
        return {
          texto: `Hubo un inconveniente: ${resultadoJson.error}`,
          tokensEntrada: 40,
          tokensSalida: 30,
          costoUsd: 0.000044,
          modelo: "falso",
          promptVersion: "guion-test",
        };
      }

      // Si fue una propuesta creada con éxito
      if (resultadoJson.propuesta_id || resultadoJson.propuesta) {
        return {
          texto: `Listo, te armé la propuesta para que la revises y confirmes:\n\n${resultadoJson.resumen || ""}`,
          tokensEntrada: 60,
          tokensSalida: 50,
          costoUsd: 0.000072,
          modelo: "falso",
          promptVersion: "guion-test",
        };
      }

      // Si fue una búsqueda de cliente y el usuario pidió saldo
      if (
        ultimaSalida.name === "buscar_cliente" ||
        todoElTexto.includes("saldo") ||
        todoElTexto.includes("debe")
      ) {
        const clienteId =
          resultadoJson.coincidencias?.[0]?.id || resultadoJson.cliente_id;
        if (clienteId && !itemsTurno.some((it) => it.name === "saldo_cliente")) {
          // Encadenar llamada a saldo_cliente
          return {
            llamadasHerramientas: [
              {
                id: `call_saldo_${Date.now()}`,
                nombre: "saldo_cliente",
                argumentos: { cliente_id: clienteId },
              },
            ],
            tokensEntrada: 50,
            tokensSalida: 25,
            costoUsd: 0.00004,
            modelo: "falso",
            promptVersion: "guion-test",
          };
        }
      }

      // Respuesta estándar a partir del resumen de la herramienta
      return {
        texto:
          resultadoJson.resumen ||
          `Operación completada con éxito.`,
        tokensEntrada: 45,
        tokensSalida: 35,
        costoUsd: 0.000051,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // 2. Primera vuelta: analizar la intención del usuario a partir del texto
    const limpio = ultimoMsg.toLowerCase();

    // Caso A: Consulta de saldo / deuda ("cuanto me debe", "saldo de deza", etc.)
    if (limpio.includes("debe") || limpio.includes("saldo")) {
      let nombreCliente = "deza";
      if (limpio.includes("huma")) nombreCliente = "huma";
      else if (limpio.includes("almatec")) nombreCliente = "almatec";
      else if (limpio.includes("baco")) nombreCliente = "baco";

      return {
        llamadasHerramientas: [
          {
            id: `call_buscar_${Date.now()}`,
            nombre: "buscar_cliente",
            argumentos: { nombre: nombreCliente },
          },
        ],
        tokensEntrada: 50,
        tokensSalida: 25,
        costoUsd: 0.00004,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso B: Servicios del día ("que tengo mañana", "servicios de hoy", etc.)
    if (
      limpio.includes("que tengo") ||
      limpio.includes("servicios de") ||
      limpio.includes("servicios del") ||
      limpio.includes("viajes de")
    ) {
      let fecha = "hoy";
      if (limpio.includes("manana") || limpio.includes("mañana")) {
        fecha = "mañana";
      }
      return {
        llamadasHerramientas: [
          {
            id: `call_servicios_${Date.now()}`,
            nombre: "servicios_del_dia",
            argumentos: { fecha },
          },
        ],
        tokensEntrada: 50,
        tokensSalida: 25,
        costoUsd: 0.00004,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso C: Servicios sin cerrar ("sin cerrar", "pendientes de cierre")
    if (limpio.includes("sin cerrar")) {
      return {
        llamadasHerramientas: [
          {
            id: `call_sin_cerrar_${Date.now()}`,
            nombre: "servicios_sin_cerrar",
            argumentos: {},
          },
        ],
        tokensEntrada: 40,
        tokensSalida: 20,
        costoUsd: 0.000032,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso D: Cobranzas ("resumen de cobranzas", "cuanto me deben en total")
    if (limpio.includes("cobranzas") || limpio.includes("deben en total")) {
      return {
        llamadasHerramientas: [
          {
            id: `call_cobranzas_${Date.now()}`,
            nombre: "resumen_cobranzas",
            argumentos: {},
          },
        ],
        tokensEntrada: 40,
        tokensSalida: 20,
        costoUsd: 0.000032,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso E: Pendientes de facturar ("falta facturar", "pendientes de facturar")
    if (limpio.includes("facturar") || limpio.includes("facturacion")) {
      return {
        llamadasHerramientas: [
          {
            id: `call_facturar_${Date.now()}`,
            nombre: "pendientes_facturar",
            argumentos: {},
          },
        ],
        tokensEntrada: 40,
        tokensSalida: 20,
        costoUsd: 0.000032,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso F: Cheques ("cheques", "a cobrar")
    if (limpio.includes("cheque")) {
      return {
        llamadasHerramientas: [
          {
            id: `call_cheques_${Date.now()}`,
            nombre: "cheques_proximos",
            argumentos: { dias: 7 },
          },
        ],
        tokensEntrada: 40,
        tokensSalida: 20,
        costoUsd: 0.000032,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso G: Agenda ("agenda", "compromisos")
    if (limpio.includes("agenda") || limpio.includes("compromisos")) {
      return {
        llamadasHerramientas: [
          {
            id: `call_agenda_${Date.now()}`,
            nombre: "agenda_proxima",
            argumentos: { dias: 7 },
          },
        ],
        tokensEntrada: 40,
        tokensSalida: 20,
        costoUsd: 0.000032,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso H: Estado de máquinas ("donde esta la maquina", "autoelevador")
    if (limpio.includes("maquina") || limpio.includes("autoelevador")) {
      return {
        llamadasHerramientas: [
          {
            id: `call_maquinas_${Date.now()}`,
            nombre: "estado_maquina",
            argumentos: {},
          },
        ],
        tokensEntrada: 40,
        tokensSalida: 20,
        costoUsd: 0.000032,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso I: Choferes disponibles ("choferes disponibles", "quien esta libre")
    if (limpio.includes("chofer") && (limpio.includes("disponible") || limpio.includes("libre"))) {
      return {
        llamadasHerramientas: [
          {
            id: `call_choferes_${Date.now()}`,
            nombre: "choferes_disponibles",
            argumentos: { fecha: "hoy" },
          },
        ],
        tokensEntrada: 40,
        tokensSalida: 20,
        costoUsd: 0.000032,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso J: Alta / propuesta de servicio (§1 y §6: diálogo de traslado)
    // "Cargame un traslado para mañana, de Burzaco a Avellaneda, para Deza, a las 9"
    // -> "¿Lo hace Mauro o Federico? ¿Y es ida y vuelta?"
    // User responde: "Mauro, solo ida"
    // -> proponer_servicio
    if (
      limpio.includes("traslado") ||
      todoElTexto.includes("traslado") ||
      limpio.includes("cargame") ||
      limpio.includes("anota un") ||
      limpio.includes("anotá un")
    ) {
      const tieneChofer =
        todoElTexto.includes("mauro") || todoElTexto.includes("federico");
      const tieneModalidad =
        todoElTexto.includes("ida y vuelta") || todoElTexto.includes("solo ida");

      // Si aún no aclaró chofer o modalidad (guion E2E parte 4)
      if (!tieneChofer || !tieneModalidad) {
        return {
          texto: "¿Lo hace Mauro o Federico? ¿Y es ida y vuelta?",
          tokensEntrada: 45,
          tokensSalida: 25,
          costoUsd: 0.000039,
          modelo: "falso",
          promptVersion: "guion-test",
        };
      }

      // Si ya tenemos chofer y modalidad, armar la propuesta completa
      const chofer = todoElTexto.includes("mauro") ? "Mauro" : "Federico";
      const idaYVuelta = todoElTexto.includes("ida y vuelta");

      return {
        llamadasHerramientas: [
          {
            id: `call_proponer_${Date.now()}`,
            nombre: "proponer_servicio",
            argumentos: {
              tipo: "traslado",
              cliente: "Deza",
              fecha: "mañana",
              hora: "09:00",
              origen: "Burzaco",
              destino: "Avellaneda",
              km: 30,
              ida_y_vuelta: idaYVuelta,
              chofer,
              vehiculo: "Ford Cargo",
            },
          },
        ],
        tokensEntrada: 70,
        tokensSalida: 60,
        costoUsd: 0.000086,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso K: Saludo o texto libre general
    return {
      texto: "Hola, soy Chimuelo. ¿En qué te puedo ayudar hoy en la oficina?",
      tokensEntrada: 30,
      tokensSalida: 20,
      costoUsd: 0.00003,
      modelo: "falso",
      promptVersion: "guion-test",
    };
  }
}
