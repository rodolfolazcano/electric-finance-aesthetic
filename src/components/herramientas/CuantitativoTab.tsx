import { useEffect, useState } from "react";
import { OptimizadorTabs } from "@/components/herramientas/cuantitativo/OptimizadorTabs";
import { RiesgoPage } from "@/components/herramientas/cuantitativo/RiesgoPage";
import { CapmTabs } from "@/components/herramientas/cuantitativo/CapmTabs";
import { HedgeTab } from "@/components/optimizer/HedgeTab";
import { StrategyClassificationTab } from "@/components/optimizer/StrategyClassificationTab";
import { StatArbTab } from "@/components/herramientas/StatArbTab";
import { LabadieTab } from "@/components/herramientas/labadie/LabadieTab";
import { EstimacionesTab } from "@/components/herramientas/EstimacionesTab";

type SubTab =
  "optimizador" | "riesgo" | "capm" | "cobertura" | "clasificacion" | "statarb" | "labadie" | "estimaciones";

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: "optimizador", label: "Optimizador" },
  { key: "riesgo", label: "Riesgo" },
  { key: "capm", label: "CAPM" },
  { key: "cobertura", label: "Cobertura" },
  { key: "clasificacion", label: "Clasificación" },
  { key: "statarb", label: "Stat Arb" },
  { key: "labadie", label: "Labadie" },
  { key: "estimaciones", label: "Estimaciones" },
];

export function CuantitativoTab({
  initialSubTab,
  onSubTabChange,
}: { initialSubTab?: string; onSubTabChange?: (subTab: string) => void } = {}) {
  const [sub, setSub] = useState<SubTab>(
    SUBTABS.some((t) => t.key === initialSubTab) ? (initialSubTab as SubTab) : "optimizador",
  );

  useEffect(() => {
    if (initialSubTab && SUBTABS.some((t) => t.key === initialSubTab)) {
      setSub(initialSubTab as SubTab);
    }
  }, [initialSubTab]);

  return (
    <div className="space-y-8 w-full">
      {/* Tabs horizontales duplican el panel lateral — visibles solo en móvil (< lg) */}
      <div className="flex flex-wrap gap-1.5 border-b border-border/40 pb-2 w-full lg:hidden" aria-label="Navegación cuantitativo (móvil)">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setSub(t.key);
              onSubTabChange?.(t.key);
            }}
            className={`font-mono text-[14px] px-4 py-2 rounded-lg border transition-colors ${
              sub === t.key
                ? "border-primary/60 bg-primary/10 text-primary"
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
      {sub === "labadie" && <LabadieTab />}
      {sub === "estimaciones" && <EstimacionesTab />}
    </div>
  );
}
