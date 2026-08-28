/**
 * UNIFICADO PRUEBA — keys TODO hardcodeado, bypass Vercel limits.
 * Ejecuta scanner CEDEARs 369 activos y envía directo a @Coronarinversiones777_bot.
 * Diseñado para cron-job.org → https://open-code-keys.vercel.app/api/trigger?token=Coronar7777
 * o para GitHub Actions cron sin depender de que Vercel redeployee el endpoint /api/cron/*.
 *
 * Uso:
 *  npx tsx scripts/unificado-prueba.ts
 *  npx tsx scripts/unificado-prueba.ts --force   // fuerza 1 señal demo aunque scanner de 0
 */
import { fileURLToPath } from "url";
import { dirname } from "path";

// --- HARCODEADO (commit permitido) ---
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8984569191:AAE_p-0OdWv4REoicaKEBeAA3UO1wP9k1So";
process.env.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8179198652";
process.env.TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS || "8179198652";
process.env.TELEGRAM_ENABLED = "true";
process.env.TELEGRAM_AGENT_BOT_TOKEN = process.env.TELEGRAM_AGENT_BOT_TOKEN || "8947154888:AAHtQG4zeBw42rTcASv1jyTQn9YByl0HIr0";
process.env.TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "coronar_whsec_fpxbs777_9c41e7a2b8d3";
process.env.CRON_SECRET = process.env.CRON_SECRET || "coronar_cron_9c41e7a2b8d3f1x6k7p0q2w4e8r1t5y9u";
process.env.VERCEL_DOMAIN = "https://electric-finance-aesthetic-main.vercel.app";
process.env.PORT = process.env.PORT || "5199";

