// @ts-nocheck
import { useState, useEffect, Fragment, useMemo, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from "recharts";
import { fetchFundamentalAFBatch, type FundamentalAFResult } from "@/lib/fundamental-af.functions";
import { optimizeAllPortfolios, type AllPortfoliosResult } from "@/lib/finance.functions";
import { useIOLPortafolio } from "@/lib/use-iol-portafolio";
import { getFlatTickerList } from "@/lib/universos";
import type { TickerInfo } from "@/lib/universos";
import { fetchPortfolioCharts, type SeriePunto } from "@/lib/portfolio-charts.functions";
import { resolveDraftTickerFromIOL } from "@/lib/draft-asset-iol-resolver";
import type { DraftAssetResolvedFromIOL } from "@/lib/draft-asset-iol-resolver";

//  Constants 
const RF_RATE = 4.5; // US 10y risk-free rate %
const ERP = 6; // Equity Risk Premium %
const MARKET_VOL = 18; // SPY annualized vol %

//  Formatters 
function f(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return v.toFixed(dp);
}
function fmtPct(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;
}
function scoreColor(s: number | null): string {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-400";
  if (s >= 60) return "text-emerald-300/80";
  if (s >= 40) return "text-amber-400";
  return "text-red-400";
}
function recBadge(rec: string | null): { label: string; color: string } {
  if (rec === "BUY")
    return { label: "BUY", color: "text-emerald-400 border-emerald-800/40 bg-emerald-950/30" };
  if (rec === "HOLD")
    return { label: "HOLD", color: "text-amber-400 border-amber-800/40 bg-amber-950/30" };
  if (rec === "SELL")
    return { label: "SELL", color: "text-red-400 border-red-800/40 bg-red-950/30" };
  return { label: "\u2014", color: "text-muted-foreground border-border/40 bg-muted/10" };
}

//  Interfaces 
interface PortfolioItem {
  ticker: string;
  priceTicker: string; // Yahoo ticker for price/chart data (e.g., "AAPL.BA" for CEDEAR ARS)
  moneda: "ARS" | "USD";
  weight: number; // 0-1, editable
  cantidad: number; // editable shares
  fundScore: number | null;
  rec: string | null;
  sector: string | null;
  industry: string | null;
  usdTicker: string | null;
  price: number | null;
  trailingPE: number | null;
  beta: number | null;
  roe: number | null;
  revenueGrowth: number | null;
  profitMargin: number | null;
  fcfYield: number | null;
  upside: number | null; // expected return proxy (%)
}

interface SectorGroup {
  sector: string;
  items: PortfolioItem[];
  totalWeight: number;
  avgScore: number;
  avgRet: number;
  avgRisk: number;
  industries: { industry: string; items: PortfolioItem[]; totalWeight: number; avgScore: number }[];
}

//  Helpers 
function expectedRet(item: PortfolioItem): number | null {
  if (item.upside != null && Math.abs(item.upside) >= 0.5) return item.upside;
  if (item.beta != null) return RF_RATE + item.beta * ERP;
  return null;
}
function risk(item: PortfolioItem): number | null {
  if (item.beta != null) return item.beta * MARKET_VOL;
  return null;
}

function computeFundScore(r: FundamentalAFResult): number | null {
  let pts = 0,
    maxPts = 0;
  if (r.returnOnEquity != null) {
    const v = r.returnOnEquity * 100;
    pts += v >= 20 ? 20 : v >= 12 ? 14 : v >= 5 ? 8 : 3;
    maxPts += 20;
  }
  if (r.revenueGrowth != null) {
    const v = r.revenueGrowth * 100;
    pts += v >= 20 ? 20 : v >= 10 ? 14 : v >= 5 ? 8 : 3;
    maxPts += 20;
  }
  if (r.profitMargin != null) {
    const v = r.profitMargin * 100;
    pts += v >= 20 ? 20 : v >= 10 ? 14 : v >= 5 ? 8 : 3;
    maxPts += 20;
  }
  if (r.fcfYield != null) {
    const v = r.fcfYield * 100;
    pts += v >= 6 ? 15 : v >= 3 ? 10 : v >= 0 ? 5 : 0;
    maxPts += 15;
  }
  if (r.upsidePct != null) {
    pts += r.upsidePct >= 25 ? 15 : r.upsidePct >= 10 ? 10 : r.upsidePct >= 0 ? 5 : 0;
    maxPts += 15;
  }
  if (r.trailingPE != null && r.trailingPE > 0) {
    pts += r.trailingPE < 15 ? 10 : r.trailingPE < 25 ? 6 : r.trailingPE < 40 ? 3 : 0;
    maxPts += 10;
  }
  return maxPts > 0 ? Math.round((pts / maxPts) * 100) : null;
}

//  Component 
export function PortafolioFundamentalFull() {
  // Mismo método de obtención de clientes/portafolios que el resto de los tabs
  const iol = useIOLPortafolio();
  const {
    accessToken,
    clientes,
    clienteId,
    esAsesor,
    loading: portLoading,
    loadClientes,
    loadPortfolio,
  } = iol;

  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [suggestCurrency, setSuggestCurrency] = useState<"USD" | "ARS">("USD");
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [optResult, setOptResult] = useState<AllPortfoliosResult | null>(null);
  const [optLoading, setOptLoading] = useState(false);
  const [benchmark, setBenchmark] = useState("SPY");
  const [numSims, setNumSims] = useState(2000);
  const [optYears, setOptYears] = useState(2);
  const [autoDetectBenchmarks, setAutoDetectBenchmarks] = useState(true);
  const [chartRange, setChartRange] = useState("1y");
  const [chartSeries, setChartSeries] = useState<SeriePunto[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const chartFn = useServerFn(fetchPortfolioCharts);
  const fn = useServerFn(fetchFundamentalAFBatch);
  const optFn = useServerFn(optimizeAllPortfolios);
  const [error, setError] = useState("");

  // Ref para evitar loops infinitos: el efecto solo debe ejecutarse UNA vez
  const loadedRef = useRef(false);

  // Universe data for sector/industry lookup + suggestions
  const allTickers = useMemo(() => getFlatTickerList(), []);
  const sectores = useMemo(
    () => [...new Set(allTickers.map((t) => t.sector))].sort(),
    [allTickers],
  );

  // Resolve industry from universe (fallback cuando FundamentalAFResult no trae industry)
  const resolveIndustry = useCallback(
    (ticker: string): string | null => {
      const found = allTickers.find((t) => t.ticker === ticker);
      return found?.industria ?? null;
    },
    [allTickers],
  );

  //  IOL helpers (usa el hook compartido, SIN dependencia al objeto iol) 
  const loadIOL = useCallback(
    async (cliente?: number) => {
      if (!accessToken) return;
      setError("");
      const activos = await loadPortfolio(cliente);
      const elegibles = activos.filter((a: any) => a.cantidad > 0);
      if (elegibles.length === 0) {
        setError("No se encontraron posiciones IOL");
        return;
      }
      // Use centralized IOL→Yahoo ticker resolver
      const resolved: (DraftAssetResolvedFromIOL & { cantidad: number; valorizado: number })[] =
        elegibles.map((a: any) => ({
          ...resolveDraftTickerFromIOL(a.titulo),
          cantidad: a.cantidad ?? 0,
          valorizado: a.valorizado ?? 0,
        }));
      const analysisTickers = [
        ...new Set(resolved.map((r) => r.analysisSymbol).filter((s): s is string => s != null)),
      ];
      const results = await fn({ data: { symbols: analysisTickers } });
      const mapped: PortfolioItem[] = results.map((r) => {
        const match = resolved.find(
          (res) => res.analysisSymbol === r.symbol || res.priceSymbol === r.symbol,
        );
        const fundScore = computeFundScore(r);
        const rec =
          fundScore != null ? (fundScore >= 80 ? "BUY" : fundScore >= 60 ? "HOLD" : "SELL") : null;
        return {
          ticker: r.symbol,
          priceTicker: match?.priceSymbol ?? r.symbol,
          moneda: match?.moneda === "USD" ? ("USD" as const) : ("ARS" as const),
          weight: 0,
          cantidad: 0,
          fundScore,
          rec,
          sector: r.sector,
          industry: r.industry ?? resolveIndustry(r.symbol),
          usdTicker: null,
          price: r.currentPrice,
          trailingPE: r.trailingPE,
          beta: r.betaPropio ?? r.beta,
          roe: r.returnOnEquity,
          revenueGrowth: r.revenueGrowth,
          profitMargin: r.profitMargin,
          fcfYield: r.fcfYield,
          upside: r.upsidePct,
        };
      });
      const totalVal = resolved.reduce((s: number, r) => s + r.valorizado, 0);
      for (const item of mapped) {
        const match = resolved.find(
          (res) => res.analysisSymbol === item.ticker || res.priceSymbol === item.ticker,
        );
        item.weight = totalVal > 0 ? (match?.valorizado ?? 0) / totalVal : 0;
        item.cantidad = match?.cantidad ?? 0;
      }
      setItems(mapped);
    },
    [accessToken, loadPortfolio, fn, resolveIndustry],
  );

  //  Add ticker (auto, no recalc button) 
  const addTicker = async (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s || items.some((i) => i.ticker === s)) return;
    try {
      const results = await fn({ data: { symbols: [s] } });
      if (results.length > 0) {
        const r = results[0];
        const fundScore = computeFundScore(r);
        const rec =
          fundScore != null ? (fundScore >= 80 ? "BUY" : fundScore >= 60 ? "HOLD" : "SELL") : null;
        setItems((prev) => {
          const n = prev.length + 1;
          const equalW = 1 / n;
          const updated = prev.map((i) => ({ ...i, weight: equalW }));
          return [
            ...updated,
            {
              ticker: r.symbol,
              priceTicker: r.symbol,
              moneda: r.symbol.endsWith(".BA") ? ("ARS" as const) : ("USD" as const),
              weight: equalW,
              cantidad: 0,
              fundScore,
              rec,
              sector: r.sector,
              industry: r.industry ?? resolveIndustry(r.symbol),
              usdTicker: null,
              price: r.currentPrice,
              trailingPE: r.trailingPE,
              beta: r.betaPropio ?? r.beta,
              roe: r.returnOnEquity,
              revenueGrowth: r.revenueGrowth,
              profitMargin: r.profitMargin,
              fcfYield: r.fcfYield,
              upside: r.upsidePct,
            },
          ];
        });
      }
    } catch {
      /* ignore */
    }
  };

  const handleAddFromInput = () => {
    addTicker(tickerInput);
    setTickerInput("");
  };
  const handleAddFromSuggest = (ticker: string) => {
    addTicker(ticker);
  };

  //  Edit weight 
  const updateWeight = (ticker: string, newWeight: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.ticker === ticker ? { ...i, weight: Math.max(0, Math.min(1, newWeight / 100)) } : i,
      ),
    );
  };
  const updateCantidad = (ticker: string, newCant: number) => {
    setItems((prev) =>
      prev.map((i) => (i.ticker === ticker ? { ...i, cantidad: Math.max(0, newCant) } : i)),
    );
  };

  //  Remove ticker 
  const removeTicker = (ticker: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.ticker !== ticker);
      const n = next.length;
      return next.map((i) => ({ ...i, weight: n > 0 ? 1 / n : 0 }));
    });
  };

  //  Real-time computed metrics 
  const portfolioMetrics = useMemo(() => {
    const total = items.reduce((s, i) => s + i.weight, 0);
    if (total === 0 || items.length === 0) return null;
    const wScore = Math.round(
      items.reduce((s, i) => s + (i.fundScore ?? 50) * i.weight, 0) / total,
    );
    const wRet = items.reduce((s, i) => s + (expectedRet(i) ?? 0) * i.weight, 0) / total;
    const wBeta = items.reduce((s, i) => s + (i.beta ?? 1) * i.weight, 0) / total;
    const wRisk = wBeta * MARKET_VOL;
    return { wScore, wRet, wBeta, wRisk, n: items.length };
  }, [items]);

  //  Sector grouping 
  const sectorGroups = useMemo((): SectorGroup[] => {
    const map = new Map<string, PortfolioItem[]>();
    for (const item of items) {
      const sec = item.sector ?? "Sin sector";
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(item);
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const wA = a[1].reduce((s, i) => s + i.weight, 0);
        const wB = b[1].reduce((s, i) => s + i.weight, 0);
        return wB - wA;
      })
      .map(([sector, sitems]) => {
        const tw = sitems.reduce((s, i) => s + i.weight, 0);
        const sc = sitems.reduce((s, i) => s + (i.fundScore ?? 50) * i.weight, 0) / tw;
        const ret = sitems.reduce((s, i) => s + (expectedRet(i) ?? 0) * i.weight, 0) / tw;
        const rs = sitems.reduce((s, i) => s + (risk(i) ?? 0) * i.weight, 0) / tw;
        const indMap = new Map<string, PortfolioItem[]>();
        for (const it of sitems) {
          const ind = it.industry ?? "Otra";
          if (!indMap.has(ind)) indMap.set(ind, []);
          indMap.get(ind)!.push(it);
        }
        const industries = Array.from(indMap.entries())
          .sort((a, b) => {
            const wa = a[1].reduce((s, i) => s + i.weight, 0);
            const wb = b[1].reduce((s, i) => s + i.weight, 0);
            return wb - wa;
          })
          .map(([ind, indItems]) => ({
            industry: ind,
            items: indItems,
            totalWeight: indItems.reduce((s, i) => s + i.weight, 0),
            avgScore:
              indItems.reduce((s, i) => s + (i.fundScore ?? 50) * i.weight, 0) /
              indItems.reduce((s, i) => s + i.weight, 0),
          }));
        return {
          sector,
          items: sitems,
          totalWeight: tw,
          avgScore: sc,
          avgRet: ret,
          avgRisk: rs,
          industries,
        };
      });
  }, [items]);

  //  Interpret score 
  const interpretScore = (s: number) => {
    if (s > 70) return "Cartera con fundamentos sólidos.";
    if (s >= 40) return "Cartera con fundamentos mixtos.";
    return "Varias posiciones con fundamentos débiles.";
  };

  //  Optimizer 
  const runOptimization = async () => {
    const tickers = items.map((i) => i.usdTicker ?? i.ticker);
    if (tickers.length < 2) return;
    setOptLoading(true);
    setOptResult(null);
    try {
      const res = await optFn({
        data: {
          tickers,
          benchmarks: autoDetectBenchmarks ? [] : [benchmark],
          autoDetectBenchmarks,
          years: optYears,
          numSimulations: numSims,
        },
      });
      setOptResult(res);
    } catch (e: any) {
      setError(e.message);
    }
    setOptLoading(false);
  };

  //  Toggle sector in suggestion panel 
  const toggleSector = (s: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  useEffect(() => {
    if (accessToken && esAsesor === null) loadClientes();
  }, [accessToken, esAsesor, loadClientes]);

  // Si ya se determinó que es asesor (o no) y no hay cliente seleccionado,
  // precargar la cuenta propia para mantener paridad con el resto de los tabs.
  useEffect(() => {
    if (loadedRef.current) return;
    if (accessToken && esAsesor !== null && clienteId === 0 && !portLoading && items.length === 0) {
      if (!esAsesor) {
        loadedRef.current = true;
        loadIOL();
      }
    }
  }, [accessToken, esAsesor, clienteId, portLoading, items.length]); // SIN loadIOL en deps

  // Fetch chart data when items or range changes
  useEffect(() => {
    const tickers = items.map((i) => i.priceTicker).filter(Boolean);
    if (tickers.length === 0) {
      setChartSeries([]);
      return;
    }
    setChartLoading(true);
    chartFn({ data: { tickers, range: chartRange } })
      .then((res) => setChartSeries(res.series))
      .catch(() => setChartSeries([]))
      .finally(() => setChartLoading(false));
  }, [items, chartRange, chartFn]);

  return (
    <div className="space-y-4">
      {/*  IOL controls (unified)  */}
      <div className="flex flex-wrap items-center gap-2">
        {esAsesor === null ? (
          <button
            onClick={loadClientes}
            disabled={portLoading || !accessToken}
            className="rounded bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {portLoading ? "Cargando..." : "Conectar portafolio IOL"}
          </button>
        ) : (
          <>
            {esAsesor && clientes.length > 0 && (
              <select
                value={clienteId}
                onChange={(e) => {
                  iol.setClienteId(Number(e.target.value));
                }}
                className="rounded border border-border/40 bg-background px-2 py-1 font-mono text-[11px] outline-none"
              >
                <option value={0}>Seleccionar cliente...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => loadIOL(clienteId || undefined)}
              disabled={portLoading || (esAsesor && !clienteId)}
              className="rounded bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {portLoading ? "Cargando..." : "Cargar posiciones"}
            </button>
            {!accessToken && (
              <span className="text-[11px] text-warning">inicie sesion IOL en el header</span>
            )}
          </>
        )}
      </div>

      {/*  Agregar tickers manualmente  */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddFromInput();
            }}
            placeholder="Ej: AAPL, MSFT, NVDA..."
            className="flex-1 rounded border border-border/40 bg-background px-3 py-2 text-[11px] font-mono outline-none focus:border-primary/60"
          />
          <button
            onClick={handleAddFromInput}
            disabled={!tickerInput.trim()}
            className="rounded bg-primary/10 px-3 py-2 font-mono text-[11px] text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            + Agregar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-[10px] text-red-400">
          {error}
        </div>
      )}

      {/*  Portfolio summary header  */}
      {portfolioMetrics && (
        <div className="rounded-lg border border-border/40 bg-background/60 p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Portafolio
              </p>
              <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                <span
                  className={`font-mono text-xl font-bold ${scoreColor(portfolioMetrics.wScore)}`}
                >
                  Score {portfolioMetrics.wScore}/100
                </span>
                <span className="font-mono text-[12px] text-foreground">
                  Ret. esp. {fmtPct(portfolioMetrics.wRet / 100, 1)}
                </span>
                <span className="font-mono text-[12px] text-foreground">
                  Riesgo {portfolioMetrics.wRisk.toFixed(1)}%
                </span>
                <span className="font-mono text-[12px] text-foreground">
                  Beta {portfolioMetrics.wBeta.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {portfolioMetrics.n} activos
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {interpretScore(portfolioMetrics.wScore)}
              </p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <details className="w-full max-w-xs">
                <summary className="text-[9px] text-muted-foreground cursor-pointer hover:text-foreground select-none text-right">
                  Parametros de optimizacion
                </summary>
                <div className="mt-2 space-y-2 p-2 rounded border border-border/40 bg-background/60">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[9px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      Simulaciones
                    </span>
                    <input
                      type="number"
                      min={100}
                      max={10000}
                      step={100}
                      value={numSims}
                      onChange={(e) => setNumSims(Number(e.target.value))}
                      className="w-20 bg-background/40 border border-border/60 text-foreground text-xs rounded px-1.5 py-1 focus:border-primary outline-none font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[9px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      Periodo
                    </span>
                    <select
                      value={optYears}
                      onChange={(e) => setOptYears(Number(e.target.value))}
                      className="w-16 bg-background/40 border border-border/60 text-foreground text-xs rounded px-1.5 py-1 focus:border-primary outline-none font-mono"
                    >
                      <option value={0.5}>0.5</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoDetectBenchmarks}
                      onChange={(e) => setAutoDetectBenchmarks(e.target.checked)}
                      className="h-3 w-3 accent-primary"
                    />
                    <span className="mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      Auto bench
                    </span>
                  </label>
                  {!autoDetectBenchmarks && (
                    <input
                      value={benchmark}
                      onChange={(e) => setBenchmark(e.target.value.toUpperCase())}
                      placeholder="SPY"
                      className="w-full bg-background/40 border border-border/60 text-xs rounded px-1.5 py-1 focus:border-primary outline-none font-mono"
                    />
                  )}
                </div>
              </details>
              <button
                onClick={runOptimization}
                disabled={optLoading || items.length < 2}
                className="rounded bg-primary px-3 py-1.5 text-[10px] font-mono text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {optLoading ? "Optimizando..." : "Optimizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/*  Real-time dataframe con agrupación por sector/industria  */}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <tr>
                <th className="px-2 py-1.5">Ticker</th>
                <th className="px-2 py-1.5">Sector / Industria</th>
                <th className="px-2 py-1.5 text-right w-16">Peso %</th>
                <th className="px-2 py-1.5 text-right w-16">Cant</th>
                <th className="px-2 py-1.5 text-right">Score</th>
                <th className="px-2 py-1.5 text-center w-12">Rec</th>
                <th className="px-2 py-1.5 text-right">P/E</th>
                <th className="px-2 py-1.5 text-right">Ret.Esp.</th>
                <th className="px-2 py-1.5 text-right">Riesgo</th>
                <th className="px-2 py-1.5 text-right">Beta</th>
                <th className="px-2 py-1.5 text-right">ROE</th>
                <th className="px-2 py-1.5 text-right">Margen</th>
                <th className="px-2 py-1.5 text-right">FCF Y.</th>
                <th className="px-2 py-1.5 text-right w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sectorGroups.map((sg) => (
                <Fragment key={sg.sector}>
                  {/*  Sector total row  */}
                  <tr className="bg-muted/10 border-b border-border/30">
                    <td
                      colSpan={2}
                      className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground"
                    >
                      {sg.sector}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[10px] font-semibold text-foreground">
                      {(sg.totalWeight * 100).toFixed(1)}%
                    </td>
                    <td className="px-2 py-1.5"></td>
                    <td
                      className={`px-2 py-1.5 text-right text-[10px] font-semibold ${scoreColor(Math.round(sg.avgScore))}`}
                    >
                      {Math.round(sg.avgScore)}
                    </td>
                    <td className="px-2 py-1.5"></td>
                    <td className="px-2 py-1.5"></td>
                    <td className="px-2 py-1.5 text-right text-[10px] text-emerald-400">
                      {fmtPct(sg.avgRet / 100, 1)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[10px]">{sg.avgRisk.toFixed(1)}%</td>
                    <td colSpan={4}></td>
                  </tr>
                  {/*  Industry sub-rows  */}
                  {sg.industries.map((ind) => (
                    <Fragment key={ind.industry}>
                      <tr className="border-b border-border/10">
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1 text-[9px] italic text-muted-foreground/60">
                          {ind.industry}
                        </td>
                        <td className="px-2 py-1 text-right text-[9px] text-muted-foreground/60">
                          {(ind.totalWeight * 100).toFixed(1)}%
                        </td>
                        <td className="px-2 py-1"></td>
                        <td
                          className={`px-2 py-1 text-right text-[9px] ${scoreColor(Math.round(ind.avgScore))}`}
                        >
                          {Math.round(ind.avgScore)}
                        </td>
                        <td colSpan={8}></td>
                      </tr>
                      {/*  Individual ticker rows  */}
                      {ind.items.map((item) => {
                        const ret = expectedRet(item);
                        const rsk = risk(item);
                        const rec = recBadge(item.rec);
                        return (
                          <tr
                            key={item.ticker}
                            className="border-b border-border/5 hover:bg-muted/10 transition-colors"
                          >
                            <td className="px-2 py-1 font-semibold text-foreground">
                              {item.ticker}
                            </td>
                            <td className="px-2 py-1 text-[9px] text-muted-foreground">
                              {item.industry ?? "\u2014"}
                            </td>
                            <td className="px-2 py-1 text-right">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={(item.weight * 100).toFixed(1)}
                                onChange={(e) =>
                                  updateWeight(item.ticker, parseFloat(e.target.value) || 0)
                                }
                                className="w-14 text-right bg-transparent border-b border-border/30 text-[10px] font-mono text-foreground outline-none focus:border-primary/60"
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={item.cantidad}
                                onChange={(e) =>
                                  updateCantidad(item.ticker, parseInt(e.target.value) || 0)
                                }
                                className="w-14 text-right bg-transparent border-b border-border/30 text-[10px] font-mono text-foreground outline-none focus:border-primary/60"
                              />
                            </td>
                            <td
                              className={`px-2 py-1 text-right font-semibold ${scoreColor(item.fundScore)}`}
                            >
                              {item.fundScore != null ? item.fundScore : "\u2014"}
                            </td>
                            <td className="px-2 py-1 text-center">
                              <span
                                className={`inline-block rounded border px-1 py-0.5 text-[8px] ${rec.color}`}
                              >
                                {rec.label}
                              </span>
                            </td>
                            <td className="px-2 py-1 text-right text-muted-foreground">
                              {item.trailingPE != null ? f(item.trailingPE, 1) + "x" : "\u2014"}
                            </td>
                            <td
                              className={`px-2 py-1 text-right ${ret != null ? (ret >= 10 ? "text-emerald-400" : ret >= 0 ? "text-amber-400" : "text-red-400") : ""}`}
                            >
                              {ret != null ? fmtPct(ret / 100, 1) : "\u2014"}
                            </td>
                            <td className="px-2 py-1 text-right text-muted-foreground">
                              {rsk != null ? rsk.toFixed(1) + "%" : "\u2014"}
                            </td>
                            <td className="px-2 py-1 text-right text-muted-foreground">
                              {item.beta != null ? f(item.beta, 2) : "\u2014"}
                            </td>
                            <td
                              className={`px-2 py-1 text-right ${item.roe != null ? (item.roe >= 0.12 ? "text-emerald-400" : "text-amber-400") : ""}`}
                            >
                              {item.roe != null ? fmtPct(item.roe, 1) : "\u2014"}
                            </td>
                            <td
                              className={`px-2 py-1 text-right ${item.profitMargin != null ? (item.profitMargin >= 0.1 ? "text-emerald-400" : item.profitMargin >= 0 ? "text-amber-400" : "text-red-400") : ""}`}
                            >
                              {item.profitMargin != null ? fmtPct(item.profitMargin, 1) : "\u2014"}
                            </td>
                            <td
                              className={`px-2 py-1 text-right ${item.fcfYield != null ? (item.fcfYield >= 0.03 ? "text-emerald-400" : item.fcfYield >= 0 ? "text-amber-400" : "text-red-400") : ""}`}
                            >
                              {item.fcfYield != null ? fmtPct(item.fcfYield, 1) : "\u2014"}
                            </td>
                            <td className="px-2 py-1 text-right">
                              <button
                                onClick={() => removeTicker(item.ticker)}
                                className="text-[9px] text-red-400 hover:text-red-300"
                              >
                                
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
            {/*  Portfolio total row  */}
            {portfolioMetrics && (
              <tfoot className="border-t border-border/40 bg-muted/5">
                <tr>
                  <td colSpan={2} className="px-2 py-1.5 text-[10px] font-bold text-foreground">
                    TOTAL
                  </td>
                  <td className="px-2 py-1.5 text-right text-[10px] font-bold text-foreground">
                    100%
                  </td>
                  <td className="px-2 py-1.5"></td>
                  <td
                    className={`px-2 py-1.5 text-right text-[10px] font-bold ${scoreColor(portfolioMetrics.wScore)}`}
                  >
                    {portfolioMetrics.wScore}
                  </td>
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5 text-right text-[10px] font-bold text-emerald-400">
                    {fmtPct(portfolioMetrics.wRet / 100, 1)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[10px] font-bold">
                    {portfolioMetrics.wRisk.toFixed(1)}%
                  </td>
                  <td className="px-2 py-1.5 text-right text-[10px] font-bold">
                    {portfolioMetrics.wBeta.toFixed(2)}
                  </td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
          <div className="p-2 text-[8px] text-muted-foreground border-t border-border/20">
            Los pesos y cantidades son editables en vivo. Ret.Esp = upside de analistas o CAPM (RF{" "}
            {RF_RATE}% + beta × {ERP}%). Riesgo = beta × vol mercado ({MARKET_VOL}%).
          </div>
        </div>
      )}

      {/*  Charts de series históricas  */}
      {items.length > 0 && (
        <details className="rounded-lg border border-border/40 bg-background/40">
          <summary className="px-4 py-3 text-[10px] font-mono text-muted-foreground cursor-pointer hover:text-foreground select-none">
            Desempeño histórico — {items.length} activos
          </summary>
          <div className="px-4 pb-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(["1m", "3m", "6m", "1y", "5y"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setChartRange(r)}
                  className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors ${chartRange === r ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            {chartLoading ? (
              <div className="flex items-center justify-center h-48 text-[10px] text-muted-foreground">
                Cargando series...
              </div>
            ) : chartSeries.length > 1 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "#9aa6bd" }}
                    stroke="#2b3242"
                    tickFormatter={(v: string) => v?.slice(5, 10) ?? ""}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 9, fill: "#9aa6bd" }}
                    stroke="#2b3242"
                    width={55}
                    tickFormatter={(v: number) => v.toFixed(0)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#141a28",
                      border: "1px solid #2b3242",
                      borderRadius: 8,
                      fontSize: 10,
                      fontFamily: "monospace",
                    }}
                  />
                  {chartSeries.length > 0 &&
                    Object.keys(chartSeries[0]?.values ?? {})
                      .filter((t) => t !== "SPY")
                      .map((ticker, idx) => {
                        const colors = [
                          "#22c55e",
                          "#3b82f6",
                          "#f59e0b",
                          "#ef4444",
                          "#8b5cf6",
                          "#06b6d4",
                          "#f97316",
                          "#84cc16",
                          "#ec4899",
                          "#14b8a6",
                        ];
                        return (
                          <Line
                            key={ticker}
                            type="monotone"
                            dataKey={`values.${ticker}`}
                            stroke={colors[idx % colors.length]}
                            strokeWidth={1.5}
                            dot={false}
                            name={ticker}
                            connectNulls
                          />
                        );
                      })}
                  {chartSeries.some((s) => s.values["SPY"] != null) && (
                    <Line
                      type="monotone"
                      dataKey="values.SPY"
                      stroke="#9aa6bd"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      dot={false}
                      name="S&P 500"
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-[10px] text-muted-foreground">
                No hay suficientes datos históricos.
              </div>
            )}
          </div>
        </details>
      )}

      {/*  Optimization results  */}
      {optResult && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border/40 bg-muted/5 p-4">
            <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Resultados de optimización vs {benchmark}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {optResult.strategies.slice(0, 5).map((p) => (
                <div
                  key={p.strategy}
                  className={`rounded border p-2 ${p.strategy === "max-sharpe" ? "border-primary/40 bg-primary/5" : "border-border/40 bg-muted/10"}`}
                >
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                    {p.strategy}
                  </div>
                  <div className="mt-1 font-mono text-xs font-semibold text-foreground">
                    {p.expectedReturn != null ? fmtPct(p.expectedReturn, 1) : "\u2014"}
                  </div>
                  <div className="font-mono text-[9px] text-muted-foreground">
                    Vol: {p.volatility != null ? fmtPct(p.volatility, 1) : "\u2014"}
                  </div>
                  <div className="font-mono text-[9px] text-muted-foreground">
                    Sharpe: {p.sharpe != null ? f(p.sharpe, 2) : "\u2014"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {optResult.equityCurve && optResult.equityCurve.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-background/40 p-3">
              <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Recorrido global normalizado (Base 100)
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart
                  data={optResult.equityCurve}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "#9aa6bd" }}
                    stroke="#2b3242"
                    tickFormatter={(v: string) => v?.slice(5, 10) ?? ""}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 9, fill: "#9aa6bd" }}
                    stroke="#2b3242"
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#141a28",
                      border: "1px solid #2b3242",
                      borderRadius: 8,
                      fontSize: 10,
                      fontFamily: "monospace",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#eqGrad)"
                    name="Portfolio"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {optResult.frontier && optResult.frontier.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-background/40 p-3 overflow-hidden">
              <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Frontera eficiente
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={optResult.frontier}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="vol"
                    tick={{ fontSize: 9, fill: "#9aa6bd" }}
                    stroke="#2b3242"
                    tickFormatter={(v: number) => (v * 100).toFixed(1) + "%"}
                  />
                  <YAxis
                    dataKey="ret"
                    tick={{ fontSize: 9, fill: "#9aa6bd" }}
                    stroke="#2b3242"
                    tickFormatter={(v: number) => (v * 100).toFixed(1) + "%"}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#141a28",
                      border: "1px solid #2b3242",
                      borderRadius: 8,
                      fontSize: 10,
                      fontFamily: "monospace",
                    }}
                    formatter={(v: number) => [(v * 100).toFixed(2) + "%"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="ret"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Frontera"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
