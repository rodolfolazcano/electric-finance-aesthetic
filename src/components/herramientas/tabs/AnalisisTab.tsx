import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useCallback, useEffect, Suspense, lazy } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MarketDataInput from "@/components/market-data/MarketDataInput";
import HistoricalChart from "@/components/market-data/HistoricalChart";
import { computeHurst } from "@/lib/math/stats";
import {
  getSemaforo,
  getSemaforoBatch,
  getBenchmarkHistory,
  type SemaforoResult,
} from "@/lib/finance.functions";
import type { QuoteData, HistoricalBar } from "@/lib/market-data.types";
import { useIOLSession } from "@/lib/iol-context";
import { useIOLPortafolio } from "@/lib/use-iol-portafolio";
import { type IOLTitulo } from "@/lib/iol-portfolio.functions";
import { resolveDraftTickerFromIOL } from "@/lib/draft-asset-iol-resolver";
import { getIOLSemaforoBatch, type IOLSemaforoResult } from "@/lib/iol-batch-semaforo.functions";
import { DataSourceToggle } from "@/components/shared/DataSourceToggle";
import type { DataSourceMode } from "@/components/shared/DataSourceToggle";
import BacktestingSenalesPanel from "@/components/herramientas/BacktestingSenalesPanel";
import { AnalisisFundamentalTab } from "@/components/herramientas/AnalisisFundamentalTab";
import { GRID_STROKE, AXIS_TICK_SM, AXIS_TICK, CHART_TOOLTIP_STYLE } from "../shared/chart-constants";
import { SemaforoCard } from "../shared/SemaforoCard";

// TradingView inyecta un script externo: se carga de forma diferida (code-splitting).
const TradingViewWidget = lazy(() =>
  import("@/components/market-data/TradingViewWidget").then((m) => ({ default: m.default })),
);

export function AnalisisTab({
  tickerFromSearch,
  subTabFromUrl,
  onSubTabChange,
  onContextualMessage,
}: {
  tickerFromSearch?: string;
  subTabFromUrl?: string;
  onSubTabChange?: (subTab: string) => void;
  onContextualMessage?: (msg: string | null) => void;
}) {
  return (
    <AnalisisPage
      tickerFromSearch={tickerFromSearch}
      subTabFromUrl={subTabFromUrl}
      onSubTabChange={onSubTabChange}
      onContextualMessage={onContextualMessage}
    />
  );
}

