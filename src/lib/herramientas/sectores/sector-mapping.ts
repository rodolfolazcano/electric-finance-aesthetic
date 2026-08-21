/**
 * Mapping ticker ↔ sector/industria — portado de clarity-dashboard
 * (src/lib/sectores/sector-mapping.ts). Adaptado: imports estáticos de JSON
 * (sin require) e isCedear extendido con el universo CEDEAR local.
 *
 * Universo unificado: sectores.json (EE.UU. + CEDEARs) + sectores-bcba.json
 * (panel líder BCBA). Expone getUnifiedUniverse(), getSectorNames(),
 * getTickersBySector() y helpers de normalización.
 */

import sectoresUsa from "../sectores.json";
import sectoresBcba from "../sectores-bcba.json";
import cedearsUniverse from "../data/cedears-universe.json";

export interface TickerEntry {
  ticker: string;
  nombre: string;
  sector: string;
  industry: string;
}

type ArbolSectores = Record<string, Record<string, { ticker: string; nombre: string }[]>>;

const KNOWN_CEDEARS: Record<string, string> = {
  "GGAL.BA": "GGAL",
  "BMA.BA": "BMA",
  "BBAR.BA": "BBAR",
  "SUPV.BA": "SUPV",
  "YPFD.BA": "YPF",
  "PAMP.BA": "PAMP",
  "CRES.BA": "CRESY",
  "IRSA.BA": "IRS",
  "TECO2.BA": "TEO",
  "CEPU.BA": "CEPU",
  "LOMA.BA": "LOMA",
  "EDN.BA": "EDN",
  "TXAR.BA": "TX",
  "TRAN.BA": "TRA",
  "ALUA.BA": "ARNC",
};

const CEDEARS_USD = (cedearsUniverse as { ARS: string[]; USD: string[] }).USD.map((t) =>
  t.toUpperCase(),
);

function stripBATicker(ticker: string): string {
  return ticker.endsWith(".BA") ? ticker.slice(0, -3) : ticker;
}

export function getUnderlyingTicker(ticker: string): string {
  if (KNOWN_CEDEARS[ticker]) return KNOWN_CEDEARS[ticker]!;
  return stripBATicker(ticker);
}

export function hasLocalTicker(ticker: string): boolean {
  return ticker.endsWith(".BA");
}

export function isCedear(ticker: string): boolean {
  const t = ticker.toUpperCase();
  if (KNOWN_CEDEARS[t] !== undefined) return true;
  // Universo local: especie USD (AAPL) o especie ARS con sufijo .BA (AAPL.BA)
  return CEDEARS_USD.includes(stripBATicker(t));
}

export function isArgentinianNativeStock(ticker: string): boolean {
  // Es acción nativa argentina si termina en .BA pero NO es CEDEAR
  return ticker.endsWith(".BA") && !isCedear(ticker);
}

let unifiedCache: TickerEntry[] | null = null;
let sectorIndustryCache: Map<string, Map<string, TickerEntry[]>> | null = null;

function cargarArbol(data: unknown): ArbolSectores {
  return data as ArbolSectores;
}

export function getUnifiedUniverse(): TickerEntry[] {
  if (unifiedCache) return unifiedCache;
  const us = cargarArbol(sectoresUsa);
  const bcba = cargarArbol(sectoresBcba);
  const entries: TickerEntry[] = [];
  const seen = new Set<string>();
  for (const [sector, industries] of Object.entries(us)) {
    for (const [industry, tickers] of Object.entries(industries)) {
      for (const t of tickers) {
        const key = t.ticker.toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ ticker: key, nombre: t.nombre, sector, industry });
        }
      }
    }
  }
  for (const [sector, industries] of Object.entries(bcba)) {
    for (const [industry, tickers] of Object.entries(industries)) {
      for (const t of tickers) {
        const key = t.ticker.toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ ticker: key, nombre: t.nombre, sector, industry });
        }
      }
    }
  }
  unifiedCache = entries;
  return entries;
}

export function getSectorIndustryMap(): Map<string, Map<string, TickerEntry[]>> {
  if (sectorIndustryCache) return sectorIndustryCache;
  const map = new Map<string, Map<string, TickerEntry[]>>();
  for (const entry of getUnifiedUniverse()) {
    if (!map.has(entry.sector)) map.set(entry.sector, new Map());
    const industries = map.get(entry.sector)!;
    if (!industries.has(entry.industry)) industries.set(entry.industry, []);
    industries.get(entry.industry)!.push(entry);
  }
  sectorIndustryCache = map;
  return map;
}

export function getSectorNames(): string[] {
  return [...getSectorIndustryMap().keys()].sort();
}

export function getTickersBySector(sector: string): TickerEntry[] {
  const inds = getSectorIndustryMap().get(sector);
  if (!inds) return [];
  return [...inds.values()].flat();
}

export function getTickersByIndustry(sector: string, industry: string): TickerEntry[] {
  return getSectorIndustryMap().get(sector)?.get(industry) ?? [];
}

/** Entrada del universo para un ticker (busca exacto y, si no, sin .BA). */
export function buscarEntradaPorTicker(ticker: string): TickerEntry | null {
  const t = ticker.toUpperCase().trim();
  const universe = getUnifiedUniverse();
  const exacto = universe.find((e) => e.ticker === t);
  if (exacto) return exacto;
  const sinBa = stripBATicker(t);
  return universe.find((e) => e.ticker === sinBa) ?? null;
}

export function getUnderlyingTickers(tickers: string[]): string[] {
  return tickers.map(getUnderlyingTicker);
}

export function dedupByUnderlying(tickers: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tickers) {
    const underlying = getUnderlyingTicker(t);
    if (!seen.has(underlying)) {
      seen.add(underlying);
      result.push(t);
    }
  }
  return result;
}
