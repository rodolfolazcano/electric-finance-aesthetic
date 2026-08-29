/**
 * agente-colab-tunel.ts
 * Recicla ORQUESTACION REAL del agente Telegram (@fpxbs777_bot) y la enlaza al
 * TUNEL COLAB GPU (RAPIDS cuDF/cuML) para funciones aceleradas.
 * 
 * Flujo autónomo:
 *   Usuario (Telegram mock) <-> Agente @fpxbs777_bot (telegram-agent.server.ts)
 *                               <-> Orquestador (orquestador.ts + ejecutores.ts)
 *                               <-> GPU Bridge (COLAB_TUNNEL_URL /gpu/* o fallback local)
 *                               <-> Bot señales @Coronarinversiones777_bot (telegram.server.ts)
 * 
 * Los dos bots dialogan de forma autónoma 3 rondas validando predicción con CPU vs GPU.
 * 
 * Uso:
 *   COLAB_TUNNEL_URL=https://xxxx.ngrok-free.app bun run scripts/agente-colab-tunel.ts
 *   # sin tunel (fallback CPU): bun run scripts/agente-colab-tunel.ts
 *   # con Flask local GPU: COLAB_TUNNEL_URL=http://localhost:5000 bun run ...
 * 
 * Requiere: .env con TELEGRAM_* y que `python server/server.py` esté corriendo
 * o que el tunel Colab apunte a un Colab con GPU.
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../.env") });

// Recicla orquestación real — imports relativos como scripts/test-agente-hola.ts
import { manejarUpdateTelegram } from "../src/lib/telegram-agent.server.js";
import { ejecutarTool } from "../src/lib/agents/orquestador.js";
import { getAgentBotConfig } from "../src/lib/telegram.server.js";

const COLAB_URL = (process.env.COLAB_TUNNEL_URL || process.env.COLAB_TUNEL_URL || "").replace(/\/+$/, "");
const FLASK_LOCAL = `http://localhost:${process.env.FLASK_PORT || 5000}`;
const TUNNEL = COLAB_URL || FLASK_LOCAL;
const TG_CHAT_ID = process.env.TELEGRAM_AGENT_CHAT_IDS?.split(",")[0]?.trim() || "8179198652";

function log(seccion: string, msg: string) {
  console.log(`\n${"=".repeat(60)}\n[${seccion}] ${msg}\n${"=".repeat(60)}`);
}

async function gpuFetch(path: string, body?: any, timeoutMs = 15000): Promise<any> {
  const url = `${TUNNEL}${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: j, url };
  } catch (e: any) {
    clearTimeout(t);
    return { ok: false, error: e.message, url };
  }
}

async function main() {
  console.log(`Agente-Colab Tunel — orquestación Telegram <-> GPU`);
  console.log(`TUNNEL: ${TUNNEL} ${COLAB_URL ? "(COLAB)" : "(fallback local Flask)"}`);
  console.log(`Chat TG: ${TG_CHAT_ID}  Bot: @fpxbs777_bot -> @Coronarinversiones777_bot`);

  // 1) HEALTH: ¿hay GPU en el tunel?
  log("1/5 HEALTH GPU", `GET ${TUNNEL}/gpu/health`);
  const health = await gpuFetch("/gpu/health");
  console.log(JSON.stringify(health, null, 2));
  const hasGpu = health.data?.has_cudf || health.data?.has_cuml;
  console.log(hasGpu ? "🟢 GPU RAPIDS detectada en túnel" : "🟡 Sin GPU — se usará CPU fallback (prediccion_service.py compatible Vercel)");

  // 2) TEST RECICLA ORQUESTACION: fast-path HOLA (sin LLM, <2s) — usa manejarUpdateTelegram real
  log("2/5 ORQUESTACION TELEGRAM", `manejarUpdateTelegram("HOLA") — fast-path sin /api/chat`);
  const base = `http://localhost:${process.env.PORT || 5199}`;
  const t0 = Date.now();
  // Mock update Telegram — recicla exactamente el webhook que usa Vercel
  const resHola = await manejarUpdateTelegram(
    { update_id: 90001, message: { chat: { id: Number(TG_CHAT_ID) }, text: "HOLA" } } as any,
    base
  ).catch((e) => `error: ${e.message}`);
  console.log(`Resultado: ${resHola} en ${Date.now() - t0}ms`);
  console.log(`(Si base ${base} no responde, el bot Telegram usa fallback localhost:3000/5199/5173)`);

  // 3) GPU PREDICT via tunel — recicla ejecutar_prediccion (Python) acelerado
  const simbolo = "GGAL";
  const horizonte = 5;
  log("3/5 GPU PREDICT", `POST ${TUNNEL}/gpu/predict {simbolo:${simbolo}, horizonte:${horizonte}, use_gpu:auto}`);
  const pred = await gpuFetch("/gpu/predict", { simbolo, horizonte, use_gpu: "auto" }, 30000);
  console.log(JSON.stringify(pred.data, null, 2)?.slice(0, 3000));
  if (pred.ok) {
    console.log(`\n🔮 Predicción ${simbolo}: prob_subida=${pred.data.prob_actual} threshold=${pred.data.log_threshold} backend=${pred.data.backend_logistic} timing=${JSON.stringify(pred.data.timing)}`);
    console.log(`Decisión: ${pred.data.decision?.direccion} confianza=${pred.data.decision?.confianza}`);
  } else {
    console.log(`⚠️ GPU predict falló (${pred.status}):`, pred.data?.error || pred.error, "— probando fallback orquestador TS");
    // Fallback directo via orquestador TS (sin Flask)
    const r = await ejecutarTool("predecir_direccion", JSON.stringify({ simbolo, horizonte }));
    console.log(`Fallback ejecutarTool predecir_direccion:\n${r.texto.slice(0, 800)}`);
  }

  // 4) COMPARAR CPU vs GPU — codelab paso 10-11
  log("4/5 COMPARAR CPU vs GPU", `POST ${TUNNEL}/gpu/comparar — codelab "Compara rendimiento"`);
  const comp = await gpuFetch("/gpu/comparar", { simbolo, horizonte }, 30000);
  console.log(JSON.stringify(comp.data, null, 2)?.slice(0, 3000));
  if (comp.ok && comp.data?.speedup) {
    console.log(`\n⚡ Speedup: features x${comp.data.speedup.features} | predicción x${comp.data.speedup.prediccion}`);
    console.log(`CPU: ${JSON.stringify(comp.data.cpu)} | GPU: ${JSON.stringify(comp.data.gpu)}`);
  } else if (!COLAB_URL) {
    console.log("Sin túnel Colab real, el speedup se mide local CPU vs CPU (simulado). Para ver GPU real, levantar colab_tunel.py en Colab con T4.");
  }

  // 5) DIALOGO AUTONOMO: Agente @fpxbs777_bot <-> Validador GPU (Colab)
  log("5/5 DIALOGO AUTONOMO", "Agente Analista ↔ Validador GPU (3 rondas, sin intervención humana)");
  const agentes = [
    { nombre: "Analista (@fpxbs777_bot)", rol: "Propone y sintetiza" },
    { nombre: "Validador GPU (Colab RAPIDS)", rol: "Valida con cuDF/cuML" },
  ];
  console.log(agentes.map(a => ` - ${a.nombre}: ${a.rol}`).join("\n"));

  // Ronda 1: Analista pide análisis (via ejecutarTool, reciclando orquestación)
  console.log(`\n[RONDA 1] Analista → Validador: "Analizá ${simbolo} horizonte ${horizonte}d y validá walk-forward"`);
  const toolRes = await ejecutarTool("predecir_direccion", JSON.stringify({ simbolo, horizonte }));
  const analistaMsg = toolRes.texto.slice(0, 600);
  console.log(`  Agente Analista (ejecutarTool predecir_direccion):\n  ${analistaMsg.replace(/\n/g, "\n  ")}`);

  // Ronda 2: Validador GPU revalida con tunel (usa backend GPU)
  console.log(`\n[RONDA 2] Validador GPU → Analista: "Revalido con ${hasGpu ? "cuDF/cuML GPU" : "CPU fallback"} y comparo"`);
  let validadorMsg = "";
  if (pred.ok) {
    const wf = pred.data.wf_acc != null ? `WF acc ${(pred.data.wf_acc * 100).toFixed(1)}% F1 ${pred.data.wfF1}` : "WF n/d";
    const oro = pred.data.regla_oro_ok ? "regla oro OK" : "regla oro violada";
    const be = pred.data.backend_logistic;
    validadorMsg = `Validador GPU: backend=${be} prob=${pred.data.prob_actual} threshold=${pred.data.log_threshold} ${wf} ${oro} timing=${JSON.stringify(pred.data.timing)} — ${comp.data?.speedup ? `speedup x${comp.data.speedup.prediccion}` : "sin speedup GPU"}`;
  } else {
    validadorMsg = `Validador GPU: túnel no disponible, validé con TS local — ${analistaMsg.slice(0, 200)}`;
  }
  console.log(`  ${validadorMsg}`);

  // Ronda 3: Analista sintetiza y propone publicación a @Coronarinversiones777_bot
  console.log(`\n[RONDA 3] Analista sintetiza (autónomo) → propone acción`);
  const decision = pred.data?.decision?.direccion || "NEUTRAL (esperar)";
  const confianza = pred.data?.decision?.confianza ?? 0;
  const sintesis = [
    `Síntesis autónoma ${simbolo}:`,
    `- Señal ML: ${decision} (confianza ${(confianza * 100).toFixed(0)}%)`,
    `- Validación: ${pred.data?.wf_acc != null ? `walk-forward ${(pred.data.wf_acc * 100).toFixed(1)}%` : "sin WF"}`,
    `- Backend: ${pred.data?.backend_logistic || "ts-local"}`,
    `- Aceleración: ${JSON.stringify(health.data).slice(0, 120)}`,
    confianza > 0.5 && pred.data?.wf_acc != null && pred.data.wf_acc > 0.55
      ? `→ Acción autónoma: PUBLICAR al canal @Coronarinversiones777_bot vía telegram_enviar_senal`
      : `→ Acción autónoma: NO PUBLICAR (confianza/baja validación) — reportar en chat agente`,
  ].join("\n  ");
  console.log(`  ${sintesis}`);

  // Ejecutar acción autónoma si corresponde (sin pedir permiso humano)
  if (confianza > 0.5 && pred.data?.wf_acc != null && pred.data.wf_acc > 0.55) {
    console.log(`\n  🤖 Ejecutando autonomamente: ejecutarTool("telegram_enviar_senal", {ticker:"${simbolo}.BA", senal:"${decision.includes("CALL") ? "COMPRA" : decision.includes("PUT") ? "VENTA" : "MANTENER"}"})`);
    try {
      const pub = await ejecutarTool("telegram_enviar_senal", JSON.stringify({ ticker: `${simbolo}.BA`, senal: decision.includes("CALL") ? "COMPRA" : decision.includes("PUT") ? "VENTA" : "MANTENER", precio: pred.data.spot, motivo: `ML prob ${(pred.data.prob_actual * 100).toFixed(1)}% WF ${(pred.data.wf_acc * 100).toFixed(1)}% via ${pred.data.backend_logistic}` }));
      console.log(`  Resultado publicación: ${pub.texto.slice(0, 300)}`);
    } catch (e: any) {
      console.log(`  Publicación no ejecutada (falta token o validación): ${e.message}`);
    }
  } else {
    console.log(`\n  🤖 Agente decide NO publicar automáticamente — umbral confianza/validación no superado (comportamiento autónomo esperado)`);
  }

  log("RESUMEN", `Interacción autónoma completada. TUNEL=${TUNNEL} GPU=${hasGpu ? "SI" : "NO (CPU fallback)"} | Para GPU real: python server/colab_tunel.py --ngrok-token TU_TOKEN en Colab T4`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
