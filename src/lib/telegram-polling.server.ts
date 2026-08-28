/**
 * Poller de Telegram para DESARROLLO LOCAL (getUpdates long polling).
 *
 * En deploy Vercel las updates llegan por webhook (/api/telegram/webhook) y
 * este poller NO arranca (VERCEL=1). En local, donde no hay URL pública para
 * que Telegram posteé webhooks, este loop mantiene el bot @fpxbs777_bot 100%
 * operativo: mismo pipeline, mismas tools, mismo agente que la UI.
 *
 * Nota: si hay un webhook activo en Telegram, getUpdates responde 409; el
 * poller lo informa una vez y reintenta lento sin romper nada.
 * Desactivar con TELEGRAM_POLLING=false.
 */

import { getAgentBotConfig } from "@/lib/telegram.server";
import {
  baseUrlPorDefecto,
  manejarUpdateTelegram,
  type TgUpdate,
} from "@/lib/telegram-agent.server";

let corriendo = false;
let aviso409 = false;

function envBool(name: string, def = true): boolean {
  const v = process.env[name];
  if (!v || !String(v).trim()) return def;
  return String(v).trim().toLowerCase() !== "false";
}

export function arrancarPollingTelegram(): void {
  if (corriendo) return;
  // HARCODEADO: en Vercel NUNCA polling — solo webhook. En local sí polling.
  // TELEGRAM_POLLING=false en Vercel desactiva, true solo local.
  const enVercel = process.env.VERCEL === "1" || process.env.NITRO_PRESET === "vercel";
  if (enVercel) {
    console.log("[TG POLLING] Vercel detectado: polling desactivado, solo webhook");
    return;
  }
  if (!envBool("TELEGRAM_POLLING")) return;
  const { token } = getAgentBotConfig();
  if (!token) return;

  corriendo = true;
  console.log("[TG POLLING] Modo desarrollo: escuchando updates de @fpxbs777_bot via getUpdates");
  void bucle(token);
}

async function bucle(token: string): Promise<void> {
  let offset = 0;
  let base = baseUrlPorDefecto();
  let fallosSeguidos = 0;

  while (corriendo) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35_000);
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offset,
          timeout: 25,
          allowed_updates: ["message", "edited_message"],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: TgUpdate[];
        description?: string;
        error_code?: number;
      };

      if (!data.ok) {
        // 409: hay webhook activo -> el poller local no es necesario ahora.
        if (data.error_code === 409) {
          if (!aviso409) {
            aviso409 = true;
            console.log("[TG POLLING] Webhook activo en Telegram; el poller queda en standby.");
          }
          await new Promise((r) => setTimeout(r, 60_000));
          continue;
        }
        throw new Error(data.description ?? `HTTP ${res.status}`);
      }
      aviso409 = false;
      fallosSeguidos = 0;

      for (const u of data.result ?? []) {
        offset = Math.max(offset, u.update_id + 1);
        // Procesamiento en fondo para no bloquear el siguiente getUpdates.
        void manejarUpdateTelegram(u, base).catch((e) =>
          console.error("[TG POLLING] error procesando update:", e),
        );
      }

      // Refresca base por si cambió el puerto durante la sesión.
      if ((data.result ?? []).length === 0) base = baseUrlPorDefecto();
    } catch (e) {
      fallosSeguidos++;
      const espera = Math.min(30_000, 3_000 * fallosSeguidos);
      console.error(
        `[TG POLLING] getUpdates fallo (${e instanceof Error ? e.message : e}); reintentando en ${espera / 1000}s`,
      );
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}
