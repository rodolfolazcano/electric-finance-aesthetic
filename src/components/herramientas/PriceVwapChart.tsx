"use client";
import { useMemo } from "react";
import {
  AreaChart,
  Area,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Kline } from "@/lib/cripto.types";

export function PriceVwapChart({
  klines,
  vwap,
  currentPrice,
}: {
  klines: Kline[];
  vwap: number;
  currentPrice?: number | null;
}) {
  const data = useMemo(() => {
    const sliced = klines.slice(-99).map((k, i) => ({
      t: i,
      price: k.close,
    }));
    if (currentPrice != null && currentPrice > 0) {
      sliced.push({ t: sliced.length, price: currentPrice });
    }
    return sliced;
  }, [klines, currentPrice]);

  if (data.length < 2) return null;

  return (
    <div>
      <div className="mono mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Precio + VWAP
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 8, fill: "#9aa6bd" }} stroke="#2b3242" />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 8, fill: "#9aa6bd" }}
              stroke="#2b3242"
            />
            <Tooltip
              contentStyle={{
                background: "#141a28",
                border: "1px solid #2b3242",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#10b981"
              fill="url(#priceGrad)"
              dot={false}
              strokeWidth={2}
              name="Precio"
            />
            {vwap > 0 && (
              <ReferenceLine
                y={vwap}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: `VWAP $${vwap.toFixed(2)}`,
                  position: "right",
                  fontSize: 9,
                  fill: "#f59e0b",
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
