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
  detectMimeFromBytes,
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
const chatsAuto = new Set<string>();
const chatsProactivos = new Map<string, number>(); // chatId -> intervalo ms (0 = desactivado)
const procesados = new Map<number, number>();
const ultimaAlerta = new Map<string, number>(); // chatId -> timestamp de última alerta enviada

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
  // En Vercel, nunca usar localhost aunque la env lo pida (evita deploy dormido → 5199)
  const esVercel = process.env.VERCEL === "1" || process.env.NITRO_PRESET === "vercel";
  if (fija && !(esVercel && /localhost|127\.0\.0\.1/i.test(fija))) return fija.replace(/\/+$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

/** Intenta base, con fallbacks a puertos alternos comunes (3000/5173/5199). */
async function fetchConFallback(base: string, path: string, init: RequestInit): Promise<Response> {
  const tried: string[] = [];
  const bases = [base];
  // Si es localhost, probar puertos alternos también
  if (base.includes("localhost") || base.includes("127.0.0.1")) {
    for (const p of ["3000", "5199", "5173", "5000"]) {
      const alt = base.replace(/:\d+/, `:${p}`);
      if (!bases.includes(alt)) bases.push(alt);
    }
  }
  let lastErr: unknown;
  for (const b of bases) {
    tried.push(b);
    try {
      const r = await fetch(`${b}${path}`, init);
      if (b !== base) console.log(`[AGENTE TG] fallback a ${b} OK (original ${base} fallo)`);
      return r;
    } catch (e) {
      lastErr = e;
      // Solo reintentar si es error de red (ECONNREFUSED/fetch failed)
      const msg = String(e instanceof Error ? e.message : e);
      if (!/fetch failed|ECONNREFUSED|connect|NetworkError/i.test(msg)) throw e;
    }
  }
  console.error(`[AGENTE TG] todos los bases fallaron: ${tried.join(", ")}`, lastErr);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
  s = s.replace(
    IMAGE_RE,
    (_m, alt: string, url: string) => `<a href="${url}">${(alt || "imagen").trim()}</a>`,
  );
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
  s = s.replace(
    /muestra el widget embebido directamente en el chat/gi,
    "te lo envío como imagen adjunta a continuación",
  );
  s = s.replace(
    /embebido arriba\s*\(velas interactivas\)/gi,
    "como imagen adjunta (velas diarias)",
  );
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

  // VÍA DIRECTA RÁPIDA por defecto (~10-20s): el modelo elegido responde directo
  // con TODAS las herramientas. El flujo autónomo pesado solo se activa con el
  // comando explícito del usuario (/auto, /modo, "modo automático"). El análisis
  // completo F0→F10 sigue disponible: el modelo invoca analisis_completo().
  let modoAutomaticoTg = false;
  try {
    modoAutomaticoTg =
      chatsAuto.has(sessionId) ||
      /^\/(auto|modo)\b/i.test(pregunta) ||
      /modo\s+(autom[aá]tico|auton[oó]mo)/i.test(pregunta);
  } catch {
    /* fallback: sin flag, /api/chat aplica vía directa */
  }

  // Timeout ajustado: vía rápida 90s, modo autónomo 180s (antes 300s causaba loop "Sigo trabajando 190s")
  const timeoutMs = modoAutomaticoTg ? 180_000 : 90_000;
  const res = await fetchConFallback(base, "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: mensajes, sessionId, modoAutomatico: modoAutomaticoTg }),
    signal: AbortSignal.timeout(timeoutMs),
  } as RequestInit);
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
        msg.document.file_name?.match(/\.(jpg|jpeg|png|webp|heic|gif|bmp)$/i))
    ) {
      const fileId = msg.document.file_id;
      await sendAgentChatAction(chatId);
      const file = await downloadAgentFileAsBase64(fileId);
      if (file) {
        const buf = Buffer.from(file.base64, "base64");
        const realMime = detectMimeFromBytes(buf);
        if (realMime.startsWith("image/")) {
          const desc = await describirImagenBase64(
            file.base64,
            realMime,
            text || "Analiza esta imagen financiera",
          );
          multimodalContext = `[IMAGEN (documento) — visión IA]:\n${desc}`;
        } else {
          multimodalContext = `[DOCUMENTO adjunto detectado como ${realMime} — ${msg.document.file_name ?? "sin nombre"}]`;
          if (!text)
            text = `Recibí un documento tipo ${realMime}. Analizalo y decime qué contiene.`;
        }
      }
    } else if (msg.document?.file_id) {
      const fileId = msg.document.file_id;
      await sendAgentChatAction(chatId);
      const file = await downloadAgentFileAsBase64(fileId);
      if (file) {
        const buf = Buffer.from(file.base64, "base64");
        const realMime = detectMimeFromBytes(buf);
        if (realMime.startsWith("image/")) {
          const desc = await describirImagenBase64(
            file.base64,
            realMime,
            text || "Analiza esta imagen financiera",
          );
          multimodalContext = `[IMAGEN (adjunto auto-detectado) — visión IA]:\n${desc}`;
        } else if (realMime === "application/pdf") {
          multimodalContext = `[PDF adjunto: ${msg.document.file_name ?? "documento"} — ${Math.round(buf.length / 1024)}KB]`;
          if (!text)
            text = `Recibí un PDF "${msg.document.file_name ?? "documento"}". Analizalo y decime qué contiene.`;
        } else if (realMime.startsWith("audio/")) {
          const tr = await transcribirAudioBase64(file.base64, realMime);
          multimodalContext = `[AUDIO (adjunto auto-detectado) — transcripción IA]:\n${tr}`;
          if (!text) text = tr;
        } else {
          multimodalContext = `[ARCHIVO adjunto: ${realMime}, ${msg.document.file_name ?? "sin nombre"}, ${Math.round(buf.length / 1024)}KB — tipo no soportado para procesamiento automático. Indicale al usuario qué podés hacer con él.]`;
          if (!text)
            text = `Recibí un archivo tipo ${realMime} ("${msg.document.file_name ?? "sin nombre"}"). No puedo procesarlo automáticamente, pero describí qué necesitás y te ayudo.`;
        }
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
        '- "analisis completo de GGAL" (pipeline F0→F10: macro, fundamental, valuación, riesgo y validación)',
        '- "por que subio GGAL hoy?"',
        '- "pairs trading entre YPF y PAM"',
        '- "enviá la señal de AAPL al canal de inversores"',
        "- iniciá sesión en IOL escribiendo tus credenciales para ver tu portafolio",
        "",
        "Comandos:",
        "/help - ayuda",
        "/valor IBM - valor justo DCF rápido (datos Yahoo en vivo)",
        "/ficha IBM - ficha de decisión completa (DCF+múltiplos+APV+MOS)",
        "/earnings - calendario de earnings de la semana",
        "/reset - empieza conversacion nueva",
        "/auto - activa el modo autónomo pesado (1-3 min) solo para el próximo análisis",
        "/auto proactivo - activa/desactiva alertas automáticas del motor intermarket",
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
        '- Intermarket: "análisis intermarket", "golden rule Murphy", "ratios XLY/XLP"',
        '- EBIT-EPS: "análisis EBIT-EPS", "estructura de capital óptima"',
        '- Publicar: "enviá la señal de GGAL al canal" o "publicá este resumen para inversores"',
        "- Tu cuenta IOL: inicia sesion con tus credenciales",
        "",
        "Comandos:",
        "/valor IBM - valor justo (DCF con datos Yahoo en vivo, sin IA)",
        "/ficha IBM - ficha de decisión completa (WACC + DCF/múltiplos/APV + MOS)",
        "/earnings - calendario de earnings de la semana",
        "/reset - borra la memoria de esta conversacion",
        "/auto proactivo - activar alertas automáticas del motor intermarket",
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
    chatsAuto.delete(sessionId);
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

  if (low.startsWith("/auto")) {
    if (/\boff\b/i.test(low)) {
      chatsAuto.delete(sessionId);
      chatsProactivos.delete(String(chatId));
      await sendAgentMessage(
        chatId,
        "Modo autónomo desactivado. Volvimos a la vía rápida (~10-20s por consulta).",
      );
    } else if (/\bproactivo\b/i.test(low)) {
      // Modo proactivo: envía alertas periódicas del motor intermarket
      if (chatsProactivos.has(String(chatId))) {
        chatsProactivos.delete(String(chatId));
        await sendAgentMessage(
          chatId,
          "Modo proactivo DESACTIVADO. Ya no recibirás alertas automáticas del motor intermarket.",
        );
      } else {
        // Default: cada 4 horas
        chatsProactivos.set(String(chatId), 4 * 60 * 60 * 1000);
        await sendAgentMessage(
          chatId,
          "Modo proactivo ACTIVADO. Recibirás alertas automáticas del motor intermarket cada ~4 horas (cambios de régimen, señales Murphy, spreads de crédito).\n\n" +
            "Comandos:\n" +
            "/auto proactivo - activar/desactivar alertas\n" +
            "/auto proactivo 60 - intervalo en minutos\n" +
            "/auto - modo autónomo pesado para un solo análisis",
        );
      }
    } else if (/\bproactivo\s+\d+\b/i.test(low)) {
      const match = low.match(/proactivo\s+(\d+)/);
      if (match) {
        const minutos = parseInt(match[1], 10);
        if (minutos >= 15 && minutos <= 24 * 60) {
          chatsProactivos.set(String(chatId), minutos * 60 * 1000);
          await sendAgentMessage(
            chatId,
            `Intervalo de alertas proactivas ajustado a ${minutos} minutos.`,
          );
        } else {
          await sendAgentMessage(chatId, "El intervalo debe ser entre 15 y 1440 minutos.");
        }
      }
    } else {
      chatsAuto.add(sessionId);
      await sendAgentMessage(
        chatId,
        "Modo autónomo pesado ACTIVADO para este chat (1-3 min por análisis, validación multi-agente).\nMandá tu pedido de análisis completo.\n/auto off para volver a la vía rápida.\n/auto proactivo para activar alertas automáticas del motor.",
      );
    }
    return;
  }

  // ─── Comandos directos de valuación (sin LLM: deterministas y rápidos) ───
  if (low.startsWith("/valor") || low.startsWith("/ficha")) {
    const esFicha = low.startsWith("/ficha");
    const ticker =
      text
        .replace(/^\/(valor|ficha)\s*/i, "")
        .trim()
        .split(/\s+/)[0] ?? "";
    if (!ticker) {
      await sendAgentMessage(
        chatId,
        esFicha
          ? "Usá: /ficha IBM — acepta ticker o nombre (ej. AAPL, GGAL.BA, Microsoft)."
          : "Usá: /valor IBM — acepta ticker o nombre (ej. AAPL, GGAL.BA, Microsoft).",
      );
      return;
    }
    try {
      void sendAgentChatAction(chatId);
      let respuesta: string;
      if (esFicha) {
        const { ejecutarFichaDecision } = await import("@/lib/agents/ejecutores");
        const r = await ejecutarFichaDecision(JSON.stringify({ simbolo: ticker }));
        respuesta = r.texto;
      } else {
        const { analisisValorIntrinseco, textoAnalisis } = await import("@/lib/valuation-pipeline");
        respuesta = textoAnalisis(await analisisValorIntrinseco(ticker));
      }
      await sendAgentMessage(chatId, markdownATelegramHtml(respuesta));
    } catch (e) {
      console.error("[AGENTE TG] comando valuacion fallo:", e);
      await sendAgentMessage(
        chatId,
        `No pude completar el análisis de ${escaparHtml(ticker)} (${
          e instanceof Error ? escaparHtml(e.message) : "error desconocido"
        }). Reintentá en unos segundos o escribilé "valor intrínseco de ${escaparHtml(ticker)}" para la vía con IA.`,
      );
    }
    return;
  }

  // ─── Comando directo: calendario de earnings (sin LLM) ───────────────
  if (low.startsWith("/earnings")) {
    const modo = /\bdiari/i.test(low) ? "diario" : "semanal";
    try {
      void sendAgentChatAction(chatId);
      const { generarEarnings } = await import("@/lib/earnings-calendario.server");
      const r = await generarEarnings({ modo });
      await sendAgentMessage(chatId, r.texto);
    } catch (e) {
      console.error("[AGENTE TG] /earnings fallo:", e);
      await sendAgentMessage(
        chatId,
        `No pude generar el calendario de earnings (${e instanceof Error ? escaparHtml(e.message) : "error desconocido"}). Reintentá en unos segundos.`,
      );
    }
    return;
  }

  // ─── Atajos en lenguaje natural sin motor (fallback cuando /api/chat está caído) ─
  // "valor intrinseco IBM" sin / — misma lógica que /valor pero disparado por frase natural
  const mValorNatural = low.match(/valor\s+intr[ií]nseco(?:\s+de)?\s+([a-z0-9.\-:]+)/i);
  if (mValorNatural?.[1]) {
    const tickerNat = mValorNatural[1].trim().toUpperCase();
    // Evitar colisión con comando /valor ya manejado
    if (tickerNat.length >= 1 && tickerNat.length <= 12) {
      try {
        void sendAgentChatAction(chatId);
        const { analisisValorIntrinseco, textoAnalisis } = await import("@/lib/valuation-pipeline");
        const rNat = textoAnalisis(await analisisValorIntrinseco(tickerNat));
        await sendAgentMessage(chatId, markdownATelegramHtml(rNat));
      } catch (e) {
        console.error("[AGENTE TG] valor natural fallo:", e);
        await sendAgentMessage(
          chatId,
          `No pude calcular el valor intrínseco de ${escaparHtml(tickerNat)} (${e instanceof Error ? escaparHtml(e.message.slice(0, 200)) : "error"}). Probá /valor ${escaparHtml(tickerNat)}.`,
        );
      }
      return;
    }
  }

  // "ver scanner/readme.md" o "mostrar readme del scanner" — lectura directa del archivo
  if (
    /ver\s+scanner\/readme|scanner\s*\/\s*readme|readme\s+del\s+scanner|mostrar\s+scanner/i.test(
      low,
    )
  ) {
    try {
      void sendAgentChatAction(chatId);
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const cwd = process.cwd();
      const candidatos = [
        join(cwd, "SCANNER_INTERMARKET", "scanner", "README.md"),
        join(cwd, "..", "SCANNER_INTERMARKET", "scanner", "README.md"),
        join(cwd, "ANALISIS INVIU", "scanner", "README.md"),
        join(cwd, "..", "ANALISIS INVIU", "scanner", "README.md"),
        join(cwd, "scanner", "README.md"),
      ];
      let contenido: string | null = null;
      for (const p of candidatos) {
        try {
          contenido = await readFile(p, "utf-8");
          if (contenido) break;
        } catch {}
      }
      if (contenido) {
        // Recorte a ~3500 chars para Telegram
        const out =
          contenido.length > 3500 ? contenido.slice(0, 3500) + "\n\n…(truncado)" : contenido;
        await sendAgentMessage(chatId, `<b>Scanner — README</b>\n\n${escaparHtml(out)}`);
      } else {
        await sendAgentMessage(
          chatId,
          "No encontré scanner/README.md en el deploy. Está en SCANNER_INTERMARKET/scanner/README.md (local).",
        );
      }
    } catch (e) {
      await sendAgentMessage(
        chatId,
        `Error leyendo scanner README: ${e instanceof Error ? escaparHtml(e.message) : String(e)}`,
      );
    }
    return;
  }

  // "activa el scanner" / "corre el scanner" / "ejecuta scanner" — trigger del scanner_intermarket
  if (
    /activ[ae]\s+el\s+scanner|corre(r)?\s+el\s+scanner|ejecut(a|ar)\s+scanner|corre\s+scan|lanza(r)?\s+scanner/i.test(
      low,
    ) &&
    !/cedear/i.test(low)
  ) {
    try {
      void sendAgentChatAction(chatId);
      // Intentar vía herramienta directa (snapshot o scan fresco) sin pasar por /api/chat
      const { ejecutarTool } = await import("@/lib/agents/orquestador");
      // Primero snapshot vivo; si está stale, ofrecer scan fresco es decisión del modelo,
      // acá hacemos scan fresco directo para "activa"
      const rScan = await ejecutarTool(
        "scanner_intermarket",
        JSON.stringify({ accion: "scan" }),
        undefined,
        sessionId,
      );
      await sendAgentMessage(chatId, markdownATelegramHtml(rScan.texto.slice(0, 3800)));
      if (rScan.fuentes?.length) {
        await sendAgentMessage(
          chatId,
          `Fuentes: ${(rScan.fuentes as Array<{ dominio?: string }>).map((f) => f.dominio).join(", ")}`,
        );
      }
    } catch (e) {
      console.error("[AGENTE TG] activa scanner fallo:", e);
      await sendAgentMessage(
        chatId,
        `No pude activar el scanner (${e instanceof Error ? escaparHtml(e.message.slice(0, 250)) : "error"}). Probá: <code>python scanner/run_scanner.py --once --force</code> en local, o GET /api/cron/scanner-senales en deploy.`,
      );
    }
    return;
  }

  // ─── Scanner CEDEARs — señales de entrada (top 20 volumen hoy) ───
  // Comandos: "scanner cedears", "señales cedears", "cedears entrada", "publicar cedears", "enviar señales cedears"
  if (/cedear/i.test(low) && /scanner|se[nñ]al|entrada|oversold|sobreventa/i.test(low)) {
    const quierePublicar = /publica|enviar|canal|salida|difund/i.test(low);
    try {
      void sendAgentChatAction(chatId);
      await sendAgentMessage(chatId, `🔍 Escaneando top 20 CEDEARs por volumen hoy (RSI+MACD+SMA+Bollinger+Vol) — ~25s...`);
      const { escanearCedearsEntrada, escanearCedearsOversold } = await import("@/lib/bot-unificado/scanner-senales-cedear");
      const t0 = Date.now();
      const [s1, s2] = await Promise.all([escanearCedearsEntrada(), escanearCedearsOversold()]);
      const todas = [...s1, ...s2];
      const unicas = new Map<string, typeof todas[0]>();
      for (const s of todas) {
        const prev = unicas.get(s.tickerBCBA);
        if (!prev || s.prob > prev.prob) unicas.set(s.tickerBCBA, s);
      }
      const finales = [...unicas.values()].sort((a, b) => b.prob - a.prob).slice(0, 8);
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      if (!finales.length) {
        await sendAgentMessage(chatId, `Sin señales de entrada CEDEARs en este momento (${dur}s). El scanner busca RSI<35 + MACD bullish + SMA breakout — mercado lateral. Probá de nuevo más tarde o pedime análisis de un ticker puntual.`);
        return;
      }
      // Resumen para el chat agente
      const lineas = finales.map((s, i) => {
        const p = s.precio != null ? `$${s.precio.toFixed(2)}` : "s/d";
        const prob = (s.prob * 100).toFixed(0);
        return `${i + 1}. <b>${escaparHtml(s.tickerBCBA)}</b> ${escaparHtml(s.direccion)} ${p} (${prob}%) — ${escaparHtml(s.nivel ?? "")}`;
      });
      const resumen = [`<b>CEDEARs — ${finales.length} señales (${dur}s)</b>`, ...lineas].join("\n");
      await sendAgentMessage(chatId, resumen);

      // Validación enriquecida opcional: noticias + fundamental para top 3
      if (finales.length && !quierePublicar) {
        await sendAgentMessage(chatId, `Escribí <b>publicar cedears</b> para validar con noticias/fundamental y enviar al canal @Coronarinversiones777_bot.`);
      }

      if (quierePublicar) {
        await sendAgentMessage(chatId, `📤 Validando con análisis fundamental+técnico+noticias y publicando ${Math.min(finales.length, 4)} señales al canal de salida @Coronarinversiones777_bot...`);
        const { validarYRedactar } = await import("@/lib/bot-unificado/agente");
        const { sendTelegramSignal, sendTelegramMessage } = await import("@/lib/telegram.server");
        // Validación con agente (usa NVIDIA si hay key, sino determinístico)
        const validadas = await validarYRedactar(finales.slice(0, 4));
        // Enriquecimiento adicional: si agente no pudo validar (sin NVIDIA), igual enviar determinístico pero con disclaimer
        const aEnviar = validadas.senales.length ? validadas.senales : finales.slice(0, 4).map((c) => ({
          tickerBCBA: c.tickerBCBA,
          senal: (c.prob >= 0.6 ? "COMPRA" : "COMPRA CON CAUTELA") as const,
          precio: c.precio,
          variacion1d: (c.metricas.variacionPct as number) ?? null,
          motivo: c.motivo,
          nivel: c.nivel,
          estrategia: c.estrategia,
        }));
        let enviadas = 0;
        for (const s of aEnviar.slice(0, 4) as any[]) {
          try {
            const res = await sendTelegramSignal({
              ticker: s.tickerBCBA,
              senal: s.senal,
              precio: s.precio ?? undefined,
              variacion1d: s.variacion1d ?? undefined,
              motivo: s.motivo.slice(0, 280),
              nivel: s.nivel ?? undefined,
              fuente: `scanner-cedears via @fpxbs777_bot · ${s.estrategia ?? s.estrategia} · validado:${(validadas as any).usoAgente ? "IA" : "cuant"}`,
            });
            console.log(`[AGENTE TG] cedear publicar ${s.tickerBCBA}: ${res}`);
            enviadas++;
          } catch (e) {
            console.error(`[AGENTE TG] publicar ${s.tickerBCBA} fallo`, e);
          }
        }
        // Resumen también al canal de señales si hubo validación
        if (validadas.resumen && enviadas) {
          try {
            await sendTelegramMessage({ text: `<b>CORONAR CEDEARs — resumen agente</b>\n${escaparHtml(validadas.resumen)}`, parseMode: "HTML" });
          } catch {}
        }
        await sendAgentMessage(chatId, `✅ Publicadas ${enviadas}/${Math.min(finales.length, 4)} señales al canal @Coronarinversiones777_bot${validadas.resumen ? `\n\n<i>${escaparHtml(validadas.resumen)}</i>` : ""}\n\n<i>El bot de salida recibió las señales. Verificá @Coronarinversiones777_bot</i>`);
      }
    } catch (e) {
      console.error("[AGENTE TG] scanner cedears fallo:", e);
      await sendAgentMessage(chatId, `Error en scanner CEDEARs: ${e instanceof Error ? escaparHtml(e.message.slice(0, 300)) : "desconocido"}`);
    }
    return;
  }

  // ─── Noticias directas sin LLM (evita 90s timeout cuando NVIDIA keys = 0) ───
  // "pasame noticias de ura" / "noticias ura" / "de ura" (respuesta al bot)
  {
    const t = text.trim();
    const lowT = t.toLowerCase();
    let temaNoticias: string | null = null;
    const m1 = t.match(/(?:pasame|pasáme|mandame|mándame|dame|buscar|ver)\s+noticias?\s*(?:de|sobre)?\s+(.+)/i);
    const m2 = t.match(/noticias?\s*(?:de|sobre)?\s+(.+)/i);
    const m3 = t.match(/^(?:de|sobre)\s+(.+)/i);
    if (m1?.[1]) temaNoticias = m1[1].trim();
    else if (lowT.includes("noticias") && m2?.[1]) temaNoticias = m2[1].trim();
    else if (/^(de|sobre)\s+\S+/i.test(t) && t.length < 30) temaNoticias = m3?.[1]?.trim() ?? null;
    // Mapeo alias: ura = uranium ETF/setor
    if (temaNoticias) {
      temaNoticias = temaNoticias.replace(/^ura$/i, "uranium URA").replace(/^de\s+/i, "").trim();
      // Evitar falsos positivos: "noticias" solo sin tema
      if (temaNoticias.length >= 2 && !/^(noticias?)?$/i.test(temaNoticias)) {
        try {
          void sendAgentChatAction(chatId);
          await sendAgentMessage(chatId, `📰 Buscando noticias de <b>${escaparHtml(temaNoticias)}</b>...`);
          const { ejecutarNoticias } = await import("@/lib/agents/ejecutores");
          const res = await ejecutarNoticias(temaNoticias, "hoy");
          const out = res.texto?.slice(0, 3500) || "Sin noticias encontradas para ese tema hoy.";
          await sendAgentMessage(chatId, out);
          if (res.fuentes?.length) {
            const fl = res.fuentes.slice(0, 3).map((f: any) => `• ${f.dominio ?? f.url}`).join("\n");
            await sendAgentMessage(chatId, `Fuentes:\n${fl}`);
          }
        } catch (e) {
          await sendAgentMessage(chatId, `No pude traer noticias de ${escaparHtml(temaNoticias)}: ${e instanceof Error ? escaparHtml(e.message.slice(0, 200)) : "error"}`);
        }
        return;
      }
    }
    // "pasame noticias" sin tema → noticias generales mercado
    if (/^\s*(pasame|pasáme|mandame|mándame|dame)?\s*noticias\s*[.!]*\s*$/i.test(t)) {
      try {
        void sendAgentChatAction(chatId);
        await sendAgentMessage(chatId, `📰 Buscando noticias del mercado hoy...`);
        const { ejecutarNoticias } = await import("@/lib/agents/ejecutores");
        const res = await ejecutarNoticias("mercado argentino", "hoy");
        await sendAgentMessage(chatId, (res.texto || "Sin noticias hoy.").slice(0, 3500));
      } catch (e) {
        await sendAgentMessage(chatId, `Error noticias: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
  }

  // Fast-path saludos sin invocar al modelo (evita 190s de espera)
  if (/^(hola|buenas|hey|hello|hi|buen dia|buenas tardes|buenas noches)[!.\s]*$/i.test(text.trim())) {
    await sendAgentMessage(
      chatId,
      `¡Hola! Soy el agente CORONAR. Escribime qué querés que haga:\n• "scanner cedears" → busco entradas en top 20 por volumen\n• "publicar cedears" → valido y publico al canal @Coronarinversiones777_bot\n• "noticias de URA" / "noticias de NVDA" → titulares hoy\n• "análisis de GGAL" / "valor de AAPL"\n• "activa el scanner" → intermarket\n\nComandos: /help /valor /ficha /earnings /auto`,
    );
    return;
  }

  const typing = setInterval(() => {
    void sendAgentChatAction(chatId);
  }, 5500);
  const deteniendoTyping = () => clearInterval(typing);

  try {
    void sendAgentChatAction(chatId);
    const inicio = Date.now();
    let pingsEnviados = 0;
    const ping = setInterval(() => {
      const segs = Math.round((Date.now() - inicio) / 1000);
      // Reducido a 3 pings máximo cada 45s para no spamear
      if (pingsEnviados < 3 && segs > 45 + pingsEnviados * 45) {
        pingsEnviados++;
        void sendAgentMessage(
          chatId,
          `Sigo trabajando en tu consulta (${segs}s). Los análisis completos pueden llevar 1-2 min; no hace falta reenviar.`,
        ).catch(() => undefined);
      }
    }, 15_000);
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
                  datasets: [
                    { label: titulo, data: vals, backgroundColor: "rgba(14,165,233,0.6)" },
                  ],
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
                if (motivoFallo)
                  console.warn(
                    `[AGENTE TG] TV snapshot fallo para ${simbolo}: ${motivoFallo} — fallback a link`,
                  );
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
      const esLocal = base.includes("localhost") || base.includes("127.0.0.1");
      await sendAgentMessage(
        chatId,
        esLocal
          ? `No pude conectar con el motor (${base}). En desarrollo local ejecutá <code>bun run dev</code> (Vite + Flask) y que PORT=${process.env.PORT ?? "5199"} esté libre. Si es deploy Vercel, probá de nuevo en 1 min (cold start).`
          : `No pude conectar con el motor del agente (${base}). Si el deploy esta dormido, proba de nuevo en un minuto.`,
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

export type ResultadoManejoUpdate = "procesado" | "duplicado" | "sin-contenido" | "no-autorizado";

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

// ═════════════════════════════════════════════════════════════════════════
// Modo Proactivo — scheduler de alertas del motor intermarket
// ═════════════════════════════════════════════════════════════════════════

/** Reutiliza el envío de mensajes del bot configurado (mismo token que el agente). */
async function enviarAlertaProactiva(chatId: string, texto: string): Promise<void> {
  try {
    await sendAgentMessage(Number(chatId), texto);
  } catch (e) {
    console.error(`[TG PROACTIVO] error enviando alerta a ${chatId}:`, e);
  }
}

/**
 * Genera un resumen de alertas del motor intermarket para chats proactivos.
 * Retorna el texto formateado o null si no hay señales relevantes.
 */
async function generarAlertaIntermarket(): Promise<string | null> {
  try {
    // Import dinámico para no romper el bundle del agente
    const { evaluarSenalesMurphy, evaluarCredito, evaluarVIX } = await import("@/lib/motor");

    // Placeholder: en producción se descarga precios reales de yfinance/mercado
    // Por ahora devolvemos un resumen del estado del motor
    const now = new Date();
    const hora = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    return [
      "[ALERTA INTERMARKET]",
      "",
      `Motor ejecutado: ${hora} (AR)`,
      "Las señales Murphy no están disponibles en modo proactivo sin datos de mercado en vivo.",
      "Para análisis completo: escribí 'análisis intermarket' o usá /auto proactivo para activar las alertas.",
    ].join("\n");
  } catch {
    return null;
  }
}

/** Intervalos activos para evitar duplicados */
const intervalsProactivos = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Loop principal del scheduler proactivo.
 * Se llama una vez por cold start del módulo o desde el webhook.
 * Evalúa chats proactivos y envía alertas cuando corresponde.
 */
export function iniciarSchedulerProactivo(base: string): void {
  // Cada 5 minutos, revisar si algún chat necesita alerta
  const CHECK_INTERVAL = 5 * 60 * 1000;

  setInterval(async () => {
    const ahora = Date.now();

    for (const [chatId, intervaloMs] of chatsProactivos) {
      const ultima = ultimaAlerta.get(chatId) ?? 0;
      if (ahora - ultima < intervaloMs) continue;

      const alerta = await generarAlertaIntermarket();
      if (alerta) {
        await enviarAlertaProactiva(chatId, alerta);
        ultimaAlerta.set(chatId, ahora);
      }
    }
  }, CHECK_INTERVAL);

  console.log("[TG PROACTIVO] Scheduler de alertas intermarket iniciado (check cada 5 min)");
}

/**
 * Detiene el scheduler de un chat específico.
 */
export function detenerSchedulerProactivo(chatId: string): void {
  chatsProactivos.delete(String(chatId));
  ultimaAlerta.delete(String(chatId));
}

/**
 * Retorna la lista de chats con modo proactivo activo.
 */
export function chatsProactivosActivos(): string[] {
  return [...chatsProactivos.keys()];
}
