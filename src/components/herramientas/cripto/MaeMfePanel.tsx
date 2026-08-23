// @ts-nocheck
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { runMaeMfe } from "@/lib/cripto/mae-mfe.functions";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function fmt(n: number | null | undefined, d = 2) {
  if (n == null || !isFinite(n as number)) return "—";
  return (n as number).toFixed(d);
}

export function MaeMfePanel() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [days, setDays] = useState(90);
  const [entry, setEntry] = useState(28);
  const [atrMult, setAtrMult] = useState(3.0);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fn = useServerFn(runMaeMfe);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fn({ data: { symbol, days, entryLevel: entry, atrMult } as any });
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

  const oos = data?.oos?.metrics;
  const reasons = data?.oos?.reasons;

  const histMae = (() => {
    if (!data?.maes?.length) return [];
    const bins = 10;
    const vals: number[] = data.maes;
    const min = Math.min(...vals), max = Math.max(...vals);
    const step = (max - min) / bins || 0.1;
    return Array.from({ length: bins }, (_, i) => {
      const lo = min + i * step;
      const hi = lo + step;
      const count = vals.filter((v) => v >= lo && v < hi + 1e-9).length;
      return { bin: `${lo.toFixed(2)}%`, count };
    });
  })();

  const histMfe = (() => {
    if (!data?.mfes?.length) return [];
    const bins = 10;
    const vals: number[] = data.mfes;
    const min = Math.min(...vals), max = Math.max(...vals);
    const step = (max - min) / bins || 0.1;
    return Array.from({ length: bins }, (_, i) => {
      const lo = min + i * step;
      const hi = lo + step;
      const count = vals.filter((v) => v >= lo && v < hi + 1e-9).length;
      return { bin: `${lo.toFixed(2)}%`, count };
    });
  })();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold">MAE/MFE adaptativo — stops históricos 5m</h3>
        <p className="text-[11px] text-muted-foreground">
          Port de <code>mae_mfe_5m.py</code>: calibra SL=P85(MAE) clamp 0.7–1.5% y TP=P60(MFE) clamp 0.35–0.9% en TRAIN (trailing-only) → valida OOS con trailing ATR×{atrMult}. Long-only, entrada cruce RSI {entry} + SMA50&gt;close.
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
              <option value={60}>60d</option>
              <option value={90}>90d</option>
              <option value={135}>135d</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">RSI entry</Label>
            <Input type="number" value={entry} onChange={(e) => setEntry(parseFloat(e.target.value))} className="h-7 text-xs w-20" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">ATR mult</Label>
            <Input type="number" step="0.5" value={atrMult} onChange={(e) => setAtrMult(parseFloat(e.target.value))} className="h-7 text-xs w-20" />
          </div>
          <Button onClick={run} disabled={loading} className="h-7 text-xs">
            {loading ? "Simulando…" : "Simular MAE/MFE"}
          </Button>
        </CardContent>
      </Card>

      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-48 w-full" />}

      {data && !loading && (
        <>
          <div className={`rounded border p-3 text-xs ${data.veredicto === "RENTABLE" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
            VEREDICTO: <b>{data.veredicto}</b> — {data.oos ? `${data.oos.metrics.trades} trades OOS · WR ${fmt(data.oos.metrics.winRate, 1)}% · PF ${fmt(data.oos.metrics.profitFactor, 2)} · Exp ${fmt(data.oos.metrics.expectancyPct, 3)}%` : "Sin trades OOS"} · {data.klinesCount} velas 5m
          </div>

          {oos && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Card className="border-border/40 bg-background/30"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">WR OOS</p><p className="text-sm font-mono">{fmt(oos.winRate, 1)}%</p></CardContent></Card>
              <Card className="border-border/40 bg-background/30"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Expectancy</p><p className="text-sm font-mono">{fmt(oos.expectancyPct, 3)}%</p></CardContent></Card>
              <Card className="border-border/40 bg-background/30"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Retorno</p><p className="text-sm font-mono">{fmt(oos.returnPct, 2)}%</p></CardContent></Card>
              <Card className="border-border/40 bg-background/30"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">MaxDD</p><p className="text-sm font-mono">{fmt(oos.maxDrawdownPct, 2)}%</p></CardContent></Card>
            </div>
          )}

          {data.folds?.length > 0 && (
            <Card className="border-border/40 bg-background/30">
              <CardHeader className="py-2"><CardTitle className="text-xs">Folds (TRAIN→OOS) — cada fold calibra y valida 15d</CardTitle></CardHeader>
              <CardContent className="p-2 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="text-muted-foreground"><tr><th className="text-left px-2 py-1">Fold</th><th className="text-right px-2 py-1">TP%</th><th className="text-right px-2 py-1">SL%</th><th className="text-right px-2 py-1">Trades</th><th className="text-right px-2 py-1">WR%</th><th className="text-right px-2 py-1">PF</th><th className="text-right px-2 py-1">Exp%</th></tr></thead>
                  <tbody>{data.folds.map((f: any) => (<tr key={f.fold} className="border-t border-border/20"><td className="px-2 py-1">{f.fold}</td><td className="text-right px-2 py-1 font-mono">{fmt(f.tp,2)}</td><td className="text-right px-2 py-1 font-mono">{fmt(f.sl,2)}</td><td className="text-right px-2 py-1">{f.trades}</td><td className="text-right px-2 py-1">{fmt(f.wr,1)}</td><td className="text-right px-2 py-1">{fmt(f.pf,2)}</td><td className="text-right px-2 py-1">{fmt(f.exp,3)}</td></tr>))}</tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {reasons && (
            <Card className="border-border/40 bg-background/30">
              <CardHeader className="py-2"><CardTitle className="text-xs">Razones de salida OOS</CardTitle></CardHeader>
              <CardContent className="p-2">
                <div className="flex gap-2 text-[11px]">{Object.entries(reasons).map(([k, v]: any) => (<span key={k} className="px-2 py-1 rounded bg-muted/30">{k}: {v as number}</span>))}</div>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <Card className="border-border/40 bg-background/30">
              <CardHeader className="py-2"><CardTitle className="text-xs">Distribución MAE (excursión adversa)</CardTitle></CardHeader>
              <CardContent className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={histMae}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="bin" tick={{ fontSize: 9 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="count" fill="hsl(var(--primary))" /></BarChart></ResponsiveContainer></CardContent>
            </Card>
            <Card className="border-border/40 bg-background/30">
              <CardHeader className="py-2"><CardTitle className="text-xs">Distribución MFE (excursión favorable)</CardTitle></CardHeader>
              <CardContent className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={histMfe}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="bin" tick={{ fontSize: 9 }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="count" fill="hsl(var(--primary))" opacity={0.7} /></BarChart></ResponsiveContainer></CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
