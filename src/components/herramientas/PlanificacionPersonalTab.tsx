import { useEffect, useState } from "react";
import { CalculadoraJubilacion } from "@/components/herramientas/planificacion/CalculadoraJubilacion";
import { CalculadoraHipoteca } from "@/components/herramientas/planificacion/CalculadoraHipoteca";
import { CalculadoraInversiones } from "@/components/herramientas/planificacion/CalculadoraInversiones";
import { CalculadoraObjetivos } from "@/components/herramientas/planificacion/CalculadoraObjetivos";
import { CalculadoraPresupuesto } from "@/components/herramientas/planificacion/CalculadoraPresupuesto";
import { CalculadoraPasivos } from "@/components/herramientas/planificacion/CalculadoraPasivos";
import { CalculadoraPatrimonioNeto } from "@/components/herramientas/planificacion/CalculadoraPatrimonioNeto";

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

export function PlanificacionPersonalTab({ initialSubTab }: { initialSubTab?: string } = {}) {
  const [vista, setVista] = useState<SubTab>(
    VISTAS.some((v) => v.key === initialSubTab) ? (initialSubTab as SubTab) : "jubilacion",
  );

  useEffect(() => {
    if (initialSubTab && VISTAS.some((v) => v.key === initialSubTab)) {
      setVista(initialSubTab as SubTab);
    }
  }, [initialSubTab]);

  return (
    <div className="space-y-8 w-full">
      <div>
        <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight">
          Planificación financiera personal
        </h2>
        <p className="mt-1 max-w-3xl text-[17px] leading-relaxed text-muted-foreground lg:text-[19px]">
          Calculadoras de jubilación, hipoteca, crecimiento, objetivos, presupuesto, deudas y
          patrimonio neto para planificar sus finanzas personales.
        </p>
        <div aria-hidden className="electric-line mt-6 max-w-3xl" />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border/40 pb-2 w-full">
        {VISTAS.map((v) => (
          <button
            key={v.key}
            onClick={() => setVista(v.key)}
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

      {vista === "jubilacion" && <CalculadoraJubilacion />}
      {vista === "hipoteca" && <CalculadoraHipoteca />}
      {vista === "inversiones" && <CalculadoraInversiones />}
      {vista === "objetivos" && <CalculadoraObjetivos />}
      {vista === "presupuesto" && <CalculadoraPresupuesto />}
      {vista === "pasivos" && <CalculadoraPasivos />}
      {vista === "patrimonio-neto" && <CalculadoraPatrimonioNeto />}
    </div>
  );
}
