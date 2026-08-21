import { useState } from "react";
import { OptimizadorTabs } from "@/components/herramientas/cuantitativo/OptimizadorTabs";
import { RiesgoPage } from "@/components/herramientas/cuantitativo/RiesgoPage";
import { CapmTabs } from "@/components/herramientas/cuantitativo/CapmTabs";
import { HedgeTab } from "@/components/optimizer/HedgeTab";
import { StrategyClassificationTab } from "@/components/optimizer/StrategyClassificationTab";
import { StatArbTab } from "@/components/herramientas/StatArbTab";
import { EstimacionesTab } from "@/components/herramientas/EstimacionesTab";

type SubTab = "optimizador" | "riesgo" | "capm" | "cobertura" | "clasificacion" | "statarb" | "estimaciones";

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: "optimizador", label: "Optimizador" },
  { key: "riesgo", label: "Riesgo" },
  { key: "capm", label: "CAPM" },
  { key: "cobertura", label: "Cobertura" },
  { key: "clasificacion", label: "Clasificación" },
  { key: "statarb", label: "Stat-Arb" },
  { key: "estimaciones", label: "Estimaciones" },
];

export function CuantitativoTab() {
  const [sub, setSub] = useState<SubTab>("optimizador");

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div>
        <h2 className="font-display text-[clamp(1.6rem,2.5vw,2rem)] font-semibold tracking-tight">
          Análisis cuantitativo
        </h2>
        <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          Optimización de carteras (Markowitz, mínima varianza, máx. Sharpe), análisis de riesgo
          con distribuciones y regresiones CAPM sobre series reales de Yahoo Finance.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border/40 pb-2 w-full">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`font-mono text-[14px] px-4 py-2 rounded-md border transition-colors ${
              sub === t.key
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "optimizador" && <OptimizadorTabs />}
      {sub === "riesgo" && <RiesgoPage />}
      {sub === "capm" && <CapmTabs />}
      {sub === "cobertura" && <HedgeTab />}
      {sub === "clasificacion" && <StrategyClassificationTab />}
      {sub === "statarb" && <StatArbTab />}
      {sub === "estimaciones" && <EstimacionesTab />}
    </div>
  );
}
