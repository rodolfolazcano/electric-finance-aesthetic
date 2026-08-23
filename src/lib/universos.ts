// src/lib/universos.ts
// Universos de tickers + sector/industria para oportunidades y screener
// Alimentado desde unificado_completo.json (master source)

import unificadoData from "@/data/unificado_completo.json";

export interface TickerInfo {
  ticker: string;
  nombre: string;
  sector: string;
  industria: string;
  tipo?: string;
  moneda?: string;
  mercado?: string;
  pais?: string;
}

let flatCache: TickerInfo[] | null = null;
let sectorCache: string[] | null = null;

function ensureFlat(): TickerInfo[] {
  if (flatCache) return flatCache;
  const result: TickerInfo[] = [];
  const unificado = unificadoData as any;
  const sectores = unificado.sectores ?? unificado;

  for (const [sector, sectorData] of Object.entries(sectores)) {
    if (sector === "No disponible" || sector === "Sin Clasificar") continue;
    const industrias = (sectorData as any).industrias ?? (sectorData as Record<string, any[]>);
    for (const [industria, tickers] of Object.entries(industrias)) {
      for (const t of tickers as any[]) {
        result.push({
          ticker: t.ticker,
          nombre: t.nombre ?? "Nombre no encontrado",
          sector,
          industria,
          tipo: t.tipo,
          moneda: t.moneda,
          mercado: t.mercado,
          pais: t.pais,
        });
      }
    }
  }
  flatCache = result;
  return result;
}

export function getFlatTickerList(): TickerInfo[] {
  return ensureFlat();
}

export function getTickersBySector(sector: string): string[] {
  const list = ensureFlat();
  return list.filter((t) => t.sector === sector).map((t) => t.ticker);
}

export function getTickersBySectorAndIndustry(sector: string, industria: string): string[] {
  const list = ensureFlat();
  return list.filter((t) => t.sector === sector && t.industria === industria).map((t) => t.ticker);
}

export function getUniqueSectores(): string[] {
  if (sectorCache) return sectorCache;
  const list = ensureFlat();
  sectorCache = [...new Set(list.map((t) => t.sector))].sort();
  return sectorCache;
}

export function getIndustriasBySector(sector: string): string[] {
  const list = ensureFlat();
  return [...new Set(list.filter((t) => t.sector === sector).map((t) => t.industria))].sort();
}

// Helper: obtener info detallada de un ticker desde el unificado
export function getTickerInfo(ticker: string): TickerInfo | undefined {
  const list = ensureFlat();
  return list.find((t) => t.ticker === ticker);
}

// F4 — Sincronización con sectores e industrias cedears.py
// El JSON es la foto; esta función permite enriquecerlo con el panel vivo de IOL (acciones/cedears)
// sin reescribir el archivo en disco (cache en memoria). Recicla `sectores e industrias cedears.py`
// y `cedears_scraper.py` como fuente viva: si IOL trae un ticker nuevo, se expone con sector "BCBA · IOL vivo".
let vivoExtras: TickerInfo[] = [];
let vivoLastSync: string | null = null;

export async function sincronizarUniversoDesdeIOL(sessionId?: string): Promise<{ agregados: number; total: number; fecha: string }> {
  try {
    const { iolPanelTodos } = await import("@/lib/iol.server");
    // Requiere sesión IOL activa; si no hay, usar fallback de catálogo local
    const tryFetch = async (instrumento: string) => {
      try { return await (iolPanelTodos as any)(sessionId ?? "anon", instrumento); } catch { return null; }
    };
    const [acciones, cedears] = await Promise.all([tryFetch("acciones"), tryFetch("cedears")]);
    const nuevos: TickerInfo[] = [];
    for (const panel of [acciones, cedears]) {
      const titulos = (panel as any)?.titulos ?? panel ?? [];
      if (!Array.isArray(titulos)) continue;
      for (const t of titulos.slice(0, 200)) {
        const sym = String(t.simbolo ?? t.ticker ?? "").trim().toUpperCase();
        if (!sym || getTickerInfo(sym)) continue;
        if (vivoExtras.find((v) => v.ticker === sym)) continue;
        nuevos.push({
          ticker: sym,
          nombre: String(t.descripcion ?? t.nombre ?? sym),
          sector: String(t.sector ?? "BCBA · IOL vivo"),
          industria: String(t.industria ?? "Sin clasificar"),
          tipo: String(t.tipo ?? (panel === cedears ? "cedear" : "accion")),
          moneda: "ARS",
          mercado: "BCBA",
          pais: "Argentina",
        });
      }
    }
    vivoExtras = [...vivoExtras, ...nuevos];
    vivoLastSync = new Date().toISOString();
    return { agregados: nuevos.length, total: ensureFlat().length + vivoExtras.length, fecha: vivoLastSync };
  } catch {
    return { agregados: 0, total: ensureFlat().length + vivoExtras.length, fecha: vivoLastSync ?? new Date().toISOString() };
  }
}

export function getFlatTickerListConVivo(): TickerInfo[] {
  return [...ensureFlat(), ...vivoExtras];
}

export function getVivoExtras(): TickerInfo[] { return vivoExtras; }

// Universo combinado para Oportunidades (acciones US líquidas + .BA argentinas)
export const UNIVERSO_TECNICO = [
  "AAPL",
  "MSFT",
  "NVDA",
  "TSLA",
  "AMZN",
  "GOOGL",
  "META",
  "AMD",
  "SPY",
  "QQQ",
  "GGAL.BA",
  "YPFD.BA",
  "PAMP.BA",
  "BMA.BA",
  "TXAR.BA",
  "ALUA.BA",
  "CRES.BA",
  "SUPV.BA",
  "COME.BA",
  "TGSU2.BA",
  "BBAR.BA",
  "CEPU.BA",
  "LOMA.BA",
  "MIRG.BA",
  "TECO2.BA",
  "VALO.BA",
];

// Universo valuación (mismo array)
export const UNIVERSO_VALUACION = UNIVERSO_TECNICO;

// Bonos largos IOL
export const UNIVERSO_BONOS_IOL = [
  "AL30",
  "AL30D",
  "AL35",
  "AL35D",
  "GD30",
  "GD30D",
  "GD35",
  "GD35D",
  "AE38",
  "AE38D",
];
