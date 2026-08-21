// @ts-nocheck
// src/lib/perfil-inversor.ts
// Tipos + lógica extraídos de perfiles_inversor_unificado.json
// y alineados con unificado_completo.json para filtrar por sector/industria

import perfilesData from "@/data/perfiles_inversor_unificado.json";

//  Tipos principales 
export interface PerfilAsignacion {
  categoria_id: string;
  porcentaje: number;
}

export interface PerfilInversor {
  id: string;
  nombre: string;
  descripcion: string;
  rendimiento_promedio: string;
  mejor_escenario: string;
  peor_escenario: string;
  asignacion: PerfilAsignacion[];
  paneles_recomendados: string[];
  tickers_destacados: Record<string, string[] | Record<string, string>>;
  estrategia: string;
}

export interface PanelMercado {
  id: string;
  nombre: string;
  descripcion: string;
  tipo_instrumento: string;
  origen: string;
  api_function?: string;
}

export interface CategoriaActivo {
  id: string;
  nombre: string;
  tipo: string;
  descripcion: string;
  subcategorias: Array<{
    id: string;
    nombre: string;
    tickers: string[];
    paneles: string[];
  }>;
}

interface PerfilesDataJson {
  categorias_activo: CategoriaActivo[];
  paneles_mercado: PanelMercado[];
  perfiles_inversor: PerfilInversor[];
  distribucion_por_mercado: Record<
    string,
    { descripcion: string; categorias: string[]; api_iol?: boolean; api_yahoo?: boolean }
  >;
}

const DATA = perfilesData as unknown as PerfilesDataJson;

//  Preguntas del test (mismas 7 de IOL) 
export interface Pregunta {
  id: string;
  seccion: "horizonte" | "tolerancia";
  texto: string;
  opciones: { texto: string; puntos: number }[];
}

export const PREGUNTAS: Pregunta[] = [
  {
    id: "h1",
    seccion: "horizonte",
    texto: "Planeo iniciar el retiro de fondos de mi cartera dentro de:",
    opciones: [
      { texto: "Menos de 3 años", puntos: 1 },
      { texto: "Entre 3 y 5 años", puntos: 3 },
      { texto: "Entre 6 y 10 años", puntos: 7 },
      { texto: "Dentro de 11 o más", puntos: 10 },
    ],
  },
  {
    id: "h2",
    seccion: "horizonte",
    texto: "Una vez que decido retirar mis fondos, planeo retirarlos en:",
    opciones: [
      { texto: "Menos de 2 años", puntos: 0 },
      { texto: "Entre 2 y 5 años", puntos: 2 },
      { texto: "Entre 6 y 10 años", puntos: 4 },
      { texto: "Dentro de 11 o más", puntos: 6 },
    ],
  },
  {
    id: "t1",
    seccion: "tolerancia",
    texto: "Describiría mis conocimientos sobre INVERTIR como:",
    opciones: [
      { texto: "Nulos", puntos: 0 },
      { texto: "Limitados", puntos: 4 },
      { texto: "Buenos", puntos: 8 },
      { texto: "Muy buenos", puntos: 10 },
    ],
  },
  {
    id: "t2",
    seccion: "tolerancia",
    texto: "Cuando invierto mi dinero, estoy:",
    opciones: [
      { texto: "Mayormente preocupado por pérdidas", puntos: 0 },
      { texto: "Preocupado por pérdidas y ganancias por igual", puntos: 3 },
      { texto: "Mayormente preocupado por ganancias", puntos: 6 },
    ],
  },
  {
    id: "t3",
    seccion: "tolerancia",
    texto: "Qué inversiones realiza o ha realizado más frecuentemente:",
    opciones: [
      { texto: "Cajas de ahorro / plazo fijo", puntos: 0 },
      { texto: "Bonos nacionales", puntos: 2 },
      { texto: "Acciones argentinas", puntos: 5 },
      { texto: "Acciones y bonos internacionales", puntos: 8 },
    ],
  },
  {
    id: "t4",
    seccion: "tolerancia",
    texto: "Si el mercado perdiera 25% en un mes, usted:",
    opciones: [
      { texto: "Vendería todo", puntos: 0 },
      { texto: "Vendería parte", puntos: 3 },
      { texto: "No haría nada", puntos: 6 },
      { texto: "Compraría más", puntos: 8 },
    ],
  },
  {
    id: "t5",
    seccion: "tolerancia",
    texto: "Seleccione el rendimiento/riesgo con el que se siente cómodo:",
    opciones: [
      { texto: "A: +7.2% prom / -5.6% peor año", puntos: 0 },
      { texto: "B: +9.0% prom / -12.1% peor año", puntos: 4 },
      { texto: "C: +10.4% prom / -18.2% peor año", puntos: 8 },
      { texto: "D: +11.7% prom / -24.0% peor año", puntos: 12 },
      { texto: "E: +12.5% prom / -28.2% peor año", puntos: 16 },
    ],
  },
];

