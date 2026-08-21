// @ts-nocheck
import { useState, useMemo, lazy, Suspense } from "react";
import { useServerFn } from "@tanstack/react-start";
// TradingView inyecta un script externo: se carga de forma diferida (code-splitting).
const TradingViewWidget = lazy(() =>
  import("@/components/market-data/TradingViewWidget").then((m) => ({ default: m.default })),
);
import {
  getStrategyClassification,
  UNIVERSO_CLASIFICACION,
  BENCHMARKS_CLASIFICACION,
  calcularScoreCombinado,
  type StrategyAsset,
  type StrategyClassificationResult,
  type StrategyTarget,
} from "@/lib/strategy-classification.functions";

const UNIVERSO_BCBA_CEDEAR = [
  "GGAL.BA",
  "YPFD.BA",
  "PAMP.BA",
  "BMA.BA",
  "ALUA.BA",
  "TXAR.BA",
  "CRESY.BA",
  "BBAR.BA",
  "TGSU2.BA",
  "EDN.BA",
  "CEPU.BA",
  "CTIO.BA",
  "COME.BA",
  "TRAN.BA",
  "MIRG.BA",
  "LOMA.BA",
  "AAPL.BA",
  "MSFT.BA",
  "NVDA.BA",
  "AMZN.BA",
  "GOOGL.BA",
  "META.BA",
  "TSLA.BA",
  "SPY.BA",
  "QQQ.BA",
  "DIA.BA",
];

function badgeConfidence(c: string): string {
  const m: Record<string, string> = {
    alta: "bg-green-900/40 text-green-300 border-green-800",
    media: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
    baja: "bg-red-900/40 text-red-300 border-red-800",
  };
  return m[c] ?? "bg-muted/40 text-muted-foreground border-border";
}

const STRATEGY_COLORS: Record<string, string> = {
  "index-tracker": "#10b981",
  "long-only": "#3b82f6",
  "smart-beta": "#f59e0b",
  "hedge-fund": "#ef4444",
  uncorrelated: "#8b5cf6",
  unclassified: "#6b7280",
};

const STRATEGY_ORDER: Record<string, number> = {
  "index-tracker": 0,
  "long-only": 1,
  "smart-beta": 2,
  "hedge-fund": 3,
  uncorrelated: 4,
  unclassified: 5,
};

