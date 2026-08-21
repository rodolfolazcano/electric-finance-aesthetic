"use client";
import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  t: number;
  obi: number;
  zScore: number;
}

export function ObiZscoreChart({
  obiHistory,
  zScoreHistory,
  umbral,
}: {
  obiHistory: number[];
  zScoreHistory: number[];
  umbral: number;
}) {
  const data: DataPoint[] = useMemo(() => {
    const len = Math.min(obiHistory.length, zScoreHistory.length);
    return Array.from({ length: len }, (_, i) => ({
      t: i,
      obi: obiHistory[i] ?? 0,
      zScore: zScoreHistory[i] ?? 0,
    })).slice(-120);
  }, [obiHistory, zScoreHistory]);

  const obiDomain = useMemo(() => {
    if (data.length < 2) return [-1, 1] as [number, number];
    const vals = data.map((d) => Math.abs(d.obi)).filter((v) => v > 0.001);
    if (vals.length === 0) return [-1, 1] as [number, number];
    const max = Math.max(...vals) * 1.2;
    return [-max, max] as [number, number];
  }, [data]);

  if (data.length < 2)
    return (
      <div className="mono text-[13px] text-muted-foreground">
        OBI + Z-Score: esperando datos...
      </div>
    );

  return (
    <div>
      <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
        OBI + Z-Score
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 8, fill: "#9aa6bd" }}
              stroke="#2b3242"
              interval={Math.max(1, Math.floor(data.length / 10))}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 8, fill: "#9aa6bd" }}
              stroke="#2b3242"
              domain={obiDomain}
              tickFormatter={(v) => `${v.toFixed(3)}`}
              width={55}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 8, fill: "#9aa6bd" }}
              stroke="#2b3242"
              domain={[-3.5, 3.5]}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "#141a28",
                border: "1px solid #2b3242",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="obi"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={1.5}
              name="OBI"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="zScore"
              stroke="#f59e0b"
              dot={false}
              strokeWidth={1.5}
              name="Z-Score"
            />
            <ReferenceLine
              yAxisId="right"
              y={umbral}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `+${umbral}σ`,
                position: "insideTopRight",
                fontSize: 9,
                fill: "#ef4444",
              }}
            />
            <ReferenceLine
              yAxisId="right"
              y={-umbral}
              stroke="#22c55e"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `-${umbral}σ`,
                position: "insideBottomRight",
                fontSize: 9,
                fill: "#22c55e",
              }}
            />
            <ReferenceLine yAxisId="right" y={0} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
