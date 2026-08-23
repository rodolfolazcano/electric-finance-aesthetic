/**
 * Núcleo del agente Telegram (@fpxbs777_bot) — compartido por:
 *  - El webhook (/api/telegram/webhook): usado en deploy Vercel.
 *  - El poller de desarrollo local (telegram-polling.server.ts): getUpdates
 *    con long polling cuando no hay URL pública para recibir webhooks.
 *
 * Traduce Telegram <-> el MISMO pipeline que el chat lateral de la UI
 * (POST /api/chat: orquestador + planner + ~48 herramientas + RAG + skills +
 * memoria de sesión + modo autónomo plan->ejecuta->valida).
 */

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

export type Msg = { role: "user" | "assistant"; content: string };

export type TgChat = { id: number; type?: string; username?: string; title?: string };
export type TgPhoto = { file_id: string; file_size?: number; width?: number; height?: number };
export type TgMessage = {
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
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
};

// Estado en memoria del módulo (best-effort en serverless: se resetea con cold start).
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

/** Base URL del motor del agente (/api/chat). Fija vía TELEGRAM_AGENT_API_URL o deducida del request. */
export function baseUrlPorDefecto(): string {
  const fija = env("TELEGRAM_AGENT_API_URL");
  if (fija) return fija.replace(/\/+$/, "");
  const host = process.env.HOST || "localhost";
  const port = process.env.PORT || "3000";
  return `http://${host}:${port}`;
}

export function origenDesdeRequest(req: Request): string {
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
const IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
const BOLD_RE = /\*\*(?!\s)(.+?)\*\*/gs;

/** Markdown simple del modelo -> HTML de Telegram (negritas + links clickeables). */
function markdownATelegramHtml(md: string): string {
  let s = escaparHtml(md);
  // Imágenes markdown ![alt](url) -> link clickeable (Telegram no renderiza ![...])
  s = s.replace(IMAGE_RE, (_m, alt: string, url: string) => `<a href="${url}">${(alt || "imagen").trim()}</a>`);
  s = s.replace(
    LINK_RE,
    (_m, texto: string, url: string) => `<a href="${url}">${texto.trim()}</a>`,
  );
  s = s.replace(BOLD_RE, "<b>$1</b>");
  // Limpia artefactos de TradingView web: "!AAPL TradingView Chart" sin URL (modelo alucina ![...] sin link)
  s = s.replace(/^!([A-Z0-9.:-]+\s+TradingView Chart)/gm, "$1");
  s = s.replace(/!([A-Z0-9.:-]+\s+TradingView Chart)/g, "$1");
  // Reescribe copy web-específico ("widget embebido / embebido arriba") para Telegram donde la imagen va como adjunto
  s = s.replace(/>\s*Nota:\s*El enlace anterior muestra el widget embebido[^\n]*\n?/gi, "");
  s = s.replace(/muestra el widget embebido directamente en el chat/gi, "te lo envío como imagen adjunta a continuación");
  s = s.replace(/embebido arriba\s*\(velas interactivas\)/gi, "como imagen adjunta (velas diarias)");
  s = s.replace(/embebido arriba/gi, "como imagen adjunta");
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

  // MODO AUTOMÁTICO por Telegram: mismo pipeline que la UI. El toggle de la UI
  // no existe acá, así que se activa cuando el mensaje pide una tarea completa
  // (misma detección esTareaAutonoma que usa /api/chat como fallback) o con
  // los comandos /auto y /modo automatico.
  let modoAutomaticoTg = false;
  try {
    const { esTareaAutonoma } = await import("@/lib/agents/autonomo");
    modoAutomaticoTg =
      esTareaAutonoma(pregunta) ||
      /^\/(auto|modo)\b/i.test(pregunta) ||
      /modo\s+(autom[aá]tico|autonomo)/i.test(pregunta);
  } catch {
    /* fallback: sin flag, /api/chat aplica su propia detección */
  }

  // Vercel (Fluid) y local: 300s cubre el modo autónomo completo.
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: mensajes, sessionId, modoAutomatico: modoAutomaticoTg }),
    signal: AbortSignal.timeout(300_000),
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
  if (texto.includes("problema transitorio")) {
    texto = texto.replace(
      /_El asistente tuvo un problema transitorio\. Podés volver a intentar en unos segundos o escribirle directo a Cintia por WhatsApp\._/,
      "Tuve un inconveniente puntual generando ese gráfico/dato. Probá reformulando o reintentá en unos segundos.",
    );
  }
  if (!texto && !informeTitulo && !charts.length) {
    texto = "El agente no devolvio contenido. Probá de nuevo en unos segundos.";
  }
  if (informeTitulo) {
    texto += `\n\nInforme generado: "${informeTitulo}" (descargable desde el chat web).`;
  }
  if (fuentes.size) {
    const dominios = [...fuentes.values()]
      .slice(0, 5)
      .map((f) => `- ${f.dominio ?? ""}${f.title ? `: ${f.title}` : ""}`);
    texto += "\n\nFuentes:\n" + dominios.join("\n");
  }
  return { texto, charts };
}

