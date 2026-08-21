// @ts-nocheck
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InfoTip } from "./InfoTip";
import { useIOLSession } from "@/lib/iol-context";
import { computeBacktestGrid } from "@/lib/statarb.server";
import { BacktestHeatmap } from "./BacktestHeatmap";
import { TradesTable } from "./TradesTable";
import { PnLChart } from "./PnLChart";
import type { BacktestConfig, BacktestGridResult, DataInterval } from "@/lib/statarb.types";
import { DEFAULT_BACKTEST_CONFIG, intervalLabel } from "@/lib/statarb.types";
import type { SharedPairConfig } from "./StatArbTab";

const METRICS = [
  { value: "sharpe" as const, label: "Sharpe" },
  { value: "psharpe" as const, label: "p-Sharpe" },
  { value: "pnl" as const, label: "PNL Total" },
  { value: "winrate" as const, label: "Win Rate" },
  { value: "maxdd" as const, label: "Max Drawdown" },
];

interface BacktestingProps {
  shared: SharedPairConfig;
  onUpdateShared: <K extends keyof SharedPairConfig>(k: K, v: SharedPairConfig[K]) => void;
  source: "yahoo" | "iol";
  onSourceChange: (s: "yahoo" | "iol") => void;
  iolMercado: string;
  onIolMercadoChange: (m: string) => void;
}

