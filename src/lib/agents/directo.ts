import { NOMBRE_HERRAMIENTAS } from "@/lib/agents/herramientas";
import {
  ejecutarTool,
  llamarModelo,
  type ApiMsg,
  type OpcionesOrquestador,
  type ResultadoTurno,
} from "@/lib/agents/orquestador";
import type { FuenteMercado } from "@/lib/mercado.server";

const MAX_RONDAS_TOOLS = 6;

/** Detecta un ticker/símbolo ya indicado por el usuario (mensaje actual o hilo
 *  reciente). Guardia anti-bucle: si el usuario YA dijo el activo, el modelo
 *  tiene PROHIBIDO volver a preguntar qué activo/tipo/mercado es. */
function extraerTickerDeTexto(pregunta: string, historial?: ApiMsg[]): string | null {
  const STOPWORDS = new Set([
    "QUE", "COMO", "CUAL", "CUALES", "CUANTO", "CUANTA", "PARA", "POR", "CON", "DEL", "LOS",
    "LAS", "UNA", "UNO", "UNOS", "SOBRE", "ENTRE", "ESTA", "ESTE", "ESO", "ESA", "ESE",
    "THE", "AND", "FOR", "FROM", "WITH", "HOLA", "GRACIAS", "QUIERO", "PASAME", "DECIME",
    "DAME", "VALOR", "PRECIO", "GRAFICO", "ANALISIS", "MERCADO", "HOY", "AHORA", "TENER",
  ]);
  const textos = [pregunta ?? ""];
  if (historial?.length) {
    for (let i = historial.length - 1; i >= 0 && textos.length < 5; i--) {
      if (historial[i]!.role === "user") textos.push(historial[i]!.content);
    }
  }
  for (const texto of textos) {
    const t = (texto ?? "").trim();
    if (!t) continue;
    // Respuesta monovalente del usuario ("GGAL", "ggal.ba") — máxima confianza.
    if (/^[a-z0-9][a-z0-9.\-]{1,11}$/i.test(t)) {
      const up = t.toUpperCase();
      if (!STOPWORDS.has(up.replace(/\.BA$/, ""))) return up;
      continue;
    }
    const mayus = t.toUpperCase();
    // Sufijos inequívocos
    let m = mayus.match(/\b([A-Z0-9]{2,8}\.(?:BA|US)|[A-Z0-9]{2,10}(?:USDT|-USD))\b/);
    if (m) return m[1]!;
    // Ticker tras preposición de pedido ("valor intrínseco DE X", "gráfico DE X")
    m = mayus.match(
      /\b(?:VALOR|PRECIO|GRAFICO|ANALISIS|SEM[AÁ]FORO|BETA|WACC|EPS|REPORT[EAO]|COTIZACI[ÓO]N)\w*\s+(?:INTR[IÍ]NSECO\s+)?(?:DE|DEL|PARA)\s+([A-Z][A-Z0-9]{1,7}(?:\.BA)?)\b/,
    );
    if (m && !STOPWORDS.has(m[1]!)) return m[1]!;
    // Token MAYÚSCULAS suelto embebido (ej. "analisis completo de GGAL hoy")
    m = mayus.match(/\b([A-Z]{2,6}(?:\.BA)?)\b/g);
    if (m) {
      const valido = m.map((x) => x.replace(/\s/g, "")).find((tok) => !STOPWORDS.has(tok));
      if (valido && /[A-Z]/.test(valido)) return valido;
    }
  }
  return null;
}

const RE_PIDE_ACLARACION =
  /(ind[ií]came|indicame|indic[aá]|decime|dime|decirme)\s+(?:el\s+|la\s+|qué\s+|que\s+)?(nombre|s[ií]mbolo|simbolo|ticker|empresa|activo)|qu[eé]\s+(tipo\s+de\s+)?(activo|empresa|instrumento|cripto)|cu[aá]l\s+(empresa|acci[oó]n|activo)|a\s+qu[eé]\s+(activo|empresa)|en\s+qu[eé]\s+(tipo\s+de\s+)?activo/i;

function mensajeIndisponibilidad(ticker: string): string {
  return `Los datos en vivo de **${ticker}** no están disponibles en este momento (el proveedor de mercado está saturado o sin respuesta). Ya me indicaste el activo, así que no te voy a preguntar de nuevo: reintentá en unos minutos y lo calculo con datos reales.`;
}

function esResultadoVacio(texto: string): boolean {
  const t = (texto ?? "").trim();
  if (t.length < 60) return true;
  if (/^(ERROR|error)/.test(t)) return true;
  return /SIN RESULTADOS|sin datos|no se encontr[oó]|not found/i.test(t.slice(0, 500));
}

