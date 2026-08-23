// @ts-nocheck
import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { ProcessedOption } from "@/lib/options-pricing/options.types";

interface VaRChartProps {
  options: ProcessedOption[];
  spot: number;
}

const VIRIDIS_HEX = [
  "#440154",
  "#482878",
  "#3e4989",
  "#31688e",
  "#26828e",
  "#1f9e89",
  "#35b779",
  "#6ece58",
  "#b5de2b",
  "#fde725",
];

function colorForIndex(i: number, total: number): string {
  if (total <= 1) return VIRIDIS_HEX[5];
  const idx = Math.round((i / (total - 1)) * (VIRIDIS_HEX.length - 1));
  return VIRIDIS_HEX[Math.max(0, Math.min(idx, VIRIDIS_HEX.length - 1))];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-background/95 border border-border/60 rounded px-2 py-1.5 text-[9px] font-mono shadow-md max-w-[200px]">
      <p className="text-foreground font-semibold">{d.simbolo ?? ""}</p>
      <p className="text-muted-foreground">
        Strike: <span className="text-foreground">${d.strike?.toFixed(0)}</span>
      </p>
      <p className="text-muted-foreground">
        VaR: <span className="text-foreground">{d.var?.toFixed(4) ?? "—"}</span>
      </p>
      <p className="text-muted-foreground">
        Precio: <span className="text-foreground">${d.precio?.toFixed(2) ?? "—"}</span>
      </p>
      <p className="text-muted-foreground">
        Prob ITM:{" "}
        <span className="text-foreground">
          {d.probITM != null ? `${(d.probITM * 100).toFixed(1)}%` : "—"}
        </span>
      </p>
      <p className="text-muted-foreground">
        Vol:{" "}
        <span className="text-foreground">
          {d.vol != null ? `${(d.vol * 100).toFixed(1)}%` : "—"}
        </span>
      </p>
      <p className="text-muted-foreground">
        Delta: <span className="text-foreground">{d.delta != null ? d.delta.toFixed(4) : "—"}</span>
      </p>
    </div>
  );
}

export function VaRChart({ options, spot }: VaRChartProps) {
  const { grupos, maxAbsVaR } = useMemo(() => {
    const filtradas = options.filter((o) => o.var != null);
    const vencimientos = [...new Set(filtradas.map((o) => o.fechaVencimiento))].sort();
    let maxAbs = 0;
    const grupos = vencimientos.map((venc, idx) => {
      const ops = filtradas.filter((o) => o.fechaVencimiento === venc);
      const calls = ops
        .filter((o) => o.tipoOpcion === "Call")
        .map((o) => {
          const v = o.var!;
          if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
          return {
            strike: o.strike,
            var: v,
            simbolo: o.simbolo,
            precio: o.precioOpcion,
            probITM: o.probITM,
            vol: o.volatilidadImplicita,
            delta: o.greeks?.delta ?? null,
          };
        });
      const puts = ops
        .filter((o) => o.tipoOpcion === "Put")
        .map((o) => {
          const v = o.var!;
          if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
          return {
            strike: o.strike,
            var: v,
            simbolo: o.simbolo,
            precio: o.precioOpcion,
            probITM: o.probITM,
            vol: o.volatilidadImplicita,
            delta: o.greeks?.delta ?? null,
          };
        });
      const color = colorForIndex(idx, vencimientos.length);
      return { venc, color, calls, puts };
    });
    return { grupos, maxAbsVaR: maxAbs * 1.15 || 0.01 };
  }, [options, spot]);

  if (grupos.length === 0) {
    return (
      <Card className="p-4 border border-border/40 bg-background/80 backdrop-blur-sm">
        <p className="text-[9px] font-mono text-muted-foreground">Sin datos de VaR para graficar</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 border border-border/40 bg-background/80 backdrop-blur-sm">
      <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
        Value at Risk — {grupos.length} vencimiento(s)
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
          <XAxis
            dataKey="strike"
            tick={{ fontSize: 9 }}
            stroke="var(--muted-foreground)"
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            name="Strike"
          />
          <YAxis
            tick={{ fontSize: 9 }}
            stroke="var(--muted-foreground)"
            name="VaR"
            domain={[-maxAbsVaR, maxAbsVaR]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 8 }}
            formatter={(value: string) => value.replace(" - ", " ")}
          />
          <ReferenceLine
            y={0}
            stroke="var(--color-red-400, #f87171)"
            strokeOpacity={0.5}
            strokeDasharray="6 3"
            label={{
              value: "VaR = 0",
              position: "right",
              fill: "var(--color-red-400, #f87171)",
              fontSize: 7,
            }}
          />
          <ReferenceLine
            x={spot}
            stroke="var(--gold)"
            strokeOpacity={0.5}
            strokeDasharray="4 4"
            label={{
              value: `Spot $${spot.toFixed(0)}`,
              position: "top",
              fill: "var(--gold)",
              fontSize: 8,
            }}
          />
          {grupos.map((g) => (
            <g key={g.venc}>
              {g.calls.length > 0 && (
                <Scatter
                  name={`Call ${g.venc.slice(5)}`}
                  data={g.calls}
                  fill={g.color}
                  stroke={g.color}
                  strokeWidth={0.3}
                  legendType="rect"
                />
              )}
              {g.puts.length > 0 && (
                <Scatter
                  name={`Put ${g.venc.slice(5)}`}
                  data={g.puts}
                  fill={g.color}
                  stroke={g.color}
                  strokeWidth={0.3}
                  legendType="rect"
                />
              )}
            </g>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  );
}
