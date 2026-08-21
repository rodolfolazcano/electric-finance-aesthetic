// @ts-nocheck
import { useState, useMemo } from "react";
import type { SemaforoResult } from "@/lib/finance.functions";
import { cn } from "@/lib/utils";
import { mean, std } from "@/lib/optimizer";

type ColumnMode = "price" | "technical" | "fundamental" | "quantitative" | "labadie";
type ViewMode = "ARS" | "USD" | "all";

const COLUMN_MODES: { value: ColumnMode; label: string }[] = [
  { value: "price", label: "Precio y Var%" },
  { value: "technical", label: "Análisis Técnico" },
  { value: "fundamental", label: "Análisis Fundamental" },
  { value: "quantitative", label: "Análisis Cuantitativo" },
  { value: "labadie", label: "Labadie (p-var, Hurst)" },
];

// Compute Hurst exponent via R/S analysis (Labadie 1205.3482v6 §3.2)
function computeHurst(prices: number[]): number | null {
  if (prices.length < 100) return null;
  const logPrices = prices.map((p) => Math.log(p));
  const n = logPrices.length;
  const maxK = Math.min(Math.floor(n / 2), 100);
  const rsVals: number[] = [];
  const ks: number[] = [];
  for (let k = 10; k < maxK; k += 5) {
    const numBlocks = Math.floor(n / k);
    if (numBlocks < 5) break;
    let rsSum = 0;
    for (let b = 0; b < numBlocks; b++) {
      const block = logPrices.slice(b * k, (b + 1) * k);
      const m = mean(block);
      const devs = block.map((v) => v - m);
      const cum = devs.reduce((acc, v) => {
        acc.push((acc[acc.length - 1] ?? 0) + v);
        return acc;
      }, [] as number[]);
      const r = Math.max(...cum) - Math.min(...cum);
      const s = std(block);
      if (s > 0) rsSum += r / s;
    }
    const avgRs = rsSum / numBlocks;
    rsVals.push(Math.log(avgRs));
    ks.push(Math.log(k));
  }
  if (rsVals.length < 5) return null;
  const nR = rsVals.length;
  const mx = mean(ks),
    my = mean(rsVals);
  let num = 0,
    denX = 0;
  for (let i = 0; i < nR; i++) {
    num += (ks[i] - mx) * (rsVals[i] - my);
    denX += (ks[i] - mx) ** 2;
  }
  if (denX === 0) return null;
  return num / denX; // Hurst = slope of log(R/S) vs log(k)
}

// Compute p-variance (Labadie §3.2)
function pVariance(rets: number[], p: number): number {
  if (rets.length < 2) return 0;
  const m = mean(rets);
  return rets.reduce((s, v) => s + Math.pow(Math.abs(v - m), p), 0) / rets.length;
}

// Implied p = 1/H (Labadie §3.2 identity)
function impliedP(hurst: number): number {
  if (hurst <= 0) return 2;
  return Math.min(10, Math.max(1.1, 1 / hurst));
}

