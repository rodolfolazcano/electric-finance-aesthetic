// Webhook del bot dedicado @fpxbs777_bot — agente IA por Telegram 24/7.
//
// Cada update que llega aca se procesa con el MISMO pipeline que el chat
// lateral de la UI (POST /api/chat): orquestador + planner + ~48 herramientas
// (noticias, mercado, DCF, IOL, analisis tecnico, pairs trading...), RAG de la
// base de conocimiento interna + corpus academico, skills metodologicas,
// memoria de sesion y MODO AUTONOMO (plan -> ejecuta -> valida).
//
// Modelo de ejecucion (funciona igual en local que en Vercel serverless):
//   1) Se responde 200 a Telegram INMEDIATAMENTE (sin reintentos ni cortes).
//   2) El procesamiento sigue en FONDO via waitUntil de @vercel/functions
//      (en local, el proceso node de larga duracion mantiene la promesa y
//      ademas corre el poller getUpdates de telegram-polling.server.ts).
//   3) Timeout interno del pipeline: 300s. Pings de progreso cada 30s.
//
// Activacion en deploy (una vez por dominio):
//   GET /api/telegram?action=webhook&url=https://TU-APP.vercel.app/api/telegram/webhook

import { createFileRoute } from "@tanstack/react-router";
import "@/lib/ai/env.server";
import { waitUntil as vercelWaitUntil } from "@vercel/functions";
import { getAgentBotConfig } from "@/lib/telegram.server";
import {
  manejarUpdateTelegram,
  origenDesdeRequest,
  type TgUpdate,
} from "@/lib/telegram-agent.server";

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
        const { secret } = getAgentBotConfig();

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

        // Procesamiento en FONDO: ack inmediato a Telegram (sin reintentos ni
        // cortes por maxDuration del serverless) y la respuesta llega despues.
        // El dedup por update_id dentro de manejarUpdateTelegram absorbe
        // cualquier reintento residual.
        const base = origenDesdeRequest(request);
        const trabajo = manejarUpdateTelegram(update, base).catch((e) =>
          console.error("[AGENTE TG] error en procesamiento de fondo:", e),
        );
        vercelWaitUntil(trabajo); // en Vercel mantiene viva la funcion; en local es no-op y el proceso la sostiene
        return new Response("OK", { status: 200 });
      },
    },
  },
});
