// Telegram — bots CORONAR (repo privado, credenciales hardcodeadas a proposito)
//   1) @Coronarinversiones777_bot — CANAL DE SEÑALES AUTOMATICAS (noticias, apertura/cierre, senales unificadas)
//      Token: 8984569191:AAE_p-0OdWv4REoicaKEBeAA3UO1wP9k1So  (BotFather 2026-08-22)
//   2) @fpxbs777_bot — AGENTE CONVERSACIONAL 24/7 (ver bloque AGENTE abajo)
// Server-only. Envía señales y mensajes via Bot API.
// Config via .env (opcional, fallback hardcodeado):
//   TELEGRAM_BOT_TOKEN=8984569191:AAE_p-0OdWv4REoicaKEBeAA3UO1wP9k1So
//   TELEGRAM_CHAT_ID=8179198652  (ID de Cintia; múltiples separados por coma en TELEGRAM_CHAT_IDS)
//   TELEGRAM_ENABLED=true
//
// Obtener chat_id:
//  1) Hablale a @Coronarinversiones777_bot en Telegram (/start)
//  2) GET https://api.telegram.org/bot<TOKEN>/getUpdates  -> el campo message.chat.id o channel_post.chat.id
//  3) Opcional: reenvía un mensaje a @userinfobot para ver tu ID.

import "./ai/env.server";

const MAX_TEXT = 4000;

function env(name: string): string | undefined {
  const v = process.env[name];
  if (v && String(v).trim()) return String(v).trim();
  const ie = (import.meta as unknown as { env?: Record<string, unknown> }).env?.[name];
  if (typeof ie === "string" && ie.trim()) return ie.trim();
  return undefined;
}

const SIGNALS_TOKEN_FALLBACK = "8984569191:AAE_p-0OdWv4REoicaKEBeAA3UO1wP9k1So"; // @Coronarinversiones777_bot — canal señales automaticas
const SIGNALS_CHAT_FALLBACK = "8179198652"; // Cintia — dueña