function fmtNum(n: number, dp = 4) {
  if (!Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number, dp = 2) {
  if (!Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(dp)}%`;
}

function badgeStrategy(strategy: string): string {
  const m: Record<string, string> = {
    "index-tracker": "bg-green-900/40 text-green-300 border-green-800",
    "long-only": "bg-blue-900/40 text-blue-300 border-blue-800",
    "smart-beta": "bg-yellow-900/40 text-yellow-300 border-yellow-800",
    "hedge-fund": "bg-red-900/40 text-red-300 border-red-800",
    uncorrelated: "bg-purple-900/40 text-purple-300 border-purple-800",
    unclassified: "bg-muted/40 text-muted-foreground border-border",
  };
  return m[strategy] ?? "bg-muted/40 text-muted-foreground border-border";
}

function ScatterChart({ assets }: { assets: StrategyAsset[] }) {
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const w = 600;
  const h = 400;
  const innerW = w - padding.left - padding.right;
  const innerH = h - padding.top - padding.bottom;

  const betas = assets.map((a) => a.beta);
  const alphas = assets.map((a) => a.annualizedAlpha);
  const betaMin = Math.min(-0.5, ...betas);
  const betaMax = Math.max(2, ...betas);
  const alphaMin = Math.min(-0.5, ...alphas);
  const alphaMax = Math.max(0.5, ...alphas);

  function scaleX(v: number) {
    return padding.left + ((v - betaMin) / (betaMax - betaMin)) * innerW;
  }
  function scaleY(v: number) {
    return padding.top + innerH - ((v - alphaMin) / (alphaMax - alphaMin)) * innerH;
  }

  const gridX: number[] = [];
  const gridY: number[] = [];
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    gridX.push(betaMin + ((betaMax - betaMin) * i) / steps);
    gridY.push(alphaMin + ((alphaMax - alphaMin) * i) / steps);
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-lg h-auto">
      <rect
        x={padding.left}
        y={padding.top}
        width={innerW}
        height={innerH}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={1}
      />
      {gridX.map((v) => (
        <line
          key={`gx${v}`}
          x1={scaleX(v)}
          y1={padding.top}
          x2={scaleX(v)}
          y2={padding.top + innerH}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
        />
      ))}
      {gridY.map((v) => (
        <line
          key={`gy${v}`}
          x1={padding.left}
          y1={scaleY(v)}
          x2={padding.left + innerW}
          y2={scaleY(v)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
        />
      ))}
      <line
        x1={scaleX(1)}
        y1={padding.top}
        x2={scaleX(1)}
        y2={padding.top + innerH}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1}
        strokeDasharray="4,4"
      />
      <line
        x1={padding.left}
        y1={scaleY(0)}
        x2={padding.left + innerW}
        y2={scaleY(0)}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1}
        strokeDasharray="4,4"
      />
      {gridX.map((v) => (
        <text
          key={`tx${v}`}
          x={scaleX(v)}
          y={padding.top + innerH + 16}
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize={9}
        >
          {v.toFixed(1)}
        </text>
      ))}
      {gridY.map((v) => (
        <text
          key={`ty${v}`}
          x={padding.left - 8}
          y={scaleY(v) + 3}
          textAnchor="end"
          fill="rgba(255,255,255,0.4)"
          fontSize={9}
        >
          {(v * 100).toFixed(0)}%
        </text>
      ))}
      <text
        x={padding.left + innerW / 2}
        y={h - 4}
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize={10}
      >
        Beta (β)
      </text>
      <text
        x={12}
        y={padding.top + innerH / 2}
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize={10}
        transform={`rotate(-90, 12, ${padding.top + innerH / 2})`}
      >
        Alpha Anualizado
      </text>
      {assets.map((a, i) => {
        const conf = a.classificationConfidence ?? "media";
        const opacity = conf === "alta" ? 0.9 : conf === "media" ? 0.6 : 0.3;
        const strokeDash = conf === "baja" ? "4 2" : undefined;
        return (
          <circle
            key={i}
            cx={scaleX(a.beta)}
            cy={scaleY(a.annualizedAlpha)}
            r={4}
            fill={STRATEGY_COLORS[a.strategy] ?? "#6b7280"}
            opacity={opacity}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={conf === "baja" ? 0.5 : 0}
            strokeDasharray={strokeDash}
          >
            <title>{`${a.ticker}\nβ=${a.beta}\nα=${fmtPct(a.annualizedAlpha)}\nR²=${a.rSquared}\n${a.strategyLabel}\nConfianza: ${conf}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

export function StrategyClassificationTab() {
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(
    new Set(UNIVERSO_CLASIFICACION.slice(0, 20)),
  );
  const [benchmark, setBenchmark] = useState("AUTO");
  const [rollingWindow, setRollingWindow] = useState(60);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StrategyClassificationResult | null>(null);
  const [error, setError] = useState("");

  const [targetBetaMin, setTargetBetaMin] = useState(0);
  const [targetBetaMax, setTargetBetaMax] = useState(2);
  const [targetAlphaMin, setTargetAlphaMin] = useState(-0.5);
  const [targetAlphaMax, setTargetAlphaMax] = useState(0.5);
  const [strategyFilter, setStrategyFilter] = useState<string>("todas");
  const [searchQuery, setSearchQuery] = useState("");
  const [includeBCBA, setIncludeBCBA] = useState(false);

  const effectiveUniverse = useMemo(
    () =>
      includeBCBA ? [...UNIVERSO_CLASIFICACION, ...UNIVERSO_BCBA_CEDEAR] : UNIVERSO_CLASIFICACION,
    [includeBCBA],
  );

  const fnClassify = useServerFn(getStrategyClassification);

  function toggleTicker(t: string) {
    const next = new Set(selectedTickers);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setSelectedTickers(next);
  }

  function selectAll() {
    setSelectedTickers(new Set(effectiveUniverse));
  }
  function clearAll() {
    setSelectedTickers(new Set());
  }

  async function loadClassification() {
    if (selectedTickers.size === 0) {
      setError("Seleccione al menos un activo");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fnClassify({
        data: {
          tickers: [...selectedTickers],
          benchmark,
          rollingBetaWindow: rollingWindow,
          autoDetectBenchmark: benchmark === "AUTO",
        },
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al clasificar");
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!result) return [];
    let list = result.assets;
    if (strategyFilter !== "todas") list = list.filter((a) => a.strategy === strategyFilter);
    list = list.filter((a) => a.beta >= targetBetaMin && a.beta <= targetBetaMax);
    list = list.filter(
      (a) => a.annualizedAlpha >= targetAlphaMin && a.annualizedAlpha <= targetAlphaMax,
    );
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) => a.ticker.toLowerCase().includes(q));
    }
    list.sort((a, b) => (STRATEGY_ORDER[a.strategy] ?? 99) - (STRATEGY_ORDER[b.strategy] ?? 99));
    return list;
  }, [
    result,
    strategyFilter,
    targetBetaMin,
    targetBetaMax,
    targetAlphaMin,
    targetAlphaMax,
    searchQuery,
  ]);

  const targetOptions: StrategyTarget[] = [
    "index-tracker",
    "long-only",
    "smart-beta",
    "hedge-fund",
  ];

  function findBestForTarget(target: StrategyTarget): StrategyAsset[] {
    if (!result) return [];
    return result.assets
      .filter(
        (a) =>
          a.strategy === target &&
          a.beta >= targetBetaMin &&
          a.beta <= targetBetaMax &&
          a.annualizedAlpha >= targetAlphaMin &&
          a.annualizedAlpha <= targetAlphaMax,
      )
      .sort((a, b) => b.rSquared - a.rSquared)
      .slice(0, 5);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="text-sm font-medium mb-2">Clasificación de Estrategias</div>
        <p className="text-[13px] text-muted-foreground mb-3">
          Mapea correlaciones, R², betas y alphas históricos. Filtra cuáles son óptimos para lograr
          betas y alphas objetivo respecto de un benchmark.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Universe selection */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
              Universo ({selectedTickers.size})
            </div>
            <div className="flex gap-1">
              <button
                onClick={selectAll}
                className="text-[13px] text-primary hover:text-primary/80 px-1"
              >
                Todo
              </button>
              <button
                onClick={clearAll}
                className="text-[13px] text-muted-foreground hover:text-foreground px-1"
              >
                Ninguno
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <input
              type="checkbox"
              id="includeBCBA"
              checked={includeBCBA}
              onChange={() => setIncludeBCBA((v) => !v)}
              className="h-3 w-3 accent-primary"
            />
            <label
              htmlFor="includeBCBA"
              className="font-mono text-[13px] text-muted-foreground cursor-pointer"
            >
              Incluir BCBA/CEDEAR
            </label>
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-0.5">
            {effectiveUniverse.map((t) => (
              <label
                key={t}
                className="flex items-center gap-1.5 font-mono text-[13px] cursor-pointer hover:bg-muted/10 rounded px-1"
              >
                <input
                  type="checkbox"
                  checked={selectedTickers.has(t)}
                  onChange={() => toggleTicker(t)}
                  className="h-3 w-3 accent-primary"
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        {/* Benchmark & params */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
          <div>
            <label className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
              Benchmark de referencia
            </label>
            <select
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
              className="mt-1 w-full rounded border border-border/60 bg-input px-2 py-1.5 text-[14px] font-mono"
            >
              <option value="AUTO"> Auto-detectar (mejor R² promedio)</option>
              {BENCHMARKS_CLASIFICACION.map((b) => (
                <option key={b.ticker} value={b.ticker}>
                  {b.name} ({b.ticker})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
              Ventana rolling β (días)
            </label>
            <input
              type="number"
              value={rollingWindow}
              onChange={(e) =>
                setRollingWindow(Math.max(30, Math.min(252, parseInt(e.target.value) || 60)))
              }
              className="mt-1 w-full rounded border border-border/60 bg-input px-2 py-1.5 text-[14px] font-mono"
            />
          </div>
          <button
            onClick={loadClassification}
            disabled={loading || selectedTickers.size === 0}
            className="w-full rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Clasificando..." : `Clasificar (${selectedTickers.size} activos)`}
          </button>
        </div>

        {/* Target filters */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
          <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Filtros objetivo
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <div>
              <label className="text-[13px] text-muted-foreground">β min</label>
              <input
                type="number"
                step="0.1"
                value={targetBetaMin}
                onChange={(e) => setTargetBetaMin(parseFloat(e.target.value) || 0)}
                className="w-full rounded border border-border/60 bg-input px-1.5 py-1 text-[13px] font-mono"
              />
            </div>
            <div>
              <label className="text-[13px] text-muted-foreground">β max</label>
              <input
                type="number"
                step="0.1"
                value={targetBetaMax}
                onChange={(e) => setTargetBetaMax(parseFloat(e.target.value) || 2)}
                className="w-full rounded border border-border/60 bg-input px-1.5 py-1 text-[13px] font-mono"
              />
            </div>
            <div>
              <label className="text-[13px] text-muted-foreground">α min %</label>
              <input
                type="number"
                step="0.01"
                value={targetAlphaMin * 100}
                onChange={(e) => setTargetAlphaMin((parseFloat(e.target.value) || 0) / 100)}
                className="w-full rounded border border-border/60 bg-input px-1.5 py-1 text-[13px] font-mono"
              />
            </div>
            <div>
              <label className="text-[13px] text-muted-foreground">α max %</label>
              <input
                type="number"
                step="0.01"
                value={targetAlphaMax * 100}
                onChange={(e) => setTargetAlphaMax((parseFloat(e.target.value) || 50) / 100)}
                className="w-full rounded border border-border/60 bg-input px-1.5 py-1 text-[13px] font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-[13px] text-muted-foreground">Estrategia</label>
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="w-full rounded border border-border/60 bg-input px-1.5 py-1 text-[13px] font-mono"
            >
              <option value="todas">Todas</option>
              <option value="index-tracker">Index Tracker</option>
              <option value="long-only">Long Only</option>
              <option value="smart-beta">Smart Beta</option>
              <option value="hedge-fund">Hedge Fund</option>
              <option value="uncorrelated">No Correlacionado</option>
            </select>
          </div>
          <div>
            <label className="text-[13px] text-muted-foreground">Buscar ticker</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="AAPL, MSFT..."
              className="w-full rounded border border-border/60 bg-input px-1.5 py-1 text-[13px] font-mono"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[14px] text-danger">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Scatter plot */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground mb-2">
              β vs α Anualizado · {result.benchmark} · {result.assets.length} activos
            </div>
            <div className="flex justify-center">
              <ScatterChart assets={filtered} />
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-[13px] text-muted-foreground justify-center">
              <span>
                <span className="inline-block h-2 w-2 rounded-full bg-[#10b981] mr-1" />
                Index Tracker
              </span>
              <span>
                <span className="inline-block h-2 w-2 rounded-full bg-[#3b82f6] mr-1" />
                Long Only
              </span>
              <span>
                <span className="inline-block h-2 w-2 rounded-full bg-[#f59e0b] mr-1" />
                Smart Beta
              </span>
              <span>
                <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444] mr-1" />
                Hedge Fund
              </span>
              <span>
                <span className="inline-block h-2 w-2 rounded-full bg-[#8b5cf6] mr-1" />
                No Correlacionado
              </span>
              <span>
                <span className="inline-block h-2 w-2 rounded-full bg-[#6b7280] mr-1" />
                Sin Clasificar
              </span>
            </div>
          </div>

          {/* Best for each target */}
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {targetOptions.map((target) => {
              const best = findBestForTarget(target);
              const targetName: Record<string, string> = {
                "index-tracker": "Index Tracker (β≈1, α≈0)",
                "long-only": "Long Only (β≈1, α>0)",
                "smart-beta": "Smart Beta (β variable, α≈0)",
                "hedge-fund": "Hedge Fund (β≈0, α>0)",
              };
              return (
                <div key={target} className="rounded-lg border border-border/60 bg-muted/20 p-2">
                  <div className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground mb-1">
                    {targetName[target]}
                  </div>
                  {best.length === 0 ? (
                    <div className="text-[13px] text-muted-foreground">Sin activos</div>
                  ) : (
                    best.map((a) => (
                      <div
                        key={a.ticker}
                        className="flex items-center justify-between text-[13px] font-mono py-0.5"
                      >
                        <span className="font-medium">{a.ticker}</span>
                        <span className="text-muted-foreground">
                          β={a.beta} α={fmtPct(a.annualizedAlpha)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>

          {/* Results table */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground mb-2">
              Activos clasificados ({filtered.length} de {result.assets.length})
            </div>
            <div className="overflow-x-auto w-full">
              <table className="mono w-full text-[13px]">
                <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-1.5 py-1.5 text-left">Ticker</th>
                    <th className="px-1.5 py-1.5 text-right">β</th>
                    <th className="px-1.5 py-1.5 text-right">α anual</th>
                    <th className="px-1.5 py-1.5 text-right">R²</th>
                    <th className="px-1.5 py-1.5 text-right">Corr.</th>
                    <th className="px-1.5 py-1.5 text-right">β Vol.</th>
                    <th className="px-1.5 py-1.5 text-right">Obs.</th>
                    <th className="px-1.5 py-1.5 text-center">Confianza</th>
                    <th className="px-1.5 py-1.5 text-center">Estrategia</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.ticker} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="px-1.5 py-1.5 font-medium">{a.ticker}</td>
                      <td className="px-1.5 py-1.5 text-right">{fmtNum(a.beta, 2)}</td>
                      <td
                        className={`px-1.5 py-1.5 text-right ${a.annualizedAlpha >= 0 ? "text-green-400" : "text-red-400"}`}
                      >
                        {fmtPct(a.annualizedAlpha)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right">{fmtNum(a.rSquared, 3)}</td>
                      <td className="px-1.5 py-1.5 text-right">{fmtNum(a.correlation, 3)}</td>
                      <td className="px-1.5 py-1.5 text-right">
                        {a.betaVolatility != null ? fmtNum(a.betaVolatility, 3) : "\u2014"}
                      </td>
                      <td className="px-1.5 py-1.5 text-right">{a.observations}</td>
                      <td className="px-1.5 py-1.5 text-center">
                        {a.classificationConfidence && (
                          <span
                            className={`inline-block rounded border px-1 py-0.5 text-[12px] ${badgeConfidence(a.classificationConfidence)}`}
                          >
                            {a.classificationConfidence}
                          </span>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        <span
                          className={`inline-block rounded border px-1 py-0.5 text-[12px] ${badgeStrategy(a.strategy)}`}
                        >
                          {a.strategyLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Build Portfolio from selection */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="mono text-[13px] uppercase tracking-wider text-muted-foreground mb-2">
              Construir Portafolio
            </div>
            <PortfolioBuilder assets={filtered} benchmark={result.benchmark} />
          </div>
        </div>
      )}
    </div>
  );
}

function PortfolioBuilder({ assets, benchmark }: { assets: StrategyAsset[]; benchmark: string }) {
  const [selectedStrategies, setSelectedStrategies] = useState<Set<string>>(
    new Set(["index-tracker", "long-only", "hedge-fund"]),
  );
  const [numAssets, setNumAssets] = useState(5);
  const [targetBeta, setTargetBeta] = useState(1);
  const [optimizeTarget, setOptimizeTarget] = useState<"sharpe" | "alpha" | "beta">("sharpe");
  const [portfolio, setPortfolio] = useState<{
    tickers: string[];
    weights: number[];
    beta: number;
    alpha: number;
    sharpe: number;
    rSquared: number;
  } | null>(null);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const bmkForTV = benchmark
    .replace("^GSPC", "SPX")
    .replace("^IXIC", "IXIC")
    .replace("^MERV", "BCBA:MERV")
    .replace("^DJI", "DJI")
    .replace("^RUT", "RUT")
    .replace("^VIX", "VIX")
    .replace("^", "");

  function toggleStrategy(s: string) {
    setSelectedStrategies((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPortfolio(null);
  }

  function buildPortfolio() {
    const candidates = assets.filter((a) => selectedStrategies.has(a.strategy));
    if (candidates.length === 0) return;

    let selected = [...candidates];

    // Sort by R² descending, pick top N
    selected.sort((a, b) => b.rSquared - a.rSquared);
    selected = selected.slice(0, numAssets);

    if (selected.length === 0) return;

    let weights: number[];

    if (optimizeTarget === "beta") {
      // Optimize weights to achieve targetBeta
      const n = selected.length;
      weights = new Array(n).fill(1 / n);
      const lr = 0.1;
      for (let iter = 0; iter < 500; iter++) {
        const currentBeta = selected.reduce((s, a, i) => s + weights[i] * a.beta, 0);
        const error = currentBeta - targetBeta;
        for (let i = 0; i < n; i++) {
          weights[i] -= (lr * error * selected[i].beta) / n;
        }
        const sum = weights.reduce((a, b) => a + b, 0);
        if (sum > 0) weights = weights.map((w) => Math.max(0, w / sum));
      }
    } else if (optimizeTarget === "alpha") {
      // Maximize alpha: weight proportionally to alpha
      const alphas = selected.map((a) => Math.max(0, a.annualizedAlpha + 0.1));
      const sumAlpha = alphas.reduce((s, v) => s + v, 0);
      weights =
        sumAlpha > 0
          ? alphas.map((v) => v / sumAlpha)
          : new Array(selected.length).fill(1 / selected.length);
    } else {
      // Score combinado técnico + fundamental (misma lógica que calcularScoreFundamental)
      const scores = selected.map((a) => calcularScoreCombinado(a));
      const sumScore = scores.reduce((s, v) => s + v, 0);
      weights =
        sumScore > 0
          ? scores.map((v) => v / sumScore)
          : new Array(selected.length).fill(1 / selected.length);
    }

    const weightedBeta = selected.reduce((s, a, i) => s + weights[i] * a.beta, 0);
    const weightedAlpha = selected.reduce((s, a, i) => s + weights[i] * a.annualizedAlpha, 0);
    const weightedR2 = selected.reduce((s, a, i) => s + weights[i] * a.rSquared, 0);

    setPortfolio({
      tickers: selected.map((a) => a.ticker),
      weights,
      beta: +weightedBeta.toFixed(4),
      alpha: +weightedAlpha.toFixed(4),
      rSquared: +weightedR2.toFixed(4),
      sharpe: +(weightedAlpha / (1 + Math.abs(weightedBeta - 1) * 0.5)).toFixed(4),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {["index-tracker", "long-only", "smart-beta", "hedge-fund", "uncorrelated"].map((s) => (
          <label
            key={s}
            className="flex items-center gap-1.5 font-mono text-[13px] cursor-pointer hover:bg-muted/10 rounded px-1 py-0.5"
          >
            <input
              type="checkbox"
              checked={selectedStrategies.has(s)}
              onChange={() => toggleStrategy(s)}
              className="h-3 w-3 accent-primary"
            />
            <span style={{ color: STRATEGY_COLORS[s] }}>{s.replace("-", " ").toUpperCase()}</span>
          </label>
        ))}
      </div>
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="text-[13px] text-muted-foreground">N° activos</label>
          <input
            type="number"
            min={1}
            max={30}
            value={numAssets}
            onChange={(e) => {
              setNumAssets(Math.max(1, Math.min(30, parseInt(e.target.value) || 5)));
              setPortfolio(null);
            }}
            className="w-full rounded border border-border/60 bg-input px-1.5 py-1 text-[13px] font-mono"
          />
        </div>
        <div>
          <label className="text-[13px] text-muted-foreground">Optimizar</label>
          <select
            value={optimizeTarget}
            onChange={(e) => {
              setOptimizeTarget(e.target.value as any);
              setPortfolio(null);
            }}
            className="w-full rounded border border-border/60 bg-input px-1.5 py-1 text-[13px] font-mono"
          >
            <option value="sharpe">Score</option>
            <option value="alpha">Alpha</option>
            <option value="beta">Beta objetivo</option>
          </select>
        </div>
        {optimizeTarget === "beta" && (
          <div>
            <label className="text-[13px] text-muted-foreground">β objetivo</label>
            <input
              type="number"
              step={0.1}
              min={0}
              max={3}
              value={targetBeta}
              onChange={(e) => {
                setTargetBeta(parseFloat(e.target.value) || 1);
                setPortfolio(null);
              }}
              className="w-full rounded border border-border/60 bg-input px-1.5 py-1 text-[13px] font-mono"
            />
          </div>
        )}
        <div className="flex items-end">
          <button
            onClick={buildPortfolio}
            className="w-full rounded bg-primary px-2 py-1 text-[13px] font-mono font-medium text-primary-foreground hover:opacity-90"
          >
            Construir Portafolio
          </button>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setShowBenchmark(!showBenchmark)}
            className="w-full rounded border border-border/60 bg-muted/10 px-2 py-1 text-[13px] font-mono text-muted-foreground hover:text-foreground"
          >
            {showBenchmark ? "Ocultar" : "Ver"} Benchmark: {bmkForTV}
          </button>
        </div>
      </div>

      {showBenchmark && (
        <div className="rounded-lg overflow-hidden border border-border/40">
          <Suspense
            fallback={
              <div className="flex h-[360px] w-full items-center justify-center text-[14px] text-muted-foreground">
                Cargando gráfico…
              </div>
            }
          >
            <TradingViewWidget symbol={bmkForTV} interval="D" height={360} />
          </Suspense>
        </div>
      )}

      {portfolio && (
        <div className="space-y-2 border-t border-border/30 pt-2">
          <div className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3 text-center">
              <div className="text-[13px] text-muted-foreground">Beta</div>
              <div className="font-mono text-base font-semibold">{portfolio.beta.toFixed(2)}</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">Riesgo sistemático</div>
            </div>
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3 text-center">
              <div className="text-[13px] text-muted-foreground">Alpha anual</div>
              <div
                className={`font-mono text-base font-semibold ${portfolio.alpha >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {fmtPct(portfolio.alpha)}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">Retorno exceso</div>
            </div>
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3 text-center">
              <div className="text-[13px] text-muted-foreground">R² Portafolio</div>
              <div className="font-mono text-base font-semibold">
                {portfolio.rSquared.toFixed(3)}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">vs {benchmark}</div>
            </div>
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3 text-center">
              <div className="text-[13px] text-muted-foreground">Score de Seleccin</div>
              <div
                className={`font-mono text-base font-semibold ${portfolio.sharpe >= 1 ? "text-green-400" : portfolio.sharpe < 0 ? "text-red-400" : ""}`}
              >
                {portfolio.sharpe.toFixed(2)}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">Heurstico α/β</div>
            </div>
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3 text-center">
              <div className="text-[13px] text-muted-foreground">Activos</div>
              <div className="font-mono text-base font-semibold">{portfolio.tickers.length}</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">En portafolio</div>
            </div>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="mono w-full text-[13px]">
              <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/40">
                  <th className="px-1.5 py-1 text-left">Ticker</th>
                  <th className="px-1.5 py-1 text-right">Peso</th>
                  <th className="px-1.5 py-1 text-right">β</th>
                  <th className="px-1.5 py-1 text-right">α anual</th>
                  <th className="px-1.5 py-1 text-right">R²</th>
                  <th className="px-1.5 py-1 text-center">Estrategia</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.tickers.map((t, i) => {
                  const a = assets.find((x) => x.ticker === t);
                  return (
                    <tr key={t} className="border-b border-border/20">
                      <td className="px-1.5 py-1 font-medium">{t}</td>
                      <td className="px-1.5 py-1 text-right">{fmtPct(portfolio.weights[i], 1)}</td>
                      <td className="px-1.5 py-1 text-right">{a ? a.beta.toFixed(2) : "\u2014"}</td>
                      <td
                        className={`px-1.5 py-1 text-right ${a && a.annualizedAlpha >= 0 ? "text-green-400" : "text-red-400"}`}
                      >
                        {a ? fmtPct(a.annualizedAlpha) : "\u2014"}
                      </td>
                      <td className="px-1.5 py-1 text-right">
                        {a ? a.rSquared.toFixed(3) : "\u2014"}
                      </td>
                      <td className="px-1.5 py-1 text-center">
                        {a && (
                          <span
                            className={`inline-block rounded border px-1 py-0.5 text-[12px] ${badgeStrategy(a.strategy)}`}
                          >
                            {a.strategyLabel}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
