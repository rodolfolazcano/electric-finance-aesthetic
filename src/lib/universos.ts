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
