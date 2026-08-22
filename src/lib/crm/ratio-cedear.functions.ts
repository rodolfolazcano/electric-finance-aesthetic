/**
 * src/lib/crm/ratio-cedear.functions.ts
 *
 * Helper para obtener el ratio CEDEAR (BYMA) desde la fuente única y principal:
 * @/data/arbitrador.json
 *
 * ⚠️ NO usar src/lib/capm-hedge.types.ts (CEDEAR_RATIOS) como fuente,
 *    porque ese mapa tiene valores simplificados/distintos a los ratios
 *    reales de BYMA/CNV que están en arbitrador.json.
 *
 * Ejemplo de diferencia:
 *   - MSFT → arbitrador.json ratio=30, CEDEAR_RATIOS (capm-hedge) ratio=20
 *   - SPY  → arbitrador.json ratio=20, CEDEAR_RATIOS (capm-hedge) ratio=10
 *
 * Fuente única → @/data/arbitrador.json (BYMA/CNV)
 */

import arbitrajeData from "@/data/arbitrador.json";

const _arbData = arbitrajeData as {
  dolarSymbol: string;
  adrs: { nyse: string; bcba: string; nombre: string; ratio: number }[];
  cedears: { nyse: string; bcba: string; nombre: string; ratio: number }[];
};

/**
 * Busca el ratio de conversión CEDEAR para un ticker de Yahoo Finance.
 * Retorna null si el ticker no está en el universo de CEDEARs de BYMA.
 *
 * @param tickerYf - Ticker de Yahoo Finance (ej: "AAPL", "MSFT", "NVDA")
 * @returns ratio CEDEAR (cantidad de CEDEARs equivalentes a 1 acción subyacente)
 *          o null si no se encuentra
 */
export function getRatioCedear(tickerYf: string): number | null {
  const item = _arbData.cedears.find((c) => c.nyse === tickerYf);
  return item?.ratio ?? null;
}
