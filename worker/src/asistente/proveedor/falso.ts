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

    // Caso J: Cambio de estado de un servicio ("ya terminó", "el de Deza de hoy ya terminó", "cancelá el traslado #1087")
    if (
      limpio.includes("terminó") ||
      limpio.includes("termino") ||
      limpio.includes("terminado") ||
      limpio.includes("cancelá") ||
      limpio.includes("cancela") ||
      limpio.includes("cancelar") ||
      limpio.includes("en curso")
    ) {
      let nuevoEstado = "terminó";
      if (limpio.includes("cancel")) {
        nuevoEstado = "cancelado";
      } else if (limpio.includes("en curso")) {
        nuevoEstado = "en curso";
      }

      let cliente: string | undefined = undefined;
      if (limpio.includes("deza")) cliente = "Deza";
      else if (limpio.includes("huma")) cliente = "Huma";
      else if (limpio.includes("almatec")) cliente = "Almatec";

      let fecha: string | undefined = undefined;
      if (limpio.includes("hoy") || limpio.includes("de hoy")) fecha = "hoy";
      else if (limpio.includes("mañana") || limpio.includes("manana")) fecha = "mañana";

      const matchNum = limpio.match(/#?(\d+)/);
      const numero = matchNum ? Number(matchNum[1]) : undefined;

      return {
        llamadasHerramientas: [
          {
            id: `call_cambio_estado_${Date.now()}`,
            nombre: "proponer_cambio_estado",
            argumentos: {
              numero,
              cliente,
              fecha,
              nuevo_estado: nuevoEstado,
              referencia: limpio,
            },
          },
        ],
        tokensEntrada: 50,
        tokensSalida: 30,
        costoUsd: 0.000045,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso K1: Servicio ya realizado ("ayer hicimos un traslado...", "el lunes pasado alquilamos...")
    if (
      (limpio.includes("ayer") || limpio.includes("pasado") || limpio.includes("hicimos")) &&
      (limpio.includes("traslado") || todoElTexto.includes("traslado"))
    ) {
      let cliente = "Deza";
      if (limpio.includes("huma")) cliente = "Huma";
      else if (limpio.includes("almatec")) cliente = "Almatec";

      let chofer = "Mauro";
      if (todoElTexto.includes("federico")) chofer = "Federico";

      let origen = "Burzaco";
      let destino = "Avellaneda";
      if (limpio.includes("temperley")) origen = "Temperley";
      if (limpio.includes("lomas")) destino = "Lomas";

      let fecha = "ayer";
      if (limpio.includes("lunes pasado")) fecha = "el lunes pasado";

      return {
        llamadasHerramientas: [
          {
            id: `call_proponer_realizado_${Date.now()}`,
            nombre: "proponer_servicio_realizado",
            argumentos: {
              tipo: "traslado",
              cliente,
              fecha,
              hora: "10:00",
              origen,
              destino,
              km: 30,
              ida_y_vuelta: false,
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

    if (
      (limpio.includes("ayer") || limpio.includes("pasado") || limpio.includes("alquilamos")) &&
      limpio.includes("alquil")
    ) {
      let cliente = "Techint";
      if (limpio.includes("deza")) cliente = "Deza";
      else if (limpio.includes("almatec")) cliente = "Almatec";

      return {
        llamadasHerramientas: [
          {
            id: `call_proponer_realizado_alq_${Date.now()}`,
            nombre: "proponer_servicio_realizado",
            argumentos: {
              tipo: "alquiler_hora",
              cliente,
              fecha: limpio.includes("ayer") ? "ayer" : "el lunes pasado",
              maquina: "AE-01",
              direccion: "Planta Techint",
              descripcion: "Alquiler AE-01 4 horas",
              monto: 120000,
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

    // Caso L: Presupuesto ("haceme un presupuesto para...", "presupuesto para...")
    if (limpio.includes("presupuesto") || todoElTexto.includes("presupuesto")) {
      const tienePrecios =
        todoElTexto.includes("350") ||
        todoElTexto.includes("180") ||
        todoElTexto.includes("$") ||
        todoElTexto.includes("pesos");

      if (!tienePrecios) {
        return {
          texto: "¿Qué precio le ponemos al traslado y cuánto por día el alquiler?",
          tokensEntrada: 45,
          tokensSalida: 25,
          costoUsd: 0.000039,
          modelo: "falso",
          promptVersion: "guion-test",
        };
      }

      let cliente = "Techint";
      if (todoElTexto.includes("deza")) cliente = "Deza";
      else if (todoElTexto.includes("almatec")) cliente = "Almatec";
      else if (todoElTexto.includes("huma")) cliente = "Huma";

      return {
        llamadasHerramientas: [
          {
            id: `call_proponer_presupuesto_${Date.now()}`,
            nombre: "proponer_presupuesto",
            argumentos: {
              cliente,
              items: [
                {
                  tipo: "traslado",
                  descripcion: "Traslado de la AE-01 de Burzaco a Campana",
                  origen: "Burzaco",
                  destino: "Campana",
                  maquina: "AE-01",
                  precio: 350000,
                  moneda: "ARS",
                },
                {
                  tipo: "alquiler_periodo",
                  descripcion: "3 días de alquiler AE-01",
                  maquina: "AE-01",
                  cantidad: 3,
                  unidad: "dia",
                  precio_unitario: 180000,
                  precio: 540000,
                  moneda: "ARS",
                },
              ],
              validez_dias: 15,
            },
          },
        ],
        tokensEntrada: 75,
        tokensSalida: 65,
        costoUsd: 0.000095,
        modelo: "falso",
        promptVersion: "guion-test",
      };
    }

    // Caso K2: Alta / propuesta de servicio futuro (§1 y §6: diálogo de traslado)
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
