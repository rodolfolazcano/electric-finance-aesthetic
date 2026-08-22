/**
 * Universos operables del bot: CEDEARs líquidos, acciones BCBA, pares para
 * stat-arb y mapeo sectorial. Reutiliza el mapeo validado de la app.
 */

import { ACCIONES_BCBA_TOP, CEDEARS_LIQUIDOS } from "@/lib/mapeo-cedear";

const EXCLUIDOS = new Set(["AAL", "CAR", "C"]);

export function cedearesOperables(): string[] {
  return [...new Set(CEDEARS_LIQUIDOS)].filter((t) => !EXCLUIDOS.has(t));
}

export function accionesOperables(): string[] {
  return [...ACCIONES_BCBA_TOP];
}

/**
 * Pares para stat-arb (Labadie): misma industria o CEDEAR↔subyacente.
 * Formato [yahooA, yahooB, etiqueta].
 */
export const PARES_STATARB: Array<[string, string, string]> = [
  ["GGAL.BA", "BMA.BA", "bancos Argentina (ADR local)"],
  ["SUPV.BA", "BMA.BA", "bancos Argentina"],
  ["YPFD.BA", "PAMP.BA", "energía Argentina"],
  ["TGSU2.BA", "YPFD.BA", "gas y energía Argentina"],
  ["MSFT.BA", "GOOGL.BA", "big tech vía CEDEAR"],
  ["JPM", "BAC", "banca US"],
  ["XOM", "CVX", "petróleo integrado US"],
  ["KO", "PG", "consumo defensivo US"],
  ["AMD", "NVDA", "semiconductores US"],
  ["MELI", "AMZN.BA", "e-commerce LatAm/global"],
];

/** ETFs sectoriales SPDR para rotación + tickers locales expuestos a cada sector. */
export const SECTORES_ETF: Array<{ etf: string; nombre: string; locales: string[] }> = [
  { etf: "XLK", nombre: "tecnología", locales: ["MSFT", "NVDA"] },
  { etf: "XLF", nombre: "financiero", locales: ["JPM", "GGAL.BA", "BMA.BA"] },
  { etf: "XLE", nombre: "energía", locales: ["XOM", "YPFD.BA"] },
  { etf: "XLV", nombre: "salud", locales: ["JNJ", "PFE"] },
  { etf: "XLY", nombre: "consumo discrecional", locales: ["AMZN", "MELI", "MCD"] },
  { etf: "XLP", nombre: "consumo defensivo", locales: ["KO", "PG", "WMT"] },
  { etf: "XLI", nombre: "industrial", locales: ["GE", "HON", "UNP"] },
  { etf: "XLC", nombre: "comunicaciones", locales: ["GOOGL", "DIS"] },
];
