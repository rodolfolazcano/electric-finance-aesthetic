// @ts-nocheck
/**
 * IOL Asset Classifier
 * Uses IOL API metadata (titulo.tipo, titulo.moneda, titulo.mercado)
 * to automatically detect asset category, currency, and market.
 * Determines which API (Yahoo Finance or IOL) can analyze each asset.
 */

import cedearsData from "./data/cedears-universe.json";
import arbitradorData from "./data/arbitrador.json";
import type { IOLTitulo, IOLActivo } from "./iol-portfolio.functions";

const CEDEARS = cedearsData as { ARS: string[]; USD: string[] };
const ARBITRADOR = arbitradorData as {
  adrs: Array<{ nyse: string; bcba: string; nombre: string; ratio: number }>;
  cedears: Array<{ nyse: string; bcba: string; nombre: string; ratio: number }>;
};

export type IOLAssetCategory =
  | "CEDEAR_ARS"
  | "CEDEAR_USD"
  | "ACCION_BCBA_ARS"
  | "ACCION_BCBA_USD"
  | "ACCION_USA"
  | "TITULO_PUBLICO_ARS"
  | "TITULO_PUBLICO_USD"
  | "OPCION"
  | "FCI"
  | "DESCONOCIDO";

export function categoryLabel(cat: IOLAssetCategory): string {
  const labels: Record<IOLAssetCategory, string> = {
    CEDEAR_ARS: "CEDEAR ARS",
    CEDEAR_USD: "CEDEAR USD",
    ACCION_BCBA_ARS: "Acción BCBA ARS",
    ACCION_BCBA_USD: "Acción BCBA USD (ADR)",
    ACCION_USA: "Acción USA",
    TITULO_PUBLICO_ARS: "Título Público ARS",
    TITULO_PUBLICO_USD: "Título Público USD",
    OPCION: "Opción",
    FCI: "FCI",
    DESCONOCIDO: "Desconocido",
  };
  return labels[cat];
}

export interface ClassifiedIOLAsset {
  asset: IOLActivo;
  category: IOLAssetCategory;
  yahooPriceSymbol: string | null;
  yahooAnalysisSymbol: string | null;
  iolSymbol: string;
  iolMarket: string;
  iolCurrency: "ARS" | "USD";
  canUseYahoo: boolean;
}

/**
 * Normalize IOL currency string to "ARS" | "USD"
 */
export function normalizeIOLCurrency(moneda: string): "ARS" | "USD" {
  const m = (moneda || "").toLowerCase();
  if (m.includes("peso") || m.includes("ars")) return "ARS";
  if (m.includes("dolar") || m.includes("dolares") || m.includes("usd")) return "USD";
  return "ARS";
}

/**
 * Detect asset category from IOL metadata fields.
 */
export function detectIOLCategory(tipo: string, moneda: string, simbolo: string): IOLAssetCategory {
  const tipoUp = (tipo || "").toUpperCase();
  const monedaNorm = normalizeIOLCurrency(moneda);
  const s = simbolo.toUpperCase().trim();
  const base = s.replace(/[DC]$/, "");

  const isCedear = tipoUp === "CEDEARS" || tipoUp.includes("CEDEAR");
  const isTituloPublico =
    tipoUp.includes("BONO") ||
    tipoUp.includes("TITULO") ||
    tipoUp.includes("LETRA") ||
    tipoUp === "TITULOS_PUBLICOS" ||
    tipoUp === "TITULOS_DEUDA";

  if (isCedear) {
    if (monedaNorm === "USD" || s.endsWith("D")) return "CEDEAR_USD";
    return "CEDEAR_ARS";
  }

  if (isTituloPublico) {
    if (monedaNorm === "USD" || s.endsWith("D")) return "TITULO_PUBLICO_USD";
    return "TITULO_PUBLICO_ARS";
  }

  if (tipoUp === "OPCIONES" || tipoUp === "OPCION") return "OPCION";
  if (tipoUp === "FCI" || tipoUp === "FONDOS" || tipoUp.includes("FCI")) return "FCI";

  if (tipoUp === "ACCIONES" || tipoUp === "ACCION" || !tipo) {
    const inCedearsARS = CEDEARS.ARS.includes(base);
    const inCedearsUSD = CEDEARS.USD.includes(s);
    const inADR = ARBITRADOR.adrs.some((a) => a.bcba === base || a.nyse === base);

    if (inCedearsARS || inCedearsUSD) {
      return monedaNorm === "USD" ? "CEDEAR_USD" : "CEDEAR_ARS";
    }
    if (inADR) return "ACCION_BCBA_USD";
    if (monedaNorm === "USD") return "ACCION_USA";
    return "ACCION_BCBA_ARS";
  }

  return "DESCONOCIDO";
}

