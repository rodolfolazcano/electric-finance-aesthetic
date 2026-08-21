// @ts-nocheck
/**
 * Draft asset info fetcher with IOL integration
 * Automatically detects asset metadata from IOL API
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { yahooQuoteSummary } from "./yahoo-coronar.functions";
import { yahooChartCloses } from "./yahoo-chart";
import { mean, std, logReturns } from "./optimizer";
import { resolveDraftTickerFromIOL } from "./draft-asset-iol-resolver";
import type { IOLTitulo } from "./iol-portfolio.functions";

export const fetchDraftAssetInfoFromIOL = createServerFn({ method: "POST" })
  .validator(
    z.object({
      titulo: z.object({
        simbolo: z.string().min(1).max(24),
        descripcion: z.string().optional(),
        pais: z.string().optional(),
        mercado: z.string().optional(),
        tipo: z.string().optional(),
        plazo: z.string().optional(),
        moneda: z.string(),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const iolTitulo = data.titulo as IOLTitulo;
    const res = resolveDraftTickerFromIOL(iolTitulo);

    let sector: string | null = null;
    let sectorKey: string | null = null;
    let industry: string | null = null;
    let ultimoPrecio: number | null = null;
    let longName: string | null = null;
    let beta: number | null = null;
    let retornoEsperadoAnual: number | null = null;
    let volatilidadAnual: number | null = null;
    let dailyLogReturns: number[] = [];
    let prices: number[] = [];

    try {
      const sameSymbol = res.priceSymbol === res.analysisSymbol;

      // Fetch price and analysis data in parallel
      // For CEDEARs: price from priceSymbol (AAPL.BA), analysis from analysisSymbol (AAPL)
      // For BCBA stocks: both from .BA symbol
      // For US stocks: both from base ticker
      const [qsPrice, qsAnalysis, closes, spyCloses] = await Promise.all([
        res.priceSymbol ? yahooQuoteSummary(res.priceSymbol).catch(() => null) : Promise.resolve(null),
        sameSymbol || !res.analysisSymbol
          ? Promise.resolve(null)
          : yahooQuoteSummary(res.analysisSymbol).catch(() => null),
        res.analysisSymbol
          ? yahooChartCloses(res.analysisSymbol, "1y").catch(() => [])
          : Promise.resolve([]),
        yahooChartCloses("SPY", "1y").catch(() => []),
      ]);

      // Use analysis data for sector/industry (from the US underlying if CEDEAR)
      // Fall back to price data if analysis data is unavailable
      const qs = qsAnalysis ?? qsPrice;
      if (qs) {
        sector = qs.sector ?? null;
        sectorKey = qs.sectorKey ?? null;
        industry = qs.industry ?? null;
        longName = qs.longName ?? null;
      }

      // Use price data for the current price (from the specific market)
      if (qsPrice) {
        ultimoPrecio = qsPrice.currentPrice ?? null;
      }

      prices = closes.map((c) => c.close).filter((p) => p > 0);
      const spyPrices = spyCloses.map((c) => c.close).filter((p) => p > 0);

      if (prices.length >= 20) {
        const lr = logReturns(prices);
        dailyLogReturns = lr;
        retornoEsperadoAnual = mean(lr) * 252;
        volatilidadAnual = std(lr) * Math.sqrt(252);
      }

      if (prices.length >= 20 && spyPrices.length >= 20) {
        const n = Math.min(prices.length, spyPrices.length);
        const aPrices = prices.slice(-n);
        const bPrices = spyPrices.slice(-n);
        const lrA = logReturns(aPrices);
        const lrB = logReturns(bPrices);
        if (lrA.length >= 2 && lrB.length >= 2) {
          const mB = mean(lrB);
          const mA = mean(lrA);
          let cov = 0, varB = 0;
          for (let i = 0; i < lrA.length; i++) {
            cov += (lrA[i] - mA) * (lrB[i] - mB);
            varB += (lrB[i] - mB) ** 2;
          }
          cov /= (lrA.length - 1);
          varB /= (lrB.length - 1);
          if (varB > 0) beta = cov / varB;
        }
      }
    } catch { /* silent */ }

    return {
      symbol: iolTitulo.simbolo,
      yfSymbol: res.analysisSymbol,
      sector,
      sectorKey,
      industry,
      ultimoPrecio,
      beta,
      retornoEsperadoAnual,
      volatilidadAnual,
      dailyLogReturns,
      longName,
      tipo: res.tipo,
      moneda: res.moneda,
      mercado: res.mercado,
      pais: res.pais,
      error: sector == null && ultimoPrecio == null && prices.length === 0
        ? "Sin datos disponibles"
        : null,
    };
  });
