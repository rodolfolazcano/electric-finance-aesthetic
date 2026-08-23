// @ts-nocheck
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import type { TradeSignal } from "@/lib/statarb.types";

interface Props {
  data: Array<{ date: string; value: number }>;
  signals: TradeSignal[];
  entryThresh: number;
  stopThresh: number;
  selectedEntry?: string;
  selectedExit?: string;
  splitDate?: string;
}

function fmtDate(d: string) {
  if (!d || d.length < 10) return d;
  return d.slice(8, 10) + "/" + d.slice(5, 7);
}

export function ZScoreChart({
  data,
  signals,
  entryThresh,
  stopThresh,
  selectedEntry,
  selectedExit,
  splitDate,
}: Props) {
  if (data.length === 0) return null;

  const annotated = data.map((d) => {
    const sig = signals.find((s) => s.date === d.date);
    return { ...d, signal: sig?.type ?? null };
  });

  const entryPoint = selectedEntry ? data.find((d) => d.date === selectedEntry) : null;
  const exitPoint = selectedExit ? data.find((d) => d.date === selectedExit) : null;

  const colorZscore = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= stopThresh) return "#ef4444";
    if (abs >= entryThresh) return "#f59e0b";
    return "#10b981";
  };

  return (
    <div className="space-y-2">
      <h3 className="font-mono text-xs font-medium text-foreground">Z-Score Histórico</h3>
      <div className="rounded-lg border border-border/40 bg-background/40 p-3">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={annotated} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
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
              domain={[-stopThresh * 1.5, stopThresh * 1.5]}
              tick={{ fontSize: 9, fontFamily: "monospace", fill: "#9aa6bd" }}
              stroke="#2b3242"
              axisLine={false}
              tickLine={false}
              width={40}
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
              formatter={(val: number) => [`${val >= 0 ? "+" : ""}${val.toFixed(2)}σ`, "Z-Score"]}
            />
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
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
            <ReferenceLine
              y={entryThresh}
              stroke="#f59e0b"
              strokeDasharray="6 3"
              strokeOpacity={0.4}
            />
            <ReferenceLine
              y={-entryThresh}
              stroke="#f59e0b"
              strokeDasharray="6 3"
              strokeOpacity={0.4}
            />
            <ReferenceLine y={stopThresh} stroke="#ef4444" strokeOpacity={0.25} />
            <ReferenceLine y={-stopThresh} stroke="#ef4444" strokeOpacity={0.25} />
            <defs>
              <linearGradient id="zscoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Line type="monotone" dataKey="value" stroke="#8b5cf6" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