//  Cálculo de perfil 
export function calcularPerfil(scoreH: number, scoreT: number): PerfilInversor {
  const perfiles = DATA.perfiles_inversor;

  // Si no hay datos del JSON, fallback a perfiles por puntaje
  for (const p of perfiles) {
    const minH =
      p.id === "corto_plazo_conservador" || p.id === "corto_plazo_especulativo"
        ? -Infinity
        : ((p as any).puntaje_min_horizonte ?? 0);
    const maxH =
      p.id === "corto_plazo_conservador" || p.id === "corto_plazo_especulativo"
        ? Infinity
        : ((p as any).puntaje_max_horizonte ?? Infinity);
    const minT = (p as any).puntaje_min_tolerancia ?? 0;
    const maxT = (p as any).puntaje_max_tolerancia ?? Infinity;

    if (scoreH >= minH && scoreH <= maxH && scoreT >= minT && scoreT <= maxT) {
      return p;
    }
  }

  // Fallback: matching por puntaje
  if (scoreH <= 2) {
    if (scoreT <= 28)
      return perfiles.find((p) => p.id === "corto_plazo_conservador") ?? perfiles[6];
    return perfiles.find((p) => p.id === "corto_plazo_especulativo") ?? perfiles[6];
  }
  if (scoreH <= 4) return perfiles.find((p) => p.id === "moderado") ?? perfiles[6];
  if (scoreH <= 6) return perfiles.find((p) => p.id === "moderado") ?? perfiles[6];
  if (scoreH <= 9) return perfiles.find((p) => p.id === "moderadamente_agresivo") ?? perfiles[6];
  return perfiles.find((p) => p.id === "agresivo") ?? perfiles[6];
}

//  Helpers 
export function getPanelesPorPerfil(perfilId: string): PanelMercado[] {
  const perfil = DATA.perfiles_inversor.find((p) => p.id === perfilId);
  if (!perfil) return [];
  return perfil.paneles_recomendados
    .map((id) => DATA.paneles_mercado.find((p) => p.id === id))
    .filter((p): p is PanelMercado => !!p);
}

export function getCategoriaActivo(id: string): CategoriaActivo | undefined {
  return DATA.categorias_activo.find((c) => c.id === id);
}

export function getSubcategoriasPorCategoria(categoriaId: string) {
  const cat = getCategoriaActivo(categoriaId);
  return cat?.subcategorias ?? [];
}

export function getAsignacionCompleta(perfil: PerfilInversor) {
  return perfil.asignacion
    .filter((a) => a.porcentaje > 0)
    .map((a) => {
      const cat = getCategoriaActivo(a.categoria_id);
      return {
        ...a,
        nombre_categoria: cat?.nombre ?? a.categoria_id,
        tipo: cat?.tipo ?? "",
        subcategorias: getSubcategoriasPorCategoria(a.categoria_id),
      };
    });
}

//  Mercados 
export interface MercadoInfo {
  exchange: string;
  moneda: string;
  descripcion: string;
  sufijo?: string; // ej: ".BA" para BCBA
}

export function getMercadoParaTicker(ticker: string): MercadoInfo {
  if (ticker.endsWith(".BA")) {
    return {
      exchange: "BCBA",
      moneda: "ARS",
      descripcion: "Bolsa y Mercados Argentinos",
      sufijo: ".BA",
    };
  }
  if (ticker.endsWith("D")) {
    // Ticker con D al final = mismo ticker USD en BCBA (ej: AL30D)
    return {
      exchange: "BCBA",
      moneda: "USD",
      descripcion: "BCBA - Especie D (USD)",
      sufijo: ".BA",
    };
  }
  // Por defecto NYSE/NASDAQ
  return { exchange: "NYSE/NASDAQ", moneda: "USD", descripcion: "EE.UU." };
}

