// Webhook del bot dedicado @fpxbs777_bot — agente IA por Telegram 24/7.
//
// Cada mensaje que llega aca se reenvia al MISMO pipeline que usa el chat
// lateral de la UI (POST /api/chat): orquestador con planner + ~48 herramientas
// (noticias, mercado, DCF, IOL, analisis tecnico, pairs trading...), RAG de la
// base de conocimiento interna + corpus academico, skills metodologicas y
// memoria de sesion. El webhook solo traduce Telegram <-> ese endpoint.
//
// Activacion (una vez por deploy):
//   GET /api/telegram?action=webhook&url=https://TU-APP.vercel.app/api/telegram/webhook
//
// Nota serverless: el procesamiento es sincronico y responde 200 al final.
// Los reintentos de Telegram ante timeout se deduplican por update_id.

import { createFileRoute } from "@tanstack/react-router";
import "@/lib/ai/env.server";
import { getAgentBotConfig, sendAgentChatAction, sendAgentMessage } from "@/lib/telegram.server";

type Msg = { role: "user" | "assistant"; content: string };

type TgChat = { id: number; type?: string; username?: string; title?: string };
type TgMessage = { message_id?: number; chat: TgChat; text?: string };
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
};

// Estado en memoria del modulo (best-effort en serverless: se resetea con cold start).
const historias = new Map<string, Msg[]>();
const procesados = new Map<number, number>();

const HISTORIA_MAX = 16;

function env(name: string): string | undefined {
  const v = process.env[name];
  if (v && String(v).trim()) return String(v).trim();
  const ie = (import.meta as unknown as { env?: Record<string, unknown> }).env?.[name];
  if (typeof ie === "string" && ie.trim()) return ie.trim();
  return undefined;
}

function origenDesdeRequest(req: Request): string {
  const fija = env("TELEGRAM_AGENT_API_URL");
  if (fija) return fija.replace(/\/+$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const BOLD_RE = /\*\*(?!\s)(.+?)\*\*/gs;

/** Markdown simple del modelo -> HTML de Telegram (negritas + links clickeables). */
function markdownATelegramHtml(md: string): string {
  let s = escaparHtml(md);
  s = s.replace(
    LINK_RE,
    (_m, texto: string, url: string) => `${texto.trim()}: <a href="${url}">${url}</a>`,
  );
  s = s.replace(BOLD_RE, "<b>$1</b>");
  return s;
}

function marcarProcesado(updateId: number): boolean {
  const ahora = Date.now();
  for (const [id, ts] of procesados) {
    if (ahora - ts > 10 * 60 * 1000) procesados.delete(id);
  }
  if (procesados.has(updateId)) return false;
  procesados.set(updateId, ahora);
  return true;
}

async function consultarAgente(base: string, pregunta: string, sessionId: string): Promise<string> {
  const historia = (historias.get(sessionId) ?? []).slice(-HISTORIA_MAX);
  const mensajes = [...historia, { role: "user" as const, content: pregunta }];

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: mensajes, sessionId }),
    signal: AbortSignal.timeout(280_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(`/api/chat respondio HTTP ${res.status}`);
  }

  const partes: string[] = [];
  const fuentes = new Map<string, { dominio?: string; title?: string }>();
  let informeTitulo = "";
  let hayGrafico = false;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lineas = buffer.split("\n");
    buffer = lineas.pop() ?? "";
    for (const linea of lineas) {
      const t = linea.trim();
      if (!t) continue;
      try {
        const ev = JSON.parse(t) as { t?: string; v?: unknown };
        if (ev.t === "text" && typeof ev.v === "string") partes.push(ev.v);
        else if (ev.t === "sources" && Array.isArray(ev.v)) {
          for (const f of ev.v) {
            const fu = f as { url?: string; dominio?: string; title?: string };
            if (fu?.url) fuentes.set(fu.url, fu);
          }
        } else if (ev.t === "informe" && ev.v && typeof ev.v === "object") {
          informeTitulo = String((ev.v as { titulo?: string }).titulo ?? "");
        } else if (ev.t === "chart") hayGrafico = true;
      } catch {
        /* linea parcial o no-JSON: ignorar */
      }
    }
  }

  let texto = partes.join("").trim();
  if (!texto && !informeTitulo) {
    texto = "El agente no devolvio contenido. Probá de nuevo en unos segundos.";
  }
  if (informeTitulo) {
    texto += `\n\nInforme generado: "${informeTitulo}" (descargable desde el chat web).`;
  }
  if (hayGrafico) texto += "\n\nHay un grafico interactivo listo en el chat web.";
  if (fuentes.size) {
    const dominios = [...fuentes.values()]
      .slice(0, 5)
      .map((f) => `- ${f.dominio ?? ""}${f.title ? `: ${f.title}` : ""}`);
    texto += "\n\nFuentes:\n" + dominios.join("\n");
  }
  return texto;
}