export function getTelegramConfig(): { token: string; chatIds: string[]; enabled: boolean } {
  const token = env("TELEGRAM_BOT_TOKEN") ?? SIGNALS_TOKEN_FALLBACK;
  const single = env("TELEGRAM_CHAT_ID") ?? "";
  const multi = env("TELEGRAM_CHAT_IDS") ?? "";
  const raw = multi || single || SIGNALS_CHAT_FALLBACK;
  const chatIds = raw
    .split(/[,\s;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const enabled = (env("TELEGRAM_ENABLED") ?? "true").toLowerCase() !== "false";
  return { token, chatIds, enabled };
}

export function isTelegramConfigured(): boolean {
  const { token, chatIds } = getTelegramConfig();
  return Boolean(token && chatIds.length > 0);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type SendTelegramArgs = {
  text: string;
  chatId?: string;
  parseMode?: "HTML" | "MarkdownV2" | "Markdown";
  disablePreview?: boolean;
};

export async function sendTelegramMessage(args: SendTelegramArgs): Promise<string> {
  const { token, chatIds, enabled } = getTelegramConfig();
  if (!enabled) return "[TELEGRAM] Deshabilitado (TELEGRAM_ENABLED=false)";
  if (!token)
    return "[TELEGRAM ERROR] Falta TELEGRAM_BOT_TOKEN en .env — obtenelo de @BotFather con /token";
  const targets = args.chatId ? [args.chatId] : chatIds;
  if (!targets.length)
    return "[TELEGRAM ERROR] Falta TELEGRAM_CHAT_ID (o TELEGRAM_CHAT_IDS). Obtenelo via getUpdates tras enviar /start a @Coronarinversiones777_bot";

  const text =
    args.text.length > MAX_TEXT ? args.text.slice(0, MAX_TEXT) + "\n...[truncado]" : args.text;
  const results: string[] = [];
  for (const chatId of targets) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: args.disablePreview ?? true,
    };
    if (args.parseMode) body.parse_mode = args.parseMode;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        description?: string;
        result?: unknown;
      };
      if (!res.ok || data.ok === false) {
        results.push(
          `[FAIL chat ${chatId}] ${res.status} ${data.description ?? (await res.text().catch(() => "?"))}`,
        );
      } else {
        results.push(`[OK chat ${chatId}] mensaje enviado (${text.length} chars)`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push(`[ERROR chat ${chatId}] ${msg.slice(0, 300)}`);
    }
  }
  return results.join("\n");
}

export type TelegramSignalArgs = {
  ticker: string;
  senal: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA" | string;
  precio?: number | null;
  variacion1d?: number | null;
  motivo?: string;
  nivel?: string;
  chatId?: string;
  fuente?: string;
};

export function formatSignalForTelegram(a: TelegramSignalArgs): string {
  const lines: string[] = [];
  lines.push(`<b>CORONAR — Senal ${escapeHtml(a.senal)}</b>`);
  lines.push(
    `Ticker: <b>${escapeHtml(a.ticker.toUpperCase())}</b>${a.precio != null ? `  Precio: $${a.precio.toFixed(2)}` : ""}${a.variacion1d != null ? `  (${a.variacion1d >= 0 ? "+" : ""}${a.variacion1d.toFixed(2)}%)` : ""}`,
  );
  if (a.nivel) lines.push(`Nivel: ${escapeHtml(a.nivel)}`);
  if (a.motivo) lines.push(`Motivo: ${escapeHtml(a.motivo)}`);
  if (a.fuente) lines.push(`Fuente: ${escapeHtml(a.fuente)}`);
  lines.push(``);
  lines.push(`Bot: @Coronarinversiones777_bot`);
  lines.push(
    `Aviso: informacion educativa, no es recomendacion de inversion. Verifica siempre en tu broker.`,
  );
  // Sin emojis por requerimiento de formato unificado
  return lines.join("\n");
}

export async function sendTelegramSignal(args: TelegramSignalArgs): Promise<string> {
  const text = formatSignalForTelegram(args);
  return sendTelegramMessage({ text, chatId: args.chatId, parseMode: "HTML" });
}

export async function telegramGetBotInfo(): Promise<string> {
  const { token } = getTelegramConfig();
  if (!token) return "[TELEGRAM ERROR] Falta TELEGRAM_BOT_TOKEN";
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    signal: AbortSignal.timeout(6000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: { username?: string; first_name?: string; id?: number };
    description?: string;
  };
  if (!data.ok) return `[TELEGRAM ERROR] getMe fallo: ${data.description ?? res.status}`;
  const r = data.result!;
  return `[TELEGRAM OK] Bot @${r.username} (${r.first_name}) id=${r.id}`;
}

export async function telegramGetUpdates(): Promise<string> {
  const { token } = getTelegramConfig();
  if (!token) return "[TELEGRAM ERROR] Falta TELEGRAM_BOT_TOKEN";
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: Array<{
      message?: {
        chat?: { id: number; type: string; title?: string; username?: string };
        text?: string;
      };
      channel_post?: { chat?: { id: number; type: string } };
    }>;
    description?: string;
  };
  if (!data.ok) return `[TELEGRAM ERROR] getUpdates fallo: ${data.description ?? res.status}`;
  const rows = (data.result ?? []).slice(-10);
  if (!rows.length)
    return "[TELEGRAM] Sin updates — enviale /start a @Coronarinversiones777_bot y reintenta";
  return rows
    .map((u, i) => {
      const chat = (u.message?.chat ?? u.channel_post?.chat) as
        { id?: number; type?: string; username?: string; title?: string } | undefined;
      const txt = u.message?.text ?? (u.channel_post ? "(channel_post)" : "");
      return `${i + 1}. chat_id=${chat?.id ?? "?"} type=${chat?.type ?? "?"} ${chat?.username ? "@" + chat.username : (chat?.title ?? "")} text=${(txt ?? "").slice(0, 60)}`;
    })
    .join("\n");
}

export async function broadcastExistingSignalToTelegram(input: {
  ticker: string;
  senal: string;
  precio?: number | null;
  motivos?: string[];
  fuente?: string;
}): Promise<string> {
  return sendTelegramSignal({
    ticker: input.ticker,
    senal: input.senal,
    precio: input.precio ?? undefined,
    motivo: input.motivos?.slice(0, 2).join(" | "),
    fuente: input.fuente ?? "CORONAR",
  });
}

// ---------------------------------------------------------------------------
// Bot dedicado del AGENTE IA (@fpxbs777_bot) — chat en lenguaje natural 24/7.
// Usa el MISMO pipeline que el chat lateral de la UI via /api/chat
// (orquestador + planner + ~48 herramientas + RAG base conocimiento + skills).
// Credenciales embebidas a proposito: repositorio privado, decision del
// propietario. Si se rotan, actualizar aca o definir las env vars de abajo.
//   TELEGRAM_AGENT_BOT_TOKEN / TELEGRAM_AGENT_CHAT_IDS / TELEGRAM_WEBHOOK_SECRET
// ---------------------------------------------------------------------------

