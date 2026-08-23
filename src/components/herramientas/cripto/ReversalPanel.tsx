// @ts-nocheck
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { runReversal } from "@/lib/cripto/reversal.functions";

function fmt(n: any, d = 2) {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toFixed(d);
}

export function ReversalPanel() {
  const [symbol, setSymbol] = useState("SOLUSDT");
  const [days, setDays] = useState(30);
  const [tp, setTp] = useState(1.0);
  const [sl, setSl] = useState(1.0);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fn = useServerFn(runReversal);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fn({ data: { symbol, days, tpPct: tp, slPct: sl } as any });
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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold">Trend Reversal — VWAP + RSI + OBI</h3>
        <p className="text-[11px] text-muted-foreground">
          Port de <code>trend_reversal_backtest</code>: LONG = close&gt;VWAP (intradía) ∧ RSI&gt;70 ∧ OBI-SMA5&gt;0 ; SHORT = close&lt;VWAP ∧ RSI&lt;30 ∧ OBI-SMA5&lt;0. Veto volumen&gt;2.5×SMA20. Salida TP/SL + timeout barras. Compara 4 configs.
        </p>
      </div>

      <Card className="border-border/40 bg-background/30">
        <CardContent className="p-3 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Símbolo</Label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="h-7 text-xs w-28" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Días (1m)</Label>
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs">
              <option value={14}>14d</option>
              <option value={30}>30d</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">TP%</Label>
            <Input type="number" step="0.2" value={tp} onChange={(e) => setTp(parseFloat(e.target.value))} className="h-7 text-xs w-20" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">SL%</Label>
            <Input type="number" step="0.2" value={sl} onChange={(e) => setSl(parseFloat(e.target.value))} className="h-7 text-xs w-20" />
          </div>
          <Button onClick={run} disabled={loading} className="h-7 text-xs">
            {loading ? "Backtesteando…" : "Backtest"}
          </Button>
        </CardContent>
      </Card>

      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-48 w-full" />}

      {data && !loading && (
        <>
          <div className="text-[11px] text-muted-foreground">{data.symbol} {data.interval} · {data.days}d · {data.closesCount} velas 1m → {data.configs[0]?.trades ?? 0} trades (config base)</div>
          <Card className="border-border/40 bg-background/30">
            <CardHeader className="py-2"><CardTitle className="text-xs">Comparativa 4 configs TP/SL — mejor por profit factor</CardTitle></CardHeader>
            <CardContent className="p-2 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground"><tr><th className="text-left px-2 py-1">TP%</th><th className="text-left px-2 py-1">SL%</th><th className="text-right px-2 py-1">Trades</th><th className="text-right px-2 py-1">WR%</th><th className="text-right px-2 py-1">PF</th><th className="text-right px-2 py-1">Ret%</th><th className="text-right px-2 py-1">Exp%</th><th className="text-right px-2 py-1">MaxDD%</th></tr></thead>
                <tbody>
                  {data.configs.map((c: any, i: number) => (
                    <tr key={i} className={`border-t border-border/20 ${c === data.best ? "bg-primary/5" : ""}`}>
                      <td className="px-2 py-1 font-mono">{fmt(c.tp, 2)}</td>
                      <td className="px-2 py-1 font-mono">{fmt(c.sl, 2)}</td>
                      <td className="text-right px-2 py-1">{c.trades}</td>
                      <td className="text-right px-2 py-1">{fmt(c.wr, 1)}</td>
                      <td className="text-right px-2 py-1">{fmt(c.pf, 2)}</td>
                      <td className="text-right px-2 py-1">{fmt(c.ret, 2)}</td>
                      <td className="text-right px-2 py-1">{fmt(c.exp, 3)}</td>
                      <td className="text-right px-2 py-1">{fmt(c.maxDd, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.best && <p className="text-[11px] text-muted-foreground mt-2">Mejor config: TP {fmt(data.best.tp,2)}% SL {fmt(data.best.sl,2)}% → PF {fmt(data.best.pf,2)} WR {fmt(data.best.wr,1)}%</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