export function separarPorMercado(tickers: string[]) {
  const argentina: string[] = [];
  const eeuu: string[] = [];
  for (const t of tickers) {
    if (
      t.endsWith(".BA") ||
      t.endsWith("D") ||
      t.startsWith("AL") ||
      t.startsWith("GD") ||
      t.startsWith("TX") ||
      t.startsWith("TZ") ||
      t.startsWith("S") ||
      t.startsWith("X") ||
      t.startsWith("D") ||
      t.startsWith("M") ||
      t.startsWith("BP") ||
      t.startsWith("AO") ||
      t.startsWith("TO") ||
      t.startsWith("TY") ||
      t.startsWith("TM") ||
      t.startsWith("TT") ||
      t.startsWith("PAR") ||
      t.startsWith("DIC") ||
      t.startsWith("PR") ||
      t.startsWith("PAP") ||
      t.startsWith("CUAP") ||
      t.startsWith("TVP") ||
      t.startsWith("CA") ||
      t.startsWith("YPF") ||
      t.startsWith("GGAL") ||
      t.startsWith("PAMP") ||
      t.startsWith("BMA") ||
      t.startsWith("SUPV") ||
      t.startsWith("CEPU") ||
      t.startsWith("EDN") ||
      t.startsWith("LOMA") ||
      t.startsWith("BBAR") ||
      t.startsWith("CRES") ||
      t.startsWith("MIRG") ||
      t.startsWith("IRSA") ||
      t.startsWith("CTIO") ||
      t.startsWith("ALUA") ||
      t.startsWith("MOLI") ||
      t.startsWith("LEDE") ||
      t.startsWith("CAPX") ||
      t.startsWith("GPRK") ||
      t.startsWith("TGSU") ||
      t.startsWith("TGNO")
    ) {
      argentina.push(t);
    } else {
      eeuu.push(t);
    }
  }
  return { argentina, eeuu };
}

// Cache de unificado_completo para recomendaciones
import unificadoData from "@/data/unificado_completo.json";

interface TickerInfo {
  ticker: string;
  sector?: string;
  industria?: string;
}

const UNIFICADO_MAP = new Map<string, TickerInfo>();
const RAW = unificadoData as Record<string, any>;
for (const [ticker, info] of Object.entries(RAW)) {
  if (typeof info === "object" && info !== null) {
    UNIFICADO_MAP.set(ticker, { ticker, sector: info.sector, industria: info.industria });
    if (info.ticker)
      UNIFICADO_MAP.set(info.ticker, {
        ticker: info.ticker,
        sector: info.sector,
        industria: info.industria,
      });
  }
}

export function getSectorIndustria(ticker: string): { sector?: string; industria?: string } {
  const info = UNIFICADO_MAP.get(ticker);
  return info ? { sector: info.sector, industria: info.industria } : {};
}

export function buscarTickersPorSector(sector: string): string[] {
  const result: string[] = [];
  for (const [ticker, info] of UNIFICADO_MAP) {
    if (info.sector?.toLowerCase().includes(sector.toLowerCase())) {
      result.push(ticker);
    }
  }
  return result.slice(0, 20);
}

// --- Compatibilidad con el Test del Inversor del sitio (index.tsx) ---
export const CLAVE_PERFIL_INVERSOR = "norte:perfil-inversor";
export const EVENTO_PERFIL_INVERSOR = "norte:perfil-inversor";

export type PerfilResultante = {
  id: "conservador" | "moderado" | "agresivo";
  nombre: "Conservador" | "Moderado" | "Agresivo";
};

export function leerPerfilInversor(): PerfilResultante | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLAVE_PERFIL_INVERSOR);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PerfilResultante;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.nombre !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function guardarPerfilInversor(perfil: PerfilResultante) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_PERFIL_INVERSOR, JSON.stringify(perfil));
    window.dispatchEvent(
      new CustomEvent<PerfilResultante>(EVENTO_PERFIL_INVERSOR, { detail: perfil }),
    );
  } catch {
    /* sin storage disponible */
  }
}

export function limpiarPerfilInversor() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLAVE_PERFIL_INVERSOR);
    window.dispatchEvent(new CustomEvent(EVENTO_PERFIL_INVERSOR));
  } catch {
    /* sin storage disponible */
  }
}

export function suscribirPerfilInversor(
  handler: (perfil: PerfilResultante | null) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = (e: Event) => {
    const detail = (e as CustomEvent<PerfilResultante>).detail;
    handler(detail ?? leerPerfilInversor());
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === CLAVE_PERFIL_INVERSOR) handler(leerPerfilInversor());
  };
  window.addEventListener(EVENTO_PERFIL_INVERSOR, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENTO_PERFIL_INVERSOR, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
