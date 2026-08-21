// @ts-nocheck
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCAPMAnalysis, getMatrizCAPM, AUTO_BENCHMARKS,
  type CAPMResult,
  type MatrizCAPMResult,
} from "@/lib/herramientas/capm.functions";
import { getIOLCapm,
  type IOLCapmResult,
} from "@/lib/iol-portfolio.functions";
import { useIOLPortafolio } from "@/lib/use-iol-portafolio";
import { useIOLSession } from "@/lib/iol-context";
import { CHART_TOOLTIP_STYLE, AXIS_TICK, AXIS_TICK_LG, GRID_STROKE } from "@/components/herramientas/shared/chart-constants";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import sectores from "@/lib/sectores.json";
import { SectorPerformanceBars } from "@/components/sectores/SectorPerformanceBars";
import {
  getSectorDailyPerformance,
  type SectorDailyPerf,
} from "@/lib/herramientas/sector-performance.functions";
import { OptimizadorTabs } from "./OptimizadorTabs";
import type { TickerItem } from "./OptimizadorTabs";

function CapmPage() {
  const fn = useServerFn(getCAPMAnalysis);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [tickerInput, setTickerInput] = useState("AAPL, MSFT, NVDA");
  const [benchmarkInput, setBenchmarkInput] = useState("SPY, QQQ");
  const [autoDetect, setAutoDetect] = useState(false);
  const [capmTab, setCapmTab] = useState("");
  const [results, setResults] = useState<CAPMResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [source, setSource] = useState<"yahoo" | "iol">("yahoo");
  const [mercadoIOL, setMercadoIOL] = useState("NYSE");
  const { accessToken, refreshToken, updateTokens } = useIOLSession();
  const autoRan = useRef(false);

  // Load tickers from optimizer navigation
  useEffect(() => {
    const stored = localStorage.getItem("capm_tickers");
    if (stored) {
      localStorage.removeItem("capm_tickers");
      try {
        const tickers = JSON.parse(stored);
        if (Array.isArray(tickers) && tickers.length > 0) {
          setTickerInput(tickers.join(", "));
          autoRan.current = true;
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const activeBenchmarks = useMemo(() => {
    return benchmarkInput
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
  }, [benchmarkInput]);

  const tickerCurrency = useMemo(() => {
    if (source === "yahoo") return "USD";
    return mercadoIOL === "BCBA" ? "ARS" : "USD";
  }, [source, mercadoIOL]);
  const benchmarkCurrency = "USD";
  const currencyMismatch = tickerCurrency !== benchmarkCurrency;

  const sectorList = useMemo(() => Object.keys(sectores).sort(), []);
  const industryList = useMemo(() => {
    if (!sectorFilter) return [];
    const data = (sectores as Record<string, Record<string, TickerItem[]>>)[sectorFilter];
    return data ? Object.keys(data).sort() : [];
  }, [sectorFilter]);
  const tickersFromFilter = useMemo(() => {
    if (!sectorFilter || !industryFilter) return [];
    const data = (sectores as Record<string, Record<string, TickerItem[]>>)[sectorFilter];
    return data?.[industryFilter] ?? [];
  }, [sectorFilter, industryFilter]);

  const activeTickers = useMemo(() => {
    const manual = tickerInput
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    return [...new Set(manual)];
  }, [tickerInput]);

  const handleRun = async () => {
    const tickers = activeTickers.filter((t) => !activeBenchmarks.includes(t));
    if (tickers.length === 0 || (activeBenchmarks.length === 0 && !autoDetect)) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const data = await fn({
        data: {
          tickers,
          benchmarks: autoDetect ? [] : activeBenchmarks,
          autoDetect,
          source,
          token: source === "iol" ? accessToken : null,
          refreshToken: source === "iol" ? refreshToken : null,
          mercadoIOL: source === "iol" ? mercadoIOL : undefined,
        },
      });
      setResults(data);
      if (data.length === 0) setError("No se pudieron obtener datos.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run when tickers are loaded from optimizer navigation
  useEffect(() => {
    if (autoRan.current && activeTickers.length >= 2) {
      autoRan.current = false;
      handleRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTickers.length]);

  return (
    <div className="space-y-4">
      <div className="mono text-[14px] uppercase tracking-[0.22em] text-primary/80">
        CAPM Â· Alpha, Beta y correlaciÃ³n vs benchmark
      </div>
      <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
        RegresiÃ³n lineal de activos contra uno o mÃºltiples Ã­ndices de referencia.
      </h2>

      <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="glass min-w-0 p-4 space-y-3">
            <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Datos de mercado
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setSource("yahoo")}
                className={`flex-1 text-[13px] font-mono px-2.5 py-1 rounded-md border transition-colors ${
                  source === "yahoo"
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                Yahoo Finance
              </button>
              <button
                onClick={() => setSource("iol")}
                className={`flex-1 text-[13px] font-mono px-2.5 py-1 rounded-md border transition-colors ${
                  source === "iol"
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                } ${mounted && accessToken ? "" : "opacity-40 cursor-not-allowed"}`}
                disabled={!mounted || !accessToken}
              >
                IOL {!mounted || !accessToken ? "(sin sesiÃ³n)" : ""}
              </button>
            </div>
            {source === "iol" && (
              <select
                value={mercadoIOL}
                onChange={(e) => setMercadoIOL(e.target.value)}
                className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
              >
                <option value="NYSE">NYSE</option>
                <option value="NASDAQ">NASDAQ</option>
                <option value="bCBA">BCBA</option>
              </select>
            )}
            {currencyMismatch && (
              <div className="p-2 rounded-md bg-warning/10 border border-warning/30">
                <p className="text-warning text-[14px]">
                  Los activos estÃ¡n en <strong>{tickerCurrency}</strong> pero el benchmark es en{" "}
                  <strong>{benchmarkCurrency}</strong>. No se pueden comparar directo.
                </p>
              </div>
            )}
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="AAPL, MSFT, NVDA..."
              className="w-full bg-background/40 border border-border/60 text-foreground text-sm rounded-md px-3 py-2 focus:border-primary outline-none font-mono"
            />
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setAutoDetect(!autoDetect)}
                className={`flex-1 text-[14px] font-mono px-3 py-1.5 rounded-md border transition-colors ${
                  autoDetect
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {autoDetect ? "Auto â—†" : "Auto â—‡"}
              </button>
              {autoDetect && (
                <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
                  <p className="text-[13px] text-muted-foreground">
                    Auto-detecting best benchmark (mayor RÂ² promedio) de {AUTO_BENCHMARKS.length}{" "}
                    factores
                  </p>
                </div>
              )}
            </div>
            {!autoDetect && (
              <>
                <div>
                  <div className="mono mb-1 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                    Benchmark(s){" "}
                    <span className="text-[13px] text-muted-foreground/60">(Yahoo Finance)</span>
                  </div>
                  <input
                    value={benchmarkInput}
                    onChange={(e) => setBenchmarkInput(e.target.value)}
                    placeholder="SPY, QQQ, IWM..."
                    className="w-full bg-background/40 border border-border/60 text-foreground text-sm rounded-md px-3 py-2 focus:border-primary outline-none font-mono"
                  />
                </div>
                <details className="[&>summary]:cursor-pointer">
                  <summary className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground/70 select-none mb-2">
                    Benchmarks sugeridos
                  </summary>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "SPY",
                      "QQQ",
                      "IWM",
                      "DIA",
                      "^MERV",
                      "^GSPC",
                      "^IXIC",
                      "EEM",
                      "^VIX",
                      "GLD",
                      "TLT",
                      "XLF",
                    ].map((b) => {
                      const active = activeBenchmarks.includes(b);
                      return (
                        <button
                          key={b}
                          onClick={() => {
                            const current = benchmarkInput
                              .split(/[\s,]+/)
                              .map((x) => x.trim().toUpperCase())
                              .filter(Boolean);
                            setBenchmarkInput(
                              active
                                ? current.filter((x) => x !== b).join(", ")
                                : [...current, b].join(", "),
                            );
                          }}
                          className={`font-mono text-[13px] px-2 py-1 rounded-md border transition-colors ${
                            active
                              ? "border-primary/50 bg-primary/15 text-foreground"
                              : "border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {b}
                        </button>
                      );
                    })}
                  </div>
                </details>
              </>
            )}
          </div>

          <details className="glass min-w-0 [&>summary]:cursor-pointer">
            <summary className="mono px-5 py-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground select-none">
              Agregar por sector / industria
            </summary>
            <div className="border-t border-border/40 px-5 pb-5 pt-3 space-y-3">
              <select
                value={sectorFilter}
                onChange={(e) => {
                  setSectorFilter(e.target.value);
                  setIndustryFilter("");
                }}
                className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
              >
                <option value="">Seleccionar sector</option>
                {sectorList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {sectorFilter && industryList.length > 0 && (
                <select
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                  className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
                >
                  <option value="">Seleccionar industria</option>
                  {industryList.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              )}
              {industryFilter && tickersFromFilter.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tickersFromFilter.map((t) => {
                    const added = activeTickers.includes(t.ticker);
                    return (
                      <button
                        key={t.ticker}
                        onClick={() => {
                          const current = tickerInput
                            .split(/[\s,]+/)
                            .map((x) => x.trim().toUpperCase())
                            .filter(Boolean);
                          if (added) {
                            setTickerInput(current.filter((x) => x !== t.ticker).join(", "));
                          } else {
                            setTickerInput([...current, t.ticker].join(", "));
                          }
                        }}
                        className={`font-mono text-[14px] px-2 py-1 rounded-md border transition-colors ${
                          added
                            ? "border-primary/50 bg-primary/15 text-foreground"
                            : "border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.ticker}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </details>

          <button
            onClick={handleRun}
            disabled={
              loading || activeTickers.length < 1 || (!autoDetect && activeBenchmarks.length < 1)
            }
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? "Calculando..."
              : autoDetect
                ? "Auto-detectar mejor benchmark"
                : "Calcular CAPM"}
          </button>
          {error && (
            <div className="p-3 rounded-md bg-danger/10 border border-danger/30">
              <p className="text-danger text-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!results && !loading && !error && (
            <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
              <p className="text-sm text-muted-foreground">
                IngresÃ¡ activos y un benchmark para calcular CAPM.
              </p>
            </div>
          )}

          {loading && (
            <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
              <p className="text-sm text-muted-foreground">Calculando regresiones...</p>
            </div>
          )}

          {results &&
            results.length > 0 &&
            (() => {
              if (autoDetect) {
                const valid = results.filter((r) => r.observations > 0);
                const noData = results.filter((r) => r.observations === 0);
                const bestOverall = valid.length > 0 ? valid[0]?.bestAvgR2 : undefined;
                return (
                  <div className="glass overflow-x-auto p-5">
                    {bestOverall != null && (
                      <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 p-2 text-[13px] font-mono text-muted-foreground">
                        Mejor benchmark global:{" "}
                        <span className="text-foreground font-semibold">
                          {valid[0]?.benchmarkLabel ?? "N/A"}
                        </span>{" "}
                        (RÂ² promedio: {(bestOverall * 100).toFixed(1)}%)
                      </div>
                    )}
                    <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                      Mejor benchmark auto-detectado para cada activo
                    </div>
                    <table className="mono w-full text-[14px]">
                      <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                        <tr className="border-b border-border/60">
                          <th className="px-2 py-2 text-left">Activo</th>
                          <th className="px-2 py-2 text-left">Mejor Benchmark</th>
                          <th className="px-2 py-2 text-right">Alpha</th>
                          <th className="px-2 py-2 text-right">Î± anual</th>
                          <th className="px-2 py-2 text-right">Beta</th>
                          <th className="px-2 py-2 text-right">RÂ²</th>
                          <th className="px-2 py-2 text-right">Corr</th>
                          <th className="px-2 py-2 text-right">p-value</th>
                          <th className="px-2 py-2 text-right">Std Err</th>
                          <th className="px-2 py-2 text-right">Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {valid.map((r) => (
                          <tr
                            key={r.ticker}
                            className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                          >
                            <td className="px-2 py-2 font-semibold text-primary">{r.ticker}</td>
                            <td className="px-2 py-2 text-left font-mono text-[13px] text-warning">
                              {r.benchmarkLabel}
                            </td>
                            <td
                              className={`px-2 py-2 text-right ${(r.alpha ?? 0) > 0 ? "text-success" : (r.alpha ?? 0) < 0 ? "text-danger" : ""}`}
                            >
                              {(r.alpha ?? 0).toFixed(4)}
                            </td>
                            <td
                              className={`px-2 py-2 text-right ${(r.annualizedAlpha ?? 0) > 0 ? "text-success" : (r.annualizedAlpha ?? 0) < 0 ? "text-danger" : ""}`}
                            >
                              {(r.annualizedAlpha ?? 0).toFixed(4)}
                            </td>
                            <td
                              className={`px-2 py-2 text-right ${(r.beta ?? 1) > 1 ? "text-warning" : (r.beta ?? 1) < 1 ? "text-success" : ""}`}
                            >
                              {(r.beta ?? 0).toFixed(4)}
                            </td>
                            <td className="px-2 py-2 text-right">{(r.rSquared ?? 0).toFixed(4)}</td>
                            <td className="px-2 py-2 text-right">
                              {(r.correlation ?? 0).toFixed(4)}
                            </td>
                            <td
                              className={`px-2 py-2 text-right ${(r.pValue ?? 1) < 0.05 ? "text-success" : "text-muted-foreground"}`}
                            >
                              {(r.pValue ?? 1).toFixed(4)}
                            </td>
                            <td className="px-2 py-2 text-right text-muted-foreground">
                              {(r.stdErr ?? 0).toFixed(4)}
                            </td>
                            <td className="px-2 py-2 text-right text-muted-foreground">
                              {r.observations}
                            </td>
                          </tr>
                        ))}
                        {noData.map((r) => (
                          <tr
                            key={r.ticker + "_no"}
                            className="border-b border-border/30 last:border-0 hover:bg-muted/20 opacity-40"
                          >
                            <td className="px-2 py-2 font-semibold">{r.ticker}</td>
                            <td
                              className="px-2 py-2 text-left text-[13px] text-muted-foreground"
                              colSpan={9}
                            >
                              Sin datos
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {valid.length > 0 && (
                      <div className="mt-4 h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={valid.map((r) => ({ ticker: r.ticker, Beta: r.beta ?? 0 }))}
                            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                            <XAxis dataKey="ticker" tick={AXIS_TICK_LG} />
                            <YAxis tick={AXIS_TICK} />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            <Bar dataKey="Beta" fill="var(--color-success)" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              }

              const benchLabels = [...new Set(results.map((r) => r.benchmarkLabel ?? ""))].filter(
                Boolean,
              );
              const active = capmTab || benchLabels[0] || "";
              if (!active || benchLabels.length === 0) return null;

              const tabEl = (label: string) => {
                const bmResults = results.filter((r) => r.benchmarkLabel === label);
                if (bmResults.length === 0) return null;

                return (
                  <div className="glass overflow-x-auto p-5">
                    <table className="mono w-full text-[14px]">
                      <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                        <tr className="border-b border-border/60">
                          <th className="px-2 py-2 text-left">Activo</th>
                          <th className="px-2 py-2 text-right">Alpha</th>
                          <th className="px-2 py-2 text-right">Î± anual</th>
                          <th className="px-2 py-2 text-right">Beta</th>
                          <th className="px-2 py-2 text-right">RÂ²</th>
                          <th className="px-2 py-2 text-right">Corr</th>
                          <th className="px-2 py-2 text-right">p-value</th>
                          <th className="px-2 py-2 text-right">Std Err</th>
                          <th className="px-2 py-2 text-right">Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bmResults
                          .filter((r) => r.observations > 0)
                          .map((r) => (
                            <tr
                              key={r.ticker + label}
                              className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                            >
                              <td className="px-2 py-2 font-semibold text-primary">{r.ticker}</td>
                              <td
                                className={`px-2 py-2 text-right ${(r.alpha ?? 0) > 0 ? "text-success" : (r.alpha ?? 0) < 0 ? "text-danger" : ""}`}
                              >
                                {(r.alpha ?? 0).toFixed(4)}
                              </td>
                              <td
                                className={`px-2 py-2 text-right ${(r.annualizedAlpha ?? 0) > 0 ? "text-success" : (r.annualizedAlpha ?? 0) < 0 ? "text-danger" : ""}`}
                              >
                                {(r.annualizedAlpha ?? 0).toFixed(4)}
                              </td>
                              <td
                                className={`px-2 py-2 text-right ${(r.beta ?? 1) > 1 ? "text-warning" : (r.beta ?? 1) < 1 ? "text-success" : ""}`}
                              >
                                {(r.beta ?? 0).toFixed(4)}
                              </td>
                              <td className="px-2 py-2 text-right">
                                {(r.rSquared ?? 0).toFixed(4)}
                              </td>
                              <td className="px-2 py-2 text-right">
                                {(r.correlation ?? 0).toFixed(4)}
                              </td>
                              <td
                                className={`px-2 py-2 text-right ${(r.pValue ?? 1) < 0.05 ? "text-success" : "text-muted-foreground"}`}
                              >
                                {(r.pValue ?? 1).toFixed(4)}
                              </td>
                              <td className="px-2 py-2 text-right text-muted-foreground">
                                {(r.stdErr ?? 0).toFixed(4)}
                              </td>
                              <td className="px-2 py-2 text-right text-muted-foreground">
                                {r.observations}
                              </td>
                            </tr>
                          ))}
                        {bmResults
                          .filter((r) => r.observations === 0)
                          .map((r) => (
                            <tr
                              key={r.ticker + label + "_no"}
                              className="border-b border-border/30 last:border-0 hover:bg-muted/20 opacity-40"
                            >
                              <td className="px-2 py-2 font-semibold">{r.ticker}</td>
                              <td className="px-2 py-2 text-right" colSpan={8}>
                                Sin datos
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>

                    {bmResults.some((r) => r.observations > 0) && (
                      <div className="mt-4 h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={bmResults
                              .filter((r) => r.observations > 0)
                              .map((r) => ({ ticker: r.ticker, Beta: r.beta }))}
                            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                            <XAxis dataKey="ticker" tick={AXIS_TICK_LG} />
                            <YAxis tick={AXIS_TICK} />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            <Bar dataKey="Beta" fill="var(--color-success)" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {benchLabels.map((l) => (
                      <button
                        key={l}
                        onClick={() => setCapmTab(l)}
                        className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
                          active === l
                            ? "border-primary/60 bg-primary/10 text-foreground"
                            : "border-border/60 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  {tabEl(active)}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ CAPM â€” Matriz de correlaciÃ³n entre activos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const METRIC_LABELS: Record<string, string> = {
  alpha: "Alpha",
  beta: "Beta",
  correlation: "CorrelaciÃ³n",
  rSquared: "RÂ²",
};

function CapmMatrizPage() {
  const fn = useServerFn(getMatrizCAPM);
  const [sectorFilter, setSectorFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MatrizCAPMResult | null>(null);
  const [metricTab, setMetricTab] = useState("correlation");

  const sectorList = useMemo(() => Object.keys(sectores).sort(), []);
  const industryList = useMemo(() => {
    if (!sectorFilter) return [];
    const data = (sectores as Record<string, Record<string, TickerItem[]>>)[sectorFilter];
    return data ? Object.keys(data).sort() : [];
  }, [sectorFilter]);
  const tickersFromFilter = useMemo(() => {
    if (!sectorFilter || !industryFilter) return [];
    const data = (sectores as Record<string, Record<string, TickerItem[]>>)[sectorFilter];
    return data?.[industryFilter] ?? [];
  }, [sectorFilter, industryFilter]);

  const handleRun = async () => {
    const tickers = tickersFromFilter.map((t) => t.ticker);
    if (tickers.length < 2) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await fn({ data: { tickers } });
      setResult(data);
      if (data.tickers.length < 2) setError("No se pudieron obtener datos suficientes.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tickersFromFilter.length >= 2) handleRun();
  }, [sectorFilter, industryFilter]);

  const matrixToDisplay = useMemo(() => {
    if (!result) return null;
    switch (metricTab) {
      case "alpha":
        return result.alpha;
      case "beta":
        return result.beta;
      case "correlation":
        return result.correlation;
      case "rSquared":
        return result.rSquared;
      default:
        return null;
    }
  }, [result, metricTab]);

  const cellColor = (val: number, metric: string): string => {
    switch (metric) {
      case "alpha":
        return val > 0
          ? `rgba(16,185,129,${Math.min(Math.abs(val) * 20, 0.7)})`
          : val < 0
            ? `rgba(239,68,68,${Math.min(Math.abs(val) * 20, 0.7)})`
            : "transparent";
      case "beta":
        return val > 1
          ? `rgba(239,68,68,${Math.min((val - 1) * 3, 0.7)})`
          : val < 1
            ? `rgba(16,185,129,${Math.min((1 - val) * 3, 0.7)})`
            : "transparent";
      case "correlation":
        return `rgba(16,185,129,${Math.abs(val) * 0.6})`;
      case "rSquared":
        return `rgba(59,130,246,${val * 0.65})`;
      default:
        return "transparent";
    }
  };

  const fmt = (v: number) => v.toFixed(4);

  return (
    <div className="space-y-4">
      <div className="mono text-[14px] uppercase tracking-[0.22em] text-primary/80">
        Matriz Â· Alpha, Beta, CorrelaciÃ³n y RÂ² entre activos
      </div>
      <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
        ComparaciÃ³n pairwise de activos dentro de un sector / industria.
      </h2>

      <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="glass min-w-0 p-4 space-y-3">
            <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Sector / Industria
            </div>
            <select
              value={sectorFilter}
              onChange={(e) => {
                setSectorFilter(e.target.value);
                setIndustryFilter("");
                setResult(null);
              }}
              className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
            >
              <option value="">Seleccionar sector</option>
              {sectorList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {sectorFilter && industryList.length > 0 && (
              <select
                value={industryFilter}
                onChange={(e) => {
                  setIndustryFilter(e.target.value);
                  setResult(null);
                }}
                className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
              >
                <option value="">Seleccionar industria</option>
                {industryList.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            )}
            {industryFilter && tickersFromFilter.length > 0 && tickersFromFilter.length < 2 && (
              <p className="text-[14px] text-muted-foreground">Se requiere al menos 2 activos.</p>
            )}
            {industryFilter && tickersFromFilter.length >= 2 && (
              <div className="flex flex-wrap gap-1.5">
                {tickersFromFilter.map((t) => (
                  <span
                    key={t.ticker}
                    className="font-mono text-[13px] px-2 py-1 rounded-md border border-primary/30 bg-primary/10 text-foreground"
                  >
                    {t.ticker}
                  </span>
                ))}
              </div>
            )}
            {loading && (
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-[14px] text-muted-foreground">Calculando matriz...</span>
              </div>
            )}
          </div>
          {error && (
            <div className="p-3 rounded-md bg-danger/10 border border-danger/30">
              <p className="text-danger text-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!result && !loading && !error && (
            <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
              <p className="text-sm text-muted-foreground">
                SeleccionÃ¡ un sector e industria para ver la matriz de correlaciÃ³n entre activos.
              </p>
            </div>
          )}

          {result &&
            result.tickers.length >= 2 &&
            matrixToDisplay &&
            (() => {
              const labels = result.tickers;
              const vn = labels.length;

              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(METRIC_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setMetricTab(key)}
                        className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
                          metricTab === key
                            ? "border-primary/60 bg-primary/10 text-foreground"
                            : "border-border/60 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="glass overflow-x-auto p-5">
                    <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground mb-3">
                      {METRIC_LABELS[metricTab]} Â· {result.observations} observaciones
                    </div>
                    <table className="mono w-full text-[14px]">
                      <thead>
                        <tr className="border-b border-border/60">
                          <th className="px-2 py-1.5 text-left text-[13px] uppercase tracking-wider text-muted-foreground min-w-[60px]">
                            Activo
                          </th>
                          {labels.map((l) => (
                            <th
                              key={l}
                              className="px-2 py-1.5 text-right text-[13px] uppercase tracking-wider text-muted-foreground min-w-[60px]"
                            >
                              {l}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {labels.map((rowLabel, i) => (
                          <tr
                            key={rowLabel}
                            className="border-b border-border/20 last:border-0 hover:bg-muted/10"
                          >
                            <td className="px-2 py-1.5 font-semibold text-primary sticky left-0 bg-surface">
                              {rowLabel}
                            </td>
                            {labels.map((colLabel, j) => (
                              <td
                                key={colLabel}
                                className="px-2 py-1.5 text-right font-mono relative"
                                style={{ background: cellColor(matrixToDisplay[i][j], metricTab) }}
                              >
                                {fmt(matrixToDisplay[i][j])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Performance Sectorial â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PerformanceSection() {
  const perfFn = useServerFn(getSectorDailyPerformance);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sector-daily-performance"],
    queryFn: () => perfFn(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-[14px] text-muted-foreground">
            Cargando performance sectorial...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-3">
        Error al cargar performance: {error.message}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No hay datos disponibles.
      </div>
    );
  }

  return (
    <SectorPerformanceBars
      rows={data.items.map((i: SectorDailyPerf) => ({
        label: i.label,
        etf: i.etf,
        dot: i.dot,
        value: i.changePercent,
      }))}
    />
  );
}

// â”€â”€â”€ CAPM subtabs wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function CapmTabs() {
  const [subtab, setSubtab] = useState("manual");
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 border-b border-border/40 pb-2">
        <button
          onClick={() => setSubtab("manual")}
          className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
            subtab === "manual"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          Manual
        </button>
        <button
          onClick={() => setSubtab("iol")}
          className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
            subtab === "iol"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          Portafolio IOL
        </button>
        <button
          onClick={() => setSubtab("rendimiento")}
          className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
            subtab === "rendimiento"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          Rendimiento Real
        </button>
      </div>
      {subtab === "manual" ? (
        <CapmPage />
      ) : subtab === "iol" ? (
        <CapmIolPage />
      ) : (
        <RendimientoRealPage />
      )}
    </div>
  );
}

// â”€â”€â”€ CAPM â€” Portafolio IOL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CapmIolPage() {
  const capmFn = useServerFn(getIOLCapm);
  const iol = useIOLPortafolio();
  const [benchmarkInput, setBenchmarkInput] = useState("SPY");
  const [autoDetect, setAutoDetect] = useState(true);
  const [pais, setPais] = useState("argentina");
  const [tickers, setTickers] = useState<string[]>([]);
  const [result, setResult] = useState<IOLCapmResult | null>(null);
  const [loadingCapm, setLoadingCapm] = useState(false);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [error, setError] = useState("");

  const loadPortfolio = useCallback(
    async (cliente?: number) => {
      setLoadingPortfolio(true);
      setError("");
      setTickers([]);
      try {
        const activos = await iol.loadPortfolio(cliente);
        const syms = activos.map((a: any) => a.titulo?.simbolo).filter(Boolean);
        setTickers(syms);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingPortfolio(false);
      }
    },
    [iol],
  );

  const handleRun = async () => {
    if (!iol.accessToken) {
      setError("IniciÃ¡ sesiÃ³n en IOL primero.");
      return;
    }
    if (iol.esAsesor === null) {
      await iol.loadClientes();
    }
    if ((iol.esAsesor && iol.clienteId) || iol.esAsesor === false) {
      setLoadingCapm(true);
      setError("");
      setResult(null);
      try {
        await loadPortfolio(iol.esAsesor ? iol.clienteId : undefined);
      } catch (e) {
        setError((e as Error).message);
        setLoadingCapm(false);
        return;
      }
      const finalBenchmark = autoDetect ? "SPY" : benchmarkInput.trim().toUpperCase();
      if (!finalBenchmark) {
        setError("IngresÃ¡ un benchmark.");
        setLoadingCapm(false);
        return;
      }
      try {
        const res = await capmFn({
          data: {
            token: iol.accessToken,
            refreshToken: iol.refreshToken,
            benchmark: finalBenchmark,
            autoDetect,
            pais,
            clienteId: iol.esAsesor ? iol.clienteId : undefined,
          },
        });
        setResult(res as any);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingCapm(false);
      }
    }
  };

  useEffect(() => {
    if (iol.accessToken && iol.esAsesor === null) iol.loadClientes();
  }, [iol.accessToken, iol.esAsesor, iol.loadClientes]);

  if (!iol.accessToken) {
    return (
      <div className="glass flex min-h-[200px] items-center justify-center p-10 text-center">
        <p className="text-sm text-muted-foreground">
          IniciÃ¡ sesiÃ³n en IOL desde el panel superior para ver el portafolio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="space-y-3">
          {iol.loading && (
            <div className="glass p-4 text-center text-xs text-muted-foreground">
              Verificando tipo de cuenta...
            </div>
          )}

          <div className="glass min-w-0 p-4 space-y-3">
            <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Benchmark (Yahoo)
            </div>
            <input
              value={benchmarkInput}
              onChange={(e) => setBenchmarkInput(e.target.value)}
              placeholder="SPY"
              className="w-full bg-background/40 border border-border/60 text-foreground text-sm rounded-md px-3 py-2 focus:border-primary outline-none font-mono"
            />
            <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground mb-1 mt-3">
              PaÃ­s IOL
            </div>
            <select
              value={pais}
              onChange={(e) => setPais(e.target.value)}
              className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
            >
              <option value="argentina">Argentina</option>
              <option value="estados_Unidos">Estados Unidos</option>
            </select>
          </div>

          {iol.esAsesor && iol.clientes.length > 0 && (
            <div className="glass p-4 space-y-2">
              <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Seleccionar Cliente
              </div>
              <select
                value={iol.clienteId}
                onChange={(e) => iol.setClienteId(Number(e.target.value))}
                className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
              >
                <option value={0}>Seleccionar cliente...</option>
                {iol.clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido} â€” ${c.totalCuentaValorizado?.toLocaleString() ?? 0}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!iol.esAsesor && !iol.loading && (
            <div className="glass p-4">
              <div className="text-xs text-muted-foreground">
                Cuenta particular â€” se usarÃ¡ tu portafolio.
              </div>
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={loadingCapm || loadingPortfolio || (iol.esAsesor === true && !iol.clienteId)}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loadingCapm
              ? "Analizando portafolio..."
              : iol.esAsesor
                ? "Analizar portafolio del cliente"
                : "Analizar mi portafolio"}
          </button>

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
        </div>

        <div className="min-w-0 space-y-4">
          {!result && !loadingCapm && !error && (
            <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
              <p className="text-sm text-muted-foreground">
                SeleccionÃ¡ un cliente y ejecutÃ¡ el anÃ¡lisis.
              </p>
            </div>
          )}

          {loadingCapm && (
            <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Obteniendo portafolio y calculando regresiones...
              </p>
            </div>
          )}

          {result &&
            (() => {
              const { portfolio, assets, totalValorizado, warning } = result;
              const totalValStr = totalValorizado.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });

              return (
                <div className="space-y-4">
                  {warning && (
                    <div className="p-3 rounded-md bg-warning/10 border border-warning/30">
                      <p className="text-warning text-sm">{warning}</p>
                    </div>
                  )}

                  {/* Portfolio KPIs */}
                  <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                    <BigStat label="Valor Portafolio" value={`$${totalValStr}`} />
                    <BigStat label="Total Activos" value={`${portfolio.assets}`} />
                    <BigStat label="Observaciones" value={`${portfolio.observations}`} />
                    <BigStat label="Benchmark" value={portfolio.benchmark} />
                  </div>

                  {/* Portfolio CAPM */}
                  <div className="glass overflow-x-auto p-5">
                    <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
                      CAPM del Portafolio Ponderado vs {portfolio.benchmark}
                    </div>
                    <table className="mono w-full text-[14px]">
                      <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                        <tr className="border-b border-border/60">
                          <th className="px-2 py-2 text-left">MÃ©trica</th>
                          <th className="px-2 py-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "Alpha", value: portfolio.alpha, good: (v: number) => v > 0 },
                          {
                            label: "Î± Anual",
                            value: portfolio.annualizedAlpha,
                            good: (v: number) => v > 0,
                          },
                          { label: "Beta", value: portfolio.beta, good: (v: number) => v < 1 },
                          { label: "RÂ²", value: portfolio.rSquared },
                          { label: "Corr", value: portfolio.correlation },
                          {
                            label: "p-value",
                            value: portfolio.pValue,
                            good: (v: number) => v < 0.05,
                          },
                          { label: "Std Err", value: portfolio.stdErr },
                        ].map((r) => (
                          <tr
                            key={r.label}
                            className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                          >
                            <td className="px-2 py-2 font-semibold text-primary">{r.label}</td>
                            <td
                              className={`px-2 py-2 text-right ${r.good ? (r.good(r.value) ? "text-success" : "text-danger") : ""}`}
                            >
                              {r.value.toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Per-asset table */}
                  <div className="glass overflow-x-auto p-5">
                    <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
                      Activos del Portafolio Â· CAPM individual
                    </div>
                    <table className="mono w-full text-[14px]">
                      <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                        <tr className="border-b border-border/60">
                          <th className="px-2 py-2 text-left">SÃ­mbolo</th>
                          <th className="px-2 py-2 text-left">Mercado</th>
                          <th className="px-2 py-2 text-left">Tipo</th>
                          <th className="px-2 py-2 text-left">Moneda</th>
                          <th className="px-2 py-2 text-left">Subyacente</th>
                          <th className="px-2 py-2 text-left">Moneda (CAPM)</th>
                          <th className="px-2 py-2 text-right">Cant</th>
                          <th className="px-2 py-2 text-right">Precio</th>
                          <th className="px-2 py-2 text-right">Valor</th>
                          <th className="px-2 py-2 text-right">Peso</th>
                          <th className="px-2 py-2 text-right">Alpha</th>
                          <th className="px-2 py-2 text-right">Î± anual</th>
                          <th className="px-2 py-2 text-right">Beta</th>
                          <th className="px-2 py-2 text-right">RÂ²</th>
                          <th className="px-2 py-2 text-right">Corr</th>
                          <th className="px-2 py-2 text-right">p-value</th>
                          <th className="px-2 py-2 text-right">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assets.map((a) => (
                          <tr
                            key={a.simbolo}
                            className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                          >
                            <td className="px-2 py-2 font-semibold text-primary">{a.simbolo}</td>
                            <td className="px-2 py-2">{a.mercado}</td>
                            <td className="px-2 py-2">{a.tipo}</td>
                            <td className="px-2 py-2">{a.moneda}</td>
                            <td className="px-2 py-2 text-primary">
                              {a.simboloSubyacente} ({a.monedaSubyacente})
                            </td>
                            <td className="px-2 py-2">{a.monedaSubyacente}</td>
                            <td className="px-2 py-2 text-right">{a.cantidad}</td>
                            <td className="px-2 py-2 text-right">{a.ultimoPrecio.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right">{a.valorizado.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right">{(a.peso * 100).toFixed(1)}%</td>
                            <td
                              className={`px-2 py-2 text-right ${a.alpha > 0 ? "text-success" : a.alpha < 0 ? "text-danger" : ""}`}
                            >
                              {a.alpha.toFixed(4)}
                            </td>
                            <td
                              className={`px-2 py-2 text-right ${a.annualizedAlpha > 0 ? "text-success" : a.annualizedAlpha < 0 ? "text-danger" : ""}`}
                            >
                              {a.annualizedAlpha.toFixed(4)}
                            </td>
                            <td
                              className={`px-2 py-2 text-right ${a.beta > 1 ? "text-warning" : a.beta < 1 ? "text-success" : ""}`}
                            >
                              {a.beta.toFixed(4)}
                            </td>
                            <td className="px-2 py-2 text-right">{a.rSquared.toFixed(4)}</td>
                            <td className="px-2 py-2 text-right">{a.correlation.toFixed(4)}</td>
                            <td
                              className={`px-2 py-2 text-right ${a.pValue < 0.05 ? "text-success" : "text-muted-foreground"}`}
                            >
                              {a.pValue.toFixed(4)}
                            </td>
                            <td className="px-2 py-2 text-right text-muted-foreground">
                              {a.observations || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Asset Bar chart: Beta */}
                  {assets.some((a) => a.observations > 0) && (
                    <div className="glass p-5">
                      <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
                        Beta por activo vs {portfolio.benchmark}
                      </div>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={assets
                              .filter((a) => a.observations > 0)
                              .map((a) => ({ simbolo: a.simbolo, Beta: a.beta }))}
                            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                            <XAxis dataKey="simbolo" tick={AXIS_TICK_LG} />
                            <YAxis tick={AXIS_TICK} />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            <Bar dataKey="Beta" fill="var(--color-success)" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Rendimiento Real â€” TWR desde operaciones IOL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


