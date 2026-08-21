// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSectorRelStrength, type SectorRelStrengthResult, type RegimeType } from "@/lib/sectores/sector-rel-strength.functions";
import { cn } from "@/lib/utils";

function TrendIcon({ trend }: { trend: "rising" | "falling" | "flat" | null }) {
  if (trend === "rising") return <span className="text-[#26a69a] text-xs">&#9650;</span>;
  if (trend === "falling") return <span className="text-[#ef5350] text-xs">&#9660;</span>;
  if (trend === "flat") return <span className="text-[#FFB300] text-xs">&#9644;</span>;
  return <span className="text-muted-foreground text-xs">&mdash;</span>;
}

function TrendLabel({ trend }: { trend: "rising" | "falling" | "flat" | null }) {
  if (trend === "rising") return <span className="text-[#26a69a] text-[10px] font-mono">Outperform</span>;
  if (trend === "falling") return <span className="text-[#ef5350] text-[10px] font-mono">Underperform</span>;
  if (trend === "flat") return <span className="text-[#FFB300] text-[10px] font-mono">Neutral</span>;
  return <span className="text-muted-foreground text-[10px]">&mdash;</span>;
}

function fmtSlope(s: number | null): string {
  if (s == null) return "—";
  return (s * 1000).toFixed(3);
}

const REGIME_COLORS: Record<Exclude<RegimeType, null>, string> = {
  growth: "border-l-[#3498db] bg-[#3498db]/5",
  defensive: "border-l-[#1abc9c] bg-[#1abc9c]/5",
  cyclical: "border-l-[#2ecc71] bg-[#2ecc71]/5",
  inflation: "border-l-[#f5a623] bg-[#f5a623]/5",
  mixed: "border-l-[#FFB300] bg-[#FFB300]/5",
};

export function SectorRelStrengthPanel() {
  const fn = useServerFn(getSectorRelStrength);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sector-rel-strength"],
    queryFn: () => fn(),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-[11px] text-muted-foreground">Calculando fuerza relativa...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 rounded-md bg-danger/10 border border-danger/30 text-center">
        <p className="text-danger text-sm">{error instanceof Error ? error.message : "Error al obtener datos de fuerza relativa"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Regime banner */}
      <div className={cn("rounded-lg border-l-4 border border-border/40 p-4", data.regime ? REGIME_COLORS[data.regime] : "border-l-muted")}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-1">Régimen detectado</p>
            <p className="text-sm font-semibold text-foreground">{data.regimeLabel}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{data.regimeDesc}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">SPY 1Y</p>
            <p className={cn("text-sm font-mono", (data.spyReturn1y ?? 0) >= 0 ? "text-[#26a69a]" : "text-[#ef5350]")}>
              {data.spyReturn1y != null ? `${(data.spyReturn1y * 100).toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-[10px] font-mono text-muted-foreground">
          <span>&#9650; Lideran: {data.topSectors.join(", ")}</span>
          <span>&#9660; Retrasan: {data.bottomSectors.join(", ")}</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-border/40 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              <th className="text-left py-2 pr-3">Sector</th>
              <th className="text-right px-2 py-2">Ratio</th>
              <th className="text-right px-2 py-2">20d</th>
              <th className="text-right px-2 py-2">60d</th>
              <th className="text-right px-2 py-2">120d</th>
              <th className="text-center px-2 py-2">20d</th>
              <th className="text-center px-2 py-2">60d</th>
            </tr>
          </thead>
          <tbody>
            {data.sectors.map((s) => {
              const sorted = [...data.sectors].sort((a, b) => (b.slope60d ?? -999) - (a.slope60d ?? -999));
              const rank = sorted.findIndex((x) => x.etf === s.etf) + 1;
              return (
                <tr key={s.etf} className="border-b border-border/20 hover:bg-background/40 transition-colors">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-4">#{rank}</span>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: s.regimColor }} />
                      <span className="text-foreground">{s.label}</span>
                      <span className="text-[9px] text-muted-foreground">({s.etf})</span>
                    </div>
                  </td>
                  <td className="text-right px-2 py-2 text-foreground">{s.ratio != null && Number.isFinite(s.ratio) ? s.ratio.toFixed(4) : "—"}</td>
                  <td className={cn("text-right px-2 py-2", (s.slope20d ?? 0) > 0 ? "text-[#26a69a]" : (s.slope20d ?? 0) < 0 ? "text-[#ef5350]" : "text-muted-foreground")}>
                    {s.slope20d != null && Number.isFinite(s.slope20d) ? fmtSlope(s.slope20d) : "—"}
                  </td>
                  <td className={cn("text-right px-2 py-2", (s.slope60d ?? 0) > 0 ? "text-[#26a69a]" : (s.slope60d ?? 0) < 0 ? "text-[#ef5350]" : "text-muted-foreground")}>
                    {s.slope60d != null && Number.isFinite(s.slope60d) ? fmtSlope(s.slope60d) : "—"}
                  </td>
                  <td className={cn("text-right px-2 py-2", (s.slope120d ?? 0) > 0 ? "text-[#26a69a]" : (s.slope120d ?? 0) < 0 ? "text-[#ef5350]" : "text-muted-foreground")}>
                    {s.slope120d != null && Number.isFinite(s.slope120d) ? fmtSlope(s.slope120d) : "—"}
                  </td>
                  <td className="text-center px-2 py-2">
                    <TrendIcon trend={s.trend20d} />
                  </td>
                  <td className="text-center px-2 py-2">
                    <TrendLabel trend={s.trend60d} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-[#26a69a]">&#9650; Rising</span>
          <span>Ratio en ascenso = sector outperform SPY</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[#ef5350]">&#9660; Falling</span>
          <span>Ratio en descenso = sector underperform</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[#FFB300]">&#9644; Flat</span>
          <span>Neutral = a la par del benchmark</span>
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground text-right">
        Fuente: Yahoo Finance &middot; Ratio sector/SPY &middot; Pendiente por regresión lineal
      </p>
    </div>
  );
}