async function responderMensaje(base: string, msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  let text = (msg.text ?? msg.caption ?? "").trim();
  let multimodalContext = "";

  // Multimodal: foto / documento imagen / voz / audio / video
  try {
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
        if (!text) text = tr;
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
      const file = await downloadAgentFileAsBase64(fileId);
      if (file) {
        if (file.mime.startsWith("video/")) {
          multimodalContext = `[VIDEO ADJUNTO recibido — duración ${msg.video?.duration ?? msg.video_note?.duration ?? "?"}s. Si tiene audio, fue transcripto abajo. Por favor describe qué ves si es gráfico.]`;
          try {
            const tr = await transcribirAudioBase64(file.base64, file.mime);
            if (tr && !tr.includes("Error"))
              multimodalContext += `\n[Transcripción de audio del video]: ${tr}`;
          } catch {
            /* sin transcripción de audio disponible */
          }
        }
      } else {
        multimodalContext = `[Video adjunto recibido]`;
      }
    }
  } catch (e) {
    console.error("[TG multimodal] error", e);
  }

  if (multimodalContext) {
    text =
      multimodalContext +
      (text
        ? `\n\n[Mensaje del usuario]: ${text}`
        : "\n\n[Analiza el contenido adjunto y responde en español rioplatense, citando datos visibles]");
  }

  if (!text.trim()) return;

  const sessionId = `tg-${chatId}`;
  const low = text.toLowerCase();

  if (low.startsWith("/start")) {
    await sendAgentMessage(
      chatId,
      [
        "<b>Agente CORONAR conectado.</b>",
        "",
        "Soy la misma IA que el chat lateral de la web. Escribime en lenguaje natural:",
        '- "como esta el dolar blue"',
        '- "analisis completo de GGAL" (flujo autónomo: macro, fundamental, valuación, riesgo y validación)',
        '- "por que subio GGAL hoy?"',
        '- "pairs trading entre YPF y PAM"',
        '- "enviá la señal de AAPL al canal de inversores"',
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
        '- Mercado: "dolar blue", "caucion 30 dias", "riesgo pais"',
        '- Análisis completo: "analisis integral de YPFD" (planifica, ejecuta y valida solo)',
        '- Valuacion: "valor intrinseco de GOOGLE", "DCF de AAPL"',
        '- Cuant: "pairs trading YPF PAM", "curva de ejecucion de AL30"',
        '- Publicar: "enviá la señal de GGAL al canal" o "publicá este resumen para inversores"',
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

  const typing = setInterval(() => {
    void sendAgentChatAction(chatId);
  }, 4500);
  const deteniendoTyping = () => clearInterval(typing);

  try {
    void sendAgentChatAction(chatId);
    const inicio = Date.now();
    let pingsEnviados = 0;
    const ping = setInterval(() => {
      const segs = Math.round((Date.now() - inicio) / 1000);
      if (pingsEnviados < 9 && segs > (pingsEnviados + 1) * 30) {
        pingsEnviados++;
        void sendAgentMessage(
          chatId,
          `Sigo trabajando en tu consulta (${segs}s). Los análisis completos con validación multi-agente pueden llevar 1-3 minutos; no hace falta reenviar el mensaje.`,
        ).catch(() => undefined);
      }
    }, 10_000);
    try {
      const res = await consultarAgente(base, preguntaNatural, sessionId);
      clearInterval(ping);
      await sendAgentMessage(chatId, markdownATelegramHtml(res.texto));

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
          } else if (tipo === "flujo_bono_png") {
            const titulo = String((ch as { titulo?: string }).titulo ?? "Flujo de bonos");
            const b64 = String((ch as { pngBase64?: string }).pngBase64 ?? "");
            if (b64) {
              const buf = Buffer.from(b64, "base64");
              await sendAgentPhotoBuffer(chatId, buf, {
                caption: `<b>${escaparHtml(titulo)}</b>`,
              });
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
              // Barras genéricas siguen por QuickChart oscuro (no blanco)
              const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}&width=800&height=400&backgroundColor=%230A0E17`;
              await sendAgentPhoto(chatId, url, `<b>${escaparHtml(titulo)}</b>`);
            }
          } else if (tipo === "tradingview") {
            const simbolo = String((ch as { simbolo?: string }).simbolo ?? "");
            if (simbolo) {
              let enviadoFotoTv = false;
              let motivoFallo: string | undefined;
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
                  if (!enviadoFotoTv) motivoFallo = "sendPhotoBuffer devolvió false";
                } else {
                  motivoFallo = snap.error ?? "snapshot sin buffer";
                }
              } catch (e) {
                motivoFallo = e instanceof Error ? e.message : String(e);
                console.error("[AGENTE TG] snapshot TV fallo", motivoFallo);
              }
              if (!enviadoFotoTv) {
                if (motivoFallo) console.warn(`[AGENTE TG] TV snapshot fallo para ${simbolo}: ${motivoFallo} — fallback a link`);
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
    } catch (innerErr: unknown) {
      clearInterval(ping);
      throw innerErr;
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
        "El análisis completo superó los 5 minutos y se cortó por seguridad. Dividilo en pasos (ej: primero 'análisis fundamental de X', después el técnico) o probá de nuevo.",
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

export type ResultadoManejoUpdate =
  | "procesado"
  | "duplicado"
  | "sin-contenido"
  | "no-autorizado";

/** Punto de entrada único para un update de Telegram (webhook o polling local). */
export async function manejarUpdateTelegram(
  update: TgUpdate,
  base: string,
): Promise<ResultadoManejoUpdate> {
  const { allowedChats } = getAgentBotConfig();

  if (!marcarProcesado(update.update_id)) return "duplicado";

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
  if (!tieneContenido || !msg) return "sin-contenido";

  if (allowedChats.length && !allowedChats.includes(String(msg.chat.id))) {
    console.log("[AGENTE TG] chat no autorizado:", msg.chat.id);
    await sendAgentMessage(
      msg.chat.id,
      "Este bot es privado de Cintia Boos. Si tenés acceso, pedile a Cintia que agregue tu chat ID. Tu ID: <code>" +
        escaparHtml(String(msg.chat.id)) +
        "</code>",
    ).catch(() => undefined);
    return "no-autorizado";
  }

  await responderMensaje(base, msg);
  return "procesado";
}
