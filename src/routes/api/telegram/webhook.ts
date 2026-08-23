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
import {
  getAgentBotConfig,
  sendAgentChatAction,
  sendAgentMessage,
  sendAgentPhoto,
  buildQuickChartUrl,
  sendAgentPhotoBuffer,
  downloadAgentFileAsBase64,
  describirImagenBase64,
  transcribirAudioBase64,
} from "@/lib/telegram.server";

type Msg = { role: "user" | "assistant"; content: string };

type TgChat = { id: number; type?: string; username?: string; title?: string };
type TgPhoto = { file_id: string; file_size?: number; width?: number; height?: number };
type TgMessage = {
  message_id?: number;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: TgPhoto[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
  voice?: { file_id: string; duration?: number };
  audio?: { file_id: string; duration?: number };
  video?: { file_id: string; duration?: number };
  video_note?: { file_id: string; duration?: number };
};
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
  // Link markdown [texto](url) -> <a href="url">texto</a> (no duplicar URL)
  s = s.replace(
    LINK_RE,
    (_m, texto: string, url: string) => `<a href="${url}">${texto.trim()}</a>`,
  );
  s = s.replace(BOLD_RE, "<b>$1</b>");
  // Tablas markdown -> monoespacio para Telegram
  if (s.includes("|") && s.includes("---")) {
    s = s.replace(/\|/g, " | ");
  }
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

type ResultadoAgente = { texto: string; charts: Array<Record<string, unknown>> };

async function consultarAgente(
  base: string,
  pregunta: string,
  sessionId: string,
): Promise<ResultadoAgente> {
  const historia = (historias.get(sessionId) ?? []).slice(-HISTORIA_MAX);
  const mensajes = [...historia, { role: "user" as const, content: pregunta }];

  // Vercel maxDuration ~60s en pro, 10s hobby -> 45s es el límite práctico
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: mensajes, sessionId }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(`/api/chat respondio HTTP ${res.status}`);
  }

  const partes: string[] = [];
  const fuentes = new Map<string, { dominio?: string; title?: string }>();
  let informeTitulo = "";
  const charts: Array<Record<string, unknown>> = [];

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
        } else if (ev.t === "chart" && ev.v && typeof ev.v === "object") {
          charts.push(ev.v as Record<string, unknown>);
        }
      } catch {
        /* linea parcial o no-JSON: ignorar */
      }
    }
  }

  let texto = partes.join("").trim();
  // Si el orquestador devolvió "_El asistente tuvo un problema transitorio._" lo convertimos en mensaje honesto
  if (texto.includes("problema transitorio")) {
    texto = texto.replace(
      /_El asistente tuvo un problema transitorio\. Podés volver a intentar en unos segundos o escribirle directo a Cintia por WhatsApp\._/,
      "Tuve un inconveniente puntual generando ese gráfico/dato. Probá reformulando (ej. 'GGAL.BA' sin '1 AÑO' o 'riesgo país últimos 6 meses') o reintentá en unos segundos.",
    );
  }
  if (!texto && !informeTitulo && !charts.length) {
    texto = "El agente no devolvio contenido. Probá de nuevo en unos segundos.";
  }
  if (informeTitulo) {
    texto += `\n\nInforme generado: "${informeTitulo}" (descargable desde el chat web).`;
  }
  // No agregamos texto genérico de gráfico: lo enviaremos como foto
  if (fuentes.size) {
    const dominios = [...fuentes.values()]
      .slice(0, 5)
      .map((f) => `- ${f.dominio ?? ""}${f.title ? `: ${f.title}` : ""}`);
    texto += "\n\nFuentes:\n" + dominios.join("\n");
  }
  return { texto, charts };
}

