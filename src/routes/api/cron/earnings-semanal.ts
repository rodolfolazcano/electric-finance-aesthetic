// Cron: calendario de earnings -> Telegram (@Coronarinversiones777_bot).
//
// Descubre qué empresas reportan EPS en la ventana (semana actual + próxima o
// hoy+mañana), filtra por capitalización, enriquece con estadística de sorpresas
// (estimaciones-earnings.server.ts) y envía el mensaje cronológico con sesgo
// estadístico por empresa.
//
// Disparo manual:
//   GET /api/cron/earnings-semanal?token=<TELEGRAM_WEBHOOK_SECRET>&modo=semanal
//   GET /api/cron/earnings-semanal?token=xxx&modo=diario&topPorDia=10&minCapUsd=2000000000
// Vercel Cron envía header x-vercel-cron (aceptado automáticamente).

import { createFileRoute } from "@tanstack/react-router";
import {
  getAgentBotConfig,
  getTelegramConfig,
  sendTelegramMessage,
} from "@/lib/telegram.server";
import { generarEarnings, type ModoEarnings } from "@/lib/earnings-calendario.server";

function autorizado(req: Request): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const { secret } = getAgentBotConfig();
  const cronSecret = process.env["CRON_SECRET"];
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (req.headers.get("x-vercel-cron")) return true;
  if (token && token === secret) return true;
  if (bearer && bearer === secret) return true;
  if (cronSecret && (token === cronSecret || bearer === cronSecret)) return true;
  return false;
}

async function enviarBloques(bloques: string[]): Promise<{ chatIds: string[]; partes: number }> {
  const { token, chatIds, enabled } = getTelegramConfig();
  if (!enabled || !token) return { chatIds: [], partes: 0 };
  const partes: string[] = [];
  let current = "";
  for (const b of bloques) {
    const candidate = current ? current + "\n\n" + b : b;
    if (candidate.length <= 3800) {
      current = candidate;
    } else {
      if (current) partes.push(current);
      if (b.length > 3800) {
        const lines = b.split("\n");
        let sub = "";
        for (const line of lines) {
          const cand2 = sub ? sub + "\n" + line : line;
          if (cand2.length <= 3800) sub = cand2;
          else {
            if (sub) partes.push(sub);
            sub = line;
          }
        }
        if (sub) partes.push(sub);
        current = "";
      } else {
        current = b;
      }
    }
  }
  if (current) partes.push(current);
  for (const chatId of chatIds) {
    for (const parte of partes) {
      await sendTelegramMessage({ text: parte, chatId, parseMode: "HTML" });
    }
  }
  return { chatIds, partes: partes.length };
}

async function manejar(request: Request): Promise<Response> {
  if (!autorizado(request)) {
    return new Response(JSON.stringify({ ok: false, motivo: "no autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const modoParam = (url.searchParams.get("modo") ?? "semanal").toLowerCase();
  const modo: ModoEarnings = modoParam === "diario" ? "diario" : "semanal";
  const topPorDia = Number(url.searchParams.get("topPorDia") ?? "8") || 8;
  const minCapParam = Number(url.searchParams.get("minCapUsd") ?? "");
  const minCapUsd = isFinite(minCapParam) && minCapParam > 0 ? minCapParam : undefined;
  const limiteParam = Number(url.searchParams.get("limite") ?? "");
  const limiteUniverso = isFinite(limiteParam) && limiteParam > 0 ? limiteParam : undefined;

  try {
    const r = await generarEarnings({ modo, topPorDia, minCapUsd, limiteUniverso });

    if (!r.ok || !r.empresas.length) {
      return Response.json({ ok: false, motivo: r.texto, modo, desde: r.desde, hasta: r.hasta });
    }

    const enviados = await enviarBloques(r.bloques);

    return Response.json({
      ok: enviados.chatIds.length > 0,
      modo,
      ventana: { desde: r.desde, hasta: r.hasta },
      empresas: r.empresas.map((e) => ({
        symbol: e.symbol,
        fecha: e.fecha,
        sesgo: e.sesgo,
        marketCap: e.marketCap,
        epsEstimado: e.epsEstimado,
      })),
      omitidasPorCap: r.omitidasPorCap,
      universoEscaneado: r.universoEscaneado,
      enviadosA: enviados.chatIds,
      mensajesEnviados: enviados.partes * Math.max(1, enviados.chatIds.length),
    });
  } catch (e: unknown) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("[earnings-semanal] error:", detalle);
    return new Response(JSON.stringify({ ok: false, motivo: detalle }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/cron/earnings-semanal")({
  server: {
    handlers: {
      GET: async ({ request }) => manejar(request),
      POST: async ({ request }) => manejar(request),
    },
  },
});