function fmtNum(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function recommendationBadge(r: string) {
  const m: Record<string, string> = {
    COMPRA: "bg-success/15 text-success",
    "COMPRA CON CAUTELA": "bg-success/10 text-success/70",
    MANTENER: "bg-warning/15 text-warning",
    REDUCIR: "bg-danger/10 text-danger/70",
    VENTA: "bg-danger/15 text-danger",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-mono ${m[r] ?? m.MANTENER}`}>
      {r}
    </span>
  );
}

export function PortfolioAssetTable({
  data,
  currency,
  loading,
  error,
  onRemoveTicker,
  viewModeToggle = false,
}: {
  data: SemaforoResult[];
  currency: "ARS" | "USD";
  loading: boolean;
  error: string | null;
  onRemoveTicker?: (ticker: string) => void;
  /** Muestra un único dataframe con botón de modo de visualización ARS | Todos | USD. */
  viewModeToggle?: boolean;
}) {
  const [columnMode, setColumnMode] = useState<ColumnMode>("price");
  const [view, setView] = useState<ViewMode>(() => {
    if (!viewModeToggle) return currency;
    const hasArs = data.some((d) => d.currency === "ARS");
    const hasUsd = data.some((d) => d.currency === "USD");
    if (hasArs && !hasUsd) return "ARS";
    if (hasUsd && !hasArs) return "USD";
    return "all";
  });

  const filtered = useMemo(
    () => (view === "all" ? data : data.filter((d) => d.currency === view)),
    [data, view],
  );

  const arsCount = useMemo(() => data.filter((d) => d.currency === "ARS").length, [data]);
  const usdCount = useMemo(() => data.filter((d) => d.currency === "USD").length, [data]);

  const headerLabels: Record<ColumnMode, { label: string; align?: string; 宽?: number }[]> = {
    price: [
      { label: "Ticker" },
      { label: "Moneda" },
      { label: "Precio", align: "text-right" },
      { label: "Var% 1d", align: "text-right" },
      { label: "Var% Per.", align: "text-right" },
      { label: "MkT Cap", align: "text-right" },
      { label: "Recom." },
    ],
    technical: [
      { label: "Ticker" },
      { label: "RSI(14)", align: "text-right" },
      { label: "SMA50", align: "text-right" },
      { label: "SMA200", align: "text-right" },
      { label: "MACD", align: "text-right" },
      { label: "Señal", align: "text-right" },
      { label: "Score Téc.", align: "text-right" },
    ],
    fundamental: [
      { label: "Ticker" },
      { label: "P/E", align: "text-right" },
      { label: "PEG", align: "text-right" },
      { label: "Rev Growth", align: "text-right" },
      { label: "Margen", align: "text-right" },
      { label: "ROE", align: "text-right" },
      { label: "Score Fund.", align: "text-right" },
    ],
    quantitative: [
      { label: "Ticker" },
      { label: "Score Total", align: "text-right" },
      { label: "Score Téc.", align: "text-right" },
      { label: "Score Fund.", align: "text-right" },
      { label: "Recom." },
      { label: "52w Bajo", align: "text-right" },
      { label: "52w Alto", align: "text-right" },
    ],
    labadie: [
      { label: "Ticker" },
      { label: "Hurst", align: "text-right" },
      { label: "Impl. p", align: "text-right" },
      { label: "P-Var", align: "text-right" },
      { label: "Vol. An.", align: "text-right" },
      { label: "Score Téc.", align: "text-right" },
    ],
  };

  function renderCell(d: SemaforoResult, _mode: ColumnMode) {
    switch (_mode) {
      case "price":
        return (
          <>
            <td className="px-2 py-1.5 font-semibold text-primary sticky left-0 bg-surface z-10">
              {d.ticker}
            </td>
            <td className="px-2 py-1.5">{d.currency}</td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtNum(d.price, 2)}</td>
            <td
              className={`px-2 py-1.5 text-right font-mono ${d.change1d >= 0 ? "text-success" : "text-danger"}`}
            >
              {fmtPct(d.change1d, 2)}
            </td>
            <td
              className={`px-2 py-1.5 text-right font-mono ${(d.changePeriod ?? 0) >= 0 ? "text-success" : "text-danger"}`}
            >
              {fmtPct(d.changePeriod, 2)}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {d.marketCap != null ? `$${(d.marketCap / 1e9).toFixed(1)}B` : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-center">
              {recommendationBadge(d.clasificacionJerarquica ?? d.recommendation)}
            </td>
            {onRemoveTicker && (
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onRemoveTicker(d.ticker)}
                  className="text-red-400/60 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </td>
            )}
          </>
        );
      case "technical":
        return (
          <>
            <td className="px-2 py-1.5 font-semibold text-primary sticky left-0 bg-surface z-10">
              {d.ticker}
            </td>
            <td
              className={`px-2 py-1.5 text-right font-mono ${d.rsi > 70 ? "text-danger" : d.rsi < 30 ? "text-success" : ""}`}
            >
              {fmtNum(d.rsi, 1)}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtNum(d.sma50, 2)}</td>
            <td className="px-2 py-1.5 text-right font-mono">
              {d.sma200 != null ? fmtNum(d.sma200, 2) : "\u2014"}
            </td>
            <td
              className={`px-2 py-1.5 text-right font-mono ${d.macd >= d.macdSignal ? "text-success" : "text-danger"}`}
            >
              {fmtNum(d.macd, 2)}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtNum(d.macdSignal, 2)}</td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtNum(d.techScore, 0)}</td>
            {onRemoveTicker && (
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onRemoveTicker(d.ticker)}
                  className="text-red-400/60 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </td>
            )}
          </>
        );
      case "fundamental":
        return (
          <>
            <td className="px-2 py-1.5 font-semibold text-primary sticky left-0 bg-surface z-10">
              {d.ticker}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {d.pe != null ? fmtNum(d.pe, 1) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {d.peg != null ? fmtNum(d.peg, 1) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {d.revGrowth != null ? fmtPct(d.revGrowth, 0) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {d.profitMargin != null ? fmtPct(d.profitMargin, 0) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {d.roe != null ? fmtPct(d.roe, 0) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtNum(d.fundScore, 0)}</td>
            {onRemoveTicker && (
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onRemoveTicker(d.ticker)}
                  className="text-red-400/60 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </td>
            )}
          </>
        );
      case "labadie": {
        const closes = d.history.map((h) => h.close);
        const hurst = computeHurst(closes);
        const iP = hurst != null ? impliedP(hurst) : null;
        const rets =
          closes.length > 1 ? closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]) : [];
        const pVol =
          rets.length > 0
            ? Math.pow(pVariance(rets, iP ?? 2), 1 / (iP ?? 2)) * Math.sqrt(252)
            : null;
        const annVol = rets.length > 0 ? std(rets) * Math.sqrt(252) : null;
        return (
          <>
            <td className="px-2 py-1.5 font-semibold text-primary sticky left-0 bg-surface z-10">
              {d.ticker}
            </td>
            <td
              className={`px-2 py-1.5 text-right font-mono ${hurst != null ? (hurst > 0.6 ? "text-success" : hurst < 0.4 ? "text-warning" : "") : ""}`}
            >
              {hurst != null ? hurst.toFixed(3) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {iP != null ? iP.toFixed(1) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {pVol != null ? fmtPct(pVol, 1) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {annVol != null ? fmtPct(annVol, 1) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtNum(d.techScore, 0)}</td>
            {onRemoveTicker && (
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onRemoveTicker(d.ticker)}
                  className="text-red-400/60 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </td>
            )}
          </>
        );
      }
      case "quantitative":
        return (
          <>
            <td className="px-2 py-1.5 font-semibold text-primary sticky left-0 bg-surface z-10">
              {d.ticker}
            </td>
            <td className="px-2 py-1.5 text-right font-mono font-semibold">
              {fmtNum(d.totalScore, 0)}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtNum(d.techScore, 0)}</td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtNum(d.fundScore, 0)}</td>
            <td className="px-2 py-1.5 text-center">
              {recommendationBadge(d.clasificacionJerarquica ?? d.recommendation)}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {d.low52 ? fmtNum(d.low52, 2) : "\u2014"}
            </td>
            <td className="px-2 py-1.5 text-right font-mono">
              {d.high52 ? fmtNum(d.high52, 2) : "\u2014"}
            </td>
            {onRemoveTicker && (
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={() => onRemoveTicker(d.ticker)}
                  className="text-red-400/60 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </td>
            )}
          </>
        );
    }
  }

  const headers = headerLabels[columnMode];

  return (
    <div className="space-y-2">
      {/* Currency header + view mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {view === "ARS" ? (
            <>🇦🇷 Portafolio ARS</>
          ) : view === "USD" ? (
            <>🇺🇸 Portafolio USD</>
          ) : (
            <>🇦🇷 Portafolio ARS + USD</>
          )}
          <span className="ml-2 text-[10px] text-muted-foreground/60">
            {filtered.length} activo{filtered.length !== 1 ? "s" : ""}
            {view === "all" && data.length > 0 && (
              <span className="text-muted-foreground/50">
                {" "}
                · ARS {arsCount} · USD {usdCount}
              </span>
            )}
          </span>
        </div>

        {viewModeToggle && (
          <div className="flex gap-0.5 rounded-md border border-border/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setView("ARS")}
              className={cn(
                "px-2.5 py-1 text-[10px] font-mono transition-colors",
                view === "ARS"
                  ? "bg-primary/20 text-primary"
                  : "bg-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              ARS ({arsCount})
            </button>
            <button
              type="button"
              onClick={() => setView("all")}
              className={cn(
                "px-2.5 py-1 text-[10px] font-mono transition-colors",
                view === "all"
                  ? "bg-primary/20 text-primary"
                  : "bg-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Todos ({data.length})
            </button>
            <button
              type="button"
              onClick={() => setView("USD")}
              className={cn(
                "px-2.5 py-1 text-[10px] font-mono transition-colors",
                view === "USD"
                  ? "bg-success/20 text-success"
                  : "bg-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              USD ({usdCount})
            </button>
          </div>
        )}
      </div>

      {/* Column mode switcher */}
      <div className="flex gap-0.5 rounded-md border border-border/40 overflow-hidden w-fit">
        {COLUMN_MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setColumnMode(m.value)}
            className={cn(
              "px-3 py-1 text-[10px] font-mono transition-colors",
              columnMode === m.value
                ? "bg-primary/20 text-primary"
                : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/40 bg-background/40">
        {loading && (
          <div className="flex items-center justify-center py-8 text-[11px] text-muted-foreground">
            Cargando análisis...
          </div>
        )}
        {error && <div className="px-4 py-3 text-[10px] text-danger">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex items-center justify-center py-8 text-[11px] text-muted-foreground">
            {view === "all"
              ? "Agregá tickers para ver el análisis"
              : `Sin activos en ${view}. Cambiá el modo de visualización.`}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <table className="mono w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                {headers.map((h) => (
                  <th key={h.label} className={`px-2 py-2 ${h.align ?? "text-left"}`}>
                    {h.label}
                  </th>
                ))}
                {onRemoveTicker && <th className="px-2 py-2 text-center w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.ticker}
                  className="border-b border-border/20 hover:bg-muted/10 transition-colors"
                >
                  {renderCell(d, columnMode)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
