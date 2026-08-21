// @ts-nocheck
/**
 * IOL-based ticker resolver
 * Uses IOL API portfolio data to automatically detect tipo, moneda, mercado
 * Uses iol-asset-classifier for deterministic classification.
 */

import { resolveDraftTicker } from "./ticker-resolver";
import {
  classifyIOLAsset,
  classifyIOLActivo,
  splitByAPI,
  resolveYahooTicker,
  categoryLabel,
} from "./iol-asset-classifier";
import type { IOLTitulo, IOLActivo } from "./iol-portfolio.functions";

export interface DraftAssetResolvedFromIOL {
  priceSymbol: string | null;
  analysisSymbol: string | null;
  tipo: string | null;
  moneda: "ARS" | "USD";
  mercado: string | null;
  pais: string | null;
  category: string;
  canUseYahoo: boolean;
  iolMetadata: IOLTitulo;
  warning?: string;
}

/**
 * Resolve a ticker using IOL API metadata.
 * Uses classifyIOLAsset to determine the asset category and correct symbols.
 */
export function resolveDraftTickerFromIOL(iolTitulo: IOLTitulo): DraftAssetResolvedFromIOL {
  const classified = classifyIOLAsset(iolTitulo);
  const { yahooPriceSymbol, yahooAnalysisSymbol, iolCurrency, canUseYahoo } = classified;
  const mercado = iolTitulo.mercado || null;

  if (!canUseYahoo) {
    return {
      priceSymbol: null,
      analysisSymbol: null,
      tipo: iolTitulo.tipo || null,
      moneda: iolCurrency,
      mercado,
      pais: iolTitulo.pais || null,
      category: categoryLabel(classified.category),
      canUseYahoo: false,
      iolMetadata: iolTitulo,
      warning: `"${iolTitulo.simbolo}" es ${categoryLabel(classified.category)} — solo disponible via IOL`,
    };
  }

  return {
    priceSymbol: yahooPriceSymbol,
    analysisSymbol: yahooAnalysisSymbol,
    tipo: iolTitulo.tipo || null,
    moneda: iolCurrency,
    mercado,
    pais: iolTitulo.pais || null,
    category: categoryLabel(classified.category),
    canUseYahoo: true,
    iolMetadata: iolTitulo,
  };
}

/**
 * Batch resolve multiple IOL titulo objects.
 */
export function resolveDraftTickersFromIOL(iolTitulos: IOLTitulo[]): DraftAssetResolvedFromIOL[] {
  return iolTitulos.map(resolveDraftTickerFromIOL);
}

/**
 * Resolve IOL activos (with quantities) and split by API source.
 */
export function resolveIOLActivos(activos: IOLActivo[]): {
  resolved: DraftAssetResolvedFromIOL[];
  yahooOnly: DraftAssetResolvedFromIOL[];
  iolOnly: DraftAssetResolvedFromIOL[];
} {
  const resolved = activos.map((a) => resolveDraftTickerFromIOL(a.titulo));
  return {
    resolved,
    yahooOnly: resolved.filter((r) => r.canUseYahoo),
    iolOnly: resolved.filter((r) => !r.canUseYahoo),
  };
}
