import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Gauge,
  LineChart,
  Layers,
  PieChart,
  Landmark,
  Bitcoin,
  ArrowLeftRight,
  Calculator,
  Activity,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IOLLoginButton } from "@/components/shared/IOLLoginButton";
import { IOLProvider } from "@/lib/herramientas/iol-context";
import { ContextoTab } from "@/components/herramientas/ContextoTab";
import { AnalisisTab } from "@/components/herramientas/AnalisisTab";
import { CuantitativoTab } from "@/components/herramientas/CuantitativoTab";
import { SectoresTab } from "@/components/herramientas/SectoresTab";
import { PlaceholderTab } from "@/components/herramientas/PlaceholderTab";

export const Route = createFileRoute("/herramientas")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: { tab: string; subTab?: string; ticker?: string } = {
      tab: (search["tab"] as string) || "contexto",
    };
    if (search["subTab"]) out.subTab = String(search["subTab"]);
    if (search["ticker"]) out.ticker = String(search["ticker"]);
    return out;
  },
  head: () => ({
    meta: [
      { title: "Herramientas de análisis financiero | Cintia Boos" },
      {
        name: "description",
        content:
          "Contexto de mercado, análisis fundamental, optimización de carteras, riesgo, CAPM y análisis sectorial con datos en vivo.",
      },
    ],
  }),
  component: HerramientasPage,
});

const TABS = [
  { id: "contexto", label: "Contexto", icon: Gauge, tipo: "core" },
  { id: "analisis", label: "Análisis", icon: Activity, tipo: "core" },
  { id: "cuantitativo", label: "Cuantitativo", icon: LineChart, tipo: "core" },
  { id: "sectores", label: "Sectores", icon: Layers, tipo: "core" },
  { id: "opciones", label: "Opciones", icon: PieChart, tipo: "proximamente" },
  { id: "renta-fija", label: "Renta Fija", icon: Landmark, tipo: "proximamente" },
  { id: "cripto", label: "Cripto", icon: Bitcoin, tipo: "proximamente" },
  { id: "arbitrador", label: "Arbitrador", icon: ArrowLeftRight, tipo: "proximamente" },
  { id: "planificacion", label: "Planificación", icon: Calculator, tipo: "proximamente" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function HerramientasPage() {
  return (
    <IOLProvider>
      <HerramientasContenido />
    </IOLProvider>
  );
}

function HerramientasContenido() {
  const { tab } = Route.useSearch();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const activo = (TABS.some((t) => t.id === tab) ? tab : "contexto") as TabId;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Menú de herramientas"
          >
            {menuAbierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Inicio</span>
          </Link>
          <div className="h-5 w-px bg-border" />
          <h1 className="font-mono text-sm font-semibold tracking-widest uppercase text-foreground">
            Herramientas
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <IOLLoginButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6">
        {/* Sidebar desktop */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const esActivo = t.id === activo;
              return (
                <Link
                  key={t.id}
                  to="/herramientas"
                  search={{ tab: t.id }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    esActivo
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{t.label}</span>
                  {t.tipo === "proximamente" && (
                    <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
                      pronto
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Tabs mobile */}
        {menuAbierto && (
          <nav className="fixed inset-x-4 top-16 z-50 space-y-1 rounded-xl border border-border bg-card p-2 shadow-xl lg:hidden">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.id}
                  to="/herramientas"
                  search={{ tab: t.id }}
                  onClick={() => setMenuAbierto(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                    t.id === activo
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Contenido */}
        <main className="min-w-0 flex-1">
          {activo === "contexto" && <ContextoTab />}
          {activo === "analisis" && <AnalisisTab />}
          {activo === "cuantitativo" && <CuantitativoTab />}
          {activo === "sectores" && <SectoresTab />}
          {activo === "opciones" && (
            <PlaceholderTab
              titulo="Opciones"
              descripcion="Cadena de opciones BCBA con pricing Black-Scholes, griegas y volatilidad implícita."
            />
          )}
          {activo === "renta-fija" && (
            <PlaceholderTab
              titulo="Renta Fija"
              descripcion="Bonos soberanos, ONs, LECAPs y FCIs con TIR, paridad y duración vía IOL."
            />
          )}
          {activo === "cripto" && (
            <PlaceholderTab
              titulo="Cripto"
              descripcion="Panel cripto con precios multi-exchange y métricas de mercado."
            />
          )}
          {activo === "arbitrador" && (
            <PlaceholderTab
              titulo="Arbitrador ADR / CEDEAR"
              descripcion="Brecha entre NYSE y BCBA actualizada cada 30 segundos."
            />
          )}
          {activo === "planificacion" && (
            <PlaceholderTab
              titulo="Planificación Financiera"
              descripcion="Calculadoras de jubilación, hipoteca, inversiones, objetivos, presupuesto, pasivos y patrimonio neto."
            />
          )}
        </main>
      </div>
    </div>
  );
}
