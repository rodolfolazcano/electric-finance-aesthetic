// Cron semanal: tuning walk-forward 504/63 para umbrales y R/R
// GET /api/cron/tuning-senales?token=TELEGRAM_WEBHOOK_SECRET
import { createFileRoute } from "@tanstack/react-router";
import "@/lib/ai/env.server";
import { getAgentBotConfig } from "@/lib/telegram.server";

function autorizado(req: Request): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const { secret } = getAgentBotConfig();
  const cronSecret = process.env["CRON_SECRET"];
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (req.headers.get("x-vercel-cron")) return true;
  if (token && token === secret) return true;
  if (bearer && bearer === secret) return true;
  if (cronSecret && (token===cronSecret || bearer===cronSecret)) return true;
  return false;
}

async function manejar(req: Request): Promise<Response> {
  if (!autorizado(req)) return new Response(JSON.stringify({ok:false,motivo:"no autorizado"}),{status:401,headers:{"content-type":"application/json"}});
  try {
    const { walkForwardTuning } = await import("@/lib/senales/tuning.server");
    const tickers = ["META","AAPL","MSFT","NVDA","GGAL.BA","YPF","PAMP.BA","BMA.BA"];
    const { best, ranking, windows } = await walkForwardTuning(tickers, 20);
    // Guardar best en filesystem para que motor-unificado lo lea opcionalmente
    try {
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const dir = join(process.cwd(), ".data", "senales");
      if (!existsSync(dir)) await mkdir(dir, {recursive:true});
      await writeFile(join(dir, "tuning.json"), JSON.stringify({fecha: new Date().toISOString(), best, ranking, windows}, null, 2), "utf-8");
    } catch {}
    return Response.json({ ok:true, best, ranking: ranking.slice(0,3), windows, recomendacion: `Umbral COMPRA ${best.params.umbralCompra} Fuerte ${best.params.umbralCompraFuerte} RR ${best.params.rrTp1}/${best.params.rrTp2} — win ${best.win.toFixed(1)}% avg ${best.avgRet.toFixed(2)}%` });
  } catch(e:any){ return new Response(JSON.stringify({ok:false,motivo:e.message??String(e)}),{status:500,headers:{"content-type":"application/json"}}); }
}

export const Route = createFileRoute("/api/cron/tuning-senales")({
  server:{ handlers:{ GET: async ({request})=> manejar(request), POST: async ({request})=> manejar(request) } }
});
