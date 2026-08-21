// Telegram — bot coronar_inversiones_bot (CORONAR)
// Server-only. Envía señales y mensajes via Bot API.
// Config via .env:
//   TELEGRAM_BOT_TOKEN=1234567890:AAH...  (obtenido de @BotFather al crear el bot)
//   TELEGRAM_CHAT_ID=123456789  (ID del chat/canal donde enviar; múltiples separados por coma en TELEGRAM_CHAT_IDS)
//   TELEGRAM_ENABLED=true
//
// Obtener chat_id:
//  1) Hablale a @coronar_inversiones_bot en Telegram (/start)
//  2) GET https://api.telegram.org/bot<TOKEN>/getUpdates  -> el campo message.chat.id o channel_post.chat.id
//  3) Opcional: reenvía un mensaje a @userinfobot para ver tu ID.
//
// BotFather flow recordado:
//   /newbot -> nombre: CORONAR -> username: coronar_inversiones_bot -> token

import "./ai/env.server";

const MAX_TEXT = 4000;

function env(name: string): string | undefined {
  const v = process.env[name];
  if (v && String(v).trim()) return String(v).trim();
  const ie = (import.meta as unknown as { env?: Record<string, unknown> }).env?.[name];
  if (typeof ie === "string" && ie.trim()) return ie.trim();
  return undefined;
}

export function getTelegramConfig(): { token: string; chatIds: string[]; enabled: boolean } {
  const token = env("TELEGRAM_BOT_TOKEN") ?? "";
  const single = env("TELEGRAM_CHAT_ID") ?? "";
  const multi = env("TELEGRAM_CHAT_IDS") ?? "";
  const raw = multi || single;
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
  if (!token) return "[TELEGRAM ERROR] Falta TELEGRAM_BOT_TOKEN en .env — obtenelo de @BotFather con /token";
  const targets = args.chatId ? [args.chatId] : chatIds;
  if (!targets.length) return "[TELEGRAM ERROR] Falta TELEGRAM_CHAT_ID (o TELEGRAM_CHAT_IDS). Obtenelo via getUpdates tras enviar /start a @coronar_inversiones_bot";

  const text = args.text.length > MAX_TEXT ? args.text.slice(0, MAX_TEXT) + "\n...[truncado]" : args.text;
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
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
      if (!res.ok || data.ok === false) {
        results.push(`[FAIL chat ${chatId}] ${res.status} ${data.description ?? await res.text().catch(() => "?")}`);
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
  lines.push(`Ticker: <b>${escapeHtml(a.ticker.toUpperCase())}</b>${a.precio != null ? `  Precio: $${a.precio.toFixed(2)}` : ""}${a.variacion1d != null ? `  (${a.variacion1d >= 0 ? "+" : ""}${a.variacion1d.toFixed(2)}%)` : ""}`);
  if (a.nivel) lines.push(`Nivel: ${escapeHtml(a.nivel)}`);
  if (a.motivo) lines.push(`Motivo: ${escapeHtml(a.motivo)}`);
  if (a.fuente) lines.push(`Fuente: ${escapeHtml(a.fuente)}`);
  lines.push(``);
  lines.push(`Bot: @coronar_inversiones_bot`);
  lines.push(`Aviso: informacion educativa, no es recomendacion de inversion. Verifica siempre en tu broker.`);
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
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(6000) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string; first_name?: string; id?: number }; description?: string };
  if (!data.ok) return `[TELEGRAM ERROR] getMe fallo: ${data.description ?? res.status}`;
  const r = data.result!;
  return `[TELEGRAM OK] Bot @${r.username} (${r.first_name}) id=${r.id}`;
}

export async function telegramGetUpdates(): Promise<string> {
  const { token } = getTelegramConfig();
  if (!token) return "[TELEGRAM ERROR] Falta TELEGRAM_BOT_TOKEN";
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(8000) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: Array<{ message?: { chat?: { id: number; type: string; title?: string; username?: string }; text?: string }; channel_post?: { chat?: { id: number; type: string } } }>; description?: string };
  if (!data.ok) return `[TELEGRAM ERROR] getUpdates fallo: ${data.description ?? res.status}`;
  const rows = (data.result ?? []).slice(-10);
  if (!rows.length) return "[TELEGRAM] Sin updates — enviale /start a @coronar_inversiones_bot y reintenta";
  return rows
    .map((u, i) => {
      const chat = u.message?.chat ?? u.channel_post?.chat;
      const txt = u.message?.text ?? u.channel_post?.chat ? "(channel_post)" : "";
      return `${i + 1}. chat_id=${chat?.id ?? "?"} type=${chat?.type ?? "?"} ${chat?.username ? "@" + chat.username : chat?.title ?? ""} text=${(txt ?? "").slice(0, 60)}`;
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
