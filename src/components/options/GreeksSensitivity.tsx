// @ts-nocheck
import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { blackScholes } from "@/lib/options-pricing/pricing.models";
import type { OptionType, Greeks } from "@/lib/options-pricing/options.types";

interface GreeksSensitivityProps {
  tipo: OptionType;
  strike: number;
  T: number;
  r: number;
  sigma: number;
  spotBase: number;
  q?: number; // dividend yield (default 0)
}

export function GreeksSensitivity({
  tipo,
  strike,
  T,
  r,
  sigma,
  spotBase,
  q = 0,
}: GreeksSensitivityProps) {
  const [selectedGreek, setSelectedGreek] = useState<"delta" | "gamma" | "vega" | "theta">("delta");

  const data = useMemo(() => {
    const puntos: {
      spotPct: number;
      spot: number;
      delta: number;
      gamma: number;
      vega: number;
      theta: number;
    }[] = [];
    for (let pct = 50; pct <= 150; pct += 2) {
      const S = spotBase * (pct / 100);
      const result = blackScholes({ tipo, S, K: strike, T, r, sigma, q });
      if (result) {
        puntos.push({
          spotPct: pct,
          spot: S,
          delta: result.greeks.delta,
          gamma: result.greeks.gamma,
          vega: result.greeks.vega,
          theta: result.greeks.theta,
        });
      }
    }
    return puntos;
  }, [tipo, strike, T, r, sigma, spotBase, q]);

  if (data.length === 0) {
    return (
      <Card className="p-4 border border-border/40 bg-background/40/80 backdrop-blur-sm">
        <p className="text-[9px] font-mono text-muted-foreground">
          Seleccione una opción en la tabla para ver sensibilidad
        </p>
      </Card>
    );
  }

  const chartColors: Record<string, string> = {
    delta: "var(--color-emerald-400, #34d399)",
    gamma: "var(--color-amber-400, #fbbf24)",
    vega: "var(--color-blue-400, #60a5fa)",
    theta: "var(--color-red-400, #f87171)",
  };

  return (
    <Card className="p-4 border border-border/40 bg-background/40/80 backdrop-blur-sm">
      <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
        Sensibilidad de Griegas
      </h3>
      <div className="flex gap-2 mb-2">
        {(["delta", "gamma", "vega", "theta"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setSelectedGreek(g)}
            className={`text-[9px] font-mono px-2 py-0.5 rounded transition-colors ${
              selectedGreek === g
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>
      <p className="text-[8px] font-mono text-muted-foreground mb-1">
        {tipo} Strike ${strike.toFixed(0)} | T {T.toFixed(2)}a | Vol {(sigma * 100).toFixed(0)}%
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
          <XAxis
            dataKey="spot"
            tick={{ fontSize: 9 }}
            stroke="var(--muted-foreground)"
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            name="Spot"
          />
          <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" name={selectedGreek} />
          <Tooltip
            contentStyle={{
              fontSize: 10,
              background: "var(--background)",
              border: "1px solid var(--border)",
            }}
          />
          <ReferenceLine
            x={spotBase}
            stroke="var(--gold)"
            strokeOpacity={0.4}
            strokeDasharray="4 4"
            label={{ value: "Spot", position: "top", fill: "var(--gold)", fontSize: 8 }}
          />
          <ReferenceLine
            y={0}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.3}
            strokeDasharray="4 4"
          />
          <Legend wrapperStyle={{ fontSize: 9 }} />
          {(["delta", "gamma", "vega", "theta"] as const).map((g) => (
            <Line
              key={g}
              type="monotone"
              dataKey={g}
              stroke={chartColors[g]}
              strokeWidth={selectedGreek === g ? 2 : 0.3}
              dot={false}
              opacity={selectedGreek === g ? 1 : 0.3}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
