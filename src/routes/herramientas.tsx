import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LineChart,
  Layers,
  Landmark,
  Bitcoin,
  ArrowLeftRight,
  Calculator,
  Activity,
  CalendarCheck,
  Percent,
  Compass,
  Menu,
  X,
  Phone,
  Briefcase,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IOLLoginButton } from "@/components/shared/IOLLoginButton";
import { useIOLSession } from "@/lib/herramientas/iol-context";
import { AnalisisTab } from "@/components/herramientas/AnalisisTab";
import { CuantitativoTab } from "@/components/herramientas/CuantitativoTab";
import { SectoresTab } from "@/components/herramientas/SectoresTab";
import { PlanificacionPersonalTab } from "@/components/herramientas/PlanificacionPersonalTab";
import { CalculadoraFinancieraTab } from "@/components/herramientas/CalculadoraFinancieraTab";
import { CriptoTab } from "@/components/herramientas/CriptoTab";
import { ArbitrajeP2PPanel } from "@/components/herramientas/ArbitrajeP2PPanel";
import { OptionsPanel } from "@/components/options/OptionsPanel";
import { PortfolioComposition } from "@/components/optimizer/PortfolioComposition";
import { RentaFijaPanel } from "@/components/sections/RentaFijaPanel";
import { SidebarHerramientas } from "@/components/herramientas/SidebarHerramientas";
import { ContextoTab } from "@/components/herramientas/ContextoTab";
import bgImage from "@/assets/bg-skyline.jpg";
import retratoCintia from "@/assets/cintia-boos.png";

const WHATSAPP =
  "https://wa.me/541162355944?text=Hola%20Cintia%2C%20quiero%20asesoramiento%20sobre%20inversiones";

export const Route = createFileRoute("/herramientas")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: { tab: string; subTab?: string; ticker?: string } = {
      tab: (search["tab"] as string) || "analisis",
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
          "Análisis fundamental y técnico, optimización de carteras, riesgo, CAPM, renta fija, opciones y análisis sectorial con datos en vivo.",
      },
    ],
  }),
  component: HerramientasPage,
});

