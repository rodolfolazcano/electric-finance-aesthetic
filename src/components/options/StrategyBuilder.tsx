// @ts-nocheck
import { useState, useMemo, useCallback } from "react";
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
import { Button } from "@/components/ui/button";

interface Leg {
  id: number;
  tipo: "Call" | "Put";
  strike: number;
  prima: number;
  cantidad: number;
  compra: boolean;
}

const ESTRATEGIAS_PREDEFINIDAS: Record<string, Omit<Leg, "id">[]> = {
  "covered-call": [{ tipo: "Call", strike: 0, prima: 0, cantidad: -1, compra: false }],
  "protective-put": [{ tipo: "Put", strike: 0, prima: 0, cantidad: 1, compra: true }],
  "bull-spread": [
    { tipo: "Call", strike: 0, prima: 0, cantidad: 1, compra: true },
    { tipo: "Call", strike: 0, prima: 0, cantidad: -1, compra: false },
  ],
  "bear-spread": [
    { tipo: "Put", strike: 0, prima: 0, cantidad: 1, compra: true },
    { tipo: "Put", strike: 0, prima: 0, cantidad: -1, compra: false },
  ],
  straddle: [
    { tipo: "Call", strike: 0, prima: 0, cantidad: 1, compra: true },
    { tipo: "Put", strike: 0, prima: 0, cantidad: 1, compra: true },
  ],
  strangle: [
    { tipo: "Call", strike: 0, prima: 0, cantidad: 1, compra: true },
    { tipo: "Put", strike: 0, prima: 0, cantidad: 1, compra: true },
  ],
};

function calcularPagoLeg(leg: Leg, spot: number): number {
  const intrínseco =
    leg.tipo === "Call" ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
  const pagoPorUnidad = leg.compra ? intrínseco - leg.prima : leg.prima - intrínseco;
  return pagoPorUnidad * leg.cantidad;
}

export function StrategyBuilder() {
  const [legs, setLegs] = useState<Leg[]>([]);
  const [nextId, setNextId] = useState(1);

  const addLeg = useCallback(
    (template?: Partial<Leg>) => {
      setLegs((prev) => [
        ...prev,
        { id: nextId, tipo: "Call", strike: 0, prima: 0, cantidad: 1, compra: true, ...template },
      ]);
      setNextId((n) => n + 1);
    },
    [nextId],
  );

  const updateLeg = useCallback((id: number, field: keyof Leg, value: any) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }, []);

  const removeLeg = useCallback((id: number) => {
    setLegs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const cargarEstrategia = useCallback(
    (nombre: string) => {
      const template = ESTRATEGIAS_PREDEFINIDAS[nombre];
      if (!template) return;
      setLegs([]);
      const nuevas: Leg[] = template.map((t, i) => ({
        id: nextId + i,
        ...t,
      }));
      setLegs(nuevas);
      setNextId((n) => n + template.length);
    },
    [nextId],
  );

  const data = useMemo(() => {
    if (legs.length === 0) return [];
    const strikes = legs.map((l) => l.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const range = maxStrike - minStrike || 100;
    const lo = Math.max(minStrike - range * 0.5, 1);
    const hi = maxStrike + range * 0.5;
    const step = (hi - lo) / 120;

    const puntos: { spot: number; payoff: number }[] = [];
    for (let s = lo; s <= hi; s += step) {
      const pago = legs.reduce((sum, l) => sum + calcularPagoLeg(l, s), 0);
      puntos.push({ spot: s, payoff: pago });
    }
    return puntos;
  }, [legs]);

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const payoffs = data.map((d) => d.payoff);
    const maxProfit = Math.max(...payoffs, 0);
    const maxLoss = Math.min(...payoffs, 0);
    const breakevens: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      if ((prev.payoff >= 0 && curr.payoff < 0) || (prev.payoff < 0 && curr.payoff >= 0)) {
        const t = prev.payoff / (prev.payoff - curr.payoff);
        breakevens.push(prev.spot + t * (curr.spot - prev.spot));
      }
    }
    return { maxProfit, maxLoss, breakevens };
  }, [data]);

  return (
    <Card className="p-4 border border-border/40 bg-background/40/80 backdrop-blur-sm">
      <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
        Constructor de Estrategias
      </h3>

      <div className="flex flex-wrap gap-1 mb-3">
        {Object.keys(ESTRATEGIAS_PREDEFINIDAS).map((name) => (
          <button
            key={name}
            onClick={() => cargarEstrategia(name)}
            className="text-[8px] font-mono px-2 py-0.5 rounded border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            {name.replace(/-/g, " ")}
          </button>
        ))}
      </div>

      <div className="space-y-1 mb-3">
        {legs.map((leg) => (
          <div key={leg.id} className="flex items-center gap-1 text-[9px] font-mono flex-wrap">
            <select
              value={leg.tipo}
              onChange={(e) => updateLeg(leg.id, "tipo", e.target.value)}
              className="h-5 text-[8px] bg-background border border-border/40 rounded px-1"
            >
              <option value="Call">Call</option>
              <option value="Put">Put</option>
            </select>
            <input
              type="number"
              placeholder="Strike"
              value={leg.strike || ""}
              onChange={(e) => updateLeg(leg.id, "strike", parseFloat(e.target.value) || 0)}
              className="h-5 w-16 text-[8px] bg-background border border-border/40 rounded px-1"
            />
            <input
              type="number"
              placeholder="Prima"
              value={leg.prima || ""}
              onChange={(e) => updateLeg(leg.id, "prima", parseFloat(e.target.value) || 0)}
              className="h-5 w-14 text-[8px] bg-background border border-border/40 rounded px-1"
            />
            <input
              type="number"
              placeholder="Cant."
              value={leg.cantidad || ""}
              onChange={(e) => updateLeg(leg.id, "cantidad", parseInt(e.target.value) || 0)}
              className="h-5 w-12 text-[8px] bg-background border border-border/40 rounded px-1"
            />
            <label className="flex items-center gap-1 text-[8px]">
              <input
                type="checkbox"
                checked={leg.compra}
                onChange={(e) => updateLeg(leg.id, "compra", e.target.checked)}
                className="h-2.5 w-2.5"
              />
              Compra
            </label>
            <button
              onClick={() => removeLeg(leg.id)}
              className="text-red-400 hover:text-red-300 text-[9px] ml-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <Button onClick={() => addLeg()} size="sm" className="h-5 text-[8px] mb-3">
        + Agregar pata
      </Button>

      {stats && (
        <div className="flex gap-3 text-[8px] font-mono text-muted-foreground mb-2">
          <span>
            Máx. Ganancia: <span className="text-emerald-400">${stats.maxProfit.toFixed(2)}</span>
          </span>
          <span>
            Máx. Pérdida: <span className="text-red-400">${stats.maxLoss.toFixed(2)}</span>
          </span>
          {stats.breakevens.map((be, i) => (
            <span key={i}>
              BE: <span className="text-amber-400">${be.toFixed(2)}</span>
            </span>
          ))}
        </div>
      )}

      {data.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              formatter={(value: number) => [`$${value.toFixed(2)}`, "Payoff"]}
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
            {stats?.breakevens.map((be, i) => (
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
            <Legend wrapperStyle={{ fontSize: 9 }} />
            <Line
              type="monotone"
              dataKey="payoff"
              stroke="var(--primary)"
              strokeWidth={1.5}
              dot={false}
              name="Payoff"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
