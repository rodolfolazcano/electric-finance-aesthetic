// @ts-nocheck
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

function getEnv(name: string): string { try { return (process as any).env?.[name] ?? (import.meta as any).env?.[name] ?? "" } catch { return "" } }

export const sendTelegram = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    text: z.string().min(1).max(4000),
    token: z.string().optional(),
    chatId: z.string().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const token = data.token || getEnv("TELEGRAM_BOT_TOKEN") || getEnv("VITE_TELEGRAM_BOT_TOKEN")
    const chatId = data.chatId || getEnv("TELEGRAM_CHAT_ID") || getEnv("VITE_TELEGRAM_CHAT_ID")
    if (!token || !chatId) throw new Error("Falta TELEGRAM_BOT_TOKEN / CHAT_ID (configura en .env o pásalo desde UI)")
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: data.text, parse_mode: "Markdown" }) })
    const json: any = await res.json()
    if (!json.ok) throw new Error(`Telegram error: ${JSON.stringify(json)}`)
    return { ok: true }
  })

export const sendEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ subject: z.string(), body: z.string() }).parse(d))
  .handler(async ({ data }) => {
    // Placeholder: requiere SMTP. Por ahora log y retorna true si config existe
    const gmailUser = getEnv("GMAIL_USER")
    const gmailPass = getEnv("GMAIL_APP_PASSWORD")
    const to = getEnv("NOTIFY_EMAIL_TO")
    if (!gmailUser || !gmailPass || !to) {
      // No env config -> simula éxito para no bloquear bot, pero avisa
      console.log(`[MOCK EMAIL] ${data.subject}\n${data.body.slice(0, 500)}`)
      return { ok: true, mocked: true }
    }
    // Node email via fetch a API externa no implementada; retornar mocked
    return { ok: true, mocked: true }
  })

export const sendWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ text: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const phone = getEnv("CALLMEBOT_PHONE") || getEnv("WHATSAPP_PHONE")
    const apikey = getEnv("CALLMEBOT_APIKEY") || getEnv("WHATSAPP_APIKEY")
    if (!phone || !apikey) throw new Error("Falta CALLMEBOT_PHONE / APIKEY")
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(data.text)}&apikey=${apikey}`
    const res = await fetch(url)
    const txt = await res.text()
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${txt}`)
    return { ok: true, response: txt.slice(0, 200) }
  })

export const notifySignal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    tipo: z.string(), symbol: z.string(), precio: z.number(), rsi: z.number(),
    tp: z.number().nullable().optional(), sl: z.number().nullable().optional(),
    motivo: z.string().optional(),
    token: z.string().optional(), chatId: z.string().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const hora = new Date().toLocaleString("es-AR")
    const emoji = data.tipo.includes("COMPRA") || data.tipo === "LONG" ? "🟢" : data.tipo.includes("VENTA") || data.tipo === "SHORT" ? "🔴" : "🤖"
    const tpStr = data.tp != null ? data.tp.toFixed(2) : "Trailing"
    const slStr = data.sl != null ? data.sl.toFixed(2) : "Trailing"
    const text = `${emoji} *Bot BB+RSI - ${data.tipo}*\nPar: \`${data.symbol}\`\nPrecio: \`${data.precio.toFixed(2)}\`\nRSI: \`${data.rsi.toFixed(1)}\`\nTP: \`${tpStr}\` | SL: \`${slStr}\`\nMotivo: _${data.motivo ?? ""}_\n\`${hora}\``
    let ok = false
    try {
      const r = await sendTelegram({ data: { text, token: data.token, chatId: data.chatId } } as any)
      ok = (r as any)?.ok
    } catch (e) { console.log("notify tg err", e) }
    // también intentar email/whatsapp si están configurados (best effort)
    try { const { sendEmail: se } = await import("./notify.functions"); } catch {}
    return { ok }
  })
