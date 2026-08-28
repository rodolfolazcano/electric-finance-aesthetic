import { createFileRoute } from "@tanstack/react-router";
import { correrCiclo } from "../../../lib/bot-unificado/motor";
import { arrancarBotUnificado } from "../../../lib/bot-unificado/scheduler";
import { CRON_SECRET_FALLBACK, getCronSecret } from "../../../lib/telegram.server";

const WEBHOOK_SECRET_FALLBACK = "coronar_whsec_fpxbs777_9c41e7a2b8d3";

function autorizado(req: Request): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const cronSecret = getCronSecret();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? WEBHOOK_SECRET_FALLBACK;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (req.headers.get("x-vercel-cron")) return true;
  if (token && (token === cronSecret || token === webhookSecret || token === CRON_SECRET_FALLBACK)) return true;
  if (bearer && (bearer === cronSecret || bearer === webhookSecret || bearer === CRON_SECRET_FALLBACK)) return true;
  // Permitir sin token en dev local (sin VERCEL) para test manual
  if (!process.env.VERCEL && !process.env.CRON_SECRET) return true;
  return false;
}

async function manejar(request: Request): Promise<Response> {
  if (!autorizado(request)) {
    return new Response(JSON.stringify({ ok: false, motivo: "no autorizado — usa ?token=CRON_SECRET o header Authorization Bearer" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  arrancarBotUnificado();
  const url = new URL(request.url);
  const estrategiasParam = url.searchParams.get("estrategias");
  const estrategias = estrategiasParam ? estrategiasParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const forzar = url.searchParams.get("forzar") === "1" || url.searchParams.get("forzar") === "true";
  try {
    const resultado = await correrCiclo({ disparo: "cron-externo", estrategiasFiltro: estrategias, forzar });
    return Response.json({ ok: true, ...resultado });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, motivo: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/cron/bot-unificado")({
  server: {
    handlers: {
      GET: async ({ request }) => manejar(request),
      POST: async ({ request }) => manejar(request),
    },
  },
});
