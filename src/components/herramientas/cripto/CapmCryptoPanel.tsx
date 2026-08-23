// @ts-nocheck
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { runCapmCrypto } from "@/lib/cripto/capm-crypto.functions";

export function CapmCryptoPanel() {
  const [benchmark, setBenchmark] = useState("BTCUSDT");
  const [interval, setInterval] = useState("4h");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fn = useServerFn(runCapmCrypto);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fn({ data: { benchmark, interval } as any });
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
        <h3 className="text-[15px] font-semibold">CAPM cripto — market-neutral vs benchmark</h3>
        <p className="text-[11px] text-muted-foreground">
          Port de <code>capm_alpha_bot</code>: β = cov(r<sub>i</sub>,r<sub>m</sub>)/var(r<sub>m</sub>), α = mean(r<sub>i</sub>)−β·mean(r<sub>m</sub>) sobre retornos log 4h (lookback 30). Señal LONG si |β|&lt;0.3 ∧ α&gt;0, SHORT si |β|&lt;0.3 ∧ α&lt;0. Hedge-mode sugerido.
        </p>
      </div>

      <Card className="border-border/40 bg-background/30">
        <CardContent className="p-3 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Benchmark</Label>
            <select value={benchmark} onChange={(e) => setBenchmark(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs">
              <option value="BTCUSDT">BTCUSDT</option>
              <option value="ETHUSDT">ETHUSDT</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px]">Intervalo</Label>
            <select value={interval} onChange={(e) => setInterval(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs">
              <option value="4h">4h</option>
              <option value="1h">1h</option>
              <option value="1d">1d</option>
            </select>
          </div>
          <Button onClick={run} disabled={loading} className="h-7 text-xs">
            {loading ? "Calculando…" : "Calcular betas"}
          </Button>
        </CardContent>
      </Card>

      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-48 w-full" />}

      {data && !loading && (
        <>
          <div className="text-[11px] text-muted-foreground">Benchmark {data.benchmark} {data.interval} · lookback {data.lookback} · banda β ±{data.betaBand} → LONG {data.summary.longs} · SHORT {data.summary.shorts} · NEUTRAL {data.summary.neutrals}</div>
          <Card className="border-border/40 bg-background/30">
            <CardContent className="p-2 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground"><tr><th className="text-left px-2 py-1">Símbolo</th><th className="text-right px-2 py-1">β</th><th className="text-right px-2 py-1">|β|</th><th className="text-right px-2 py-1">α (bps)</th><th className="text-center px-2 py-1">Señal</th><th className="text-right px-2 py-1">Precio</th></tr></thead>
                <tbody>
                  {data.rows.map((r: any) => (
                    <tr key={r.symbol} className="border-t border-border/20">
                      <td className="px-2 py-1 font-mono font-medium">{r.symbol}</td>
                      {r.error ? <td colSpan={5} className="text-center text-red-400 py-1">{r.error}</td> : <>
                        <td className="text-right px-2 py-1 font-mono">{r.beta?.toFixed(3)}</td>
                        <td className="text-right px-2 py-1 font-mono">{r.betaAbs?.toFixed(3)}</td>
                        <td className="text-right px-2 py-1 font-mono">{(r.alpha * 100).toFixed(1)}</td>
                        <td className="text-center px-2 py-1"><span className={`text-[10px] px-1.5 py-0.5 rounded border ${r.signal === "LONG" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" : r.signal === "SHORT" ? "bg-red-500/15 text-red-400 border-red-500/20" : "bg-muted/30 text-muted-foreground border-border/40"}`}>{r.signal}</span></td>
                        <td className="text-right px-2 py-1 font-mono">{r.lastClose?.toFixed(2)}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
