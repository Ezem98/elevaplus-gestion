import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { procesarTurno } from "../src/asistente/procesar";
import { ProveedorClaude } from "../src/asistente/proveedor/claude";
import { ProveedorOpenAI } from "../src/asistente/proveedor/openai";
import type { ProveedorModelo } from "../src/asistente/proveedor/tipos";
import { validarSesionAsistente } from "../src/asistente/sesion";
import { config } from "../src/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CasoComparacion {
  id: string;
  titulo: string;
  categoria: string;
  pedido: string;
  esperado?: string;
}

interface ResultadoCasoModelo {
  modelo: string;
  respuestaFinal: string;
  herramientas: Array<{ nombre: string; argumentos: Record<string, any> }>;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
  latenciaMs: number;
  error?: string;
  puntaje: null;
}

interface FilaCasoComparacion {
  casoId: string;
  titulo: string;
  pedido: string;
  resultados: Record<string, ResultadoCasoModelo>;
}

function parsearArgumentos(): {
  modelos: Array<"openai" | "claude">;
  casosFiltro?: string[];
} {
  const args = process.argv.slice(2);
  let modelos: Array<"openai" | "claude"> = ["openai", "claude"];
  let casosFiltro: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--modelos" && args[i + 1]) {
      const lista = args[i + 1]
        .split(",")
        .map((s) => s.trim().toLowerCase());
      modelos = lista.filter(
        (m): m is "openai" | "claude" => m === "openai" || m === "claude",
      );
      i++;
    } else if (arg.startsWith("--modelos=")) {
      const lista = arg
        .slice("--modelos=".length)
        .split(",")
        .map((s) => s.trim().toLowerCase());
      modelos = lista.filter(
        (m): m is "openai" | "claude" => m === "openai" || m === "claude",
      );
    } else if (arg === "--casos" && args[i + 1]) {
      casosFiltro = args[i + 1].split(",").map((s) => s.trim());
      i++;
    } else if (arg.startsWith("--casos=")) {
      casosFiltro = arg.slice("--casos=".length).split(",").map((s) => s.trim());
    }
  }

  return { modelos, casosFiltro };
}

function sanitizarTextoParaTabla(texto: string): string {
  return texto
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|")
    .trim();
}

