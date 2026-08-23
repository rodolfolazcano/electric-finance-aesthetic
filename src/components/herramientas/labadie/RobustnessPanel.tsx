export interface RobustnessPanelProps {
  isSharpe: number;
  oosSharpe: number;
  robustnessPct: number;
  isRobust: boolean;
}

export function RobustnessPanel({ isSharpe, oosSharpe, robustnessPct, isRobust }: RobustnessPanelProps) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
      <h4 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Labadié — Robustez IS/OOS (5 Stages §148-217)</h4>
      <div className="grid grid-cols-3 gap-2 font-mono text-sm">
        <div><div className="text-[11px] text-muted-foreground">Sharpe IS</div><div className="font-semibold">{isSharpe.toFixed(2)}</div></div>
        <div><div className="text-[11px] text-muted-foreground">Sharpe OOS</div><div className="font-semibold">{oosSharpe.toFixed(2)}</div></div>
        <div><div className="text-[11px] text-muted-foreground">Robustez</div><div className={`font-semibold ${isRobust ? "text-emerald-400" : "text-red-400"}`}>{robustnessPct}%</div></div>
      </div>
      <div className={`text-xs px-2 py-1 rounded border ${isRobust ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
        {isRobust ? "✓ Robusto (>50%): parámetro estable (Principio 2 Labadié)" : "✗ No robusto (≤50%): wiggle test falla — descartar y reiniciar Stage 1"}
      </div>
      <p className="text-xs text-muted-foreground">Principio 2: patrón robusto es estable bajo pequeño cambio de parámetros. Ratio OOS/IS.</p>
    </div>
  );
}
