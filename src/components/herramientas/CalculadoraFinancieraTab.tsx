import { useEffect, useState } from "react";
import { ArrowLeftRight, Calculator, PiggyBank, TrendingUp } from "lucide-react";
import { ComparadorInversiones } from "./simuladores/ComparadorInversiones";
import { PlanificadorFinanciero } from "./simuladores/PlanificadorFinanciero";
import { SimuladorChat } from "./simuladores/chat/SimuladorChat";
import { Drawer, DrawerContent, DrawerTrigger, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { MessageCircle } from "lucide-react";

export type SubTabCalculadora = "catalog" | "comparador" | "planificador";

/** legacy → nuevo (deep-links viejos siguen funcionando) */
function normalizeSubTab(raw?: string): SubTabCalculadora {
  if (raw === "comparador" || raw === "planificador") return raw;
  if (raw === "catalog") return "catalog";
  // todo lo viejo de colocaciones/inflación/tasas → comparador
  const toComparador = new Set([
    "plazo-fijo", "plazo-fijo-uva", "fci", "lecap-caucion", "compuesta", "tasas", "inflacion-uva", "porcentajes", "fechas", "estadistica", "cft",
  ]);
  // todo lo de ahorro/cuota/van/bono/capacidad → planificador
  const toPlanificador = new Set([
    "cuota", "capacidad-cuota", "objetivo-ahorro", "van-tir", "bono",
    "mi-plan", "jubilacion", "hipoteca", "inversiones", "objetivos", "presupuesto", "pasivos", "patrimonio-neto",
  ]);
  if (raw && toComparador.has(raw)) return "comparador";
  if (raw && toPlanificador.has(raw)) return "planificador";
  return "catalog";
}

export const VALID_SUBTABS: SubTabCalculadora[] = ["comparador", "planificador"];

type Card = { id: SubTabCalculadora; label: string; desc: string; longDesc: string; icon: any; accent: string };
const CARDS: Card[] = [
  {
    id: "comparador",
    label: "¿Dónde invierto?",
    desc: "Comparador todo-en-uno de colocaciones",
    longDesc: "Plazo fijo · UVA/CER · FCI Money Market · LECAP/Caución. Tasas vivas, evolución compuesta, barras comparativas, ranking y tasa real Fisher. Cambiá de visualización sin perder los inputs.",
    icon: ArrowLeftRight,
    accent: "from-primary/20 to-primary/5",
  },
  {
    id: "planificador",
    label: "Mi plan financiero",
    desc: "Metas, retiro y flujo de fondos",
    longDesc: "Con cuotas (aportes periódicos) o sin cuotas (aporte único). Meta de ahorro → cuota necesaria o fecha de llegada. Jubilación en 2 etapas. Proyecto con VAN/TIR. Flujo mes a mes y análisis de sensibilidad.",
    icon: PiggyBank,
    accent: "from-emerald-500/20 to-emerald-500/5",
  },
];

export function CalculadoraFinancieraTab({ initialSubTab }: { initialSubTab?: string } = {}) {
  const [subTab, setSubTab] = useState<SubTabCalculadora>(() => normalizeSubTab(initialSubTab));

  useEffect(() => {
    if (initialSubTab) setSubTab(normalizeSubTab(initialSubTab));
  }, [initialSubTab]);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ subTab: string }>).detail;
      if (d?.subTab && VALID_SUBTABS.includes(d.subTab as any)) setSubTab(d.subTab as SubTabCalculadora);
    };
    window.addEventListener("simulador:changeSubTab", h as any);
    return () => window.removeEventListener("simulador:changeSubTab", h as any);
  }, []);

  if (subTab === "catalog") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Simuladores</h2>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            Dos herramientas potentes en lugar de 24 calculadoras sueltas. Comparás colocaciones con gráficos y tablas, y planificás tu flujo de fondos con o sin cuotas.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {CARDS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSubTab(c.id)}
              className="group text-left rounded-2xl border border-border/40 bg-card p-6 hover:border-primary/40 hover:bg-primary/[0.04] transition-all"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${c.accent} border border-border/30`}>
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold">{c.label}</h3>
              <p className="text-xs font-medium text-primary">{c.desc}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.longDesc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-1.5 transition-all">
                Abrir <TrendingUp className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 p-4 flex items-start gap-3">
          <Calculator className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Links viejos siguen funcionando: <span className="font-mono">?tab=calculadora&subTab=plazo-fijo</span> → Comparador, <span className="font-mono">?tab=calculadora&subTab=jubilacion</span> → Planificador.
            El tab <b>Planificación</b> ahora redirige acá.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => setSubTab("catalog")}
          className="rounded-full border border-border/40 bg-card px-3.5 py-1.5 text-xs font-medium hover:bg-muted/40"
        >
          ← Simuladores
        </button>
        <div className="flex items-center gap-1 rounded-full border border-border/30 bg-muted/20 p-1">
          {CARDS.map((c) => (
            <button
              key={c.id}
              onClick={() => setSubTab(c.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${subTab === c.id ? "bg-card border border-border/40 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="min-w-0">
          {subTab === "comparador" && <ComparadorInversiones />}
          {subTab === "planificador" && <PlanificadorFinanciero />}
        </div>
        <div className="hidden xl:block">
          <SimuladorChat subTab={subTab} />
        </div>
      </div>
      <div className="xl:hidden">
        <Drawer>
          <DrawerTrigger asChild>
            <button className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <MessageCircle className="h-5 w-5" />
            </button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[78vh]">
            <DrawerHeader className="pb-2"><DrawerTitle className="text-xs uppercase tracking-widest">Asistente · Simuladores</DrawerTitle></DrawerHeader>
            <div className="px-4 pb-6 overflow-auto"><SimuladorChat subTab={subTab} /></div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}
