// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { getMacroTrends, type MacroTrendsResult } from "@/lib/macro-trends.functions";

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function TrendChartCard({
  title,
  data,
  dataKey = "valor",
  color = "#10b981",
  unit = "",
  height = 180,
}: {
  title: string;
  data: { fecha: string; valor: number }[];
  dataKey?: string;
  color?: string;
  unit?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-background/40/40 p-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
        <div className="mt-4 text-xs text-muted-foreground">Sin datos históricos</div>
      </div>
    );
  }

  const lastVal = data[data.length - 1]?.valor;
  const firstVal = data[0]?.valor;
  const change = firstVal && firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : null;
  const isUp = change != null && change > 0;

  return (
    <div className="rounded-lg border border-border/40 bg-background/40/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-foreground">
            {lastVal != null ? `${unit ? `${unit} ` : ""}${fmtNum(lastVal, 0)}` : "\u2014"}
          </span>
          {change != null && (
            <span className={isUp ? "text-danger" : "text-success"}>
              {isUp ? "+" : ""}
              {change.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={`grad-${title.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="fecha"
            tick={{ fontSize: 8, fill: "#9aa6bd" }}
            stroke="#2b3242"
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => v.slice(5, 10)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 8, fill: "#9aa6bd" }}
            stroke="#2b3242"
            axisLine={false}
            tickLine={false}
            width={40}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#141a28",
              border: "1px solid #2b3242",
              borderRadius: 8,
              fontSize: 11,
              fontFamily: "monospace",
            }}
            labelFormatter={(v: string) => v.slice(0, 10)}
            formatter={(val: number) => [fmtNum(val, 0), title]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#grad-${title.replace(/\s+/g, "")})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function IndicatorCard({
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40/40 p-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold font-mono ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function TendenciasMacroPanel() {
  const getTrends = useServerFn(getMacroTrends);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["macro-trends"],
    queryFn: () => getTrends(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-[220px] w-full rounded-lg" />
          <Skeleton className="h-[220px] w-full rounded-lg" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Error al cargar tendencias macro. Intente nuevamente.
      </div>
    );
  }

  // Limit data points for charts
  const rpChart = data.riesgoPais.slice(-90);
  const reservasChart = data.reservas.slice(-90);

  // Last inflation data for cards
  const ultimaInflacion =
    data.inflacion.historico.length > 0
      ? data.inflacion.historico[data.inflacion.historico.length - 1]
      : null;
  const inflacionAnterior =
    data.inflacion.historico.length > 1
      ? data.inflacion.historico[data.inflacion.historico.length - 2]
      : null;
  const inflacionVar =
    ultimaInflacion?.valor != null && inflacionAnterior?.valor != null
      ? ((ultimaInflacion.valor - inflacionAnterior.valor) / inflacionAnterior.valor) * 100
      : null;

  return (
    <div className="space-y-4">
      <div className="mono text-[11px] uppercase tracking-[0.22em] text-primary/80">
        Tendencias Macroeconómicas
      </div>

      {/* Trend charts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TrendChartCard title="Riesgo País" data={rpChart} color="#f59e0b" unit="pts" />
        <TrendChartCard title="Reservas BCRA" data={reservasChart} color="#3b82f6" unit="USD B" />
      </div>

      {/* Inflation cards */}
      <div>
        <div className="mb-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Inflación de Referencia
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
          <IndicatorCard
            label="Mensual"
            value={data.inflacion.mensual != null ? fmtPct(data.inflacion.mensual, 2) : "\u2014"}
            sub={inflacionVar != null ? `vs anterior: ${fmtPct(inflacionVar)}` : undefined}
            color={
              data.inflacion.mensual != null && data.inflacion.mensual > 3
                ? "text-danger"
                : "text-success"
            }
          />
          <IndicatorCard
            label="Interanual"
            value={
              data.inflacion.interanual != null
                ? fmtPct(data.inflacion.interanual / 100, 1)
                : "\u2014"
            }
            color={
              data.inflacion.interanual != null && data.inflacion.interanual > 50
                ? "text-warning"
                : "text-success"
            }
          />
          <IndicatorCard
            label="Acum. Año"
            value={
              data.inflacion.acumuladaAnual != null
                ? fmtPct(data.inflacion.acumuladaAnual, 2)
                : "\u2014"
            }
          />
        </div>
      </div>

      {/* Rates cards */}
      <div>
        <div className="mb-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Tasas Comparables
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <IndicatorCard
            label="BADLAR"
            value={data.tasas.badlar != null ? fmtPct(data.tasas.badlar, 2) : "\u2014"}
          />
          <IndicatorCard
            label="TM20"
            value={data.tasas.tm20 != null ? fmtPct(data.tasas.tm20, 2) : "\u2014"}
          />
          <IndicatorCard
            label="Riesgo País"
            value={
              data.riesgoPais.length > 0
                ? `${fmtNum(data.riesgoPais[data.riesgoPais.length - 1].valor, 0)} pb`
                : "\u2014"
            }
          />
          <IndicatorCard
            label="Últ. Actualización"
            value={data.timestamp ? new Date(data.timestamp).toLocaleString("es-AR") : "\u2014"}
            sub=""
          />
        </div>
      </div>
    </div>
  );
}