export function BacktestingPanel({
  shared,
  onUpdateShared,
  source,
  onSourceChange,
  iolMercado,
  onIolMercadoChange,
}: BacktestingProps) {
  const { accessToken } = useIOLSession();
  const [config, setConfig] = useState<BacktestConfig>({
    ...DEFAULT_BACKTEST_CONFIG,
    asset1: shared.asset1,
    asset2: shared.asset2,
    period: shared.period,
    window: shared.window,
    capitalPerPair: shared.capitalPerPair,
    txCost: shared.txCost,
  });
  const [result, setResult] = useState<BacktestGridResult | null>(null);
  const [error, setError] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const fn = useServerFn(computeBacktestGrid);

  const m = useMutation({
    mutationFn: async () => {
      setResult(null);
      const token = accessToken;
      if (source === "iol" && !token) {
        throw new Error(
          "Debés iniciar sesión en IOL desde el panel superior para usar esta fuente de datos.",
        );
      }
      const res = await fn({
        data: {
          asset1: shared.asset1.toUpperCase().trim(),
          asset2: shared.asset2.toUpperCase().trim(),
          period: shared.period,
          interval: shared.interval,
          window: shared.window,
          capitalPerPair: shared.capitalPerPair,
          txCost: shared.txCost,
          insamplePct: config.insamplePct,
          aMin: config.aMin,
          aMax: config.aMax,
          aStep: config.aStep,
          bMin: config.bMin,
          bMax: config.bMax,
          bStep: config.bStep,
          metric: config.metric,
          source,
          token,
          mercado: source === "iol" ? iolMercado : undefined,
          // ─── Labadie params ───
          pValue: config.pValue,
          marketImpactGamma: config.marketImpactGamma,
          participationRate: config.participationRate,
          executionAlgo: config.executionAlgo,
        },
      });
      setResult(res);
      return res;
    },
    onError: (e: Error) => setError(e.message),
  });

  const set = <K extends keyof BacktestConfig>(k: K, v: BacktestConfig[K]) =>
    setConfig((c) => ({ ...c, [k]: v }));

  const oosPnL = result?.oosResult?.trades
    ? result.oosResult.trades.map((t) => ({ date: t.exitDate, pnl: t.pnlCum }))
    : [];

  const isPnL = result?.optimal
    ? [
        { date: "In-Sample", pnl: result.optimal.insample.totalPnl },
        { date: "---", pnl: 0 },
        { date: "Out-of-Sample", pnl: result.optimal.outOfSample.totalPnl },
      ]
    : [];

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Tutorial */}
        <Collapsible
          open={tutorialOpen}
          onOpenChange={setTutorialOpen}
          className="rounded-lg border border-border/40 bg-muted/5"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2.5 font-mono text-xs text-foreground hover:bg-muted/10 transition-colors">
            <span>¿Cómo interpretar el Backtesting?</span>
            <span className="text-muted-foreground">{tutorialOpen ? "▾" : "▸"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-3 pt-0">
            <div className="space-y-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              <p>
                El <strong>backtesting</strong> evalúa cómo se habría comportado una estrategia de
                pairs trading en el pasado. Divide los datos en dos partes:{" "}
                <strong>In-Sample (IS)</strong> para entrenar/optimizar parámetros y{" "}
                <strong>Out-of-Sample (OOS)</strong> para validar.
              </p>
              <div className="space-y-1 pt-1">
                <p className="text-foreground">Conceptos clave:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>IS/OOS</strong> — el porcentaje de datos usados para entrenar (IS) vs
                    validar (OOS). Ej: 70/30 = 70% para optimizar parámetros, 30% para probar. Un
                    split típico es 70/30.
                  </li>
                  <li>
                    <strong>Grid Search</strong> — prueba todas las combinaciones de (a, b) dentro
                    de los rangos definidos para encontrar la óptima según la métrica elegida.
                  </li>
                  <li>
                    <strong>Overfitting</strong> — ocurre cuando la estrategia funciona bien en IS
                    pero mal en OOS. Una estrategia robusta retiene al menos el 50% del Sharpe de IS
                    en OOS.
                  </li>
                  <li>
                    <strong>Heatmap</strong> — mapa de calor que muestra el rendimiento de cada
                    combinación (a, b). La celda con borde amarillo es la combinación óptima en IS.
                  </li>
                  <li>
                    <strong>Curva Equity</strong> — evolución del capital acumulado. Una pendiente
                    positiva sostenida es señal de consistencia; caídas pronunciadas indican
                    drawdown.
                  </li>
                </ul>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Par display — leído desde Pairs Trading, no editable aquí */}
        <div className="rounded-lg border border-border/40 bg-muted/5 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Par desde Pairs Trading
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-primary">{shared.asset1}</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold text-primary">{shared.asset2}</span>
            <span className="text-[10px] text-muted-foreground">
              ·{" "}
              {shared.period >= 365 ? `${(shared.period / 365).toFixed(0)}y` : `${shared.period}d`}·
              ventana {shared.window}· {shared.interval === "1d" ? "Diario" : shared.interval}· tx{" "}
              {shared.txCost}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              IS/OOS %
              <InfoTip>
                In-Sample vs Out-of-Sample. El porcentaje indica cuántos datos se usan para entrenar
                (IS) y cuántos para validar (OOS). Un split típico es 70/30. Si es muy alto (&gt;
                90%), hay poco OOS y la validación es menos confiable.
              </InfoTip>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={50}
                max={95}
                value={config.insamplePct}
                onChange={(e) =>
                  set("insamplePct", Math.max(50, Math.min(95, parseInt(e.target.value) || 70)))
                }
                className="w-16 rounded border border-border/40 bg-background px-2 py-1 font-mono text-[11px] outline-none focus:border-primary/60"
              />
              <span className="font-mono text-[10px] text-muted-foreground">
                IS / {100 - config.insamplePct}% OOS
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Grid a: min
              <InfoTip>
                a = umbral de entrada en Z-Score. Se prueban todas las combinaciones entre min y max
                con el paso indicado. Ej: de 1.0 a 3.0 con paso 0.25 genera 9 valores. La óptima
                maximiza la métrica elegida en IS.
              </InfoTip>
            </label>
            <div className="flex gap-1">
              <input
                type="number"
                min={0.1}
                max={2}
                step={0.05}
                value={config.aMin}
                onChange={(e) => set("aMin", parseFloat(e.target.value) || 0.5)}
                className="w-14 rounded border border-border/40 bg-background px-1 py-1 font-mono text-[11px] outline-none focus:border-primary/60"
              />
              <input
                type="number"
                min={0.1}
                max={4}
                step={0.05}
                value={config.aMax}
                onChange={(e) => set("aMax", parseFloat(e.target.value) || 3)}
                className="w-14 rounded border border-border/40 bg-background px-1 py-1 font-mono text-[11px] outline-none focus:border-primary/60"
              />
              <select
                value={config.aStep}
                onChange={(e) => set("aStep", parseFloat(e.target.value))}
                className="rounded border border-border/40 bg-background px-1 py-1 font-mono text-[11px] outline-none"
              >
                <option value={0.1}>0.1</option>
                <option value={0.25}>0.25</option>
                <option value={0.5}>0.5</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Grid b: min
              <InfoTip>
                b = umbral de stop-loss en Z-Score. Se prueba en grid junto con "a". La combinación
                óptima es la que maximiza la métrica seleccionada en IS. b siempre debe ser mayor
                que a.
              </InfoTip>
            </label>
            <div className="flex gap-1">
              <input
                type="number"
                min={0.5}
                max={3}
                step={0.05}
                value={config.bMin}
                onChange={(e) => set("bMin", parseFloat(e.target.value) || 1)}
                className="w-14 rounded border border-border/40 bg-background px-1 py-1 font-mono text-[11px] outline-none focus:border-primary/60"
              />
              <input
                type="number"
                min={1}
                max={5}
                step={0.05}
                value={config.bMax}
                onChange={(e) => set("bMax", parseFloat(e.target.value) || 4)}
                className="w-14 rounded border border-border/40 bg-background px-1 py-1 font-mono text-[11px] outline-none focus:border-primary/60"
              />
              <select
                value={config.bStep}
                onChange={(e) => set("bStep", parseFloat(e.target.value))}
                className="rounded border border-border/40 bg-background px-1 py-1 font-mono text-[11px] outline-none"
              >
                <option value={0.1}>0.1</option>
                <option value={0.25}>0.25</option>
                <option value={0.5}>0.5</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Métrica
              <InfoTip>
                La métrica que el grid search intenta maximizar en In-Sample. Sharpe da el mejor
                balance riesgo-retorno. PNL maximiza retorno bruto. Win Rate busca consistencia. Max
                DD minimiza la caída máxima.
              </InfoTip>
            </label>
            <div className="flex flex-wrap gap-1">
              {METRICS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => set("metric", m.value)}
                  className={`rounded border px-1.5 py-1 font-mono text-[10px] transition-colors ${config.metric === m.value ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Labadie: Algoritmo, pValue, impacto de mercado ─── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Algoritmo
              <InfoTip>
                Labadie §2.3-2.4: "pairs" = Z-score; "tc" = Target Close; "is" = Implementation
                Shortfall.
              </InfoTip>
            </label>
            <select
              value={config.executionAlgo ?? "pairs"}
              onChange={(e) => set("executionAlgo", e.target.value as "pairs" | "tc" | "is")}
              className="w-full rounded border border-border/40 bg-background px-2 py-1 font-mono text-[11px] outline-none focus:border-primary/60"
            >
              <option value="pairs">Pairs (Z-score)</option>
              <option value="tc">Target Close</option>
              <option value="is">Implementation Shortfall</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              p (p-variance): {config.pValue?.toFixed(1) ?? "2.0"}
              <InfoTip>
                Labadie §3.2: p para p-variance. p=2 → clásico; p≠2 → riesgo generalizado.
              </InfoTip>
            </label>
            <input
              type="range"
              min={1.1}
              max={4}
              step={0.1}
              value={config.pValue ?? 2}
              onChange={(e) => set("pValue", parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Impacto γ: {config.marketImpactGamma?.toFixed(2) ?? "0.50"}
              <InfoTip>Labadie §2.1: exponente de impacto. I(v) = σ × |v/V|^γ × τ^(1/p).</InfoTip>
            </label>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={config.marketImpactGamma ?? 0.5}
              onChange={(e) => set("marketImpactGamma", parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Participación: {((config.participationRate ?? 0.1) * 100).toFixed(0)}%
              <InfoTip>
                Labadie §2.2: PVol. % del volumen por intervalo. Menor = menos impacto.
              </InfoTip>
            </label>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={(config.participationRate ?? 0.1) * 100}
              onChange={(e) => set("participationRate", parseFloat(e.target.value) / 100)}
              className="w-full accent-primary"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg border border-border/40 p-0.5">
            <button
              onClick={() => onSourceChange("yahoo")}
              className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${source === "yahoo" ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Yahoo Finance
            </button>
            <button
              onClick={() => onSourceChange("iol")}
              disabled={!accessToken}
              title={
                accessToken
                  ? undefined
                  : "Inicia sesión en IOL (panel superior) para habilitar esta fuente"
              }
              className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${source === "iol" ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"} ${accessToken ? "" : "opacity-40 cursor-not-allowed"}`}
            >
              IOL{!accessToken ? " · sin sesión" : ""}
            </button>
            {source === "iol" && (
              <select
                value={iolMercado}
                onChange={(e) => onIolMercadoChange(e.target.value)}
                className="ml-1 rounded border border-border/40 bg-background px-1.5 py-0.5 text-[10px] font-mono outline-none"
              >
                <option value="BCBA">BCBA</option>
                <option value="NYSE">NYSE</option>
                <option value="NASDAQ">NASDAQ</option>
                <option value="ROFEX">ROFEX</option>
              </select>
            )}
          </div>
          <button
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="rounded bg-primary px-4 py-2 font-mono text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {m.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Ejecutando grid search... (
                {((((config.aMax - config.aMin) / config.aStep) * (config.bMax - config.bMin)) /
                  config.bStep) |
                  0}{" "}
                combinaciones)
              </span>
            ) : (
              `Backtesting: ${shared.asset1} / ${shared.asset2}`
            )}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-[11px] text-danger">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-5">
            {/* Robustness banner */}
            <div
              className={`rounded-lg border px-4 py-3 font-mono text-[11px] ${
                result.isRobust
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-warning/40 bg-warning/10 text-warning"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>
                  {result.isRobust
                    ? ` Estrategia robusta — Sharpe OOS retiene ${result.robustnessPct}% del IS (umbral: >50%)`
                    : `Posible overfitting — Sharpe OOS solo retiene ${result.robustnessPct}% del IS (umbral: >50%)`}
                </span>
                <InfoTip>
                  Una estrategia es robusta si el Sharpe en datos no vistos (OOS) retiene al menos
                  el 50% del Sharpe obtenido en entrenamiento (IS). Si es menor, probablemente hay
                  overfitting: la estrategia se ajustó demasiado a los datos pasados.
                </InfoTip>
              </div>
            </div>

            {/* Optimal params card */}
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-border/40 bg-muted/5 p-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-mono text-xs font-medium text-foreground">
                  Parámetros Óptimos (In-Sample)
                </h3>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      a*
                      <InfoTip>
                        Umbral de entrada en Z-Score. Cuando el spread normalizado supera este
                        valor, se abre una posición larga/corta. Ej: a=2 significa que se opera
                        cuando el spread está a 2 desviaciones estándar de la media. Valores bajos
                        (1-1.5) generan más trades; altos (&gt;2) reducen frecuencia pero buscan
                        mayores desvíos.
                      </InfoTip>
                    </span>
                    <p className="font-mono text-xs text-foreground">
                      {result.optimal.a.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      b*
                      <InfoTip>
                        Umbral de stop-loss en Z-Score. Si el spread sigue divergiendo y supera este
                        valor, la posición se cierra con pérdida para evitar una divergencia aún
                        mayor. Debe ser mayor que a. Ej: a=2, b=3 significa que se entra a 2σ y se
                        sale forzosamente a 3σ si sigue divergiendo.
                      </InfoTip>
                    </span>
                    <p className="font-mono text-xs text-foreground">
                      {result.optimal.b.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Sharpe IS
                      <InfoTip>
                        Ratio de Sharpe en datos de entrenamiento (In-Sample). Un Sharpe IS alto
                        pero OOS bajo indica overfitting. Idealmente ambos deben ser positivos y
                        cercanos.
                      </InfoTip>
                    </span>
                    <p className="font-mono text-xs text-foreground">
                      {result.optimal.insample.sharpe.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Sharpe OOS
                      <InfoTip>
                        Ratio de Sharpe en datos no vistos (Out-of-Sample). Es la métrica más
                        importante para validar si la estrategia funcionará en el futuro. Si es
                        negativo, la estrategia pierde dinero fuera de muestra.
                      </InfoTip>
                    </span>
                    <p
                      className={`font-mono text-xs ${result.optimal.outOfSample.sharpe > 0 ? "text-success" : "text-danger"}`}
                    >
                      {result.optimal.outOfSample.sharpe.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      PNL IS
                      <InfoTip>
                        Rentabilidad total acumulada en datos de entrenamiento (In-Sample). Un PNL
                        IS alto puede deberse a overfitting si no se confirma en OOS. Siempre
                        comparar con OOS antes de decidir.
                      </InfoTip>
                    </span>
                    <p
                      className={`font-mono text-xs ${result.optimal.insample.totalPnl >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {result.optimal.insample.totalPnl >= 0 ? "+" : ""}
                      {result.optimal.insample.totalPnl.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      PNL OOS
                      <InfoTip>
                        Rentabilidad total acumulada en datos no vistos (Out-of-Sample). Es la
                        métrica que más importa: un PNL OOS positivo y cercano al IS indica una
                        estrategia robusta. Si es negativo, la estrategia probablemente no funcione
                        en el futuro.
                      </InfoTip>
                    </span>
                    <p
                      className={`font-mono text-xs ${result.optimal.outOfSample.totalPnl >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {result.optimal.outOfSample.totalPnl >= 0 ? "+" : ""}
                      {result.optimal.outOfSample.totalPnl.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-mono text-xs font-medium text-foreground">
                  Comparativa IS vs OOS
                </h3>
                <table className="w-full text-left font-mono text-[11px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-1">Métrica</th>
                      <th className="px-2 py-1 text-right">IS</th>
                      <th className="px-2 py-1 text-right">OOS</th>
                      <th className="px-2 py-1 text-right">Ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: "Sharpe",
                        is: result.optimal.insample.sharpe,
                        oos: result.optimal.outOfSample.sharpe,
                        ok:
                          result.optimal.outOfSample.sharpe /
                            (result.optimal.insample.sharpe || 0.001) >
                          0.5,
                      },
                      {
                        label: "PNL total",
                        is: result.optimal.insample.totalPnl,
                        oos: result.optimal.outOfSample.totalPnl,
                        ok:
                          result.optimal.outOfSample.totalPnl /
                            (result.optimal.insample.totalPnl || 0.001) >
                          0.5,
                      },
                      {
                        label: "Win rate",
                        is: result.optimal.insample.winRate,
                        oos: result.optimal.outOfSample.winRate,
                        ok: true,
                      },
                      {
                        label: "Max DD",
                        is: result.optimal.insample.maxDrawdown,
                        oos: result.optimal.outOfSample.maxDrawdown,
                        ok:
                          result.optimal.outOfSample.maxDrawdown <
                            result.optimal.insample.maxDrawdown * 2 ||
                          result.optimal.insample.maxDrawdown === 0,
                      },
                    ].map((r) => (
                      <tr key={r.label} className="border-b border-border/10">
                        <td className="px-2 py-1 text-foreground">{r.label}</td>
                        <td
                          className={`px-2 py-1 text-right ${r.label === "Max DD" ? "text-danger" : r.is >= 0 ? "text-success" : "text-danger"}`}
                        >
                          {r.label === "Win rate"
                            ? r.is.toFixed(1) + "%"
                            : r.label === "Max DD"
                              ? r.is.toFixed(2) + "%"
                              : r.is.toFixed(2)}
                        </td>
                        <td
                          className={`px-2 py-1 text-right ${r.label === "Max DD" ? "text-danger" : r.oos >= 0 ? "text-success" : "text-danger"}`}
                        >
                          {r.label === "Win rate"
                            ? r.oos.toFixed(1) + "%"
                            : r.label === "Max DD"
                              ? r.oos.toFixed(2) + "%"
                              : r.oos.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <span className={r.ok ? "text-success" : "text-warning"}>
                            {r.ok ? "" : "️"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top 5 params */}
            <div className="rounded-lg border border-border/40 p-3">
              <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Top 5 combinaciones (a, b) por Sharpe IS
                <InfoTip>
                  Las 5 combinaciones de umbrales (a, b) con mejor Sharpe en In-Sample. Idealmente,
                  las mejores en IS también deberían rankear bien en OOS. Si el #1 en IS es malo en
                  OOS pero el #3 es bueno, considera usar parámetros más conservadores.
                </InfoTip>
              </h3>
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">a</th>
                    <th className="px-2 py-1">b</th>
                    <th className="px-2 py-1 text-right">Sharpe IS</th>
                    <th className="px-2 py-1 text-right">Sharpe OOS</th>
                    <th className="px-2 py-1 text-right">PNL IS</th>
                    <th className="px-2 py-1 text-right">PNL OOS</th>
                  </tr>
                </thead>
                <tbody>
                  {result.top5.map((t, i) => (
                    <tr key={i} className="border-b border-border/10">
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1 font-semibold text-foreground">{t.a.toFixed(2)}</td>
                      <td className="px-2 py-1 font-semibold text-foreground">{t.b.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right text-success">
                        {t.sharpe_IS.toFixed(2)}
                      </td>
                      <td
                        className={`px-2 py-1 text-right ${t.sharpe_OOS > 0 ? "text-success" : "text-danger"}`}
                      >
                        {t.sharpe_OOS.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right text-success">
                        {t.pnl_IS >= 0 ? "+" : ""}
                        {t.pnl_IS.toFixed(2)}%
                      </td>
                      <td
                        className={`px-2 py-1 text-right ${t.pnl_OOS >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {t.pnl_OOS >= 0 ? "+" : ""}
                        {t.pnl_OOS.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Heatmap */}
            <div className="space-y-2">
              <h3 className="font-mono text-xs font-medium text-foreground">
                Heatmap
                <InfoTip>
                  Mapa de calor que muestra el rendimiento de cada combinación (a, b) según la
                  métrica seleccionada. El color más brillante = mejor rendimiento. La celda con
                  borde amarillo es la combinación óptima en IS.
                </InfoTip>
              </h3>
              <BacktestHeatmap
                grid={result.grid}
                optimalA={result.optimal.a}
                optimalB={result.optimal.b}
                metric={config.metric}
              />
            </div>

            {/* Equity curves */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="font-mono text-xs font-medium text-foreground">
                  Curva Equity
                  <InfoTip>
                    Muestra la evolución del capital acumulado a lo largo del tiempo. Una pendiente
                    positiva sostenida es señal de una estrategia consistente. Caídas pronunciadas
                    indican períodos de pérdida (drawdown).
                  </InfoTip>{" "}
                  — Out-of-Sample (a*={result.optimal.a.toFixed(2)}, b*=
                  {result.optimal.b.toFixed(2)})
                </h3>
                <PnLChart data={oosPnL.length > 0 ? oosPnL : [{ date: "", pnl: 0 }]} />
              </div>
              <div className="rounded-lg border border-border/40 p-4">
                <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Trades OOS
                  <InfoTip>
                    Operaciones ejecutadas en el período Out-of-Sample con los parámetros óptimos
                    (a*, b*). LONG = apuesta a que el spread se contrae (compra activo 1, vende
                    activo 2). P&L acumulado muestra la evolución del capital. Revisar si las
                    pérdidas se concentran en trades largos o cortos para entender el comportamiento
                    del par.
                  </InfoTip>
                </h3>
                <TradesTable
                  trades={result.oosResult?.trades ?? []}
                  asset1={shared.asset1}
                  asset2={shared.asset2}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