const AGENT_TOKEN_FALLBACK = "8947154888:AAHtQG4zeBw42rTcASv1jyTQn9YByl0HIr0";
const AGENT_ALLOWED_CHATS_FALLBACK = "8179198652"; // Cintia (dueña del bot)
const AGENT_WEBHOOK_SECRET_FALLBACK = "coronar_whsec_fpxbs777_9c41e7a2b8d3";

export function getAgentBotConfig(): {
  token: string;
  allowedChats: string[];
  secret: string;
} {
  const token = env("TELEGRAM_AGENT_BOT_TOKEN") ?? AGENT_TOKEN_FALLBACK;
  const rawChats = env("TELEGRAM_AGENT_CHAT_IDS") ?? AGENT_ALLOWED_CHATS_FALLBACK;
  const allowedChats = rawChats
    .split(/[,\s;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const secret = env("TELEGRAM_WEBHOOK_SECRET") ?? AGENT_WEBHOOK_SECRET_FALLBACK;
  return { token, allowedChats, secret };
}

type AgentApiResponse = { ok?: boolean; result?: unknown; description?: string };

async function agentApi(
  method: string,
  body?: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<AgentApiResponse> {
  const { token } = getAgentBotConfig();
  if (!token) return { ok: false, description: "Falta token del bot agente" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return (await res
      .json()
      .catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as AgentApiResponse;
  } catch (e: unknown) {
    return { ok: false, description: e instanceof Error ? e.message : String(e) };
  }
}

export async function agentGetMe(): Promise<string> {
  const data = await agentApi("getMe");
  if (!data.ok) return `[AGENTE TG ERROR] getMe fallo: ${data.description}`;
  const r = data.result as { username?: string; first_name?: string; id?: number };
  return `[AGENTE TG OK] @${r.username} (${r.first_name}) id=${r.id}`;
}

export async function sendAgentChatAction(
  chatId: string | number,
  action = "typing",
): Promise<void> {
  await agentApi("sendChatAction", { chat_id: chatId, action }, 8000);
}

/** Envia un texto al chat indicado. HTML con fallback a plano. Chunking 3800. */
export async function sendAgentMessage(chatId: string | number, text: string): Promise<void> {
  const limpio = (text || "(respuesta vacia)").trim();
  for (let i = 0; i < limpio.length; i += 3800) {
    const parte = limpio.slice(i, i + 3800);
    let res = await agentApi("sendMessage", {
      chat_id: chatId,
      text: parte,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    if (!res.ok) {
      res = await agentApi("sendMessage", {
        chat_id: chatId,
        text: parte,
        disable_web_page_preview: true,
      });
    }
    if (!res.ok) console.error("[AGENTE TG] sendMessage fallo:", res.description);
  }
}

/** Envia una foto por URL (QuickChart / TradingView snapshot) con caption opcional. */
export async function sendAgentPhoto(
  chatId: string | number,
  photoUrl: string,
  caption?: string,
): Promise<void> {
  let res = await agentApi("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    ...(caption ? { caption, parse_mode: "HTML" } : {}),
  });
  if (!res.ok) {
    // Fallback: enviar como mensaje con link si Telegram rechaza la foto
    console.error("[AGENTE TG] sendPhoto fallo:", res.description, "-> fallback link");
    await sendAgentMessage(chatId, `${caption ?? "Gráfico"}\n${photoUrl}`);
  }
}

/** Construye URL de QuickChart para serie de linea (usado por webhook para graficos). */
export function buildQuickChartUrl(
  titulo: string,
  serie: Array<{ f: string; v: number }>,
  unidad?: string,
): string {
  const labels = serie.map((p) => p.f);
  const data = serie.map((p) => p.v);
  // Muestreo para no exceder URL (max ~200 puntos)
  const step = Math.max(1, Math.ceil(labels.length / 120));
  const cl = labels.filter((_, i) => i % step === 0);
  const cd = data.filter((_, i) => i % step === 0);
  const cfg = {
    type: "line",
    data: {
      labels: cl,
      datasets: [{ label: titulo, data: cd, borderColor: "rgb(14,165,233)", fill: false, pointRadius: 0 }],
    },
    options: {
      title: { display: true, text: titulo + (unidad ? ` (${unidad})` : "") },
      legend: { display: false },
      scales: { xAxes: [{ display: false }], yAxes: [{ ticks: { beginAtZero: false } }] },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}&width=800&height=400&backgroundColor=white`;
}

export async function setAgentWebhook(url: string): Promise<string> {
  const { secret } = getAgentBotConfig();
  const data = await agentApi("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: false,
  });
  return data.ok
    ? `Webhook activo en ${url}`
    : `[TELEGRAM ERROR] setWebhook fallo: ${data.description}`;
}

export async function deleteAgentWebhook(): Promise<string> {
  const data = await agentApi("deleteWebhook", { drop_pending_updates: false });
  return data.ok
    ? "Webhook eliminado (el bot vuelve a modo polling local)"
    : `[TELEGRAM ERROR] deleteWebhook fallo: ${data.description}`;
}

export async function getAgentWebhookInfo(): Promise<string> {
  const data = await agentApi("getWebhookInfo");
  if (!data.ok) return `[TELEGRAM ERROR] getWebhookInfo fallo: ${data.description}`;
  const r = data.result as {
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
    last_error_date?: number;
  };
  const partes = [
    `url=${r.url || "(sin webhook — polling local)"}`,
    `pendientes=${r.pending_update_count ?? 0}`,
  ];
  if (r.last_error_message) {
    partes.push(
      `ultimo_error=${r.last_error_message} (${r.last_error_date ? new Date(r.last_error_date * 1000).toISOString() : "?"})`,
    );
  }
  return partes.join(" | ");
}

// ── Multimodal: archivos de Telegram (foto, voz, audio, video, documento) ──

export async function getAgentFilePath(fileId: string): Promise<string | null> {
  const data = await agentApi("getFile", { file_id: fileId });
  if (!data.ok) return null;
  const r = data.result as { file_path?: string };
  return r.file_path ?? null;
}

export async function downloadAgentFileAsBase64(fileId: string): Promise<{ base64: string; mime: string; filePath: string } | null> {
  const filePath = await getAgentFilePath(fileId);
  if (!filePath) return null;
  const { token } = getAgentBotConfig();
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const base64 = buf.toString("base64");
    const mime = filePath.endsWith(".ogg") ? "audio/ogg" : filePath.endsWith(".mp3") ? "audio/mpeg" : filePath.endsWith(".mp4") ? "video/mp4" : filePath.endsWith(".wav") ? "audio/wav" : "image/jpeg";
    return { base64, mime, filePath };
  } catch {
    return null;
  }
}

export async function describirImagenBase64(base64: string, mime: string, promptExtra?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (!apiKey) return "[Imagen recibida — sin GEMINI_API_KEY configurada, no puedo describirla. Configurá GEMINI_API_KEY para visión.]";
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey });
    const prompt = promptExtra
      ? `Analiza esta imagen. Contexto del usuario: "${promptExtra}". Describe en español rioplatense todo lo visible: texto, números, gráficos, tickers, valores. Si es un gráfico de trading, extrae ticker, precio, tendencia, soportes/resistencias. Si es captura de portfolio, lista posiciones y valorizado. Sé preciso y cita cifras visibles.`
      : "Describe esta imagen en español rioplatense con máximo detalle: todo texto visible, números, gráficos, tickers, tablas. Si es gráfico financiero, extrae ticker, valores, tendencia. Si es portfolio, lista activos y montos. No inventes lo que no ves.";
    const result: any = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mime.startsWith("image/") ? mime : "image/jpeg", data: base64 } },
          ],
        },
      ],
    });
    const text = result?.text ?? result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return text.trim() || "[Imagen recibida pero Gemini no devolvió descripción]";
  } catch (e) {
    return `[Error describiendo imagen: ${e instanceof Error ? e.message : String(e)}]`;
  }
}

export async function transcribirAudioBase64(base64: string, mime: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (!apiKey) return "[Audio recibido — sin GEMINI_API_KEY, no puedo transcribir. Configurá GEMINI_API_KEY.]";
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey });
    const result: any = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: "Transcribí este audio/voz en español rioplatense, literal y con puntuación. Si es consulta financiera, transcribí tal cual." },
            { inlineData: { mimeType: mime, data: base64 } },
          ],
        },
      ],
    });
    const text = result?.text ?? result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return text.trim() || "[Audio recibido pero no se pudo transcribir]";
  } catch (e) {
    return `[Error transcribiendo audio: ${e instanceof Error ? e.message : String(e)}]`;
  }
}
