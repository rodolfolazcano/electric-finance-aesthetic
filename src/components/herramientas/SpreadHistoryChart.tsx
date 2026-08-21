"use client";
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
import type { SpreadHistoryPoint } from "@/lib/cripto.types";

export function SpreadHistoryChart({ history }: { history: SpreadHistoryPoint[] }) {
  const data = useMemo(
    () =>
      history.slice(-120).map((h) => ({
        t: new Date(h.timestamp).toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        usdtBlue: h.usdtBlue != null ? +(h.usdtBlue * 100).toFixed(2) : null,
        usdtMep: h.usdtMep != null ? +(h.usdtMep * 100).toFixed(2) : null,
        usdtCcl: h.usdtCcl != null ? +(h.usdtCcl * 100).toFixed(2) : null,
      })),
    [history],
  );

  if (data.length < 2) return null;

  return (
    <div>
      <div className="mono mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Histórico de Spreads (2h)
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 8 }} />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 8 }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: "#141a28",
                border: "1px solid #2b3242",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v: number) => `${v.toFixed(2)}%`}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="usdtBlue"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
              name="USDT/Blue"
            />
            <Line
              type="monotone"
              dataKey="usdtMep"
              stroke="#10b981"
              dot={false}
              strokeWidth={2}
              name="USDT/MEP"
            />
            <Line
              type="monotone"
              dataKey="usdtCcl"
              stroke="#f59e0b"
              dot={false}
              strokeWidth={2}
              name="USDT/CCL"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
