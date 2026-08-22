import { createFileRoute } from "@tanstack/react-router";
import {
  sendTelegramMessage,
  sendTelegramSignal,
  telegramGetBotInfo,
  telegramGetUpdates,
  getTelegramConfig,
  formatSignalForTelegram,
  agentGetMe,
  setAgentWebhook,
  deleteAgentWebhook,
  getAgentWebhookInfo,
} from "@/lib/telegram.server";

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "estado";
        const { token, chatIds, enabled } = getTelegramConfig();

        // --- Bot agente (@fpxbs777_bot) ---
        if (action === "webhook") {
          const target = url.searchParams.get("url");
          if (!target || !/^https:\/\//.test(target)) {
            return Response.json(
              {
                error:
                  "Pasa la URL publica completa del webhook: ?action=webhook&url=https://TU-APP.vercel.app/api/telegram/webhook",
              },
              { status: 400 },
            );
          }
          return Response.json({ ok: true, resultado: await setAgentWebhook(target) });
        }
        if (action === "delwebhook" || action === "unwebhook") {
          return Response.json({ ok: true, resultado: await deleteAgentWebhook() });
        }
        if (action === "agente" || action === "agent") {
          return Response.json({
            ok: true,
            bot: "@fpxbs777_bot",
            me: await agentGetMe(),
            webhook: await getAgentWebhookInfo(),
          });
        }

        // --- Bot de senales (@coronar_inversiones_bot) ---
        if (action === "estado") {
          const info = await telegramGetBotInfo();
          const updates = await telegramGetUpdates();
          return Response.json({
            bot: "coronar_inversiones_bot",
            enabled,
            configured: Boolean(token && chatIds.length > 0),
            tokenSet: Boolean(token),
            chatIds,
            info,
            updates,
            hint: !token
              ? "Falta TELEGRAM_BOT_TOKEN — hablale a @BotFather /newbot -> CORONAR -> coronar_inversiones_bot y copia el token a .env"
              : !chatIds.length
                ? "Falta TELEGRAM_CHAT_ID — enviale /start a @coronar_inversiones_bot y luego GET /api/telegram?action=updates para ver tu chat_id"
                : "Listo para enviar senales",
          });
        }
        if (action === "updates") {
          const updates = await telegramGetUpdates();
          return Response.json({ updates });
        }
        if (action === "preview") {
          const sample = formatSignalForTelegram({
            ticker: "GGAL.BA",
            senal: "COMPRA CON CAUTELA",
            precio: 3450.5,
            variacion1d: 2.3,
            motivo: "Score 84/100 — ROE 18% y beta 0.9",
            fuente: "Demo",
          });
          return Response.json({ preview: sample });
        }
        return Response.json(
          {
            error:
              "action no valida: usa ?action=estado|updates|preview|agente|webhook&url=|delwebhook",
          },
          { status: 400 },
        );
      },

      POST: async ({ request }) => {
        let body: {
          action?: string;
          text?: string;
          ticker?: string;
          senal?: string;
          precio?: number;
          variacion1d?: number;
          motivo?: string;
          nivel?: string;
          chatId?: string;
          fuente?: string;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "JSON invalido" }, { status: 400 });
        }

        const action = (body.action ?? "senal").toLowerCase();

        if (action === "mensaje" || action === "message") {
          if (!body.text?.trim()) return Response.json({ error: "Falta text" }, { status: 400 });
          const result = await sendTelegramMessage({
            text: body.text,
            chatId: body.chatId,
            parseMode: "HTML",
          });
          return Response.json({ ok: true, result });
        }

        if (action === "senal" || action === "signal") {
          if (!body.ticker?.trim() || !body.senal?.trim())
            return Response.json({ error: "Falta ticker y senal" }, { status: 400 });
          const result = await sendTelegramSignal({
            ticker: body.ticker,
            senal: body.senal,
            precio: body.precio ?? null,
            variacion1d: body.variacion1d ?? null,
            motivo: body.motivo,
            nivel: body.nivel,
            chatId: body.chatId,
            fuente: body.fuente,
          });
          return Response.json({ ok: true, result });
        }

        if (action === "estado" || action === "info") {
          const info = await telegramGetBotInfo();
          const updates = await telegramGetUpdates();
          return Response.json({ ok: true, info, updates });
        }

        return Response.json({ error: "action debe ser senal|mensaje|estado" }, { status: 400 });
      },
    },
  },
});
