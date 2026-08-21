// @ts-nocheck
import { useState, useMemo, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { rebalanceAnalyze, type RebalanceResult } from "@/lib/rebalanceador.functions";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
} from "recharts";

const fmt = (n: number, d = 2) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

type ManualRow = { id: string; ticker: string; cantidad: number; precioPromedio?: number };

const STORAGE_KEY = "clarity-rebalanceador-portfolios";

interface SavedPortfolio {
  id: string;
  name: string;
  rows: ManualRow[];
  capital: number;
  mode: "all" | "loss-only" | "gain-only";
  benchmarks: string;
}

let uidCounter = 0;
function genId() {
  return `p-${++uidCounter}-${Date.now()}`;
}

function loadPortfolios(): SavedPortfolio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: SavedPortfolio[] = JSON.parse(raw);
      for (const pf of parsed) {
        for (const row of pf.rows) {
          if (!row.id) row.id = genId();
        }
      }
      return parsed;
    }
  } catch {}
  return [];
}

function savePortfolios(portfolios: SavedPortfolio[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
  } catch {}
}

const STRATEGY_LABELS: Record<string, string> = {
  "min-variance": "Mín. Varianza",
  "max-sharpe": "Máx. Sharpe",
  "equal-weight": "Equiponderado",
  "inverse-vol": "Inv. Volatilidad",
  markowitz: "Markowitz",
};

const STRATEGY_COLORS: Record<string, string> = {
  "min-variance": "#6EA8FE",
  "max-sharpe": "#10B981",
  "equal-weight": "#E8B25A",
  "inverse-vol": "#8B5CF6",
  markowitz: "#E8735A",
};

const SECTOR_COLORS = [
  "#10B981",
  "#E8B25A",
  "#6EA8FE",
  "#8B5CF6",
  "#E8735A",
  "#EC4899",
  "#06B6D4",
  "#F59E0B",
];

