// @ts-nocheck
import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";

interface PayoffLeg {
  tipo: "Call" | "Put";
  strike: number;
  prima: number;
  cantidad: number;
  compra: boolean;
}

interface PayoffChartProps {
  legs: PayoffLeg[];
  spotActual: number;
}

function calcularPago(leg: PayoffLeg, spot: number): number {
  const { tipo, strike, prima, cantidad, compra } = leg;
  const intrínseco = tipo === "Call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const pagoPorUnidad = compra ? intrínseco - prima : prima - intrínseco;
  return pagoPorUnidad * cantidad;
}

function calcularPagoTotal(legs: PayoffLeg[], spot: number): number {
  return legs.reduce((sum, l) => sum + calcularPago(l, spot), 0);
}

export function PayoffChart({ legs, spotActual }: PayoffChartProps) {
  const data = useMemo((): { puntos: { spot: number; payoff: number }[]; breakevens: number[] } => {
    if (legs.length === 0) return { puntos: [], breakevens: [] };
    const minStrike = Math.min(...legs.map((l) => l.strike));
    const maxStrike = Math.max(...legs.map((l) => l.strike));
    const range = maxStrike - minStrike;
    const lo = Math.max(minStrike - range * 0.5, 1);
    const hi = maxStrike + range * 0.5;
    const step = (hi - lo) / 100;

    const puntos: { spot: number; payoff: number }[] = [];
    const breakevens: number[] = [];
    for (let s = lo; s <= hi; s += step) {
      const pago = calcularPagoTotal(legs, s);
      puntos.push({ spot: s, payoff: pago });
    }

    for (let i = 1; i < puntos.length; i++) {
      const prev = puntos[i - 1];
      const curr = puntos[i];
      if ((prev.payoff >= 0 && curr.payoff < 0) || (prev.payoff < 0 && curr.payoff >= 0)) {
        const t = prev.payoff / (prev.payoff - curr.payoff);
        const be = prev.spot + t * (curr.spot - prev.spot);
        breakevens.push(be);
      }
    }

    return { puntos, breakevens };
  }, [legs]);

  if (legs.length === 0) {
    return (
      <Card className="p-4 border border-border/40 bg-background/40/80 backdrop-blur-sm">
        <p className="text-[9px] font-mono text-muted-foreground">
          Agregue una o más patas para ver el diagrama de payoff
        </p>
      </Card>
    );
  }

  const maxPayoff = Math.max(...data.puntos.map((p) => p.payoff), 1);
  const minPayoff = Math.min(...data.puntos.map((p) => p.payoff), -1);
  const margin = (maxPayoff - minPayoff) * 0.1 || 1;

  const payoffAtSpot = calcularPagoTotal(legs, spotActual);

  const formatTooltip = (value: number) => [`$${value.toFixed(2)}`, "Payoff"];

  return (
    <Card className="p-4 border border-border/40 bg-background/40/80 backdrop-blur-sm">
      <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
        Payoff al Vencimiento
      </h3>
      <div className="flex gap-4 text-[9px] font-mono text-muted-foreground mb-2">
        <span>
          Spot actual: <span className="text-foreground">${spotActual.toFixed(2)}</span>
        </span>
        <span>
          Payoff actual:{" "}
          <span className={payoffAtSpot >= 0 ? "text-emerald-400" : "text-red-400"}>
            ${payoffAtSpot.toFixed(2)}
          </span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data.puntos} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
          <XAxis
            dataKey="spot"
            tick={{ fontSize: 9 }}
            stroke="var(--muted-foreground)"
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <YAxis
            tick={{ fontSize: 9 }}
            stroke="var(--muted-foreground)"
            domain={[minPayoff - margin, maxPayoff + margin]}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            formatter={formatTooltip}
            labelFormatter={(v: number) => `Spot: $${v.toFixed(2)}`}
            contentStyle={{
              fontSize: 10,
              background: "var(--background)",
              border: "1px solid var(--border)",
            }}
          />
          <ReferenceLine
            y={0}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.4}
            strokeDasharray="4 4"
          />
          <ReferenceLine
            x={spotActual}
            stroke="var(--gold)"
            strokeOpacity={0.4}
            strokeDasharray="4 4"
            label={{ value: "Spot", position: "top", fill: "var(--gold)", fontSize: 8 }}
          />
          {data.breakevens.map((be, i) => (
            <ReferenceLine
              key={`be-${i}`}
              x={be}
              stroke="var(--warning)"
              strokeOpacity={0.5}
              strokeDasharray="2 4"
              label={{
                value: `BE $${be.toFixed(0)}`,
                position: "bottom",
                fill: "var(--warning)",
                fontSize: 7,
              }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="payoff"
            stroke="var(--primary)"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
