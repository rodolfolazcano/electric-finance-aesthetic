import { StatArbTab } from "@/components/herramientas/StatArbTab";
import { MicrostructurePanel } from "./MicrostructurePanel";

/**
 * LabadiéTab — wrapper canónico sobre StatArbTab.
 * Reutiliza 100% de la UI existente (PairsTradingPanel + BacktestingPanel) sin duplicar.
 * Expone el índice canónico src/lib/labadie/ y panels didácticos Hurst/Microstructure/Spectral.
 */
export function LabadieTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="font-display text-lg font-semibold">Labadié — Statistical Arbitrage & Microstructure</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Framework: 5 Principios + 5 Stages Backtesting + Microestructura Kyle/Glosten-Milgrom + p=1/H (1205.3482v6) + Spectral PCA.
          Fuente: <code className="font-mono text-xs">pt/labadie/labadie/</code> · Motor: <code className="font-mono text-xs">src/lib/labadie/</code> (re-exporta <code className="font-mono text-xs">statarb.math + math/stats + capm-engine</code>)
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Pairs + Backtest reutilizan <code>StatArbTab</code> sin duplicar. Hurst (filtro semáforo) y Microestructura ya activos; Walk-forward y Spectral en <code>src/lib/labadie/validation.ts</code> para próxima iteración.
        </p>
      </div>
      <MicrostructurePanel />
      <StatArbTab />
    </div>
  );
}
