/** Server function principal de Yahoo Finance (TanStack Start).
 *  Expone `fetchYahooSummary` para el cliente; la lógica vive en `yahoo-http`. */

import { createServerFn } from "@tanstack/react-start";
import type { QuoteSummaryResult } from "./yahoo-types";
import { fetchYahooQuoteSummaryJson } from "./yahoo-http";

export const DEFAULT_MODULES = [
  "assetProfile",
  "summaryDetail",
  "financialData",
  "defaultKeyStatistics",
  "incomeStatementHistory",
  "incomeStatementHistoryQuarterly",
  "balanceSheetHistory",
  "balanceSheetHistoryQuarterly",
  "cashflowStatementHistory",
  "cashflowStatementHistoryQuarterly",
  "earnings",
  "earningsHistory",
  "earningsTrend",
  "calendarEvents",
  "recommendationTrend",
  "upgradeDowngradeHistory",
  "majorHoldersBreakdown",
  "institutionOwnership",
  "fundOwnership",
  "insiderHolders",
  "insiderTransactions",
  "netSharePurchaseActivity",
  "secFilings",
];

export interface YahooFetchResult {
  symbol: string;
  data: QuoteSummaryResult | null;
  error: string | null;
}

export const fetchYahooSummary = createServerFn({ method: "GET" })
  .inputValidator((input: { symbol: string; modules?: string[] }) => {
    if (!input || typeof input.symbol !== "string") throw new Error("symbol required");
    const symbol = input.symbol.slice(0, 24);
    if (!/^[A-Z0-9.\-^]+$/i.test(symbol)) throw new Error("invalid symbol");
    return { symbol, modules: input.modules };
  })
  .handler(async ({ data }): Promise<YahooFetchResult> => {
    try {
      const modules = (
        data.modules && data.modules.length > 0 ? data.modules : DEFAULT_MODULES
      ).slice(0, 30);
      const response = await fetchYahooQuoteSummaryJson<{
        quoteSummary?: {
          result?: QuoteSummaryResult[];
          error?: { description?: string };
        };
      }>(data.symbol, modules);
      if (!response.json) {
        return { symbol: data.symbol, data: null, error: `Yahoo ${response.status}` };
      }
      const json = response.json;
      if (json.quoteSummary?.error) {
        return {
          symbol: data.symbol,
          data: null,
          error: json.quoteSummary.error.description ?? "Yahoo error",
        };
      }
      return {
        symbol: data.symbol,
        data: json.quoteSummary?.result?.[0] ?? null,
        error: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("fetchYahooSummary failed:", message);
      return { symbol: data.symbol, data: null, error: message };
    }
  });
