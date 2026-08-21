// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getCompleteIntermarketAnalysis } from "@/lib/intermarket-complete.functions";
import {
  type CompleteIntermarketResult,
  type RatioAnalysis as RatioAnalysisType,
  type WindowKey,
  type WindowStat,
  type PercentileInfo,
  type ZScoreInfo,
  type ReversalSignal,
  type SequentialStep,
  type CompositeScore,
  type CointegrationResult,
  type ScoreComponent,
  type VixRegimeInfo,
  type FedFundsInfo,
  type AssetClassSnapshot,
  WINDOW_CONFIGS,
  RATIO_DEFINITIONS,
} from "@/lib/intermarket-complete";
import { CyclePhaseBanner } from "./CyclePhaseBanner";
import { RecessionChecklist } from "./RecessionChecklist";
import { InflationDiagnosis } from "./InflationDiagnosis";
import { MurphyCascadeValidator } from "./MurphyCascadeValidator";

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function fmtZ(z: number | null | undefined): string {
  if (z == null || !Number.isFinite(z)) return "\u2014";
  return z.toFixed(2);
}

function TrendBadge({ change }: { change: number | null }) {
  if (change == null) return <span className="text-[10px] text-muted-foreground">--</span>;
  if (change > 2)
    return <span className="text-[10px] text-green-400 font-mono">▲ +{change.toFixed(1)}%</span>;
  if (change < -2)
    return <span className="text-[10px] text-red-400 font-mono">▼ {change.toFixed(1)}%</span>;
  return (
    <span className="text-[10px] text-muted-foreground font-mono">▬ {change.toFixed(1)}%</span>
  );
}

function PercentileBadge({ p }: { p: PercentileInfo | null }) {
  if (!p) return <span className="text-[10px] text-muted-foreground">--</span>;
  const colors: Record<string, string> = {
    oversold_extreme: "text-emerald-300",
    low: "text-emerald-500",
    normal: "text-muted-foreground",
    high: "text-orange-400",
    overbought_extreme: "text-red-400",
  };
  return (
    <span className={cn("text-[10px] font-mono", colors[p.category])}>
      Pct: {p.rank.toFixed(0)}%
    </span>
  );
}

function ZScoreBadge({ z }: { z: ZScoreInfo | null }) {
  if (!z) return <span className="text-[10px] text-muted-foreground">--</span>;
  const colors: Record<string, string> = {
    overbought: "text-red-400",
    normal: "text-muted-foreground",
    overSold: "text-emerald-300",
  };
  return (
    <span className={cn("text-[10px] font-mono", colors[z.category])}>
      Z: {z.zScore.toFixed(1)}
    </span>
  );
}

// ─── MiniCard for one ratio ─────────────────────────────────────