async function responderMensaje(req: Request, msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();
  if (!text) return;

  const sessionId = `tg-${chatId}`;
  const base = origenDesdeRequest(req);
  const low = text.toLowerCase();

  if (low.startsWith("/start")) {
    await sendAgentMessage(
      chatId,
      [
        "<b>Agente CORONAR conectado.</b>",
        "",
        "Soy la misma IA que el chat lateral de la web. Escribime en lenguaje natural:",
        '- "como esta el dolar blue"',
        '- "por que subio GGAL hoy?"',
        '- "analisis tecnico de AAPL"',
        '- "pairs trading entre YPF y PAM"',
        '- "cuanto vale Microsoft"',
        "- iniciá sesión en IOL escribiendo tus credenciales para ver tu portafolio",
        "",
        "Comandos:",
        "/help - ayuda",
        "/reset - empieza conversacion nueva",
      ].join("\n"),
    );
    return;
  }

  if (low.startsWith("/help")) {
    await sendAgentMessage(
      chatId,
      [
        "<b>Agente financiero CORONAR</b> (mismo motor que el chat lateral web).",
        "",
        "Que puedo hacer:",
        '- Noticias: "por que cayo AL30 hoy"',
        '- Mercado: "dolar blue", "caucion 30 dias", "riesgo pais"',
        '- Valuacion: "valor intrinseco de GOOGLE", "DCF de AAPL"',
        '- Analisis: "analisis tecnico de BTC", "score sectorial de GGAL"',
        '- Cuant: "pairs trading YPF PAM", "curva de ejecucion de AL30"',
        "- Tu cuenta IOL: inicia sesion con tus credenciales",
        "",
        "Comandos:",
        "/reset - borra la memoria de esta conversacion",
        "",
        "Aviso: informacion educativa, no recomendacion de inversion.",
      ].join("\n"),
    );
    return;
  }

  if (low.startsWith("/reset") || low.startsWith("/nuevo")) {
    historias.delete(sessionId);
    try {
      await fetch(`${base}/api/chat?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      /* sin memoria del lado servidor que limpiar */
    }
    await sendAgentMessage(chatId, "Memoria borrada. Conversacion nueva lista.");
    return;
  }

  // Pregunta en lenguaje natural -> pipeline completo del agente.
  const typing = setInterval(() => {
    void sendAgentChatAction(chatId);
  }, 4500);
  const deteniendoTyping = () => clearInterval(typing);

  try {
    void sendAgentChatAction(chatId);
    const texto = await consultarAgente(base, text, sessionId);
    await sendAgentMessage(chatId, markdownATelegramHtml(texto));

    const historia = historias.get(sessionId) ?? [];
    historia.push({ role: "user", content: text });
    historia.push({ role: "assistant", content: texto.slice(0, 2000) });
    historias.set(sessionId, historia.slice(-HISTORIA_MAX));
    if (historias.size > 100) {
      const primera = historias.keys().next().value;
      if (primera) historias.delete(primera);
    }
  } catch (e: unknown) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("[AGENTE TG] error procesando mensaje:", detalle);
    if (/fetch failed|NetworkError|ECONNREFUSED|connect/i.test(detalle)) {
      await sendAgentMessage(
        chatId,
        `No pude conectar con el motor del agente (${base}). Si el deploy esta dormido, proba de nuevo en un minuto.`,
      );
    } else if (/aborted|timeout/i.test(detalle)) {
      await sendAgentMessage(
        chatId,
        "El analisis tardo demasiado y se corto. Probá de nuevo con una pregunta mas puntual.",
      );
    } else {
      await sendAgentMessage(
        chatId,
        "Tuve un problema procesando la consulta. Probá de nuevo en unos segundos.",
      );
    }
  } finally {
    deteniendoTyping?.();
  }
}

export const Route = createFileRoute("/api/telegram/webhook")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          bot: "@fpxbs777_bot",
          hint: "POST updates de Telegram aca",
        });
      },

      POST: async ({ request }) => {
        const { allowedChats, secret } = getAgentBotConfig();

        // Verificacion de origen via secret_token de setWebhook.
        if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
          return new Response("forbidden", { status: 403 });
        }

        let update: TgUpdate;
        try {
          update = (await request.json()) as TgUpdate;
        } catch {
          return new Response("json invalido", { status: 400 });
        }

        // Dedup: si ya lo procesamos (reintento de Telegram), confirmar 200 sin reprocesar.
        if (!marcarProcesado(update.update_id)) {
          return new Response("OK", { status: 200 });
        }

        const msg = update.message ?? update.edited_message;
        if (!msg?.chat || !msg.text?.trim()) {
          return new Response("OK", { status: 200 });
        }

        // Allowlist: solo chats autorizados gastan cuota del LLM.
        if (allowedChats.length && !allowedChats.includes(String(msg.chat.id))) {
          console.log("[AGENTE TG] chat no autorizado:", msg.chat.id);
          return new Response("OK", { status: 200 });
        }

        // Procesamiento sincrono: Telegram reintenta si tardamos y el dedup absorbe los duplicados.
        await responderMensaje(request, msg);
        return new Response("OK", { status: 200 });
      },
    },
  },
});
