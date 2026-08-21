// @ts-nocheck
import type {
  HedgeConfig,
  HedgeUniverseType,
  HedgeType,
  HedgePeriod,
  HedgeSource,
} from "@/lib/capm-hedge.types";
import { FACTORS_MASTER_LIST, DEFAULT_HEDGE_CONFIG } from "@/lib/capm-hedge.types";

interface Props {
  config: HedgeConfig;
  onChange: (cfg: HedgeConfig) => void;
  source: HedgeSource;
  iolAvailableCash?: number;
}

const PERIODS: { value: HedgePeriod; label: string }[] = [
  { value: 90, label: "3m" },
  { value: 180, label: "6m" },
  { value: 365, label: "1y" },
  { value: 730, label: "2y" },
];

const UNIVERSES: { value: HedgeUniverseType; label: string }[] = [
  { value: "todo-byma", label: "Todo BYMA" },
  { value: "solo-cedears", label: "Solo CEDEARs" },
  { value: "solo-etfs", label: "Solo ETFs" },
  { value: "manual", label: "Manual" },
];

const HEDGE_TYPES: { value: HedgeType; label: string }[] = [
  { value: "delta-neutral", label: "Delta-neutral" },
  { value: "beta-neutral", label: "Beta-neutral" },
  { value: "ambas", label: "Ambas" },
];

const BENCHMARK_OPTIONS = Object.entries(FACTORS_MASTER_LIST)
  .filter(
    ([_, v]) =>
      v.cat === "Market" ||
      v.cat === "Sectors" ||
      v.cat === "Factors" ||
      v.cat === "Countries" ||
      v.cat === "Crypto",
  )
  .map(([ticker, info]) => ({ ticker, label: `${info.name} (${ticker})`, cat: info.cat }));

export function HedgeConfigPanel({ config, onChange, source, iolAvailableCash }: Props) {
  const set = <K extends keyof HedgeConfig>(key: K, value: HedgeConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const autoDetect = config.benchmarks.length === 1 && config.benchmarks[0] === "__AUTO__";
  const toggleAuto = () => {
    set("benchmarks", autoDetect ? DEFAULT_HEDGE_CONFIG.benchmarks : ["__AUTO__"]);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/40 bg-muted/5 p-4">
      <h3 className="font-mono text-xs font-medium text-foreground">Configuración de Cobertura</h3>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
              Benchmark(s)
            </label>
            <button
              onClick={toggleAuto}
              className={`font-mono text-[13px] px-2 py-0.5 rounded border transition-colors ${
                autoDetect
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {autoDetect ? "Auto " : "Auto "}
            </button>
          </div>
          {autoDetect ? (
            <div className="rounded border border-primary/20 bg-primary/5 p-2 text-[13px] font-mono text-muted-foreground text-center">
              Auto-detecting best benchmark (mayor R²) de {BENCHMARK_OPTIONS.length} factores
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto rounded border border-border/40 p-2">
              {BENCHMARK_OPTIONS.map((b) => {
                const active = config.benchmarks.includes(b.ticker);
                return (
                  <button
                    key={b.ticker}
                    onClick={() => {
                      const next = active
                        ? config.benchmarks.filter((t) => t !== b.ticker)
                        : [...config.benchmarks, b.ticker];
                      set("benchmarks", next.length > 0 ? next : [b.ticker]);
                    }}
                    className={`whitespace-nowrap rounded border px-2 py-1 font-mono text-[13px] transition-colors ${
                      active
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Universo de cobertura
          </label>
          <div className="flex flex-wrap gap-1">
            {UNIVERSES.map((u) => (
              <button
                key={u.value}
                onClick={() => set("universe", u.value)}
                className={`rounded border px-2 py-1 font-mono text-[14px] transition-colors ${
                  config.universe === u.value
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
          {config.universe === "manual" && (
            <input
              value={config.manualUniverseTickers}
              onChange={(e) => set("manualUniverseTickers", e.target.value)}
              placeholder="SPY, QQQ, XLK, XLF, ..."
              className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1 font-mono text-[14px] outline-none focus:border-primary/60"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Período
          </label>
          <div className="flex flex-wrap gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => set("period", p.value)}
                className={`rounded border px-2.5 py-1 font-mono text-[14px] transition-colors ${
                  config.period === p.value
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <label className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Regularización (λ): {config.lambda.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={config.lambda}
            onChange={(e) => set("lambda", parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Tipo de cobertura
          </label>
          <div className="flex flex-wrap gap-1">
            {HEDGE_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => set("hedgeType", t.value)}
                className={`rounded border px-2 py-1 font-mono text-[14px] transition-colors ${
                  config.hedgeType === t.value
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Saldo disponible (USD)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.availableCash}
              onChange={(e) => set("availableCash", Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full rounded border border-border/40 bg-background px-2 py-1 font-mono text-[14px] outline-none focus:border-primary/60"
            />
            {source === "iol" && iolAvailableCash !== undefined && (
              <button
                onClick={() => set("availableCash", iolAvailableCash)}
                className="shrink-0 rounded border border-border/40 px-2 py-1 font-mono text-[13px] text-muted-foreground hover:text-foreground"
                title={`Usar saldo IOL: $${iolAvailableCash.toFixed(2)}`}
              >
                IOL
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
