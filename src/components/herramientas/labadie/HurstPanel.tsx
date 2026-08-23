import { computeHurst, impliedPFromReturns } from "@/lib/math/stats";

export function HurstPanel({ serie, returns }: { serie: number[]; returns?: number[] }) {
  const H = serie.length >= 30 ? computeHurst(serie) : 0.5;
  const p = H > 0 ? 1 / H : 2;
  const p2 = returns && returns.length >= 100 ? impliedPFromReturns(returns) : null;
  const regime = H < 0.45 ? "mean-reverting" : H > 0.55 ? "trending" : "random";
  const warn = serie.length < 100;

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Labadié — Hurst & p = 1/H</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${regime === "mean-reverting" ? "border-emerald-500/40 text-emerald-400" : regime === "trending" ? "border-amber-500/40 text-amber-400" : "border-border text-muted-foreground"}`}>{regime}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono text-sm">
        <div><div className="text-[11px] text-muted-foreground">Hurst H</div><div className="text-lg font-semibold">{H.toFixed(3)}</div></div>
        <div><div className="text-[11px] text-muted-foreground">p = 1/H</div><div className="text-lg font-semibold">{p.toFixed(2)}</div></div>
        <div><div className="text-[11px] text-muted-foreground">p (multi-escala)</div><div className="text-lg font-semibold">{p2 != null ? p2.toFixed(2) : "—"}</div></div>
      </div>
      {warn && <p className="text-xs text-amber-500">Serie &lt;100 obs: estimador R/S sesgado. Usar solo como referencia.</p>}
      <p className="text-xs text-muted-foreground">1205.3482v6 §3.2 — H&lt;0.5 mean-reverting favorece pairs, H&gt;0.5 trending penaliza contra-tendencia. Clamp H∈[0.05,0.95] evita p explosivo.</p>
    </div>
  );
}
