import { NOMBRE_HERRAMIENTAS } from "@/lib/agents/herramientas";
import {
  ejecutarTool,
  llamarModelo,
  type ApiMsg,
  type OpcionesOrquestador,
  type ResultadoTurno,
} from "@/lib/agents/orquestador";
import type { FuenteMercado } from "@/lib/mercado.server";

const MAX_RONDAS_TOOLS = 5;

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
  }

  if (!final.trim()) {
    final =
      "Ahora mismo no pude completar la consulta con datos reales. Probá de nuevo en unos segundos o escribile directo a Cintia por WhatsApp.";
  }

  return { final, fuentes };
}
