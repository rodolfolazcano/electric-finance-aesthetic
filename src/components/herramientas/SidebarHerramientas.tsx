// @ts-nocheck
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Sparkles,
  ArrowLeftRight,
  Building2,
  Layers,
  Calculator,
  Briefcase,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface SubTab {
  value: string;
  label: string;
}

interface SidebarItem {
  value: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  subTabs?: SubTab[];
}

interface SidebarGroup {
  id: string;
  title: string;
  items: SidebarItem[];
}

// Reorden coherente por flujo de inversión: Mercado -> Análisis -> Instrumentos -> Cliente
const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "mercado",
    title: "MERCADO",
    items: [
      {
        value: "sectores",
        label: "01 · Sectores",
        icon: Building2,
        shortLabel: "Sectores",
        subTabs: [
          { value: "panel", label: "Panel" },
          { value: "matriz", label: "Matriz" },
          { value: "valuacion", label: "Valuación" },
          { value: "oportunidades", label: "Oportunidades" },
          { value: "benchmarks", label: "Benchmarks" },
          { value: "etf-fit", label: "ETF Fit" },
          { value: "performance", label: "Performance" },
          { value: "intermarket", label: "Intermarket" },
        ],
      },
    ],
  },
  {
    id: "analisis",
    title: "ANÁLISIS",
    items: [
      {
        value: "analisis",
        label: "02 · Análisis",
        shortLabel: "Análisis",
        icon: TrendingUp,
        subTabs: [
          { value: "tecnico", label: "Técnico" },
          { value: "fundamental", label: "Fundamental" },
        ],
      },
      {
        value: "cuantitativo",
        label: "03 · Cuantitativo",
        shortLabel: "Cuantitativo",
        icon: Layers,
        subTabs: [
          { value: "optimizador", label: "Optimizador" },
          { value: "riesgo", label: "Riesgo" },
          { value: "capm", label: "CAPM" },
          { value: "cobertura", label: "Cobertura" },
          { value: "clasificacion", label: "Clasificación" },
          { value: "statarb", label: "Stat Arb" },
          { value: "estimaciones", label: "Estimaciones" },
        ],
      },
      { value: "portafolio", label: "04 · Portafolio", shortLabel: "Portafolio", icon: Briefcase },
    ],
  },
  {
    id: "instrumentos",
    title: "INSTRUMENTOS",
    items: [
      { value: "renta-fija", label: "05 · Renta Fija", shortLabel: "Renta Fija", icon: BarChart3 },
      { value: "opciones", label: "06 · Opciones", shortLabel: "Opciones", icon: TrendingUp },
      { value: "arbitrador", label: "07 · Arbitrador", shortLabel: "Arbitrador", icon: ArrowLeftRight },
      { value: "cripto", label: "08 · Cripto", shortLabel: "Cripto", icon: Sparkles },
    ],
  },
  {
    id: "cliente",
    title: "CLIENTE",
    items: [
      {
        value: "planificacion",
        label: "09 · Planificación",
        shortLabel: "Planificación",
        icon: Calculator,
        subTabs: [
          { value: "jubilacion", label: "Jubilación" },
          { value: "hipoteca", label: "Hipoteca" },
          { value: "inversiones", label: "Crecimiento" },
          { value: "objetivos", label: "Objetivos" },
          { value: "presupuesto", label: "Presupuesto" },
          { value: "pasivos", label: "Deudas" },
          { value: "patrimonio-neto", label: "Patrimonio" },
        ],
      },
    ],
  },
];

const FLAT_ITEMS: SidebarItem[] = SIDEBAR_GROUPS.flatMap((g) => g.items);

interface SidebarHerramientasProps {
  activeTab: string;
  activeSubTab?: string;
  onTabChange: (tab: string) => void;
  onSubTabChange: (subTab: string) => void;
  onRailStateChange?: (state: { isVisible: boolean; isExpanded: boolean; isMobile: boolean }) => void;
}

