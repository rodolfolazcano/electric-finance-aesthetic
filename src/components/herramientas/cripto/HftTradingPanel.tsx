"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HftSignalEngine, calcularCantidad, calcularSlTp, HFT_DEFAULTS } from "@/lib/cripto/hft-signal-engine";
import { placeFuturesOrder, configureFuturesAccount, killSwitchFutures } from "@/lib/cripto/hft-execution";
import { placeBinanceOrder, fetchBinanceKlines } from "@/lib/cripto.functions";
import type { Kline } from "@/lib/cripto.types";

type Venue = "spot" | "futures";
type LogEntry = { ts: string; side: string; z: string; prob: string; msg: string; live: boolean };

export function HftTradingPanel() {
  const [venue, setVenue] = useState<Venue>("futures");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [dryRun, setDryRun] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [balance, setBalance] = useState<number>(1000);
  const [zThresh, setZThresh] = useState<number>(HFT_DEFAULTS.zThreshold);
  const [probMin, setProbMin] = useState<number>(HFT_DEFAULTS.probMin);
  const [riskPct, setRiskPct] = useState<number>(HFT_DEFAULTS.riskPct);

  const [obi, setObi] = useState(0);
  const [microPrice, setMicroPrice] = useState(0);
  const [zScore, setZScore] = useState(0);
  const [regimen, setRegimen] = useState("DESCONOCIDO");
  const [pcaRatio, setPcaRatio] = useState(0);
  const [prob, setProb] = useState<{ final: number; emp: number; bs: number } | null>(null);
  const [lastSignal, setLastSignal] = useState<string>("-");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeCount, setActiveCount] = useState(0);

  const engineRef = useRef<HftSignalEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const klinesRef = useRef<Kline[]>([]);
  const closesRef = useRef<{ h: number[]; l: number[]; c: number[] }>({ h: [], l: [], c: [] });

  const fetchKlinesFn = useServerFn(fetchBinanceKlines);
  const placeFuturesOrderFn = useServerFn(placeFuturesOrder);
  const placeSpotOrderFn = useServerFn(placeBinanceOrder);
  const configureFuturesFn = useServerFn(configureFuturesAccount);
  const killSwitchFn = useServerFn(killSwitchFutures);

  useEffect(() => {
    engineRef.current = new HftSignalEngine({ ...HFT_DEFAULTS, zThreshold: zThresh, probMin, riskPct });
  }, [zThresh, probMin, riskPct]);

  useEffect(() => {
    let cancel = false;
    const fetch = async () => {
      try {
        const kl = await fetchKlinesFn({ data: { symbol, interval: "1m", limit: 50 } });
        if (cancel) return;
        klinesRef.current = kl;
        closesRef.current = { h: kl.map((k) => k.high), l: kl.map((k) => k.low), c: kl.map((k) => k.close) };
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 60000);
    return () => { cancel = true; clearInterval(id); };
  }, [symbol, fetchKlinesFn]);

  useEffect(() => {
    if (!isRunning) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      setConnected(false);
      return;
    }
    const symLower = symbol.toLowerCase();
    const host = venue === "futures" ? "demo-stream.binance.com" : "testnet.binance.vision";
    const url = venue === "futures"
      ? `wss://demo-stream.binance.com/stream?streams=${symLower}@depth20@100ms`
      : `wss://${host}/stream?streams=${symLower}@depth20@100ms/${symLower}@ticker`;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => ws.close();
    ws.onmessage = async (e) => {
      try {
        const raw = JSON.parse(e.data as string);
        const data = raw.data ?? raw;
        const bids: [string, string][] = data.bids ?? [];
        const asks: [string, string][] = data.asks ?? [];
        if (!bids.length || !asks.length) return;
        const bidsNum: [number, number][] = bids.map((x: [string, string]) => [parseFloat(x[0]), parseFloat(x[1])]);
        const asksNum: [number, number][] = asks.map((x: [string, string]) => [parseFloat(x[0]), parseFloat(x[1])]);

        const eng = engineRef.current;
        if (!eng) return;
        eng.pushTick(bidsNum, asksNum);

        const evalRes = eng.evaluate({
          bids: bidsNum,
          asks: asksNum,
          highs: closesRef.current.h,
          lows: closesRef.current.l,
          closes: closesRef.current.c,
          balanceUsdt: balance,
        });

        setObi(evalRes.obi);
        setMicroPrice(evalRes.microPrice);
        setZScore(evalRes.zScore);
        if (evalRes.regimen) setRegimen(evalRes.regimen);
        if (evalRes.pcaRatio != null) setPcaRatio(evalRes.pcaRatio);
        if (evalRes.prob) setProb({ final: evalRes.prob.probFinal, emp: evalRes.prob.probEmpirica, bs: evalRes.prob.probAnalitica });
        if (evalRes.rawSignal) setLastSignal(`${evalRes.rawSignal} z=${evalRes.zScore.toFixed(2)}`);

        if (!evalRes.rawSignal) return;

        const isRejected = !evalRes.shouldTrade;
        const log: LogEntry = {
          ts: new Date().toLocaleTimeString(),
          side: evalRes.rawSignal,
          z: evalRes.zScore.toFixed(2),
          prob: evalRes.prob ? `${(evalRes.prob.probFinal * 100).toFixed(0)}%` : "-",
          msg: evalRes.reason,
          live: !isRejected && !dryRun,
        };

        if (isRejected) {
          setLogs((prev) => [log, ...prev].slice(0, 100));
          return;
        }

        setLogs((prev) => [log, ...prev].slice(0, 100));
        eng.markSignalExecuted(evalRes.rawSignal);

        if (dryRun) return;

        const apiKey = typeof window !== "undefined" ? localStorage.getItem("binance_api_key") ?? "" : "";
        const apiSecret = typeof window !== "undefined" ? localStorage.getItem("binance_api_secret") ?? "" : "";
        if (!apiKey || !apiSecret) {
          setLogs((prev) => [{ ts: new Date().toLocaleTimeString(), side: "ERR", z: "-", prob: "-", msg: "Faltan API keys en localStorage (binance_api_key/secret)", live: false }, ...prev].slice(0, 100));
          return;
        }

        const { atr } = evalRes;
        const entry = evalRes.rawSignal === "COMPRA" ? parseFloat(bids[0]![0]) : parseFloat(asks[0]![0]);
        const { sl, tp } = calcularSlTp(entry, atr, evalRes.rawSignal);
        const qty = calcularCantidad(riskPct, balance, atr);

        try {
          if (venue === "futures") {
            const posSide = evalRes.rawSignal === "COMPRA" ? "LONG" : "SHORT";
            const side: "BUY" | "SELL" = evalRes.rawSignal === "COMPRA" ? "BUY" : "SELL";
            const sideExit: "BUY" | "SELL" = side === "BUY" ? "SELL" : "BUY";
            const resEntry: any = await placeFuturesOrderFn({ data: { symbol, side, positionSide: posSide as any, type: "LIMIT", quantity: qty, price: entry, apiKey, apiSecret } });
            const entryPrice = resEntry?.avgPrice ? parseFloat(resEntry.avgPrice) : entry;
            const slP = evalRes.rawSignal === "COMPRA" ? entryPrice - atr * 2 : entryPrice + atr * 2;
            const tpP = evalRes.rawSignal === "COMPRA" ? entryPrice + atr * 7 : entryPrice - atr * 7;
            await placeFuturesOrderFn({ data: { symbol, side: sideExit, positionSide: posSide as any, type: "STOP_MARKET", stopPrice: slP, quantity: qty, reduceOnly: true, apiKey, apiSecret } });
            await placeFuturesOrderFn({ data: { symbol, side: sideExit, positionSide: posSide as any, type: "TAKE_PROFIT_MARKET", stopPrice: tpP, quantity: qty, reduceOnly: true, apiKey, apiSecret } });
            setActiveCount((c) => c + 1);
          } else {
            const side: "BUY" | "SELL" = evalRes.rawSignal === "COMPRA" ? "BUY" : "SELL";
            await placeSpotOrderFn({ data: { symbol, side, type: "LIMIT", quantity: qty, price: entry, apiKey, apiSecret } });
          }
        } catch (e: any) {
          setLogs((prev) => [{ ts: new Date().toLocaleTimeString(), side: "ERR", z: "-", prob: "-", msg: String(e?.message ?? e).slice(0, 120), live: false }, ...prev].slice(0, 100));
        }
      } catch {}
    };
    return () => { ws.close(); };
  }, [isRunning, symbol, venue, dryRun, balance, riskPct, placeFuturesOrderFn, placeSpotOrderFn]);

  const handleKill = useCallback(async () => {
    if (!confirm("¿Kill switch? Cancela todas las órdenes y cierra posiciones.")) return;
    const apiKey = localStorage.getItem("binance_api_key") ?? "";
    const apiSecret = localStorage.getItem("binance_api_secret") ?? "";
    if (!apiKey || !apiSecret) return alert("Faltan keys");
    try {
      if (venue === "futures") await killSwitchFn({ data: { symbol, apiKey, apiSecret } });
      alert("Kill ejecutado");
      setActiveCount(0);
    } catch (e: any) { alert(String(e?.message ?? e)); }
  }, [symbol, venue, killSwitchFn]);

  const handleConfigure = useCallback(async () => {
    const apiKey = localStorage.getItem("binance_api_key") ?? "";
    const apiSecret = localStorage.getItem("binance_api_secret") ?? "";
    if (!apiKey || !apiSecret) return alert("Carga API keys en Cuenta → Binance");
    try {
      const res: any = await configureFuturesFn({ data: { symbol, leverage: 10, apiKey, apiSecret } });
      alert(`Config: ${JSON.stringify(res)}`);
    } catch (e: any) { alert(String(e?.message ?? e)); }
  }, [symbol, configureFuturesFn]);

  return (
    <div className="space-y-4">
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">HFT Bot — OBI + PCA + Prob Híbrida <Badge variant={connected ? "default" : "secondary"}>{connected ? "CONECTADO" : "DESCONECTADO"}</Badge> {dryRun ? <Badge variant="outline">DRY-RUN</Badge> : <Badge variant="destructive">LIVE</Badge>}</CardTitle>
          <CardDescription>Port de bot binance.py.py — {venue === "futures" ? "Futuros demo-fapi (GTX post-only, reduceOnly)" : "Spot testnet (GTC)"} · Riesgo {riskPct * 100}% por trade · SL 2×ATR TP 7×ATR (RR 3.5)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div>
              <Label>Símbolo</Label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="BTCUSDT" />
            </div>
            <div>
              <Label>Venue</Label>
              <Select value={venue} onValueChange={(v) => setVenue(v as Venue)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="futures">Futuros demo</SelectItem>
                  <SelectItem value="spot">Spot testnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Balance USDT</Label>
              <Input type="number" value={balance} onChange={(e) => setBalance(parseFloat(e.target.value) || 1000)} />
            </div>
            <div>
              <Label>z ≥</Label>
              <Input type="number" step="0.1" value={zThresh} onChange={(e) => setZThresh(parseFloat(e.target.value) || 1.8)} />
            </div>
            <div>
              <Label>Prob mín %</Label>
              <Input type="number" value={Math.round(probMin * 100)} onChange={(e) => setProbMin((parseFloat(e.target.value) || 55) / 100)} />
            </div>
            <div>
              <Label>Riesgo %</Label>
              <Input type="number" value={riskPct * 100} onChange={(e) => setRiskPct((parseFloat(e.target.value) || 1) / 100)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Button variant={isRunning ? "destructive" : "default"} onClick={() => setIsRunning((v) => !v)}>{isRunning ? "Detener" : "Iniciar"}</Button>
            <div className="flex items-center gap-2 ml-2">
              <Switch checked={dryRun} onCheckedChange={setDryRun} id="dry" />
              <Label htmlFor="dry">{dryRun ? "DRY-RUN (solo señales)" : "LIVE (envía órdenes)"}</Label>
            </div>
            {!dryRun && <span className="text-xs text-amber-500 ml-2">⚠️ LIVE enviará órdenes reales en {venue === "futures" ? "demo-fapi" : "testnet"} con tus keys</span>}
            <Button variant="outline" size="sm" onClick={handleConfigure} disabled={venue !== "futures"}>Configurar Futuros (10x, CROSSED, Hedge)</Button>
            <Button variant="destructive" size="sm" onClick={handleKill}>Kill Switch</Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="p-2 rounded bg-muted/30">OBI <b>{obi.toFixed(3)}</b></div>
            <div className="p-2 rounded bg-muted/30">Micro <b>{microPrice.toFixed(2)}</b></div>
            <div className="p-2 rounded bg-muted/30">z <b className={Math.abs(zScore) >= zThresh ? "text-primary" : ""}>{zScore.toFixed(2)}</b></div>
            <div className="p-2 rounded bg-muted/30">Régimen <Badge variant={regimen === "ESTRUCTURADO" ? "default" : regimen === "RUIDOSO" ? "destructive" : "secondary"}>{regimen} {(pcaRatio * 100).toFixed(0)}%</Badge></div>
            <div className="p-2 rounded bg-muted/30">Prob <b>{prob ? `${(prob.final * 100).toFixed(0)}%` : "-"}</b> <span className="text-xs text-muted-foreground">{prob ? `BS ${(prob.bs * 100).toFixed(0)}% Emp ${(prob.emp * 100).toFixed(0)}%` : ""}</span></div>
          </div>
          <div className="text-xs text-muted-foreground">Última señal: {lastSignal} · Activas: {activeCount} · {connected ? "WS conectado" : "WS desconectado"} · Warmup {engineRef.current?.obiHistory.length ?? 0}/{HFT_DEFAULTS.warmupTicks}</div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-3 text-xs">
          Keys: se leen de <code>localStorage binance_api_key / binance_api_secret</code> (mismo que Pares OBI). Cárgalas en <b>Cuenta</b> → panel Binance. Solo se usan en server (HMAC) y nunca se loguean. Venue demo/testnet únicamente.
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Log de señales (últimas 100) — {dryRun ? "DRY-RUN no envía órdenes" : "LIVE"}</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-auto text-xs font-mono space-y-1">
            {logs.length === 0 ? <div className="text-muted-foreground">Sin señales aún. Esperando ticks... {isRunning ? "(motor activo)" : "(presioná Iniciar)"}</div> : logs.map((l, i) => (
              <div key={i} className={`flex gap-2 p-1 rounded ${l.live ? "bg-green-500/10" : l.side === "ERR" ? "bg-red-500/10" : "bg-muted/20"}`}>
                <span className="text-muted-foreground">{l.ts}</span>
                <Badge variant={l.side === "COMPRA" ? "default" : l.side === "VENTA" ? "destructive" : "secondary"} className="h-4 text-[10px]">{l.side}</Badge>
                <span>z={l.z}</span>
                <span>prob={l.prob}</span>
                <span className="truncate">{l.msg}</span>
                {l.live && <Badge variant="outline" className="ml-auto h-4 text-[10px]">LIVE</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
