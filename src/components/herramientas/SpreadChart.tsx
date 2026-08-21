import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

interface Props {
  data: Array<{
    date: string;
    value: number;
    mean: number;
    upper: number;
    lower: number;
    upperSl: number;
    lowerSl: number;
  }>;
  signals?: Array<{ date: string; type: string }>;
  selectedEntry?: string;
  selectedExit?: string;
  splitDate?: string;
}

function fmtDate(d: string) {
  if (!d || d.length < 10) return d;
  const m = d.slice(5, 7);
  const y = d.slice(2, 4);
  const day = d.slice(8, 10);
  return `${day}/${m}`;
}

export function SpreadChart({ data, signals, selectedEntry, selectedExit, splitDate }: Props) {
  const sorted = useMemo(
    () => [...data].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );
  const signalSet = useMemo(() => new Set(signals?.map((s) => s.date) ?? []), [signals]);

  if (sorted.length === 0) return null;

  const entryPoint = selectedEntry ? sorted.find((d) => d.date === selectedEntry) : null;
  const exitPoint = selectedExit ? sorted.find((d) => d.date === selectedExit) : null;

  return (
    <div className="space-y-2">
      <h3 className="font-mono text-xs font-medium text-foreground">
        Spread y Bandas de Bollinger
      </h3>
      <div className="rounded-lg border border-border/40 bg-background/40/40 p-3">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={sorted} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
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
              width={50}
            />
            <Tooltip
              contentStyle={{
                background: "#141a28",
                border: "1px solid #2b3242",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "monospace",
              }}
              labelFormatter={fmtDate}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
            <defs>
              <linearGradient id="spreadFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.08} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            {splitDate && (
              <ReferenceLine
                x={splitDate}
                stroke="rgba(255,255,255,0.4)"
                strokeDasharray="8 4"
                strokeWidth={1}
                label={{
                  value: "IS/OOS",
                  position: "top",
                  fontSize: 8,
                  fill: "rgba(255,255,255,0.4)",
                }}
              />
            )}
            {selectedEntry && (
              <ReferenceLine
                x={selectedEntry}
                stroke="#fbbf24"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}
            {selectedExit && (
              <ReferenceLine
                x={selectedExit}
                stroke="#f97316"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}
            {entryPoint && (
              <ReferenceDot
                x={entryPoint.date}
                y={entryPoint.value}
                r={5}
                fill="#fbbf24"
                stroke="#141a28"
                strokeWidth={1.5}
              />
            )}
            {exitPoint && (
              <ReferenceDot
                x={exitPoint.date}
                y={exitPoint.value}
                r={5}
                fill="#f97316"
                stroke="#141a28"
                strokeWidth={1.5}
              />
            )}
            <Area
              type="monotone"
              dataKey="upperSl"
              stroke="#ef4444"
              strokeDasharray="2 2"
              fill="none"
              dot={false}
              strokeWidth={1}
              opacity={0.5}
            />
            <Area
              type="monotone"
              dataKey="lowerSl"
              stroke="#22c55e"
              strokeDasharray="2 2"
              fill="none"
              dot={false}
              strokeWidth={1}
              opacity={0.5}
            />
            <Line
              type="monotone"
              dataKey="upper"
              stroke="#ef4444"
              strokeDasharray="6 3"
              dot={false}
              strokeWidth={1}
              opacity={0.7}
            />
            <Line
              type="monotone"
              dataKey="lower"
              stroke="#22c55e"
              strokeDasharray="6 3"
              dot={false}
              strokeWidth={1}
              opacity={0.7}
            />
            <Line
              type="monotone"
              dataKey="mean"
              stroke="rgba(255,255,255,0.2)"
              dot={false}
              strokeWidth={1}
              opacity={0.6}
            />
            <Line type="monotone" dataKey="value" stroke="#10b981" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