export function SidebarHerramientas({
  activeTab,
  activeSubTab,
  onTabChange,
  onSubTabChange,
  onRailStateChange,
}: SidebarHerramientasProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const detectionZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-hide como en Clarity — se oculta tras 2.8s de inactividad, reaparece al acercar mouse al borde
  useEffect(() => {
    if (isMobile) return;
    const startInactivityTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => setIsVisible(false), 2800);
    };
    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      setIsVisible(true);
      startInactivityTimer();
    };
    const handleMouseEnter = () => resetInactivityTimer();
    const handleMouseMove = () => resetInactivityTimer();
    const handleMouseLeave = () => startInactivityTimer();
    const handleContentInteraction = () => startInactivityTimer();
    const rail = railRef.current;
    if (rail) {
      rail.addEventListener("mouseenter", handleMouseEnter);
      rail.addEventListener("mousemove", handleMouseMove);
      rail.addEventListener("mouseleave", handleMouseLeave);
    }
    document.addEventListener("scroll", handleContentInteraction);
    document.addEventListener("click", handleContentInteraction);
    startInactivityTimer();
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (rail) {
        rail.removeEventListener("mouseenter", handleMouseEnter);
        rail.removeEventListener("mousemove", handleMouseMove);
        rail.removeEventListener("mouseleave", handleMouseLeave);
      }
      document.removeEventListener("scroll", handleContentInteraction);
      document.removeEventListener("click", handleContentInteraction);
    };
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX < 16 && !isVisible) setIsVisible(true);
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [isVisible, isMobile]);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const rail = railRef.current;
      if (rail && rail.contains(e.target as Node) && !isVisible) setIsVisible(true);
    };
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [isVisible]);

  useEffect(() => {
    if (onRailStateChange) onRailStateChange({ isVisible, isExpanded, isMobile });
  }, [isVisible, isExpanded, isMobile, onRailStateChange]);

  const handleTabClick = (tabValue: string) => {
    onTabChange(tabValue);
    if (!isMobile) setIsExpanded(true);
    else setIsMobileOpen(false);
  };

  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setIsMobileOpen(true)}
          className="fixed top-20 left-4 z-50 p-2.5 rounded-xl bg-background/90 backdrop-blur border border-border/60 shadow-lg"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        {isMobileOpen && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />}
        <div className={cn("fixed top-0 left-0 z-50 h-full w-80 bg-background border-r border-border/60 shadow-xl transition-transform duration-300", isMobileOpen ? "translate-x-0" : "-translate-x-full")}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-6 border-b border-border/60">
              <span className="font-semibold text-[13px] tracking-wide">HERRAMIENTAS</span>
              <button onClick={() => setIsMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Cerrar menú"><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-5 space-y-5" aria-label="Navegación de herramientas">
              {SIDEBAR_GROUPS.map((group) => (
                <div key={group.id}>
                  <p className="px-2 mb-2 eyebrow !text-muted-foreground/70">{group.title}</p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = activeTab === item.value;
                      const hasSub = !!(item.subTabs && item.subTabs.length > 0);
                      return (
                        <div key={item.value}>
                          <button onClick={() => handleTabClick(item.value)} className={cn("w-full flex items-center gap-5 rounded-xl px-3 py-2.5 text-[13px] transition-colors", isActive ? "bg-primary/10 text-primary font-medium border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}>
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </button>
                          {isActive && hasSub && (
                            <div className="ml-4 mt-1.5 flex flex-col gap-0.5 border-l border-border/30 pl-3">
                              {item.subTabs!.map((sub) => (
                                <button key={sub.value} onClick={() => { onSubTabChange(sub.value); setIsMobileOpen(false); }} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] text-left transition-colors", activeSubTab === sub.value ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/20")}>
                                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", activeSubTab === sub.value ? "bg-primary" : "bg-muted-foreground/40")} />{sub.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="p-5 border-t border-border/30 bg-muted/10">
              <p className="flex items-center gap-1.5 text-[14px] leading-snug text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" /> Fuentes: BYMA · IOL · Yahoo Finance · BCRA
              </p>
              <p className="text-[13px] text-muted-foreground/70 mt-1">Delay 15-20’ • No es recomendación</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div ref={detectionZoneRef} className="fixed left-0 top-16 bottom-0 w-4 z-20" />
      <div ref={railRef} className={cn("fixed left-0 top-16 bottom-0 z-30 glass border-r border-border/60 flex flex-col transition-all duration-200", isVisible ? "translate-x-0" : "-translate-x-full", isExpanded ? "w-[252px]" : "w-[64px]")}>
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5" aria-label="Navegación de herramientas">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.id}>
              {isExpanded && <p className="px-2 mb-2 eyebrow !text-muted-foreground/60">{group.title}</p>}
              {!isExpanded && <div className="h-px bg-border/30 mx-2 mb-2" />}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = activeTab === item.value;
                  const hasSub = !!(item.subTabs && item.subTabs.length > 0);
                  return (
                    <div key={item.value}>
                      <button onClick={() => handleTabClick(item.value)} title={!isExpanded ? item.label : undefined} className={cn("w-full flex items-center gap-5 rounded-xl px-3 py-2.5 text-[13px] transition-colors", isActive ? "bg-primary/10 text-primary font-medium border border-primary/15" : "text-muted-foreground hover:text-foreground hover:bg-muted/30", !isExpanded && "justify-center px-2")}>
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {isExpanded && <span className="whitespace-nowrap text-left leading-none">{item.label}</span>}
                      </button>
                      {isActive && isExpanded && hasSub && (
                        <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-border/30 pl-3">
                          {item.subTabs!.map((sub) => (
                            <button key={sub.value} onClick={() => onSubTabChange(sub.value)} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] text-left leading-none transition-colors", activeSubTab === sub.value ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/20")}>
                              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", activeSubTab === sub.value ? "bg-primary" : "bg-muted-foreground/40")} />{sub.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border/30 p-2 space-y-2">
          {isExpanded && (
            <div className="rounded-lg bg-muted/10 border border-border/20 p-2.5">
              <p className="flex items-center gap-1.5 text-[14px] font-medium text-foreground"><Info className="h-3.5 w-3.5 text-primary" /> Fuentes</p>
              <p className="text-[14px] leading-snug text-muted-foreground mt-1">BYMA · IOL · Yahoo Finance · BCRA</p>
              <p className="text-[13px] text-muted-foreground/70">Delay 15-20’ • Datos informativos</p>
            </div>
          )}
          <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[14px] text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-border/20 transition-colors">
            {isExpanded ? <><ChevronLeft className="h-4 w-4" /> Colapsar</> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </>
  );
}
