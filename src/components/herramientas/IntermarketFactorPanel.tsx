// @ts-nocheck
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const FLASK_BASE = "http://localhost:5000";

interface FactorEntry {
  ticker: string;
  name: string;
  category: string;
  subcategory: string;
  correlation: number | null;
  beta: number | null;
  r_squared: number | null;
}

interface CategoryData {
  factors: FactorEntry[];
  count: number;
  avg_correlation: number | null;
  max_correlation: number | null;
}

interface Rankings {
  top_positive: FactorEntry[];
  top_negative: FactorEntry[];
  by_beta: FactorEntry[];
}

interface Summary {
  total_valid: number;
  strong_positive: number;
  strong_negative: number;
  weak_correlation: number;
  avg_correlation_all: number | null;
}

interface AnalysisResult {
  ticker: string;
  period: string;
  timestamp: string;
  total_factors: number;
  categories: Record<string, CategoryData>;
  rankings: Rankings;
  summary: Summary;
  error?: string;
}

const PERIODS = ["3mo", "6mo", "1y", "2y"];

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${(n * 100).toFixed(dp)}%`;
}

const CATEGORY_COLORS: Record<string, string> = {
  Macro: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  Bonds: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  Commodities: "text-green-400 border-green-400/30 bg-green-400/10",
  Sectors: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  Factors: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
  Countries: "text-rose-400 border-rose-400/30 bg-rose-400/10",
  Market: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
};

function CorrelationBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">\u2014</span>;
  const color =
    value > 0.5
      ? "text-green-400"
      : value > 0.3
        ? "text-lime-400"
        : value > -0.3
          ? "text-yellow-400"
          : value > -0.5
            ? "text-orange-400"
            : "text-red-400";
  return <span className={cn("font-mono font-semibold", color)}>{fmtNum(value, 2)}</span>;
}

function BetaBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">\u2014</span>;
  const color =
    Math.abs(value) > 1.5
      ? "text-red-400"
      : Math.abs(value) > 0.8
        ? "text-yellow-400"
        : "text-muted-foreground";
  return <span className={cn("font-mono", color)}>{fmtNum(value, 2)}</span>;
}

function FactorRow({ factor, rank }: { factor: FactorEntry; rank?: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/10 px-2 py-1.5 text-[14px] hover:bg-muted/20 transition-colors">
      {rank != null && (
        <span className="w-5 shrink-0 text-right text-muted-foreground/60">{rank}</span>
      )}
      <div className="min-w-[180px]">
        <span className="font-medium text-foreground">{factor.name}</span>
        <span className="ml-1.5 text-[13px] text-muted-foreground/60">{factor.ticker}</span>
      </div>
      <span className="text-[13px] text-muted-foreground/50 uppercase min-w-[60px]">
        {factor.subcategory}
      </span>
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] text-muted-foreground/50">R</span>
          <CorrelationBadge value={factor.correlation} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] text-muted-foreground/50">\u03B2</span>
          <BetaBadge value={factor.beta} />
        </div>
        <div className="flex items-center gap-1.5 w-14">
          <span className="text-[13px] text-muted-foreground/50">R\u00B2</span>
          <span className="font-mono text-muted-foreground">
            {factor.r_squared != null ? fmtPct(factor.r_squared, 0) : "\u2014"}
          </span>
        </div>
      </div>
    </div>
  );
}

function CategorySection({ name, data }: { name: string; data: CategoryData }) {
  const [collapsed, setCollapsed] = useState(false);
  const colorClass = CATEGORY_COLORS[name] ?? "text-muted-foreground border-border/30 bg-muted/10";
  const sorted = [...data.factors].sort(
    (a, b) => Math.abs(b.correlation ?? 0) - Math.abs(a.correlation ?? 0),
  );

  return (
    <Card className="border-border/40 bg-background/40 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/10"
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[13px] font-mono font-semibold uppercase tracking-wider",
              colorClass,
            )}
          >
            {name}
          </span>
          <span className="text-[13px] text-muted-foreground/60 font-mono">
            {data.count} factores
          </span>
        </div>
        <div className="flex items-center gap-4">
          {data.avg_correlation != null && (
            <span className="text-[13px] text-muted-foreground/50 font-mono">
              avg R: <CorrelationBadge value={data.avg_correlation} />
            </span>
          )}
          <span className="text-muted-foreground/40 text-xs">
            {collapsed ? "\u25BC" : "\u25B2"}
          </span>
        </div>
      </button>
      {!collapsed && (
        <div className="border-t border-border/10 px-2 pb-2">
          {sorted.map((f) => (
            <FactorRow key={f.ticker} factor={f} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SummaryCard({ summary }: { summary: Summary }) {
  return (
    <Card className="border-border/40 bg-background/40 p-4">
      <div className="mb-2 text-[13px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
        Resumen
      </div>
      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <div className="text-[13px] text-muted-foreground/60 font-mono">Factores válidos</div>
          <div className="text-sm font-mono text-foreground">{summary.total_valid}</div>
        </div>
        <div>
          <div className="text-[13px] text-muted-foreground/60 font-mono">Corr &gt; 0.5</div>
          <div className="text-sm font-mono text-green-400">{summary.strong_positive}</div>
        </div>
        <div>
          <div className="text-[13px] text-muted-foreground/60 font-mono">Corr &lt; -0.5</div>
          <div className="text-sm font-mono text-red-400">{summary.strong_negative}</div>
        </div>
        <div>
          <div className="text-[13px] text-muted-foreground/60 font-mono">Corr débil</div>
          <div className="text-sm font-mono text-yellow-400">{summary.weak_correlation}</div>
        </div>
        <div>
          <div className="text-[13px] text-muted-foreground/60 font-mono">R promedio</div>
          <div className="text-sm font-mono text-foreground">
            {summary.avg_correlation_all != null
              ? fmtNum(summary.avg_correlation_all, 3)
              : "\u2014"}
          </div>
        </div>
      </div>
    </Card>
  );
}

function RankingPanel({
  title,
  items,
  icon,
}: {
  title: string;
  items: FactorEntry[];
  icon: string;
}) {
  return (
    <Card className="border-border/40 bg-background/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span>{icon}</span>
        <span className="text-[13px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="space-y-0.5">
        {items.map((f, i) => (
          <div
            key={f.ticker}
            className="flex items-center gap-2 border-b border-border/5 px-1 py-1 text-[14px]"
          >
            <span className="w-5 shrink-0 text-right text-[13px] text-muted-foreground/50">
              {i + 1}
            </span>
            <span className="text-foreground font-medium">{f.name}</span>
            <span className="ml-auto flex items-center gap-2">
              <CorrelationBadge value={f.correlation} />
              {f.beta != null && (
                <span className="text-[13px] text-muted-foreground/50">
                  \u03B2={fmtNum(f.beta, 2)}
                </span>
              )}
              <span className="text-[13px] font-mono text-muted-foreground/60 min-w-[3rem] text-right">
                {f.r_squared != null ? `R²=${(f.r_squared * 100).toFixed(0)}%` : ""}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

//  Industrials Highlight — ETFs de Industria destacados 

const INDUSTRY_ETFS = ["XLI", "CAT", "DE", "GE", "MMM", "BA", "HON", "UNP", "UPS", "FDX"];

function IndustrialsHighlight({ factors, ticker }: { factors: FactorEntry[]; ticker: string }) {
  // Filtrar factores que son ETFs/sectores industriales
  const industrials = factors.filter(
    (f) =>
      INDUSTRY_ETFS.includes(f.ticker) ||
      f.ticker === "XLI" ||
      f.category === "Industrial" ||
      f.subcategory === "Industrial" ||
      f.name.toLowerCase().includes("industrial"),
  );

  if (industrials.length === 0) return null;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm"></span>
          <span className="text-[13px] font-mono font-semibold uppercase tracking-wider text-blue-400">
            ETFs Industriales destacados
          </span>
        </div>
        <span className="text-[12px] text-muted-foreground/50 font-mono">vs {ticker}</span>
      </div>
      <div className="grid w-full gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {industrials.map((f) => (
          <div
            key={f.ticker}
            className="flex items-center justify-between rounded border border-blue-500/15 bg-blue-500/5 px-2.5 py-1.5"
          >
            <div>
              <span className="text-[13px] font-semibold font-mono text-foreground">
                {f.ticker}
              </span>
              <span className="ml-1 text-[12px] text-muted-foreground/60">{f.name}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] font-mono">
              <span
                className={cn(
                  f.correlation != null && f.correlation > 0.5
                    ? "text-green-400"
                    : f.correlation != null && f.correlation < -0.3
                      ? "text-red-400"
                      : "text-muted-foreground",
                )}
              >
                R={fmtNum(f.correlation, 2)}
              </span>
              {f.r_squared != null && (
                <span className="text-muted-foreground/60">
                  R²={(f.r_squared * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function IntermarketFactorPanel() {
  const [ticker, setTicker] = useState("SPY");
  const [period, setPeriod] = useState("1y");
  const [inputTicker, setInputTicker] = useState("SPY");

  const { data, isLoading, isError, refetch } = useQuery<AnalysisResult>({
    queryKey: ["intermarket-factors", ticker, period],
    queryFn: async () => {
      const res = await fetch(
        `${FLASK_BASE}/api/intermarket-analysis?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period)}`,
      );
      if (!res.ok) throw new Error(`Flask ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setTicker(inputTicker.trim().toUpperCase() || "SPY");
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="border-border/40 bg-background/40 p-4">
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-[13px] font-mono uppercase tracking-wider text-muted-foreground">
              Ticker
            </label>
            <Input
              value={inputTicker}
              onChange={(e) => setInputTicker(e.target.value)}
              placeholder="SPY, GGAL.BA, AMD, ^MERV..."
              className="font-mono text-sm h-9"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-mono uppercase tracking-wider text-muted-foreground">
              Período
            </label>
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded px-2.5 py-1.5 text-[14px] font-mono transition-colors",
                    period === p
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="rounded bg-primary px-4 py-1.5 text-[14px] font-mono font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Analizar
          </button>
        </form>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="grid w-full gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          Error al cargar análisis. Verificá que Flask esté corriendo en :5000.
        </div>
      )}

      {/* Results */}
      {data && !data.error && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-sm font-semibold text-foreground">{data.ticker}</span>
              <span className="ml-2 text-[13px] text-muted-foreground font-mono">
                {data.period} &middot; {data.total_factors} factores
              </span>
            </div>
            <span className="text-[12px] text-muted-foreground/50 font-mono">
              {new Date(data.timestamp).toLocaleString("es-AR")}
            </span>
          </div>

          {/* Summary */}
          <SummaryCard summary={data.summary} />

          {/* Rankings */}
          <div className="grid w-full gap-3 sm:grid-cols-3">
            {data.rankings.top_positive.length > 0 && (
              <RankingPanel
                title="Correlación Positiva"
                items={data.rankings.top_positive}
                icon="+"
              />
            )}
            {data.rankings.top_negative.length > 0 && (
              <RankingPanel
                title="Correlación Negativa"
                items={data.rankings.top_negative}
                icon="-"
              />
            )}
            {data.rankings.by_beta.length > 0 && (
              <RankingPanel title="Mayor Beta (abs)" items={data.rankings.by_beta} icon="\u03B2" />
            )}
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <h3 className="text-[13px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Factores por Categoría
            </h3>
            <div className="grid w-full gap-2">
              {Object.entries(data.categories).map(([name, catData]) => (
                <CategorySection key={name} name={name} data={catData} />
              ))}
            </div>
          </div>

          {/* Industriales destacados */}
          {data.categories.Sectors && (
            <IndustrialsHighlight factors={data.categories.Sectors.factors} ticker={data.ticker} />
          )}
        </div>
      )}

      {/* Error from Flask */}
      {data?.error && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-[14px] font-mono text-warning leading-relaxed">
          {data.error}
        </div>
      )}
    </div>
  );
}