function AnalisisPage({
  tickerFromSearch,
  subTabFromUrl,
  onSubTabChange,
  onContextualMessage,
}: {
  tickerFromSearch?: string;
  subTabFromUrl?: string;
  onSubTabChange?: (subTab: string) => void;
  onContextualMessage?: (msg: string | null) => void;
} = {}) {
  const navigate = useNavigate({ from: "/herramientas" });
  const fnSemaforo = useServerFn(getSemaforo);
  const fnSemaforoBatch = useServerFn(getSemaforoBatch);
  const fnBenchmark = useServerFn(getBenchmarkHistory);

  const semaforo = useMutation({
    mutationFn: (params: { ticker: string; rango?: string }) =>
      fnSemaforo({ data: { ticker: params.ticker.toUpperCase().trim(), rango: params.rango } }),
    onSuccess: () => { semaforoBatch.reset(); },
  });
  const semaforoBatch = useMutation({
    mutationFn: (params: { tickers: string[]; rango?: string }) =>
      fnSemaforoBatch({ data: { tickers: params.tickers.map((t) => t.toUpperCase().trim()), rango: params.rango } }),
    onSuccess: () => { semaforo.reset(); },
  });

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [historical, setHistorical] = useState<HistoricalBar[]>([]);
  const [tickerInput, setTickerInput] = useState(tickerFromSearch ?? "");
  const [currentRango, setCurrentRango] = useState("2A");
  const [lastAnalyzedTicker, setLastAnalyzedTicker] = useState(tickerFromSearch ?? "");
  const [chartMode, setChartMode] = useState<"real" | "normalizado">("real");
  const [selectedComparativoTicker, setSelectedComparativoTicker] = useState<string | null>(null);
  const [selectedBenchmark, setSelectedBenchmark] = useState("");
  const [subTab, setSubTab] = useState<"tecnico" | "fundamental">(
    subTabFromUrl === "fundamental" ? "fundamental" :
    subTabFromUrl === "tecnico" ? "tecnico" :
    tickerFromSearch ? "fundamental" : "tecnico"
  );
  useEffect(() => {
    if (subTabFromUrl === "tecnico" || subTabFromUrl === "fundamental") setSubTab(subTabFromUrl);
  }, [subTabFromUrl]);
  const [tecMode, setTecMode] = useState<"manual" | "portafolio-iol">("manual");
  const [tecSubTab, setTecSubTab] = useState<"semaforo" | "backtesting">("semaforo");
  type PortItem = { simbolo: string; iolSymbol: string; analysisSymbol: string; cantidad: number; valorizado: number; category: string; canUseYahoo: boolean; iolMercado: string; iolMoneda: string; warning?: string };
  const [portTickers, setPortTickers] = useState<PortItem[]>([]);
  const [portError, setPortError] = useState<string | null>(null);
  const [apiMode, setApiMode] = useState<"auto" | "yahoo" | "iol" | "both">("auto");
  const [iolSemaforoData, setIOLSemaforoData] = useState<IOLSemaforoResult[] | null>(null);
  const [iolSemaforoLoading, setIOLSemaforoLoading] = useState(false);
  const fnIOLSemaforoBatch = useServerFn(getIOLSemaforoBatch);
  const { accessToken, refreshToken, updateTokens } = useIOLSession();

  const iol = useIOLPortafolio();
  const loadClientes = iol.loadClientes;

  const loadPortfolio = useCallback(async (cliente?: number) => {
    const activos = await iol.loadPortfolio(cliente);
    const items = activos
      .filter((i: any) => (i.titulo?.simbolo || i.simbolo) && i.cantidad > 0)
      .map((i: any) => {
        const titulo: IOLTitulo = {
          simbolo: i.titulo?.simbolo || i.simbolo || "",
          descripcion: i.titulo?.descripcion || "",
          pais: i.titulo?.pais || "",
          mercado: i.titulo?.mercado || "",
          tipo: i.titulo?.tipo || "",
          plazo: "t0",
          moneda: i.titulo?.moneda || "",
        };
        const resolved = resolveDraftTickerFromIOL(titulo);
        return {
          simbolo: resolved.priceSymbol || titulo.simbolo,
          iolSymbol: titulo.simbolo,
          analysisSymbol: resolved.priceSymbol || titulo.simbolo,
          cantidad: i.cantidad,
          valorizado: i.valorizado ?? 0,
          category: resolved.category,
          canUseYahoo: resolved.canUseYahoo,
          iolMercado: titulo.mercado || "bCBA",
          iolMoneda: resolved.moneda,
          warning: resolved.warning,
        };
      });
    setPortTickers(items);
    const hasYahoo = items.some((i) => i.canUseYahoo);
    const hasIOLOnly = items.some((i) => !i.canUseYahoo);
    if (hasYahoo && hasIOLOnly) {
      setApiMode("auto");
      setPortError("Se detectaron CEDEARs/acciones (Yahoo) y títulos públicos (solo IOL). Elegí cómo analizar abajo.");
    } else if (!hasYahoo) {
      setApiMode("iol");
      setPortError(null);
    } else {
      setApiMode("yahoo");
      setPortError(null);
    }
  }, [iol]);

  useEffect(() => {
    if (tecMode === "portafolio-iol" && accessToken && portTickers.length === 0 && !iol.loading) {
      if (iol.esAsesor === null) {
        loadClientes();
      }
    }
  }, [tecMode, accessToken, portTickers.length, iol.loading, iol.esAsesor, loadClientes]);

  useEffect(() => {
    if (tecMode === "portafolio-iol" && accessToken && iol.esAsesor !== null && portTickers.length === 0 && !iol.loading) {
      if (iol.esAsesor && iol.clienteId) {
        loadPortfolio(iol.clienteId);
      } else if (!iol.esAsesor) {
        loadPortfolio();
      }
    }
  }, [tecMode, accessToken, iol.esAsesor, iol.clienteId, portTickers.length, iol.loading, loadPortfolio]);

  // Load ticker from localStorage (set by optimizer results)
  useEffect(() => {
    const storedTicker = localStorage.getItem("analisis_ticker");
    if (storedTicker) {
      localStorage.removeItem("analisis_ticker");
      setTickerInput(storedTicker);
      semaforo.mutate({ ticker: storedTicker, rango: currentRango });
    }
  }, []);

  // Benchmark history query
  const benchmarkQuery = useQuery({
    queryKey: ["comparativo-benchmark", selectedBenchmark, currentRango],
    queryFn: () =>
      selectedBenchmark
        ? fnBenchmark({ data: { benchmark: selectedBenchmark, rango: currentRango } })
        : Promise.resolve([] as { date: string; close: number }[]),
    enabled: !!selectedBenchmark,
    staleTime: 5 * 60 * 1000,
  });

  const handleAnalyze = useCallback((input: string, rango?: string) => {
    const tickers = input
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return;
    setQuote(null);
    if (tickers.length === 1) {
      setLastAnalyzedTicker(tickers[0]);
      semaforo.mutate({ ticker: tickers[0], rango });
    } else {
      setLastAnalyzedTicker("");
      semaforoBatch.mutate({ tickers, rango });
    }
  }, []);

  const [portfolioAnalysisLoading, setPortfolioAnalysisLoading] = useState(false);

  const handlePortfolioAnalysis = useCallback(async (_input?: string, _rango?: string) => {
    if (!accessToken || portTickers.length === 0) return;
    setPortfolioAnalysisLoading(true);
    setIOLSemaforoData(null);

    const useYahoo = apiMode !== "iol" && portTickers.some((t) => t.canUseYahoo);
    const useIOL = apiMode !== "yahoo" && portTickers.some((t) => !t.canUseYahoo);

    try {
      if (useYahoo) {
        const tickers = portTickers.filter((t) => t.canUseYahoo).map((t) => t.analysisSymbol);
        semaforoBatch.mutate({ tickers, rango: currentRango || "2A" });
      }

      if (useIOL) {
        const iolTickers = portTickers.filter((t) => !t.canUseYahoo).map((t) => ({
          simbolo: t.iolSymbol,
          mercado: t.iolMercado,
          moneda: t.iolMoneda,
        }));
        const result = await fnIOLSemaforoBatch({ data: { tickers: iolTickers, token: accessToken, refreshToken, days: 730 } });
        setIOLSemaforoData(result);
      }
    } finally {
      setPortfolioAnalysisLoading(false);
    }
  }, [accessToken, portTickers, apiMode, currentRango, fnIOLSemaforoBatch, refreshToken]);

  const handleQuoteReceived = (q: QuoteData) => {
    setQuote(q);
  };

  const handleSuggested = (ticker: string) => {
    setTickerInput(ticker);
    semaforo.mutate({ ticker, rango: currentRango });
  };

  const tvInterval: "60" | "D" | "W" = "D";
  const tvSymbol = lastAnalyzedTicker
    ? lastAnalyzedTicker.endsWith(".BA")
      ? `BCBA:${lastAnalyzedTicker.slice(0, -3)}`
      : lastAnalyzedTicker
    : "";

  return (
    <div className="space-y-4">
      {/* Tab Técnico */}
      <div className={subTab !== "tecnico" ? "hidden" : ""}>
        <>
          <DataSourceToggle
            mode={tecMode as DataSourceMode}
            onModeChange={(m) => setTecMode(m)}
            disabled={!accessToken}
          />

          <div className="flex gap-1 border-b border-border/40 pb-2 mt-2">
            <button onClick={() => setTecSubTab("semaforo")}
              className={`mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
                tecSubTab === "semaforo"
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              Sem&aacute;foro
            </button>
            <button onClick={() => setTecSubTab("backtesting")}
              className={`mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
                tecSubTab === "backtesting"
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              Backtesting Se&ntilde;ales
            </button>
          </div>

          {tecSubTab === "backtesting" && (
            <BacktestingSenalesPanel />
          )}

          {tecSubTab === "semaforo" && tecMode === "manual" && (
          <>
          <MarketDataInput
            showChart={false}
            showQuoteCard={false}
            defaultSource="yahoo"
            defaultTicker={tickerInput}
            defaultToken={accessToken}
            defaultRefreshToken={refreshToken}
            onTokenRefresh={updateTokens}
            onTickerChange={setTickerInput}
            onQuoteReceived={handleQuoteReceived}
            onHistoricalReceived={(bars) => setHistorical(bars)}
            onRangoChange={setCurrentRango}
            onAnalyze={handleAnalyze}
            buttonLabel="Analizar"
          />

          {/* Loading */}
          {(semaforo.isPending || semaforoBatch.isPending) && (
            <div className="rounded-md border border-border/40 bg-background/40 px-4 py-6 text-center text-[13px] text-muted-foreground">
              Consultando Yahoo Finance y calculando métricas...
            </div>
          )}

          {/* Error */}
          {semaforo.isError && (
            <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-[13px] text-danger">
              {(semaforo.error as Error).message}
            </div>
          )}
          {semaforoBatch.isError && (
            <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-[13px] text-danger">
              {(semaforoBatch.error as Error).message}
            </div>
          )}

          {/* Comparativo (multi-ticker) */}
          {semaforoBatch.data && semaforoBatch.data.length > 0 && (
            <ComparativoActivos
              data={semaforoBatch.data}
              benchmarkData={benchmarkQuery.data}
              chartMode={chartMode}
              onChartModeChange={setChartMode}
              selectedTicker={selectedComparativoTicker}
              onSelectTicker={setSelectedComparativoTicker}
              selectedBenchmark={selectedBenchmark}
              onBenchmarkChange={setSelectedBenchmark}
            />
          )}

          {/* Single-ticker result — Labadié Hurst filter (§3.2 p=1/H) */}
          {semaforo.data && !semaforoBatch.data && (() => {
            const closes = (semaforo.data.history ?? []).map((h: any) => h.close).filter((v: number) => isFinite(v));
            const H = closes.length >= 30 ? computeHurst(closes) : 0.5;
            const p = H > 0 ? 1 / H : 2;
            const regime = H < 0.45 ? "mean-reverting" : H > 0.55 ? "trending" : "random";
            const hurstWarn = closes.length < 100;
            return (
            <div className="space-y-4">
              <div className="rounded-md border border-border/40 bg-background/40 p-4">
                <Suspense
                  fallback={
                    <div className="flex h-[480px] w-full items-center justify-center text-[14px] text-muted-foreground">
                      Cargando gráfico…
                    </div>
                  }
                >
                  <TradingViewWidget symbol={tvSymbol} interval={tvInterval} height={480} />
                </Suspense>
              </div>
              {/* Labadié Hurst filter badge */}
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 font-mono text-xs">
                <span className="uppercase tracking-widest text-muted-foreground">Labadié H</span>
                <span className="font-semibold">{H.toFixed(3)}</span>
                <span className="text-muted-foreground">p=1/H {p.toFixed(2)}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${regime === "mean-reverting" ? "border-emerald-500/40 text-emerald-400" : regime === "trending" ? "border-amber-500/40 text-amber-400" : "border-border text-muted-foreground"}`}>{regime}</span>
                {hurstWarn && <span className="text-amber-500">n&lt;100 sesgado</span>}
                <span className="ml-auto text-[11px] text-muted-foreground hidden sm:inline">H&lt;0.45 favorece reversal (pairs), H&gt;0.55 penalizar contra-tendencia — 1205.3482v6 §3.2</span>
              </div>
              <SemaforoCard data={semaforo.data} onNavigateToFundamental={(ticker) => {
                navigate({ search: { tab: "herramientas", subTab: "fundamental", ticker } });
              }} />
            </div>
            );})()}

          {/* IOL data display (no cotización available, just historical chart) */}
          {!semaforo.data && !semaforo.isPending && !semaforoBatch.data && !semaforoBatch.isPending && historical.length > 0 && !quote && (
            <div className="rounded-md border border-border/40 bg-background/40 p-4">
              <HistoricalChart
                data={historical}
                height={250}
                moneda="ARS"
                ticker={lastAnalyzedTicker}
              />
            </div>
          )}

          {/* Initial state */}
          {!semaforo.data && !semaforo.isPending && !semaforo.isError && !semaforoBatch.data && !semaforoBatch.isPending && !quote && historical.length === 0 && (
            <div className="rounded-md border border-border/40 bg-background/40 px-4 py-6 text-center text-[13px] text-muted-foreground">
              Ingresá uno o más tickers separados por coma para iniciar el análisis.
            </div>
          )}
          </>
          )}

          {tecMode === "portafolio-iol" && tecSubTab === "semaforo" && (
            <div className="space-y-4">
              {iol.error && (
                <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-2 text-[13px] text-warning">{iol.error}</div>
              )}
              {portError && !iol.error && (
                <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-2 text-[13px] text-danger">{portError}</div>
              )}

              {iol.loading && (
                <div className="rounded-md border border-border/40 bg-background/40 px-4 py-6 text-center text-[13px] text-muted-foreground">
                  Cargando tu cartera...
                </div>
              )}

              {iol.esAsesor && iol.clientes.length > 0 && (
                <div className="flex items-center gap-3 rounded-md border border-border/40 bg-background/40 p-3">
                  <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                    Seleccionar Cliente
                  </div>
                  <select
                    value={iol.clienteId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      iol.setClienteId(id);
                      if (id) loadPortfolio(id);
                    }}
                    className="w-64 bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
                  >
                    <option value={0}>Seleccionar cliente...</option>
                    {iol.clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {c.apellido} — ${c.totalCuentaValorizado?.toLocaleString() ?? 0}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!iol.esAsesor && !iol.loading && (
                <div className="rounded-md border border-border/40 bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">
                    Cuenta particular — se usará tu portafolio.
                  </div>
                </div>
              )}

              {portTickers.length > 0 && (
                <>
                <MarketDataInput
                  showChart={false}
                  showQuoteCard={false}
                  defaultSource="iol"
                  defaultTicker=""
                  defaultToken={accessToken}
                  defaultRefreshToken={refreshToken}
                  onTokenRefresh={updateTokens}
                  onTickerChange={() => {}}
                  onQuoteReceived={handleQuoteReceived}
                  onHistoricalReceived={(bars) => setHistorical(bars)}
                  onRangoChange={setCurrentRango}
                  onAnalyze={handlePortfolioAnalysis}
                  buttonLabel="Analizar Portafolio"
                  disabled={portTickers.length === 0}
                  overrideValue={portTickers.map((t) => t.iolSymbol).join(", ")}
                  alwaysFireOnAnalyze={true}
                />

                <div className="rounded-lg border border-border/40 bg-background/40 overflow-hidden">
                  <table className="mono w-full text-[14px]">
                    <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                      <tr className="border-b border-border/60">
                        <th className="px-3 py-2 text-left">Ticker</th>
                        <th className="px-3 py-2 text-right">Cantidad</th>
                        <th className="px-3 py-2 text-right">Valorizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portTickers.map((t) => (
                        <tr key={t.simbolo} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-semibold text-primary">{t.iolSymbol}</td>
                          <td className="px-3 py-1.5 text-right">{t.cantidad}</td>
                          <td className="px-3 py-1.5 text-right">$ {t.valorizado.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Yahoo Results */}
                {(semaforoBatch.data && semaforoBatch.data.length > 0) && (
                  <ComparativoActivos
                    data={semaforoBatch.data}
                    benchmarkData={benchmarkQuery.data}
                    chartMode={chartMode}
                    onChartModeChange={setChartMode}
                    selectedTicker={selectedComparativoTicker}
                    onSelectTicker={setSelectedComparativoTicker}
                    selectedBenchmark={selectedBenchmark}
                    onBenchmarkChange={setSelectedBenchmark}
                  />
                )}

                {/* IOL Results */}
                {iolSemaforoData && iolSemaforoData.length > 0 && (
                  <div className="rounded-lg border border-border/40 bg-background/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-border/30 text-[13px] font-medium text-muted-foreground uppercase tracking-wider">
                      Análisis IOL
                    </div>
                    <table className="mono w-full text-[14px]">
                      <thead className="text-[13px] uppercase tracking-wider text-muted-foreground bg-muted/10">
                        <tr className="border-b border-border/60">
                          <th className="px-3 py-2 text-left">Ticker</th>
                          <th className="px-3 py-2 text-right">Precio</th>
                          <th className="px-3 py-2 text-right">Var%</th>
                          <th className="px-3 py-2 text-right">SMA 50</th>
                          <th className="px-3 py-2 text-right">RSI</th>
                          <th className="px-3 py-2 text-center">Score</th>
                          <th className="px-3 py-2 text-center">Rec.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {iolSemaforoData.map((d) => (
                          <tr key={d.ticker} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                            <td className="px-3 py-1.5 font-semibold text-primary">{d.ticker}</td>
                            <td className="px-3 py-1.5 text-right">{d.price.toFixed(2)}</td>
                            <td className={`px-3 py-1.5 text-right ${d.change1d >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {d.change1d >= 0 ? "+" : ""}{d.change1d.toFixed(2)}%
                            </td>
                            <td className="px-3 py-1.5 text-right">{d.sma50?.toFixed(2) ?? "\u2014"}</td>
                            <td className={`px-3 py-1.5 text-right ${d.rsi > 70 ? "text-red-500" : d.rsi < 30 ? "text-emerald-600" : ""}`}>
                              {d.rsi.toFixed(1)}
                            </td>
                            <td className="px-3 py-1.5 text-center">{clasificacionAEmoji(d.clasificacionJerarquica)}</td>
                            <td className="px-3 py-1.5 text-center">
                              {comparativoRecommendationBadge(d.clasificacionJerarquica)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {(semaforoBatch.isPending || iolSemaforoLoading) && (
                  <div className="rounded-md border border-border/40 bg-background/40 px-4 py-6 text-center text-[13px] text-muted-foreground">
                    Analizando...
                  </div>
                )}

                {semaforoBatch.isError && (
                  <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-[13px] text-danger">
                    {(semaforoBatch.error as Error).message}
                  </div>
                )}
                </>
              )}
            </div>
          )}
        </>
      </div>

      {/* Tab Fundamental */}
      <div className={subTab !== "fundamental" ? "hidden" : ""}>
        <AnalisisFundamentalTab
          tickerFromSearch={tickerFromSearch}
          accessToken={accessToken}
          refreshToken={refreshToken}
          onContextualMessage={onContextualMessage}
        />
      </div>

    </div>
  );
}

// 
// Comparativo de activos
// 

function fmtSemaforoNum(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtSemaforoPct(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

// Heatmap helpers
function heatPct(v: number | null | undefined): string {
  if (v == null) return "";
  if (v > 5) return "bg-green-900/30 text-green-300";
  if (v > 2) return "bg-green-900/20 text-green-300/80";
  if (v > 0) return "bg-green-900/10 text-green-300/60";
  if (v < -5) return "bg-red-900/30 text-red-300";
  if (v < -2) return "bg-red-900/20 text-red-300/80";
  if (v < 0) return "bg-red-900/10 text-red-300/60";
  return "";
}
function heatRsi(v: number | null | undefined): string {
  if (v == null) return "";
  if (v > 75) return "bg-red-500/40 text-red-200";
  if (v > 70) return "bg-red-500/25 text-red-300";
  if (v > 60) return "bg-red-500/10 text-red-300/60";
  if (v < 25) return "bg-green-500/40 text-green-200";
  if (v < 30) return "bg-green-500/25 text-green-300";
  if (v < 40) return "bg-green-500/10 text-green-300/60";
  return "bg-transparent text-muted-foreground";
}
function heatPe(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  if (v < 10) return "bg-green-500/30 text-green-300";
  if (v < 15) return "bg-green-500/15 text-green-300/80";
  if (v < 20) return "bg-green-500/5 text-green-300/50";
  if (v < 30) return "bg-transparent text-foreground";
  if (v < 40) return "bg-red-500/10 text-red-300/60";
  if (v < 60) return "bg-red-500/20 text-red-300/80";
  return "bg-red-500/35 text-red-200";
}
function clasificacionAEmoji(clasif: string) {
  const colorMap: Record<string, string> = {
    COMPRA: "bg-emerald-500",
    "COMPRA CON CAUTELA": "bg-emerald-400",
    MANTENER: "bg-yellow-500",
    REDUCIR: "bg-red-400",
    VENTA: "bg-red-500",
  };
  const bg = colorMap[clasif] ?? "bg-muted-foreground";
  return <span title={clasif} className={`inline-block h-2 w-2 rounded-full ${bg}`} />;
}

const LEYENDA_SCORE = [
  { id: "compra", label: "COMPRA / COMPRA CON CAUTELA", desc: "Favorable", color: "bg-emerald-500" },
  { id: "mantener", label: "MANTENER", desc: "Neutral", color: "bg-yellow-500" },
  { id: "venta", label: "REDUCIR / VENTA", desc: "Desfavorable", color: "bg-red-500" },
];

function comparativoRecommendationBadge(r: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA") {
  const m: Record<string, string> = {
    COMPRA: "bg-success/15 text-success",
    "COMPRA CON CAUTELA": "bg-success/10 text-success/70",
    MANTENER: "bg-warning/15 text-warning",
    REDUCIR: "bg-danger/10 text-danger/70",
    VENTA: "bg-danger/15 text-danger",
  };
  return <span className={`rounded border px-1.5 py-0.5 text-[13px] font-mono ${m[r] ?? m.MANTENER}`}>{r}</span>;
}

const CHART_COLORS = [
  "var(--color-chart-blue, #3b82f6)",
  "var(--color-chart-purple, #a855f7)",
  "var(--color-chart-green, #22c55e)",
  "var(--color-warning)",
  "var(--color-danger)",
  "var(--color-chart-cyan, #06b6d4)",
];
const BENCHMARK_OPTIONS = [
  { value: "", label: "Sin benchmark" },
  { value: "SPY", label: "SPY (S&P 500)" },
  { value: "QQQ", label: "QQQ (Nasdaq)" },
  { value: "MERVAL", label: "MERVAL" },
  { value: "EEM", label: "EEM (Emergentes)" },
  { value: "CCL", label: "CCL (implícito)" },
];

function ComparativoActivos({
  data,
  benchmarkData,
  chartMode,
  onChartModeChange,
  selectedTicker,
  onSelectTicker,
  selectedBenchmark,
  onBenchmarkChange,
}: {
  data: SemaforoResult[];
  benchmarkData?: { date: string; close: number }[];
  chartMode: "real" | "normalizado";
  onChartModeChange: (mode: "real" | "normalizado") => void;
  selectedTicker: string | null;
  onSelectTicker: (ticker: string | null) => void;
  selectedBenchmark: string;
  onBenchmarkChange: (benchmark: string) => void;
}) {
  const [showFundamentals, setShowFundamentals] = useState(false);
  const minPrices = useMemo(() => {
    const mins: Record<string, { min: number; max: number }> = {};
    for (const d of data) {
      if (d.history.length > 0) {
        const closes = d.history.map((h) => h.close);
        mins[d.ticker] = { min: Math.min(...closes), max: Math.max(...closes) };
      }
    }
    return mins;
  }, [data]);

  const chartLines = useMemo(() => {
    if (data.length === 0) return [];
    const dateSet = new Set<string>();
    for (const d of data) {
      for (const h of d.history) dateSet.add(h.date);
    }
    if (benchmarkData) {
      for (const h of benchmarkData) dateSet.add(h.date);
    }
    const sortedDates = [...dateSet].sort();
    const lines: Array<{
      ticker: string;
      color: string;
      points: { date: string; value: number }[];
    }> = [];

    // Helper: build normalized or real returns
    function buildPoints(hist: { date: string; close: number }[], ticker: string, color: string) {
      if (hist.length === 0) return;
      const t0 = hist[0].close;
      const points = hist.map((h) => ({
        date: h.date,
        value: chartMode === "real" ? (h.close / t0) * 100 : minPrices[ticker]
          ? ((h.close - minPrices[ticker]!.min) / (minPrices[ticker]!.max - minPrices[ticker]!.min)) * 100
          : 50,
      }));
      lines.push({ ticker, color, points });
    }

    data.forEach((d, i) => {
      if (d.history.length > 0) {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const t0 = d.history[0].close;
        const points = d.history.map((h) => ({
          date: h.date,
          value: chartMode === "real"
            ? (h.close / t0) * 100
            : minPrices[d.ticker]
              ? ((h.close - minPrices[d.ticker]!.min) / (minPrices[d.ticker]!.max - minPrices[d.ticker]!.min)) * 100
              : 50,
        }));
        lines.push({ ticker: d.ticker, color, points });
      }
    });

    // Benchmark line (always rendered in real mode, grey)
    if (benchmarkData && benchmarkData.length > 0) {
      const t0 = benchmarkData[0].close;
      const points = benchmarkData.map((h) => ({
        date: h.date,
        value: (h.close / t0) * 100,
      }));
      lines.push({ ticker: "Benchmark", color: "#ffffff", points });
    }

    return lines;
  }, [data, benchmarkData, chartMode, minPrices]);

  const mergedData = useMemo(() => {
    if (chartLines.length === 0) return [];
    const dateSet = new Set<string>();
    for (const line of chartLines) {
      for (const p of line.points) dateSet.add(p.date);
    }
    return [...dateSet].sort().map((date) => {
      const row: Record<string, number | string> = { date };
      for (const line of chartLines) {
        const pt = line.points.find((p) => p.date === date);
        if (pt != null) row[line.ticker] = pt.value;
      }
      return row;
    });
  }, [chartLines]);

  const tvInterval: "60" | "D" | "W" = "D";
  const tvSymbol = selectedTicker
    ? selectedTicker.endsWith(".BA")
      ? `BCBA:${selectedTicker.slice(0, -3)}`
      : selectedTicker
    : "";

  return (
    <div className="space-y-4">
      {/* Controls: chart mode toggle + benchmark selector */}
      <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-0.5 rounded-md border border-border/40 overflow-hidden">
            <button
              onClick={() => onChartModeChange("real")}
              className={`px-3 py-1.5 text-[13px] font-mono transition-colors ${
                chartMode === "real"
                  ? "bg-primary/20 text-primary border-r border-border/40"
                  : "bg-transparent text-muted-foreground hover:text-foreground border-r border-border/40"
              }`}
            >
              Rendimiento Real
            </button>
            <button
              onClick={() => onChartModeChange("normalizado")}
              className={`px-3 py-1.5 text-[13px] font-mono transition-colors ${
                chartMode === "normalizado"
                  ? "bg-primary/20 text-primary"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Precio Normalizado
            </button>
          </div>
          <select
            value={selectedBenchmark}
            onChange={(e) => onBenchmarkChange(e.target.value)}
            className="h-7 rounded-md border border-border/40 bg-background/40 px-2 text-[13px] font-mono text-foreground outline-none focus:border-primary/50"
          >
            {BENCHMARK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

      {/* Chart */}
      {data.length > 0 && mergedData.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <h3 className="mb-2 font-mono text-[13px] font-medium uppercase tracking-wider text-muted-foreground">
            {chartMode === "real" ? "Rendimiento Relativo (Base 100)" : "Precio Normalizado (Min-Max)"}
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={mergedData} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="date"
                tick={AXIS_TICK_SM}
                stroke={GRID_STROKE}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS_TICK}
                stroke={GRID_STROKE}
                axisLine={false}
                tickLine={false}
                width={40}
                domain={chartMode === "real" ? ["auto", "auto"] : [0, 200]}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
              />
              {chartLines.map((line) => (
                <Line
                  key={line.ticker}
                  type="monotone"
                  dataKey={line.ticker}
                  stroke={line.color}
                  dot={false}
                  strokeWidth={line.ticker === "Benchmark" ? 2 : 1.5}
                  strokeDasharray={line.ticker === "Benchmark" ? "4 3" : undefined}
                  name={line.ticker}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Comparative table */}
      <div className="overflow-x-auto w-full">
        <table className="mono w-full text-xs">
          <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-2 py-2 text-left sticky left-0 bg-surface z-10">Ticker</th>
              <th className="px-2 py-2 text-right">Precio</th>
              <th className="px-2 py-2 text-right group relative">
                Var%<span className="ml-1 inline-flex h-3 w-3 cursor-help items-center justify-center rounded-full border border-border/40 text-[7px] leading-none text-muted-foreground" title="Cambio porcentual del precio en la última sesión">?</span>
              </th>
              <th className="px-2 py-2 text-right group relative">
                Var% Per.<span className="ml-1 inline-flex h-3 w-3 cursor-help items-center justify-center rounded-full border border-border/40 text-[7px] leading-none text-muted-foreground" title="Cambio porcentual desde el inicio hasta el final del período seleccionado">?</span>
              </th>
              <th className="px-2 py-2 text-right group relative">
                RSI(14)<span className="ml-1 inline-flex h-3 w-3 cursor-help items-center justify-center rounded-full border border-border/40 text-[7px] leading-none text-muted-foreground" title="RSI &gt; 70: posible sobrecompra. RSI &lt; 30: posible sobreventa">?</span>
              </th>
              <th className="px-2 py-2 text-right group relative">
                P/E<span className="ml-1 inline-flex h-3 w-3 cursor-help items-center justify-center rounded-full border border-border/40 text-[7px] leading-none text-muted-foreground" title="Relación precio/ganancia. &lt; 15: infravalorado. &gt; 30: sobrevalorado">?</span>
              </th>
              <th className="px-2 py-2 text-right">Score</th>
              <th className="px-2 py-2 text-center">Rec.</th>
              <th className="px-2 py-2 text-center">
                <button
                  onClick={() => setShowFundamentals(!showFundamentals)}
                  className="text-[13px] text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted"
                >
                  {showFundamentals ? "Ocultar" : "Ver más"}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const heatVar = heatPct(d.change1d);
              const heatRSI = heatRsi(d.rsi);
              const heatPE = heatPe(d.pe);
              const semaforoScore = clasificacionAEmoji(d.clasificacionJerarquica ?? d.recommendation);
              return (
              <tr
                key={d.ticker}
                className={`border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors ${
                  selectedTicker === d.ticker ? "bg-primary/5 border-primary/30" : ""
                }`}
                onClick={() => onSelectTicker(selectedTicker === d.ticker ? null : d.ticker)}
              >
                <td className="sticky left-0 bg-surface z-10 px-2 py-2 font-medium">{d.ticker}</td>
                <td className="px-2 py-2 text-right">{fmtSemaforoNum(d.price, 2)}</td>
                <td className={`px-2 py-2 text-right ${heatVar}`}>{fmtSemaforoPct(d.change1d, 2)}</td>
                <td className={`px-2 py-2 text-right ${heatPct(d.changePeriod)}`}>{fmtSemaforoPct(d.changePeriod, 2)}</td>
                <td className={`px-2 py-2 text-right ${heatRSI}`}>{fmtSemaforoNum(d.rsi, 1)}</td>
                <td className={`px-2 py-2 text-right ${heatPE}`}>{fmtSemaforoNum(d.pe, 1)}</td>
                <td className="px-2 py-2 text-right" title={`Score técnico: ${d.totalScore >= 0 ? "+" : ""}${d.totalScore.toFixed(2)}`}>
                  {semaforoScore}
                </td>
                <td className="px-2 py-2 text-center">
                  {comparativoRecommendationBadge(d.clasificacionJerarquica ?? d.recommendation)}
                </td>
                <td className="px-2 py-2 text-right">
                  {showFundamentals && (
                    <div className="flex gap-1 items-center justify-end text-[13px] text-muted-foreground">
                      <span title={`P/E vs histórico: ${d.pePercentile != null ? `percentil ${d.pePercentile}% — ${d.pePercentile <= 30 ? "barato" : d.pePercentile >= 70 ? "caro" : "neutro"}` : (d.pePercentileReason ?? "Datos insuficientes")}`}>
                        P/E {d.pePercentile != null ? `${d.pePercentile}%` : "\u2014"}
                      </span>
                      <span className="text-border/60">|</span>
                      <span title="SMA 50 días">{d.sma50 != null ? fmtSemaforoNum(d.sma50, 2) : "\u2014"}</span>
                      <span className="text-border/60">|</span>
                      <span title="SMA 200 días">{d.sma200 != null ? fmtSemaforoNum(d.sma200, 2) : "\u2014"}</span>
                      <span className="text-border/60">|</span>
                      <span title="PEG: Precio/Ganancia vs Crecimiento. Mínimo 1% de crecimiento requerido">{d.peg != null ? fmtSemaforoNum(d.peg, 1) : "\u2014"}</span>
                      <span className="text-border/60">|</span>
                      <span title="Crecimiento de ingresos anual">{fmtSemaforoPct(d.revGrowth, 0)}</span>
                      <span className="text-border/60">|</span>
                      <span title="Margen de beneficio neto">{fmtSemaforoPct(d.profitMargin, 0)}</span>
                      <span className="text-border/60">|</span>
                      <span title="Retorno sobre patrimonio (ROE)">{fmtSemaforoPct(d.roe, 0)}</span>
                    </div>
                  )}
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* Score legend */}
      <details className="text-[13px] text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
          <span className="text-[12px]"></span>
          Leyenda de puntajes
        </summary>
        <div className="flex flex-wrap gap-3 mt-1 pl-3">
          {LEYENDA_SCORE.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1" title={e.desc}>
              <span className={`inline-block h-2 w-2 rounded-full ${e.color}`} />
              <span className="text-[13px]">{e.desc}</span>
            </span>
          ))}
        </div>
      </details>

      {/* Deep-dive chart for selected ticker */}
      {selectedTicker && (
        <div className="rounded-md border border-border/40 bg-background/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[14px] font-semibold text-primary">{selectedTicker}</span>
            <button
              onClick={() => onSelectTicker(null)}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Cerrar
            </button>
          </div>
          <Suspense
            fallback={
              <div className="flex h-[360px] w-full items-center justify-center text-[14px] text-muted-foreground">
                Cargando gráfico…
              </div>
            }
          >
            <TradingViewWidget symbol={tvSymbol} interval={tvInterval} height={360} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
