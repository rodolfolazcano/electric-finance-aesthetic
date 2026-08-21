// @ts-nocheck
/**
 * Ticker resolution module for portfolio draft assets
 * 
 * Resolves tickers to their correct Yahoo Finance symbols based on:
 * - CEDEARs Universe data (cedears-universe.json): identifies if a ticker is a CEDEAR
 * - Arbitrador data (arbitrador.json): maps BCBA stocks to their NYSE ADRs
 * - User-provided moneda (ARS or USD)
 * 
 * Key Insight:
 * For CEDEARs and BCBA stocks analyzed in USD, returns TWO symbols:
 * - priceSymbol: where to fetch the current price (local market)
 * - analysisSymbol: where to fetch fundamentals/sector/beta/returns (usually US underlying)
 * 
 * Example:
 * - CEDEAR ARS "AAPL" → price from AAPL.BA (BCBA), analysis from AAPL (US)
 * - CEDEAR USD "MSFTD" → price from MSFTD.BA (BCBA), analysis from MSFT (US)
 * - BCBA Stock "GGAL.BA" (ARS) → both from GGAL.BA
 * - BCBA Stock "GGAL" (USD) → both from GGAL (NYSE ADR)
 * - US Stock "AAPL" (USD) → both from AAPL
 */

import cedearsData from "./data/cedears-universe.json";
import arbitradorData from "./data/arbitrador.json";

const CEDEARS = cedearsData as { ARS: string[]; USD: string[] };
const ARBITRADOR = arbitradorData as {
  adrs: Array<{ nyse: string; bcba: string; nombre: string; ratio: number }>;
  cedears: Array<{ nyse: string; bcba: string; nombre: string; ratio: number }>;
};

export interface TickerResolution {
  priceSymbol: string;    // Symbol to use for fetching current price
  analysisSymbol: string; // Symbol to use for fundamentals (sector, industry, beta, returns)
  tipo: string | null;    // Asset type: "cedear", "accion", etc.
  moneda: string | null;  // Currency: "ARS", "USD"
  mercado: string | null; // Market: "BCBA", "NYSE", "NASDAQ"
  pais: string | null;    // Country: "Argentina", "EE.UU."
}

/**
 * Resolve a ticker symbol to correct Yahoo Finance symbol(s) based on moneda.
 * 
 * @param symbol - The ticker symbol (e.g., "AAPL", "AAPL.BA", "CCJD", "GGAL")
 * @param moneda - Currency selector (ARS = Argentine market, USD = US market)
 * @returns TickerResolution with priceSymbol and analysisSymbol
 */
export function resolveDraftTicker(
  symbol: string,
  moneda: "ARS" | "USD",
): TickerResolution {
  const s = symbol.toUpperCase().trim();
  const base = s.replace(/\.BA$/, "").replace(/D$/, "");
  const isD = s.endsWith("D") && !s.endsWith(".BA");
  const isBA = s.includes(".");

  const isCedearARS = CEDEARS.ARS.includes(base);
  const isCedearUSD = CEDEARS.USD.includes(s);
  const isCedear = isCedearARS || isCedearUSD;

  if (moneda === "ARS") {
    if (isCedear) {
      return {
        priceSymbol: `${base}.BA`,
        analysisSymbol: base,
        tipo: "cedear",
        moneda: "ARS",
        mercado: "BCBA",
        pais: "EE.UU.",
      };
    }
    return {
      priceSymbol: isBA ? s : `${base}.BA`,
      analysisSymbol: isBA ? s : `${base}.BA`,
      tipo: "accion",
      moneda: "ARS",
      mercado: "BCBA",
      pais: "Argentina",
    };
  }

  if (isD && isCedearUSD) {
    return {
      priceSymbol: `${base}D.BA`,
      analysisSymbol: base,
      tipo: "cedear",
      moneda: "USD",
      mercado: "BCBA",
      pais: "EE.UU.",
    };
  }

  const adr = ARBITRADOR.adrs.find(
    (a) => a.bcba === base || a.nyse === base,
  );
  if (adr) {
    return {
      priceSymbol: adr.nyse,
      analysisSymbol: adr.nyse,
      tipo: "accion",
      moneda: "USD",
      mercado: "NYSE",
      pais: "EE.UU.",
    };
  }

  return {
    priceSymbol: s,
    analysisSymbol: s,
    tipo: null,
    moneda: "USD",
    mercado: null,
    pais: null,
  };
}