function RatioMiniCard({ ratio }: { ratio: RatioAnalysisType }) {
  const w63 = ratio.stats.windows[63];
  const w252 = ratio.stats.windows[252];
  const isExtreme =
    w63?.percentile?.category === "overbought_extreme" ||
    w63?.percentile?.category === "oversold_extreme";
  const isAnomalous = ratio.cointegration.some((c) => c.regimeAnomalous === true);

  return (
    <Card
      className={cn(
        "p-3 border-l-2 text-xs space-y-1.5",
        isExtreme ? "border-l-red-500 bg-red-500/5" : "border-l-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[11px] font-mono text-foreground">{ratio.label}</span>
        {isAnomalous && (
          <span className="text-[8px] text-yellow-400 bg-yellow-500/10 px-1 rounded">⚠</span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">{ratio.leading}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-foreground">{fmtNum(w63?.value)}</span>
        <TrendBadge change={w63?.changePct ?? null} />
      </div>
      <div className="flex items-center gap-2">
        <PercentileBadge p={w63?.percentile ?? null} />
        <ZScoreBadge z={w63?.zScore ?? null} />
      </div>
      {w252 && w252.changePct != null && (
        <div className="text-[9px] text-muted-foreground">
          Estructural (1y): {w252.changePct > 0 ? "+" : ""}
          {w252.changePct.toFixed(1)}%
        </div>
      )}
      {ratio.cointegration.length > 0 && (
        <div className="border-t border-border/30 pt-1 space-y-0.5">
          {ratio.cointegration.map((c, i) => (
            <div
              key={`${c.pairLabel}-${i}`}
              className="text-[8px] text-muted-foreground flex items-center gap-1"
            >
              <span>{c.pairLabel}</span>
              {c.cointegrated === true && <span className="text-green-500">✓</span>}
              {c.cointegrated === false && <span className="text-red-400">✗</span>}
              {c.regimeAnomalous === true && <span className="text-yellow-400">⚠ anómalo</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Reversal Signals Panel ────────────────────────────────────

function ReversalSignalsPanel({ signals }: { signals: ReversalSignal[] }) {
  if (signals.length === 0) {
    return (
      <Card className="p-3 border-l-2 border-l-green-500/50">
        <div className="text-xs text-muted-foreground">
          Sin señales de reversión activas en este momento.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {signals.map((s, i) => (
        <Card
          key={s.signal}
          className={cn(
            "p-3 border-l-2 text-xs space-y-1.5",
            s.divergenceDirection === "bearish"
              ? "border-l-red-500 bg-red-500/5"
              : "border-l-emerald-500 bg-emerald-500/5",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[11px] font-mono">
              {s.divergenceDirection === "bearish" ? "🔴" : "🟢"} {s.signal}
            </span>
            <span className="text-[9px] text-muted-foreground">
              Confianza: {(s.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">{s.interpretation}</div>
          <div className="flex items-center gap-2 text-[9px]">
            <span className={s.layer1Percentile ? "text-green-400" : "text-muted-foreground"}>
              Capa1:{s.layer1Percentile ? "✓" : "✗"}
            </span>
            <span className={s.layer2ZScore ? "text-green-400" : "text-muted-foreground"}>
              Capa2:{s.layer2ZScore ? "✓" : "✗"}
            </span>
            <span className={s.layer3Divergence ? "text-green-400" : "text-muted-foreground"}>
              Capa3:{s.layer3Divergence ? "✓" : "✗"}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Sequential Steps Panel ────────────────────────────────────

function SequentialPanel({
  steps,
  finalRegime,
  finalStage,
}: {
  steps: SequentialStep[];
  finalRegime: string;
  finalStage: string;
}) {
  const signalColors: Record<string, string> = {
    bullish: "text-green-400 border-green-500/30 bg-green-500/10",
    bearish: "text-red-400 border-red-500/30 bg-red-500/10",
    neutral: "text-muted-foreground border-border/30 bg-muted/10",
    warning: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  };
  const signalIcons: Record<string, string> = {
    bullish: "🟢",
    bearish: "🔴",
    neutral: "⚪",
    warning: "🟡",
  };

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <Card
          key={`${step.name}-${i}`}
          className={cn("p-3 border-l-2 text-xs space-y-1", signalColors[step.signal])}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{signalIcons[step.signal]}</span>
            <span className="font-semibold text-[11px] font-mono">
              PASO {step.step}: {step.name}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">{step.result}</div>
          {step.nextStep > 0 && (
            <div className="text-[9px] text-muted-foreground/70">
              → Siguiente: PASO {step.nextStep}
            </div>
          )}
        </Card>
      ))}
      <Card className="p-3 border-t-2 border-t-primary/30 mt-3">
        <div className="text-xs font-semibold font-mono">Resultado Final</div>
        <div className="text-[11px] text-muted-foreground mt-1">{finalRegime}</div>
        <div className="text-[10px] text-muted-foreground">{finalStage}</div>
      </Card>
    </div>
  );
}

// ─── Composite Score Panel ─────────────────────────────────────

function CompositeScorePanel({ score }: { score: CompositeScore }) {
  const colors: Record<string, string> = {
    aggressive_risk_on: "text-green-300 border-green-500/30 bg-green-500/10",
    moderate_risk_on: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    neutral: "text-muted-foreground border-border/30 bg-muted/10",
    defensive: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    risk_off: "text-red-400 border-red-500/30 bg-red-500/10",
  };

  const bars: Record<string, string> = {
    aggressive_risk_on: "bg-green-500",
    moderate_risk_on: "bg-emerald-500",
    neutral: "bg-muted-foreground",
    defensive: "bg-orange-500",
    risk_off: "bg-red-500",
  };

  return (
    <div className="space-y-3">
      <Card className={cn("p-4 border-l-2", colors[score.riskProfile])}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold font-mono text-foreground">{score.label}</span>
          <span className="text-2xl font-bold font-mono">
            {score.score > 0 ? "+" : ""}
            {score.score}
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", bars[score.riskProfile])}
            style={{
              width: `${Math.min(100, Math.abs(score.score) + 50)}%`,
              marginLeft: score.score < 0 ? `${50 - Math.min(50, Math.abs(score.score))}%` : "50%",
            }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
          <span>Risk-Off</span>
          <span>Neutral</span>
          <span>Risk-On</span>
        </div>
      </Card>
      <div className="grid gap-1.5">
        {score.components.map((c, i) => (
          <ComponentRow key={c.ratioId} component={c} />
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground leading-relaxed">
        {score.interpretation}
      </div>
    </div>
  );
}

function ComponentRow({ component }: { component: ScoreComponent }) {
  const def = RATIO_DEFINITIONS.find((r) => r.id === component.ratioId);
  const weightPct = (component.weight * 100).toFixed(0);

  return (
    <div className="flex items-center justify-between text-[11px] font-mono py-1 border-b border-border/20 last:border-0">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-4 text-center",
            component.signalValue > 0
              ? "text-green-400"
              : component.signalValue < 0
                ? "text-red-400"
                : "text-muted-foreground",
          )}
        >
          {component.signalValue > 0 ? "▲" : component.signalValue < 0 ? "▼" : "▬"}
        </span>
        <span className="text-foreground">{def?.label ?? component.ratioId}</span>
        <span className="text-[9px] text-muted-foreground">({weightPct}%)</span>
      </div>
      <div className="flex items-center gap-2">
        {component.cointegrationMultiplier < 1 && (
          <span className="text-[8px] text-yellow-400">×0.5</span>
        )}
        <span
          className={cn(
            "font-mono text-xs",
            component.contribution > 0
              ? "text-green-400"
              : component.contribution < 0
                ? "text-red-400"
                : "text-muted-foreground",
          )}
        >
          {component.contribution > 0 ? "+" : ""}
          {(component.contribution * 100).toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// ─── Cointegration Matrix ──────────────────────────────────────

function CointegrationMatrixCard({ result }: { result: CompleteIntermarketResult }) {
  const pairs = result.ratios.flatMap((r) => r.cointegration);
  if (pairs.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {pairs.map((c, i) => (
        <div
          key={`${c.pairLabel}-${i}`}
          className="flex items-center justify-between text-[10px] font-mono py-1 border-b border-border/20 last:border-0"
        >
          <div className="flex items-center gap-1">
            <span className="text-foreground">{c.pairLabel}</span>
            {c.expectedPerMurphy && (
              <span className="text-[8px] text-blue-400">(Murphy espera sí)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {c.adfStatistic != null ? (
              <>
                <span className="text-muted-foreground">ADF: {c.adfStatistic.toFixed(2)}</span>
                <span
                  className={cn(
                    "px-1 rounded text-[9px]",
                    c.cointegrated
                      ? "bg-green-500/10 text-green-400"
                      : "bg-red-500/10 text-red-400",
                  )}
                >
                  {c.cointegrated ? "✓ Cointegrado" : "✗ No cointegrado"}
                </span>
                {c.regimeAnomalous === true && (
                  <span className="text-yellow-400 text-[8px]">⚠ Anómalo</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Sin datos</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Multi-window detail for a single ratio ────────────────────

function RatioDetailCard({ ratio }: { ratio: RatioAnalysisType }) {
  const windows: WindowKey[] = [21, 63, 126, 252, 504];

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold font-mono text-foreground">{ratio.label}</span>
          <span className="text-[9px] text-muted-foreground ml-2">{ratio.formula}</span>
        </div>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded font-mono",
            ratio.signal.regime === "bullish"
              ? "bg-green-500/10 text-green-400"
              : ratio.signal.regime === "bearish"
                ? "bg-red-500/10 text-red-400"
                : "bg-muted/10 text-muted-foreground",
          )}
        >
          {ratio.signal.regime === "bullish" ? "▲" : ratio.signal.regime === "bearish" ? "▼" : "▬"}{" "}
          {ratio.signal.regime.toUpperCase()}
        </span>
      </div>
      <div className="text-[9px] text-muted-foreground">{ratio.leading}</div>
      <div className="grid grid-cols-5 gap-1">
        {windows.map((w) => {
          const ws = ratio.stats.windows[w];
          const cfg = WINDOW_CONFIGS[w];
          return (
            <div
              key={w}
              className={cn(
                "p-1.5 rounded text-[9px] text-center",
                ws?.changePct != null && ws.changePct > 2
                  ? "bg-green-500/5"
                  : ws?.changePct != null && ws.changePct < -2
                    ? "bg-red-500/5"
                    : "bg-muted/5",
              )}
            >
              <div className="text-[8px] text-muted-foreground">{cfg.label}</div>
              <div className="font-mono text-[10px] text-foreground">{fmtNum(ws?.value, 4)}</div>
              <TrendBadge change={ws?.changePct ?? null} />
              <PercentileBadge p={ws?.percentile ?? null} />
              <ZScoreBadge z={ws?.zScore ?? null} />
            </div>
          );
        })}
      </div>
      {ratio.cointegration.length > 0 && (
        <div className="border-t border-border/20 pt-1.5 space-y-0.5">
          <span className="text-[9px] text-muted-foreground font-mono">Cointegración:</span>
          {ratio.cointegration.map((c, i) => (
            <div key={i} className="text-[8px] text-muted-foreground flex items-center gap-1">
              <span>{c.pairLabel}:</span>
              {c.cointegrated == null ? (
                <span className="text-yellow-400">sin datos</span>
              ) : (
                <>
                  <span className={c.cointegrated ? "text-green-400" : "text-red-400"}>
                    {c.cointegrated ? "cointegrado" : "NO cointegrado"}
                  </span>
                  {c.regimeAnomalous && (
                    <span className="text-yellow-400">(anómalo vs Murphy)</span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── VIX Regime Panel ────────────────────────────────────────────

function VixRegimeCard({ vix }: { vix: VixRegimeInfo }) {
  const colors: Record<string, string> = {
    low_vol: "text-green-400 border-green-500/30 bg-green-500/5",
    normal: "text-muted-foreground border-border/30 bg-background/40",
    elevated: "text-orange-400 border-orange-500/30 bg-orange-500/5",
    panic: "text-red-400 border-red-500/30 bg-red-500/10",
  };
  const labels: Record<string, string> = {
    low_vol: "Volatilidad Baja",
    normal: "Volatilidad Normal",
    elevated: "Volatilidad Elevada",
    panic: "PÁNICO",
  };

  return (
    <Card className={cn("p-4 space-y-2 border-l-2", colors[vix.category ?? "normal"])}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold font-mono text-foreground">
          VIX — Régimen de Volatilidad
        </span>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded font-mono",
            colors[vix.category ?? "normal"],
          )}
        >
          {vix.currentValue != null ? vix.currentValue.toFixed(1) : "--"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono font-semibold">
          {vix.category ? labels[vix.category] : "Sin datos"}
        </span>
        {vix.trend21d != null && <TrendBadge change={vix.trend21d} />}
      </div>
      {vix.percentile && (
        <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground">
          <PercentileBadge p={vix.percentile} />
          {vix.zScore && <ZScoreBadge z={vix.zScore} />}
        </div>
      )}
      {vix.category === "panic" && (
        <div className="text-[9px] text-red-400/80">
          VIX en extremo — posible bottom de mercado cercano.
        </div>
      )}
      {vix.category === "elevated" && (
        <div className="text-[9px] text-orange-400/80">
          Volatilidad elevada — mantener precaución.
        </div>
      )}
      {vix.category === "low_vol" && (
        <div className="text-[9px] text-green-400/80">
          Volatilidad baja — entorno favorable para riesgo.
        </div>
      )}
    </Card>
  );
}

// ─── Fed Funds Panel ─────────────────────────────────────────────

function FedFundsCard({ fed }: { fed: FedFundsInfo }) {
  const phaseColors: Record<string, string> = {
    tightening: "text-red-400 border-red-500/30",
    cutting: "text-green-400 border-green-500/30",
    pause: "text-yellow-400 border-yellow-500/30",
    neutral: "text-muted-foreground border-border/30",
  };
  const phaseLabels: Record<string, string> = {
    tightening: "Tightening",
    cutting: "Cutting",
    pause: "Pausa",
    neutral: "Neutral",
  };

  return (
    <Card className="p-4 space-y-2 border-l-2 border-l-blue-400/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold font-mono text-foreground">
          Fed Funds — Ciclo Monetario
        </span>
        <span className="text-[11px] font-mono font-semibold">
          {fed.currentRate != null ? `${fed.currentRate.toFixed(2)}%` : "--"}
        </span>
      </div>
      <div
        className={cn(
          "text-[10px] px-2 py-0.5 rounded font-mono inline-block",
          phaseColors[fed.cyclePhase ?? "neutral"],
        )}
      >
        {phaseLabels[fed.cyclePhase ?? "neutral"]}
      </div>
      {fed.spread10y2y != null && (
        <div className="text-[9px] font-mono text-muted-foreground">
          Spread 10Y-2Y: {fed.spread10y2y.toFixed(2)} bps
          {fed.fedVsSpread.fedAboveSpread != null && (
            <> · Fed {fed.fedVsSpread.fedAboveSpread ? ">" : "<"} curva</>
          )}
        </div>
      )}
      <div className="text-[9px] text-muted-foreground/80 leading-relaxed pt-1 border-t border-border/20">
        {fed.fedVsSpread.interpretation}
      </div>
    </Card>
  );
}

// ─── Asset Classes Snapshot ──────────────────────────────────────

function AssetClassesCard({ ac }: { ac: AssetClassSnapshot }) {
  return (
    <Card className="p-4 space-y-2 border-l-2 border-l-violet-400/50">
      <span className="text-xs font-semibold font-mono text-foreground block mb-2">
        Clases de Activo Adicionales
      </span>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-foreground">Real Estate (XLRE)</span>
            <span className="text-[11px] font-mono">
              {ac.xlre.price != null ? `$${ac.xlre.price.toFixed(2)}` : "--"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[9px]">
            <TrendBadge change={ac.xlre.change21d} />
            {ac.xlre.percentile && <PercentileBadge p={ac.xlre.percentile} />}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-foreground">T-Bills (BIL)</span>
            <span className="text-[11px] font-mono">
              {ac.bil.yield != null ? `$${ac.bil.yield.toFixed(2)}` : "--"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[9px]">
            <TrendBadge change={ac.bil.change21d} />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────────

export function IntermarketCompleteDashboard() {
  const getAnalysis = useServerFn(getCompleteIntermarketAnalysis);
  const { data, isLoading, error } = useQuery({
    queryKey: ["intermarket-complete"],
    queryFn: () => getAnalysis(),
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 3000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span className="animate-pulse">⏳</span>
          <span>Cargando analisis intermarket (datos de mercado)...</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data || data.ratios.length === 0) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center">
        <div className="text-xs font-semibold font-mono uppercase tracking-wider text-amber-400 mb-1">
          Analisis Intermarket — Sin Datos
        </div>
        <p className="text-[9px] text-muted-foreground/70">
          {error
            ? "Error al obtener datos de mercado (Yahoo Finance)."
            : "No hay datos suficientes para el analisis completo."}{" "}
          Los modulos de ciclo, recesion e inflacion requieren datos de TLT, SPY, DBC y otros
          tickers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PASO 1 — Fase del ciclo + Rotación sectorial (Murphy) */}
      <CyclePhaseBanner data={data} />

      {/* PASO 2 — Checklist de Recesión (Murphy Cap. 14) */}
      <RecessionChecklist data={data} />

      {/* PASO 3 — Inflación: Demanda vs Oferta (Murphy Cap. 3, 8, 10) */}
      <InflationDiagnosis data={data} />

      {/* PASO 4 — Cascada Intermarket DXY→CRB→TLT→SPY (Murphy Cap. 1-3) */}
      <MurphyCascadeValidator data={data} />

      {/* Score Compuesto — Nivel 6 */}
      <Card className="p-4">
        <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-3">
          Nivel 6 — Score Compuesto Final ({data.compositeScore.score})
        </div>
        <CompositeScorePanel score={data.compositeScore} />
      </Card>

      {/* Secuencia de 5 Pasos — Nivel 5 */}
      <Card className="p-4">
        <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-3">
          Nivel 5 — Secuencia Lógica (Murphy)
        </div>
        <SequentialPanel
          steps={data.sequential.steps}
          finalRegime={data.sequential.finalRegime}
          finalStage={data.sequential.finalStage}
        />
      </Card>

      {/* Indicadores Complementarios: VIX, Fed Funds, Asset Classes */}
      <div className="grid gap-3 md:grid-cols-3">
        <VixRegimeCard vix={data.complementary.vix} />
        <FedFundsCard fed={data.complementary.fedFunds} />
        <AssetClassesCard ac={data.complementary.assetClasses} />
      </div>

      {/* Señales de Reversión — Nivel 3 */}
      {data.reversalSignals.length > 0 && (
        <Card className="p-4 border-yellow-500/30">
          <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-3">
            Nivel 3 — Señales de Reversión ({data.reversalSignals.length})
          </div>
          <ReversalSignalsPanel signals={data.reversalSignals} />
        </Card>
      )}

      {/* Matriz de Cointegración — Nivel 4 */}
      <Card className="p-4">
        <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-3">
          Nivel 4 — Cointegración (Pairwise ADF)
        </div>
        <CointegrationMatrixCard result={data} />
      </Card>

      {/* Grid de los 12 ratios — Nivel 0-2 */}
      <Card className="p-4">
        <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-3">
          Nivel 1-2 — Los 14 Ratios Esenciales (Murphy) + Estadísticos Multi-ventana
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {data.ratios.map((ratio) => (
              <RatioMiniCard key={ratio.id} ratio={ratio} />
            ))}
          </div>
        </div>
      </Card>

      {/* Detalle por ratio */}
      <Card className="p-4">
        <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-3">
          Detalle Multi-ventana (21d / 63d / 126d / 252d / 504d)
        </div>
        <div className="space-y-2">
          {data.ratios.map((ratio) => (
            <RatioDetailCard key={ratio.id} ratio={ratio} />
          ))}
        </div>
      </Card>

      <div className="text-[9px] text-muted-foreground font-mono text-right">
        Generado: {new Date(data.generatedAt).toLocaleString("es-AR")}
      </div>
    </div>
  );
}
