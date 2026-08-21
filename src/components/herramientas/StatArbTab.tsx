// @ts-nocheck
import { useState } from "react";
import { PairsTradingPanel } from "./PairsTradingPanel";
import { BacktestingPanel } from "./BacktestingPanel";
import type { DataInterval } from "@/lib/statarb.types";

export interface SharedPairConfig {
  asset1: string;
  asset2: string;
  period: number;
  interval: DataInterval;
  window: number;
  entryThresh: number;
  stopThresh: number;
  capitalPerPair: number;
  txCost: number;
  // ─── Labadie: parámetros de ejecución óptima ───
  executionAlgo: "pairs" | "tc" | "is";
  pValue: number;
  marketImpactGamma: number;
  participationRate: number;
}

const DEFAULT_SHARED: SharedPairConfig = {
  asset1: "GGAL.BA",
  asset2: "BMA.BA",
  period: 365,
  interval: "1d",
  window: 20,
  entryThresh: 1.5,
  stopThresh: 2.5,
  capitalPerPair: 1,
  txCost: 0.1,
  executionAlgo: "pairs",
  pValue: 2,
  marketImpactGamma: 0.5,
  participationRate: 0.1,
};

export function StatArbTab() {
  const [subtab, setSubtab] = useState<"pairs" | "backtest">("pairs");
  const [shared, setShared] = useState<SharedPairConfig>(DEFAULT_SHARED);
  const [source, setSource] = useState<"yahoo" | "iol">("yahoo");
  const [iolMercado, setIolMercado] = useState("BCBA");

  const updateShared = <K extends keyof SharedPairConfig>(k: K, v: SharedPairConfig[K]) =>
    setShared((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 border-b border-border/40 pb-2">
        <button
          onClick={() => setSubtab("pairs")}
          className={`font-mono text-[11px] px-3 py-1.5 rounded-md border transition-colors ${
            subtab === "pairs"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          Pairs Trading
        </button>
        <button
          onClick={() => setSubtab("backtest")}
          className={`font-mono text-[11px] px-3 py-1.5 rounded-md border transition-colors ${
            subtab === "backtest"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          Backtesting
        </button>
      </div>

      {subtab === "pairs" ? (
        <PairsTradingPanel
          shared={shared}
          onUpdateShared={updateShared}
          source={source}
          onSourceChange={setSource}
          iolMercado={iolMercado}
          onIolMercadoChange={setIolMercado}
        />
      ) : (
        <BacktestingPanel
          shared={shared}
          onUpdateShared={updateShared}
          source={source}
          onSourceChange={setSource}
          iolMercado={iolMercado}
          onIolMercadoChange={setIolMercado}
        />
      )}
    </div>
  );
}
