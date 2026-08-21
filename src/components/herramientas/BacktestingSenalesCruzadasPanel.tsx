// @ts-nocheck
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getBacktestSenalesCruzadas } from "@/lib/backtest-senales-cruzadas.functions";

const AXIS_TICK = { fill: "var(--color-muted-foreground)", fontSize: 10, fontFamily: "monospace" };
const GRID_STROKE = "var(--color-border)";
const DIR_COLORS: Record<string, string> = {
  alcista: "var(--color-success)",
  bajista: "var(--color-danger)",
  neutral: "var(--color-warning)",
};

export default function BacktestingSenalesCruzadasPanel() {
  const [ticker, setTicker] = useState("AAPL");
  const [rango, setRango] = useState("3Y");
  const [ventana, setVentana] = useState(15);

  const query = useQuery({
    queryKey: ["backtest-cruzadas", ticker, rango, ventana],
    queryFn: () =>
      getBacktestSenalesCruzadas({ data: { ticker, rango: rango as any, ventanaDias: ventana } }),
    enabled: ticker.length >= 1,
    staleTime: 300_000,
  });

  const data = query.data;

  const cruzadasAlcista = data?.resumenComparativo.find((r) => r.tipo === "cruzada_alcista");
  const cruzadasBajista = data?.resumenComparativo.find((r) => r.tipo === "cruzada_bajista");
  const soloTecnica = data?.resumenComparativo.find((r) => r.tipo === "solo_tecnica");
  const soloFundamental = data?.resumenComparativo.find((r) => r.tipo === "solo_fundamental");

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
        <div>
          <label className="block text-[13px] uppercase tracking-wider text-muted-foreground mb-1">
            Ventana (días)
          </label>
          <input
            type="number"
            min={1}
            max={60}
            value={ventana}
            onChange={(e) => setVentana(Number(e.target.value))}
            className="mono w-16 rounded border border-border/40 bg-background px-2 py-1.5 text-xs text-right"
          />
        </div>
        <p className="text-[13px] text-muted-foreground/60">
          Señales combinadas: semáforo + fundamental en ≤{ventana} días
        </p>
      </div>

      {query.isLoading && (
        <p className="text-xs text-muted-foreground">Calculando señales cruzadas...</p>
      )}
      {data?.error && <p className="text-xs text-danger">{data.error}</p>}

      {data && !data.error && (
        <>
          {/* Tabla comparativa: el insight central */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-3">
              Comparativa: técnica sola vs fundamental sola vs cruzada
            </h3>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground">
                    <th className="py-2 pr-2 text-left font-medium">Señal</th>
                    <th className="p-2 text-right font-medium">Ocurrencias</th>
                    <th className="p-2 text-right font-medium">Win rate 20d</th>
                    <th className="p-2 text-right font-medium">Ret. prom. 20d</th>
                  </tr>
                </thead>
                <tbody>
                  {soloTecnica && (
                    <tr className="border-b border-border/10">
                      <td className="py-1.5 pr-2 font-mono">Solo técnica (semáforo)</td>
                      <td className="p-1.5 text-right">{soloTecnica.ocurrencias}</td>
                      <td
                        className={`p-1.5 text-right font-mono ${soloTecnica.winRate20d >= 55 ? "text-success" : soloTecnica.winRate20d >= 45 ? "text-warning" : "text-danger"}`}
                      >
                        {soloTecnica.winRate20d.toFixed(0)}%
                      </td>
                      <td
                        className={`p-1.5 text-right font-mono ${soloTecnica.retornoPromedio20d >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {(soloTecnica.retornoPromedio20d * 100).toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  {soloFundamental && (
                    <tr className="border-b border-border/10">
                      <td className="py-1.5 pr-2 font-mono">Solo fundamental</td>
                      <td className="p-1.5 text-right">{soloFundamental.ocurrencias}</td>
                      <td
                        className={`p-1.5 text-right font-mono ${soloFundamental.winRate20d >= 55 ? "text-success" : soloFundamental.winRate20d >= 45 ? "text-warning" : "text-danger"}`}
                      >
                        {soloFundamental.winRate20d.toFixed(0)}%
                      </td>
                      <td
                        className={`p-1.5 text-right font-mono ${soloFundamental.retornoPromedio20d >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {(soloFundamental.retornoPromedio20d * 100).toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  {cruzadasAlcista && (
                    <tr className="border-b border-border/10 bg-success/5">
                      <td className="py-1.5 pr-2 font-mono font-semibold text-success">
                         Cruzada alcista
                      </td>
                      <td className="p-1.5 text-right">{cruzadasAlcista.ocurrencias}</td>
                      <td
                        className={`p-1.5 text-right font-mono ${cruzadasAlcista.winRate20d >= 55 ? "text-success" : cruzadasAlcista.winRate20d >= 45 ? "text-warning" : "text-danger"}`}
                      >
                        {cruzadasAlcista.winRate20d.toFixed(0)}%
                      </td>
                      <td
                        className={`p-1.5 text-right font-mono ${cruzadasAlcista.retornoPromedio20d >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {(cruzadasAlcista.retornoPromedio20d * 100).toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  {cruzadasBajista && (
                    <tr className="border-b border-border/10 bg-danger/5">
                      <td className="py-1.5 pr-2 font-mono font-semibold text-danger">
                         Cruzada bajista
                      </td>
                      <td className="p-1.5 text-right">{cruzadasBajista.ocurrencias}</td>
                      <td
                        className={`p-1.5 text-right font-mono ${cruzadasBajista.winRate20d >= 55 ? "text-success" : cruzadasBajista.winRate20d >= 45 ? "text-warning" : "text-danger"}`}
                      >
                        {cruzadasBajista.winRate20d.toFixed(0)}%
                      </td>
                      <td
                        className={`p-1.5 text-right font-mono ${cruzadasBajista.retornoPromedio20d >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {(cruzadasBajista.retornoPromedio20d * 100).toFixed(1)}%
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Equity curve */}
          {data.resumenComparativo.filter((r) => r.equityCurve.length > 0).length > 0 && (
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
                    {soloTecnica && soloTecnica.equityCurve.length > 0 && (
                      <Line
                        data={soloTecnica.equityCurve}
                        type="monotone"
                        dataKey="valor"
                        name="Solo técnica"
                        stroke="var(--color-primary)"
                        strokeWidth={1}
                        dot={false}
                      />
                    )}
                    {cruzadasAlcista && cruzadasAlcista.equityCurve.length > 0 && (
                      <Line
                        data={cruzadasAlcista.equityCurve}
                        type="monotone"
                        dataKey="valor"
                        name="Cruzada alcista"
                        stroke="var(--color-success)"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                    {cruzadasBajista && cruzadasBajista.equityCurve.length > 0 && (
                      <Line
                        data={cruzadasBajista.equityCurve}
                        type="monotone"
                        dataKey="valor"
                        name="Cruzada bajista"
                        stroke="var(--color-danger)"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Detalle */}
          {data.detalle.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <h3 className="text-xs font-semibold text-muted-foreground p-4 pb-0">
                Señales cruzadas individuales (N={data.totalCruzadas})
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground">
                    <th className="py-2 pr-2 text-left font-medium">Fecha</th>
                    <th className="p-2 text-left font-medium">Dirección</th>
                    <th className="p-2 text-left font-medium">Semáforo</th>
                    <th className="p-2 text-left font-medium">Fundamental</th>
                    <th className="p-2 text-right font-medium">Δd</th>
                    <th className="p-2 text-right font-medium">Entrada</th>
                    <th className="p-2 text-right font-medium">Ret 5d</th>
                    <th className="p-2 text-right font-medium">Ret 20d</th>
                    <th className="p-2 text-right font-medium">Ret 60d</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detalle
                    .slice(-80)
                    .reverse()
                    .map((c, i) => (
                      <tr key={i} className="border-b border-border/10 hover:bg-muted/10">
                        <td className="py-1.5 pr-2 font-mono text-[13px] text-muted-foreground">
                          {c.fechaConfirmacion}
                        </td>
                        <td className="p-1.5">
                          <span
                            className="text-[13px] font-semibold"
                            style={{ color: DIR_COLORS[c.direccion] }}
                          >
                            {c.direccion === "alcista"
                              ? ""
                              : c.direccion === "bajista"
                                ? ""
                                : ""}{" "}
                            {c.direccion}
                          </span>
                        </td>
                        <td className="p-1.5 text-[13px] max-w-28 truncate text-muted-foreground">
                          {c.senalSemaforo}
                        </td>
                        <td className="p-1.5 text-[13px] text-muted-foreground">
                          {c.senalFundamental}
                        </td>
                        <td className="p-1.5 text-right font-mono text-[13px]">
                          {c.diasEntreSenales}
                        </td>
                        <td className="p-1.5 text-right font-mono">
                          ${c.precioEntrada.toFixed(2)}
                        </td>
                        {[c.retorno5d, c.retorno20d, c.retorno60d].map((r, j) => (
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

          {data.totalCruzadas === 0 && !data.error && (
            <p className="text-xs text-muted-foreground">
              No se encontraron señales cruzadas. Probá con una ventana más amplia o un ticker con
              más cobertura de earnings.
            </p>
          )}
        </>
      )}
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