async function main() {
  const { modelos, casosFiltro } = parsearArgumentos();

  console.log("=== Comparación de Modelos para Chimuelo (ELEVAPLUS) ===");

  // 1. Validar que la URL de Supabase sea local (127.0.0.1 o localhost)
  const urlSupabase = config.SUPABASE_URL || "";
  const esLocal =
    urlSupabase.includes("127.0.0.1") || urlSupabase.includes("localhost");

  if (!esLocal) {
    console.error(
      `❌ Abortando: Supabase URL ("${urlSupabase}") no es local. El script de comparación solo puede correr contra Supabase local (127.0.0.1 o localhost).`,
    );
    process.exit(1);
  }

  // 2. Filtrar modelos según disponibilidad de API key
  const modelosAEjecutar: Array<"openai" | "claude"> = [];
  for (const m of modelos) {
    if (m === "openai") {
      if (!config.OPENAI_API_KEY) {
        console.warn(
          "⚠️ [AVISO] Falta OPENAI_API_KEY. Se saltea el modelo 'openai'.",
        );
      } else {
        modelosAEjecutar.push("openai");
      }
    } else if (m === "claude") {
      if (!config.ANTHROPIC_API_KEY) {
        console.warn(
          "⚠️ [AVISO] Falta ANTHROPIC_API_KEY. Se saltea el modelo 'claude'.",
        );
      } else {
        modelosAEjecutar.push("claude");
      }
    }
  }

  if (modelosAEjecutar.length === 0) {
    console.warn(
      "⚠️ No hay modelos con claves de API disponibles para ejecutar. Finalizando aviso sin errores.",
    );
    process.exit(0);
  }

  // 3. Cargar casos de comparación
  const rutaCasos = path.resolve(__dirname, "casos-comparacion.json");
  if (!fs.existsSync(rutaCasos)) {
    console.error(`❌ No se encontró el archivo de casos en ${rutaCasos}`);
    process.exit(1);
  }

  const contenidoCasos = fs.readFileSync(rutaCasos, "utf8");
  let todosLosCasos: CasoComparacion[];
  try {
    todosLosCasos = JSON.parse(contenidoCasos);
  } catch (err: any) {
    console.error("❌ Error al parsear casos-comparacion.json:", err?.message);
    process.exit(1);
  }

  let casos = todosLosCasos;
  if (casosFiltro && casosFiltro.length > 0) {
    casos = todosLosCasos.filter((c, idx) => {
      const num = (idx + 1).toString();
      const padNum = (idx + 1).toString().padStart(2, "0");
      return (
        casosFiltro.includes(c.id) ||
        casosFiltro.includes(num) ||
        casosFiltro.includes(padNum) ||
        casosFiltro.some((filtro) =>
          c.id.toLowerCase().includes(filtro.toLowerCase()),
        )
      );
    });
  }

  if (casos.length === 0) {
    console.warn("⚠️ Ningún caso coincide con el filtro especificado.");
    process.exit(0);
  }

  console.log(`• Modelos a evaluar: ${modelosAEjecutar.join(", ")}`);
  console.log(`• Cantidad de casos: ${casos.length}`);

  // 4. Iniciar sesión con el usuario de oficina del seed de test
  const supabaseAuth = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY,
  );
  const { data: authData, error: authError } =
    await supabaseAuth.auth.signInWithPassword({
      email: "oficina@test.local",
      password: "test1234",
    });

  if (authError || !authData.session) {
    console.error(
      `❌ Error al iniciar sesión con oficina@test.local: ${authError?.message}`,
    );
    process.exit(1);
  }

  const token = authData.session.access_token;
  const sesion = await validarSesionAsistente(token);

  console.log(`• Sesión iniciada como: ${sesion.email} (rol: ${sesion.rol})`);

  // 5. Ejecutar la comparación
  const resultadosFilas: FilaCasoComparacion[] = [];

  for (const caso of casos) {
    console.log(`\n▶ Evaluando [${caso.id}] "${caso.titulo}"...`);
    const resultadosPorModelo: Record<string, ResultadoCasoModelo> = {};

    for (const mod of modelosAEjecutar) {
      console.log(`  - Ejecutando modelo: ${mod}...`);
      let proveedor: ProveedorModelo;
      if (mod === "openai") {
        proveedor = new ProveedorOpenAI();
      } else {
        proveedor = new ProveedorClaude();
      }

      // Crear conversación aislada para este caso y modelo
      const { data: conv, error: convError } = await sesion.cliente
        .from("asistente_conversaciones")
        .insert({
          usuario_id: sesion.usuarioId,
          titulo: `Comparación ${caso.id} - ${mod}`,
        })
        .select()
        .single();

      if (convError || !conv) {
        console.error(
          `    ❌ Error al crear conversación para ${mod}: ${convError?.message}`,
        );
        resultadosPorModelo[mod] = {
          modelo: mod,
          respuestaFinal: "",
          herramientas: [],
          tokensEntrada: 0,
          tokensSalida: 0,
          costoUsd: 0,
          latenciaMs: 0,
          error: convError?.message || "Error al crear conversación",
          puntaje: null,
        };
        continue;
      }

      const t0 = performance.now();
      let resultadoTurno: any;
      let errorEjecucion: string | undefined;

      try {
        resultadoTurno = await procesarTurno({
          conversacionId: conv.id,
          usuarioId: sesion.usuarioId,
          rol: sesion.rol,
          texto: caso.pedido,
          supabase: sesion.cliente,
          proveedor,
        });
      } catch (err: any) {
        errorEjecucion = err?.message || String(err);
        console.error(`    ❌ Error en procesarTurno (${mod}): ${errorEjecucion}`);
      }

      const latenciaMs = Math.round(performance.now() - t0);

      const msgAsistente = resultadoTurno?.mensaje_asistente;
      const herramientas = (msgAsistente?.herramientas || []).map((h: any) => ({
        nombre: h.nombre,
        argumentos: h.argumentos,
      }));

      resultadosPorModelo[mod] = {
        modelo: mod,
        respuestaFinal: msgAsistente?.contenido || errorEjecucion || "(sin respuesta)",
        herramientas,
        tokensEntrada: msgAsistente?.tokens_entrada || 0,
        tokensSalida: msgAsistente?.tokens_salida || 0,
        costoUsd: msgAsistente?.costo_usd || 0,
        latenciaMs,
        ...(errorEjecucion ? { error: errorEjecucion } : {}),
        puntaje: null,
      };

      console.log(
        `    ✓ Listo (${latenciaMs} ms, ${msgAsistente?.tokens_entrada || 0}+${msgAsistente?.tokens_salida || 0} tokens, $ ${msgAsistente?.costo_usd || 0} USD)`,
      );
    }

    resultadosFilas.push({
      casoId: caso.id,
      titulo: caso.titulo,
      pedido: caso.pedido,
      resultados: resultadosPorModelo,
    });
  }

  // 6. Calcular totales y promedios por modelo
  const totales: Record<
    string,
    {
      tokensEntrada: number;
      tokensSalida: number;
      costoUsd: number;
      latenciaTotal: number;
      cantidad: number;
    }
  > = {};

  for (const mod of modelosAEjecutar) {
    totales[mod] = {
      tokensEntrada: 0,
      tokensSalida: 0,
      costoUsd: 0,
      latenciaTotal: 0,
      cantidad: 0,
    };
  }

  for (const fila of resultadosFilas) {
    for (const mod of modelosAEjecutar) {
      const res = fila.resultados[mod];
      if (res) {
        totales[mod].tokensEntrada += res.tokensEntrada;
        totales[mod].tokensSalida += res.tokensSalida;
        totales[mod].costoUsd += res.costoUsd;
        totales[mod].latenciaTotal += res.latenciaMs;
        totales[mod].cantidad++;
      }
    }
  }

  // 7. Generar reporte Markdown y archivo JSON
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  const dirComparacion = path.resolve(__dirname, "..", "comparacion");
  if (!fs.existsSync(dirComparacion)) {
    fs.mkdirSync(dirComparacion, { recursive: true });
  }

  const rutaMarkdown = path.join(
    dirComparacion,
    `resultado-${timestamp}.md`,
  );
  const rutaJson = path.join(dirComparacion, `resultado-${timestamp}.json`);

  // Construir contenido Markdown
  let md = `# Comparación de Modelos — Asistente Chimuelo\n\n`;
  md += `- **Fecha de ejecución:** ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}\n`;
  md += `- **Modelos comparados:** ${modelosAEjecutar.join(", ")}\n`;
  md += `- **Casos evaluados:** ${casos.length}\n\n`;

  md += `## Resumen Comparativo\n\n`;
  md += `| Caso | Pedido | Modelo | Respuesta Final | Herramientas Llamadas | Tokens (E/S) | Costo (USD) | Latencia | Puntaje (1-5) |\n`;
  md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

  for (const fila of resultadosFilas) {
    for (const mod of modelosAEjecutar) {
      const res = fila.resultados[mod];
      const herramientasTexto =
        res && res.herramientas.length > 0
          ? res.herramientas
              .map(
                (h) =>
                  `**${h.nombre}**(${JSON.stringify(h.argumentos)})`,
              )
              .join(", ")
          : "_ninguna_";

      const respuestaTexto = res
        ? sanitizarTextoParaTabla(res.respuestaFinal)
        : "_sin datos_";
      const pedidoTexto = sanitizarTextoParaTabla(fila.pedido);
      const tokensTexto = res ? `${res.tokensEntrada} / ${res.tokensSalida}` : "-";
      const costoTexto = res ? `$ ${res.costoUsd.toFixed(6)}` : "-";
      const latenciaTexto = res ? `${res.latenciaMs} ms` : "-";

      md += `| ${fila.casoId} | ${pedidoTexto} | **${mod}** | ${respuestaTexto} | ${sanitizarTextoParaTabla(herramientasTexto)} | ${tokensTexto} | ${costoTexto} | ${latenciaTexto} | | \n`;
    }
  }

  md += `\n## Totales y Promedios\n\n`;
  md += `| Modelo | Casos | Tokens Entrada Total | Tokens Salida Total | Costo Total (USD) | Latencia Promedio (ms) |\n`;
  md += `| --- | --- | --- | --- | --- | --- |\n`;

  for (const mod of modelosAEjecutar) {
    const tot = totales[mod];
    const latenciaPromedio =
      tot.cantidad > 0 ? Math.round(tot.latenciaTotal / tot.cantidad) : 0;
    md += `| **${mod}** | ${tot.cantidad} | ${tot.tokensEntrada} | ${tot.tokensSalida} | $ ${tot.costoUsd.toFixed(6)} | ${latenciaPromedio} ms |\n`;
  }

  // Guardar archivos
  fs.writeFileSync(rutaMarkdown, md, "utf8");

  const datosJson = {
    metadata: {
      fecha: new Date().toISOString(),
      modelos: modelosAEjecutar,
      totalCasos: casos.length,
    },
    totales: Object.fromEntries(
      Object.entries(totales).map(([mod, val]) => [
        mod,
        {
          ...val,
          latenciaPromedioMs:
            val.cantidad > 0 ? Math.round(val.latenciaTotal / val.cantidad) : 0,
        },
      ]),
    ),
    casos: resultadosFilas,
  };

  fs.writeFileSync(rutaJson, JSON.stringify(datosJson, null, 2), "utf8");

  console.log(`\n✓ Resultados guardados exitosamente:`);
  console.log(`  - Markdown: ${rutaMarkdown}`);
  console.log(`  - JSON:     ${rutaJson}`);
}

main().catch((err) => {
  console.error("❌ Error inesperado en comparar-modelos:", err);
  process.exit(1);
});
