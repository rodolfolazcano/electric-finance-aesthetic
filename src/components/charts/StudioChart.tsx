import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/types";
import { formatARS } from "@/lib/validation/math-check";

type Props = {
  series: SeriesPoint[];
  chartType?: "ladder" | "line" | "bar";
  unit?: string;
  compact?: boolean;
};

const axisStyle = {
  fill: "var(--color-muted-foreground)",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
};

export function StudioChart({ series, chartType = "ladder", unit = "", compact }: Props) {
  const data = useMemo(
    () => series.map((point) => ({ label: point.label, value: Number(point.value) || 0 })),
    [series],
  );

  const tooltip = (
    <Tooltip
      cursor={{ fill: "var(--color-grid)" }}
      contentStyle={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--color-foreground)",
      }}
      formatter={(value: number) => [formatARS(value, unit), ""]}
    />
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chartType === "line" ? (
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: compact ? -18 : 0 }}>
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={compact ? 34 : 52} />
          {tooltip}
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      ) : (
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: compact ? -18 : 0 }}>
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={compact ? 34 : 52} />
          {tooltip}
          <Bar
            dataKey="value"
            fill="var(--color-chart-1)"
            radius={[2, 2, 0, 0]}
            maxBarSize={compact ? 14 : 26}
          />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