export async function respuestaDirecta(
  opts: OpcionesOrquestador,
): Promise<ResultadoTurno> {
  const {
    pregunta,
    historial,
    memoria,
    orquestacion,
    apiKey,
    baseUrl,
    enviar,
    systemPrompt,
    siteContext,
    ragMsg,
    sessionId = "anon",
  } = opts;

  const fuentes: FuenteMercado[] = [];
  const modelId = orquestacion.modeloSalida.id;

  const bloquesSistema = [
    systemPrompt,
    orquestacion.promptSkillsSalida,
    siteContext,
  ].filter((b) => typeof b === "string" && b.trim());
  const mensajes: ApiMsg[] = [{ role: "system", content: bloquesSistema.join("\n\n") }];

  if (ragMsg) mensajes.push(ragMsg);

  try {
    const ctxMemoria = memoria.contextoMemoria();
    if (ctxMemoria) {
      mensajes.push({
        role: "system",
        content: `Contexto de sesiones previas con este usuario (usalo solo si aporta al turno actual):\n${ctxMemoria}`,
      });
    }
  } catch {
    /* memoria sin contexto */
  }

  for (const m of historial) mensajes.push({ role: m.role, content: m.content });
  mensajes.push({ role: "user", content: pregunta });

  let final = "";
  for (let ronda = 0; ronda < MAX_RONDAS_TOOLS; ronda++) {
    const res = await llamarModelo(apiKey, modelId, mensajes, NOMBRE_HERRAMIENTAS, {
      maxTokens: 2048,
    });
    if (!res.ok) break;
    let msg: { content?: string; tool_calls?: Array<Record<string, any>> } = {};
    try {
      const data = (await res.json()) as {
        choices?: Array<{ message?: typeof msg }>;
      };
      msg = data?.choices?.[0]?.message ?? {};
    } catch {
      break;
    }

    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (!toolCalls.length) {
      final = String(msg.content ?? "").trim();
      break;
    }

    mensajes.push({
      role: "assistant",
      content: String(msg.content ?? ""),
      tool_calls: toolCalls,
    });

    mensajes.push({
      role: "system",
      content:
        "Ya ejecutaste herramientas en este turno: cuando redactes la respuesta final, basate ÚNICAMENTE en esos resultados citando la fuente. PROHIBIDO sugerirle al usuario que revise noticias/análisis por su cuenta o derivarlo a otros servicios para un dato que ya podés dar vos. Si falta un dato, invocá otra herramienta ahora.",
    });

    let todaVacia = true;
    for (const tc of toolCalls) {
      const name = String(tc?.function?.name ?? "");
      const argsRaw =
        typeof tc?.function?.arguments === "string"
          ? tc.function.arguments
          : JSON.stringify(tc?.function?.arguments ?? {});
      const idTool = String(tc?.id ?? `${name}_${ronda}`);
      if (!name) continue;
      enviar({ t: "status", v: "searching", q: name.replace(/_/g, " ") });
      try {
        const out = await ejecutarTool(name, argsRaw, baseUrl, sessionId);
        for (const ev of out.eventos ?? []) enviar(ev);
        fuentes.push(...(out.fuentes ?? []));
        if (!esResultadoVacio(out.texto)) todaVacia = false;
        mensajes.push({
          role: "tool",
          tool_call_id: idTool,
          name,
          content: out.texto.slice(0, 14000),
        });
      } catch (err) {
        mensajes.push({
          role: "tool",
          tool_call_id: idTool,
          name,
          content: `ERROR ejecutando ${name}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    if (todaVacia && ronda < MAX_RONDAS_TOOLS - 1) {
      const tickerYaDado = extraerTickerDeTexto(pregunta, historial);
      mensajes.push({
        role: "system",
        content: tickerYaDado
          ? `Los datos en vivo fallaron y el usuario YA INDICÓ el activo (${tickerYaDado}). PROHIBIDO preguntar qué activo/empresa/mercado es o pedirle que lo repita: respondé con honestidad que los datos de mercado no están disponibles en este momento (proveedor saturado), nombrá ${tickerYaDado} explícitamente y sugerí reintentar en unos minutos. UNA sola vez, sin listas de intentos fallidos.`
          : "Los últimos intentos devolvieron vacío o SIN RESULTADOS. Antes de rendirte ESCALÁ: (1) probá variantes del símbolo ('<SYM>.BA' BCBA, '<SYM>-USD'/'<SYM>USDT' cripto, nombre completo de la empresa); (2) usá buscar_web('<sym> ticker cotización empresa') para identificar qué es ese símbolo y reintentá con el correcto; (3) SOLO si el usuario nunca indicó el activo ni en este mensaje ni en el hilo previo, respondé con UNA pregunta breve de aclaración (¿cripto?, ¿empresa?, ¿qué mercado?). PROHIBIDO entregar un 'no encontré' con la lista de búsquedas fallidas como cuerpo de la respuesta.",
      });
    }
  }

  // Guardia determinística anti-bucle: aunque el modelo ignore las
  // instrucciones, jamás se le escapa una pregunta de aclaración cuando el
  // usuario ya dio el activo.
  const tickerUsuario = extraerTickerDeTexto(pregunta, historial);
  if (final && RE_PIDE_ACLARACION.test(final)) {
    if (tickerUsuario) {
      final = mensajeIndisponibilidad(tickerUsuario);
    } else {
      const ultimoUser = [...historial].reverse().find((m) => m.role === "user");
      if (ultimoUser && RE_PIDE_ACLARACION.test(String(ultimoUser.content ?? ""))) {
        // El usuario ya respondió a una aclaración previa: no re-interrogar.
        final =
          "Sigo sin poder obtener esos datos del proveedor de mercado en este momento. Reintentá en unos minutos y lo resuelvo con cifras reales.";
      }
    }
  }

  if (!final.trim()) {
    final =
      "Ahora mismo no pude completar la consulta con datos reales. Probá de nuevo en unos segundos o escribile directo a Cintia por WhatsApp.";
  }

  return { final, fuentes };
}
