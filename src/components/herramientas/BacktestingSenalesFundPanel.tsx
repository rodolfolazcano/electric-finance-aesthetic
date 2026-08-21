// @ts-nocheck
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getBacktestSenalesFundamentales } from "@/lib/backtest-senales-fundamentales.functions";
import type { BacktestFundamentalResult } from "@/lib/backtest-senales-fundamentales.functions";

const AXIS_TICK = { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "monospace" };
const GRID_STROKE = "var(--color-border)";

const TIPO_LABELS: Record<string, string> = {
  earnings_beat: "Earnings Beat",
  earnings_miss: "Earnings Miss",
  upgrade_analista: "Upgrade Analista",
  downgrade_analista: "Downgrade Analista",
  mejora_score_fundamental: "Mejora Score",
  deterioro_score_fundamental: "Deterioro Score",
  revalorizacion_pe: "Barato Histórico",
  sobrevaluacion_pe: "Caro Histórico",
};

const TIPO_COLORS: Record<string, string> = {
  earnings_beat: "var(--color-success)",
  earnings_miss: "var(--color-danger)",
  upgrade_analista: "var(--color-success)",
  downgrade_analista: "var(--color-danger)",
  mejora_score_fundamental: "var(--color-success)",
  deterioro_score_fundamental: "var(--color-danger)",
  revalorizacion_pe: "var(--color-warning)",
  sobrevaluacion_pe: "var(--color-warning)",
};

export default function BacktestingSenalesFundPanel() {
  const [ticker, setTicker] = useState("AAPL");
  const [rango, setRango] = useState("3Y");

  const query = useQuery({
    queryKey: ["backtest-fund", ticker, rango],
    queryFn: () => getBacktestSenalesFundamentales({ data: { ticker, rango: rango as any } }),
    enabled: ticker.length >= 1,
    staleTime: 300_000,
  });

  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[13px] uppercase tracking-wider text-muted-foreground mb-1">
            Ticker
          </label>
          <input
            className="mono w-28 rounded border border-border/40 bg-background px-2 py-1.5 text-xs"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label className="block text-[13px] uppercase tracking-wider text-muted-foreground mb-1">
            Período
          </label>
          <select
            className="rounded border border-border/40 bg-background px-2 py-1.5 text-xs"
            value={rango}
            onChange={(e) => setRango(e.target.value)}
          >
            <option value="1Y">1 año</option>
            <option value="3Y">3 años</option>
            <option value="5Y">5 años</option>
            <option value="MAX">Máximo</option>
          </select>
        </div>
        <p className="text-[13px] text-muted-foreground/60 ml-auto">
          Fechas de publicación reales — sin look-ahead bias
        </p>
      </div>

      {query.isLoading && (
        <p className="text-xs text-muted-foreground">Obteniendo earnings históricos...</p>
      )}
      {data?.error && <p className="text-xs text-danger">{data.error}</p>}

      {data && !data.error && (
        <>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.porTipo.map((t) => {
              const tone =
                t.winRate20d > 55 && t.retornoPromedio20d > 0
                  ? "text-success"
                  : t.winRate20d < 45
                    ? "text-danger"
                    : "text-warning";
              return (
                <div key={t.tipo} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[13px] font-semibold uppercase tracking-wider"
                      style={{ color: TIPO_COLORS[t.tipo] }}
                    >
                      {TIPO_LABELS[t.tipo] ?? t.tipo}
                    </span>
                    <span className="text-[13px] text-muted-foreground">N={t.ocurrencias}</span>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-1.5 text-[13px]">
                    <MiniMetric
                      label="Win rate 20d"
                      value={`${t.winRate20d.toFixed(0)}%`}
                      className={tone}
                    />
                    <MiniMetric
                      label="Ret. prom. 20d"
                      value={`${(t.retornoPromedio20d * 100).toFixed(1)}%`}
                      className={t.retornoPromedio20d >= 0 ? "text-success" : "text-danger"}
                    />
                    <MiniMetric
                      label="Mejor caso"
                      value={`${(t.mejorCaso20d * 100).toFixed(1)}%`}
                      className="text-success"
                    />
                    <MiniMetric
                      label="Peor caso"
                      value={`${(t.peorCaso20d * 100).toFixed(1)}%`}
                      className="text-danger"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {data.porTipo.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3">
                Evolución acumulada por tipo
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="fecha" tick={AXIS_TICK} tickFormatter={(v) => v.slice(5, 10)} />
                    <YAxis tick={AXIS_TICK} width={50} domain={["auto", "auto"]} />
                    <Tooltip content={<ChartTip />} />
                    {data.porTipo.slice(0, 4).map((t, i) => (
                      <Line
                        key={t.tipo}
                        data={t.equityCurve}
                        type="monotone"
                        dataKey="valor"
                        name={TIPO_LABELS[t.tipo] ?? t.tipo}
                        stroke={TIPO_COLORS[t.tipo] ?? `var(--color-chart-${i + 4})`}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.detalle.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground">
                    <th className="py-2 pr-2 text-left font-medium">Fecha publicación</th>
                    <th className="p-2 text-left font-medium">Tipo</th>
                    <th className="p-2 text-right font-medium">Entrada</th>
                    <th className="p-2 text-right font-medium">Ret 5d</th>
                    <th className="p-2 text-right font-medium">Ret 20d</th>
                    <th className="p-2 text-right font-medium">Ret 60d</th>
                    <th className="p-2 text-right font-medium">Ret 120d</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detalle
                    .slice(-60)
                    .reverse()
                    .map((s, i) => (
                      <tr key={i} className="border-b border-border/10 hover:bg-muted/10">
                        <td className="py-1.5 pr-2 font-mono text-[13px] text-muted-foreground">
                          {s.fechaPublicacion}
                        </td>
                        <td className="p-1.5">
                          <span
                            className="text-[13px] font-medium"
                            style={{ color: TIPO_COLORS[s.tipo] }}
                          >
                            {TIPO_LABELS[s.tipo] ?? s.tipo}
                          </span>
                        </td>
                        <td className="p-1.5 text-right font-mono">
                          ${s.precioEntrada.toFixed(2)}
                        </td>
                        {[s.retorno5d, s.retorno20d, s.retorno60d, s.retorno120d].map((r, j) => (
                          <td
                            key={j}
                            className={`p-1.5 text-right font-mono text-[13px] ${
                              r == null
                                ? "text-muted-foreground/40"
                                : r >= 0
                                  ? "text-success"
                                  : "text-danger"
                            }`}
                          >
                            {r != null ? `${(r * 100).toFixed(1)}%` : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded border border-border/30 bg-muted/10 px-2 py-1">
      <div className="text-[13px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mono text-[14px] ${className ?? ""}`}>{value}</div>
    </div>
  );
}

function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-mono shadow-sm">
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {(p.value as number).toFixed(3)}
        </div>
      ))}
    </div>
  );
}
