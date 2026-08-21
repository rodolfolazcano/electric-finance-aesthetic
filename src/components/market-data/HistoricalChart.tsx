// @ts-nocheck
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { HistoricalBar } from "@/lib/herramientas/market-data.types";

interface Props {
  data: HistoricalBar[];
  height: number;
  moneda: "ARS" | "USD";
  ticker: string;
}

export default function HistoricalChart({ data, height, moneda, ticker }: Props) {
  if (!data.length) return null;

  const min = Math.min(...data.map((d) => d.cierre));
  const max = Math.max(...data.map((d) => d.cierre));
  const primero = data[0].cierre;
  const ultimo = data[data.length - 1].cierre;
  const esAlcista = ultimo >= primero;
  const color = esAlcista ? "#3b82f6" : "#ff4757";

  const formatFecha = (fecha: string) => {
    const d = new Date(fecha + "T00:00:00");
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  };

  const formatPrecio = (v: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: moneda,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      notation: "compact",
    }).format(v);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const bar: HistoricalBar = payload[0]?.payload;
    return (
      <div className="bg-surface border border-border/60 rounded-md p-2 text-xs font-mono space-y-1 shadow-lg">
        <p className="text-muted-foreground">{formatFecha(label)}</p>
        <p className="text-foreground">
          Cierre: <span style={{ color }}>{formatPrecio(bar.cierre)}</span>
        </p>
        <p className="text-muted-foreground">Max: {formatPrecio(bar.maximo)}</p>
        <p className="text-muted-foreground">Min: {formatPrecio(bar.minimo)}</p>
        {bar.volumen > 0 && (
          <p className="text-muted-foreground">
            Vol: {new Intl.NumberFormat("es-AR", { notation: "compact" }).format(bar.volumen)}
          </p>
        )}
      </div>
    );
  };

  const step = Math.max(1, Math.floor(data.length / 6));
  const ticksX = data.filter((_, i) => i % step === 0).map((d) => d.fecha);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2b3242" vertical={false} />
        <XAxis
          dataKey="fecha"
          ticks={ticksX}
          tickFormatter={formatFecha}
          tick={{ fill: "#9aa6bd", fontSize: 10, fontFamily: "JetBrains Mono" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[min * 0.98, max * 1.02]}
          tickFormatter={formatPrecio}
          tick={{ fill: "#9aa6bd", fontSize: 10, fontFamily: "JetBrains Mono" }}
          axisLine={false}
          tickLine={false}
          width={65}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={primero} stroke="#9aa6bd" strokeDasharray="3 3" strokeWidth={1} />
        <Area
          type="monotone"
          dataKey="cierre"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${ticker})`}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

