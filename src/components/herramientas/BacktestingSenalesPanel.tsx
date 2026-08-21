// @ts-nocheck
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getBacktestSenalesTecnicas } from "@/lib/backtest-senales-tecnicas.functions";

const AXIS_TICK = { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "monospace" };
const GRID_STROKE = "var(--color-border)";

export default function BacktestingSenalesPanel() {
  const [ticker, setTicker] = useState("AAPL");
  const [rango, setRango] = useState("3Y");

  const query = useQuery({
    queryKey: ["backtest-senales", ticker, rango],
    queryFn: () => getBacktestSenalesTecnicas({ data: { ticker, rango: rango as any } }),
    enabled: ticker.length >= 1,
    staleTime: 300_000,
  });

  const data = query.data;

  const resumenMejora = data?.resumen.find((r) => r.tipo === "mejora");
  const resumenEmpeora = data?.resumen.find((r) => r.tipo === "empeora");
  const resumenTotal = data?.resumen.find((r) => r.tipo === "total");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Ticker
          </label>
          <input
            className="mono w-28 rounded border border-border/40 bg-background px-2 py-1.5 text-xs"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
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
        <p className="text-[9px] text-muted-foreground/60 ml-auto">
          Señales por cambio de clasificación del semáforo (score combinado)
        </p>
      </div>

      {query.isLoading && (
        <p className="text-xs text-muted-foreground">Calculando serie del semáforo...</p>
      )}
      {data?.error && <p className="text-xs text-danger">{data.error}</p>}

      {data && !data.error && (
        <>
          {/* Tarjetas resumen */}
          <div className="grid gap-3 sm:grid-cols-3">
            {resumenMejora && (
              <ResumenCard
                titulo="Mejora de clasificación"
                data={resumenMejora}
                color="var(--color-success)"
              />
            )}
            {resumenEmpeora && (
              <ResumenCard
                titulo="Empeora de clasificación"
                data={resumenEmpeora}
                color="var(--color-danger)"
              />
            )}
            {resumenTotal && (
              <ResumenCard
                titulo="Total señales"
                data={resumenTotal}
                color="var(--color-primary)"
              />
            )}
          </div>

          {/* Equity curve comparativo */}
          {data.resumen.filter((r) => r.equityCurve.length > 0).length > 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3">
                Evolución acumulada
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="fecha" tick={AXIS_TICK} tickFormatter={(v) => v.slice(5, 10)} />
                    <YAxis tick={AXIS_TICK} width={50} domain={["auto", "auto"]} />
                    <Tooltip content={<ChartTip />} />
                    {resumenMejora && resumenMejora.equityCurve.length > 0 && (
                      <Line
                        data={resumenMejora.equityCurve}
                        type="monotone"
                        dataKey="valor"
                        name="Mejora"
                        stroke="var(--color-success)"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    )}
                    {resumenEmpeora && resumenEmpeora.equityCurve.length > 0 && (
                      <Line
                        data={resumenEmpeora.equityCurve}
                        type="monotone"
                        dataKey="valor"
                        name="Empeora"
                        stroke="var(--color-danger)"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    )}
                    {resumenTotal && resumenTotal.equityCurve.length > 0 && (
                      <Line
                        data={resumenTotal.equityCurve}
                        type="monotone"
                        dataKey="valor"
                        name="Total"
                        stroke="var(--color-primary)"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tabla de detalle */}
          {data.detalle.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground">
                    <th className="py-2 pr-2 text-left font-medium">Fecha</th>
                    <th className="p-2 text-left font-medium">Señal</th>
                    <th className="p-2 text-left font-medium">Clasificación</th>
                    <th className="p-2 text-right font-medium">Score</th>
                    <th className="p-2 text-right font-medium">Entrada</th>
                    <th className="p-2 text-right font-medium">Ret 5d</th>
                    <th className="p-2 text-right font-medium">Ret 20d</th>
                    <th className="p-2 text-right font-medium">Ret 60d</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detalle
                    .slice(-100)
                    .reverse()
                    .map((s, i) => (
                      <tr key={i} className="border-b border-border/10 hover:bg-muted/10">
                        <td className="py-1.5 pr-2 font-mono text-[10px] text-muted-foreground">
                          {s.fecha}
                        </td>
                        <td className="p-1.5">
                          <span
                            className={`text-[9px] font-medium ${s.tipo === "mejora" ? "text-success" : "text-danger"}`}
                          >
                            {s.tipo === "mejora" ? "▲ Mejora" : "▼ Empeora"}
                          </span>
                        </td>
                        <td className="p-1.5 text-[10px]">
                          <span className="text-muted-foreground">{s.clasificacionAnterior}</span>
                          <span className="mx-1 text-muted-foreground/40">→</span>
                          <span className={s.tipo === "mejora" ? "text-success" : "text-danger"}>
                            {s.clasificacionActual}
                          </span>
                        </td>
                        <td className="p-1.5 text-right font-mono text-[10px]">
                          <span className="text-muted-foreground">
                            {s.scoreAnterior.toFixed(2)}
                          </span>
                          <span className="mx-0.5 text-muted-foreground/40">→</span>
                          <span className={s.tipo === "mejora" ? "text-success" : "text-danger"}>
                            {s.scoreActual.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-1.5 text-right font-mono">
                          ${s.precioEntrada.toFixed(2)}
                        </td>
                        {[s.retorno5d, s.retorno20d, s.retorno60d].map((r, j) => (
                          <td
                            key={j}
                            className={`p-1.5 text-right font-mono text-[10px] ${
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

function ResumenCard({ titulo, data, color }: { titulo: string; data: any; color: string }) {
  if (data.ocurrencias === 0) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
      <h4 className="text-[11px] font-semibold mb-3" style={{ color }}>
        {titulo}
      </h4>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <MiniMetric label="Señales" value={String(data.ocurrencias)} />
        <MiniMetric
          label="Win rate 20d"
          value={`${data.winRate20d.toFixed(0)}%`}
          className={
            data.winRate20d >= 55
              ? "text-success"
              : data.winRate20d >= 45
                ? "text-warning"
                : "text-danger"
          }
        />
        <MiniMetric
          label="Ret. prom. 20d"
          value={`${(data.retornoPromedio20d * 100).toFixed(1)}%`}
          className={data.retornoPromedio20d >= 0 ? "text-success" : "text-danger"}
        />
        <MiniMetric label="Mediana 20d" value={`${(data.retornoMediano20d * 100).toFixed(1)}%`} />
        <MiniMetric
          label="Mejor caso"
          value={`${(data.mejorCaso20d * 100).toFixed(1)}%`}
          className="text-success"
        />
        <MiniMetric
          label="Peor caso"
          value={`${(data.peorCaso20d * 100).toFixed(1)}%`}
          className="text-danger"
        />
      </div>
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
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mono text-[11px] ${className ?? ""}`}>{value}</div>
    </div>
  );
}

function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[10px] font-mono shadow-sm">
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {(p.value as number).toFixed(3)}
        </div>
      ))}
    </div>
  );
}
