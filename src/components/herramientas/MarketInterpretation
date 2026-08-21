"use client";
import type {
  OrderBook,
  Ticker24h,
  Signal,
  PaperTradingMetrics,
  ObzScore,
  AtrResult,
} from "@/lib/cripto.types";
import { useMemo } from "react";

interface Props {
  symbol: string;
  ticker: Ticker24h | null;
  orderBook: OrderBook | null;
  obiCalc: { obi: number; zScore: number; microPrice: number } | null;
  obiHistory: number[];
  zScoreHistory: number[];
  atr: { atrPct: number } | null;
  signals: Signal[];
  metrics: PaperTradingMetrics;
  umbral: number;
}

type SenalInterpretacion = "COMPRA" | "VENTA" | "NEUTRAL" | "COMPRA_FUERTE" | "VENTA_FUERTE";

interface Interpretacion {
  senal: SenalInterpretacion;
  confianza: number;
  resumen: string;
  detalles: string[];
  riesgo: "bajo" | "medio" | "alto";
  accion: string;
}

function fmtPct(n: number, dp = 2) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

export function MarketInterpretation({
  symbol,
  ticker,
  orderBook,
  obiCalc,
  obiHistory,
  zScoreHistory,
  atr,
  signals,
  metrics,
  umbral,
}: Props) {
  const interpretacion = useMemo<Interpretacion>(() => {
    const detalles: string[] = [];
    let puntaje = 0;
    let maxPuntaje = 0;

    if (!obiCalc || obiHistory.length < 30) {
      return {
        senal: "NEUTRAL",
        confianza: 0,
        resumen: "Esperando datos suficientes para analizar...",
        detalles: [],
        riesgo: "medio",
        accion: "Esperar",
      };
    }

    // 1. Z-Score analysis
    maxPuntaje += 30;
    if (Math.abs(obiCalc.zScore) >= umbral * 1.5) {
      if (obiCalc.zScore > 0) {
        puntaje += 25;
        detalles.push(
          `Z-Score extremo (${obiCalc.zScore.toFixed(2)}σ) — fuerte sobrecompra, alta probabilidad de reversión bajista`,
        );
      } else {
        puntaje += 28;
        detalles.push(
          `Z-Score extremo (${obiCalc.zScore.toFixed(2)}σ) — fuerte sobreventa, alta probabilidad de rebote alcista`,
        );
      }
    } else if (Math.abs(obiCalc.zScore) >= umbral) {
      if (obiCalc.zScore > 0) {
        puntaje += 18;
        detalles.push(
          `Z-Score en zona de sobrecompra (${obiCalc.zScore.toFixed(2)}σ) — posible entrada SHORT`,
        );
      } else {
        puntaje += 20;
        detalles.push(
          `Z-Score en zona de sobreventa (${obiCalc.zScore.toFixed(2)}σ) — posible entrada LONG`,
        );
      }
    } else {
      puntaje += 5;
      detalles.push(`Z-Score neutral (${obiCalc.zScore.toFixed(2)}σ) — sin señal clara de entrada`);
    }

    // 2. OBI (Order Book Imbalance)
    maxPuntaje += 25;
    const absObi = Math.abs(obiCalc.obi);
    if (absObi > 0.5) {
      if (obiCalc.obi > 0) {
        puntaje += 20;
        detalles.push(
          `OBI fuertemente positivo (${obiCalc.obi.toFixed(3)}) — presión compradora dominante en el order book`,
        );
      } else {
        puntaje += 22;
        detalles.push(
          `OBI fuertemente negativo (${obiCalc.obi.toFixed(3)}) — presión vendedora dominante en el order book`,
        );
      }
    } else if (absObi > 0.2) {
      if (obiCalc.obi > 0) {
        puntaje += 12;
        detalles.push(`OBI positivo (${obiCalc.obi.toFixed(3)}) — leve presión compradora`);
      } else {
        puntaje += 14;
        detalles.push(`OBI negativo (${obiCalc.obi.toFixed(3)}) — leve presión vendedora`);
      }
    } else {
      puntaje += 5;
      detalles.push(`OBI neutral (${obiCalc.obi.toFixed(3)}) — order book equilibrado`);
    }

    // 3. ATR (volatility)
    maxPuntaje += 15;
    if (atr) {
      if (atr.atrPct > 0.15) {
        puntaje += 12;
        detalles.push(`ATR alto (${fmtPct(atr.atrPct)}) — alta volatilidad, usar stops amplios`);
      } else if (atr.atrPct > 0.05) {
        puntaje += 8;
        detalles.push(`ATR moderado (${fmtPct(atr.atrPct)}) — volatilidad normal para trading`);
      } else {
        puntaje += 4;
        detalles.push(`ATR bajo (${fmtPct(atr.atrPct)}) — baja volatilidad, spreads ajustados`);
      }
    }

    // 4. Price action vs VWAP
    maxPuntaje += 15;
    if (ticker) {
      const vwap = ticker.weightedAvgPrice;
      if (vwap > 0) {
        const distVwap = ((ticker.lastPrice - vwap) / vwap) * 100;
        if (distVwap > 1) {
          puntaje += 12;
          detalles.push(`Precio ${fmtPct(distVwap)} sobre VWAP — sobrevalorado, posible techo`);
        } else if (distVwap < -1) {
          puntaje += 13;
          detalles.push(`Precio ${fmtPct(distVwap)} bajo VWAP — infravalorado, posible piso`);
        } else {
          puntaje += 6;
          detalles.push(`Precio cerca de VWAP (${fmtPct(distVwap)}) — valor justo de mercado`);
        }
      }
    }

    // 5. Order book depth
    maxPuntaje += 15;
    if (orderBook && orderBook.bids.length > 5 && orderBook.asks.length > 5) {
      const bidVol = orderBook.bids.slice(0, 5).reduce((s, l) => s + l.volume, 0);
      const askVol = orderBook.asks.slice(0, 5).reduce((s, l) => s + l.volume, 0);
      const ratio = bidVol / (askVol || 1);
      if (ratio > 1.5) {
        puntaje += 12;
        detalles.push(
          `Libro de demanda fuerte (ratio bid/ask: ${ratio.toFixed(2)}) — soporte sólido`,
        );
      } else if (ratio < 0.67) {
        puntaje += 13;
        detalles.push(
          `Libro de oferta fuerte (ratio bid/ask: ${ratio.toFixed(2)}) — resistencia sólida`,
        );
      } else {
        puntaje += 6;
        detalles.push(
          `Libro equilibrado (ratio bid/ask: ${ratio.toFixed(2)}) — sin desbalance significativo`,
        );
      }
    }

    // 6. Signal performance history
    maxPuntaje += 15;
    if (metrics.totalSignals >= 3) {
      if (metrics.winRate > 0.6 && metrics.pnlTotal > 0) {
        puntaje += 12;
        detalles.push(
          `Señales recientes: ${metrics.totalSignals} trades, ${fmtPct(metrics.winRate * 100)} win rate, P&L ${fmtPct(metrics.pnlTotal)} — estrategia funcionando`,
        );
      } else if (metrics.winRate < 0.3 || metrics.pnlTotal < -20) {
        puntaje -= 15;
        detalles.push(
          ` Señales recientes negativas: ${fmtPct(metrics.winRate * 100)} win rate, P&L ${fmtPct(metrics.pnlTotal)} — considerar ajustar parámetros`,
        );
      } else {
        puntaje += 4;
        detalles.push(
          `Señales mixtas: ${metrics.totalSignals} trades, ${fmtPct(metrics.winRate * 100)} win rate, P&L ${fmtPct(metrics.pnlTotal)}`,
        );
      }
    }

    // 7. Active signal status
    const activeSignal = signals.find((s) => s.status === "abierta");
    if (activeSignal) {
      const currentPnl = ticker
        ? ((ticker.lastPrice - activeSignal.entryPrice) / activeSignal.entryPrice) *
          100 *
          (activeSignal.type === "LONG" ? 1 : -1)
        : 0;
      detalles.push(
        `Señal activa: ${activeSignal.type} desde $${activeSignal.entryPrice.toFixed(2)} — P&L flotante: ${fmtPct(currentPnl)}`,
      );
    }

    // Determine final signal
    const pct = maxPuntaje > 0 ? (puntaje / maxPuntaje) * 100 : 0;
    let senal: SenalInterpretacion;
    let riesgo: "bajo" | "medio" | "alto";

    if (pct >= 70) {
      senal = obiCalc.zScore < 0 ? "COMPRA_FUERTE" : "VENTA_FUERTE";
      riesgo = "bajo";
    } else if (pct >= 50) {
      senal = obiCalc.zScore < 0 ? "COMPRA" : "VENTA";
      riesgo = "medio";
    } else if (pct >= 30) {
      senal = "NEUTRAL";
      riesgo = "medio";
    } else {
      senal = "NEUTRAL";
      riesgo = "alto";
    }

    let accion: string;
    if (senal === "COMPRA_FUERTE")
      accion = `Abrir LONG en ${symbol} — condiciones de sobreventa extrema`;
    else if (senal === "VENTA_FUERTE")
      accion = `Abrir SHORT en ${symbol} — condiciones de sobrecompra extrema`;
    else if (senal === "COMPRA") accion = `Considerar LONG en ${symbol} con stops ajustados`;
    else if (senal === "VENTA") accion = `Considerar SHORT en ${symbol} con stops ajustados`;
    else accion = `Mantener ${symbol} — esperar señal clara`;

    let resumen: string;
    if (senal === "COMPRA_FUERTE")
      resumen = `Momento favorable para COMPRA en ${symbol}. Múltiples indicadores alineados: sobreventa extrema + presión compradora en OB.`;
    else if (senal === "VENTA_FUERTE")
      resumen = `Momento favorable para VENTA en ${symbol}. Múltiples indicadores alineados: sobrecompra extrema + presión vendedora en OB.`;
    else if (senal === "COMPRA")
      resumen = `Leve sesgo alcista en ${symbol}. Z-Score en zona de sobreventa pero sin confirmación adicional.`;
    else if (senal === "VENTA")
      resumen = `Leve sesgo bajista en ${symbol}. Z-Score en zona de sobrecompra pero sin confirmación adicional.`;
    else
      resumen = `Sin señal clara en ${symbol}. Esperar que Z-Score cruce el umbral de ${umbral}σ para tomar posición.`;

    return { senal, confianza: Math.round(pct), resumen, detalles, riesgo, accion };
  }, [
    symbol,
    ticker,
    orderBook,
    obiCalc,
    obiHistory,
    zScoreHistory,
    atr,
    signals,
    metrics,
    umbral,
  ]);

  const colorSenal: Record<string, string> = {
    COMPRA_FUERTE: "bg-green-500/20 border-green-500/40 text-green-400",
    COMPRA: "bg-green-500/10 border-green-500/30 text-green-300",
    NEUTRAL: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300",
    VENTA: "bg-red-500/10 border-red-500/30 text-red-300",
    VENTA_FUERTE: "bg-red-500/20 border-red-500/40 text-red-400",
  };

  const colorRiesgo: Record<string, string> = {
    bajo: "text-green-400",
    medio: "text-yellow-400",
    alto: "text-red-400",
  };

  return (
    <div className="space-y-3">
      <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Interpretación de Mercado
      </div>

      {/* Señal principal */}
      <div
        className={`rounded-lg border p-4 ${colorSenal[interpretacion.senal] ?? "bg-muted/10 border-border/40 text-muted-foreground"}`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-bold tracking-tight">
            {interpretacion.senal.replace("_", " ")}
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono ${colorRiesgo[interpretacion.riesgo]}`}>
              Riesgo: {interpretacion.riesgo.toUpperCase()}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              Confianza: {interpretacion.confianza}%
            </span>
          </div>
        </div>
        <p className="text-sm leading-relaxed">{interpretacion.resumen}</p>
      </div>

      {/* Acción sugerida */}
      <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
        <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Acción sugerida
        </div>
        <p className="font-mono text-sm font-medium text-foreground">{interpretacion.accion}</p>
      </div>

      {/* Detalles del análisis */}
      <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
        <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Factores considerados
        </div>
        <ul className="space-y-1.5">
          {interpretacion.detalles.map((d, i) => (
            <li
              key={i}
              className="text-[11px] font-mono text-muted-foreground leading-relaxed flex items-start gap-2"
            >
              <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
              {d}
            </li>
          ))}
        </ul>
      </div>

      {/* Métricas clave */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-md border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">OBI</div>
          <div
            className={`font-mono text-sm ${obiCalc ? (obiCalc.obi > 0 ? "text-green-400" : "text-red-400") : "text-muted-foreground"}`}
          >
            {obiCalc ? obiCalc.obi.toFixed(3) : "\u2014"}
          </div>
        </div>
        <div className="rounded-md border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Z-Score</div>
          <div
            className={`font-mono text-sm ${obiCalc ? (Math.abs(obiCalc.zScore) >= umbral ? "text-yellow-400" : "") : "text-muted-foreground"}`}
          >
            {obiCalc ? obiCalc.zScore.toFixed(2) : "\u2014"}σ
          </div>
        </div>
        <div className="rounded-md border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">ATR</div>
          <div className="font-mono text-sm">{atr ? fmtPct(atr.atrPct) : "\u2014"}</div>
        </div>
        <div className="rounded-md border border-border/30 bg-muted/5 p-2 text-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Spread</div>
          <div className="font-mono text-sm text-cyan-400">
            {orderBook ? fmtPct(orderBook.spreadPct, 3) : "\u2014"}
          </div>
        </div>
      </div>
    </div>
  );
}