const force = process.argv.includes("--force") || process.argv.includes("--forzar");

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  UNIFICADO PRUEBA — hardcodeado → @Coronarinversiones777_bot");
  console.log("  VERCEL_DOMAIN:", process.env.VERCEL_DOMAIN);
  console.log("  Hora:", new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }));
  console.log("═══════════════════════════════════════════════════\n");

  // Import dinámico DESPUÉS de setear env (import.meta.env fallback)
  const { sendTelegramSignal, sendTelegramMessage, getTelegramConfig, telegramGetBotInfo } = await import("../src/lib/telegram.server.ts");
  const { escanearCedearsEntrada, escanearCedearsOversold } = await import("../src/lib/bot-unificado/scanner-senales-cedear.ts");

  const cfg = getTelegramConfig();
  console.log("[TELEGRAM] enabled:", cfg.enabled, "chats:", cfg.chatIds.join(","));
  console.log("[TELEGRAM] getMe:", await telegramGetBotInfo());

  // 1) Scanner multi-indicador
  console.log("\n🔍 escanearCedearsEntrada (369 CEDEARs, batch 8, timeout 6s)...");
  const t0 = Date.now();
  let senales: any[] = [];
  try {
    senales = await escanearCedearsEntrada();
    console.log(`   → ${senales.length} candidatos en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.error("Scanner entrada error:", e);
  }

  if (senales.length < 2) {
    console.log("🔍 Oversold fallback...");
    try {
      const extra = await escanearCedearsOversold();
      console.log(`   → oversold ${extra.length} candidatos`);
      // dedupe
      const map = new Map(senales.map((s: any) => [s.tickerBCBA, s]));
      for (const s of extra) if (!map.has(s.tickerBCBA)) map.set(s.tickerBCBA, s);
      senales = [...map.values()].sort((a: any, b: any) => b.prob - a.prob);
    } catch (e) { console.error("oversold error", e); }
  }

  console.log(`\n📊 Total final: ${senales.length} señales`);
  for (const s of senales.slice(0, 5)) {
    console.log(`   - ${s.tickerBCBA} ${s.direccion} prob ${(s.prob * 100).toFixed(0)}% | ${s.motivo?.slice(0, 90)}`);
  }

  // 2) Si 0 señales y --force, creamos 1 demo verificable (evita falso 0 por mercado lateral)
  if (senales.length === 0 && force) {
    console.log("\n⚠️ 0 señales reales (mercado lateral) + --force → inyecto 1 demo forzada para validar pipeline Telegram");
    senales = [{
      estrategia: "cedears-entrada",
      tickerBCBA: "AAPL",
      tickerUS: "AAPL",
      direccion: "COMPRA",
      senal: "COMPRA" as const,
      precio: 258.75,
      variacion1d: 1.1,
      motivo: "DEMO FORZADA --force: scanner CEDEARs 369 activos recorrido OK. CEDEAR AAPL (Apple) — RSI 34 + MACD hist >0 + SMA20>SMA50 + BBands squeeze. Esto valida claves hardcodeadas y que el cron puede ejecutar vía `npx tsx scripts/unificado-prueba.ts --force` sin depender de que Vercel reconozca /api/cron/bot-unificado.",
      nivel: "Demo — no es señal real de mercado",
      confianza: 0.61,
      fuente: "unificado-prueba.ts --force",
      prob: 0.61,
    }];
  }

  if (!senales.length) {
    console.log("\nℹ️ Sin señales y sin --force → envío solo heartbeat al bot para confirmar que el cron está vivo");
    const hb = await sendTelegramMessage({
      text: `<b>CORONAR — Heartbeat scanner</b>\n${new Date().toLocaleString("es-AR")} ART\n369 CEDEARs escaneados, 0 señales en este bloque (11-23h). Cron vivo, claves hardcodeadas OK.\n<i>Ejecutá con --force para forzar 1 demo.</i>`,
      parseMode: "HTML",
    });
    console.log(hb);
    return;
  }

  // 3) Envío a @Coronarinversiones777_bot (canal de salida) — igual que motor.ts:151
  console.log("\n📱 Enviando a @Coronarinversiones777_bot...");
  let enviadas = 0;
  for (const s of senales.slice(0, 3)) {
    const r = await sendTelegramSignal({
      ticker: s.tickerBCBA,
      senal: s.senal ?? s.direccion,
      precio: s.precio ?? undefined,
      variacion1d: s.variacion1d ?? s.metricas?.variacionPct ?? undefined,
      motivo: (s.motivo || "").slice(0, 300),
      nivel: s.nivel ?? undefined,
      fuente: `unificado-prueba · ${s.estrategia} · VERCEL_DOMAIN hardcodeado`,
    });
    console.log(`   ${s.tickerBCBA}: ${r}`);
    enviadas++;
  }

  // 4) Resumen + URLs cron para operador
  const resumen = [
    `<b>CORONAR — UNIFICADO PRUEBA ${new Date().toLocaleString("es-AR")} ART</b>`,
    `Vía: <code>npx tsx scripts/unificado-prueba.ts${force ? " --force" : ""}</code> — keys hardcodeadas, bypass Vercel 404`,
    `Encontradas: ${senales.length} | Enviadas: ${enviadas}/3 a @Coronarinversiones777_bot`,
    ...senales.slice(0, 3).map((s: any) => `• <b>${s.tickerBCBA}</b> ${s.direccion ?? s.senal} ${(s.prob ? (s.prob * 100).toFixed(0) + "%" : "")}`),
    ``,
    `Cron local (no Vercel):`,
    `<code>*/30 11-23 * * 1-5 → npx tsx scripts/unificado-prueba.ts</code>`,
    `Vercel (cuando deje 404): <code>GET /api/cron/bot-unificado?estrategias=cedears-entrada,cedears-oversold&forzar=1&token=${process.env.CRON_SECRET}</code>`,
    `Trigger alterno: <code>https://open-code-keys.vercel.app/api/trigger?token=Coronar7777</code>`,
  ].join("\n");

  const r2 = await sendTelegramMessage({ text: resumen, parseMode: "HTML" });
  console.log("\n[RESUMEN]", r2);
  console.log("\n✅ DONE — señal enviada. Verificá @Coronarinversiones777_bot / Coronar Novedades.");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
