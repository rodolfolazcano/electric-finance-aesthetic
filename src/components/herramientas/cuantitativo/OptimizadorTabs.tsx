// @ts-nocheck
import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getSemaforoBatch, optimizeAllPortfolios, backtestOptimization, backtestMarkowitzMultidate,
  type OptimizeResponse,
  type AllPortfoliosResult,
  type SemaforoResult,
  type BacktestOptimizationResult,
  type BacktestMarkowitzMultidateResult,
} from "@/lib/herramientas/finance.functions";
import { getYahooQuoteServer, inferMonedaYahoo } from "@/lib/herramientas/market-data.functions";
import type { IOLTitulo } from "@/lib/iol-portfolio.functions";
import { fetchDraftAssetInfo } from "@/lib/draft-asset.functions";
import { resolveDraftTickerFromIOL } from "@/lib/draft-asset-iol-resolver";
import { useIOLPortafolio } from "@/lib/use-iol-portafolio";
import { useIOLSync } from "@/hooks/useIOLSync";
import { CHART_TOOLTIP_STYLE, AXIS_TICK, AXIS_TICK_SM, GRID_STROKE, PIE_COLORS, ChartTip } from "@/components/herramientas/shared/chart-constants";
import { PortfolioAssetTable } from "@/components/herramientas/PortfolioAssetTable";
import { PortfolioDraftPanel,
  type DraftAsset,
} from "@/components/optimizer/PortfolioDraftPanel";
import { OptimizerChat } from "@/components/optimizer/OptimizerChat";
import { AnalisisPortafolioSubTab } from "@/components/optimizer/AnalisisPortafolioSubTab";
import { RebalanceadorSubTab } from "@/components/sections/RebalanceadorSubTab";
import { clipCovariance, eigenDecomposition } from "@/lib/labadie/spectral";
import universoCompleto from "@/data/unificado_completo.json";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import bcbaCedearsData from "@/lib/bcba-cedears.json";
import { toCedearTicker, fmtNum } from "@/components/herramientas/shared/formatters";

const SECTOR_EN_TO_ES: Record<string, string> = {
  Technology: "Tecnología",
  "Communication Services": "Servicios de Comunicación",
  "Consumer Cyclical": "Consumo Cíclico",
  "Consumer Defensive": "Defensiva del Consumidor",
  Healthcare: "Cuidado de la Salud",
  "Financial Services": "Servicios Financieros",
  Energy: "Energía",
  "Basic Materials": "Materiales Básicos",
  Industrials: "Acciones Industriales",
  Utilities: "Utilidades",
  "Real Estate": "Bienes Raíces",
};
function traducirSector(s: string): string {
  return SECTOR_EN_TO_ES[s] ?? s;
}
function traducirIndustria(i: string): string {
  return i;
}

export function OptimizadorTabs() {
  const [subtab, setSubtab] = useState("manual");
  const [modoOpt, setModoOpt] = useState<"min_var" | "max_sharpe" | "frontera">("min_var");
  const [clipInfo, setClipInfo] = useState<{ sigma2Used: number | null; lambdaPlus: number | null; clipped: number | null }>({ sigma2Used: null, lambdaPlus: null, clipped: null });
  // B4 demo clipCovariance con matriz 3x3 sintética para caption
  useEffect(() => {
    try {
      const demoCov = [[0.04, 0.01, 0.005],[0.01,0.09,0.02],[0.005,0.02,0.16]];
      const { sigma2Used, lambdaPlus, values } = clipCovariance(demoCov, 252) as any;
      const clipped = values ? values.filter((v: number) => v <= lambdaPlus).length : 0;
      setClipInfo({ sigma2Used, lambdaPlus, clipped });
      if (demoCov.length > 30) console.warn("[spectral] N>30 Jacobi puede ser lento, igual se ejecuta");
    } catch {}
  }, []);
  return (
    <div className="space-y-4">
      <div className="rounded border border-border/40 bg-muted/5 p-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono text-muted-foreground">Modo optimización:</span>
        {(["min_var","max_sharpe","frontera"] as const).map(m => (
          <button key={m} onClick={() => setModoOpt(m)} className={`px-2 py-1 rounded text-[11px] font-mono border ${modoOpt===m ? "bg-primary/10 border-primary/40 text-primary" : "border-border/40 text-muted-foreground"}`}>{m}</button>
        ))}
        <span className="ml-2 text-[11px] font-mono text-muted-foreground">
          {clipInfo.lambdaPlus != null ? `λ+=${clipInfo.lambdaPlus.toFixed(2)}, σ²=${clipInfo.sigma2Used?.toFixed(4)}, k clippeados ${clipInfo.clipped ?? "—"}` : "clipCovariance no calculado"}
        </span>
        <span className="text-[10px] text-muted-foreground ml-2">usa eigenDecomposition (spectral), sin libs externas</span>
      </div>
      <div className="flex gap-1.5 border-b border-border/40 pb-2 flex-wrap">
        <button
          onClick={() => setSubtab("manual")}
          className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
            subtab === "manual"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          OptimizaciÃ³n
        </button>
        <button
          onClick={() => setSubtab("analisis")}
          className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
            subtab === "analisis"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          AnÃ¡lisis del Portafolio
        </button>
        <button
          onClick={() => setSubtab("rebalanceo")}
          className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
            subtab === "rebalanceo"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          Rebalanceo
        </button>
        <button
          onClick={() => setSubtab("backtest")}
          className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
            subtab === "backtest"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          Backtest
        </button>
      </div>
      {subtab === "manual" ? (
        <PortafolioPage />
      ) : subtab === "backtest" ? (
        <BacktestPage />
      ) : subtab === "analisis" ? (
        <AnalisisPortafolioSubTab />
      ) : subtab === "rebalanceo" ? (
        <RebalanceadorSubTab />
      ) : (
        <OptimizadorIOL />
      )}
    </div>
  );
}

// â”€â”€â”€ Optimizador â€” Portafolio IOL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TIPOS_OPTIMIZABLES = new Set(["CEDEARS", "ACCIONES", "ACCION"]);

