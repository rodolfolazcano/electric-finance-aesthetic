// @ts-nocheck
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { runScanner } from "@/lib/cripto/scanner.functions";

function fmt(n: any, d = 2) {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toFixed(d);
}

export function ScannerPanel() {
  const [topN, setTopN] = useState(10);
  const [interval, setInterval] = useState("5m");
  const [days, setDays] = useState(30);
  const [wrGate, setWrGate] = useState(70);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fn = useServerFn(runScanner);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fn({ data: { topN, interval, days, wrGate } as any });
      setData(r);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
  }, []);

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold">Scanner multi-estrategia — ranking por quoteVolume</h3>
        <p className="text-[11px] text-muted-foreground">
          Port de <code>scan_all_strategies.py</code> / <code>scan_liquidity.py</code>: top perps por volumen → BB+RSI 5m (SMA no usado) con WR≥{wrGate}% gate. Ordenado por win-rate. Métricas: WR, PF, RR (payoff), expectancy, MaxDD, Sharpe.
        </p>
      </div>

      <Card className="border-border/40 bg-background/30">
        <CardContent className="p-3 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Top perps</Label>
            <select value={topN} onChange={(e) => setTopN(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs">
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Intervalo</Label>
            <select value={interval} onChange={(e) => setInterval(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs">
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Días</Label>
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs">
              <option value={14}>14d</option>
              <option value={30}>30d</option>
              <option value={60}>60d</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Gate WR%</Label>
            <select value={wrGate} onChange={(e) => setWrGate(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs">
              <option value={60}>60%</option>
              <option value={70}>70%</option>
              <option value={80}>80%</option>
            </select>
          </div>
          <Button onClick={run} disabled={loading} className="h-7 text-xs">
            {loading ? "Escaneando…" : "Escanear"}
          </Button>
        </CardContent>
      </Card>

      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-48 w-full" />}

      {data && !loading && (
        <>
          <div className="text-[11px] text-muted-foreground">
            {interval} · {days}d · {data.symbols.length} símbolos · {rows.length} con trades · gate {wrGate}% → {rows.filter((r: any) => r.pass === "PASS").length} PASS
          </div>
          <Card className="border-border/40 bg-background/30">
            <CardContent className="p-2 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-1">#</th>
                    <th className="text-left px-2 py-1">Símbolo</th>
                    <th className="text-right px-2 py-1">Trades</th>
                    <th className="text-right px-2 py-1">WR%</th>
                    <th className="text-right px-2 py-1">PF</th>
                    <th className="text-right px-2 py-1">RR</th>
                    <th className="text-right px-2 py-1">Exp%</th>
                    <th className="text-right px-2 py-1">Ret%</th>
                    <th className="text-right px-2 py-1">MaxDD%</th>
                    <th className="text-center px-2 py-1">Veredicto</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any, i: number) => (
                    <tr key={r.symbol} className="border-t border-border/20">
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1 font-mono font-medium">{r.symbol}</td>
                      <td className="text-right px-2 py-1">{r.trades}</td>
                      <td className="text-right px-2 py-1 font-mono">{fmt(r.wr, 1)}</td>
                      <td className="text-right px-2 py-1 font-mono">{fmt(r.pf, 2)}</td>
                      <td className="text-right px-2 py-1 font-mono">{fmt(r.rr, 2)}</td>
                      <td className="text-right px-2 py-1 font-mono">{fmt(r.exp, 3)}</td>
                      <td className="text-right px-2 py-1 font-mono">{fmt(r.ret, 2)}</td>
                      <td className="text-right px-2 py-1 font-mono">{fmt(r.maxDd, 2)}</td>
                      <td className="text-center px-2 py-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${r.pass === "PASS" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : "bg-muted/30 text-muted-foreground border-border/40"}`}>{r.pass}</span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-6 text-muted-foreground">
                        Sin resultados con gate actual.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
