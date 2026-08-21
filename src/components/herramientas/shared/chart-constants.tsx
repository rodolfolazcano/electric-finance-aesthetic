import type { CSSProperties } from "react";
import { fmtNum } from "./formatters";

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 11,
  fontFamily: "monospace",
};
export const CHART_TOOLTIP_STYLE_LG: CSSProperties = {
  ...CHART_TOOLTIP_STYLE,
  fontSize: 12,
};
export const AXIS_TICK = {
  fill: "var(--color-muted-foreground)",
  fontSize: 11,
  fontFamily: "monospace",
};
export const AXIS_TICK_SM = { ...AXIS_TICK, fontSize: 10 };
export const AXIS_TICK_LG = { ...AXIS_TICK, fontSize: 13 };
export const GRID_STROKE = "var(--color-border)";
export const PIE_COLORS = [
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-primary)",
  "var(--color-chart-4, #34d399)",
  "var(--color-chart-5, #059669)",
  "var(--color-chart-6, #a16207)",
  "var(--color-chart-7, #22d3ee)",
  "var(--color-chart-8, #fde68a)",
  "var(--color-chart-9, #0d9488)",
  "var(--color-chart-10, #eab308)",
  "var(--color-chart-11, #14b8a6)",
  "var(--color-chart-12, #facc15)",
  "var(--color-chart-13, #06b6d4)",
  "var(--color-chart-14, #fcd34d)",
  "var(--color-chart-15, #0f766e)",
];

export function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mono mt-1 text-sm">{value}</div>
      {sub && <div className="mono text-[13px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function ScorePill({ label, value }: { label: string; value: number }) {
  const tone = value >= 2 ? "text-success" : value <= -2 ? "text-danger" : "text-warning";
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`mono text-base ${tone}`}>{value > 0 ? `+${value}` : value}</span>
    </div>
  );
}

export function ChartTip({ active, payload, label, prefix = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-2 mono px-3 py-2 text-[14px]">
      {label != null && <div className="text-muted-foreground">{label}</div>}
      <div className="text-foreground">
        {prefix}
        {fmtNum(payload[0].value)}
      </div>
    </div>
  );
}
