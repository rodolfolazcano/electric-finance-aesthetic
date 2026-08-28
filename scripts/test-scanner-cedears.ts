/**
 * Script de test: ejecuta el scanner de CEDEARs y envía señales a Telegram.
 *
 * Ejecutar: npx tsx scripts/test-scanner-cedears.ts
 *
 * Opcional: forzar todas las señales (sin filtro de probabilidad):
 *   npx tsx scripts/test-scanner-cedears.ts --forzar
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar .env desde la raíz del proyecto
config({ path: resolve(__dirname, "../.env") });

import { escanearCedearsEntrada, escanearCedearsOversold } from "../src/lib/bot-unificado/scanner-senales-cedear";
import { sendTelegramSignal, sendTelegramMessage, getTelegramConfig } from "../src/lib/telegram.server";

function formatSignal(ticker: string, senal: string, precio: number | null, motivo: string, nivel: string | null): string {
  const lines: string[] = [];
  lines.push(`<b>CORONAR CEDEARS — ${ticker.toUpperCase()} | ${senal}</b>`);
  if (precio != null) lines.push(`Precio: $${precio.toFixed(2)}`);
  if (nivel) lines.push(`Nivel: ${nivel}`);
  if (motivo) lines.push(motivo.slice(0, 300));
  lines.push(`<i>Educativo — no recomendación. DYOR.</i>`);
  return lines.join("\n");
}

async function main() {
  const forzar = process.argv.includes("--forzar");
  const config = getTelegramConfig();
  console.log(`[CONFIG] Telegram habilitado: ${config.enabled}`);
  console.log(`[CONFIG] Chat IDs: ${config.chatIds.join(", ")}`);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  SCANNER CEDEARs — SEÑALES DE ENTRADA");
  console.log("═══════════════════════════════════════════════════\n");

  // Scanner 1: Multi-indicador
  console.log("🔍 Ejecutando scanner multi-indicador (RSI+MACD+SMA+Bollinger+Vol)...");
  const t0 = Date.now();
  const senales1 = await escanearCedearsEntrada();
  console.log(`   ✅ ${senales1.length} señales encontradas en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Scanner 2: Oversold extremo
  console.log("\n🔍 Ejecutando scanner oversold extremo (RSI < 30)...");
  const t1 = Date.now();
  const senales2 = await escanearCedearsOversold();
  console.log(`   ✅ ${senales2.length} señales encontradas en ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  // Deduplicar
  const todas = [...senales1, ...senales2];
  const unicas = new Map<string, typeof todas[0]>();
  for (const s of todas) {
    const prev = unicas.get(s.tickerBCBA);
    if (!prev || s.prob > prev.prob) unicas.set(s.tickerBCBA, s);
  }
  const finales = [...unicas.values()].sort((a, b) => b.prob - a.prob);
  console.log(`\n📊 Total final (deduplicado): ${finales.length} señales`);

  if (!finales.length) {
    console.log("\n⚠️  No se encontraron señales de entrada en este momento.");
    console.log("   Esto es normal: el scanner busca condiciones específicas de entrada.");
    return;
  }

  // Mostrar resumen
  console.log("\n┌─────────────────────────────────────────────────────┐");
  console.log("│            SEÑALES DE ENTRADA CEDEARs              │");
  console.log("├─────────────────────────────────────────────────────┤");
  for (const s of finales) {
    const precio = s.precio != null ? `$${s.precio.toFixed(2)}` : "s/d";
    const prob = (s.prob * 100).toFixed(0);
    console.log(`│ ${s.tickerBCBA.padEnd(8)} │ ${s.direccion.padEnd(8)} │ ${precio.padEnd(10)} │ ${prob}% │`);
  }
  console.log("└─────────────────────────────────────────────────────┘");

  // Enviar a Telegram
  if (config.enabled && config.chatIds.length) {
    console.log("\n📱 Enviando señales a Telegram...");
    let enviadas = 0;
    for (const s of finales.slice(0, 5)) {
      try {
        const result = await sendTelegramSignal({
          ticker: s.tickerBCBA,
          senal: s.senal ?? s.direccion,
          precio: s.precio,
          motivo: s.motivo,
          nivel: s.nivel ?? undefined,
          fuente: `scanner-cedears · ${s.estrategia}`,
        });
        console.log(`   ✅ ${s.tickerBCBA}: ${result}`);
        enviadas++;
      } catch (e) {
        console.error(`   ❌ ${s.tickerBCBA}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    // Resumen final
    const resumen = [
      `<b>CORONAR Scanner CEDEARs — ${new Date().toLocaleString("es-AR")}</b>`,
      `Se encontraron ${finales.length} señales de entrada.`,
      `Enviadas: ${enviadas}/${Math.min(finales.length, 5)}`,
      ``,
      ...finales.slice(0, 5).map((s) =>
        `• <b>${s.tickerBCBA}</b> ${s.direccion} (${s.prob >= 0.7 ? "alta" : s.prob >= 0.6 ? "media" : "baja"} confianza)`
      ),
      ``,
      `<i>Educativo — no recomendación. DYOR.</i>`,
    ].join("\n");

    await sendTelegramMessage({ text: resumen, parseMode: "HTML" });
    console.log(`\n✅ Resumen enviado a Telegram`);
  } else {
    console.log("\n⚠️  Telegram no configurado o deshabilitado. Señales mostradas en consola.");
  }
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
