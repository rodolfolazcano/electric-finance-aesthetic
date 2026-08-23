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
      mensajes.push({
        role: "system",
        content:
          "Los últimos intentos devolvieron vacío o SIN RESULTADOS. Antes de rendirte ESCALÁ: (1) probá variantes del símbolo ('<SYM>.BA' BCBA, '<SYM>-USD'/'<SYM>USDT' cripto, nombre completo de la empresa); (2) usá buscar_web('<sym> ticker cotización empresa') para identificar qué es ese símbolo y reintentá con el correcto; (3) solo si TODO falla, respondé al usuario con UNA pregunta breve de aclaración (¿cripto?, ¿empresa?, ¿qué mercado?). PROHIBIDO entregar un 'no encontré' con la lista de búsquedas fallidas como cuerpo de la respuesta.",
      });
    }
  }

  if (!final.trim()) {
    final =
      "Ahora mismo no pude completar la consulta con datos reales. Probá de nuevo en unos segundos o escribile directo a Cintia por WhatsApp.";
  }

  return { final, fuentes };
}
