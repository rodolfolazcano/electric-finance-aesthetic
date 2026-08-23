// @ts-nocheck
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSemaforoBatch,
  type SemaforoResult,
} from "@/lib/herramientas/finance.functions";
import { getRiesgoAnalysis, VALID_INTERVALS, VALID_PERIODS, INTERVAL_MAP, periodToDays,
  type DistribStats,
} from "@/lib/herramientas/riesgo.functions";
import { useIOLPortafolio } from "@/lib/use-iol-portafolio";
import { useIOLSession } from "@/lib/iol-context";
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_STYLE_LG, AXIS_TICK, AXIS_TICK_LG, GRID_STROKE } from "@/components/herramientas/shared/chart-constants";
import { MarketDataInput } from "@/components/market-data/MarketDataInput";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";

export function RiesgoPage() {
  const { accessToken, refreshToken, updateTokens } = useIOLSession();
  return (
    <div className="space-y-4">
      <Tabs defaultValue="manual">
        <TabsList className="w-full justify-start gap-0 rounded-none border-b border-border/60 bg-transparent p-0">
          <TabsTrigger
            value="manual"
            className="relative rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
          >
            Manual
          </TabsTrigger>
          <TabsTrigger
            value="portafolio-iol"
            className="relative rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
          >
            Portafolio IOL
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-4">
          <RiesgoManual
            accessToken={accessToken}
            refreshToken={refreshToken}
            updateTokens={updateTokens}
          />
        </TabsContent>

        <TabsContent value="portafolio-iol" className="mt-4">
          <RiesgoPortafolioIOL />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RiesgoResultPanel({
  results,
  loading,
  error,
  selectedTicker,
  setSelectedTicker,
  histogramMode = "returns",
}: {
  results: DistribStats[] | null;
  loading: boolean;
  error: string;
  selectedTicker: string | null;
  setSelectedTicker: (t: string | null) => void;
  histogramMode?: "returns" | "price";
}) {
  const [sortKey, setSortKey] = useState("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showRawReturns, setShowRawReturns] = useState(false);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedResults = useMemo(() => {
    if (!results) return null;
    const arr = [...results];
    arr.sort((a, b) => {
      let va: unknown = (a as Record<string, unknown>)[sortKey];
      let vb: unknown = (b as Record<string, unknown>)[sortKey];
      if (va == null) va = "";
      if (vb == null) vb = "";
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = Number(va);
      const nb = Number(vb);
      return sortDir === "asc" ? na - nb : nb - na;
    });
    return arr;
  }, [results, sortKey, sortDir]);

  const SortIcon = useCallback(
    ({ col }: { col: string }) => {
      if (sortKey !== col) return <span className="ml-1 opacity-20">â†•</span>;
      return <span className="ml-1">{sortDir === "asc" ? "â†‘" : "â†“"}</span>;
    },
    [sortKey, sortDir],
  );

  const activeResult = useMemo(() => {
    if (!results || !selectedTicker) return null;
    return results.find((r) => r.ticker === selectedTicker) ?? results[0];
  }, [results, selectedTicker]);

  const [pMode, setPMode] = useState<"classic" | "implied">("classic");

  const chartData = useMemo(() => {
    if (!results) return null;
    return results.map((r) => ({
      ticker: r.ticker,
      "Retorno anual": r.meanAnnual,
      Volatilidad: r.volatilityAnnual,
      // Labadié §3.2 p-variance: toggle clásico (p=2) vs p=implied (1/H, ya computado en riesgo.functions: ~342)
      Sharpe: pMode === "implied" && r.pSharpe != null ? r.pSharpe : r.sharpeRatio,
      "VaR 95%": r.var95,
      Skewness: r.skewness,
      Kurtosis: r.kurtosis,
    }));
  }, [results, pMode]);

  return (
    <div className="min-w-0 w-full space-y-4">
      {!results && !loading && !error && (
        <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
          <p className="text-sm text-muted-foreground">
            IngresÃ¡ uno o mÃ¡s tickers y ejecutÃ¡ el anÃ¡lisis.
          </p>
        </div>
      )}

      {loading && (
        <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
          <p className="text-sm text-muted-foreground">Calculando mÃ©tricas de riesgo...</p>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="w-full space-y-4">
          {/* Ticker selector */}
          {results.length > 1 && (
            <div className="flex gap-1 w-full overflow-x-auto pb-1">
              {results.map((r) => (
                <button
                  key={r.ticker}
                  onClick={() => setSelectedTicker(r.ticker)}
                  className={`px-4 py-2 text-xs font-mono rounded-md border transition-colors shrink-0 ${
                    selectedTicker === r.ticker
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r.ticker}
                </button>
              ))}
            </div>
          )}

          {activeResult && (
            <>
              {/* â”€â”€ Histograma full-width con lÃ­neas de referencia â”€â”€ */}
              <div className="glass p-4 w-full">
                <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                  Histograma de {histogramMode === "returns" ? "retornos" : "precios"} Â·{" "}
                  {activeResult.ticker}
                  <span className="ml-2 text-[13px] text-muted-foreground">
                    {activeResult.interval} / {activeResult.period} Â· {activeResult.count} muestras
                  </span>
                </div>
                <div className="relative">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={
                          histogramMode === "returns"
                            ? activeResult.histogram
                            : activeResult.priceHistogram
                        }
                        margin={{ top: 16, right: 8, bottom: 0, left: 8 }}
                      >
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="binStart" tick={false} domain={["auto", "auto"]} />
                        <YAxis tick={false} />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(v: number) => [v, "Frecuencia"]}
                          labelFormatter={(l: number) =>
                            histogramMode === "returns"
                              ? `Retorno: ${(l * 100).toFixed(2)}%`
                              : `Precio: $${fmtNum(l, 2)}`
                          }
                        />
                        <Bar
                          dataKey="count"
                          fill={histogramMode === "returns" ? "var(--color-success)" : "#60a5fa"}
                          radius={[1, 1, 0, 0]}
                        />
                        {/* LÃ­neas de referencia (solo lÃ­nea, etiquetas en panel superpuesto) */}
                        {histogramMode === "returns" ? (
                          <>
                            <ReferenceLine
                              x={activeResult.meanAnnual / activeResult.annualFactor}
                              stroke="var(--color-success)"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                            />
                            <ReferenceLine
                              x={activeResult.median}
                              stroke="#60a5fa"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                            />
                            <ReferenceLine
                              x={activeResult.var95}
                              stroke="var(--color-danger)"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                            />
                            <ReferenceLine
                              x={activeResult.mode}
                              stroke="#fbbf24"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                            />
                          </>
                        ) : (
                          <>
                            <ReferenceLine
                              x={activeResult.priceMean}
                              stroke="var(--color-success)"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                            />
                            <ReferenceLine
                              x={activeResult.priceMedian}
                              stroke="#60a5fa"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                            />
                            <ReferenceLine
                              x={activeResult.priceMode}
                              stroke="#fbbf24"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                            />
                            <ReferenceLine
                              x={activeResult.pricePercentiles.p5}
                              stroke="var(--color-danger)"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                            />
                            <ReferenceLine
                              x={activeResult.pricePercentiles.p95}
                              stroke="#a78bfa"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                            />
                            <ReferenceLine
                              x={activeResult.currentPrice}
                              stroke="#e879f9"
                              strokeDasharray="2 2"
                              strokeWidth={2}
                            />
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Panel de estadÃ­sticas superpuesto */}
                  <div className="absolute top-0 right-1 bg-background/80 backdrop-blur-sm border border-border/30 rounded-md p-2.5 max-w-[200px] space-y-1">
                    <div className="text-[12px] uppercase tracking-wider text-muted-foreground mb-1">
                      Resumen
                    </div>
                    {histogramMode === "returns" ? (
                      <>
                        <div className="space-y-1">
                          <div className="flex items-start gap-1.5">
                            <span className="w-2 h-0.5 rounded bg-[var(--color-success)] shrink-0 mt-1.5" />
                            <div className="min-w-0">
                              <span className="text-[13px] font-mono text-success">
                                Î¼={fmtPct(activeResult.meanAnnual, 2)}
                              </span>
                              <span className="text-[7px] text-muted-foreground ml-1">anual</span>
                            </div>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <span className="w-2 h-0.5 rounded bg-[#60a5fa] shrink-0 mt-1.5" />
                            <div className="min-w-0">
                              <span className="text-[13px] font-mono text-[#60a5fa]">
                                Mdn={fmtPct(activeResult.median, 4)}
                              </span>
                              <span className="text-[7px] text-muted-foreground ml-1">mediana</span>
                            </div>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <span className="w-2 h-0.5 rounded bg-[#fbbf24] shrink-0 mt-1.5" />
                            <div className="min-w-0">
                              <span className="text-[13px] font-mono text-[#fbbf24]">
                                Moda={fmtPct(activeResult.mode, 4)}
                              </span>
                              <span className="text-[7px] text-muted-foreground ml-1">
                                mÃ¡s frecuente
                              </span>
                            </div>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <span className="w-2 h-0.5 rounded bg-[var(--color-danger)] shrink-0 mt-1.5" />
                            <div className="min-w-0">
                              <span className="text-[13px] font-mono text-danger">
                                VaR95={fmtPct(activeResult.var95, 4)}
                              </span>
                              <span className="text-[7px] text-muted-foreground ml-1">
                                mÃ¡x pÃ©rdida 95%
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-border/20 my-1" />
                        <div className="space-y-0.5 text-[12px] font-mono text-muted-foreground">
                          <div>
                            Ïƒ anual:{" "}
                            <span className="text-foreground/80">
                              {fmtPct(activeResult.volatilityAnnual, 2)}
                            </span>
                          </div>
                          <div>
                            Ïƒ/{activeResult.interval}:{" "}
                            <span className="text-foreground/80">
                              {fmtPct(
                                activeResult.volatilityAnnual /
                                  Math.sqrt(activeResult.annualFactor),
                                4,
                              )}
                            </span>
                          </div>
                          <div className={activeResult.isNormal ? "text-success" : "text-danger"}>
                            {activeResult.isNormal ? "DistribuciÃ³n Normal" : "No Normal"}
                          </div>
                        </div>
                        <div className="border-t border-border/20 my-1" />
                        <div className="text-[7px] font-mono text-muted-foreground leading-tight">
                          <span className="text-foreground/80 font-semibold">Percentiles:</span>
                          <br />
                          P5={fmtPct(activeResult.percentiles.p5, 4)}&nbsp; P25=
                          {fmtPct(activeResult.percentiles.p25, 4)}
                          <br />
                          P50={fmtPct(activeResult.percentiles.p50, 4)}&nbsp; P75=
                          {fmtPct(activeResult.percentiles.p75, 4)}
                          <br />
                          P95={fmtPct(activeResult.percentiles.p95, 4)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-0.5 rounded bg-[var(--color-success)] shrink-0" />
                            <span className="text-[13px] font-mono text-success">
                              Î¼=${fmtNum(activeResult.priceMean, 2)}
                            </span>
                            <span className="text-[7px] text-muted-foreground">
                              precio promedio
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-0.5 rounded bg-[#60a5fa] shrink-0" />
                            <span className="text-[13px] font-mono text-[#60a5fa]">
                              Mdn=${fmtNum(activeResult.priceMedian, 2)}
                            </span>
                            <span className="text-[7px] text-muted-foreground">precio mediano</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-0.5 rounded bg-[#fbbf24] shrink-0" />
                            <span className="text-[13px] font-mono text-[#fbbf24]">
                              Moda=${fmtNum(activeResult.priceMode, 2)}
                            </span>
                            <span className="text-[7px] text-muted-foreground">
                              precio mÃ¡s frecuente
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-0.5 rounded bg-[#a78bfa] shrink-0" />
                            <span className="text-[13px] font-mono text-[#a78bfa]">
                              Actual=${fmtNum(activeResult.currentPrice, 2)}
                            </span>
                            <span className="text-[7px] text-muted-foreground">Ãºltimo precio</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-0.5 rounded bg-[var(--color-danger)] shrink-0" />
                            <span className="text-[13px] font-mono text-danger">
                              P5=${fmtNum(activeResult.pricePercentiles.p5, 2)}
                            </span>
                            <span className="text-[7px] text-muted-foreground">
                              soporte histÃ³rico
                            </span>
                          </div>
                        </div>
                        <div className="border-t border-border/20 my-1" />
                        <div className="text-[12px] font-mono text-muted-foreground">
                          Ïƒ=${fmtNum(activeResult.priceStd, 2)}&nbsp;&nbsp;Ïƒ%=
                          {fmtPct(activeResult.priceStd / activeResult.priceMean, 2)}
                        </div>
                        <div className="border-t border-border/20 my-1" />
                        <div className="text-[7px] font-mono text-muted-foreground leading-tight">
                          <span className="text-foreground/80 font-semibold">
                            Percentiles precio:
                          </span>
                          <br />
                          P5=${fmtNum(activeResult.pricePercentiles.p5, 2)}&nbsp; P25=$
                          {fmtNum(activeResult.pricePercentiles.p25, 2)}
                          <br />
                          P50=${fmtNum(activeResult.pricePercentiles.p50, 2)}&nbsp; P75=$
                          {fmtNum(activeResult.pricePercentiles.p75, 2)}
                          <br />
                          P95=${fmtNum(activeResult.pricePercentiles.p95, 2)}
                        </div>
                        <div className="border-t border-border/20 my-1" />
                        <div className="text-[7px] text-muted-foreground leading-tight">
                          <span className="text-foreground/80 font-semibold">InterpretaciÃ³n:</span>
                          <br />
                          {activeResult.currentPrice > activeResult.pricePercentiles.p75
                            ? "Precio actual en zona alta (sobre P75) â€” posible resistencia"
                            : activeResult.currentPrice < activeResult.pricePercentiles.p25
                              ? "Precio actual en zona baja (bajo P25) â€” posible soporte"
                              : "Precio actual en rango medio histÃ³rico"}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* â”€â”€ Serie de precios full-width â”€â”€ */}
              <div className="glass p-4 w-full">
                <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                  Serie de precios Â· {activeResult.ticker}
                  <span className="ml-2 text-[13px] text-muted-foreground">
                    {activeResult.interval} / {activeResult.period}
                  </span>
                </div>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={activeResult.priceSeries}
                      margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id={`pg-${activeResult.ticker}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="date" tick={false} />
                      <YAxis domain={["auto", "auto"]} tick={false} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(v: number) => [fmtNum(v, 2), "Precio"]}
                        labelFormatter={(l: string) => l}
                      />
                      <Area
                        type="monotone"
                        dataKey="close"
                        stroke="var(--color-success)"
                        strokeWidth={1.5}
                        fill={`url(#pg-${activeResult.ticker})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-mono text-muted-foreground">
                  <span>
                    Actual:{" "}
                    <span className="text-foreground font-semibold">
                      ${fmtNum(activeResult.currentPrice, 2)}
                    </span>
                  </span>
                  <span>Muestras: {activeResult.count}</span>
                  <span>
                    Î¼ anual:{" "}
                    <span className="text-foreground/80">{fmtPct(activeResult.meanAnnual, 2)}</span>
                  </span>
                  <span>
                    Ïƒ anual:{" "}
                    <span className="text-foreground/80">
                      {fmtPct(activeResult.volatilityAnnual, 2)}
                    </span>
                  </span>
                  <span>
                    Sharpe:{" "}
                    <span className="text-foreground/80">
                      {fmtNum(activeResult.sharpeRatio, 2)}
                    </span>
                  </span>
                  <span>
                    VaR95%: <span className="text-danger">{fmtPct(activeResult.var95, 4)}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted-foreground/60">
                  <span>Mediana: {fmtPct(activeResult.median, 4)}</span>
                  <span>Moda: {fmtPct(activeResult.mode, 4)}</span>
                  <span>
                    Ïƒ por {activeResult.interval}:{" "}
                    {fmtPct(
                      activeResult.volatilityAnnual / Math.sqrt(activeResult.annualFactor),
                      4,
                    )}
                  </span>
                  <span className={activeResult.isNormal ? "text-success/70" : "text-danger/70"}>
                    {activeResult.isNormal ? "Normal" : "No Normal"}
                  </span>
                </div>
              </div>

              {/* â”€â”€ Dataframe de retornos â”€â”€ */}
              <div className="glass p-4 w-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                    DataFrame de retornos Â· {activeResult.ticker}
                    <span className="ml-2 text-[13px] text-muted-foreground/60 font-normal normal-case">
                      {activeResult.priceSeries.length} filas
                    </span>
                  </div>
                  <button
                    onClick={() => setShowRawReturns(!showRawReturns)}
                    className="text-[13px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showRawReturns ? "Ocultar" : "Mostrar todo"}
                  </button>
                </div>
                {showRawReturns && (
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="mono w-full text-[13px]">
                      <thead className="text-[13px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-background/95">
                        <tr className="border-b border-border/40">
                          <th className="px-2 py-1 text-left">#</th>
                          <th className="px-2 py-1 text-left">Fecha</th>
                          <th className="px-2 py-1 text-right">Precio</th>
                          <th className="px-2 py-1 text-right">Retorno diario</th>
                          <th className="px-2 py-1 text-right">Retorno acumulado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeResult.priceSeries.map((p, i) => {
                          const dailyRet =
                            i > 0 ? p.close / activeResult.priceSeries[i - 1].close - 1 : 0;
                          const cumRet = p.close / activeResult.priceSeries[0].close - 1;
                          return (
                            <tr
                              key={p.date}
                              className="border-b border-border/10 hover:bg-muted/10"
                            >
                              <td className="px-2 py-0.5 text-muted-foreground">{i}</td>
                              <td className="px-2 py-0.5">{p.date}</td>
                              <td className="px-2 py-0.5 text-right font-semibold">
                                ${fmtNum(p.close, 2)}
                              </td>
                              <td
                                className={`px-2 py-0.5 text-right ${dailyRet >= 0 ? "text-success" : "text-danger"}`}
                              >
                                {i > 0 ? fmtPct(dailyRet, 4) : "â€”"}
                              </td>
                              <td
                                className={`px-2 py-0.5 text-right ${cumRet >= 0 ? "text-success" : "text-danger"}`}
                              >
                                {fmtPct(cumRet, 4)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* â”€â”€ Tabla de mÃ©tricas â”€â”€ */}
          <div className="glass overflow-x-auto p-5 w-full">
            <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              MÃ©tricas de distribuciÃ³n
            </div>
            <table className="mono w-full min-w-[700px] text-[14px]">
              <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th
                    className="px-2 py-2 text-left cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("ticker")}
                  >
                    Ticker
                    <SortIcon col="ticker" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("currentPrice")}
                  >
                    Precio
                    <SortIcon col="currentPrice" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("meanAnnual")}
                  >
                    Î¼ anual
                    <SortIcon col="meanAnnual" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("volatilityAnnual")}
                  >
                    Ïƒ anual
                    <SortIcon col="volatilityAnnual" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("sharpeRatio")}
                  >
                    Sharpe
                    <SortIcon col="sharpeRatio" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("var95")}
                  >
                    VaR 95%
                    <SortIcon col="var95" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("skewness")}
                  >
                    Skew
                    <SortIcon col="skewness" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("kurtosis")}
                  >
                    Kurt
                    <SortIcon col="kurtosis" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("jbStat")}
                  >
                    JB
                    <SortIcon col="jbStat" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("pValue")}
                  >
                    p-val
                    <SortIcon col="pValue" />
                  </th>
                  <th
                    className="px-2 py-2 text-center cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("isNormal")}
                  >
                    Normal?
                    <SortIcon col="isNormal" />
                  </th>
                  <th
                    className="px-2 py-2 text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort("count")}
                  >
                    Muestras
                    <SortIcon col="count" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedResults?.map((r) => (
                  <tr
                    key={r.ticker}
                    className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-2 py-2 font-semibold text-primary">{r.ticker}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(r.currentPrice, 2)}</td>
                    <td
                      className={`px-2 py-2 text-right ${r.meanAnnual >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {fmtPct(r.meanAnnual)}
                    </td>
                    <td className="px-2 py-2 text-right">{fmtPct(r.volatilityAnnual)}</td>
                    <td
                      className={`px-2 py-2 text-right ${r.sharpeRatio >= 1 ? "text-success" : r.sharpeRatio < 0 ? "text-danger" : "text-warning"}`}
                    >
                      {fmtNum(r.sharpeRatio, 2)}
                    </td>
                    <td className="px-2 py-2 text-right text-danger">{fmtPct(r.var95)}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(r.skewness, 3)}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(r.kurtosis, 3)}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(r.jbStat, 2)}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(r.pValue, 4)}</td>
                    <td className="px-2 py-2 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[13px] ${r.isNormal ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
                      >
                        {r.isNormal ? "SÃ­" : "No"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* â”€â”€ Escenarios de inversiÃ³n â”€â”€ */}
          <div className="glass p-5 w-full">
            <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Escenarios de inversiÃ³n (por unidad)
            </div>
            <table className="mono w-full min-w-[600px] text-[14px]">
              <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-2 py-2 text-left">Ticker</th>
                  <th className="px-2 py-2 text-right">PÃ©rdida mÃ¡x.</th>
                  <th className="px-2 py-2 text-right">PÃ©rdida esperada</th>
                  <th className="px-2 py-2 text-right">Ganancia esperada</th>
                  <th className="px-2 py-2 text-right">Ganancia mÃ¡x.</th>
                  <th className="px-2 py-2 text-right">MÃ¡s probable</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.ticker}
                    className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-2 py-2 font-semibold text-primary">{r.ticker}</td>
                    <td className="px-2 py-2 text-right text-danger">{fmtNum(r.maxLoss, 2)}</td>
                    <td className="px-2 py-2 text-right text-danger">
                      {fmtNum(r.expectedLoss, 2)}
                    </td>
                    <td className="px-2 py-2 text-right text-success">
                      {fmtNum(r.expectedGain, 2)}
                    </td>
                    <td className="px-2 py-2 text-right text-success">{fmtNum(r.maxGain, 2)}</td>
                    <td className="px-2 py-2 text-right text-warning">
                      {fmtNum(r.mostProbable, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* â”€â”€ InterpretaciÃ³n de resultados â”€â”€ */}
          {activeResult && (
            <div className="glass p-4 w-full">
              <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                InterpretaciÃ³n Â· {activeResult.ticker}
              </div>
              <div className="space-y-2 text-[13px] text-muted-foreground/80 leading-relaxed">
                {histogramMode === "returns" ? (
                  <>
                    <p>
                      <span className="text-foreground font-semibold">
                        Media anual (Î¼={fmtPct(activeResult.meanAnnual, 2)}):
                      </span>{" "}
                      Retorno promedio anualizado. Î¼&gt;0 = tendencia alcista. Î¼&lt;0 = tendencia
                      bajista. Por perÃ­odo:{" "}
                      {fmtPct(activeResult.meanAnnual / activeResult.annualFactor, 4)}.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        Mediana (Mdn={fmtPct(activeResult.median, 4)}):
                      </span>{" "}
                      Retorno tÃ­pico que divide los datos en dos mitades. Si Mdn &lt; Î¼:
                      distribuciÃ³n con sesgo positivo (colas derechas largas). Si Mdn &gt; Î¼: sesgo
                      negativo.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        Moda ({fmtPct(activeResult.mode, 4)}):
                      </span>{" "}
                      Retorno mÃ¡s frecuente. Cercana a 0 â†’ el activo pasa la mayor parte del tiempo
                      lateral/sin tendencia clara.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        Volatilidad anual (Ïƒ={fmtPct(activeResult.volatilityAnnual, 2)}):
                      </span>{" "}
                      Riesgo total anualizado. Mayor Ïƒ = mayor dispersiÃ³n de retornos. Por perÃ­odo:{" "}
                      {fmtPct(
                        activeResult.volatilityAnnual / Math.sqrt(activeResult.annualFactor),
                        4,
                      )}
                      .
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        VaR 95% ({fmtPct(activeResult.var95, 4)}):
                      </span>{" "}
                      PÃ©rdida mÃ¡xima esperada por perÃ­odo con 95% confianza. Hay 5% de probabilidad
                      de perder MÃS que esto. En dÃ³lares: ~${fmtNum(activeResult.maxLoss, 2)}
                      /unidad.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        Sharpe ({fmtNum(activeResult.sharpeRatio, 2)}):
                      </span>{" "}
                      Retorno ajustado por riesgo (rf=0%). &gt;1: bueno. &gt;2: excelente. Negativo:
                      el activo no compensa su riesgo.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">Percentiles P5-P95:</span>{" "}
                      Rango del 90% central de retornos. P5={fmtPct(activeResult.percentiles.p5, 4)}{" "}
                      al P95={fmtPct(activeResult.percentiles.p95, 4)}. MÃ¡s angosto = menos volÃ¡til.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">Tipo de distribuciÃ³n:</span>{" "}
                      {activeResult.isNormal
                        ? "Normal (Gaussiana) â€” eventos extremos dentro de lo esperado. EstadÃ­stica paramÃ©trica aplicable."
                        : "No Normal â€” hay colas pesadas (eventos extremos mÃ¡s probables que en Gaussiana). Usar VaR histÃ³rico, no paramÃ©trico."}
                    </p>
                    <p className="text-[12px] text-muted-foreground/40 pt-1">
                      Intervalo: {activeResult.interval} Â· PerÃ­odo: {activeResult.period} Â·{" "}
                      {activeResult.count} muestras
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <span className="text-foreground font-semibold">
                        Precio actual (${fmtNum(activeResult.currentPrice, 2)}):
                      </span>{" "}
                      Ãšltimo precio disponible. SegÃºn el percentil donde se ubique, indica si estÃ¡
                      en zona de soporte o resistencia histÃ³rica.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        Precio medio (Î¼=${fmtNum(activeResult.priceMean, 2)}):
                      </span>{" "}
                      Promedio simple de todos los precios de cierre en el perÃ­odo. Referencia de
                      valor justo histÃ³rico.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        Precio mediano (Mdn=${fmtNum(activeResult.priceMedian, 2)}):
                      </span>{" "}
                      Precio que divide la historia en dos mitades. Si el actual estÃ¡ muy por
                      encima, el activo estÃ¡ caro vs su historia.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        Precio modal (${fmtNum(activeResult.priceMode, 2)}):
                      </span>{" "}
                      Precio mÃ¡s frecuente en el perÃ­odo. Zona de mayor actividad o consolidaciÃ³n.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        DesviaciÃ³n Ïƒ=${fmtNum(activeResult.priceStd, 2)} (
                        {fmtPct(activeResult.priceStd / activeResult.priceMean, 1)}%):
                      </span>{" "}
                      DispersiÃ³n de precios alrededor de la media. Baja Ïƒ% indica precio estable;
                      alta Ïƒ% indica alta variabilidad.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        Soporte P5 (${fmtNum(activeResult.pricePercentiles.p5, 2)}):
                      </span>{" "}
                      Solo el 5% de las veces el precio cerrÃ³ por debajo de este nivel. Zona de
                      soporte fuerte.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        Resistencia P95 (${fmtNum(activeResult.pricePercentiles.p95, 2)}):
                      </span>{" "}
                      Solo el 5% de las veces el precio superÃ³ este nivel. Zona de resistencia
                      fuerte.
                    </p>
                    <p>
                      <span className="text-foreground font-semibold">
                        PosiciÃ³n actual vs histÃ³rico:
                      </span>{" "}
                      {activeResult.currentPrice > activeResult.pricePercentiles.p75
                        ? "Precio en cuartil superior (zona cara) â€” posible sobrecompra o tendencia alcista fuerte."
                        : activeResult.currentPrice < activeResult.pricePercentiles.p25
                          ? "Precio en cuartil inferior (zona barata) â€” posible soporte o tendencia bajista."
                          : "Precio en rango intercuartil (zona neutral) â€” dentro de los rangos histÃ³ricos normales."}
                    </p>
                    <p className="text-[12px] text-muted-foreground/40 pt-1">
                      Intervalo: {activeResult.interval} Â· PerÃ­odo: {activeResult.period} Â·{" "}
                      {activeResult.count} muestras
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* â”€â”€ ComparaciÃ³n de mÃ©tricas â”€â”€ */}
          {chartData && (
            <div className="glass p-5 w-full">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                  Comparación de métricas
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPMode("classic")}
                    className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
                      pMode === "classic"
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    p=2 clásico
                  </button>
                  <button
                    onClick={() => setPMode("implied")}
                    className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
                      pMode === "implied"
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    p=implied (1/H)
                  </button>
                </div>
              </div>
              <div className="mono mb-2 text-[11px] text-muted-foreground">
                {pMode === "classic" ? "Sharpe clásico (p=2, varianza)" : "Sharpe_p (Labadie §3.2, p=1/H, computePVariance en riesgo.functions)"}
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="ticker" tick={AXIS_TICK_LG} />
                    <YAxis tick={AXIS_TICK} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE_LG} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="Retorno anual"
                      fill="var(--color-success)"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar dataKey="Volatilidad" fill="var(--color-warning)" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Sharpe" fill="var(--color-primary)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* â”€â”€ VaR 95% y extremos â”€â”€ */}
          {results.length >= 2 && chartData && (
            <div className="glass p-5 w-full">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                VaR 95% y extremos
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="ticker" tick={AXIS_TICK_LG} />
                    <YAxis tick={AXIS_TICK} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE_LG} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="VaR 95%" fill="var(--color-danger)" radius={[2, 2, 0, 0]} />
                    <Bar
                      dataKey="Skewness"
                      fill="var(--color-chart-purple, #a855f7)"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="Kurtosis"
                      fill="var(--color-chart-orange, #f97316)"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function rangoToPeriod(rango: string): string {
  const map: Record<string, string> = {
    "1M": "1mo",
    "3M": "3mo",
    "6M": "6mo",
    "1A": "1y",
    "2A": "2y",
    "5A": "5y",
  };
  return map[rango] ?? "2y";
}

function RiesgoManual({
  accessToken,
  refreshToken,
  updateTokens,
}: {
  accessToken: string | null;
  refreshToken: string | null;
  updateTokens: (t: string, rt: string) => void;
}) {
  const fn = useServerFn(getRiesgoAnalysis);
  const [tickerInput, setTickerInput] = useState("AAPL, MSFT, NVDA");
  const [results, setResults] = useState<DistribStats[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedInterval, setSelectedInterval] = useState("1d");
  const [selectedPeriod, setSelectedPeriod] = useState("2y");
  const [histogramMode, setHistogramMode] = useState<"returns" | "price">("returns");
  const [riesgoSource, setRiesgoSource] = useState<"yahoo" | "iol">("yahoo");
  const [riesgoMercado, setRiesgoMercado] = useState("BCBA");
  const [riesgoPValue, setRiesgoPValue] = useState(2); // â”€â”€â”€ Labadie Â§3.2: p-variance â”€â”€â”€
  const prevIntervalRef = useRef(selectedInterval);
  const prevPeriodRef = useRef(selectedPeriod);
  const isIOLSource = riesgoSource === "iol";

  const runAnalysis = useCallback(
    async (tickers: string[], interval: string, period: string) => {
      setLoading(true);
      setError("");
      try {
        const data = await fn({
          data: {
            tickers,
            interval,
            period,
            source: riesgoSource,
            token: riesgoSource === "iol" ? accessToken : null,
            refreshToken: riesgoSource === "iol" ? refreshToken : null,
            mercado: riesgoSource === "iol" ? riesgoMercado : undefined,
            pValue: riesgoPValue,
          },
        });
        setResults(data);
        if (data.length > 0)
          setSelectedTicker((prev) =>
            prev && data.find((r) => r.ticker === prev) ? prev : data[0].ticker,
          );
        if (data.length === 0)
          setError(
            `Sin datos (${tickers.length} tickers, ${interval}, ${period}). ${riesgoSource === "iol" ? "IOL" : "Yahoo Finance"} puede estar temporalmente no disponible.`,
          );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [fn, riesgoSource, riesgoMercado, accessToken, refreshToken],
  );

  const handleAnalyze = useCallback(
    async (interval?: string, period?: string) => {
      const tickers = tickerInput
        .split(/[\s,]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      if (tickers.length === 0) return;
      await runAnalysis(tickers, interval ?? selectedInterval, period ?? selectedPeriod);
    },
    [tickerInput, selectedInterval, selectedPeriod, runAnalysis],
  );

  useEffect(() => {
    if (!results || results.length === 0) return;
    if (prevIntervalRef.current === selectedInterval && prevPeriodRef.current === selectedPeriod)
      return;
    prevIntervalRef.current = selectedInterval;
    prevPeriodRef.current = selectedPeriod;
    handleAnalyze(selectedInterval, selectedPeriod);
  }, [selectedInterval, selectedPeriod, results, handleAnalyze]);

  // IOL solo soporta intervalo diario
  useEffect(() => {
    if (riesgoSource === "iol" && selectedInterval !== "1d") {
      setSelectedInterval("1d");
    }
  }, [riesgoSource, selectedInterval]);

  return (
    <div className="w-full space-y-4">
      {/* Input row */}
      <div className="flex items-start gap-3 w-full">
        <div className="flex-1 min-w-0">
          <MarketDataInput
            showChart={false}
            showQuoteCard={false}
            defaultSource="yahoo"
            defaultTicker={tickerInput}
            defaultToken={accessToken}
            defaultRefreshToken={refreshToken}
            onTokenRefresh={updateTokens}
            onTickerChange={setTickerInput}
            onRangoChange={(rango) => setSelectedPeriod(rangoToPeriod(rango))}
            onIntervaloChange={(iv) => {
              setSelectedInterval(iv);
              const maxDays = INTERVAL_MAP[iv]?.maxDays ?? 99999;
              if (periodToDays(selectedPeriod) > maxDays) {
                const valid = VALID_PERIODS.filter((p) => periodToDays(p) <= maxDays);
                setSelectedPeriod(valid[valid.length - 1] ?? "1y");
              }
            }}
            onSourceChange={(src) => setRiesgoSource(src)}
            onMercadoChange={(mkt) => setRiesgoMercado(mkt)}
            onAnalyze={(ticker, rango) => {
              setTickerInput(ticker);
              const tickers = ticker
                .split(/[\s,]+/)
                .map((t) => t.trim().toUpperCase())
                .filter(Boolean);
              if (tickers.length > 0) runAnalysis(tickers, selectedInterval, rangoToPeriod(rango));
            }}
          />
        </div>
        <Button
          onClick={() => handleAnalyze()}
          disabled={loading || !tickerInput.trim()}
          className="h-9 px-5 bg-primary text-primary-foreground font-semibold hover:bg-primary/80 disabled:opacity-40 text-xs shrink-0 mt-0.5"
        >
          {loading ? "Analizando..." : "Analizar"}
        </Button>
        {error && (
          <div className="p-2 rounded-md bg-danger/10 border border-danger/30 max-w-xs shrink-0 mt-0.5">
            <p className="text-danger text-[13px]">{error}</p>
          </div>
        )}
      </div>

      {/* Config row: intervalo, perÃ­odo y p-value (Labadie) */}
      {!isIOLSource && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-mono text-muted-foreground uppercase">Intervalo</span>
            <select
              value={selectedInterval}
              onChange={(e) => {
                const iv = e.target.value;
                setSelectedInterval(iv);
                const maxDays = INTERVAL_MAP[iv]?.maxDays ?? 99999;
                if (periodToDays(selectedPeriod) > maxDays) {
                  const valid = VALID_PERIODS.filter((p) => periodToDays(p) <= maxDays);
                  setSelectedPeriod(valid[valid.length - 1] ?? "1y");
                }
              }}
              className="h-7 px-2 text-[13px] font-mono rounded border border-border/40 bg-background text-foreground"
            >
              {VALID_INTERVALS.map((iv) => (
                <option key={iv} value={iv}>
                  {iv}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-mono text-muted-foreground uppercase">PerÃ­odo</span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="h-7 px-2 text-[13px] font-mono rounded border border-border/40 bg-background text-foreground"
            >
              {VALID_PERIODS.filter((p) => {
                const maxDays = INTERVAL_MAP[selectedInterval]?.maxDays ?? 99999;
                return periodToDays(p) <= maxDays;
              }).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[13px] font-mono text-muted-foreground uppercase">p (riesgo)</span>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={1.1}
                max={4}
                step={0.1}
                value={riesgoPValue}
                onChange={(e) => setRiesgoPValue(parseFloat(e.target.value))}
                className="w-16 accent-primary"
              />
              <span className="text-[13px] font-mono text-muted-foreground w-6 text-right">
                {riesgoPValue.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      )}
      {/* Modo: solo despuÃ©s de cargar resultados */}
      {results && results.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[13px] font-mono text-muted-foreground uppercase">Modo</span>
          <div className="flex rounded border border-border/40 overflow-hidden">
            <button
              onClick={() => setHistogramMode("returns")}
              className={`px-2 py-1 text-[13px] font-mono transition-colors ${histogramMode === "returns" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
            >
              Retornos
            </button>
            <button
              onClick={() => setHistogramMode("price")}
              className={`px-2 py-1 text-[13px] font-mono transition-colors ${histogramMode === "price" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
            >
              Precio
            </button>
          </div>
        </div>
      )}

      <RiesgoResultPanel
        results={results}
        loading={loading}
        error={error}
        selectedTicker={selectedTicker}
        setSelectedTicker={setSelectedTicker}
        histogramMode={histogramMode}
      />
    </div>
  );
}

function RiesgoPortafolioIOL() {
  const fnSemaforoBatch = useServerFn(getSemaforoBatch);
  const iol = useIOLPortafolio();
  const navigate = useNavigate({ from: Route.id });
  const [tickers, setTickers] = useState<string[]>([]);
  const [semafotos, setSemafotos] = useState<SemaforoResult[] | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [error, setError] = useState("");

  const [tickerInput, setTickerInput] = useState("");

  const runBatchAnalysis = useCallback(
    async (syms: string[]) => {
      if (syms.length === 0) return;
      setLoadingPortfolio(true);
      setError("");
      try {
        const results = await fnSemaforoBatch({ data: { tickers: syms } });
        setSemafotos(results);
        if (results.length === 0)
          setError("Sin datos t\u00E9cnicos para los activos del portafolio.");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingPortfolio(false);
      }
    },
    [fnSemaforoBatch],
  );

  const loadPortfolio = useCallback(
    async (cliente?: number) => {
      setLoadingPortfolio(true);
      setError("");
      setSemafotos(null);
      setTickers([]);
      try {
        const activos = await iol.loadPortfolio(cliente);
        const syms = activos.map((a: any) => a.titulo?.simbolo).filter(Boolean);
        setTickers(syms);
        if (syms.length > 0) {
          await runBatchAnalysis(syms);
        } else {
          setError("El portafolio no contiene activos.");
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingPortfolio(false);
      }
    },
    [iol, runBatchAnalysis],
  );

  const handleAnalyze = async () => {
    if (iol.esAsesor === null) await iol.loadClientes();
    if (iol.esAsesor && iol.clienteId) await loadPortfolio(iol.clienteId);
    else if (iol.esAsesor === false) await loadPortfolio();
  };

  const handleManualAnalyze = async () => {
    const syms = tickerInput
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (syms.length > 0) {
      setTickers(syms);
      await runBatchAnalysis(syms);
    }
  };

  useEffect(() => {
    if (iol.accessToken && iol.esAsesor === null) iol.loadClientes();
  }, [iol.accessToken, iol.esAsesor, iol.loadClientes]);

  if (!iol.accessToken) {
    return (
      <div className="glass flex min-h-[200px] items-center justify-center p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Inici\u00E1 sesi\u00F3n en IOL desde el panel superior para ver el portafolio.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Manual input row */}
      <div className="flex items-start gap-3 w-full">
        <div className="flex-1 min-w-0">
          <MarketDataInput
            showChart={false}
            showQuoteCard={false}
            defaultSource="yahoo"
            defaultTicker={tickerInput}
            defaultToken={iol.accessToken}
            defaultRefreshToken={iol.refreshToken}
            onTokenRefresh={iol.updateTokens}
            onTickerChange={setTickerInput}
          />
        </div>
        <Button
          onClick={handleManualAnalyze}
          disabled={loadingPortfolio || !tickerInput.trim()}
          className="h-9 px-5 bg-primary text-primary-foreground font-semibold hover:bg-primary/80 disabled:opacity-40 text-xs shrink-0 mt-0.5"
        >
          {loadingPortfolio ? "Analizando..." : "Analizar"}
        </Button>
      </div>

      {iol.loading && (
        <div className="glass p-4 text-center text-xs text-muted-foreground">
          Verificando tipo de cuenta...
        </div>
      )}

      {/* Client selector + button */}
      <div className="flex flex-wrap items-end gap-3 w-full">
        {iol.esAsesor && iol.clientes.length > 0 && (
          <div className="glass p-3 min-w-[280px] flex-1">
            <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Seleccionar Cliente
            </div>
            <select
              value={iol.clienteId}
              onChange={(e) => {
                const id = Number(e.target.value);
                iol.setClienteId(id);
                if (id) loadPortfolio(id);
              }}
              className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
            >
              <option value={0}>Seleccionar cliente...</option>
              {iol.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.apellido} \u2014 ${c.totalCuentaValorizado?.toLocaleString() ?? 0}
                </option>
              ))}
            </select>
          </div>
        )}

        {!iol.esAsesor && !iol.loading && (
          <div className="glass p-3 flex-1">
            <div className="text-xs text-muted-foreground">
              Cuenta particular \u2014 se usar\u00E1 tu portafolio (solo CEDEARs y acciones).
            </div>
          </div>
        )}

        <Button
          onClick={handleAnalyze}
          disabled={loadingPortfolio || (iol.esAsesor === true && !iol.clienteId)}
          className="bg-primary text-primary-foreground font-semibold hover:bg-primary/80 disabled:opacity-40 h-9 px-4"
        >
          {loadingPortfolio
            ? "Cargando portafolio..."
            : iol.esAsesor
              ? "Analizar portafolio del cliente"
              : "Analizar mi portafolio"}
        </Button>
      </div>

      {tickers.length > 0 && (
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
            Activos ({tickers.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {tickers.map((t) => (
              <span
                key={t}
                className="font-mono text-[13px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-md bg-danger/10 border border-danger/30">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {/* Resultados: reutiliza getSemaforoBatch + SemaforoCard del tab An\u00E1lisis T\u00E9cnico */}
      {loadingPortfolio && (
        <div className="glass p-6 text-center text-xs text-muted-foreground">
          Analizando activos...
        </div>
      )}

      {semafotos && semafotos.length > 0 && (
        <div className="space-y-4">
          {semafotos.map((s) => (
            <SemaforoCard
              key={s.ticker}
              data={s}
              onNavigateToFundamental={(ticker) => {
                navigate({ search: { tab: "herramientas", subTab: "fundamental", ticker } });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}


