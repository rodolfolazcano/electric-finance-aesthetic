// @ts-nocheck
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { runMtf } from "@/lib/cripto/mtf.functions";

function fmt(n: any, d = 2) {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toFixed(d);
}

export function MtfPanel() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [days, setDays] = useState(90);
  const [htf, setHtf] = useState("1h");
  const [ltf, setLtf] = useState("5m");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fn = useServerFn(runMtf);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fn({ data: { symbol, days, htf, ltf } as any });
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
        <h3 className="text-[15px] font-semibold">MTF RSI+ATR — zonas fraccionadas</h3>
        <p className="text-[11px] text-muted-foreground">
          Port de <code>mtf_rsi_atr.py</code>: HTF RSI&lt;35 + close&gt;SMA50 como filtro sano → LTF RSI cruce 28 en zonas 0–0.7/0.7–1.4/1.4–2.1 ATR HTF (50%/30%/20% capital). TP 0.7% SL 1.2% Trail 3×ATR HTF. IS 50% vs OOS 50%.
        </p>
      </div>

      <Card className="border-border/40 bg-background/30">
        <CardContent className="p-3 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Símbolo</Label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="h-7 text-xs w-28" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Días</Label>
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs">
              <option value={30}>30d</option>
              <option value={60}>60d</option>
              <option value={90}>90d</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">HTF</Label>
            <select value={htf} onChange={(e) => setHtf(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs">
              <option value="1h">1h</option>
              <option value="15m">15m</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">LTF</Label>
            <select value={ltf} onChange={(e) => setLtf(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs">
              <option value="5m">5m</option>
              <option value="1m">1m</option>
              <option value="15m">15m</option>
            </select>
          </div>
          <Button onClick={run} disabled={loading} className="h-7 text-xs">
            {loading ? "Analizando…" : "Analizar MTF"}
          </Button>
        </CardContent>
      </Card>

      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-48 w-full" />}

      {data && !loading && (
        <>
          <Card className="border-border/40 bg-background/30">
            <CardHeader className="py-2"><CardTitle className="text-xs">Análisis estadístico — qué TF respeta RSI&lt;30</CardTitle></CardHeader>
            <CardContent className="p-2 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground"><tr><th className="text-left px-2 py-1">TF</th><th className="text-right px-2 py-1">Eventos</th><th className="text-right px-2 py-1">WR%</th><th className="text-right px-2 py-1">PF</th><th className="text-right px-2 py-1">Exp%</th><th className="text-right px-2 py-1">Ret medio%</th></tr></thead>
                <tbody>{data.stats.map((s: any) => (<tr key={s.tf} className="border-t border-border/20"><td className="px-2 py-1 font-mono">{s.tf}</td><td className="text-right px-2 py-1">{s.events}</td><td className="text-right px-2 py-1">{fmt(s.wr,1)}</td><td className="text-right px-2 py-1">{fmt(s.pf,2)}</td><td className="text-right px-2 py-1">{fmt(s.exp,3)}</td><td className="text-right px-2 py-1">{fmt(s.avgRet,3)}</td></tr>))}</tbody>
              </table>
            </CardContent>
          </Card>

          <div className={`rounded border p-3 text-xs ${data.veredicto === "RENTABLE" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
            VEREDICTO OOS: <b>{data.veredicto}</b> — TRAIN {data.train?.trades ?? 0} trades / TEST {data.test?.trades ?? 0} trades · TEST WR {fmt(data.test?.metrics?.winRate,1)}% PF {fmt(data.test?.metrics?.profitFactor,2)} Exp {fmt(data.test?.metrics?.expectancyPct,3)}%
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {["train", "test"].map((k) => {
              const m = data[k];
              if (!m) return <Card key={k} className="border-border/40 bg-background/30"><CardContent className="p-4 text-xs text-muted-foreground">Sin trades {k.toUpperCase()}</CardContent></Card>;
              return (
                <Card key={k} className="border-border/40 bg-background/30">
                  <CardHeader className="py-2"><CardTitle className="text-xs">{k === "train" ? "TRAIN (IS) 50%" : "TEST (OOS) 50%"} — {m.trades} trades</CardTitle></CardHeader>
                  <CardContent className="p-3 space-y-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-2 font-mono"><span>WR {fmt(m.metrics.winRate,1)}%</span><span>PF {fmt(m.metrics.profitFactor,2)}</span><span>Exp {fmt(m.metrics.expectancyPct,3)}%</span><span>Ret {fmt(m.metrics.returnPct,2)}%</span></div>
                    <div className="flex flex-wrap gap-1">{Object.entries(m.reasons).map(([rk, rv]: any) => (<span key={rk} className="px-1.5 py-0.5 rounded bg-muted/30 text-[10px]">{rk}: {rv as number}</span>))}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
