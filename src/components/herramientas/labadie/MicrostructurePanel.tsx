import { kyleLambda, kyleBeta, glostenMilgrom, spreadRelativo } from "@/lib/labadie/microstructure";

export function MicrostructurePanel({ sigma0 = 1, sigmaU = 2, Vminus = 40, Vplus = 80 }: { sigma0?: number; sigmaU?: number; Vminus?: number; Vplus?: number }) {
  const lambda = kyleLambda(sigma0, sigmaU);
  const beta = kyleBeta(sigma0, sigmaU);
  const gm = glostenMilgrom({ Vminus, Vplus });
  const rel = spreadRelativo(gm.ask, gm.bid);

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
      <h4 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Microestructura — Kyle & Glosten-Milgrom</h4>
      <div className="grid grid-cols-2 gap-3 font-mono text-sm">
        <div className="rounded border border-border/30 p-2">
          <div className="text-[11px] text-muted-foreground">Kyle λ = ½√(Σ0/σ²u)</div>
          <div className="font-semibold">{lambda.toFixed(4)}</div>
          <div className="text-xs text-muted-foreground">β = √(σ²u/Σ0) = {beta.toFixed(3)}</div>
          <div className="text-xs text-muted-foreground mt-1">Revela ½ info en precio (paper). σ0={sigma0} σu={sigmaU}</div>
        </div>
        <div className="rounded border border-border/30 p-2">
          <div className="text-[11px] text-muted-foreground">Glosten-Milgrom Bayes</div>
          <div className="font-semibold">ask {gm.ask.toFixed(2)} / bid {gm.bid.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">spread {gm.spread.toFixed(2)} rel {(rel*100).toFixed(2)}% · P[V+|Buy]=0.75</div>
          <div className="text-xs text-muted-foreground mt-1">V-={Vminus} V+={Vplus}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Bottom-up empírico vs EMT. Spread como proxy liquidez (Zoology). Usar para justificar light semáforo y justificar no tradear si spread &gt; 1%.</p>
    </div>
  );
}
