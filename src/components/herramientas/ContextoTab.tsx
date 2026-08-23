import { useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { Tabs } from "@/components/ui/tabs";
import { OportunidadesOrquestadasTab } from "@/components/herramientas/OportunidadesOrquestadasTab";
import { IntermarketPanel } from "@/components/herramientas/contexto/IntermarketPanel";
import { MacroArPanel } from "@/components/herramientas/contexto/MacroArPanel";
import { MicroPanel } from "@/components/herramientas/contexto/MicroPanel";
import { AperturaCierrePanel } from "@/components/herramientas/contexto/AperturaCierrePanel";
import { OportunidadesWrapper } from "@/components/herramientas/contexto/OportunidadesWrapper";

const VALID_SUBTABS = ["intermarket", "macro", "micro", "apertura", "cierre", "oportunidades"] as const;
type SubTab = typeof VALID_SUBTABS[number];

const LABELS: Record<SubTab, string> = {
  intermarket: "1·Intermarket",
  macro: "2·Macro AR",
  micro: "3·Micro",
  apertura: "4·Apertura",
  cierre: "4·Cierre",
  oportunidades: "5·Oportunidades",
};

function isValidSubTab(v: unknown): v is SubTab {
  return typeof v === "string" && (VALID_SUBTABS as readonly string[]).includes(v);
}

export function ContextoTab({ initialSubTab }: { initialSubTab?: string } = {}) {
  const search = (() => {
    try { return useSearch({ from: "/herramientas" }) as any; } catch { return {} as any; }
  })();
  const urlSubTab = isValidSubTab(search?.subTab) ? (search.subTab as SubTab) : undefined;
  const initial: SubTab = isValidSubTab(initialSubTab) ? (initialSubTab as SubTab) : urlSubTab ?? "intermarket";
  const [sub, setSub] = useState<SubTab>(initial);

  useEffect(() => {
    if (isValidSubTab(initialSubTab)) setSub(initialSubTab as SubTab);
    else if (urlSubTab) setSub(urlSubTab);
  }, [initialSubTab, urlSubTab]);

  return (
    <Tabs value={sub} onValueChange={(v) => setSub(v as SubTab)} className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Contexto:</span>
        {VALID_SUBTABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSub(k)}
            className={
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors " +
              (sub === k
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground")
            }
          >
            {LABELS[k]}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {sub === "intermarket" && <IntermarketPanel />}
        {sub === "macro" && <MacroArPanel />}
        {sub === "micro" && <MicroPanel />}
        {(sub === "apertura" || sub === "cierre") && <AperturaCierrePanel />}
        {sub === "oportunidades" && <OportunidadesWrapper />}
      </div>
    </Tabs>
  );
}

export const DEFAULT_SUBTAB: SubTab = "intermarket";
export { VALID_SUBTABS };
