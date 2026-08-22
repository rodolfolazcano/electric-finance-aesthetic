import { eventHandler, getQuery } from "h3";
import { correrCiclo } from "../../../lib/bot-unificado/motor";
import { arrancarBotUnificado } from "../../../lib/bot-unificado/scheduler";

/**
 * Disparo externo del bot unificado (cron-job.org / GitHub Actions / Cloudflare
 * cron) para cuando el scheduler interno no aplica (serverless). El scheduler
 * interno respeta frecuencias; este endpoint admite forzar estrategias:
 *   GET /api/cron/bot-unificado
 *   GET /api/cron/bot-unificado?estrategias=statarb-pares,momentum-tendencia&forzar=1
 */
export default eventHandler(async (event) => {
  arrancarBotUnificado(); // si el runtime es Node, aprovecha y deja el loop vivo
  const q = getQuery(event);
  const estrategias = typeof q.estrategias === "string" ? q.estrategias.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const forzar = q.forzar === "1" || q.forzar === "true";
  try {
    const resultado = await correrCiclo({ disparo: "cron-externo", estrategiasFiltro: estrategias, forzar });
    return { ok: true, ...resultado };
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, motivo: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
