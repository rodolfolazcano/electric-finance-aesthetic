// Cron puente: lee estado del scanner Python y envía SOLO señales NUEVAS al canal.
// Para deploy usar cron-job.org → GET /api/cron/scanner-senales?token=TELEGRAM_WEBHOOK_SECRET
// Local: GET con token o header x-vercel-cron.

import { createFileRoute } from "@tanstack/react-router";
import { getAgentBotConfig } from "@/lib/telegram.server";
import { getTelegramConfig, sendTelegramMessage } from "@/lib/telegram.server";
import { leerEstado } from "@/lib/scanner-intermarket.server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEDUPE_FILE = join(process.cwd(), ".data", "scanner", "enviados.json");

function autorizado(req: Request): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const { secret } = getAgentBotConfig();
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (req.headers.get("x-vercel-cron")) return true;
  if (token && token === secret) return true;
  if (bearer && bearer === secret) return true;
  if (cronSecret && (token === cronSecret || bearer === cronSecret)) return true;
  return false;
}

function claveSenal(s: { tipo: string; id: string; sentido: string }): string {
  return `${s.tipo}|${s.id}|${s.sentido ?? ""}`;
}

function cargarEnviados(): Record<string, number> {
  try {
    if (!existsSync(DEDUPE_FILE)) return {};
    return JSON.parse(readFileSync(DEDUPE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function guardarEnviados(map: Record<string, number>): void {
  try {
    mkdirSync(join(process.cwd(), ".data", "scanner"), { recursive: true });
    // Limpieza: borrar > 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [k, v] of Object.entries(map)) if (typeof v === "number" && v < cutoff) delete map[k];
    writeFileSync(DEDUPE_FILE, JSON.stringify(map, null, 2));
  } catch { /* ignore */ }
}

function emojiNivel(nivel: string): string {
  return nivel === "ALERTA" ? "🔴" : nivel === "WARN" ? "🟡" : "⚪";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function manejar(request: Request): Promise<Response> {
  if (!autorizado(request)) {
    return new Response(JSON.stringify({ ok: false, motivo: "no autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const estado = leerEstado();
  if (!estado) {
    return Response.json({ ok: false, motivo: "scanner sin estado (ejecuta python scanner.py)" });
  }

  // Todas las señales nuevas (el Python ya deduplica mientras están activas;
  // acá evitamos re-enviar entre reinicios del cron).
  const enviados = cargarEnviados();
  const nuevas = estado.senales.filter((s) => !(claveSenal(s) in enviados));

  if (!nuevas.length) {
    return Response.json({
      ok: true,
      nuevas: 0,
      totalActivas: estado.senales.length,
      fase: estado.fase,
      vivo: estado.vivo,
    });
  }

  // Formato por bloques agrupados por nivel
  const porNivel: Record<string, typeof nuevas> = { ALERTA: [], WARN: [], INFO: [] };
  for (const s of nuevas) (porNivel[s.nivel] ?? porNivel.INFO).push(s);

  const bloques: string[] = [];
  const titulo = `<b>🔔 SCANNER INTERMARKET — ${escapeHtml(estado.fase?.name ?? "Fase S/D")}${estado.fase?.conf ? ` (${estado.fase.conf})` : ""}</b>`;
  bloques.push(titulo);

  for (const nivel of ["ALERTA", "WARN", "INFO"] as const) {
    const lista = porNivel[nivel]!;
    if (!lista.length) continue;
    const lineas = [`<b>— ${nivel} —</b>`];
    for (const s of lista) {
      lineas.push(`${emojiNivel(s.nivel)} <b>${escapeHtml(s.tipo)}</b>/${escapeHtml(s.id)} — ${escapeHtml(s.texto)}`);
    }
    bloques.push(lineas.join("\n"));
  }

  // Pie con eventos próximos si hay
  if (estado.eventos.length) {
    bloques.push(
      `<i>Próximos catalysts: ${estado.eventos
        .slice(0, 4)
        .map((e) => `${escapeHtml(e.ticker)} ${escapeHtml(e.fecha)}`)
        .join(", ")}</i>`,
    );
  }

  // Empaquetar bloques en mensajes ≤ 3800 sin cortar bloque
  const partes: string[] = [];
  let cur = "";
  for (const b of bloques) {
    const cand = cur ? cur + "\n\n" + b : b;
    if (cand.length <= 3800) cur = cand;
    else {
      if (cur) partes.push(cur);
      cur = b;
    }
  }
  if (cur) partes.push(cur);

  const { token, chatIds, enabled } = getTelegramConfig();
  if (!enabled || !token || !chatIds.length) {
    return Response.json({ ok: false, motivo: "telegram no configurado", nuevas: nuevas.length });
  }

  for (const cid of chatIds) {
    for (const parte of partes) {
      await sendTelegramMessage({ text: parte, chatId: cid, parseMode: "HTML" });
    }
  }

  // Marcar como enviadas
  const ahora = Date.now();
  for (const s of nuevas) enviados[claveSenal(s)] = ahora;
  guardarEnviados(enviados);

  return Response.json({
    ok: true,
    nuevas: nuevas.length,
    enviadas: partes.length * chatIds.length,
    totalActivas: estado.senales.length,
    fase: estado.fase,
    vivo: estado.vivo,
  });
}

export const Route = createFileRoute("/api/cron/scanner-senales")({
  server: {
    handlers: {
      GET: async ({ request }) => manejar(request),
      POST: async ({ request }) => manejar(request),
    },
  },
});
