// @ts-nocheck
"use client";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchBinanceKlines,
  fetchBinanceCommissions,
  placeBinanceOrder,
  fetchBinanceAccountBalance,
} from "@/lib/cripto.functions";
import {
  saveSignal,
  updateSignal,
  saveOrderBookSnapshot,
  getSignalHistory,
} from "@/lib/binance-storage.functions";
import {
  calcularOBI,
  calcularZScore,
  calcularATR,
  calcularVWAP,
  generarSenial,
  parseKline,
} from "@/lib/cripto.math";
import type { Signal, PaperTradingMetrics, Kline } from "@/lib/cripto.types";
import { OrderBookChart } from "./OrderBookChart";
import { ObiZscoreChart } from "./ObiZscoreChart";
import { PriceVwapChart } from "./PriceVwapChart";
import { SignalsTable } from "./SignalsTable";
import { MarketInterpretation } from "./MarketInterpretation";

const PARES_PREDEFINIDOS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];

function fmtNum(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

export function BinancePairsPanel() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [inputSymbol, setInputSymbol] = useState("BTCUSDT");
  const [umbral, setUmbral] = useState(1.8);
  const [slMult, setSlMult] = useState(2);
  const [tpMult, setTpMult] = useState(7);
  const [warmup, setWarmup] = useState(100);
  const [atrPeriod, setAtrPeriod] = useState(14);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("binance_api_key") || "");
  const [apiSecret, setApiSecret] = useState(
    () => localStorage.getItem("binance_api_secret") || "",
  );
  const saveKeys = () => {
    localStorage.setItem("binance_api_key", apiKey);
    localStorage.setItem("binance_api_secret", apiSecret);
    setDemoMode(true);
    setError(null);
  };
  const clearKeys = () => {
    localStorage.removeItem("binance_api_key");
    localStorage.removeItem("binance_api_secret");
    setApiKey("");
    setApiSecret("");
    setDemoMode(false);
    setError(null);
  };
  const [demoMode, setDemoMode] = useState(() => !!localStorage.getItem("binance_api_key"));
  const [error, setError] = useState<string | null>(null);
  const [orderLoading, setOrderLoading] = useState<string | null>(null);
  const placeOrderFn = useServerFn(placeBinanceOrder);
  const apiKeyRef = useRef(apiKey);
  const apiSecretRef = useRef(apiSecret);
  const demoModeRef = useRef(demoMode);
  const symbolRef = useRef(symbol);
  apiKeyRef.current = apiKey;
  apiSecretRef.current = apiSecret;
  demoModeRef.current = demoMode;
  symbolRef.current = symbol;
  const closePosition = useCallback(
    async (s: Signal) => {
      if (!s.quantity || !apiKey || !apiSecret) return;
      const side = s.type === "LONG" ? "SELL" : "BUY";
      setOrderLoading(`closing_${s.timestamp}`);
      try {
        await placeOrderFn({
          data: { symbol, side, type: "MARKET", quantity: s.quantity, apiKey, apiSecret },
        });
        setSignals((prev) =>
          prev.map((x) =>
            x.timestamp === s.timestamp
              ? {
                  ...x,
                  status: "cancelada" as const,
                  exitReason: "cancelada" as const,
                  exitPrice: 0,
                  exitTime: Date.now(),
                }
              : x,
          ),
        );
      } catch (e: any) {
        setError(e.message);
      } finally {
        setOrderLoading(null);
      }
    },
    [symbol, apiKey, apiSecret, placeOrderFn],
  );

  const ws = useBinanceWebSocket(symbol, demoMode);
  const fetchKlines = useServerFn(fetchBinanceKlines);
  const fetchCommissions = useServerFn(fetchBinanceCommissions);

  const [obiHistory, setObiHistory] = useState<number[]>([]);
  const [zScoreHistory, setZScoreHistory] = useState<number[]>([]);
  const [currentObiCalc, setCurrentObiCalc] = useState<{
    obi: number;
    zScore: number;
    microPrice: number;
  } | null>(null);
  const [atr, setAtr] = useState<{ atrPct: number } | null>(null);
  const [vwap, setVwap] = useState<number | null>(null);
  const [klines, setKlines] = useState<Kline[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [commissions, setCommissions] = useState<{ maker: number; taker: number } | null>(null);
  const [accountBalance, setAccountBalance] = useState<{
    usdtFree: number;
    canTrade: boolean;
    maker: number;
    taker: number;
  } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const lastObiRef = useRef(0);

  // Cargar klines iniciales via server proxy (evita CORS)
  useEffect(() => {
    if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return;
    let cancelled = false;
    async function loadKlines() {
      try {
        const parsed = await fetchKlines({ data: { symbol, interval: "5m", limit: 50 } });
        if (cancelled) return;
        setKlines(parsed);
        setVwap(calcularVWAP(parsed));
        setAtr({ atrPct: calcularATR(parsed, atrPeriod).atrPct });
      } catch {
        /* ignore */
      }
    }
    loadKlines();
    return () => {
      cancelled = true;
    };
  }, [symbol, atrPeriod]);

  // Fetch real Binance commissions
  useEffect(() => {
    if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return;
    fetchCommissions({ data: { symbol } })
      .then(setCommissions)
      .catch(() => {});
  }, [symbol]);

  // Fetch Binance account balance (testnet) with user API keys
  const fetchBalance = useCallback(async () => {
    const key = localStorage.getItem("binance_api_key");
    const secret = localStorage.getItem("binance_api_secret");
    if (!key || !secret) return;
    setBalanceLoading(true);
    try {
      const acc = await fetchBinanceAccountBalance({ data: { apiKey: key, apiSecret: secret } });
      const usdt = acc.balances.find((b) => b.asset === "USDT");
      setAccountBalance({
        usdtFree: parseFloat(usdt?.free ?? "0"),
        canTrade: acc.canTrade,
        maker: acc.makerCommission * 100,
        taker: acc.takerCommission * 100,
      });
    } catch {
      setAccountBalance(null);
    }
    setBalanceLoading(false);
  }, []);
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Cargar historial de señales desde Supabase al montar
  useEffect(() => {
    getSignalHistory({ data: { symbol, limit: 100 } })
      .then((rows) => {
        if (rows) {
          const mapped: Signal[] = rows.map((r: any) => ({
            timestamp: r.timestamp,
            type: r.type,
            entryPrice: r.entry_price,
            sl: r.sl,
            tp: r.tp,
            zScore: r.z_score,
            obi: r.obi,
            status: r.status,
            exitPrice: r.exit_price ?? undefined,
            exitTime: r.exit_time ?? undefined,
            pnl: r.pnl ?? undefined,
            pnlPct: r.pnl_pct ?? undefined,
            exitReason: r.exit_reason ?? undefined,
            binanceOrderId: r.binance_order_id ?? undefined,
            quantity: r.quantity ?? undefined,
          }));
          setSignals(mapped);
        }
      })
      .catch(() => {});
  }, [symbol]);

  // Guardar snapshot del order book cada 30 segundos
  const obSnapshotRef = useRef(0);
  useEffect(() => {
    if (!ws.orderBook || !ws.connected) return;
    const now = Date.now();
    if (now - obSnapshotRef.current < 30000) return;
    obSnapshotRef.current = now;
    saveOrderBookSnapshot({
      data: {
        symbol,
        timestamp: now,
        bestBid: ws.orderBook.bestBid,
        bestAsk: ws.orderBook.bestAsk,
        spread: ws.orderBook.spread,
        spreadPct: ws.orderBook.spreadPct,
        midPrice: ws.orderBook.midPrice,
        bids: ws.orderBook.bids,
        asks: ws.orderBook.asks,
        obi: currentObiCalc?.obi,
        zScore: currentObiCalc?.zScore,
      },
    }).catch(() => {});
  }, [ws.orderBook, ws.connected, symbol, currentObiCalc]);

  // Calcular OBI y z-score en cada actualización del order book
  useEffect(() => {
    if (!ws.orderBook) return;
    const { obi, microPrice } = calcularOBI(ws.orderBook.bids, ws.orderBook.asks, 10);
    if (obi === 0) return;

    setObiHistory((prev) => {
      const next = [...prev, obi];
      if (next.length > 1500) next.splice(0, next.length - 1500);
      return next;
    });

    const zResult = calcularZScore(obiHistory, obi, warmup);
    setCurrentObiCalc({ obi, zScore: zResult.zScore, microPrice });
    setZScoreHistory((prev) => {
      const next = [...prev, zResult.zScore];
      if (next.length > 500) next.splice(0, next.length - 500);
      return next;
    });

    // Generar señal si el z-score cruza el umbral
    const price = ws.ticker?.lastPrice ?? ws.orderBook.midPrice;
    if (price > 0 && atr && obiHistory.length >= warmup) {
      const senial = generarSenial(zResult.zScore, umbral, price, atr.atrPct, slMult, tpMult);
      if (senial.type && Math.abs(zResult.zScore - lastObiRef.current) > 0.1) {
        lastObiRef.current = zResult.zScore;
        const existingOpen = signals.some((s) => s.status === "abierta");
        if (!existingOpen) {
          const signalType = senial.type as "LONG" | "SHORT";
          const qty = 0.001;
          if (demoModeRef.current && apiKeyRef.current && apiSecretRef.current) {
            const side = signalType === "LONG" ? "BUY" : "SELL";
            setOrderLoading(`placing_${side}_${symbolRef.current}`);
            placeOrderFn({
              data: {
                symbol: symbolRef.current,
                side,
                type: "MARKET",
                quantity: qty,
                apiKey: apiKeyRef.current,
                apiSecret: apiSecretRef.current,
              },
            })
              .then((res) => {
                setOrderLoading(null);
                const newSignal: Signal = {
                  timestamp: Date.now(),
                  type: signalType,
                  entryPrice: price,
                  sl: senial.sl,
                  tp: senial.tp,
                  zScore: zResult.zScore,
                  obi,
                  status: "abierta",
                  binanceOrderId: res.orderId,
                  quantity: qty,
                };
                setSignals((prev) => [...prev, newSignal]);
                saveSignal({ data: { symbol, ...newSignal } }).catch(() => {});
              })
              .catch((e: Error) => {
                setOrderLoading(null);
                setError(e.message);
              });
          } else {
            const newSignal: Signal = {
              timestamp: Date.now(),
              type: signalType,
              entryPrice: price,
              sl: senial.sl,
              tp: senial.tp,
              zScore: zResult.zScore,
              obi,
              status: "abierta",
            };
            setSignals((prev) => [...prev, newSignal]);
            saveSignal({ data: { symbol, ...newSignal } }).catch(() => {});
          }
        }
      }

      // Check exit for open signals
      setSignals((prev) =>
        prev.map((s) => {
          if (s.status !== "abierta") return s;
          let updated: Signal | null = null;
          if (senial.type === null) {
            updated = {
              ...s,
              status: "tp" as const,
              exitPrice: price,
              exitTime: Date.now(),
              pnl: price - s.entryPrice,
              pnlPct: ((price - s.entryPrice) / s.entryPrice) * 100,
              exitReason: "tp" as const,
            };
          } else if (s.type === "LONG" && price <= s.sl) {
            updated = {
              ...s,
              status: "sl" as const,
              exitPrice: price,
              exitTime: Date.now(),
              pnl: price - s.entryPrice,
              pnlPct: ((price - s.entryPrice) / s.entryPrice) * 100,
              exitReason: "sl" as const,
            };
          } else if (s.type === "SHORT" && price >= s.sl) {
            updated = {
              ...s,
              status: "sl" as const,
              exitPrice: price,
              exitTime: Date.now(),
              pnl: s.entryPrice - price,
              pnlPct: ((s.entryPrice - price) / s.entryPrice) * 100,
              exitReason: "sl" as const,
            };
          }
          if (updated) {
            updateSignal({
              data: {
                timestamp: updated.timestamp,
                status: updated.status,
                exitPrice: updated.exitPrice,
                exitTime: updated.exitTime,
                pnl: updated.pnl,
                pnlPct: updated.pnlPct,
                exitReason: updated.exitReason,
              },
            }).catch(() => {});
            return updated;
          }
          return s;
        }),
      );
    }
  }, [ws.orderBook, ws.ticker]);

  const metrics = useMemo(() => {
    const closed = signals.filter((s) => s.status === "tp" || s.status === "sl");
    const wins = closed.filter(
      (s) =>
        (s.type === "LONG" && (s.exitPrice ?? 0) > s.entryPrice) ||
        (s.type === "SHORT" && (s.exitPrice ?? 0) < s.entryPrice),
    );
    const totalPnl = closed.reduce((sum, s) => sum + (s.pnl ?? 0), 0);
    const pnlPcts = closed.map((s) => Math.abs(s.pnlPct ?? 0)).filter((v) => isFinite(v));
    const closedPnl = closed.map((s) => s.pnl ?? 0).filter((v) => isFinite(v));
    const best = closed.reduce(
      (best, s) => (Math.abs(s.pnl ?? 0) > Math.abs(best.pnl ?? 0) ? s : best),
      closed[0] ?? null,
    );
    const worst = closed.reduce(
      (worst, s) => (Math.abs(s.pnl ?? 0) < Math.abs(worst.pnl ?? 0) ? s : worst),
      closed[0] ?? null,
    );
    const equityCurve = closedPnl.reduce((acc: number[], v) => {
      acc.push((acc[acc.length - 1] ?? 0) + v);
      return acc;
    }, []);
    const maxEquity = equityCurve.length > 0 ? Math.max(...equityCurve) : 0;
    const maxDrawdown =
      equityCurve.length > 0 && maxEquity > 0
        ? Math.max(...equityCurve.map((v) => (maxEquity - v) / maxEquity))
        : 0;
    const meanPnl =
      closedPnl.length > 0 ? closedPnl.reduce((a, b) => a + b, 0) / closedPnl.length : 0;
    const stdPnl =
      closedPnl.length > 1
        ? Math.sqrt(closedPnl.reduce((s, v) => s + (v - meanPnl) ** 2, 0) / (closedPnl.length - 1))
        : 0;
    const sharpe = stdPnl > 0 ? (meanPnl / stdPnl) * Math.sqrt(365) : 0;
    const profitFactor =
      closedPnl.length > 0
        ? closedPnl.filter((v) => v > 0).reduce((a, b) => a + b, 0) /
          Math.max(0.0001, Math.abs(closedPnl.filter((v) => v < 0).reduce((a, b) => a + b, 0)))
        : 0;
    const longTrades = closed.filter((s) => s.type === "LONG");
    const shortTrades = closed.filter((s) => s.type === "SHORT");
    const longWinRate =
      longTrades.length > 0
        ? longTrades.filter((s) => (s.exitPrice ?? 0) > s.entryPrice).length / longTrades.length
        : 0;
    const shortWinRate =
      shortTrades.length > 0
        ? shortTrades.filter((s) => (s.exitPrice ?? 0) < s.entryPrice).length / shortTrades.length
        : 0;
    return {
      totalSignals: signals.length,
      totalClosed: closed.length,
      winRate: closed.length > 0 ? wins.length / closed.length : 0,
      longWinRate,
      shortWinRate,
      pnlTotal: totalPnl,
      pnlPctTotal: signals.length > 0 ? closedPnl.reduce((a, b) => a + b, 0) * 100 : 0,
      bestTrade: best ? (best.pnl ?? 0) : 0,
      worstTrade: worst ? (worst.pnl ?? 0) : 0,
      avgRR: pnlPcts.length > 0 ? pnlPcts.reduce((a, b) => a + b, 0) / pnlPcts.length : 0,
      sharpe,
      maxDrawdown,
      profitFactor,
      avgReturn: meanPnl * 100,
      bestTradeRR: best ? Math.abs((best.pnl ?? 0) / (best.entryPrice * 0.01)) : 0,
    };
  }, [signals]);

  return (
    <div className="space-y-4">
      {/* Config */}
      <Card className="bg-surface border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-foreground text-sm font-medium">
            Configuraci&oacute;n
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-8">
            <div>
              <Label className="text-[10px] text-muted-foreground">Par</Label>
              <div className="flex gap-1 mt-1">
                {PARES_PREDEFINIDOS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setSymbol(p);
                      setInputSymbol(p);
                      setSignals([]);
                      setObiHistory([]);
                      setZScoreHistory([]);
                    }}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${symbol === p ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground"}`}
                  >
                    {p.replace("USDT", "")}
                  </button>
                ))}
              </div>
              <Input
                value={inputSymbol}
                onChange={(e) => setInputSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSymbol(inputSymbol);
                    setSignals([]);
                    setObiHistory([]);
                    setZScoreHistory([]);
                  }
                }}
                className="mt-1 h-7 text-[11px] bg-background/40 border-border/60 font-mono"
                placeholder="SYMBOLUSDT"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Umbral Z</Label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={umbral}
                onChange={(e) => setUmbral(parseFloat(e.target.value))}
                className="mt-2 w-full"
              />
              <div className="text-[10px] text-center text-muted-foreground">
                {umbral.toFixed(1)}σ
              </div>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Warmup</Label>
              <Input
                type="number"
                value={warmup}
                onChange={(e) => setWarmup(parseInt(e.target.value) || 100)}
                className="mt-1 h-7 text-[11px] bg-background/40 border-border/60 font-mono"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">ATR Period</Label>
              <Input
                type="number"
                value={atrPeriod}
                onChange={(e) => setAtrPeriod(parseInt(e.target.value) || 14)}
                className="mt-1 h-7 text-[11px] bg-background/40 border-border/60 font-mono"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">SL Multi</Label>
              <Input
                type="number"
                value={slMult}
                onChange={(e) => setSlMult(parseFloat(e.target.value) || 2)}
                className="mt-1 h-7 text-[11px] bg-background/40 border-border/60 font-mono"
                step="0.5"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">TP Multi</Label>
              <Input
                type="number"
                value={tpMult}
                onChange={(e) => setTpMult(parseFloat(e.target.value) || 7)}
                className="mt-1 h-7 text-[11px] bg-background/40 border-border/60 font-mono"
                step="0.5"
              />
            </div>
          </div>
          {/* Binance API Keys + Demo Mode */}
          <details className="mt-3 [&>summary]:cursor-pointer">
            <summary className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground select-none">
              🔑 Binance API Keys {apiKey ? "(✓)" : ""}
            </summary>
            <div className="mt-2 space-y-2 border border-border/40 rounded p-2 bg-muted/10">
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key"
                type="password"
                className="w-full h-7 text-[10px] font-mono bg-background/40 border border-border/60 rounded px-2 outline-none focus:border-primary/60"
              />
              <input
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="API Secret"
                type="password"
                className="w-full h-7 text-[10px] font-mono bg-background/40 border border-border/60 rounded px-2 outline-none focus:border-primary/60"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveKeys}
                  className="flex-1 rounded bg-primary/20 px-2 py-1 text-[10px] font-mono text-primary hover:bg-primary/30"
                >
                  Guardar
                </button>
                <button
                  onClick={clearKeys}
                  className="rounded bg-danger/20 px-2 py-1 text-[10px] font-mono text-danger hover:bg-danger/30"
                >
                  Eliminar
                </button>
              </div>
              <div className="flex items-center justify-between border-t border-border/40 pt-2">
                <span className="text-[10px] font-mono text-muted-foreground">
                  Modo Demo (testnet)
                </span>
                <button
                  onClick={() => setDemoMode((d) => !d)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${demoMode ? "bg-success/20 text-success" : "bg-muted/20 text-muted-foreground"}`}
                >
                  {demoMode ? "ACTIVO" : "INACTIVO"}
                </button>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 font-mono text-[11px] text-red-400">
          {error}
        </div>
      )}
      {/* Status Card */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="bg-surface border-border/60 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="mono text-sm font-medium">
                {symbol.replace("USDT", "")}/USDT
              </CardTitle>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${ws.connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {ws.connected ? "LIVE" : "Desconectado"}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-[10px] text-muted-foreground">Precio</div>
                <div className="text-lg font-mono font-medium">
                  ${fmtNum(ws.ticker?.lastPrice ?? ws.orderBook?.midPrice ?? null)}
                  <span
                    className={`ml-2 text-[11px] ${(ws.ticker?.priceChangePercent ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {fmtPct(ws.ticker?.priceChangePercent ?? null, 2)}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">OBI</div>
                <div className="text-lg font-mono">
                  {currentObiCalc ? fmtNum(currentObiCalc.obi, 3) : "\u2014"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Z-Score</div>
                <div
                  className={`text-lg font-mono ${currentObiCalc ? (Math.abs(currentObiCalc.zScore) >= umbral ? "text-yellow-400" : "") : ""}`}
                >
                  {currentObiCalc ? fmtNum(currentObiCalc.zScore, 2) : "\u2014"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">ATR (14)</div>
                <div className="text-lg font-mono">{atr ? fmtPct(atr.atrPct, 2) : "\u2014"}</div>
              </div>
            </div>
            {/* Señal */}
            {currentObiCalc &&
              Math.abs(currentObiCalc.zScore) >= umbral &&
              obiHistory.length >= warmup && (
                <div
                  className={`mt-2 rounded-md px-3 py-2 text-sm font-semibold animate-pulse ${currentObiCalc.zScore > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
                >
                  {currentObiCalc.zScore > 0 ? "▲ SEÑAL LONG" : "▼ SEÑAL SHORT"}
                </div>
              )}
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
              <span>
                Best Bid: ${fmtNum(ws.orderBook?.bestBid)} (Vol:{" "}
                {fmtNum(ws.orderBook?.bids[0]?.volume, 4)})
              </span>
              <span>
                Best Ask: ${fmtNum(ws.orderBook?.bestAsk)} (Vol:{" "}
                {fmtNum(ws.orderBook?.asks[0]?.volume, 4)})
              </span>
              <span>
                Spread: ${fmtNum(ws.orderBook?.spread)} ({fmtNum(ws.orderBook?.spreadPct, 3)}%)
              </span>
              <span>Micro-price: ${fmtNum(currentObiCalc?.microPrice)}</span>
              {commissions && (
                <>
                  <span>Maker fee: {fmtPct(commissions.maker * 100, 3)}</span>
                  <span>Taker fee: {fmtPct(commissions.taker * 100, 3)}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account Balance */}
        <Card className="bg-surface border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Cuenta Binance {demoMode ? "Testnet" : ""}
              </CardTitle>
              <div className="flex items-center gap-2">
                {accountBalance?.canTrade && (
                  <span className="text-[9px] font-mono text-success">Trade ✓</span>
                )}
                <button
                  onClick={fetchBalance}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground hover:text-foreground"
                  disabled={balanceLoading}
                >
                  {balanceLoading ? "..." : "Actualizar"}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Maker</span>
                <span>{accountBalance != null ? fmtPct(accountBalance.maker, 3) : "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taker</span>
                <span>{accountBalance != null ? fmtPct(accountBalance.taker, 3) : "\u2014"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">USDT Libre</span>
                <span className="text-foreground font-semibold">
                  {accountBalance != null ? `$${fmtNum(accountBalance.usdtFree, 2)}` : "\u2014"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backtesting Results */}
      <Card className="bg-surface border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Resultados del Backtesting
            </CardTitle>
            <span className="text-[10px] text-muted-foreground">
              {metrics.totalClosed} trades cerrados
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-[9px] text-muted-foreground">Win Rate</div>
              <div
                className={`text-sm font-mono font-semibold ${metrics.winRate >= 0.5 ? "text-emerald-400" : "text-red-400"}`}
              >
                {fmtPct(metrics.winRate * 100, 1)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground">P&L Total</div>
              <div
                className={`text-sm font-mono font-semibold ${metrics.avgReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {fmtPct(metrics.pnlPctTotal, 2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground">Sharpe</div>
              <div
                className={`text-sm font-mono font-semibold ${metrics.sharpe >= 1 ? "text-emerald-400" : metrics.sharpe >= 0 ? "text-amber-400" : "text-red-400"}`}
              >
                {metrics.sharpe != null ? fmtNum(metrics.sharpe, 2) : "\u2014"}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground">Max Drawdown</div>
              <div className="text-sm font-mono font-semibold text-red-400">
                {fmtPct(-metrics.maxDrawdown * 100, 2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground">Profit Factor</div>
              <div
                className={`text-sm font-mono font-semibold ${metrics.profitFactor >= 1.5 ? "text-emerald-400" : metrics.profitFactor >= 1 ? "text-amber-400" : "text-red-400"}`}
              >
                {fmtNum(metrics.profitFactor, 2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground">Retorno Promedio</div>
              <div
                className={`text-sm font-mono font-semibold ${metrics.avgReturn >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {fmtPct(metrics.avgReturn, 2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground">Win Rate LONG</div>
              <div className="text-sm font-mono font-semibold text-emerald-400">
                {fmtPct(metrics.longWinRate * 100, 1)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground">Win Rate SHORT</div>
              <div className="text-sm font-mono font-semibold text-red-400">
                {fmtPct(metrics.shortWinRate * 100, 1)}
              </div>
            </div>
          </div>
          {demoMode && signals.filter((s) => s.status === "abierta").length > 0 && (
            <div className="mt-3 space-y-1 border-t border-border/40 pt-2">
              <div className="text-[9px] text-muted-foreground mb-1">Posiciones abiertas:</div>
              {signals
                .filter((s) => s.status === "abierta")
                .map((s) => (
                  <div
                    key={s.timestamp}
                    className="flex items-center justify-between bg-muted/10 rounded p-1.5"
                  >
                    <div>
                      <span
                        className={`text-[10px] font-semibold ${s.type === "LONG" ? "text-green-400" : "text-red-400"}`}
                      >
                        {s.type} {symbol.replace("USDT", "")}
                      </span>
                      <div className="text-[9px] text-muted-foreground">
                        ${fmtNum(s.entryPrice)} · {s.quantity} · Order #{s.binanceOrderId}
                      </div>
                    </div>
                    <button
                      onClick={() => closePosition(s)}
                      disabled={orderLoading === `closing_${s.timestamp}`}
                      className="text-[9px] rounded bg-danger/20 px-2 py-0.5 font-mono text-danger hover:bg-danger/30 disabled:opacity-50"
                    >
                      {orderLoading === `closing_${s.timestamp}` ? "..." : "Cerrar"}
                    </button>
                  </div>
                ))}
            </div>
          )}
          {orderLoading?.startsWith("placing") && (
            <div className="mt-2 text-[10px] font-mono text-yellow-400 animate-pulse">
              Enviando orden... {orderLoading}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Market Interpretation */}
      <Card className="bg-surface border-border/60">
        <CardContent className="p-4">
          <MarketInterpretation
            symbol={symbol}
            ticker={ws.ticker}
            orderBook={ws.orderBook}
            obiCalc={currentObiCalc}
            obiHistory={obiHistory}
            zScoreHistory={zScoreHistory}
            atr={atr}
            signals={signals}
            metrics={metrics}
            umbral={umbral}
          />
        </CardContent>
      </Card>

      {/* Signals Table — ARRIBA DE TODO */}
      <Card className="bg-surface border-border/60">
        <CardContent className="p-4">
          <SignalsTable signals={signals} feePct={commissions?.taker ?? 0.001} />
          <div className="mt-2 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSignals([])}
              className="h-7 text-[10px] border-border/60 text-muted-foreground"
            >
              Limpiar señales
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Charts: horizontal full-width, one below the other */}
      <div className="space-y-4">
        <Card className="bg-surface border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Order Book Depth
              </h3>
              <span
                className={`h-2 w-2 rounded-full ${ws.connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
              />
            </div>
            <OrderBookChart orderBook={ws.orderBook} />
          </CardContent>
        </Card>
        <Card className="bg-surface border-border/60">
          <CardContent className="p-4">
            <ObiZscoreChart obiHistory={obiHistory} zScoreHistory={zScoreHistory} umbral={umbral} />
          </CardContent>
        </Card>
        <Card className="bg-surface border-border/60">
          <CardContent className="p-4">
            <PriceVwapChart klines={klines} vwap={vwap ?? 0} currentPrice={ws.ticker?.lastPrice} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
