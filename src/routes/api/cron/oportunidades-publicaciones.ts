// Cron: el agente RAZONA oportunidades del día y las publica en formato 🚀
// al bot de publicaciones (@Coronarinversiones777_bot). Anti-duplicado diario.
//
// Disparo manual:
//   GET /api/cron/oportunidades-publicaciones?token=<TELEGRAM_WEBHOOK_SECRET>&tema=cripto&max=4
// Vercel Cron: header x-vercel-cron aceptado automáticamente.

import { createFileRoute } from "@tanstack/react-router";
import { getAgentBotConfig } from "@/lib/telegram.server";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";

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

async function manejar(request: Request): Promise<Response> {
  if (!autorizado(request)) {
    return Response.json({ ok: false, motivo: "no autorizado" }, { status: 401 });
  }
  const url = new URL(request.url);
  const tema = url.searchParams.get("tema") ?? "auto";
  const max = Number(url.searchParams.get("max") ?? "4") || 4;

  // Anti-duplicado: una publicación por tema+fecha
  const fecha = new Date().toISOString().slice(0, 10);
  const clave = `oportunidades:${tema}:${fecha}`;
  const dir = path.join(process.cwd(), ".data", "publicaciones");
  const p = path.join(dir, "enviadas.json");
  try {
    await mkdir(dir, { recursive: true });
    const previo = JSON.parse(await readFile(p, "utf-8").catch(() => "{}")) as Record<string, unknown>;
    if (previo[clave]) {
      return Response.json({ ok: true, publicado: false, motivo: `ya publicada hoy (${clave})` });
    }

    const { publicarOportunidades } = await import("@/lib/publicacion.server");
    const out = await publicarOportunidades(JSON.stringify({ tema, max }));

    if (out.ok) {
      previo[clave] = { fecha, ts: Date.now() };
      const tmp = `${p}.tmp.${Date.now()}`;
      await writeFile(tmp, JSON.stringify(previo), "utf-8");
      await rename(tmp, p);
    }

    return Response.json({ ok: out.ok, publicado: out.ok, clave, detalle: out.texto.slice(0, 800) });
  } catch (e: unknown) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("[oportunidades-publicaciones] error:", detalle);
    return Response.json({ ok: false, motivo: detalle }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/oportunidades-publicaciones")({
  server: {
    handlers: {
      GET: async ({ request }) => manejar(request),
      POST: async ({ request }) => manejar(request),
    },
  },
});