function OptimizadorIOL() {
  const optFn = useServerFn(optimizeAllPortfolios);
  const iol = useIOLPortafolio();
  const [clienteValorizado, setClienteValorizado] = useState(0);
  const [gruposMoneda, setGruposMoneda] = useState<Array<{ moneda: string; tickers: string[] }>>(
    [],
  );
  const [monedaSel, setMonedaSel] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [numSims, setNumSims] = useState(2000);
  const [years, setYears] = useState(2);
  const [error, setError] = useState("");
  const [strategyTab, setStrategyTab] = useState("");
  const [benchmarkInput, setBenchmarkInput] = useState("SPY, ^MERV");
  const [autoDetectBenchmarks, setAutoDetectBenchmarks] = useState(true);
  const [currentPositions, setCurrentPositions] = useState<
    Array<{ ticker: string; valorizado: number; peso: number }>
  >([]);
  const [rebalanceResult, setRebalanceResult] = useState<Array<{
    ticker: string;
    peso: number;
    monto: number;
    saldoDisponible?: number;
  }> | null>(null);
  const [randomTickers, setRandomTickers] = useState<string[] | null>(null);
  const [lastPortfolioTickers, setLastPortfolioTickers] = useState<string[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState<{ ars: DraftAsset[]; usd: DraftAsset[] }>({
    ars: [],
    usd: [],
  });
  const draftFn = useServerFn(fetchDraftAssetInfo);

  // Auto-fetch DraftAssetInfo for pending assets
  useEffect(() => {
    const all = [...portfolioDraft.ars, ...portfolioDraft.usd];
    const pending = all.find((a) => a.fetchStatus === "pending");
    if (!pending) return;
    const timer = setTimeout(async () => {
      try {
        const res = await draftFn({ data: { symbol: pending.symbol, moneda: pending.moneda } });
        setPortfolioDraft((prev) => {
          const upd = (arr: DraftAsset[]) =>
            arr.map((a) =>
              a.symbol === pending.symbol
                ? {
                    ...a,
                    ...res,
                    fetchStatus: res.error ? ("error" as const) : ("ok" as const),
                    fetchError: res.error,
                  }
                : a,
            );
          return pending.moneda === "ARS"
            ? { ...prev, ars: upd(prev.ars) }
            : { ...prev, usd: upd(prev.usd) };
        });
      } catch {
        setPortfolioDraft((prev) => {
          const upd = (arr: DraftAsset[]) =>
            arr.map((a) =>
              a.symbol === pending.symbol
                ? { ...a, fetchStatus: "error" as const, fetchError: "Error de red" }
                : a,
            );
          return pending.moneda === "ARS"
            ? { ...prev, ars: upd(prev.ars) }
            : { ...prev, usd: upd(prev.usd) };
        });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [portfolioDraft, draftFn]);

  const addDraftAsset = useCallback((symbol: string, moneda: "ARS" | "USD") => {
    setPortfolioDraft((prev) => {
      const all = [...prev.ars, ...prev.usd];
      if (all.some((a) => a.symbol === symbol)) return prev;
      const asset: DraftAsset = {
        symbol,
        moneda,
        cantidad: 1,
        pesoManual: undefined,
        sector: null,
        sectorKey: null,
        industry: null,
        ultimoPrecio: null,
        beta: null,
        retornoEsperadoAnual: null,
        volatilidadAnual: null,
        dailyLogReturns: [],
        longName: null,
        fetchStatus: "pending",
        fetchError: null,
      };
      return moneda === "ARS"
        ? { ...prev, ars: [...prev.ars, asset] }
        : { ...prev, usd: [...prev.usd, asset] };
    });
  }, []);

  const updateDraftCantidad = useCallback((symbol: string, cantidad: number) => {
    setPortfolioDraft((prev) => {
      const upd = (arr: DraftAsset[]) =>
        arr.map((a) => (a.symbol === symbol ? { ...a, cantidad } : a));
      return prev.ars.some((a) => a.symbol === symbol)
        ? { ...prev, ars: upd(prev.ars) }
        : { ...prev, usd: upd(prev.usd) };
    });
  }, []);

  const removeDraftAsset = useCallback((symbol: string) => {
    setPortfolioDraft((prev) => ({
      ars: prev.ars.filter((a) => a.symbol !== symbol),
      usd: prev.usd.filter((a) => a.symbol !== symbol),
    }));
  }, []);

  const allDraftAssets = useMemo(
    () => [...portfolioDraft.ars, ...portfolioDraft.usd],
    [portfolioDraft],
  );
  const activeBenchmarks = useMemo(() => {
    return benchmarkInput
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
  }, [benchmarkInput]);
  // Map IOL BCBA CEDEARs to US tickers for Yahoo Finance data quality
  const resolveTickerForYahoo = useCallback((t: string) => {
    const base = t.replace(/\.BA$/i, "");
    const entry = (bcbaCedearsData as Record<string, { underlying: string; name: string }>)[base];
    if (entry) return entry.underlying;
    return t;
  }, []);

  const grupoActivo = useMemo(
    () => gruposMoneda.find((g) => g.moneda === monedaSel),
    [gruposMoneda, monedaSel],
  );
  const m = useMutation({
    mutationFn: () => {
      const useTickers = randomTickers ?? grupoActivo?.tickers ?? [];
      const tickers = useTickers.map(resolveTickerForYahoo);
      setLastPortfolioTickers(tickers);
      const notionalVal = clienteValorizado > 0 ? clienteValorizado : 1000000;
      return optFn({
        data: {
          tickers,
          notional: notionalVal,
          numSimulations: numSims,
          benchmarks: autoDetectBenchmarks ? [] : activeBenchmarks,
          autoDetectBenchmarks,
          years,
        },
      });
    },
  });

  const allUniverseTickers = useMemo(() => {
    const tickers: string[] = [];
    const raw = universoCompleto as any;
    const sectores = raw.sectores ?? raw;
    for (const sector of Object.keys(sectores)) {
      if (sector === "No disponible" || sector === "Sin Clasificar") continue;
      const industrias = sectores[sector].industrias ?? sectores[sector];
      for (const industry of Object.keys(industrias)) {
        for (const item of industrias[industry]) {
          if (item.ticker) tickers.push(item.ticker);
        }
      }
    }
    return [...new Set(tickers)];
  }, []);

  const doRebalance = () => {
    if (clienteValorizado <= 0) return;
    const isArs = monedaSel === "ARS";
    const universePool = isArs
      ? allUniverseTickers.filter((t) => !t.includes(".")).map((t) => toCedearTicker(t, "ARS"))
      : allUniverseTickers;
    const count = 3 + Math.floor(Math.random() * 6);
    const shuffled = universePool.sort(() => Math.random() - 0.5).slice(0, count);
    setRandomTickers(shuffled);
    const rawWeights = shuffled.map(() => Math.random());
    const totalW = rawWeights.reduce((s, v) => s + v, 0);
    const normWeights = rawWeights.map((w) => w / totalW);
    const totalInvertido = currentPositions.reduce((s, p) => s + p.valorizado, 0);
    const disponible = clienteValorizado - totalInvertido;
    const rawResult = shuffled.map((ticker, i) => ({
      ticker,
      peso: Math.round(normWeights[i] * 10000) / 100,
      monto: Math.round(normWeights[i] * clienteValorizado * 100) / 100,
      saldoDisponible: Math.round(disponible * 100) / 100,
    }));
    const sumPct = rawResult.reduce((s, r) => s + r.peso, 0);
    if (rawResult.length > 0) rawResult[rawResult.length - 1].peso += +(100 - sumPct).toFixed(2);
    const sumMonto = rawResult.reduce((s, r) => s + r.monto, 0);
    if (rawResult.length > 0)
      rawResult[rawResult.length - 1].monto += +(clienteValorizado - sumMonto).toFixed(2);
    setRebalanceResult(rawResult);
    // Run optimizer with the randomly selected tickers (will trigger via randomTickers state update)
    setTimeout(() => m.mutate(), 0);
  };

  const resolveSubyacente = (a: any) => {
    const titulo: IOLTitulo = {
      simbolo: a.titulo?.simbolo || a.simbolo || "",
      descripcion: a.titulo?.descripcion || "",
      pais: a.titulo?.pais || "",
      mercado: a.titulo?.mercado || "",
      tipo: a.titulo?.tipo || a.tipo || "",
      plazo: a.titulo?.plazo || "t0",
      moneda: a.titulo?.moneda || a.moneda || "",
    };
    const resolved = resolveDraftTickerFromIOL(titulo);
    return {
      ticker: resolved.priceSymbol || titulo.simbolo,
      moneda: resolved.moneda,
      category: resolved.category,
      canUseYahoo: resolved.canUseYahoo,
      warning: resolved.warning,
    };
  };

  const loadPortfolio = useCallback(
    async (cliente?: number) => {
      setLoadingPortfolio(true);
      setError("");
      m.reset();
      try {
        const activos = await iol.loadPortfolio(cliente);
        const elegibles = activos.filter((a: any) => {
          const t = (a.titulo?.tipo || a.tipo || "").toUpperCase();
          return a.cantidad > 0 && TIPOS_OPTIMIZABLES.has(t);
        });
        if (elegibles.length === 0) {
          setError("No hay CEDEARs ni acciones en el portafolio.");
          return;
        }
        const posList: Array<{ ticker: string; valorizado: number }> = [];
        const monedaMap = new Map<string, string[]>();
        for (const a of elegibles) {
          const { ticker, moneda } = resolveSubyacente(a);
          posList.push({ ticker, valorizado: a.valorizado || 0 });
          if (!monedaMap.has(moneda)) monedaMap.set(moneda, []);
          monedaMap.get(moneda)!.push(ticker);
        }
        const grupos = [...monedaMap.entries()].map(([moneda, tickers]) => ({
          moneda,
          tickers: [...new Set(tickers)],
        }));
        setGruposMoneda(grupos);
        // Also populate portfolioDraft for the live dataframe
        const draftArs: DraftAsset[] = [];
        const draftUsd: DraftAsset[] = [];
        for (const a of elegibles) {
          const { ticker, moneda } = resolveSubyacente(a);
          const d: DraftAsset = {
            symbol: ticker,
            moneda,
            cantidad: a.cantidad || 0,
            pesoManual: undefined,
            sector: null,
            sectorKey: null,
            industry: null,
            ultimoPrecio: null,
            beta: null,
            retornoEsperadoAnual: null,
            volatilidadAnual: null,
            dailyLogReturns: [],
            longName: null,
            fetchStatus: "pending",
            fetchError: null,
          };
          if (moneda === "ARS") draftArs.push(d);
          else draftUsd.push(d);
        }
        setPortfolioDraft({ ars: draftArs, usd: draftUsd });
        const totalValor = posList.reduce((s, p) => s + p.valorizado, 0);
        setCurrentPositions(
          posList.map((p) => ({
            ticker: p.ticker,
            valorizado: p.valorizado,
            peso: totalValor > 0 ? (p.valorizado / totalValor) * 100 : 0,
          })),
        );
        if (grupos.length > 0) setMonedaSel(grupos[0].moneda);
        if (grupos.length > 1)
          setError(
            `Se detectaron ${grupos.length} monedas distintas (${grupos.map((g) => g.moneda).join(", ")}). SeleccionÃ¡ una para optimizar.`,
          );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingPortfolio(false);
      }
    },
    [iol, m],
  );

  const handleLoad = async () => {
    if (!iol.accessToken) {
      setError("IniciÃ¡ sesiÃ³n en IOL.");
      return;
    }
    if (iol.esAsesor === null) await iol.loadClientes();
    if ((iol.esAsesor && iol.clienteId) || iol.esAsesor === false) {
      await loadPortfolio(iol.esAsesor ? iol.clienteId : undefined);
    }
  };

  useEffect(() => {
    if (iol.accessToken && iol.esAsesor === null) iol.loadClientes();
  }, [iol.accessToken, iol.esAsesor, iol.loadClientes]);

  if (!iol.accessToken) {
    return (
      <div className="glass flex min-h-[200px] items-center justify-center p-10 text-center">
        <p className="text-sm text-muted-foreground">
          IniciÃ¡ sesiÃ³n en IOL desde el panel superior.
        </p>
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="space-y-3">
        {iol.loading && (
          <div className="glass p-4 text-center text-xs text-muted-foreground">
            Verificando tipo de cuenta...
          </div>
        )}
        {iol.esAsesor && iol.clientes.length > 0 && (
          <div className="glass p-4 space-y-2">
            <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Seleccionar Cliente
            </div>
            <select
              value={iol.clienteId}
              onChange={(e) => {
                const c = iol.clientes.find((x) => x.id === Number(e.target.value));
                iol.setClienteId(Number(e.target.value));
                setClienteValorizado(c?.totalCuentaValorizado ?? 0);
              }}
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
              Cuenta particular â€” se usarÃ¡ tu portafolio (solo CEDEARs y acciones).
            </div>
          </div>
        )}
        <button
          onClick={handleLoad}
          disabled={loadingPortfolio || (iol.esAsesor === true && !iol.clienteId)}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loadingPortfolio
            ? "Cargando portafolio..."
            : iol.esAsesor
              ? "Cargar portafolio del cliente"
              : "Cargar mi portafolio"}
        </button>
        {gruposMoneda.length > 0 && (
          <div className="glass p-4 space-y-3">
            <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Activos por moneda
            </div>
            {gruposMoneda.map((g) => (
              <div key={g.moneda}>
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="radio"
                    name="moneda"
                    checked={monedaSel === g.moneda}
                    onChange={() => setMonedaSel(g.moneda)}
                    className="accent-primary"
                  />
                  <span className="font-mono text-xs font-semibold text-primary">{g.moneda}</span>
                  <span className="text-[13px] text-muted-foreground">
                    ({g.tickers.length} activos)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 pl-5">
                  {g.tickers.map((t) => (
                    <span
                      key={t}
                      className="font-mono text-[13px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {monedaSel && grupoActivo && grupoActivo.tickers.length >= 2 && (
              <div className="space-y-3 pt-2 border-t border-border/40">
                <div className="flex gap-2 items-center">
                  <span className="mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                    Simulaciones
                  </span>
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={numSims}
                    onChange={(e) => setNumSims(Number(e.target.value))}
                    className="w-24 bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                    Periodo
                  </span>
                  <select
                    value={years}
                    onChange={(e) => setYears(Number(e.target.value))}
                    className="w-20 bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
                  >
                    <option value={0.5}>0.5</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoDetectBenchmarks}
                      onChange={(e) => setAutoDetectBenchmarks(e.target.checked)}
                      className="h-3 w-3 accent-primary"
                    />
                    <span className="mono text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
                      Auto-detectar mejor benchmark (mayor RÂ²)
                    </span>
                  </label>
                  {!autoDetectBenchmarks && (
                    <input
                      value={benchmarkInput}
                      onChange={(e) => setBenchmarkInput(e.target.value)}
                      placeholder="SPY, ^MERV, QQQ..."
                      className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => m.mutate()}
                    disabled={m.isPending}
                    className="flex-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {m.isPending ? "Optimizando..." : `Optimizar (${monedaSel})`}
                  </button>
                  {clienteValorizado > 0 && (
                    <button
                      onClick={doRebalance}
                      disabled={m.isPending}
                      className="rounded-md bg-primary/20 px-3 py-2 text-xs font-mono text-foreground transition-opacity hover:bg-primary/30 disabled:opacity-50 whitespace-nowrap"
                    >
                      Rebalanceo Aleatorio
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="p-3 rounded-md bg-danger/10 border border-danger/30">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-4">
        {/* â”€â”€ Live portfolio draft dataframe (before Recalcular) â”€â”€ */}
        {allDraftAssets.length > 0 && (
          <PortfolioDraftPanel
            assets={allDraftAssets}
            onUpdateCantidad={updateDraftCantidad}
            onUpdatePesoManual={() => {}}
            onRemove={removeDraftAsset}
            onAddTicker={addDraftAsset}
          />
        )}

        {!m.data && !m.isPending && !loadingPortfolio && !error && allDraftAssets.length === 0 && (
          <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
            <p className="text-sm text-muted-foreground">
              CargÃ¡ tu portafolio IOL y optimizÃ¡ CEDEARs o acciones agrupados por moneda.
            </p>
          </div>
        )}
        {m.isPending && (
          <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
            <p className="text-sm text-muted-foreground">Calculando optimizaciÃ³n...</p>
          </div>
        )}
        {rebalanceResult && (
          <div className="glass p-4 space-y-2">
            <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Rebalanceo Sugerido
            </div>
            <div className="mono text-[13px] text-muted-foreground mb-2">
              Valor cartera: ${clienteValorizado.toLocaleString()} Â· Invertido: $
              {rebalanceResult.reduce((s, r) => s + r.monto, 0).toLocaleString()} Â· Disponible: $
              {rebalanceResult[0]?.saldoDisponible?.toLocaleString() ?? 0}
            </div>
            <table className="mono w-full text-xs">
              <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-2 py-1 text-left">Ticker</th>
                  <th className="px-2 py-1 text-right">Peso %</th>
                  <th className="px-2 py-1 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {rebalanceResult.map((r) => (
                  <tr key={r.ticker} className="border-b border-border/30">
                    <td className="px-2 py-1 font-medium">{r.ticker}</td>
                    <td className="px-2 py-1 text-right">{r.peso.toFixed(2)}%</td>
                    <td className="px-2 py-1 text-right">${r.monto.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t border-border/60">
                  <td className="px-2 py-1">Total</td>
                  <td className="px-2 py-1 text-right">
                    {rebalanceResult.reduce((s, r) => s + r.peso, 0).toFixed(2)}%
                  </td>
                  <td className="px-2 py-1 text-right">
                    ${rebalanceResult.reduce((s, r) => s + r.monto, 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {m.data && (
          <AllOptimizerResult
            data={m.data}
            tab={strategyTab}
            onTabChange={setStrategyTab}
            portfolioTickers={lastPortfolioTickers}
          />
        )}
        {m.isError && (
          <div className="p-4 rounded-md bg-danger/10 border border-danger/30">
            <p className="text-danger text-sm">{(m.error as Error).message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Optimizador â€” Backtest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BacktestPage() {
  const fn = useServerFn(backtestOptimization);
  const fnMultidate = useServerFn(backtestMarkowitzMultidate);
  const [mode, setMode] = useState<"single" | "multidate">("single");
  const [tickers, setTickers] = useState("GGAL.BA, YPFD.BA, BMA.BA, PAMP.BA, TECO2.BA");
  const [cutoffDate, setCutoffDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [cutoffDates, setCutoffDates] = useState<string[]>([
    (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    })(),
  ]);
  const [years, setYears] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestOptimizationResult | null>(null);
  const [mdResult, setMdResult] = useState<BacktestMarkowitzMultidateResult | null>(null);
  const [error, setError] = useState("");

  const addDate = () => {
    const last = cutoffDates[cutoffDates.length - 1];
    const d = new Date(last);
    d.setMonth(d.getMonth() - 3);
    setCutoffDates([...cutoffDates, d.toISOString().slice(0, 10)]);
  };
  const removeDate = (idx: number) => {
    if (cutoffDates.length <= 1) return;
    setCutoffDates(cutoffDates.filter((_, i) => i !== idx));
  };
  const updateDate = (idx: number, val: string) => {
    const next = [...cutoffDates];
    next[idx] = val;
    setCutoffDates(next);
  };

  const handleRun = useCallback(async () => {
    setError("");
    setResult(null);
    setMdResult(null);
    const list = tickers
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (list.length < 2) {
      setError("IngresÃ¡ al menos 2 tickers");
      return;
    }
    setLoading(true);
    try {
      if (mode === "multidate") {
        const validDates = cutoffDates.filter((d) => d);
        if (validDates.length === 0) {
          setError("IngresÃ¡ al menos una fecha de corte");
          setLoading(false);
          return;
        }
        const res = await fnMultidate({ data: { tickers: list, cutoffDates: validDates, years } });
        setMdResult(res);
      } else {
        const res = await fn({ data: { tickers: list, cutoffDate, years, numSimulations: 2000 } });
        setResult(res);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, [tickers, cutoffDate, cutoffDates, years, mode, fn, fnMultidate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="mono text-[14px] uppercase tracking-[0.22em] text-primary/80">
          Backtest de optimizaciÃ³n
        </div>
        <div className="flex gap-1 items-center">
          <span className="mono text-[13px] text-muted-foreground">Modo:</span>
          <button
            onClick={() => setMode("single")}
            className={`font-mono text-[13px] px-2 py-0.5 rounded border transition-colors ${
              mode === "single"
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            Una fecha
          </button>
          <button
            onClick={() => setMode("multidate")}
            className={`font-mono text-[13px] px-2 py-0.5 rounded border transition-colors ${
              mode === "multidate"
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            MÃºltiples fechas
          </button>
        </div>
      </div>
      <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
        EvaluÃ¡ cÃ³mo le habrÃ­a ido a una optimizaciÃ³n Markowitz en el pasado.
      </h2>

      <div className="glass p-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
              Tickers
            </label>
            <input
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              placeholder="AAPL, MSFT, GOOGL..."
              className="w-64 bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
            />
          </div>
          {mode === "single" ? (
            <div className="flex flex-col gap-1">
              <label className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
                Fecha de corte
              </label>
              <input
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                className="bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
                Fechas de corte
              </label>
              <div className="flex flex-col gap-1">
                {cutoffDates.map((d, i) => (
                  <div key={i} className="flex gap-1 items-center">
                    <input
                      type="date"
                      value={d}
                      onChange={(e) => updateDate(i, e.target.value)}
                      className="bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono w-36"
                    />
                    <button
                      onClick={() => removeDate(i)}
                      disabled={cutoffDates.length <= 1}
                      className="text-[13px] px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground hover:text-danger disabled:opacity-30 font-mono"
                    >
                      x
                    </button>
                  </div>
                ))}
                <button
                  onClick={addDate}
                  className="text-[13px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:text-foreground font-mono self-start"
                >
                  + Agregar fecha
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
              AÃ±os entrenamiento
            </label>
            <select
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
            >
              <option value={1}>1 aÃ±o</option>
              <option value={2}>2 aÃ±os</option>
              <option value={3}>3 aÃ±os</option>
              <option value={5}>5 aÃ±os</option>
            </select>
          </div>
          <button
            onClick={handleRun}
            disabled={loading}
            className="h-8 px-4 rounded text-[13px] font-mono font-semibold bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors disabled:opacity-50"
          >
            {loading ? "Ejecutando..." : "Ejecutar Backtest"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-danger/10 border border-danger/30">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {result && !mdResult && <BacktestResultView result={result} />}
      {mdResult && <BacktestMultidateResultView result={mdResult} />}
    </div>
  );
}

function BacktestMultidateResultView({ result }: { result: BacktestMarkowitzMultidateResult }) {
  const { entries, aggregate, tickers, trainingYears } = result;

  const fmtPct = (v: number) => (v * 100).toFixed(2) + "%";
  const fmtPctSigned = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";

  const chartData = entries.map((e) => ({
    date: e.cutoffDate,
    esperado: e.markowitzExpectedReturn * 100,
    real: e.actualReturn * 100,
    diff: e.diff * 100,
    cagr: e.cagr * 100,
    dd: e.maxDrawdown * 100,
    success: e.success,
  }));

  const sortedByDiff = [...entries].sort((a, b) => b.diff - a.diff);

  return (
    <div className="space-y-4">
      {/* Aggregate summary cards */}
      <div className="grid w-full grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Win Rate (retorno &gt; 0)
          </div>
          <div
            className={`text-lg font-mono ${aggregate.winRate >= 0.5 ? "text-success" : "text-danger"}`}
          >
            {(aggregate.winRate * 100).toFixed(0)}%
          </div>
          <div className="text-[13px] text-muted-foreground font-mono">
            {aggregate.positiveCount}/{aggregate.totalDates} fechas
          </div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Beat Rate (real â‰¥ esperado)
          </div>
          <div
            className={`text-lg font-mono ${aggregate.beatRate >= 0.5 ? "text-success" : "text-warning"}`}
          >
            {(aggregate.beatRate * 100).toFixed(0)}%
          </div>
          <div className="text-[13px] text-muted-foreground font-mono">
            {aggregate.beatCount}/{aggregate.totalDates} fechas
          </div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Retorno real promedio
          </div>
          <div
            className={`text-lg font-mono ${aggregate.avgActualReturn >= 0 ? "text-success" : "text-danger"}`}
          >
            {fmtPctSigned(aggregate.avgActualReturn)}
          </div>
          <div className="text-[13px] text-muted-foreground font-mono">
            Esperado: {fmtPct(aggregate.avgExpectedReturn)}
          </div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Diferencia promedio
          </div>
          <div
            className={`text-lg font-mono ${aggregate.avgDiff >= 0 ? "text-success" : "text-danger"}`}
          >
            {fmtPctSigned(aggregate.avgDiff)}
          </div>
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid w-full grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            CAGR promedio
          </div>
          <div
            className={`text-lg font-mono ${aggregate.avgCagr >= 0 ? "text-success" : "text-danger"}`}
          >
            {fmtPctSigned(aggregate.avgCagr)}
          </div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            MÃ¡x Drawdown promedio
          </div>
          <div className="text-lg font-mono text-danger">{fmtPct(aggregate.avgMaxDrawdown)}</div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Sharpe real promedio
          </div>
          <div className="text-lg font-mono text-foreground">{aggregate.avgSharpe.toFixed(2)}</div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Ventana de fechas
          </div>
          <div className="text-lg font-mono text-muted-foreground">{aggregate.totalDates}</div>
        </div>
      </div>

      {/* Chart: Expected vs Actual across dates */}
      <div className="glass p-3">
        <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Retorno esperado vs real por fecha de corte
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 9 }}
                tickFormatter={(v: number) => v.toFixed(1) + "%"}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{ fontSize: 10 }}
                formatter={(v: number) => v.toFixed(2) + "%"}
              />
              <Bar dataKey="esperado" fill="hsl(var(--primary))" opacity={0.5} name="Esperado" />
              <Bar dataKey="real" fill="hsl(var(--success))" opacity={0.8} name="Real" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Difference chart */}
      <div className="glass p-3">
        <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Diferencia (real - esperado) por corte
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 9 }}
                tickFormatter={(v: number) => v.toFixed(1) + "%"}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{ fontSize: 10 }}
                formatter={(v: number) => v.toFixed(2) + "%"}
              />
              <Bar dataKey="diff" fill="hsl(var(--warning))" opacity={0.7} name="Diferencia">
                {chartData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={chartData[i].diff >= 0 ? "hsl(var(--success))" : "hsl(var(--danger))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-date table */}
      <div className="glass p-3">
        <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Detalle por fecha de corte
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="mono w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground sticky top-0 bg-background">
                <th className="px-2 py-1 text-left">Corte</th>
                <th className="px-2 py-1 text-right">Entrenamiento</th>
                <th className="px-2 py-1 text-right">Forward</th>
                <th className="px-2 py-1 text-right">Ret. esperado</th>
                <th className="px-2 py-1 text-right">Ret. real</th>
                <th className="px-2 py-1 text-right">Dif.</th>
                <th className="px-2 py-1 text-right">CAGR</th>
                <th className="px-2 py-1 text-right">M DD</th>
                <th className="px-2 py-1 text-right">Sharpe</th>
              </tr>
            </thead>
            <tbody>
              {sortedByDiff.map((e) => (
                <tr key={e.cutoffDate} className="border-b border-border/30">
                  <td className="px-2 py-1">{e.cutoffDate}</td>
                  <td className="px-2 py-1 text-right text-muted-foreground">
                    {e.trainingStart} â€” {e.trainingEnd}
                  </td>
                  <td className="px-2 py-1 text-right text-muted-foreground">
                    {e.forwardStart} â€” {e.forwardEnd}
                  </td>
                  <td className="px-2 py-1 text-right text-primary">
                    {fmtPct(e.markowitzExpectedReturn)}
                  </td>
                  <td
                    className={`px-2 py-1 text-right ${e.success ? "text-success" : "text-danger"}`}
                  >
                    {fmtPctSigned(e.actualReturn)}
                  </td>
                  <td
                    className={`px-2 py-1 text-right ${e.diff >= 0 ? "text-success" : "text-danger"}`}
                  >
                    {e.diff >= 0 ? "+" : ""}
                    {fmtPct(e.diff)}
                  </td>
                  <td
                    className={`px-2 py-1 text-right ${e.cagr >= 0 ? "text-success" : "text-danger"}`}
                  >
                    {fmtPctSigned(e.cagr)}
                  </td>
                  <td className="px-2 py-1 text-right text-danger">{fmtPct(e.maxDrawdown)}</td>
                  <td className="px-2 py-1 text-right text-foreground">
                    {e.actualSharpe.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Best vs worst entries */}
      {sortedByDiff.length >= 2 && (
        <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="glass p-3 border-success/30">
            <div className="mono text-[13px] uppercase tracking-wider text-success mb-1">
              Mejor resultado
            </div>
            <div className="text-lg font-mono text-success">
              {fmtPctSigned(sortedByDiff[0].diff)}
            </div>
            <div className="text-[13px] text-muted-foreground font-mono">
              Corte: {sortedByDiff[0].cutoffDate} &middot; Real:{" "}
              {fmtPct(sortedByDiff[0].actualReturn)} vs Esperado:{" "}
              {fmtPct(sortedByDiff[0].markowitzExpectedReturn)}
            </div>
          </div>
          <div className="glass p-3 border-danger/30">
            <div className="mono text-[13px] uppercase tracking-wider text-danger mb-1">
              Peor resultado
            </div>
            <div className="text-lg font-mono text-danger">
              {fmtPctSigned(sortedByDiff[sortedByDiff.length - 1].diff)}
            </div>
            <div className="text-[13px] text-muted-foreground font-mono">
              Corte: {sortedByDiff[sortedByDiff.length - 1].cutoffDate} &middot; Real:{" "}
              {fmtPct(sortedByDiff[sortedByDiff.length - 1].actualReturn)} vs Esperado:{" "}
              {fmtPct(sortedByDiff[sortedByDiff.length - 1].markowitzExpectedReturn)}
            </div>
          </div>
        </div>
      )}

      <div className="text-[13px] text-muted-foreground font-mono text-center">
        {aggregate.totalDates} fechas evaluadas &middot; {trainingYears} aÃ±o(s) de entrenamiento
        &middot; {tickers.join(", ")}
      </div>
    </div>
  );
}

function BacktestResultView({ result }: { result: BacktestOptimizationResult }) {
  const { training, forward, comparison, tickers } = result;

  const formatPct = (v: number) => (v * 100).toFixed(2) + "%";
  const formatPctAnual = (v: number) => (v * 100).toFixed(2) + "%";

  // Merge forward & training equity curves for the chart
  const fwdStart = forward.equityCurve[0]?.date ?? "";
  const mergedEquity = [
    ...training.equityCurve.filter((d) => d.date < fwdStart),
    ...forward.equityCurve,
  ];

  const maxSharpe = training.strategies.find((s) => s.strategy === "max-sharpe")!;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid w-full grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Retorno esperado (MÃ¡x Sharpe)
          </div>
          <div className="text-lg font-mono text-primary">
            {formatPct(comparison.maxSharpeExpectedReturn)}
          </div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Retorno real obtenido
          </div>
          <div
            className={`text-lg font-mono ${comparison.maxSharpeActualReturn >= 0 ? "text-success" : "text-danger"}`}
          >
            {formatPct(comparison.maxSharpeActualReturn)}
          </div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Diferencia
          </div>
          <div
            className={`text-lg font-mono ${comparison.diff >= 0 ? "text-success" : "text-danger"}`}
          >
            {comparison.diff >= 0 ? "+" : ""}
            {formatPct(comparison.diff)}
          </div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Volatilidad real (anual)
          </div>
          <div className="text-lg font-mono text-warning">
            {formatPctAnual(comparison.actualVol)}
          </div>
        </div>
      </div>

      {/* Forward metrics */}
      <div className="grid w-full grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            CAGR (forward)
          </div>
          <div
            className={`text-lg font-mono ${forward.cagr >= 0 ? "text-success" : "text-danger"}`}
          >
            {formatPctAnual(forward.cagr)}
          </div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Sharpe (forward)
          </div>
          <div className="text-lg font-mono text-foreground">{forward.sharpe.toFixed(2)}</div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            MÃ¡x Drawdown
          </div>
          <div className="text-lg font-mono text-danger">
            {(forward.maxDrawdown * 100).toFixed(1)}%
          </div>
        </div>
        <div className="glass p-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Vol esperada (anual)
          </div>
          <div className="text-lg font-mono text-muted-foreground">
            {formatPctAnual(comparison.expectedVol)}
          </div>
        </div>
      </div>

      {/* Equity curve chart */}
      <div className="glass p-3">
        <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Curva de capital â€” entrenamiento + forward
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mergedEquity}>
              <defs>
                <linearGradient id="btEquityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                tickFormatter={(v: string) => v.slice(5)}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 9 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip contentStyle={{ fontSize: 10 }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="url(#btEquityGrad)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Forward equity curve */}
      <div className="glass p-3">
        <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Curva de capital â€” solo forward (post-corte)
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forward.equityCurve}>
              <defs>
                <linearGradient id="btFwdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                tickFormatter={(v: string) => v.slice(5)}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 9 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip contentStyle={{ fontSize: 10 }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--success))"
                fill="url(#btFwdGrad)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Estrategias */}
      <div className="glass p-3">
        <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Estrategias (entrenamiento)
        </div>
        <div className="overflow-x-auto w-full">
          <table className="mono w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="px-2 py-1 text-left">Estrategia</th>
                <th className="px-2 py-1 text-right">Retorno anual</th>
                <th className="px-2 py-1 text-right">Volatilidad</th>
                <th className="px-2 py-1 text-right">Sharpe</th>
              </tr>
            </thead>
            <tbody>
              {training.strategies.map((s) => (
                <tr key={s.strategy} className="border-b border-border/30">
                  <td className="px-2 py-1">{s.label}</td>
                  <td className="px-2 py-1 text-right">{(s.expectedReturn * 100).toFixed(2)}%</td>
                  <td className="px-2 py-1 text-right">{(s.volatility * 100).toFixed(2)}%</td>
                  <td className="px-2 py-1 text-right">{s.sharpe.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pesos MÃ¡x Sharpe */}
      <div className="glass p-3">
        <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Pesos del portafolio MÃ¡x Sharpe usado en forward
        </div>
        <div className="overflow-x-auto w-full">
          <table className="mono w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="px-2 py-1 text-left">Ticker</th>
                <th className="px-2 py-1 text-right">Peso</th>
                <th className="px-2 py-1 text-right">Retorno anual (train)</th>
                <th className="px-2 py-1 text-right">Vol (train)</th>
                <th className="px-2 py-1 text-right">Retorno real (forward)</th>
              </tr>
            </thead>
            <tbody>
              {tickers.map((t) => {
                const w = maxSharpe?.weights[t] ?? 0;
                const ind = training.individual.find((i) => i.ticker === t);
                const fwd = forward.individualReturns.find((i) => i.ticker === t);
                return (
                  <tr key={t} className="border-b border-border/30">
                    <td className="px-2 py-1">{t}</td>
                    <td className="px-2 py-1 text-right">{(w * 100).toFixed(1)}%</td>
                    <td className="px-2 py-1 text-right">
                      {ind ? (ind.meanAnnual * 100).toFixed(2) + "%" : "â€”"}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {ind ? (ind.volAnnual * 100).toFixed(2) + "%" : "â€”"}
                    </td>
                    <td
                      className={`px-2 py-1 text-right ${fwd && fwd.actualReturn >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {fwd ? (fwd.actualReturn * 100).toFixed(2) + "%" : "â€”"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fecha informativa */}
      <div className="text-[13px] text-muted-foreground font-mono text-center">
        Corte: {result.forward.equityCurve[0]?.date ?? "â€”"} &middot; PerÃ­odo de entrenamiento:{" "}
        {result.training.equityCurve[0]?.date ?? "â€”"} a{" "}
        {result.training.equityCurve[result.training.equityCurve.length - 1]?.date ?? "â€”"}
      </div>
    </div>
  );
}

// Portafolio â€” Optimizador
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface TickerItem {
  ticker: string;
  nombre: string;
}

function PortafolioPage() {
  const fn = useServerFn(optimizeAllPortfolios);
  const fnYahooQuote = useServerFn(getYahooQuoteServer);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([
    "GGAL.BA",
    "YPFD.BA",
    "BMA.BA",
    "PAMP.BA",
    "TECO2.BA",
  ]);
  const [notionalARS, setNotionalARS] = useState(15);
  const [notionalUSD, setNotionalUSD] = useState(15);
  const [numSims, setNumSims] = useState(2000);
  const [benchmarkInput, setBenchmarkInput] = useState("^MERV, SPY");
  const [autoDetectBM, setAutoDetectBM] = useState(false);
  const [years, setYears] = useState(2);
  const [strategyTab, setStrategyTab] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [assetType, setAssetType] = useState<"accion" | "cedear">("cedear");
  const [mercadoFilter, setMercadoFilter] = useState("BCBA");
  const [cedearCurrency, setCedearCurrency] = useState<"ARS" | "USD">("ARS");

  // Currency detection
  const [currencyMap, setCurrencyMap] = useState<Record<string, "ARS" | "USD">>({});
  const [isDetectingCurrency, setIsDetectingCurrency] = useState(false);
  const [sectorCurrencyMap, setSectorCurrencyMap] = useState<Record<string, "ARS" | "USD">>({});

  // Split results
  const [resultARS, setResultARS] = useState<AllPortfoliosResult | null>(null);
  const [resultUSD, setResultUSD] = useState<AllPortfoliosResult | null>(null);
  const [optimizingCurrency, setOptimizingCurrency] = useState<"" | "ARS" | "USD" | "ambos">("");
  const [optimizeError, setOptimizeError] = useState("");
  const [viewCurrency, setViewCurrency] = useState<"ARS" | "USD">("ARS");

  const activeBenchmarks = useMemo(() => {
    if (autoDetectBM) return [];
    return benchmarkInput
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
  }, [benchmarkInput, autoDetectBM]);

  // Detect currencies of selected tickers
  const detectCurrencies = useCallback(
    async (tickers: string[]) => {
      if (tickers.length === 0) return;
      setIsDetectingCurrency(true);
      const map: Record<string, "ARS" | "USD"> = {};
      const results = await Promise.allSettled(
        tickers.map((t) => fnYahooQuote({ data: { symbol: t } })),
      );
      tickers.forEach((t, i) => {
        const r = results[i];
        if (r.status === "fulfilled") {
          map[t] = r.value.moneda;
        }
      });
      setCurrencyMap(map);
      setIsDetectingCurrency(false);
      return map;
    },
    [fnYahooQuote],
  );

  // Auto-detect when tickers change
  useEffect(() => {
    if (selectedTickers.length > 0) {
      detectCurrencies(selectedTickers);
    }
  }, [selectedTickers.join(",")]);

  const tickersARS = useMemo(
    () => selectedTickers.filter((t) => currencyMap[t] === "ARS"),
    [selectedTickers, currencyMap],
  );
  const tickersUSD = useMemo(
    () => selectedTickers.filter((t) => currencyMap[t] === "USD"),
    [selectedTickers, currencyMap],
  );

  const handleOptimize = useCallback(async () => {
    setOptimizeError("");
    setResultARS(null);
    setResultUSD(null);

    if (selectedTickers.length < 2) {
      setOptimizeError("SeleccionÃ¡ al menos 2 tickers");
      return;
    }

    let currMap = currencyMap;
    const unknown = selectedTickers.filter((t) => !currMap[t]);
    if (unknown.length > 0) {
      // Fast currency inference from ticker suffix before API call.
      // El sufijo BCBA (.BA) â†’ ARS y el CEDEAR D â†’ USD son autoridad absoluta,
      // por encima de lo que haya devuelto Yahoo (evita casos como "J.BA" â†’ USD).
      const inferred: Record<string, "ARS" | "USD"> = {};
      for (const t of selectedTickers) {
        if (t.endsWith(".BA")) inferred[t] = "ARS";
        else if (t.endsWith("D") && !t.includes(".")) inferred[t] = "USD";
        else if (!currMap[t]) inferred[t] = "USD"; // default US stocks â†’ USD
      }
      currMap = { ...currMap, ...inferred };
      setCurrencyMap(currMap);

      // Async API currency detection (doesn't block the optimization)
      detectCurrencies(selectedTickers).catch(() => {});
    }

    const ars = selectedTickers.filter((t) => currMap[t] === "ARS");
    const usd = selectedTickers.filter((t) => currMap[t] === "USD");

    if (ars.length >= 2 && usd.length >= 2) {
      setOptimizingCurrency("ambos");
      const [arsRes, usdRes] = await Promise.all([
        fn({
          data: {
            tickers: ars,
            notional: notionalARS,
            numSimulations: numSims,
            benchmarks: activeBenchmarks,
            autoDetectBenchmarks: autoDetectBM,
            years,
          },
        }).catch((e) => {
          setOptimizeError(`ARS: ${(e as Error).message}`);
          return null;
        }),
        fn({
          data: {
            tickers: usd,
            notional: notionalUSD,
            numSimulations: numSims,
            benchmarks: activeBenchmarks,
            autoDetectBenchmarks: autoDetectBM,
            years,
          },
        }).catch((e) => {
          setOptimizeError(`USD: ${(e as Error).message}`);
          return null;
        }),
      ]);
      if (arsRes) setResultARS(arsRes);
      if (usdRes) setResultUSD(usdRes);
    } else if (ars.length >= 2) {
      setOptimizingCurrency("ARS");
      const r = await fn({
        data: {
          tickers: ars,
          notional: notionalARS,
          numSimulations: numSims,
          benchmarks: activeBenchmarks,
          autoDetectBenchmarks: autoDetectBM,
          years,
        },
      }).catch((e) => {
        setOptimizeError((e as Error).message);
        return null;
      });
      if (r) setResultARS(r);
    } else if (usd.length >= 2) {
      setOptimizingCurrency("USD");
      const r = await fn({
        data: {
          tickers: usd,
          notional: notionalUSD,
          numSimulations: numSims,
          benchmarks: activeBenchmarks,
          autoDetectBenchmarks: autoDetectBM,
          years,
        },
      }).catch((e) => {
        setOptimizeError((e as Error).message);
        return null;
      });
      if (r) setResultUSD(r);
    } else {
      const nArs = ars.length;
      const nUsd = usd.length;
      if (nArs === 0 && nUsd === 0) {
        setOptimizeError(
          "No se pudo detectar la moneda de los tickers seleccionados. VerificÃ¡ que los tickers sean vÃ¡lidos.",
        );
      } else if (nArs < 2 && nUsd < 2) {
        setOptimizeError(
          `Se necesitan al menos 2 tickers de la misma moneda. ARS: ${nArs}, USD: ${nUsd}. AgregÃ¡ mÃ¡s tickers de una misma moneda.`,
        );
      } else if (nArs < 2) {
        setOptimizeError(
          `Solo USD (${nUsd} tickers) pero Capital USD no estÃ¡ configurado. AjustÃ¡ el capital o agregÃ¡ mÃ¡s tickers ARS.`,
        );
      } else {
        setOptimizeError(
          `Solo ARS (${nArs} tickers) pero Capital ARS no estÃ¡ configurado. AjustÃ¡ el capital o agregÃ¡ mÃ¡s tickers USD.`,
        );
      }
    }
    setOptimizingCurrency("");
  }, [
    selectedTickers,
    currencyMap,
    notionalARS,
    notionalUSD,
    numSims,
    years,
    activeBenchmarks,
    autoDetectBM,
    fn,
    detectCurrencies,
  ]);

  const _rawSectores = (universoCompleto as any).sectores ?? universoCompleto;
  const sectoresData = useMemo(() => {
    const out: Record<string, Record<string, any[]>> = {};
    for (const [sec, val] of Object.entries(_rawSectores as Record<string, any>)) {
      if (sec === "version" || sec === "lastUpdated") continue;
      const industrias = (val as any)?.industrias ?? val;
      if (industrias && typeof industrias === "object" && !Array.isArray(industrias)) {
        out[sec] = industrias as Record<string, any[]>;
      }
    }
    return out;
  }, []);

  // Precompute which sectors/industrias have CEDEARs (para filtrar los dropdowns)
  const cedearSectorsMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const [sec, industrias] of Object.entries(
      sectoresData as Record<string, Record<string, any[]>>,
    )) {
      for (const [ind, items] of Object.entries(industrias)) {
        for (const item of items) {
          if (item.tipo === "cedear") {
            if (!map[sec]) map[sec] = new Set();
            map[sec].add(ind);
          }
        }
      }
    }
    return map;
  }, [sectoresData]);

  const CEDEAR_EXCLUDED_SECTORS = new Set([
    "Renta Fija",
    "Fondos y ETFs",
    "Sin Clasificar",
    "No Disponible / Error",
  ]);

  const sectorList = useMemo(() => {
    const all = Object.keys(sectoresData)
      .sort()
      .filter((s) => !CEDEAR_EXCLUDED_SECTORS.has(s));
    if (assetType === "accion") return all;
    return all.filter((s) => cedearSectorsMap[s] && cedearSectorsMap[s].size > 0);
  }, [sectoresData, assetType, cedearSectorsMap]);

  const industryList = useMemo(() => {
    if (!sectorFilter || CEDEAR_EXCLUDED_SECTORS.has(sectorFilter)) return [];
    const industrias = (sectoresData as Record<string, Record<string, any[]>>)[sectorFilter];
    if (!industrias) return [];
    const all = Object.keys(industrias).sort();
    if (assetType === "accion") return all;
    // CEDEAR mode: solo industrias que tengan CEDEARs
    const indSet = cedearSectorsMap[sectorFilter];
    if (!indSet) return [];
    return all.filter((ind) => indSet.has(ind));
  }, [sectorFilter, sectoresData, assetType, cedearSectorsMap]);
  const tickersFromFilter = useMemo((): any[] => {
    if (!sectorFilter) return [];
    const industrias = (sectoresData as Record<string, Record<string, any[]>>)[sectorFilter];
    if (!industrias) return [];
    if (industryFilter) return industrias[industryFilter] ?? [];
    return Object.values(industrias).flat();
  }, [sectorFilter, industryFilter, sectoresData]);

  // Filter sector/industry tickers by asset type + market/currency
  const filteredSectorTickers = useMemo(() => {
    if (tickersFromFilter.length === 0) return [];
    return tickersFromFilter.filter((t) => {
      const item = t as any;
      if (assetType === "accion") {
        return item.tipo === "accion" && item.mercado && item.mercado.includes(mercadoFilter);
      }
      // cedear
      if (item.tipo !== "cedear") return false;
      if (cedearCurrency === "USD")
        return (
          typeof item.ticker === "string" && item.ticker.endsWith("D") && !item.ticker.includes(".")
        );
      return typeof item.ticker === "string" && item.ticker.endsWith(".BA");
    });
  }, [tickersFromFilter, assetType, mercadoFilter, cedearCurrency]);

  // Detect currencies for sector/industry tickers
  useEffect(() => {
    if (!sectorFilter || tickersFromFilter.length === 0) return;
    const undetected = tickersFromFilter.filter(
      (t) =>
        !sectorCurrencyMap[t.ticker] && !currencyMap[t.ticker] && !currencyMap[t.ticker + ".BA"],
    );
    if (undetected.length === 0) return;
    Promise.allSettled(undetected.map((t) => fnYahooQuote({ data: { symbol: t.ticker } }))).then(
      (results) => {
        const updates: Record<string, "ARS" | "USD"> = {};
        undetected.forEach((t, i) => {
          const r = results[i];
          if (r.status === "fulfilled") {
            updates[t.ticker] = r.value.moneda;
          }
        });
        setSectorCurrencyMap((prev) => ({ ...prev, ...updates }));
      },
    );
  }, [sectorFilter, tickersFromFilter, fnYahooQuote, sectorCurrencyMap, currencyMap]);

  const addTicker = (sym: string) => {
    if (!selectedTickers.includes(sym)) setSelectedTickers((prev) => [...prev, sym]);
  };
  const removeTicker = (sym: string) => setSelectedTickers((prev) => prev.filter((t) => t !== sym));

  // Aplica la lista generada por el asistente IA (chat lateral) al optimizador
  const handleAiApplyTickers = (tickers: string[], _especie: "ARS" | "USD") => {
    if (!tickers || tickers.length === 0) return;
    setSelectedTickers((prev) => {
      const next = [...prev];
      tickers.forEach((t) => {
        if (t && !next.includes(t)) next.push(t);
      });
      return next;
    });
  };

  // Importar portafolio sincronizado de IOL dentro del tab unificado "OptimizaciÃ³n"
  const iolSync = useIOLSync();
  const [iolPending, setIolPending] = useState(false);
  const handleImportarIOL = () => {
    if (!iolSync.isLoggedIn || iolSync.isLoading) return;
    const inputs = iolSync.syncData?.portfolioInputs ?? [];
    if (inputs.length > 0) {
      inputs.forEach((p) => addTicker(p.ticker));
      return;
    }
    setIolPending(true);
    iolSync.refetch();
  };
  useEffect(() => {
    if (iolPending && iolSync.syncData?.portfolioInputs?.length) {
      iolSync.syncData.portfolioInputs.forEach((p) => addTicker(p.ticker));
      setIolPending(false);
    }
  }, [iolPending, iolSync.syncData]);

  // Auto-fetch semaforo data for selected tickers
  const semaforoQuery = useQuery({
    queryKey: ["portafolio-semaforo", selectedTickers.join(",")],
    queryFn: async () => {
      if (selectedTickers.length === 0) return [];
      const batchSize = 20;
      const all: SemaforoResult[] = [];
      for (let i = 0; i < selectedTickers.length; i += batchSize) {
        const slice = selectedTickers.slice(i, i + batchSize);
        const result = await getSemaforoBatch({ data: { tickers: slice } });
        all.push(...result);
      }
      return all;
    },
    enabled: selectedTickers.length > 0,
    staleTime: 60_000,
  });

  const semaforoData = semaforoQuery.data ?? [];
  const semaforoLoading = semaforoQuery.isLoading;
  const semaforoError = semaforoQuery.isError ? "Error al obtener datos de anÃ¡lisis" : null;

  const semaforoARS = useMemo(
    () => semaforoData.filter((d) => d.currency === "ARS" || currencyMap[d.ticker] === "ARS"),
    [semaforoData, currencyMap],
  );
  const semaforoUSD = useMemo(
    () => semaforoData.filter((d) => d.currency === "USD" || currencyMap[d.ticker] === "USD"),
    [semaforoData, currencyMap],
  );

  // Un Ãºnico dataframe mezclado (sin duplicados) para el modo de visualizaciÃ³n ARS | Todos | USD
  const allSemaforo = useMemo(() => {
    const seen = new Set<string>();
    const merged: SemaforoResult[] = [];
    for (const d of [...semaforoARS, ...semaforoUSD]) {
      if (!seen.has(d.ticker)) {
        seen.add(d.ticker);
        merged.push(d);
      }
    }
    return merged;
  }, [semaforoARS, semaforoUSD]);

  const removeSemaforoTicker = (ticker: string) => {
    removeTicker(ticker);
  };

  const effectiveCurrency: "ARS" | "USD" | "" =
    resultARS && resultUSD ? viewCurrency : resultARS ? "ARS" : resultUSD ? "USD" : "";

  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
      <div className="min-w-0 space-y-4">
        <div className="mono text-[14px] uppercase tracking-[0.22em] text-primary/80">
          Optimizador de portafolios
        </div>
        <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
          Markowitz, mÃ­nima varianza y mÃ¡ximo Sharpe sobre datos diarios de {years} aÃ±o
          {years !== 1 ? "s" : ""}.
        </h2>

        <div className="flex flex-wrap gap-4 items-start">
          {/* Free-text ticker input */}
          <div className="glass min-w-0 flex-1 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Agregar tickers
              </div>
              <div className="flex gap-1 items-center">
                <span className="mono text-[13px] text-muted-foreground">Tipo:</span>
                <button
                  onClick={() => setAssetType("cedear")}
                  className={`font-mono text-[13px] px-2 py-0.5 rounded border transition-colors ${
                    assetType === "cedear"
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  CEDEAR
                </button>
                <button
                  onClick={() => setAssetType("accion")}
                  className={`font-mono text-[13px] px-2 py-0.5 rounded border transition-colors ${
                    assetType === "accion"
                      ? "border-success/60 bg-success/10 text-success"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  AcciÃ³n Directa
                </button>
                <span className="mx-0.5 h-3.5 w-px bg-border/60" />
                <button
                  type="button"
                  onClick={handleImportarIOL}
                  disabled={!iolSync.isLoggedIn || iolSync.isLoading}
                  title={
                    iolSync.isLoggedIn
                      ? "Sincronizar el portafolio de IOL y cargar los tickers"
                      : "IniciÃ¡ sesiÃ³n en IOL para importar el portafolio"
                  }
                  className={`font-mono text-[13px] px-2 py-0.5 rounded border transition-colors ${
                    !iolSync.isLoggedIn
                      ? "border-border/30 text-muted-foreground/40 cursor-not-allowed"
                      : "border-primary/60 bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  {iolSync.isLoading || iolPending ? "Sincronizando..." : "Importar IOL"}
                </button>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const inp = form.elements.namedItem("tickerInput") as HTMLInputElement;
                const tickers = inp.value
                  .split(/[\s,]+/)
                  .map((t) => t.trim().toUpperCase())
                  .filter(Boolean);
                tickers.forEach((t) => {
                  const converted = assetType === "cedear" ? toCedearTicker(t, cedearCurrency) : t;
                  addTicker(converted);
                });
                inp.value = "";
              }}
            >
              <div className="flex gap-2">
                <input
                  name="tickerInput"
                  placeholder="NU, MELI, AAPL, MSFT..."
                  className="flex-1 bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
                />
                <button
                  type="submit"
                  className="rounded bg-primary/20 px-2 py-1 text-[13px] font-mono text-primary hover:bg-primary/30"
                >
                  AÃ±adir
                </button>
              </div>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedTickers.map((sym) => {
                const moneda = currencyMap[sym] ?? inferMonedaYahoo(sym);
                return (
                  <span
                    key={sym}
                    className="inline-flex items-center gap-1 font-mono text-[13px] px-1.5 py-0.5 rounded bg-muted/30 border border-border/50"
                  >
                    {sym}
                    {moneda && (
                      <span
                        className={`text-[12px] px-1 py-0 rounded font-bold ${
                          moneda === "ARS"
                            ? "bg-primary/20 text-primary"
                            : "bg-success/20 text-success"
                        }`}
                      >
                        {moneda}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeTicker(sym)}
                      className="text-muted-foreground hover:text-danger leading-none"
                    >
                      &times;
                    </button>
                  </span>
                );
              })}
            </div>
            {isDetectingCurrency && (
              <div className="mt-1 text-[13px] text-muted-foreground font-mono">
                Detectando monedas...
              </div>
            )}
          </div>

          {/* Sector / industria */}
          <details className="glass min-w-0 w-72 [&>summary]:cursor-pointer" open>
            <summary className="mono px-4 py-2.5 text-[14px] uppercase tracking-[0.18em] text-muted-foreground select-none">
              Agregar por sector / industria
            </summary>
            <div className="border-t border-border/40 px-4 pb-4 pt-2.5 space-y-2">
              {/* Asset type selector */}
              <div className="grid w-full grid-cols-2 gap-1">
                <button
                  onClick={() => {
                    setAssetType("cedear");
                    setSectorFilter("");
                    setIndustryFilter("");
                  }}
                  className={`font-mono text-[13px] px-2 py-1 rounded border transition-colors ${
                    assetType === "cedear"
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  CEDEAR
                </button>
                <button
                  onClick={() => {
                    setAssetType("accion");
                    setSectorFilter("");
                    setIndustryFilter("");
                  }}
                  className={`font-mono text-[13px] px-2 py-1 rounded border transition-colors ${
                    assetType === "accion"
                      ? "border-success/60 bg-success/10 text-success"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  AcciÃ³n
                </button>
              </div>

              {/* Sub-filter: market for acciones, currency for CEDEARs */}
              {assetType === "accion" ? (
                <select
                  value={mercadoFilter}
                  onChange={(e) => {
                    setMercadoFilter(e.target.value);
                    setSectorFilter("");
                    setIndustryFilter("");
                  }}
                  className="w-full bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
                >
                  <option value="NYSE">NYSE</option>
                  <option value="NASDAQ">NASDAQ</option>
                  <option value="BCBA">BCBA</option>
                </select>
              ) : (
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setCedearCurrency("ARS");
                      setSectorFilter("");
                      setIndustryFilter("");
                    }}
                    className={`flex-1 font-mono text-[13px] px-2 py-1 rounded border transition-colors ${
                      cedearCurrency === "ARS"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ARS (.BA)
                  </button>
                  <button
                    onClick={() => {
                      setCedearCurrency("USD");
                      setSectorFilter("");
                      setIndustryFilter("");
                    }}
                    className={`flex-1 font-mono text-[13px] px-2 py-1 rounded border transition-colors ${
                      cedearCurrency === "USD"
                        ? "border-success/60 bg-success/10 text-success"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    USD (sufijo D)
                  </button>
                </div>
              )}
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
                    {traducirSector(s)}
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
                      {traducirIndustria(ind)}
                    </option>
                  ))}
                </select>
              )}
              {sectorFilter && filteredSectorTickers.length > 0 && (
                <>
                  <div className="flex gap-1 mb-2">
                    <button
                      onClick={() => filteredSectorTickers.forEach((t) => addTicker(t.ticker))}
                      className="font-mono text-[13px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:text-foreground"
                    >
                      Seleccionar todo
                    </button>
                    <button
                      onClick={() => filteredSectorTickers.forEach((t) => removeTicker(t.ticker))}
                      className="font-mono text-[13px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:text-foreground"
                    >
                      Deseleccionar todo
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {filteredSectorTickers.map((t) => {
                      const sym = t.ticker;
                      const added = selectedTickers.includes(sym);
                      const moneda =
                        assetType === "accion"
                          ? mercadoFilter === "BCBA"
                            ? "ARS"
                            : "USD"
                          : cedearCurrency;
                      return (
                        <button
                          key={t.ticker}
                          onClick={() => (added ? removeTicker(sym) : addTicker(sym))}
                          className={`font-mono text-[14px] px-2 py-1 rounded-md border transition-colors inline-flex items-center gap-1 ${
                            added
                              ? "border-primary/50 bg-primary/15 text-foreground line-through opacity-50"
                              : "border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t.ticker}
                          {moneda && (
                            <span
                              className={`text-[12px] px-1 py-0 rounded font-bold ${
                                moneda === "ARS"
                                  ? "bg-primary/20 text-primary"
                                  : "bg-success/20 text-success"
                              }`}
                            >
                              {moneda}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </details>
        </div>

        {/* â”€â”€ Portafolio armado (debajo de los inputs de selecciÃ³n) â”€â”€ */}
        <div className="space-y-4">
          {/* Parameters row */}
          <div className="glass min-w-0 flex-1 p-4 flex flex-wrap items-end gap-4">
            {selectedTickers.length > 0 && (tickersARS.length > 0 || isDetectingCurrency) && (
              <div>
                <div className="mono mb-1.5 text-[14px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                  Capital ARS
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={notionalARS}
                  onChange={(e) => setNotionalARS(Number(e.target.value))}
                  className="w-24 bg-background/40 border border-border/60 text-foreground text-sm rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
                />
              </div>
            )}
            {selectedTickers.length > 0 && (tickersUSD.length > 0 || isDetectingCurrency) && (
              <div>
                <div className="mono mb-1.5 text-[14px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                  Capital USD
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={notionalUSD}
                  onChange={(e) => setNotionalUSD(Number(e.target.value))}
                  className="w-24 bg-background/40 border border-border/60 text-foreground text-sm rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
                />
              </div>
            )}
            <div>
              <div className="mono mb-1.5 text-[14px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                Simulaciones Monte Carlo
              </div>
              <input
                type="number"
                min={0}
                max={10000}
                step={100}
                value={numSims}
                onChange={(e) => setNumSims(Number(e.target.value))}
                className="w-28 bg-background/40 border border-border/60 text-foreground text-sm rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
              />
            </div>
            <div>
              <div className="mono mb-1.5 text-[14px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                Periodo (aÃ±os)
              </div>
              <select
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                className="w-20 bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
              >
                <option value={0.5}>0.5</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </div>
            <div>
              <div className="mono mb-1.5 text-[14px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                Benchmark(s) <span className="text-[13px] text-muted-foreground/60">para CAPM</span>
              </div>
              <div className="flex gap-2 items-center">
                {autoDetectBM ? (
                  <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[13px] font-mono text-center text-muted-foreground whitespace-nowrap">
                    Auto-detectando
                  </div>
                ) : (
                  <input
                    value={benchmarkInput}
                    onChange={(e) => setBenchmarkInput(e.target.value)}
                    placeholder="^MERV, SPY, QQQ..."
                    className="w-36 bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
                  />
                )}
                <button
                  onClick={() => setAutoDetectBM(!autoDetectBM)}
                  className={`font-mono text-[13px] px-2 py-1 rounded border transition-colors ${
                    autoDetectBM
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {autoDetectBM ? "Auto â—†" : "Auto â—‡"}
                </button>
              </div>
            </div>
            <button
              onClick={handleOptimize}
              disabled={
                isDetectingCurrency || optimizingCurrency !== "" || selectedTickers.length < 2
              }
              className="rounded-md bg-primary px-5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap self-end"
            >
              {optimizingCurrency !== ""
                ? `Optimizando (${optimizingCurrency})...`
                : isDetectingCurrency
                  ? "Detectando monedas..."
                  : "Recalcular"}
            </button>
          </div>

          {/* â”€â”€ Asset tables â”€â”€ */}
          {selectedTickers.length > 0 && (
            <div className="space-y-6">
              {semaforoARS.length > 0 && (
                <PortfolioAssetTable
                  data={semaforoARS}
                  currency="ARS"
                  loading={semaforoLoading}
                  error={semaforoError}
                  onRemoveTicker={removeSemaforoTicker}
                />
              )}
              {semaforoUSD.length > 0 && (
                <PortfolioAssetTable
                  data={semaforoUSD}
                  currency="USD"
                  loading={semaforoLoading}
                  error={semaforoError}
                  onRemoveTicker={removeSemaforoTicker}
                />
              )}
              {!semaforoLoading && semaforoARS.length === 0 && semaforoUSD.length === 0 && (
                <div className="rounded-md border border-border/40 bg-background/40 px-4 py-6 text-center text-[13px] text-muted-foreground">
                  Consultando datos de mercado...
                </div>
              )}
            </div>
          )}
        </div>

        {Object.keys(currencyMap).length > 0 && (
          <div className="flex gap-3 text-[13px] font-mono">
            <span className="text-primary">
              ARS: {tickersARS.length} activo{tickersARS.length !== 1 ? "s" : ""}
            </span>
            {tickersUSD.length > 0 && (
              <span className="text-success">
                USD: {tickersUSD.length} activo{tickersUSD.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {optimizeError && (
          <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            {optimizeError}
          </div>
        )}

        <div className="space-y-6">
          {/* Currency toggle â€” single dataframe, ARS or USD */}
          {(resultARS || resultUSD) && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-row gap-1.5">
                {resultARS && (
                  <button
                    onClick={() => setViewCurrency("ARS")}
                    className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
                      effectiveCurrency === "ARS"
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    Portfolio ARS ({resultARS.tickers.length})
                  </button>
                )}
                {resultUSD && (
                  <button
                    onClick={() => setViewCurrency("USD")}
                    className={`font-mono text-[14px] px-3 py-1.5 rounded-md border transition-colors ${
                      effectiveCurrency === "USD"
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-success" />
                    Portfolio USD ({resultUSD.tickers.length})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Active result (single dataframe per currency) */}
          {effectiveCurrency === "ARS" && resultARS && (
            <AllOptimizerResult
              data={resultARS}
              tab={strategyTab}
              onTabChange={setStrategyTab}
              portfolioTickers={tickersARS}
            />
          )}
          {effectiveCurrency === "USD" && resultUSD && (
            <AllOptimizerResult
              data={resultUSD}
              tab={strategyTab}
              onTabChange={setStrategyTab}
              portfolioTickers={tickersUSD}
            />
          )}

          {/* Comparison dataframe */}
          {resultARS && resultUSD && (
            <div className="rounded-lg border border-border/40 bg-background/40 overflow-hidden">
              <div className="mono px-3 py-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground border-b border-border/40">
                Comparativa ARS vs USD
              </div>
              <table className="mono w-full text-[14px]">
                <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-3 py-2 text-left">Estrategia</th>
                    <th className="px-3 py-2 text-right">Retorno ARS</th>
                    <th className="px-3 py-2 text-right">Retorno USD</th>
                    <th className="px-3 py-2 text-right">Vol ARS</th>
                    <th className="px-3 py-2 text-right">Vol USD</th>
                    <th className="px-3 py-2 text-right">Sharpe ARS</th>
                    <th className="px-3 py-2 text-right">Sharpe USD</th>
                  </tr>
                </thead>
                <tbody>
                  {resultARS.strategies.map((s, i) => {
                    const usdS = resultUSD.strategies[i];
                    const retColor = (v: number) => (v >= 0 ? "text-success" : "text-danger");
                    return (
                      <tr
                        key={s.strategy}
                        className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                      >
                        <td className="px-3 py-2 font-medium text-foreground">{s.label}</td>
                        <td
                          className={`px-3 py-2 text-right font-mono ${retColor(s.expectedReturn)}`}
                        >
                          {fmtPct(s.expectedReturn * 100)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono ${retColor(usdS.expectedReturn)}`}
                        >
                          {fmtPct(usdS.expectedReturn * 100)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {fmtPct(s.volatility * 100)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {fmtPct(usdS.volatility * 100)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-primary">
                          {fmtNum(s.sharpe, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-primary">
                          {fmtNum(usdS.sharpe, 2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Combined overlay */}
          {resultARS && resultUSD && (
            <CombinedOptimizerCharts
              resultARS={resultARS}
              resultUSD={resultUSD}
              activeStrategy={strategyTab}
              strategyColors={{
                "min-variance": "#E88C8C",
                "max-sharpe": "#fbbf24",
                "equal-weight": "#9BBFA8",
                "inverse-vol": "#C5A8D5",
                markowitz: "#7B9CDA",
              }}
              onTabChange={setStrategyTab}
            />
          )}

          {/* Empty state */}
          {!resultARS && !resultUSD && optimizingCurrency === "" && !optimizeError && (
            <div className="glass flex min-h-[260px] items-center justify-center p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Defin&iacute; los tickers y ejecut&aacute; la optimizaci&oacute;n.
                {tickersARS.length >= 2 && tickersUSD.length >= 2 && (
                  <span className="block mt-1 text-[13px]">
                    Se optimizar&aacute;n ambos portafolios (ARS y USD) simult&aacute;neamente.
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Asistente IA lateral: detecta tickers de un portafolio pegado, los pasa a especie D/.BA y preconfigura el optimizador */}
      <div className="min-w-0 xl:sticky xl:top-20">
        <div className="h-[calc(100vh-9rem)]">
          <OptimizerChat onApplyTickers={handleAiApplyTickers} currentTickers={selectedTickers} />
        </div>
      </div>
    </div>
  );
}
function AllOptimizerResult({
  data,
  tab,
  onTabChange,
  portfolioTickers,
}: {
  data: AllPortfoliosResult;
  tab: string;
  onTabChange: (t: string) => void;
  portfolioTickers?: string[];
}) {
  const active = tab || data.strategies[0]?.strategy || "";
  const [selectedCapmBm, setSelectedCapmBm] = useState(data.capmBenchmarks?.[0]?.benchmark ?? "");
  const onBenchmarkSelect = useCallback((bm: string) => setSelectedCapmBm(bm), []);
  const activeStrat = data.strategies.find((s) => s.strategy === active);
  const strategyColors: Record<string, string> = {
    "min-variance": "var(--color-chart-pink, #E88C8C)",
    "max-sharpe": "var(--color-warning)",
    "equal-weight": "var(--color-chart-sage, #9BBFA8)",
    "inverse-vol": "var(--color-chart-lavender, #C5A8D5)",
    markowitz: "var(--color-chart-blue, #7B9CDA)",
  };

  const simTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass p-2 text-xs font-mono space-y-0.5">
        <div>
          Ret:{" "}
          <span className={d.ret >= 0 ? "text-success" : "text-danger"}>{fmtPct(d.ret * 100)}</span>
        </div>
        <div>
          Vol: <span>{fmtPct(d.vol * 100)}</span>
        </div>
        <div>
          Sharpe:{" "}
          <span className={d.sharpe >= 1 ? "text-success" : d.sharpe < 0 ? "text-danger" : ""}>
            {fmtNum(d.sharpe, 2)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* KPI cards across all strategies */}
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
        {data.strategies.map((s) => (
          <button
            key={s.strategy}
            onClick={() => onTabChange(s.strategy)}
            className={`glass p-3 text-left transition-colors ${
              active === s.strategy ? "border-primary/60 bg-primary/5" : ""
            }`}
          >
            <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
            <div className="mt-1 text-lg font-semibold">{fmtPct(s.expectedReturn * 100, 1)}</div>
            <div className="mono text-[13px] text-muted-foreground">
              Vol: {fmtPct(s.volatility * 100, 1)}
            </div>
            <div className="mono text-[13px] text-muted-foreground">
              Sharpe: {fmtNum(s.sharpe, 2)}
            </div>
          </button>
        ))}
      </div>

      {activeStrat && (
        <>
          {/* Strategy detail: pie + histogram */}
          <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="glass min-w-0 p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                {activeStrat.label} â€” DistribuciÃ³n
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Object.entries(activeStrat.weights)
                        .map(([t, w]) => ({ name: t, value: +(w * 100).toFixed(2) }))
                        .filter((d) => d.value > 0.01)}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {Object.entries(activeStrat.weights).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip prefix="" />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {Object.entries(activeStrat.weights)
                  .filter(([, w]) => w > 0.001)
                  .sort(([, a], [, b]) => b - a)
                  .map(([t, w], i) => (
                    <div key={t} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="mono">{t}</span>
                      </div>
                      <span className="mono text-muted-foreground">
                        {fmtPct(w * 100)} ($
                        {(w * data.notional).toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        )
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="glass min-w-0 p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                {activeStrat.label} â€” Histograma de retornos diarios
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={activeStrat.histogram}
                    margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="binStart" tick={AXIS_TICK_SM} tickFormatter={(v) => `${v}%`} />
                    <YAxis tick={AXIS_TICK} width={30} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="var(--color-success)" radius={[1, 1, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Individual assets table */}
          <div className="glass min-w-0 overflow-x-auto p-5">
            <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Activos individuales â€” {activeStrat.label}
            </div>
            <table className="mono w-full min-w-[580px] text-xs">
              <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-2 py-2 text-left">Ticker</th>
                  <th className="px-2 py-2 text-left">Sector</th>
                  <th className="px-2 py-2 text-left">Industria</th>
                  <th className="px-2 py-2 text-right">Peso</th>
                  <th className="px-2 py-2 text-right">AsignaciÃ³n</th>
                  <th className="px-2 py-2 text-right">Retorno anual</th>
                  <th className="px-2 py-2 text-right">Volatilidad</th>
                  <th className="px-2 py-2 text-right">Sharpe</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // buscar sector/industria para un ticker en sectores.json
                  const getSectorInd = (ticker: string): { sector: string; industria: string } => {
                    const buscaTicker = (t: string) => {
                      const _rawSectoresLocal = (universoCompleto as any).sectores ?? universoCompleto;
                      for (const [sector, sectorVal] of Object.entries(_rawSectoresLocal)) {
                        if (sector === "version" || sector === "lastUpdated") continue;
                        if (typeof sectorVal !== "object" || sectorVal === null) continue;
                        const industrias = (sectorVal as any).industrias ?? sectorVal;
                        if (typeof industrias !== "object") continue;
                        for (const [industria, tickers] of Object.entries(industrias as Record<string, any[]>)) {
                          if (
                            Array.isArray(tickers) &&
                            tickers.some(
                              (item: any) =>
                                item.ticker === t || item.ticker === t.replace(/\.BA$/, ""),
                            )
                          )
                            return { sector, industria };
                        }
                      }
                      return { sector: "", industria: "" };
                    };
                    // Try exact ticker first, then without .BA suffix, then with .BA suffix
                    let r = buscaTicker(ticker);
                    if (!r.sector) r = buscaTicker(ticker + ".BA");
                    if (!r.sector) r = buscaTicker(ticker.replace(/\.BA$/, ""));
                    return r;
                  };
                  return Object.entries(activeStrat.weights)
                    .filter(([, w]) => w > 0.001)
                    .sort(([, a], [, b]) => b - a)
                    .map(([t, w], i) => {
                      const ind = data.individual.find((x) => x.ticker === t);
                      const si = getSectorInd(t);
                      return (
                        <tr
                          key={t}
                          className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                        >
                          <td className="px-2 py-2 flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                            />
                            <span className="font-semibold">{t}</span>
                          </td>
                          <td className="px-2 py-2 text-muted-foreground text-[13px]">
                            {si.sector || "â€”"}
                          </td>
                          <td className="px-2 py-2 text-muted-foreground text-[13px]">
                            {si.industria || "â€”"}
                          </td>
                          <td className="px-2 py-2 text-right">{fmtPct(w * 100)}</td>
                          <td className="px-2 py-2 text-right text-muted-foreground">
                            $
                            {(w * data.notional).toLocaleString("es-AR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${(ind?.meanAnnual ?? 0) >= 0 ? "text-success" : "text-danger"}`}
                          >
                            {fmtPct((ind?.meanAnnual ?? 0) * 100)}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${(ind?.volAnnual ?? 0) >= 0 ? "text-warning" : "text-muted-foreground"}`}
                          >
                            {fmtPct((ind?.volAnnual ?? 0) * 100)}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${(ind?.sharpe ?? 0) >= 1 ? "text-success" : (ind?.sharpe ?? 0) < 0 ? "text-danger" : ""}`}
                          >
                            {fmtNum(ind?.sharpe ?? 0, 2)}
                          </td>
                        </tr>
                      );
                    });
                })()}
              </tbody>
            </table>
          </div>

          {/* Scenario analysis */}
          {data.scenarios && data.scenarios.length > 0 && (
            <div className="glass overflow-x-auto p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Escenarios ponderados del portafolio ({activeStrat.label})
              </div>
              <table className="mono w-full min-w-[500px] text-xs">
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
                  {Object.entries(activeStrat.weights)
                    .filter(([, w]) => w > 0.001)
                    .sort(([, a], [, b]) => b - a)
                    .map(([t, w]) => {
                      const sc = data.scenarios!.find((s) => s.ticker === t);
                      if (!sc) return null;
                      return (
                        <tr key={t} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="px-2 py-2 font-semibold">{t}</td>
                          <td
                            className={`px-2 py-2 text-right ${sc.maxLoss < 0 ? "text-danger" : "text-success"}`}
                          >
                            {sc.maxLoss.toFixed(2)}%
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${sc.expectedLoss < 0 ? "text-danger/70" : "text-success/70"}`}
                          >
                            {sc.expectedLoss.toFixed(2)}%
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${sc.expectedGain > 0 ? "text-success" : "text-danger"}`}
                          >
                            {sc.expectedGain.toFixed(2)}%
                          </td>
                          <td className="px-2 py-2 text-right text-success">
                            {sc.maxGain.toFixed(2)}%
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-medium ${sc.mostLikely >= 0 ? "text-success" : "text-danger"}`}
                          >
                            {sc.mostLikely.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* Equity curve + Efficient frontier */}
          <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="glass min-w-0 p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Curva equity (base 100) â€” {activeStrat.label}
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={(() => {
                      const val = 100;
                      const curve: { d: string; v: number }[] = [{ d: "", v: val }];
                      if (data.equityCurve.length > 1) {
                        for (let t = 1; t < data.equityCurve.length; t++) {
                          curve.push({ d: data.equityCurve[t].date, v: data.equityCurve[t].value });
                        }
                      }
                      return curve;
                    })()}
                    margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="d" hide />
                    <YAxis
                      domain={["dataMin", "dataMax"]}
                      tickLine={false}
                      axisLine={false}
                      tick={AXIS_TICK}
                      width={42}
                    />
                    <Tooltip content={<ChartTip />} />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="var(--color-primary)"
                      strokeWidth={1.5}
                      fill="url(#g2)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass min-w-0 p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Frontera eficiente Â· {data.simulations.length.toLocaleString()} simulaciones
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis
                      dataKey="vol"
                      name="Volatilidad"
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      tick={AXIS_TICK}
                      type="number"
                    />
                    <YAxis
                      dataKey="ret"
                      name="Retorno"
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      tick={AXIS_TICK}
                      width={46}
                      type="number"
                      domain={["dataMin", "dataMax"]}
                    />
                    <Tooltip content={simTooltip} cursor={{ strokeDasharray: "3 3" }} />
                    {/* Monte Carlo cloud */}
                    <Scatter
                      name="Simulaciones"
                      data={data.simulations}
                      fill="var(--color-success)"
                      fillOpacity={0.15}
                      stroke="none"
                      isAnimationActive={false}
                    />
                    {/* Efficient frontier line */}
                    <Scatter
                      name="Frontera eficiente"
                      data={data.frontier}
                      fill="var(--color-primary)"
                      stroke="var(--color-primary)"
                      strokeWidth={1.5}
                      line
                      shape="circle"
                      isAnimationActive={false}
                    />
                    {/* Strategy points */}
                    {data.strategies.map((s) => (
                      <Scatter
                        key={s.strategy}
                        name={s.label}
                        data={[{ vol: s.volatility, ret: s.expectedReturn }]}
                        fill={strategyColors[s.strategy] ?? "var(--color-warning)"}
                        stroke="#fff"
                        strokeWidth={1}
                        isAnimationActive={false}
                        onClick={() => onTabChange(s.strategy)}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {data.strategies.map((s) => (
                  <div
                    key={s.strategy}
                    className="flex items-center gap-1.5 text-[13px] font-mono text-muted-foreground"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: strategyColors[s.strategy] ?? "var(--color-warning)" }}
                    />
                    <span className={active === s.strategy ? "text-foreground font-semibold" : ""}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CAPM per benchmark â€” dropdown selector */}
          {data.capmBenchmarks &&
            data.capmBenchmarks.length > 0 &&
            (() => {
              const selBm = selectedCapmBm || data.capmBenchmarks[0]?.benchmark || "";
              const cb =
                data.capmBenchmarks.find((b) => b.benchmark === selBm) ?? data.capmBenchmarks[0];
              return (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                      CAPM vs
                    </div>
                    <select
                      value={selBm}
                      onChange={(e) => onBenchmarkSelect(e.target.value)}
                      className="bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none font-mono"
                    >
                      {data.capmBenchmarks
                        .filter((b) => b.entries.some((e) => e.observations > 0))
                        .map((b) => (
                          <option key={b.benchmark} value={b.benchmark}>
                            {b.benchmark}
                          </option>
                        ))}
                    </select>
                    <span className="text-[13px] text-muted-foreground">
                      {data.capmBenchmarks.length} benchmarks disponibles
                    </span>
                  </div>
                  <div key={cb.benchmark} className="glass overflow-x-auto p-5">
                    <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                      CAPM vs {cb.benchmark}
                    </div>
                    <table className="mono w-full min-w-[700px] text-xs">
                      <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                        <tr className="border-b border-border/60">
                          <th className="px-2 py-2 text-left">Estrategia</th>
                          <th className="px-2 py-2 text-left">ClasificaciÃ³n</th>
                          <th className="px-2 py-2 text-right">Alpha</th>
                          <th className="px-2 py-2 text-right">Î± anual</th>
                          <th className="px-2 py-2 text-right">Beta vs {cb.benchmark}</th>
                          <th className="px-2 py-2 text-right">Corr</th>
                          <th className="px-2 py-2 text-right">RÂ²</th>
                          <th className="px-2 py-2 text-right">p-value</th>
                          <th className="px-2 py-2 text-right">Std Err</th>
                          <th className="px-2 py-2 text-right">Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cb.entries
                          .filter((e) => e.observations > 0)
                          .map((e) => {
                            const beta = e.beta ?? 0;
                            const alpha = e.annualizedAlpha ?? 0;
                            let tipoClasif: string, colorClasif: string;
                            if (Math.abs(beta - 1) < 0.05 && Math.abs(alpha) < 0.01) {
                              tipoClasif = "Index Tracker";
                              colorClasif = "bg-success/15 text-success border-success/30";
                            } else if (Math.abs(beta - 1) < 0.15 && alpha > 0.01) {
                              tipoClasif = "Long Only";
                              colorClasif = "bg-primary/15 text-primary border-primary/30";
                            } else if (Math.abs(beta) < 0.3 && alpha > 0.01) {
                              tipoClasif = "Hedge Fund";
                              colorClasif = "bg-danger/15 text-danger border-danger/30";
                            } else if (beta < 0.5) {
                              tipoClasif = "Bajo Beta";
                              colorClasif =
                                "bg-[var(--color-chart-purple)]/15 text-[var(--color-chart-purple)] border-[var(--color-chart-purple)]/30";
                            } else if (beta > 1.2) {
                              tipoClasif = "Alto Beta";
                              colorClasif = "bg-warning/15 text-warning border-warning/30";
                            } else {
                              tipoClasif = "Market";
                              colorClasif = "bg-muted/30 text-muted-foreground border-border";
                            }
                            return (
                              <tr
                                key={e.strategy}
                                className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                              >
                                <td className="px-2 py-2 font-semibold text-primary whitespace-nowrap">
                                  {e.label}
                                </td>
                                <td className="px-2 py-2">
                                  <span
                                    className={`inline-block rounded border px-1.5 py-0.5 text-[13px] whitespace-nowrap ${colorClasif}`}
                                  >
                                    {tipoClasif}
                                  </span>
                                </td>
                                <td
                                  className={`px-2 py-2 text-right ${(e.alpha ?? 0) > 0 ? "text-success" : (e.alpha ?? 0) < 0 ? "text-danger" : ""}`}
                                >
                                  {(e.alpha ?? 0).toFixed(4)}
                                </td>
                                <td
                                  className={`px-2 py-2 text-right ${alpha > 0 ? "text-success" : alpha < 0 ? "text-danger" : ""}`}
                                >
                                  {alpha.toFixed(4)}
                                </td>
                                <td
                                  className={`px-2 py-2 text-right ${beta > 1 ? "text-warning" : beta < 0.5 ? "text-success" : ""}`}
                                >
                                  {beta.toFixed(4)}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  {(e.correlation ?? 0).toFixed(4)}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  {(e.rSquared ?? 0).toFixed(4)}
                                </td>
                                <td
                                  className={`px-2 py-2 text-right ${(e.pValue ?? 1) < 0.05 ? "text-success" : "text-muted-foreground"}`}
                                >
                                  {(e.pValue ?? 1).toFixed(4)}
                                </td>
                                <td className="px-2 py-2 text-right text-muted-foreground">
                                  {(e.stdErr ?? 0).toFixed(4)}
                                </td>
                                <td className="px-2 py-2 text-right text-muted-foreground">
                                  {e.observations}
                                </td>
                              </tr>
                            );
                          })}
                        {cb.entries
                          .filter((e) => e.observations === 0)
                          .map((e) => (
                            <tr
                              key={e.strategy}
                              className="border-b border-border/30 last:border-0 hover:bg-muted/20 opacity-40"
                            >
                              <td className="px-2 py-2 font-semibold">{e.label}</td>
                              <td className="px-2 py-2 text-right" colSpan={8}>
                                Sin datos
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

          {/* Correlation matrix */}
          {data.correlation.tickers.length > 0 && (
            <div className="glass p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Matriz de correlaciÃ³n
              </div>
              <div className="w-full overflow-x-auto flex justify-center">
                <table className="mono text-[14px] w-full max-w-lg">
                  <thead>
                    <tr>
                      <th className="px-2 py-1.5 text-left" />
                      {data.correlation.tickers.map((t) => (
                        <th
                          key={t}
                          className="px-2 py-1.5 text-center text-muted-foreground font-medium"
                        >
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.correlation.tickers.map((t, i) => (
                      <tr key={t}>
                        <td className="px-2 py-1.5 text-left text-muted-foreground font-medium">
                          {t}
                        </td>
                        {data.correlation.matrix[i].map((v, j) => (
                          <td
                            key={j}
                            className="px-2 py-1.5 text-center font-mono text-xs"
                            style={{
                              background:
                                v >= 0
                                  ? `rgba(16,185,129,${Math.max(0.05, Math.abs(v) * 0.5)})`
                                  : `rgba(255,71,87,${Math.max(0.05, Math.abs(v) * 0.4)})`,
                              color: Math.abs(v) > 0.5 ? "#fff" : "rgba(255,255,255,0.8)",
                              fontWeight: Math.abs(v) > 0.5 ? 700 : 400,
                            }}
                          >
                            {v.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CombinedOptimizerCharts({
  resultARS,
  resultUSD,
  activeStrategy,
  strategyColors,
  onTabChange,
}: {
  resultARS: AllPortfoliosResult;
  resultUSD: AllPortfoliosResult;
  activeStrategy: string;
  strategyColors: Record<string, string>;
  onTabChange: (t: string) => void;
}) {
  const [showARS, setShowARS] = useState(true);
  const [showUSD, setShowUSD] = useState(true);

  const mergedEquity = useMemo(() => {
    const map: Record<string, { ars?: number; usd?: number }> = {};
    for (const p of resultARS.equityCurve) map[p.date] = { ...map[p.date], ars: p.value };
    for (const p of resultUSD.equityCurve) map[p.date] = { ...map[p.date], usd: p.value };
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => ({ d, ars: v.ars ?? null, usd: v.usd ?? null }));
  }, [resultARS, resultUSD]);

  const combinedTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass p-2 text-xs font-mono space-y-0.5">
        <div>
          Ret:{" "}
          <span className={d.ret >= 0 ? "text-success" : "text-danger"}>{fmtPct(d.ret * 100)}</span>
        </div>
        <div>
          Vol: <span>{fmtPct(d.vol * 100)}</span>
        </div>
        <div>
          Sharpe:{" "}
          <span className={d.sharpe >= 1 ? "text-success" : d.sharpe < 0 ? "text-danger" : ""}>
            {fmtNum(d.sharpe, 2)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Comparativa ARS vs USD
        </div>
        <div className="flex gap-3 text-[13px] font-mono">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showARS}
              onChange={() => setShowARS((x) => !x)}
              className="accent-primary size-3"
            />
            <span className="text-primary">ARS</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showUSD}
              onChange={() => setShowUSD((x) => !x)}
              className="accent-success size-3"
            />
            <span className="text-success">USD</span>
          </label>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Combined efficient frontier + MC */}
        <div>
          <div className="mono mb-2 text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
            Frontera eficiente Â· {resultARS.simulations.length.toLocaleString()} sims c/u
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="vol"
                  name="Vol"
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={AXIS_TICK_SM}
                  type="number"
                />
                <YAxis
                  dataKey="ret"
                  name="Ret"
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={AXIS_TICK_SM}
                  width={46}
                  type="number"
                  domain={["dataMin", "dataMax"]}
                />
                <Tooltip content={combinedTooltip} cursor={{ strokeDasharray: "3 3" }} />
                {showARS && (
                  <Scatter
                    name="ARS Sim"
                    data={resultARS.simulations}
                    fill="var(--color-blue-500)"
                    fillOpacity={0.08}
                    stroke="none"
                    isAnimationActive={false}
                  />
                )}
                {showUSD && (
                  <Scatter
                    name="USD Sim"
                    data={resultUSD.simulations}
                    fill="var(--color-success)"
                    fillOpacity={0.08}
                    stroke="none"
                    isAnimationActive={false}
                  />
                )}
                {showARS && (
                  <Scatter
                    name="ARS Front"
                    data={resultARS.frontier}
                    fill="var(--color-blue-500)"
                    stroke="var(--color-blue-500)"
                    strokeWidth={1.5}
                    line
                    shape="circle"
                    isAnimationActive={false}
                  />
                )}
                {showUSD && (
                  <Scatter
                    name="USD Front"
                    data={resultUSD.frontier}
                    fill="var(--color-success)"
                    stroke="var(--color-success)"
                    strokeWidth={1.5}
                    line
                    shape="circle"
                    isAnimationActive={false}
                  />
                )}
                {showARS &&
                  resultARS.strategies.map((s) => (
                    <Scatter
                      key={`ars-${s.strategy}`}
                      name={`ARS ${s.label}`}
                      data={[{ vol: s.volatility, ret: s.expectedReturn }]}
                      fill={strategyColors[s.strategy] ?? "var(--color-warning)"}
                      stroke="var(--color-blue-500)"
                      strokeWidth={activeStrategy === s.strategy ? 2 : 1}
                      isAnimationActive={false}
                      onClick={() => onTabChange(s.strategy)}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                {showUSD &&
                  resultUSD.strategies.map((s) => (
                    <Scatter
                      key={`usd-${s.strategy}`}
                      name={`USD ${s.label}`}
                      data={[{ vol: s.volatility, ret: s.expectedReturn }]}
                      fill={strategyColors[s.strategy] ?? "var(--color-warning)"}
                      stroke="var(--color-success)"
                      strokeWidth={activeStrategy === s.strategy ? 2 : 1}
                      isAnimationActive={false}
                      onClick={() => onTabChange(s.strategy)}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {showARS && (
              <span className="flex items-center gap-1 text-[13px] font-mono text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                ARS
              </span>
            )}
            {showUSD && (
              <span className="flex items-center gap-1 text-[13px] font-mono text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                USD
              </span>
            )}
          </div>
        </div>

        {/* Combined equity curve */}
        <div>
          <div className="mono mb-2 text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
            Curva equity (base 100)
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mergedEquity} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="g-ars" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-blue-500)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-blue-500)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-usd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="d" hide />
                <YAxis
                  domain={["dataMin", "dataMax"]}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  width={42}
                />
                <Tooltip content={<ChartTip />} />
                {showARS && (
                  <Area
                    type="monotone"
                    dataKey="ars"
                    name="ARS"
                    stroke="var(--color-blue-500)"
                    strokeWidth={1.5}
                    fill="url(#g-ars)"
                    connectNulls
                  />
                )}
                {showUSD && (
                  <Area
                    type="monotone"
                    dataKey="usd"
                    name="USD"
                    stroke="var(--color-success)"
                    strokeWidth={1.5}
                    fill="url(#g-usd)"
                    connectNulls
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptimizerResult({ data }: { data: OptimizeResponse }) {
  const pieData = useMemo(
    () =>
      Object.entries(data.weights)
        .map(([t, w]) => ({ name: t, value: +(w * 100).toFixed(2) }))
        .filter((d) => d.value > 0.01),
    [data],
  );
  const curve = useMemo(() => data.equityCurve.map((p) => ({ d: p.date, v: p.value })), [data]);

  return (
    <div className="grid w-full grid-cols-1 gap-5">
      <div className="glass p-5">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          <BigStat
            label="Retorno esperado"
            value={fmtPct(data.expectedReturn * 100, 2)}
            tone={data.expectedReturn >= 0 ? "good" : "bad"}
          />
          <BigStat label="Volatilidad" value={fmtPct(data.volatility * 100, 2)} />
          <BigStat
            label="Sharpe"
            value={fmtNum(data.sharpe, 2)}
            tone={data.sharpe >= 1 ? "good" : data.sharpe < 0 ? "bad" : undefined}
          />
          <BigStat label="Activos" value={`${data.tickers.length}`} />
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="glass min-w-0 p-5">
          <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
            DistribuciÃ³n
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  stroke="none"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTip prefix="" />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {pieData.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="mono">{p.name}</span>
                </div>
                <span className="mono text-muted-foreground">{p.value.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass min-w-0 p-5">
          <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
            Curva equity (base 100)
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="d" hide />
                <YAxis
                  domain={["dataMin", "dataMax"]}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  width={42}
                />
                <Tooltip content={<ChartTip />} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="var(--color-primary)"
                  strokeWidth={1.5}
                  fill="url(#g2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass min-w-0 overflow-x-auto p-5">
        <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Activos individuales
        </div>
        <table className="mono w-full min-w-[520px] text-xs">
          <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-2 py-2 text-left">Ticker</th>
              <th className="px-2 py-2 text-right">Peso</th>
              <th className="px-2 py-2 text-right">Retorno anual</th>
              <th className="px-2 py-2 text-right">Volatilidad</th>
              <th className="px-2 py-2 text-right">Sharpe</th>
            </tr>
          </thead>
          <tbody>
            {data.individual.map((row, i) => {
              const w = data.weights[row.ticker] ?? 0;
              return (
                <tr key={row.ticker} className="border-b border-border/30 last:border-0">
                  <td className="px-2 py-2 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {row.ticker}
                  </td>
                  <td className="px-2 py-2 text-right">{(w * 100).toFixed(2)}%</td>
                  <td
                    className={`px-2 py-2 text-right ${row.meanAnnual >= 0 ? "text-success" : "text-danger"}`}
                  >
                    {fmtPct(row.meanAnnual * 100)}
                  </td>
                  <td className="px-2 py-2 text-right">{fmtPct(row.volAnnual * 100)}</td>
                  <td className="px-2 py-2 text-right">{fmtNum(row.sharpe, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Efficient frontier */}
      {data.frontier && data.frontier.length > 1 && (
        <div className="glass p-5">
          <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
            Frontera eficiente
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="vol"
                  name="Vol"
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={AXIS_TICK_SM}
                  type="number"
                />
                <YAxis
                  dataKey="ret"
                  name="Ret"
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={AXIS_TICK_SM}
                  width={46}
                  type="number"
                  domain={["dataMin", "dataMax"]}
                />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter
                  name="Frontera"
                  data={data.frontier}
                  fill="var(--color-success)"
                  stroke="none"
                  isAnimationActive={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Correlation heatmap */}
      {data.correlation.tickers.length > 0 && (
        <div className="glass overflow-x-auto p-5">
          <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
            Matriz de correlaciÃ³n
          </div>
          <div className="inline-block">
            <table className="mono text-[13px]">
              <thead>
                <tr>
                  <th className="px-1.5 py-1" />
                  {data.correlation.tickers.map((t) => (
                    <th key={t} className="px-1.5 py-1 text-right text-muted-foreground">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.correlation.tickers.map((t, i) => (
                  <tr key={t}>
                    <td className="px-1.5 py-1 text-left text-muted-foreground">{t}</td>
                    {data.correlation.matrix[i].map((v, j) => (
                      <td
                        key={j}
                        className="px-1.5 py-1 text-right font-medium"
                        style={{
                          background: corrBg(v),
                          color: Math.abs(v) > 0.6 ? "#fff" : "#999",
                        }}
                      >
                        {v.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function corrBg(v: number): string {
  const t = Math.max(-1, Math.min(1, v));
  const a = Math.round(Math.abs(t) * 200);
  return t >= 0
    ? `rgba(16, 185, 129, ${(a / 255).toFixed(3)})`
    : `rgba(255, 71, 87, ${(a / 255).toFixed(3)})`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CAPM â€” AnÃ¡lisis de activos vs benchmark
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