/**
 * Classify an IOL asset and resolve its Yahoo Finance symbols.
 */
export function classifyIOLAsset(iolTitulo: IOLTitulo): ClassifiedIOLAsset {
  const { simbolo, tipo, moneda, mercado } = iolTitulo;
  const s = simbolo.toUpperCase().trim();
  const base = s.replace(/[DC]$/, "");
  const iolCurrency = normalizeIOLCurrency(moneda);
  const category = detectIOLCategory(tipo, moneda, simbolo);

  let yahooPriceSymbol: string | null = null;
  let yahooAnalysisSymbol: string | null = null;
  let canUseYahoo = false;

  switch (category) {
    case "CEDEAR_ARS": {
      yahooPriceSymbol = `${base}.BA`;
      yahooAnalysisSymbol = base;
      canUseYahoo = true;
      break;
    }
    case "CEDEAR_USD": {
      yahooPriceSymbol = `${base}D.BA`;
      yahooAnalysisSymbol = base;
      canUseYahoo = true;
      break;
    }
    case "ACCION_BCBA_ARS": {
      yahooPriceSymbol = `${base}.BA`;
      yahooAnalysisSymbol = `${base}.BA`;
      canUseYahoo = true;
      break;
    }
    case "ACCION_BCBA_USD": {
      const adr = ARBITRADOR.adrs.find((a) => a.bcba === base || a.nyse === base);
      if (adr) {
        yahooPriceSymbol = adr.nyse;
        yahooAnalysisSymbol = adr.nyse;
      } else {
        yahooPriceSymbol = s;
        yahooAnalysisSymbol = s;
      }
      canUseYahoo = true;
      break;
    }
    case "ACCION_USA": {
      yahooPriceSymbol = s;
      yahooAnalysisSymbol = s;
      canUseYahoo = true;
      break;
    }
    case "TITULO_PUBLICO_ARS":
    case "TITULO_PUBLICO_USD": {
      yahooPriceSymbol = null;
      yahooAnalysisSymbol = null;
      canUseYahoo = false;
      break;
    }
    case "OPCION":
    case "FCI":
    case "DESCONOCIDO": {
      yahooPriceSymbol = null;
      yahooAnalysisSymbol = null;
      canUseYahoo = false;
      break;
    }
  }

  return {
    asset: { cantidad: 0, comprometido: 0, puntosVariacion: 0, variacionDiaria: 0, ultimoPrecio: 0, ppc: 0, gananciaPorcentaje: 0, gananciaDinero: 0, valorizado: 0, titulo: iolTitulo },
    category,
    yahooPriceSymbol,
    yahooAnalysisSymbol,
    iolSymbol: s,
    iolMarket: mercado || "bCBA",
    iolCurrency,
    canUseYahoo,
  };
}

/**
 * Classify an IOLActivo (with quantity) and resolve its symbols.
 */
export function classifyIOLActivo(activo: IOLActivo): ClassifiedIOLAsset {
  const classified = classifyIOLAsset(activo.titulo);
  classified.asset = activo;
  return classified;
}

/**
 * Split an array of IOLActivo into two groups:
 * - yahooGroup: assets that can be analyzed via Yahoo Finance
 * - iolGroup: assets that must be analyzed via IOL API
 */
export function splitByAPI(
  activos: IOLActivo[],
): { yahooGroup: ClassifiedIOLAsset[]; iolGroup: ClassifiedIOLAsset[] } {
  const yahooGroup: ClassifiedIOLAsset[] = [];
  const iolGroup: ClassifiedIOLAsset[] = [];
  for (const a of activos) {
    const c = classifyIOLActivo(a);
    if (c.canUseYahoo) yahooGroup.push(c);
    else iolGroup.push(c);
  }
  return { yahooGroup, iolGroup };
}

/**
 * Resolve the correct ticker for Yahoo Finance based on category.
 * Returns the ticker to pass to yf.chart / yf.quote
 */
export function resolveYahooTicker(classified: ClassifiedIOLAsset): string {
  return classified.yahooPriceSymbol || classified.iolSymbol;
}
