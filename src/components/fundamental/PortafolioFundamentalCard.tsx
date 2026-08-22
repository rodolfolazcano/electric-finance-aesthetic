import type { PortafolioFundamentalItem } from "./PortafolioFundamentalGrid";

function scoreColor(score: number): string {
  if (score >= 65) return "bg-emerald-500";
  if (score >= 45) return "bg-amber-500";
  return "bg-red-500";
}

function scoreTextColor(score: number): string {
  if (score >= 65) return "text-emerald-400";
  if (score >= 45) return "text-amber-400";
  return "text-red-400";
}

function badgeRec(rec: string | null | undefined): { label: string; cls: string } | null {
  if (!rec) return null;
  const r = rec.toLowerCase();
  if (r.includes("buy") || r.includes("compra")) return { label: "BUY", cls: "bg-emerald-900/40 text-emerald-300" };
  if (r === "hold" || r === "mantener") return { label: "HOLD", cls: "bg-amber-900/40 text-amber-300" };
  if (r.includes("sell") || r.includes("venta")) return { label: "SELL", cls: "bg-red-900/40 text-red-300" };
  return null;
}

interface Props {
  item: PortafolioFundamentalItem;
  onClick: () => void;
}

export function PortafolioFundamentalCard({ item, onClick }: Props) {
  const rec = badgeRec(item.recomendacionConsenso ?? item.semaforoRec);
  const pesoPct = item.peso * 100;

  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-md border border-border/40 bg-background/40/60 p-3 transition-colors hover:border-primary/40 hover:bg-background/40/80 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-foreground truncate">{item.ticker}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">{item.sector ?? "—"}</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {pesoPct.toFixed(1)}%
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-border/30">
          <div
            className={`h-1 rounded-full ${scoreColor(item.fundScore)} transition-all`}
            style={{ width: `${item.fundScore}%` }}
          />
        </div>
        <span className={`text-[10px] font-bold font-mono ${scoreTextColor(item.fundScore)}`}>
          {item.fundScore}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {rec && (
          <span className={`rounded border px-1 py-0.5 text-[9px] font-mono ${rec.cls}`}>
            {rec.label}
          </span>
        )}
        {item.percentilRango !== null && item.percentilRango > 90 && (
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 text-[9px] font-mono text-amber-400">
            Cerca de máx. histórico
          </span>
        )}
        {item.fundScore < 40 && (
          <span className="rounded border border-red-500/30 bg-red-500/10 px-1 py-0.5 text-[9px] font-mono text-red-400">
            Fundamentos débiles
          </span>
        )}
      </div>
    </button>
  );
}
