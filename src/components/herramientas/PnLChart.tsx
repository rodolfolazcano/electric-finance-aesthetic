import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  data: Array<{ date: string; pnl: number }>;
}

function fmtDate(d: string) {
  if (!d || d.length < 10) return d;
  return d.slice(8, 10) + "/" + d.slice(5, 7);
}

export function PnLChart({ data }: Props) {
  const sorted = useMemo(
    () => [...data].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );

  if (sorted.length === 0) return null;
  const finalPnl = sorted[sorted.length - 1]?.pnl ?? 0;

  return (
    <div className="space-y-2">
      <h3 className="font-mono text-xs font-medium text-foreground">
        P&L Acumulado
        <span className={`ml-2 ${finalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {finalPnl >= 0 ? "+" : ""}
          {finalPnl.toFixed(2)}%
        </span>
      </h3>
      <div
        className="rounded-lg border border-border/40 bg-background/40 p-3"
        style={{ overflow: "hidden" }}
      >
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={sorted} margin={{ top: 6, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 8, fontFamily: "monospace", fill: "#9aa6bd" }}
              stroke="#2b3242"
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={fmtDate}
            />
            <YAxis
              tick={{ fontSize: 9, fontFamily: "monospace", fill: "#9aa6bd" }}
              stroke="#2b3242"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              width={55}
            />
            <Tooltip
              contentStyle={{
                background: "#141a28",
                border: "1px solid #2b3242",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "monospace",
              }}
              formatter={(val: number) => [`${val >= 0 ? "+" : ""}${val.toFixed(2)}%`, "P&L"]}
              labelFormatter={fmtDate}
            />
            <defs>
              <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={finalPnl >= 0 ? "#10b981" : "#ef4444"}
                  stopOpacity={0.15}
                />
                <stop
                  offset="95%"
                  stopColor={finalPnl >= 0 ? "#10b981" : "#ef4444"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="pnl"
              stroke={finalPnl >= 0 ? "#10b981" : "#ef4444"}
              fill="url(#pnlGrad)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