// Mismo orden que SIDEBAR_GROUPS en SidebarHerramientas (única fuente de verdad del orden)
const TABS = [
  { id: "sectores", label: "Sectores", icon: Layers, tipo: "core" },
  { id: "analisis", label: "Análisis", icon: Activity, tipo: "core" },
  { id: "cuantitativo", label: "Cuantitativo", icon: LineChart, tipo: "core" },
  { id: "portafolio", label: "Portafolio", icon: Briefcase, tipo: "core" },
  { id: "renta-fija", label: "Renta Fija", icon: Landmark, tipo: "core" },
  { id: "opciones", label: "Opciones", icon: Percent, tipo: "core" },
  { id: "arbitrador", label: "Arbitrador", icon: ArrowLeftRight, tipo: "core" },
  { id: "cripto", label: "Cripto", icon: Bitcoin, tipo: "core" },
  { id: "calculadora", label: "Calculadora", icon: Calculator, tipo: "core" },
  { id: "planificacion", label: "Planificación", icon: CalendarCheck, tipo: "core" },
  { id: "contexto", label: "Contexto", icon: Compass, tipo: "core" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CONTAINER = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";
const HOME_NAV = [
  { label: "Inicio", href: "/#inicio" },
  { label: "Perfil", href: "/#test-inversor" },
  { label: "Herramientas", href: "/#herramientas" },
  { label: "Instrumentos", href: "/#instrumentos" },
  { label: "Brokers", href: "/#brokers" },
  { label: "Preguntas", href: "/#preguntas" },
];

function HerramientasPage() {
  return <HerramientasContenido />;
}

function HerramientasContenido() {
  const { tab, subTab, ticker } = Route.useSearch();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const iol = useIOLSession();
  const [railState, setRailState] = useState({
    isVisible: true,
    isExpanded: true,
    isMobile: false,
  });
  const activo = (TABS.some((t) => t.id === tab) ? tab : "analisis") as TabId;

  const setTab = (newTab: string) => navigate({ to: "/herramientas", search: { tab: newTab } });
  const setSubTab = (newSub: string) =>
    navigate({ to: "/herramientas", search: { tab: activo, subTab: newSub } });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen text-foreground">
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
      </div>

      {/* HEADER - mantiene menú original electric + back/forward + navegación a Inicio */}
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
          scrolled || menuAbierto
            ? "border-b border-border/60 bg-background/55 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className={`${CONTAINER} flex items-center justify-between gap-3 py-3`}>
          <div className="flex min-w-0 items-center gap-2">
            {/* Back / Forward */}
            <div className="hidden sm:flex items-center gap-1 mr-1">
              <button
                onClick={() => window.history.back()}
                aria-label="Atrás"
                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border/40 hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => window.history.forward()}
                aria-label="Adelante"
                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border/40 hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Link to="/" className="flex shrink-0 items-center gap-2.5">
              <span className="h-9 w-9 overflow-hidden rounded-full border border-primary/40">
                <img src={retratoCintia} alt="Cintia Boos" className="h-full w-full object-cover" />
              </span>
              <span className="font-display text-[17px] font-semibold leading-none">
                Cintia <em className="italic text-primary">Boos</em>
              </span>
            </Link>
            <div aria-hidden className="hidden h-5 w-px bg-border/60 md:block" />
            <nav className="hidden items-center gap-8 md:flex" aria-label="Navegación Inicio">
              {HOME_NAV.map((n) => (
                <a
                  key={n.label}
                  href={n.href}
                  className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {n.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 mr-1">
              <span className="hidden lg:inline text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
                Herramientas
              </span>
              <span className="h-4 w-px bg-border/40 hidden lg:block" />
            </div>
            <IOLLoginButton />
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary/90 md:inline-flex"
            >
              WhatsApp
            </a>
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground md:hidden"
            >
              <Phone className="h-4 w-4" />
            </a>
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuAbierto}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground lg:hidden"
            >
              {menuAbierto ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {menuAbierto && (
          <nav className="border-t border-border/60 bg-background/70 px-5 pb-6 pt-3 backdrop-blur-xl lg:hidden">
            <div className="flex gap-1 mb-3">
              <button
                onClick={() => window.history.back()}
                className="flex-1 h-9 rounded-full border border-border text-[14px]"
              >
                ← Atrás
              </button>
              <button
                onClick={() => window.history.forward()}
                className="flex-1 h-9 rounded-full border border-border text-[14px]"
              >
                Adelante →
              </button>
            </div>
            <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
              Inicio
            </p>
            <ul className="flex flex-col mb-4">
              {HOME_NAV.map((n) => (
                <li key={n.label}>
                  <a
                    href={n.href}
                    onClick={() => setMenuAbierto(false)}
                    className="block py-2.5 text-[13px] uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
              Herramientas
            </p>
            <ul className="flex flex-col">
              {TABS.map((t) => (
                <li key={t.id}>
                  <Link
                    to="/herramientas"
                    search={{ tab: t.id }}
                    onClick={() => setMenuAbierto(false)}
                    className={`flex items-center gap-3 py-2.5 text-[13px] uppercase tracking-[0.14em] ${t.id === activo ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {/* Sidebar auto-hide como Clarity */}
      <SidebarHerramientas
        activeTab={activo}
        activeSubTab={subTab}
        onTabChange={setTab}
        onSubTabChange={setSubTab}
        onRailStateChange={setRailState}
      />

      {/* Contenido - ocupa todo el ancho y más arriba */}
      <div
        className={cn(
          "transition-all duration-200",
          !railState.isMobile &&
            railState.isVisible &&
            (railState.isExpanded ? "ml-[252px]" : "ml-[64px]"),
          railState.isMobile && "ml-0",
        )}
      >
        <div className={`${CONTAINER} pt-20 pb-4`}>
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                Panel de análisis financiero
              </p>
              <p className="mt-1 max-w-2xl text-[12px] leading-snug text-muted-foreground/80">
                Datos en vivo de Yahoo Finance, IOL, BCRA, ArgentinaDatos y CriptoYa. Si opera con
                InvertirOnline, inicie sesión desde el botón IOL arriba a la derecha para analizar
                su portafolio real.
              </p>
            </div>
          </div>
        </div>

        <div className={`${CONTAINER} pb-16`}>
          <main className="min-w-0 flex-1 w-full">
            {activo === "analisis" && <AnalisisTab tickerInicial={ticker} />}
            {activo === "sectores" && <SectoresTab initialTab={subTab} />}
            {activo === "cuantitativo" && <CuantitativoTab initialSubTab={subTab} />}
            {activo === "portafolio" && <PortfolioComposition />}
            {activo === "renta-fija" && (
              <RentaFijaPanel
                accessToken={iol.accessToken}
                refreshToken={iol.refreshToken}
                onTokenRefresh={iol.updateTokens}
              />
            )}
            {activo === "opciones" && <OptionsPanel />}
            {activo === "arbitrador" && <ArbitrajeP2PPanel />}
            {activo === "cripto" && <CriptoTab />}
            {activo === "calculadora" && <CalculadoraFinancieraTab />}
            {activo === "planificacion" && <PlanificacionPersonalTab initialSubTab={subTab} />}
            {activo === "contexto" && <ContextoTab initialSubTab={subTab} />}
            <p className="mt-8 text-[14px] leading-snug text-muted-foreground border-t border-border/20 pt-4">
              Herramientas informativas con datos de terceros. No constituyen recomendación de
              inversión. Fuentes: BYMA · IOL · Yahoo Finance · BCRA · Delay 15-20’
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
