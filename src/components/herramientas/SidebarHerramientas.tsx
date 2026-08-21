// @ts-nocheck
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Globe,
  Sparkles,
  ArrowLeftRight,
  Building2,
  Layers,
  Calculator,
  Briefcase,
  TrendingUp,
  ChevronLeft,
  Menu,
  X,
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
  icon: LucideIcon;
  subTabs?: SubTab[];
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    value: "contexto",
    label: "01 · Contexto",
    icon: Globe,
  },
  {
    value: "analisis",
    label: "02 · Análisis",
    icon: TrendingUp,
    subTabs: [
      { value: "tecnico", label: "Análisis Técnico" },
      { value: "fundamental", label: "Análisis Fundamental" },
    ],
  },
  {
    value: "sectores",
    label: "03 · Sectores",
    icon: Building2,
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
  {
    value: "cuantitativo",
    label: "04 · Análisis Cuantitativo",
    icon: Layers,
    subTabs: [
      { value: "optimizador", label: "Optimizador de Portafolios" },
      { value: "riesgo", label: "Análisis de Riesgo" },
      { value: "capm", label: "CAPM" },
      { value: "cobertura", label: "Cobertura" },
      { value: "clasificacion", label: "Clasificación" },
      { value: "statarb", label: "Stat Arb" },
      { value: "estimaciones", label: "Estimaciones" },
    ],
  },
  {
    value: "portafolio",
    label: "05 · Portafolio",
    icon: Briefcase,
  },
  {
    value: "renta-fija",
    label: "06 · Renta Fija",
    icon: BarChart3,
  },
  {
    value: "opciones",
    label: "07 · Opciones",
    icon: TrendingUp,
  },
  {
    value: "arbitrador",
    label: "08 · Arbitrador",
    icon: ArrowLeftRight,
  },
  {
    value: "cripto",
    label: "09 · Cripto",
    icon: Sparkles,
  },
  {
    value: "planificacion",
    label: "10 · Planificación",
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
];

interface SidebarHerramientasProps {
  activeTab: string;
  activeSubTab?: string;
  onTabChange: (tab: string) => void;
  onSubTabChange: (subTab: string) => void;
  onRailStateChange?: (state: {
    isVisible: boolean;
    isExpanded: boolean;
    isMobile: boolean;
  }) => void;
}

export function SidebarHerramientas({
  activeTab,
  activeSubTab,
  onTabChange,
  onSubTabChange,
  onRailStateChange,
}: SidebarHerramientasProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const detectionZoneRef = useRef<HTMLDivElement>(null);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-hide mechanism (desktop only)
  useEffect(() => {
    if (isMobile) return; // No auto-hide on mobile

    const startInactivityTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 2500); // 2.5 seconds of inactivity
    };

    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      setIsVisible(true);
      startInactivityTimer();
    };

    // Reset timer when mouse is inside the rail
    const handleMouseEnter = () => {
      resetInactivityTimer();
    };

    const handleMouseMove = () => {
      resetInactivityTimer();
    };

    const handleMouseLeave = () => {
      startInactivityTimer();
    };

    // Start timer when user interacts with content
    const handleContentInteraction = () => {
      startInactivityTimer();
    };

    const rail = railRef.current;
    if (rail) {
      rail.addEventListener("mouseenter", handleMouseEnter);
      rail.addEventListener("mousemove", handleMouseMove);
      rail.addEventListener("mouseleave", handleMouseLeave);
    }

    // Listen for content interactions
    document.addEventListener("scroll", handleContentInteraction);
    document.addEventListener("click", handleContentInteraction);

    // Start initial timer
    startInactivityTimer();

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      if (rail) {
        rail.removeEventListener("mouseenter", handleMouseEnter);
        rail.removeEventListener("mousemove", handleMouseMove);
        rail.removeEventListener("mouseleave", handleMouseLeave);
      }
      document.removeEventListener("scroll", handleContentInteraction);
      document.removeEventListener("click", handleContentInteraction);
    };
  }, [isMobile]);

  // Edge detection zone for bringing back the rail
  useEffect(() => {
    if (isMobile) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX < 16 && !isVisible) {
        // 16px detection zone
        setIsVisible(true);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [isVisible, isMobile]);

  // Keyboard accessibility - show rail when focus enters
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const rail = railRef.current;
      if (rail && rail.contains(e.target as Node) && !isVisible) {
        setIsVisible(true);
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [isVisible]);

  // Notify parent of state changes
  useEffect(() => {
    if (onRailStateChange) {
      onRailStateChange({ isVisible, isExpanded, isMobile });
    }
  }, [isVisible, isExpanded, isMobile, onRailStateChange]);

  const handleTabClick = (tabValue: string) => {
    onTabChange(tabValue);
    if (!isMobile) {
      setIsExpanded(true);
    } else {
      setIsMobileOpen(false);
    }
  };

  const handleCollapseClick = () => {
    setIsExpanded(false);
  };

  const activeItem = SIDEBAR_ITEMS.find((item) => item.value === activeTab);
  const hasSubTabs = !!(activeItem?.subTabs && activeItem.subTabs.length > 0);

  // Mobile drawer
  if (isMobile) {
    return (
      <>
        {/* Mobile hamburger button */}
        <button
          onClick={() => setIsMobileOpen(true)}
          className="fixed top-20 left-4 z-50 p-2 rounded-lg bg-background/80 backdrop-blur border border-border/60 shadow-lg"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Mobile drawer overlay */}
        {isMobileOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        {/* Mobile drawer */}
        <div
          className={cn(
            "fixed top-0 left-0 z-50 h-full w-72 bg-background border-r border-border/60 shadow-xl transition-transform duration-300 ease-in-out",
            isMobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex flex-col h-full">
            {/* Drawer header */}
            <div className="flex items-center justify-between p-4 border-b border-border/60">
              <span className="font-semibold">Herramientas</span>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-1 rounded hover:bg-muted"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer content */}
            <nav className="flex-1 overflow-y-auto p-2" aria-label="Navegación de herramientas">
              {SIDEBAR_ITEMS.map((item) => {
                const isActive = activeTab === item.value;
                const itemHasSubTabs = !!(item.subTabs && item.subTabs.length > 0);

                return (
                  <div key={item.value}>
                    <button
                      onClick={() => handleTabClick(item.value)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                      )}
                    >
                      {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
                      <span className="whitespace-nowrap">{item.label}</span>
                    </button>

                    {/* Subtabs for active item */}
                    {isActive && itemHasSubTabs && (
                      <div className="ml-8 mt-1 flex flex-col gap-0.5">
                        {item.subTabs!.map((sub) => (
                          <button
                            key={sub.value}
                            onClick={() => {
                              onSubTabChange(sub.value);
                              setIsMobileOpen(false);
                            }}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-left transition-all duration-200",
                              activeSubTab === sub.value
                                ? "text-primary bg-primary/5 font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/20",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1 w-1 rounded-full shrink-0",
                                activeSubTab === sub.value
                                  ? "bg-primary"
                                  : "bg-muted-foreground/30",
                              )}
                            />
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      </>
    );
  }

  // Desktop rail
  return (
    <>
      {/* Detection zone (invisible) */}
      <div ref={detectionZoneRef} className="fixed left-0 top-16 bottom-0 w-4 z-20" />

      {/* Rail */}
      <div
        ref={railRef}
        className={cn(
          "fixed left-0 top-16 bottom-0 z-30 bg-background/95 backdrop-blur-xl border-r border-border/60 transition-transform duration-200 ease-in-out",
          isVisible ? "translate-x-0" : "-translate-x-full",
          isExpanded ? "w-[220px]" : "w-[56px]",
        )}
      >
        <nav className="flex flex-col h-full" aria-label="Navegación de herramientas">
          {/* Main tabs */}
          <div className="flex-1 overflow-y-auto py-3">
            {SIDEBAR_ITEMS.map((item) => {
              const isActive = activeTab === item.value;
              const itemHasSubTabs = !!(item.subTabs && item.subTabs.length > 0);

              return (
                <div key={item.value}>
                  <button
                    onClick={() => handleTabClick(item.value)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 mx-2",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                    )}
                  >
                    {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
                    {isExpanded && <span className="whitespace-nowrap">{item.label}</span>}
                  </button>

                  {/* Subtabs accordion for active item */}
                  {isActive && isExpanded && itemHasSubTabs && (
                    <div className="ml-8 mt-1 mr-2 flex flex-col gap-0.5">
                      {item.subTabs!.map((sub) => (
                        <button
                          key={sub.value}
                          onClick={() => onSubTabChange(sub.value)}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-left transition-all duration-200",
                            activeSubTab === sub.value
                              ? "text-primary bg-primary/5 font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/20",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1 w-1 rounded-full shrink-0",
                              activeSubTab === sub.value ? "bg-primary" : "bg-muted-foreground/30",
                            )}
                          />
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Collapse button */}
          {isExpanded && (
            <div className="p-3 border-t border-border/40">
              <button
                onClick={handleCollapseClick}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all duration-200"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Colapsar</span>
              </button>
            </div>
          )}
        </nav>
      </div>
    </>
  );
}
