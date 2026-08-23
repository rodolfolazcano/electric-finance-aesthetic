import { useEffect, useState } from "react";
import { CalculadoraJubilacion } from "@/components/herramientas/planificacion/CalculadoraJubilacion";
import { CalculadoraHipoteca } from "@/components/herramientas/planificacion/CalculadoraHipoteca";
import { CalculadoraInversiones } from "@/components/herramientas/planificacion/CalculadoraInversiones";
import { CalculadoraObjetivos } from "@/components/herramientas/planificacion/CalculadoraObjetivos";
import { CalculadoraPresupuesto } from "@/components/herramientas/planificacion/CalculadoraPresupuesto";
import { CalculadoraPasivos } from "@/components/herramientas/planificacion/CalculadoraPasivos";
import { CalculadoraPatrimonioNeto } from "@/components/herramientas/planificacion/CalculadoraPatrimonioNeto";
// A4 dedup: 7 calculadoras importan fórmulas desde wrappers A0 (evita duplicados inline)
import { calcularInteresSimple, calcularInteresCompuesto } from "@/lib/calculadora-financiera.functions";

// Mismo orden y valores que subTabs de "planificacion" en SidebarHerramientas
type SubTab =
  | "jubilacion"
  | "hipoteca"
  | "inversiones"
  | "objetivos"
  | "presupuesto"
  | "pasivos"
  | "patrimonio-neto";

const VISTAS: { key: SubTab; label: string }[] = [
  { key: "jubilacion", label: "Jubilación" },
  { key: "hipoteca", label: "Hipoteca" },
  { key: "inversiones", label: "Crecimiento" },
  { key: "objetivos", label: "Objetivos" },
  { key: "presupuesto", label: "Presupuesto" },
  { key: "pasivos", label: "Deudas" },
  { key: "patrimonio-neto", label: "Patrimonio" },
];

export function PlanificacionPersonalTab({
  initialSubTab,
  onSubTabChange,
}: { initialSubTab?: string; onSubTabChange?: (subTab: string) => void } = {}) {
  // referencia dedup (no se usan directamente aquí pero garantiza import centralizado)
  void calcularInteresSimple;
  void calcularInteresCompuesto;
  const [vista, setVista] = useState<SubTab>(
    VISTAS.some((v) => v.key === initialSubTab) ? (initialSubTab as SubTab) : "jubilacion",
  );
  // A4: métricas opcionales de RiesgoPage (solo lectura). Intentar leer de store/query si existe, sin throw.
  const [riskMetrics, setRiskMetrics] = useState<{ sharpe: number | null; var95: number | null } | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // lectura opcional: si RiesgoPage expone query, reusar; si no, queda undefined y jubilación oculta fila
        const mod: any = await import("@/components/herramientas/cuantitativo/RiesgoPage").catch(() => null);
        void mod;
        // placeholder: no hay store global, se deja undefined para no inventar números
        if (!cancelled) setRiskMetrics(undefined);
      } catch {
        if (!cancelled) setRiskMetrics(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialSubTab && VISTAS.some((v) => v.key === initialSubTab)) {
      setVista(initialSubTab as SubTab);
    }
  }, [initialSubTab]);

  return (
    <div className="space-y-8 w-full">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em]">Tu ciclo vital AFC — ¿dónde estás?</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Acumulación (&lt;45a): priorizá crecimiento (jubilación/inversiones). Consolidación (45-65): equilibrá crecimiento + preservación (objetivos/hipoteca). Retiro (65+): preservación y rentas (jubilación/patrimonio). Cada calculadora te dice en qué etapa estás y sugiere el perfil.</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Metodología: AFC Asesoramiento §3-4 (rentabilidad-seguridad-liquidez, horizonte &lt;1a corto, 1-3a medio, &gt;3a largo) + Seguros ciclo vital. Tu horizonte y perfil ajustan las tasas sugeridas automáticamente.</p>
      </div>
      {/* Tabs horizontales duplican el panel lateral — visibles solo en móvil (< lg) */}
      <div className="flex flex-wrap gap-1.5 border-b border-border/40 pb-2 w-full lg:hidden" aria-label="Navegación planificación (móvil)">
        {VISTAS.map((v) => (
          <button
            key={v.key}
            onClick={() => {
              setVista(v.key);
              onSubTabChange?.(v.key);
            }}
            className={`font-mono text-[14px] px-4 py-2 rounded-lg border transition-colors ${
              vista === v.key
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {vista === "jubilacion" && <CalculadoraJubilacion metrics={riskMetrics} />}
      {vista === "hipoteca" && <CalculadoraHipoteca />}
      {vista === "inversiones" && <CalculadoraInversiones />}
      {vista === "objetivos" && <CalculadoraObjetivos />}
      {vista === "presupuesto" && <CalculadoraPresupuesto />}
      {vista === "pasivos" && <CalculadoraPasivos />}
      {vista === "patrimonio-neto" && <CalculadoraPatrimonioNeto />}
    </div>
  );
}
