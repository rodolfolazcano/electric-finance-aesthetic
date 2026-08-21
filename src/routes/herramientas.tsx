import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
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
  Phone,
  Sigma,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IOLLoginButton } from "@/components/shared/IOLLoginButton";
import { IOLProvider } from "@/lib/herramientas/iol-context";
import { ContextoTab } from "@/components/herramientas/ContextoTab";
import { AnalisisTab } from "@/components/herramientas/AnalisisTab";
import { CuantitativoTab } from "@/components/herramientas/CuantitativoTab";
import { SectoresTab } from "@/components/herramientas/SectoresTab";
import { RazonesFinancierasTab } from "@/components/herramientas/RazonesFinancierasTab";
import { EstimacionesTab } from "@/components/herramientas/EstimacionesTab";
import { PlanificacionFinancieraTab } from "@/components/herramientas/PlanificacionFinancieraTab";
import { PlaceholderTab } from "@/components/herramientas/PlaceholderTab";
import { ArbitrajeP2PPanel } from "@/components/herramientas/ArbitrajeP2PPanel";
import bgImage from "@/assets/bg-skyline.jpg";
import retratoCintia from "@/assets/cintia-boos.png";

const WHATSAPP =
  "https://wa.me/541162355944?text=Hola%20Cintia%2C%20quiero%20asesoramiento%20sobre%20inversiones";

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
  { id: "razones", label: "Razones + DuPont", icon: Sigma, tipo: "core" },
  { id: "cuantitativo", label: "Cuantitativo", icon: LineChart, tipo: "core" },
  { id: "estimaciones", label: "Estimaciones", icon: Target, tipo: "core" },
  { id: "sectores", label: "Sectores", icon: Layers, tipo: "core" },
  { id: "planificacion", label: "Planificación", icon: Calculator, tipo: "core" },
  { id: "opciones", label: "Opciones", icon: PieChart, tipo: "proximamente" },
  { id: "renta-fija", label: "Renta Fija", icon: Landmark, tipo: "proximamente" },
  { id: "cripto", label: "Cripto", icon: Bitcoin, tipo: "proximamente" },
  { id: "arbitrador", label: "Arbitrador", icon: ArrowLeftRight, tipo: "proximamente" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CONTAINER = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";

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
  const [scrolled, setScrolled] = useState(false);
  const activo = (TABS.some((t) => t.id === tab) ? tab : "contexto") as TabId;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen text-foreground">
      {/* ============ FONDO GLOBAL (idéntico al inicio) ============ */}
      <div aria-hidden className="fixed inset-0 -z-10">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(56rem 34rem at 82% 8%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 62%), radial-gradient(46rem 30rem at -5% 92%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 60%), linear-gradient(180deg, rgba(6,9,18,0.72) 0%, rgba(6,9,18,0.45) 45%, rgba(6,9,18,0.62) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(56rem 34rem at 82% 8%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 62%)",
          }}
        />
      </div>

      {/* ============ HEADER (mismo diseño que el inicio) ============ */}
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
          scrolled || menuAbierto
            ? "border-b border-border/60 bg-background/55 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div
          className={`${CONTAINER} flex items-center justify-between gap-4 py-4 transition-all ${
            scrolled ? "py-3" : ""
          }`}
        >
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/" className="flex shrink-0 items-center gap-2.5">
              <span className="h-9 w-9 overflow-hidden rounded-full border border-primary/40">
                <img src={retratoCintia} alt="Cintia Boos" className="h-full w-full object-cover" />
              </span>
              <span className="font-display text-[17px] font-semibold leading-none">
                Cintia <em className="italic text-primary">Boos</em>
              </span>
            </Link>
            <div aria-hidden className="hidden h-5 w-px bg-border/60 sm:block" />
            <p className="hidden items-center gap-2 eyebrow sm:flex">Herramientas</p>
          </div>

          <div className="flex items-center gap-2">
            <IOLLoginButton />
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:inline-flex"
            >
              Consultar por WhatsApp
            </a>
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Consultar por WhatsApp"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 md:hidden"
            >
              <Phone className="h-4 w-4" />
            </a>
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuAbierto}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground lg:hidden"
            >
              {menuAbierto ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {menuAbierto && (
          <nav className="border-t border-border/60 bg-background/70 px-5 pb-6 pt-3 backdrop-blur-xl lg:hidden">
            <ul className="flex flex-col">
              {TABS.map((t) => (
                <li key={t.id}>
                  <Link
                    to="/herramientas"
                    search={{ tab: t.id }}
                    onClick={() => setMenuAbierto(false)}
                    className={`flex items-center gap-3 py-3 text-[13px] uppercase tracking-[0.16em] transition-colors ${
                      t.id === activo ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <t.icon className="h-4 w-4 flex-none" />
                    {t.label}
                    {t.tipo === "proximamente" && (
                      <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-gold">
                        PRONTO
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {/* ============ INTRODUCCIÓN ============ */}
      <div className={`${CONTAINER} pt-28 pb-8`}>
        <p className="eyebrow">Panel de análisis financiero</p>
        <h1 className="mt-4 max-w-3xl font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight chrome-text">
          Probá el panel de análisis financiero
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground lg:text-[17px]">
          Datos en vivo de Yahoo Finance, IOL, BCRA, ArgentinaDatos y CriptoYa. Si opera con
          InvertirOnline, inicie sesión desde el botón «IOL» para analizar{" "}
          <em className="text-foreground/90">su</em> portafolio real.
        </p>
        <div aria-hidden className="electric-line mt-8 max-w-2xl" />
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] gap-6 px-5 pb-16 sm:px-8 lg:px-12">
        {/* Sidebar desktop */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-1.5">
            {TABS.map((t) => {
              const esActivo = t.id === activo;
              return (
                <Link
                  key={t.id}
                  to="/herramientas"
                  search={{ tab: t.id }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 text-[13px] transition-colors",
                    esActivo
                      ? "border-primary/40 bg-primary/[0.07] font-semibold text-primary"
                      : "border-border/70 bg-secondary/20 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <t.icon className="h-4 w-4 flex-none" />
                  <span className="flex-1">{t.label}</span>
                  {t.tipo === "proximamente" && (
                    <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-gold ring-1 ring-gold/30">
                      pronto
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Contenido */}
        <main className="min-w-0 flex-1">
          {activo === "contexto" && <ContextoTab />}
          {activo === "analisis" && <AnalisisTab />}
          {activo === "razones" && <RazonesFinancierasTab />}
          {activo === "cuantitativo" && <CuantitativoTab />}
          {activo === "estimaciones" && <EstimacionesTab />}
          {activo === "sectores" && <SectoresTab />}
          {activo === "planificacion" && <PlanificacionFinancieraTab />}
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
          {activo === "arbitrador" && <ArbitrajeP2PPanel />}

          <p className="mt-8 text-[11px] leading-snug text-muted-foreground">
            Herramientas informativas con datos de terceros. No constituyen recomendación de
            inversión.
          </p>
        </main>
      </div>
    </div>
  );
}