async function responderMensaje(req: Request, msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  let text = (msg.text ?? msg.caption ?? "").trim();
  let multimodalContext = "";

  // ── Multimodal: foto / documento imagen / voz / audio / video ──
  try {
    // Foto (Telegram envía array de tamaños, el último es el más grande)
    if (msg.photo?.length) {
      const fileId = msg.photo[msg.photo.length - 1]!.file_id;
      await sendAgentChatAction(chatId);
      const file = await downloadAgentFileAsBase64(fileId);
      if (file) {
        const desc = await describirImagenBase64(
          file.base64,
          "image/jpeg",
          text || "Analiza esta imagen financiera",
        );
        multimodalContext = `[IMAGEN ADJUNTA — descripción visión IA]:\n${desc}`;
      } else {
        multimodalContext = `[Imagen adjunta recibida — no se pudo descargar para visión]`;
      }
    } else if (
      msg.document?.file_id &&
      (msg.document.mime_type?.startsWith("image/") ||
        msg.document.file_name?.match(/\.(jpg|jpeg|png|webp|heic)$/i))
    ) {
      const fileId = msg.document.file_id;
      await sendAgentChatAction(chatId);
      const file = await downloadAgentFileAsBase64(fileId);
      if (file) {
        const mime = msg.document.mime_type ?? "image/jpeg";
        const desc = await describirImagenBase64(file.base64, mime, text);
        multimodalContext = `[IMAGEN (documento) — visión IA]:\n${desc}`;
      }
    } else if (msg.voice?.file_id) {
      const fileId = msg.voice.file_id;
      await sendAgentChatAction(chatId);
      const file = await downloadAgentFileAsBase64(fileId);
      if (file) {
        const tr = await transcribirAudioBase64(file.base64, file.mime);
        multimodalContext = `[AUDIO DE VOZ TRANSCRIPTO]: ${tr}`;
        if (!text) text = tr; // si no había texto, usar la transcripción como pregunta
      }
    } else if (msg.audio?.file_id) {
      const fileId = msg.audio.file_id;
      await sendAgentChatAction(chatId);
      const file = await downloadAgentFileAsBase64(fileId);
      if (file) {
        const tr = await transcribirAudioBase64(file.base64, file.mime);
        multimodalContext = `[AUDIO TRANSCRIPTO]: ${tr}`;
        if (!text) text = tr;
      }
    } else if (msg.video?.file_id || msg.video_note?.file_id) {
      const fileId = (msg.video ?? msg.video_note)!.file_id;
      await sendAgentChatAction(chatId);
      // Para video, intentamos transcribir audio + describir frame (usamos audio por ahora)
      const file = await downloadAgentFileAsBase64(fileId);
      if (file) {
        // Intentar transcribir; si es video sin audio claro, describir como imagen
        if (file.mime.startsWith("video/")) {
          multimodalContext = `[VIDEO ADJUNTO recibido — duración ${msg.video?.duration ?? msg.video_note?.duration ?? "?"}s. Si tiene audio, fue transcripto abajo. Por favor describe qué ves si es gráfico.]`;
          // También intentar transcribir audio del video si es posible
          try {
            const tr = await transcribirAudioBase64(file.base64, file.mime);
            if (tr && !tr.includes("Error"))
              multimodalContext += `\n[Transcripción de audio del video]: ${tr}`;
          } catch {}
        }
      } else {
        multimodalContext = `[Video adjunto recibido]`;
      }
    }
  } catch (e) {
    console.error("[TG multimodal] error", e);
  }

  // Combinar contexto multimodal con texto del usuario
  if (multimodalContext) {
    text =
      multimodalContext +
      (text
        ? `\n\n[Mensaje del usuario]: ${text}`
        : "\n\n[Analiza el contenido adjunto y responde en español rioplatense, citando datos visibles]");
  }

  if (!text.trim()) return;

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
        '- Escribí "informe matutino" para el resumen del día',
        "",
        "Comandos:",
        "/reset - borra la memoria de esta conversacion",
        "",
        "Aviso: informacion educativa, no recomendacion de inversion.",
      ].join("\n"),
    );
    return;
  }

  // Alias /informe y /agenda -> lenguaje natural para que use el mismo pipeline que el web
  let preguntaNatural = text;
  if (low.startsWith("/informe") || low.startsWith("/matutino") || low.startsWith("/agenda")) {
    preguntaNatural = low.startsWith("/agenda")
      ? "Mostrá la agenda económica de hoy con horarios y relevancia"
      : "Generá el informe matutino 'Lo que hay que saber esta mañana' con radar internacional, radar local y agenda del día";
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
    const res = await consultarAgente(base, preguntaNatural, sessionId);
    await sendAgentMessage(chatId, markdownATelegramHtml(res.texto));

    // Enviar graficos como foto (QuickChart) — paridad con el chat web que los renderiza inline
    for (const ch of res.charts) {
      try {
        const tipo = String((ch as { tipo?: string }).tipo ?? "linea");
        if (tipo === "linea" && Array.isArray((ch as { serie?: unknown }).serie)) {
          const serie = (ch.serie as Array<{ f: string; v: number }>) ?? [];
          const titulo = String((ch as { titulo?: string }).titulo ?? "Gráfico");
          const unidad = String((ch as { unidad?: string }).unidad ?? "");
          if (serie.length) {
            const url = buildQuickChartUrl(titulo, serie, unidad);
            await sendAgentPhoto(chatId, url, `<b>${escaparHtml(titulo)}</b>`);
          }
        } else if (tipo === "barras") {
          const titulo = String((ch as { titulo?: string }).titulo ?? "Comparativa");
          const cats = (ch as { categorias?: string[] }).categorias ?? [];
          const vals = (ch as { valores?: number[] }).valores ?? [];
          if (cats.length && vals.length) {
            const cfg = {
              type: "bar",
              data: {
                labels: cats,
                datasets: [{ label: titulo, data: vals, backgroundColor: "rgba(14,165,233,0.6)" }],
              },
              options: { title: { display: true, text: titulo } },
            };
            const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}&width=800&height=400&backgroundColor=white`;
            await sendAgentPhoto(chatId, url, `<b>${escaparHtml(titulo)}</b>`);
          }
        } else if (tipo === "tradingview") {
          const simbolo = String((ch as { simbolo?: string }).simbolo ?? "");
          if (simbolo) {
            // Descarga el snapshot del gráfico TradingView y lo envía como adjunto
            let enviadoFotoTv = false;
            try {
              const { fetchTradingViewSnapshot } =
                await import("@/lib/tradingview-snapshot.server");
              const snap = await fetchTradingViewSnapshot({
                ticker: simbolo,
                interval: String((ch as { intervalo?: string }).intervalo ?? "1D"),
              });
              if (snap.ok && snap.buffer) {
                const urlTv = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(simbolo)}`;
                enviadoFotoTv = await sendAgentPhotoBuffer(chatId, snap.buffer, {
                  caption: `<b>${escaparHtml(simbolo)}</b> — Gráfico TradingView`,
                  inlineUrl: urlTv,
                  inlineText: "Abrir interactivo en TradingView",
                });
              }
            } catch (e) {
              console.error("[AGENTE TG] snapshot TV fallo", e);
            }
            if (!enviadoFotoTv) {
              await sendAgentMessage(
                chatId,
                `Gráfico TradingView: <a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(simbolo)}">${escaparHtml(simbolo)}</a> (abrir en web/app para ver velas interactivas)`,
              );
            }
          }
        }
      } catch (e) {
        console.error("[AGENTE TG] chart send fallo", e);
      }
    }

    const historia = historias.get(sessionId) ?? [];
    historia.push({ role: "user", content: preguntaNatural });
    historia.push({ role: "assistant", content: res.texto.slice(0, 2000) });
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
        const tieneContenido =
          !!msg?.chat &&
          (!!msg.text?.trim() ||
            !!msg.caption?.trim() ||
            !!msg.photo?.length ||
            !!msg.document?.file_id ||
            !!msg.voice?.file_id ||
            !!msg.audio?.file_id ||
            !!msg.video?.file_id ||
            !!msg.video_note?.file_id);
        if (!tieneContenido) {
          return new Response("OK", { status: 200 });
        }

        // Allowlist: solo chats autorizados gastan cuota del LLM.
        if (allowedChats.length && !allowedChats.includes(String(msg.chat.id))) {
          console.log("[AGENTE TG] chat no autorizado:", msg.chat.id);
          // Feedback honesto en vez de silencio (paridad con web que siempre responde)
          await sendAgentMessage(
            msg.chat.id,
            "Este bot es privado de Cintia Boos. Si tenés acceso, pedile a Cintia que agregue tu chat ID. Tu ID: <code>" +
              escaparHtml(String(msg.chat.id)) +
              "</code>",
          ).catch(() => undefined);
          return new Response("OK", { status: 200 });
        }

        // Procesamiento sincrono: Telegram reintenta si tardamos y el dedup absorbe los duplicados.
        await responderMensaje(request, msg);
        return new Response("OK", { status: 200 });
      },
    },
  },
});
