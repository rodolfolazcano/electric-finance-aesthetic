/** Server function principal de Yahoo Finance (TanStack Start).
 *  Expone `fetchYahooSummary` para el cliente; la lógica vive en `yahoo-http`. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { QuoteSummaryResult } from "./yahoo-types";
import { fetchYahooQuoteSummaryJson, fetchYahooChart } from "./yahoo-http";

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

/** Histórico de velas para el cliente (usado por el panel de opciones). */
export const fetchYahooChartServer = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({
        symbol: z.string().min(1).max(24),
        range: z.string().min(1).max(8).default("1y"),
        interval: z.string().min(1).max(8).default("1d"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const json = await fetchYahooChart(data.symbol, data.range, data.interval);
    return { chart: json };
  });