export function RebalanceadorSubTab() {
  const fnAnalyze = useServerFn(rebalanceAnalyze);

  //  Multi-portfolio state 
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [portfolios, setPortfolios] = useState<SavedPortfolio[]>(() => {
    const loaded = loadPortfolios();
    if (loaded.length === 0) {
      return [
        {
          id: genId(),
          name: "Portafolio 1",
          rows: [{ id: genId(), ticker: "", cantidad: 0 }],
          capital: 0,
          mode: "all",
          benchmarks: "^MERV, SPY",
        },
      ];
    }
    return loaded;
  });
  const [activeId, setActiveId] = useState(() => portfolios[0]?.id ?? "");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RebalanceResult | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState(0);

  const activePortfolio = portfolios.find((p) => p.id === activeId);
  const rows = activePortfolio?.rows ?? [{ id: "", ticker: "", cantidad: 0 }];
  const capital = activePortfolio?.capital ?? 0;
  const mode = (activePortfolio?.mode ?? "all") as "all" | "loss-only" | "gain-only";
  const benchmarks = activePortfolio?.benchmarks ?? "^MERV, SPY";

  const updatePortfolios = useCallback((updated: SavedPortfolio[]) => {
    setPortfolios(updated);
    savePortfolios(updated);
  }, []);

  const setRows = (next: ManualRow[] | ((prev: ManualRow[]) => ManualRow[])) => {
    const current = activePortfolio?.rows ?? [];
    const resolved = typeof next === "function" ? next(current) : next;
    setPortfolios((prev) => {
      const updated = prev.map((p) => (p.id === activeId ? { ...p, rows: resolved } : p));
      savePortfolios(updated);
      return updated;
    });
  };

  const setCapitalVal = (val: number) => {
    setPortfolios((prev) => {
      const updated = prev.map((p) => (p.id === activeId ? { ...p, capital: val } : p));
      savePortfolios(updated);
      return updated;
    });
  };

  const setModeVal = (val: string) => {
    setPortfolios((prev) => {
      const updated = prev.map((p) => (p.id === activeId ? { ...p, mode: val as any } : p));
      savePortfolios(updated);
      return updated;
    });
  };

  const setBenchmarksVal = (val: string) => {
    setPortfolios((prev) => {
      const updated = prev.map((p) => (p.id === activeId ? { ...p, benchmarks: val } : p));
      savePortfolios(updated);
      return updated;
    });
  };

  const updateRow = (id: string, field: keyof ManualRow, value: string | number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, { id: genId(), ticker: "", cantidad: 0 }]);
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  function crearPortafolio() {
    const n = portfolios.length + 1;
    const newPf: SavedPortfolio = {
      id: genId(),
      name: `Portafolio ${n}`,
      rows: [{ id: genId(), ticker: "", cantidad: 0 }],
      capital: 0,
      mode: "all",
      benchmarks: "^MERV, SPY",
    };
    updatePortfolios([...portfolios, newPf]);
    setActiveId(newPf.id);
    setResult(null);
  }

  function eliminarPortafolio(id: string) {
    if (portfolios.length <= 1) return;
    const updated = portfolios.filter((p) => p.id !== id);
    updatePortfolios(updated);
    if (activeId === id) setActiveId(updated[0]?.id ?? "");
    setResult(null);
  }

  function renamePortafolio(id: string, newName: string) {
    const updated = portfolios.map((p) => (p.id === id ? { ...p, name: newName } : p));
    updatePortfolios(updated);
    setEditingName(null);
  }

  const handleAnalyze = async () => {
    const valid = rows.filter((r) => r.ticker.trim() && r.cantidad > 0);
    if (valid.length === 0) return;
    setLoading(true);
    try {
      // Client-side cache key based on input hash
      const inputKey = JSON.stringify({
        tickers: valid.map((r) => r.ticker.trim().toUpperCase()),
        mode,
        capital,
      });
      const cachedRaw =
        typeof window !== "undefined" ? localStorage.getItem("rebalance_cache_" + inputKey) : null;
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as RebalanceResult;
        const age = Date.now() - (cached as any)._cachedAt;
        if (age < 5 * 60 * 1000) {
          // 5 min TTL
          setResult(cached);
          setSelectedStrategy(0);
          setLoading(false);
          return;
        }
      }

      const benchList = benchmarks.split(/[\s,;]+/).filter(Boolean);
      const res = await fnAnalyze({
        data: {
          items: valid.map((r) => ({
            ticker: r.ticker.trim().toUpperCase(),
            cantidad: r.cantidad,
            precioPromedio: r.precioPromedio && r.precioPromedio > 0 ? r.precioPromedio : undefined,
          })),
          capitalAdicional: capital,
          mode,
          period: 365,
          benchmarks: benchList.length > 0 ? benchList : undefined,
        },
      });
      // Cache in localStorage
      try {
        localStorage.setItem(
          "rebalance_cache_" + inputKey,
          JSON.stringify({ ...res, _cachedAt: Date.now() }),
        );
      } catch {}
      setResult(res);
      setSelectedStrategy(0);
    } finally {
      setLoading(false);
    }
  };

  const strategy = result?.strategies[selectedStrategy];
  const strategyWeights = useMemo(() => {
    if (!strategy?.weights) return [];
    return Object.entries(strategy.weights)
      .map(([ticker, weight]) => ({ ticker, weight, label: ticker.replace(".BA", "") }))
      .sort((a, b) => b.weight - a.weight);
  }, [strategy]);

  const totalInvertido = result?.totalValorizado ?? 0;
  const totalConCapital = totalInvertido + capital;

  const pesoActual = useMemo(() => {
    if (!result || totalInvertido === 0) return [];
    return result.positions
      .filter((p) => p.valorizado > 0)
      .map((p) => ({
        ticker: p.ticker.replace(".BA", ""),
        peso: p.valorizado / totalInvertido,
        valor: p.valorizado,
        plPct: p.plPct,
      }))
      .sort((a, b) => b.peso - a.peso);
  }, [result, totalInvertido]);

  return (
    <div className="space-y-4">
      <div className="mono text-[14px] uppercase tracking-[0.22em] text-primary/80">
        Rebalanceador de Portafolio
      </div>
      <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
        Smart Beta <span className="text-emerald-400">Optimizer</span>
      </h2>

      {/* Input */}
      {/* Multi-portfolio tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-border/40 pb-2">
        {portfolios.map((pf) => (
          <button
            key={pf.id}
            onClick={() => {
              setActiveId(pf.id);
              setResult(null);
            }}
            className={`relative text-xs px-3 py-1.5 rounded-t-md transition-all font-mono ${
              pf.id === activeId
                ? "bg-primary/10 text-primary border border-primary/30 border-b-background"
                : "text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            {editingName === pf.id ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => renamePortafolio(pf.id, nameDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renamePortafolio(pf.id, nameDraft);
                }}
                className="w-20 bg-background border border-border/40 rounded px-1 text-[14px] outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                onDoubleClick={() => {
                  setEditingName(pf.id);
                  setNameDraft(pf.name);
                }}
              >
                {pf.name}
              </span>
            )}
            {portfolios.length > 1 && pf.id === activeId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  eliminarPortafolio(pf.id);
                }}
                className="ml-1.5 text-red-400/50 hover:text-red-400 text-[13px]"
              >
                
              </button>
            )}
          </button>
        ))}
        <button
          onClick={crearPortafolio}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
        >
          + Nuevo
        </button>
      </div>

      <div className="rounded-lg border border-border/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
            Cartera actual
          </span>
          <div className="flex items-center gap-2">
            <select
              value={mode}
              onChange={(e) => setModeVal(e.target.value)}
              className="bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 outline-none focus:border-primary/60"
            >
              <option value="all">Rebalancear todo</option>
              <option value="loss-only">Solo posiciones en pérdida</option>
              <option value="gain-only">Solo posiciones ganadoras</option>
            </select>
            <button
              onClick={addRow}
              className="mono text-[13px] uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-md hover:bg-emerald-500/20"
            >
              + Agregar
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[14px]">
            <thead className="text-[13px] uppercase tracking-wider text-muted-foreground bg-muted/10">
              <tr>
                <th className="px-2 py-1.5">Ticker</th>
                <th className="px-2 py-1.5 text-right">Cantidad</th>
                <th className="px-2 py-1.5 text-right">Precio prom.</th>
                <th className="px-2 py-1.5 text-right w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/10">
                  <td className="px-2 py-1">
                    <input
                      value={row.ticker}
                      onChange={(e) => updateRow(row.id, "ticker", e.target.value.toUpperCase())}
                      placeholder="AAPL.BA"
                      className="w-28 bg-background/40 border border-border/40 rounded px-1.5 py-1 text-[14px] outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      min={0}
                      value={row.cantidad || ""}
                      onChange={(e) => updateRow(row.id, "cantidad", +e.target.value || 0)}
                      className="w-24 text-right bg-background/40 border border-border/40 rounded px-1.5 py-1 text-[14px] outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.precioPromedio || ""}
                      onChange={(e) => updateRow(row.id, "precioPromedio", +e.target.value || 0)}
                      placeholder="opcional"
                      className="w-28 text-right bg-background/40 border border-border/40 rounded px-1.5 py-1 text-[14px] outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    {rows.length > 1 && (
                      <button
                        onClick={() => removeRow(row.id)}
                        className="text-red-400/60 hover:text-red-400 text-xs"
                      >
                        
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Capital adicional:</span>
            <input
              type="number"
              min={0}
              value={capital || ""}
              onChange={(e) => setCapitalVal(+e.target.value || 0)}
              className="w-28 text-right bg-background/40 border border-border/40 rounded px-2 py-1 text-xs outline-none focus:border-primary/60 font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Benchmark(s) CAPM:</span>
            <input
              value={benchmarks}
              onChange={(e) => setBenchmarksVal(e.target.value)}
              placeholder="^MERV, SPY"
              className="w-44 bg-background/40 border border-border/40 rounded px-2 py-1 text-xs outline-none focus:border-primary/60 font-mono"
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="mono text-xs uppercase tracking-wider bg-primary/10 text-primary border border-primary/30 px-4 py-1.5 rounded-md hover:bg-primary/20 disabled:opacity-50"
          >
            {loading ? "Analizando…" : "Rebalancear"}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 rounded-lg border border-border/40 overflow-hidden bg-border/40">
            <div className="bg-background/40 p-4">
              <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                Valor cartera
              </div>
              <div className="text-xl font-bold font-mono">${fmt(totalInvertido, 0)}</div>
              <div className="text-[13px] text-muted-foreground">
                {result.positions.length} activos ·{" "}
                {result.positions.filter((p) => p.plPct < 0).length} en pérdida
              </div>
            </div>
            <div className="bg-background/40 p-4">
              <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                Total + capital
              </div>
              <div className="text-xl font-bold font-mono">${fmt(totalConCapital, 0)}</div>
              <div className="text-[13px] text-muted-foreground">
                Capital disp: ${fmt(capital, 0)}
              </div>
            </div>
            <div className="bg-background/40 p-4">
              <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                Retorno real anual
              </div>
              <div
                className="text-xl font-bold font-mono"
                style={{
                  color:
                    result.portfolioMetrics && result.portfolioMetrics.retornoRealAnual >= 0
                      ? "#10B981"
                      : "#E8735A",
                }}
              >
                {result.portfolioMetrics
                  ? (result.portfolioMetrics.retornoRealAnual >= 0 ? "+" : "") +
                    result.portfolioMetrics.retornoRealAnual.toFixed(1) +
                    "%"
                  : "—"}
              </div>
              <div className="text-[13px] text-muted-foreground">
                Sharpe: {result.portfolioMetrics ? result.portfolioMetrics.sharpe.toFixed(2) : "—"}
              </div>
            </div>
            <div className="bg-background/40 p-4">
              <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                Riesgo (Vol anual)
              </div>
              <div className="text-xl font-bold font-mono text-amber-400">
                {result.portfolioMetrics
                  ? result.portfolioMetrics.volatilidadAnual.toFixed(1) + "%"
                  : "—"}
              </div>
              <div className="text-[13px] text-muted-foreground">
                VaR 95%:{" "}
                {result.portfolioMetrics ? result.portfolioMetrics.var95.toFixed(1) + "%" : "—"} ·
                DD:{" "}
                {result.portfolioMetrics
                  ? result.portfolioMetrics.maxDrawdown.toFixed(1) + "%"
                  : "—"}
              </div>
            </div>
          </div>

          {/* Efficient Frontier */}
          {result.efficientFrontier && result.efficientFrontier.length > 0 && (
            <div className="rounded-lg border border-border/40 p-4">
              <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                Frontera eficiente · 2000 simulaciones Monte Carlo
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="vol"
                    name="Volatilidad"
                    unit="%"
                    tick={{ fontSize: 8, fill: "#9aa6bd" }}
                    stroke="#2b3242"
                    domain={["auto", "auto"]}
                  />
                  <YAxis
                    dataKey="ret"
                    name="Retorno"
                    unit="%"
                    tick={{ fontSize: 8, fill: "#9aa6bd" }}
                    stroke="#2b3242"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#141a28",
                      border: "1px solid #2b3242",
                      borderRadius: 8,
                      fontSize: 10,
                      fontFamily: "monospace",
                    }}
                    formatter={(value: number, name: string) => [
                      value.toFixed(2) + "%",
                      name === "vol" ? "Volatilidad" : "Retorno esperado",
                    ]}
                  />
                  <Scatter
                    data={result.efficientFrontier.map((p) => ({
                      vol: p.volatility,
                      ret: p.expectedReturn,
                    }))}
                    fill="rgba(255,255,255,0.08)"
                    r={2}
                  />
                  {result.strategies.map((s, i) => {
                    const color = STRATEGY_COLORS[s.name] || "#666";
                    return (
                      <Scatter
                        key={s.name}
                        data={[{ vol: s.volatility, ret: s.expectedReturn }]}
                        fill={color}
                        r={6}
                        name={STRATEGY_LABELS[s.name] || s.name}
                      />
                    );
                  })}
                  {result.currentPortfolio && (
                    <Scatter
                      data={[
                        {
                          vol: result.currentPortfolio.volatility,
                          ret: result.currentPortfolio.expectedReturn,
                        },
                      ]}
                      fill="#E8735A"
                      r={8}
                      name="Portafolio actual"
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 text-[13px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-white/20" /> 2000
                  simulaciones
                </span>
                {result.strategies.map((s) => (
                  <span key={s.name} className="flex items-center gap-1">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: STRATEGY_COLORS[s.name] }}
                    />
                    {STRATEGY_LABELS[s.name]}
                  </span>
                ))}
                {result.currentPortfolio && (
                  <span className="flex items-center gap-1">
                    <span className="text-red-400 text-[13px]"></span> Portafolio actual
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Current portfolio point summary */}
          {result.currentPortfolio && (
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/40 overflow-hidden bg-border/40">
              <div className="bg-background/40 p-3">
                <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                  Retorno esperado actual
                </div>
                <div
                  className="text-lg font-bold font-mono"
                  style={{
                    color: result.currentPortfolio.expectedReturn >= 0 ? "#10B981" : "#E8735A",
                  }}
                >
                  {result.currentPortfolio.expectedReturn >= 0 ? "+" : ""}
                  {result.currentPortfolio.expectedReturn.toFixed(1)}%
                </div>
              </div>
              <div className="bg-background/40 p-3">
                <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                  Riesgo actual
                </div>
                <div className="text-lg font-bold font-mono text-amber-400">
                  {result.currentPortfolio.volatility.toFixed(1)}%
                </div>
              </div>
              <div className="bg-background/40 p-3">
                <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                  Sharpe actual
                </div>
                <div
                  className="text-lg font-bold font-mono"
                  style={{ color: result.currentPortfolio.sharpe >= 1 ? "#10B981" : "#E8B25A" }}
                >
                  {result.currentPortfolio.sharpe.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* CAPM analysis */}
          {result.capmAnalysis && result.capmAnalysis.length > 0 && (
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground px-4 py-3 bg-muted/10 border-b border-border/40">
                CAPM vs benchmark
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[13px]">
                  <thead className="text-[12px] uppercase tracking-wider text-muted-foreground bg-muted/10">
                    <tr>
                      <th className="px-3 py-2">Benchmark</th>
                      <th className="px-3 py-2 text-right">Beta</th>
                      <th className="px-3 py-2 text-right">Alpha</th>
                      <th className="px-3 py-2 text-right">R²</th>
                      <th className="px-3 py-2 text-right">Corr</th>
                      <th className="px-3 py-2 text-right">Obs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.capmAnalysis.map((ca) => (
                      <tr
                        key={ca.benchmark}
                        className="border-b border-border/10 hover:bg-muted/10"
                      >
                        <td className="px-3 py-2 font-semibold">{ca.benchmark}</td>
                        <td className="px-3 py-2 text-right">{ca.beta.toFixed(3)}</td>
                        <td
                          className="px-3 py-2 text-right"
                          style={{ color: ca.alpha >= 0 ? "#10B981" : "#E8735A" }}
                        >
                          {ca.alpha >= 0 ? "+" : ""}
                          {(ca.alpha * 100).toFixed(3)}%
                        </td>
                        <td className="px-3 py-2 text-right">{(ca.r2 * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">{ca.correlation.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right">{ca.observations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Strategy comparison */}
          {result.strategies.length > 0 && (
            <div className="rounded-lg border border-border/40 p-4 space-y-3">
              <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
                Comparación de estrategias
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {result.strategies.map((s, i) => (
                  <button
                    key={s.name}
                    onClick={() => setSelectedStrategy(i)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      selectedStrategy === i
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/40 bg-background/40 hover:bg-muted/10"
                    }`}
                  >
                    <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                      {STRATEGY_LABELS[s.name]}
                    </div>
                    <div
                      className="text-lg font-bold font-mono"
                      style={{ color: STRATEGY_COLORS[s.name] }}
                    >
                      {s.sharpe > 0 ? "+" : ""}
                      {s.sharpe.toFixed(2)}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      Ret: {pct(s.expectedReturn * 252 * 100)} · Vol:{" "}
                      {pct(s.volatility * Math.sqrt(252) * 100)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 02 · Asignación por categoría */}
          {result.enrichedPositions && result.enrichedPositions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/40 p-4">
                <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                  Por categoría
                </div>
                <div className="flex items-center justify-center" style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(() => {
                          const map = new Map<string, number>();
                          for (const e of result.enrichedPositions!)
                            map.set(e.categoriaMacro, (map.get(e.categoriaMacro) || 0) + e.pesoPct);
                          return [...map.entries()].map(([name, value]) => ({ name, value }));
                        })()}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={60}
                      >
                        {["#10B981", "#6EA8FE", "#E8B25A"].map((c, i) => (
                          <Cell key={i} fill={c} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#141a28",
                          border: "1px solid #2b3242",
                          borderRadius: 8,
                          fontSize: 10,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 text-[13px] text-muted-foreground flex-wrap">
                  {(() => {
                    const map = new Map<string, number>();
                    for (const e of result.enrichedPositions!)
                      map.set(e.categoriaMacro, (map.get(e.categoriaMacro) || 0) + e.pesoPct);
                    return [...map.entries()].map(([name, value], i) => (
                      <span key={name} className="flex items-center gap-1">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: ["#10B981", "#6EA8FE", "#E8B25A"][i] }}
                        />
                        {name} {value.toFixed(1)}%
                      </span>
                    ));
                  })()}
                </div>
              </div>
              <div className="rounded-lg border border-border/40 p-4">
                <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                  Por subtipo
                </div>
                <div className="flex items-center justify-center" style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(() => {
                          const map = new Map<string, number>();
                          for (const e of result.enrichedPositions!)
                            map.set(e.subtipo, (map.get(e.subtipo) || 0) + e.pesoPct);
                          return [...map.entries()].map(([name, value]) => ({ name, value }));
                        })()}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={60}
                      >
                        {result.enrichedPositions.map((_, i) => (
                          <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#141a28",
                          border: "1px solid #2b3242",
                          borderRadius: 8,
                          fontSize: 10,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 text-[13px] text-muted-foreground flex-wrap">
                  {(() => {
                    const map = new Map<string, number>();
                    for (const e of result.enrichedPositions!)
                      map.set(e.subtipo, (map.get(e.subtipo) || 0) + e.pesoPct);
                    return [...map.entries()].map(([name, value]) => (
                      <span key={name} className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-foreground/30" />{" "}
                        {name} {value.toFixed(1)}%
                      </span>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* 07 · Detalle técnico-fundamental por activo */}
          {result.enrichedPositions &&
            result.enrichedPositions.filter((e) => e.categoriaMacro === "RentaVariable").length >
              0 && (
              <div className="rounded-lg border border-border/40 p-4">
                <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                  Detalle técnico · Renta Variable
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {result.enrichedPositions
                    .filter((e) => e.categoriaMacro === "RentaVariable")
                    .map((e) => (
                      <div
                        key={e.ticker}
                        className="border border-border/40 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{e.ticker}</span>
                          <span
                            className={`text-[13px] px-2 py-0.5 rounded-full font-mono ${
                              e.score && e.score >= 4
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : e.score && e.score >= 1
                                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                  : "bg-red-500/15 text-red-400 border border-red-500/30"
                            }`}
                          >
                            {e.score && e.score >= 4
                              ? "COMPRA"
                              : e.score && e.score >= 1
                                ? "NEUTRAL"
                                : "VENTA"}
                          </span>
                        </div>
                        <div className="text-[13px] text-muted-foreground">
                          ${fmt(e.precio, 0)} · Peso: {e.pesoPct.toFixed(1)}%
                        </div>
                        {e.plPct !== undefined && e.plPct !== 0 && (
                          <div
                            className={`text-[13px] ${e.plPct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                          >
                            {e.plPct >= 0 ? "+" : ""}
                            {e.plPct.toFixed(2)}%
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">RSI</span>
                            <span
                              className="font-mono font-medium"
                              style={{
                                color:
                                  e.rsi && e.rsi > 70
                                    ? "#E8735A"
                                    : e.rsi && e.rsi < 30
                                      ? "#10B981"
                                      : "#9aa6bd",
                              }}
                            >
                              {e.rsi?.toFixed(1) ?? "—"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">SMA50</span>
                            <span className="font-mono">
                              {e.sma50 ? "$" + fmt(e.sma50, 0) : "—"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">SMA200</span>
                            <span className="font-mono">
                              {e.sma200 ? "$" + fmt(e.sma200, 0) : "—"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Beta</span>
                            <span className="font-mono">{e.beta ? e.beta.toFixed(2) : "—"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[12px] text-muted-foreground">Score:</span>
                          <span
                            className={`text-[13px] font-mono font-bold ${
                              e.score && e.score >= 4
                                ? "text-emerald-400"
                                : e.score && e.score >= 1
                                  ? "text-amber-400"
                                  : "text-red-400"
                            }`}
                          >
                            {e.score !== undefined && e.score !== 0
                              ? (e.score >= 0 ? "+" : "") + e.score.toFixed(2)
                              : "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

          {/* Distribution pie per strategy */}
          {strategy && strategyWeights.length > 0 && (
            <div className="rounded-lg border border-border/40 p-4">
              <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                {STRATEGY_LABELS[strategy.name]} — Distribución
              </div>
              <div className="flex items-center justify-center" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={strategyWeights.map((w) => ({
                        name: w.label,
                        value: +(w.weight * 100).toFixed(1),
                      }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      label={({ name, value }) => `${name} ${value}%`}
                      labelLine={false}
                    >
                      {strategyWeights.map((_, i) => (
                        <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#141a28",
                        border: "1px solid #2b3242",
                        borderRadius: 8,
                        fontSize: 10,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Individual asset table with sector, return, vol, sharpe */}
          {result.enrichedPositions &&
            result.enrichedPositions.filter((e) => e.retornoAnual !== undefined).length > 0 && (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground px-4 py-3 bg-muted/10 border-b border-border/40">
                  Activos individuales — {STRATEGY_LABELS[strategy?.name || "max-sharpe"]}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[13px]">
                    <thead className="text-[12px] uppercase tracking-wider text-muted-foreground bg-muted/10">
                      <tr>
                        <th className="px-3 py-2">Ticker</th>
                        <th className="px-3 py-2">Sector</th>
                        <th className="px-3 py-2">Industria</th>
                        <th className="px-3 py-2 text-right">Peso</th>
                        <th className="px-3 py-2 text-right">Asignación</th>
                        <th className="px-3 py-2 text-right">Retorno anual</th>
                        <th className="px-3 py-2 text-right">Volatilidad</th>
                        <th className="px-3 py-2 text-right">Sharpe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const activeTickers = strategy ? strategyWeights.map((w) => w.ticker) : [];
                        const sorted = [...result.enrichedPositions!]
                          .filter(
                            (e) => activeTickers.length === 0 || activeTickers.includes(e.ticker),
                          )
                          .sort((a, b) => (b.pesoPct || 0) - (a.pesoPct || 0));
                        const totalCapital = totalConCapital;
                        return sorted.map((e) => {
                          const peso = strategy
                            ? (strategyWeights.find((w) => w.ticker === e.ticker)?.weight ??
                              e.pesoPct / 100)
                            : e.pesoPct / 100;
                          const asignacion = totalCapital * peso;
                          return (
                            <tr
                              key={e.ticker}
                              className="border-b border-border/10 hover:bg-muted/10"
                            >
                              <td className="px-3 py-2 font-semibold">{e.ticker}</td>
                              <td className="px-3 py-2 text-[13px] text-muted-foreground">
                                {e.sector || "—"}
                              </td>
                              <td className="px-3 py-2 text-[13px] text-muted-foreground">
                                {e.industria || "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {peso > 0
                                  ? (peso >= 0 ? "+" : "") + (peso * 100).toFixed(2) + "%"
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                ${fmt(asignacion, 0)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right font-mono ${e.retornoAnual && e.retornoAnual >= 0 ? "text-emerald-400" : "text-red-400"}`}
                              >
                                {e.retornoAnual
                                  ? (e.retornoAnual >= 0 ? "+" : "") +
                                    e.retornoAnual.toFixed(2) +
                                    "%"
                                  : "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {e.volatilidadAnual ? e.volatilidadAnual.toFixed(2) + "%" : "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {e.sharpe ? e.sharpe.toFixed(2) : "—"}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* Scenario analysis table */}
          {result.enrichedPositions &&
            result.enrichedPositions.filter((e) => e.escenarios).length > 0 &&
            strategy && (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground px-4 py-3 bg-muted/10 border-b border-border/40">
                  Escenarios ponderados del portafolio ({STRATEGY_LABELS[strategy.name]})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[13px]">
                    <thead className="text-[12px] uppercase tracking-wider text-muted-foreground bg-muted/10">
                      <tr>
                        <th className="px-3 py-2">Ticker</th>
                        <th className="px-3 py-2 text-right">Pérdida máx.</th>
                        <th className="px-3 py-2 text-right">Pérdida esp.</th>
                        <th className="px-3 py-2 text-right">Ganancia esp.</th>
                        <th className="px-3 py-2 text-right">Ganancia máx.</th>
                        <th className="px-3 py-2 text-right">Más probable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const activeTickers = strategyWeights.map((w) => w.ticker);
                        return result
                          .enrichedPositions!.filter(
                            (e) => e.escenarios && activeTickers.includes(e.ticker),
                          )
                          .sort((a, b) => (b.pesoPct || 0) - (a.pesoPct || 0))
                          .map((e) => {
                            const s = e.escenarios!;
                            return (
                              <tr
                                key={e.ticker}
                                className="border-b border-border/10 hover:bg-muted/10"
                              >
                                <td className="px-3 py-2 font-semibold">{e.ticker}</td>
                                <td className="px-3 py-2 text-right text-red-400">
                                  {s.perdidaMax.toFixed(2)}%
                                </td>
                                <td className="px-3 py-2 text-right text-red-400/70">
                                  {s.perdidaEsperada.toFixed(2)}%
                                </td>
                                <td className="px-3 py-2 text-right text-emerald-400/70">
                                  {s.gananciaEsperada.toFixed(2)}%
                                </td>
                                <td className="px-3 py-2 text-right text-emerald-400">
                                  {s.gananciaMax.toFixed(2)}%
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {s.masProbable.toFixed(2)}%
                                </td>
                              </tr>
                            );
                          });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* Composition & Portfolio Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {result.composicion && (
              <div className="rounded-lg border border-border/40 p-4">
                <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                  Composición actual
                </div>
                {result.composicion.sectores.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[13px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      Por sector
                    </div>
                    <div className="space-y-1.5">
                      {result.composicion.sectores.slice(0, 6).map((s) => (
                        <div key={s.nombre}>
                          <div className="flex justify-between text-[13px]">
                            <span className="truncate">{s.nombre}</span>
                            <span className="font-mono font-semibold">
                              {(s.peso * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-border/20 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"
                              style={{ width: s.peso * 100 + "%" }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[13px] uppercase tracking-wider text-muted-foreground mb-1">
                      Moneda
                    </div>
                    {result.composicion.monedas.map((m) => (
                      <div key={m.nombre} className="flex justify-between text-[13px] py-0.5">
                        <span>{m.nombre}</span>
                        <span className="font-mono">{(m.peso * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-[13px] uppercase tracking-wider text-muted-foreground mb-1">
                      Tipo
                    </div>
                    {result.composicion.tipoActivo.map((t) => (
                      <div key={t.nombre} className="flex justify-between text-[13px] py-0.5">
                        <span>{t.nombre}</span>
                        <span className="font-mono">{(t.peso * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {result.portfolioMetrics && (
              <div className="rounded-lg border border-border/40 p-4">
                <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                  Métricas de riesgo/retorno
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    [
                      "Retorno anual",
                      (result.portfolioMetrics.retornoRealAnual >= 0 ? "+" : "") +
                        result.portfolioMetrics.retornoRealAnual.toFixed(2) +
                        "%",
                      result.portfolioMetrics.retornoRealAnual >= 0 ? "#10B981" : "#E8735A",
                    ],
                    [
                      "Volatilidad anual",
                      result.portfolioMetrics.volatilidadAnual.toFixed(2) + "%",
                      "#E8B25A",
                    ],
                    [
                      "Sharpe ratio",
                      result.portfolioMetrics.sharpe.toFixed(3),
                      result.portfolioMetrics.sharpe >= 1 ? "#10B981" : "#E8B25A",
                    ],
                    [
                      "Máx. drawdown",
                      result.portfolioMetrics.maxDrawdown.toFixed(2) + "%",
                      "#E8735A",
                    ],
                    ["VaR 95%", result.portfolioMetrics.var95.toFixed(2) + "%", "#E8735A"],
                    ["Beta cartera", result.portfolioMetrics.betaCartera.toFixed(3), "#6EA8FE"],
                    ["R² cartera", result.portfolioMetrics.r2Cartera.toFixed(3), "#6EA8FE"],
                    [
                      "Corr. promedio",
                      result.portfolioMetrics.correlacionPromedio.toFixed(3),
                      "#8B5CF6",
                    ],
                  ].map(([label, value, color]) => (
                    <div
                      key={label as string}
                      className="flex justify-between items-center border-b border-border/10 py-1"
                    >
                      <span className="text-[13px] text-muted-foreground">{label as string}</span>
                      <span
                        className="font-mono text-[14px] font-semibold"
                        style={{ color: color as string }}
                      >
                        {value as string}
                      </span>
                    </div>
                  ))}
                </div>
                {result.portfolioMetrics.mejorBenchmark && (
                  <div className="mt-2 pt-2 border-t border-border/20 text-[13px] text-muted-foreground">
                    Benchmark: {result.portfolioMetrics.mejorBenchmark} · β:{" "}
                    {result.portfolioMetrics.betaCartera.toFixed(2)} · R²:{" "}
                    {(result.portfolioMetrics.r2Cartera * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Equity curve */}
          {result.portfolioMetrics?.equityCurve &&
            result.portfolioMetrics.equityCurve.length > 1 && (
              <div className="rounded-lg border border-border/40 p-4">
                <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                  Evolución del portafolio (base 100)
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={(() => {
                      const ec = result.portfolioMetrics!.equityCurve;
                      const baseVal = ec[0].valor;
                      return ec
                        .filter(
                          (_, i) =>
                            i % Math.max(1, Math.floor(ec.length / 120)) === 0 ||
                            i === ec.length - 1,
                        )
                        .map((e) => ({
                          fecha: e.fecha.slice(5),
                          portafolio: baseVal > 0 ? +((e.valor / baseVal) * 100).toFixed(2) : 0,
                          benchmark:
                            e.benchmark && baseVal > 0
                              ? +((e.benchmark / baseVal) * 100).toFixed(2)
                              : undefined,
                        }));
                    })()}
                    margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
                  >
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fontSize: 8, fill: "#9aa6bd" }}
                      stroke="#2b3242"
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#9aa6bd" }}
                      stroke="#2b3242"
                      tickFormatter={(v: number) => v.toFixed(0)}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#141a28",
                        border: "1px solid #2b3242",
                        borderRadius: 8,
                        fontSize: 10,
                        fontFamily: "monospace",
                      }}
                      formatter={(value: number, name: string) => [
                        value.toFixed(2),
                        name === "portafolio" ? "Portafolio" : "Benchmark",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="portafolio"
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="url(#eqGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="benchmark"
                      stroke="#6EA8FE"
                      strokeWidth={1.5}
                      fill="none"
                      strokeDasharray="4 3"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2 text-[13px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />{" "}
                    Portafolio
                  </span>
                  {result.portfolioMetrics.mejorBenchmark && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-sm bg-blue-400" />{" "}
                      {result.portfolioMetrics.mejorBenchmark}
                    </span>
                  )}
                </div>
              </div>
            )}

          {/* Histograma de retornos diarios */}
          {result.portfolioMetrics?.equityCurve && strategy && (
            <div className="rounded-lg border border-border/40 p-4">
              <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                {STRATEGY_LABELS[strategy.name]} — Histograma de retornos diarios
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={(() => {
                    const ec = result.portfolioMetrics!.equityCurve;
                    const prices = ec.map((e) => e.valor);
                    const rets: number[] = [];
                    for (let i = 1; i < prices.length; i++) {
                      if (prices[i - 1] > 0)
                        rets.push(((prices[i] - prices[i - 1]) / prices[i - 1]) * 100);
                    }
                    if (rets.length === 0) return [];
                    const min = Math.min(...rets);
                    const max = Math.max(...rets);
                    const bins = 20;
                    const binWidth = (max - min) / bins || 1;
                    const hist = new Array(bins).fill(0);
                    for (const r of rets) {
                      const idx = Math.min(bins - 1, Math.floor((r - min) / binWidth));
                      hist[idx]++;
                    }
                    return hist.map((count, i) => ({
                      bin: (min + i * binWidth + binWidth / 2).toFixed(2),
                      count,
                      label: (min + i * binWidth).toFixed(2) + "%",
                    }));
                  })()}
                  margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 7, fill: "#9aa6bd" }}
                    stroke="#2b3242"
                    interval={1}
                  />
                  <YAxis tick={{ fontSize: 8, fill: "#9aa6bd" }} stroke="#2b3242" />
                  <Tooltip
                    contentStyle={{
                      background: "#141a28",
                      border: "1px solid #2b3242",
                      borderRadius: 8,
                      fontSize: 10,
                      fontFamily: "monospace",
                    }}
                    formatter={(value: number) => [value, "Frecuencia"]}
                    labelFormatter={(l: string) => "Ret: " + l}
                  />
                  <Bar dataKey="count" fill="#6EA8FE" radius={[1, 1, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* MAIN COMPARISON: custom vs optimized */}
          {strategy && strategyWeights.length > 0 && result.currentPortfolio && (
            <>
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground px-4 py-3 bg-muted/10 border-b border-border/40 flex items-center justify-between">
                  <span>{STRATEGY_LABELS[strategy.name]} — composición actual vs óptima</span>
                  <span className="text-[13px] text-muted-foreground font-normal">
                    Capital: ${fmt(totalConCapital, 0)} · {strategyWeights.length} activos
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[14px]">
                    <thead className="text-[13px] uppercase tracking-wider text-muted-foreground bg-muted/10">
                      <tr>
                        <th className="px-3 py-2">Activo</th>
                        <th className="px-3 py-2 text-right">Actual %</th>
                        <th className="px-3 py-2 text-right">Óptimo %</th>
                        <th className="px-3 py-2 text-right">Diff</th>
                        <th className="px-3 py-2 text-right">Actual $</th>
                        <th className="px-3 py-2 text-right">Óptimo $</th>
                        <th className="px-3 py-2 text-right">Ajuste</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const totalCapital = totalConCapital;
                        return strategyWeights.map((w) => {
                          const pos = result.positions.find(
                            (p) => p.ticker.replace(".BA", "") === w.ticker,
                          );
                          const actualPeso = pos ? +(pos.peso * 100).toFixed(1) : 0;
                          const optPeso = +(w.weight * 100).toFixed(1);
                          const diff = +(optPeso - actualPeso).toFixed(1);
                          const actualUSD = pos ? pos.valorizado : 0;
                          const optUSD = totalCapital * w.weight;
                          const ajuste = optUSD - actualUSD;
                          const cantActual = pos ? pos.cantidad : 0;
                          const precioUnit = pos && pos.precioActual > 0 ? pos.precioActual : 0;
                          const cantOptima = precioUnit > 0 ? Math.round(optUSD / precioUnit) : 0;
                          return (
                            <tr
                              key={w.ticker}
                              className={`border-b border-border/10 hover:bg-muted/10 ${Math.abs(diff) > 5 ? "bg-amber-500/5" : ""}`}
                            >
                              <td className="px-3 py-2 font-semibold">{w.label}</td>
                              <td className="px-3 py-2 text-right">{actualPeso}%</td>
                              <td className="px-3 py-2 text-right font-semibold">{optPeso}%</td>
                              <td
                                className={`px-3 py-2 text-right font-mono ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}
                              >
                                {diff >= 0 ? "+" : ""}
                                {diff}%
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">
                                ${fmt(actualUSD, 0)}
                              </td>
                              <td className="px-3 py-2 text-right">${fmt(optUSD, 0)}</td>
                              <td
                                className={`px-3 py-2 text-right font-mono ${ajuste >= 0 ? "text-emerald-400" : "text-red-400"}`}
                              >
                                {ajuste >= 0 ? "+" : ""}${fmt(Math.abs(ajuste), 0)}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {cantActual > 0 && (
                                  <span className="text-muted-foreground">{cantActual}</span>
                                )}
                                {cantActual > 0 && cantOptima > 0 && (
                                  <span className="text-muted-foreground/40 mx-1">→</span>
                                )}
                                {cantOptima > 0 && <span className="font-bold">{cantOptima}</span>}
                                {cantOptima === 0 && (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary metrics row */}
              <div className="grid grid-cols-4 gap-1 rounded-lg border border-border/40 overflow-hidden bg-border/40">
                <div className="bg-background/40 p-3">
                  <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                    Capital total
                  </div>
                  <div className="text-base font-bold font-mono">${fmt(totalConCapital, 0)}</div>
                </div>
                <div className="bg-background/40 p-3">
                  <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                    Retorno esperado ({STRATEGY_LABELS[strategy.name]})
                  </div>
                  <div
                    className="text-base font-bold font-mono"
                    style={{ color: strategy.expectedReturn >= 0 ? "#10B981" : "#E8735A" }}
                  >
                    {strategy.expectedReturn >= 0 ? "+" : ""}
                    {strategy.expectedReturn.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-background/40 p-3">
                  <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                    Volatilidad
                  </div>
                  <div className="text-base font-bold font-mono text-amber-400">
                    {strategy.volatility.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-background/40 p-3">
                  <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                    Sharpe
                  </div>
                  <div
                    className="text-base font-bold font-mono"
                    style={{ color: strategy.sharpe >= 1 ? "#10B981" : "#E8B25A" }}
                  >
                    {strategy.sharpe.toFixed(2)}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Positions table */}
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground px-4 py-3 bg-muted/10 border-b border-border/40">
              Posiciones · {result.positions.filter((p) => p.valorizado > 0).length} activas
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[14px]">
                <thead className="text-[13px] uppercase tracking-wider text-muted-foreground bg-muted/10">
                  <tr>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Valorizado</th>
                    <th className="px-3 py-2 text-right">P&L</th>
                    <th className="px-3 py-2 text-right">Benchmark</th>
                    <th className="px-3 py-2 text-right">R²</th>
                    <th className="px-3 py-2 text-right">β</th>
                  </tr>
                </thead>
                <tbody>
                  {result.positions
                    .filter((p) => p.valorizado > 0 || p.cantidad > 0)
                    .map((pos) => (
                      <tr key={pos.ticker} className="border-b border-border/10 hover:bg-muted/10">
                        <td className="px-3 py-2 font-semibold">{pos.ticker.replace(".BA", "")}</td>
                        <td className="px-3 py-2 text-right">{pos.cantidad}</td>
                        <td className="px-3 py-2 text-right">
                          {pos.precioActual > 0 ? "$" + fmt(pos.precioActual, 0) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">${fmt(pos.valorizado, 0)}</td>
                        <td
                          className={`px-3 py-2 text-right ${pos.plPct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {pos.plPct !== 0 ? pct(pos.plPct) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-[13px]">
                          {pos.bestBenchmark || "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-[13px]">
                          {pos.bestBenchmarkR2 ? pos.bestBenchmarkR2.toFixed(3) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-[13px]">
                          {pos.bestBeta ? pos.bestBeta.toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Correlation matrix */}
          {result.correlationMatrix && (
            <div className="rounded-lg border border-border/40 p-4">
              <div className="mono text-[13px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                Matriz de correlación
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-center font-mono text-[13px]">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left text-[12px] text-muted-foreground"></th>
                      {result.correlationMatrix.tickers.map((t) => (
                        <th
                          key={t}
                          className="px-2 py-1 text-[12px] text-muted-foreground font-normal"
                        >
                          {t.replace(".BA", "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.correlationMatrix.tickers.map((t1, i) => (
                      <tr key={t1} className="border-b border-border/10">
                        <td className="px-2 py-1 text-left text-[13px] font-semibold">
                          {t1.replace(".BA", "")}
                        </td>
                        {result.correlationMatrix!.values[i].map((v, j) => {
                          const intensity = Math.abs(v);
                          const color =
                            v > 0
                              ? `rgba(16,185,129,${0.15 + intensity * 0.7})`
                              : `rgba(232,115,90,${0.15 + intensity * 0.7})`;
                          return (
                            <td
                              key={j}
                              className="px-2 py-1 text-[13px]"
                              style={{ background: color }}
                            >
                              {v.toFixed(2)}
                            </td>
                          );
                        })}
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
