// Cron: señales unificadas diarias -> Telegram (@fpxbs777_bot + @coronar_inversiones_bot opc.).
//
// Genera el TOP de señales del motor unificado CORONAR (4 capas:
// Intermarket Pring 6 etapas + Fundamental Pascale gate 5.0 + Semaforo + CAPM/Riesgo)
// sobre universo unificado_completo.json y lo envía a los chats autorizados.
// Pensado para Vercel Cron (vercel.json) o scheduler externo.
//
// Disparo manual:
//   GET /api/cron/senales-unificadas?token=<TELEGRAM_WEBHOOK_SECRET>&topN=6&filtro=todos
//   GET /api/cron/senales-unificadas?token=xxx&simbolos=GGAL.BA,YPF,PAMP.BA
// Vercel Cron envía header x-vercel-cron (aceptado automáticamente).

import { createFileRoute } from "@tanstack/react-router";
import "@/lib/ai/env.server";
import {
  getAgentBotConfig,
  sendAgentMessage,
  sendAgentPhoto,
  buildQuickChartUrl,
  sendAgentPhotoBuffer,
} from "@/lib/telegram.server";
import { getTelegramConfig, sendTelegramMessage } from "@/lib/telegram.server";

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "--";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function obtenerFechaART(): string {
  const f = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = f.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function armarMensajeSenales(senales: any[], resumen: string, fecha: string): string {
  const header = `<b>CORONAR — Señales Unificadas — ${escapeHtml(fecha)}</b>`;
  const sub = `<i>4 capas: I Intermarket · F Fundamental (Pascale) · T Técnico · C Cuantitativo</i>`;
  const intro = resumen ? escapeHtml(resumen) : "";
  const filas = senales.map((s) => {
    const t = escapeHtml(s.ticker ?? "?");
    const senal = escapeHtml(s.senal ?? "?");
    const score = s.scoreTotal != null ? s.scoreTotal.toFixed(1) : "--";
    const conf = s.confianza != null ? (s.confianza * 100).toFixed(0) + "%" : "--";
    const precio = s.precio != null ? `$${Number(s.precio).toFixed(2)}` : "--";
    const vari =
      s.variacion1d != null
        ? `(${s.variacion1d >= 0 ? "+" : ""}${Number(s.variacion1d).toFixed(1)}%)`
        : "";
    const tec = s.tecnica ?? {};
    const slStr =
      tec.sl != null
        ? `$${Number(tec.sl).toFixed(2)} (${tec.slPct != null ? tec.slPct.toFixed(1) + "%" : ""})`
        : "—";
    const tp1Str = tec.tp1 != null ? `$${Number(tec.tp1).toFixed(2)}` : "—";
    const rrr = tec.rrr != null ? tec.rrr.toFixed(2) : "—";
    const entrada = tec.entrada != null ? `$${Number(tec.entrada).toFixed(2)}` : precio;
    const scores = s.scores
      ? `I ${s.scores.intermarket} · F ${s.scores.fundamental} · T ${s.scores.tecnico} · C ${s.scores.cuantitativo}`
      : "";
    const motivo = escapeHtml((s.motivo ?? "").slice(0, 140));
    return [
      `<b>${t} | ${senal} — ${score}/10</b> · ${conf} · ${precio} ${vari}`,
      `Entrada ${entrada} · SL ${slStr} · TP1 ${tp1Str} · R/R ${rrr}`,
      scores,
      motivo ? `<i>${motivo}</i>` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  const cuerpo = filas.join("\n\n");
  return (
    `${header}\n${sub}\n\n${intro ? intro + "\n\n" : ""}` +
    cuerpo +
    `\n\n<i>Educativo — no recomendación. DYOR. Gráfico adjunto.</i>`
  ).slice(0, 3800 * 4);
}

async function manejar(request: Request): Promise<Response> {
  if (!autorizado(request)) {
    return new Response(JSON.stringify({ ok: false, motivo: "no autorizado" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const topN = Math.min(15, Math.max(1, Number(url.searchParams.get("topN") ?? "6") || 6));
  const filtro = (url.searchParams.get("filtro") ?? "todos") as "todos" | "solo_compras";
  const simbolosParam = url.searchParams.get("simbolos") ?? url.searchParams.get("tickers") ?? "";
  const simbolos = simbolosParam
    ? simbolosParam
        .split(/[,\s;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : [];

  try {
    const { generarSenalesUnificadas } = await import("@/lib/senales/motor-unificado");
    const { senales, resumen } = await (generarSenalesUnificadas as any)(
      simbolos.length ? simbolos : [],
      {
        topN,
        filtro,
      },
    );

    if (!senales.length) {
      return Response.json({
        ok: false,
        motivo: "sin señales generadas",
        fecha: obtenerFechaART(),
      });
    }

    const fecha = obtenerFechaART();
    // Persistencia historial diario (filesystem + Supabase) para backtesting y tuning walk-forward 504/63
    try {
      const { guardarSenalesDelDia } = await import("@/lib/senales/persistencia.server");
      await guardarSenalesDelDia({
        fecha,
        generadoEn: new Date().toISOString(),
        resumen,
        senales: senales as any,
      });
    } catch (e) {
      console.error("[senales] persistencia fallo", e);
    }
    const texto = armarMensajeSenales(senales, resumen, fecha);

    // 1) Enviar a bot agente @fpxbs777_bot (chats autorizados — el mismo que usa /api/telegram/webhook)
    const { allowedChats } = getAgentBotConfig();
    const enviadosAgente: string[] = [];
    for (const chatId of allowedChats) {
      await sendAgentMessage(chatId, texto);
      enviadosAgente.push(chatId);
      // Enviar gráfico TradingView del top1 como foto adjunta (con líneas Entrada/SL/TP)
      try {
        const top1 = senales[0];
        if (top1?.ticker) {
          const { fetchTradingViewSnapshot } = await import("@/lib/tradingview-snapshot.server");
          const t = top1.tecnica ?? {};
          const lines = [
            t.entrada != null ? { price: t.entrada, label: "Entrada", color: "#38bdf8" } : null,
            t.sl != null ? { price: t.sl, label: "SL", color: "#ef4444" } : null,
            t.tp1 != null ? { price: t.tp1, label: "TP1", color: "#22c55e" } : null,
            t.tp2 != null ? { price: t.tp2, label: "TP2", color: "#16a34a" } : null,
          ].filter(Boolean) as Array<{ price: number; label: string; color: string }>;
          const snap = await fetchTradingViewSnapshot({
            ticker: top1.ticker,
            interval: "1D",
            lines,
          });
          if (snap.ok && snap.buffer) {
            const urlTv = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(top1.ticker.endsWith(".BA") ? "BCBA:" + top1.ticker : "NASDAQ:" + top1.ticker)}`;
            await sendAgentPhotoBuffer(chatId, snap.buffer, {
              caption: `<b>${escapeHtml(top1.ticker)}</b> — ${escapeHtml(top1.senal)} ${top1.scoreTotal.toFixed(1)}/10`,
              inlineUrl: urlTv,
              inlineText: "Abrir interactivo en TradingView",
            });
          } else {
            // Fallback: QuickChart línea de cierres
            const { fetchYahooChart } = await import("@/lib/yahoo-http");
            const chart: unknown = await fetchYahooChart(top1.ticker, "1y", "1d");
            const r0 = (
              chart as {
                chart?: {
                  result?: Array<{
                    indicators?: { quote?: Array<{ close?: unknown[] }> };
                    timestamp?: number[];
                    meta?: { currency?: string };
                  }>;
                };
              }
            )?.chart?.result?.[0];
            const closes = (r0?.indicators?.quote?.[0]?.close ?? []) as number[];
            const ts = r0?.timestamp ?? [];
            const serie = ts
              .map((t: number, i: number) => ({
                f: new Date(t * 1000).toISOString().slice(0, 10),
                v: closes[i] as number,
              }))
              .filter((p) => isFinite(p.v));
            if (serie.length) {
              const urlChart = buildQuickChartUrl(
                `${top1.ticker} — ${top1.senal} ${top1.scoreTotal.toFixed(1)}/10`,
                serie,
                r0?.meta?.currency ?? "",
              );
              await sendAgentPhoto(
                chatId,
                urlChart,
                `<b>${escapeHtml(top1.ticker)} — Top Señal</b>`,
              );
            }
          }
        }
      } catch (eGrafico) {
        console.error("[senales] grafico top1 fallo", eGrafico);
      }
    }

    // 2) Opcional: también al canal público @coronar_inversiones_bot si está configurado
    const { token: tokenCoronar, chatIds: chatIdsCoronar } = getTelegramConfig();
    const enviadosCoronar: string[] = [];
    if (tokenCoronar && chatIdsCoronar.length) {
      const textoCoronar = texto.replace(/<[^>]+>/g, (m) =>
        m.startsWith("<a ") ? "" : m.includes("</a>") ? "" : m,
      ); // Telegram HTML ya soportado, pero por si acaso
      for (const cid of chatIdsCoronar) {
        await sendTelegramMessage({ text: textoCoronar, chatId: cid, parseMode: "HTML" }).catch(
          () => undefined,
        );
        enviadosCoronar.push(cid);
      }
    }

    return Response.json({
      ok: true,
      fecha,
      resumen,
      senales: senales.map((s: any) => ({
        ticker: s.ticker,
        senal: s.senal,
        scoreTotal: s.scoreTotal,
        confianza: s.confianza,
        precio: s.precio,
      })),
      enviados: { agente: enviadosAgente, coronar: enviadosCoronar },
      caracteres: texto.length,
    });
  } catch (e: unknown) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("[senales-unificadas] error:", detalle);
    return new Response(JSON.stringify({ ok: false, motivo: detalle }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/cron/senales-unificadas")({
  server: {
    handlers: {
      GET: async ({ request }) => manejar(request),
      POST: async ({ request }) => manejar(request),
    },
  },
});
