// @ts-nocheck
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import type { HedgeUniverseAsset } from "@/lib/capm-hedge.types";

interface Props {
  assets: HedgeUniverseAsset[];
  selectedTickers: Set<string>;
}

export function HedgeScatterChart({ assets, selectedTickers }: Props) {
  if (assets.length === 0) return null;

  const data = assets.map((a) => ({
    ticker: a.ticker,
    correlation: Math.round(a.correlation * 1000) / 1000,
    beta: Math.round(a.beta * 1000) / 1000,
    tipo: a.tipo,
    selected: selectedTickers.has(a.ticker),
  }));

  return (
    <div className="space-y-2">
      <h3 className="font-mono text-xs font-medium text-foreground">
        Correlación vs Beta del Universo
      </h3>
      <div className="rounded-lg border border-border/40 p-3">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis
              dataKey="correlation"
              type="number"
              domain={[-1, 1]}
              tick={{ fontSize: 10, fontFamily: "monospace" }}
              stroke="hsl(var(--muted-foreground))"
              label={{
                value: "Correlación",
                position: "bottom",
                fontSize: 10,
                fontFamily: "monospace",
              }}
            />
            <YAxis
              dataKey="beta"
              type="number"
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fontFamily: "monospace" }}
              stroke="hsl(var(--muted-foreground))"
              label={{
                value: "Beta",
                angle: -90,
                position: "left",
                fontSize: 10,
                fontFamily: "monospace",
              }}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "monospace",
              }}
              formatter={(val: number, name: string) => [val.toFixed(3), name]}
              labelFormatter={(label: string) => label}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }} />
            {["ETF", "CEDEAR", "BYMA"].map((tipo) => {
              const group = data.filter((d) => d.tipo === tipo);
              if (group.length === 0) return null;
              return (
                <Scatter
                  key={tipo}
                  name={tipo}
                  data={group}
                  dataKey="beta"
                  fill={tipo === "ETF" ? "#3b82f6" : tipo === "CEDEAR" ? "#a855f7" : "#f59e0b"}
                  opacity={0.6}
                >
                  {group.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.selected
                          ? "#fbbf24"
                          : entry.tipo === "ETF"
                            ? "#3b82f6"
                            : entry.tipo === "CEDEAR"
                              ? "#a855f7"
                              : "#f59e0b"
                      }
                      stroke={entry.selected ? "#fbbf24" : "none"}
                      strokeWidth={entry.selected ? 2 : 0}
                    />
                  ))}
                </Scatter>
              );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
