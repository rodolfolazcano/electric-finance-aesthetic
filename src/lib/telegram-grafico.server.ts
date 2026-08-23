/**
 * Helper server-only: genera snapshot TradingView y lo envía por Telegram.
 * Usado por la tool telegram_enviar_grafico y por GET /api/telegram?action=grafico
 */
import { fetchTradingViewSnapshot, normalizarSimboloTv } from "@/lib/tradingview-snapshot.server";

export async function enviarGraficoTradingviewTelegram(argsRaw: string): Promise<{ ok: boolean; texto: string }> {
  let a: { ticker?: string; intervalo?: string; interval?: string; caption?: string; chatId?: string } = {};
  try {
    a = JSON.parse(argsRaw || "{}") as typeof a;
  } catch {
    return { ok: false, texto: "[ERROR] JSON inválido para telegram_enviar_grafico" };
  }
  const ticker = String(a.ticker ?? "").trim();
  if (!ticker) return { ok: false, texto: "[ERROR] telegram_enviar_grafico requiere ticker (ej. AAPL)" };
  const intervalo = String(a.intervalo ?? a.interval ?? "1D").trim() || "1D";
  const chatIdRaw = a.chatId ? String(a.chatId).trim() : undefined;

  // 1) Snapshot TradingView (chart-img → widgetembed → quickchart)
  let snap: Awaited<ReturnType<typeof fetchTradingViewSnapshot>>;
  try {
    snap = await fetchTradingViewSnapshot({ ticker, interval: intervalo });
  } catch (e) {
    return { ok: false, texto: `[ERROR] fallo generando imagen TradingView para ${ticker}: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!snap.ok || !snap.buffer?.length) {
    return { ok: false, texto: `[ERROR] No pude generar la imagen TradingView para ${ticker} (${snap.error ?? "sin buffer"}). Probá con intervalo 1D o verificá el ticker.` };
  }

  const symbolTv = normalizarSimboloTv(ticker);
  const captionBase = String(a.caption ?? "").trim();
  const caption = captionBase || `${ticker.toUpperCase()} · ${symbolTv} · TradingView ${intervalo} — ${new Date().toLocaleDateString("es-AR")}`;
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbolTv)}`;

  // 2) AMBOS con prioridad y fallback: agente (@fpxbs777_bot) primero (más importante), señales como fallback/concurrente.
  // Si chatId explícito → envía a ese chat con AMBOS tokens en paralelo. Sin chatId → envía a los chats configurados de cada bot en paralelo.
  let enviados = 0;
  let fallos = 0;
  const detalles: string[] = [];

  const [{ getAgentBotConfig, sendAgentPhotoBuffer }, { getTelegramConfig, sendSignalsPhotoBuffer }] = await Promise.all([
    import("@/lib/telegram.server").then(m => ({ getAgentBotConfig: m.getAgentBotConfig, sendAgentPhotoBuffer: m.sendAgentPhotoBuffer })),
    import("@/lib/telegram.server").then(m => ({ getTelegramConfig: m.getTelegramConfig, sendSignalsPhotoBuffer: m.sendSignalsPhotoBuffer })),
  ]);
  const cfgAgent = getAgentBotConfig();
  const cfgSenales = getTelegramConfig();
  const targetsAgent = chatIdRaw ? [chatIdRaw] : cfgAgent.allowedChats;
  const targetsSenales = chatIdRaw ? [chatIdRaw] : cfgSenales.chatIds;

  // Tarea agente (prioridad)
  const tareaAgent = async (): Promise<void> => {
    if (!cfgAgent.token || !targetsAgent.length) {
      if (!chatIdRaw) detalles.push("agente: sin token/chats configurados");
      return;
    }
    const res = await Promise.all(targetsAgent.map(async (cid) => {
      try {
        const ok = await sendAgentPhotoBuffer(cid, snap.buffer!, { caption, inlineUrl: tvUrl, inlineText: "Abrir en TradingView" });
        return { cid, ok };
      } catch (e) { return { cid, ok: false, err: e instanceof Error ? e.message : String(e) }; }
    }));
    for (const r of res) {
      if ((r as { ok: boolean }).ok) { enviados++; detalles.push(`agente→${r.cid} OK (${snap.fuente})`); }
      else { fallos++; detalles.push(`agente→${r.cid} FAIL${(r as { err?: string }).err ? `:${(r as { err?: string }).err}` : ""}`); }
    }
  };

  // Tarea señales (fallback — se ejecuta en paralelo si agente tiene chats, o inmediato si agente vacío)
  const tareaSenales = async (): Promise<void> => {
    if (!cfgSenales.token || !targetsSenales.length) {
      if (!chatIdRaw) detalles.push("señales: sin TELEGRAM_BOT_TOKEN/CHAT_ID");
      return;
    }
    // Si hay chatId explícito ya cubierto por agente, igual reintenta por señales como AMBOS
    const res = await Promise.all(targetsSenales.map(async (cid) => {
      try {
        const ok = await sendSignalsPhotoBuffer(cid, snap.buffer!, { caption, inlineUrl: tvUrl, inlineText: "Abrir en TradingView" });
        return { cid, ok };
      } catch (e) { return { cid, ok: false, err: e instanceof Error ? e.message : String(e) }; }
    }));
    for (const r of res) {
      if ((r as { ok: boolean }).ok) { enviados++; detalles.push(`señales→${r.cid} OK (${snap.fuente})`); }
      else { fallos++; detalles.push(`señales→${r.cid} FAIL${(r as { err?: string }).err ? `:${(r as { err?: string }).err}` : ""}`); }
    }
  };

  // AMBOS disponibles pero con prioridad: agente primero (más importante), señales solo como fallback si agente 0
  await tareaAgent();
  if (enviados === 0) await tareaSenales();

  if (enviados > 0) {
    return { ok: true, texto: `Gráfico TradingView de ${ticker.toUpperCase()} (${symbolTv} ${intervalo}) enviado a Telegram en ${enviados} chat(s) vía ${snap.fuente}. ${detalles.join(" | ")} — ${tvUrl}` };
  }
  return { ok: false, texto: `[ERROR] No pude enviar el gráfico de ${ticker} a Telegram. ${detalles.join(" | ")} — Imagen generada OK (${snap.fuente}, ${snap.buffer.length} bytes) pero ningún bot/chat aceptó el envío. Verificá TELEGRAM_AGENT_BOT_TOKEN/TELEGRAM_AGENT_CHAT_IDS o TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en .env — ${tvUrl}` };
}
