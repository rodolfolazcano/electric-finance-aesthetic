// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { linregress, pearsonR } from "./math/stats";
import {
  FACTORS_MASTER_LIST,
  ETF_HEDGE_UNIVERSE,
  CEDEAR_HEDGE_TICKERS,
  CEDEAR_RATIOS,
  BYMA_HEDGE_TICKERS,
  CEDEARS_ARS_LIST,
  CEDEARS_USD_LIST,
  getHedgeUniverseByCurrency,
  detectarMonedaPosiciones,
} from "./capm-hedge.types";
import {
  classifyHedgeReliability,
  consolidateHedgeOrders,
  computeMinimumViableCash,
  hedgeGradientDescentWithAlpha,
} from "./capm-hedge.math";
import { generatePlainLanguagePlan } from "./hedge-plain-language";
import { getHistories } from "./history-cache.server";
import type {
  HedgeResult,
  HedgePosition,
  HedgeOptimizationResult,
  HedgeUniverseAsset,
  HedgeUniverseType,
  HedgeType,
  HedgePeriod,
  HedgeOrderConsolidada,
  HedgeErrorPosicion,
  Confiabilidad,
  PlainLanguagePlan,
} from "./capm-hedge.types";

let _yf: any = null;
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  try {
    _yf = typeof YF === "function" ? new YF() : YF;
  } catch {
    _yf = YF;
  }
  try {
    _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]);
  } catch {
    /* noop */
  }
  return _yf;
}

async function fetchHistory(
  ticker: string,
  days: number,
): Promise<{ date: string; close: number }[]> {
  const yf = await getYF();
  const period2 = new Date();
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const rows = await yf.chart(ticker, { period1, period2, interval: "1d" });
    const quotes: Array<{ date?: Date | null; close?: number | null }> = rows?.quotes ?? [];
    return quotes
      .filter((q) => q.date != null && q.close != null)
      .map((q) => ({
        date: (q.date as Date).toISOString().slice(0, 10),
        close: q.close as number,
      }));
  } catch {
    return [];
  }
}

function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) out.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return out;
}

function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
  }
  return out;
}

function alignDates(
  series: Record<string, { date: string; close: number }[]>,
): Record<string, number[]> {
  const tickers = Object.keys(series);
  if (tickers.length === 0) return {};
  const dateSets = tickers.map((t) => new Set(series[t].map((r) => r.date)));
  const common = series[tickers[0]]
    .map((r) => r.date)
    .filter((d) => dateSets.every((s) => s.has(d)));
  const result: Record<string, number[]> = {};
  for (const t of tickers) {
    const map: Record<string, number> = {};
    for (const r of series[t]) map[r.date] = r.close;
    result[t] = common.map((d) => map[d]);
  }
  return result;
}

function projectSimplex(w: number[], budget: number): number[] {
  const totalAbs = w.reduce((s, x) => s + Math.abs(x), 0);
  if (totalAbs > budget && totalAbs > 1e-12) {
    const scale = budget / totalAbs;
    return w.map((x) => x * scale);
  }
  return w;
}

function computeBeta(
  posRet: number[],
  benchRet: number[],
): {
  beta: number;
  alpha: number;
  r2: number;
  pValue: number;
  stdErr: number;
  correlation: number;
  observations: number;
} {
  const n = Math.min(posRet.length, benchRet.length);
  if (n < 5)
    return {
      beta: 0,
      alpha: 0,
      r2: 0,
      pValue: 1,
      stdErr: Infinity,
      correlation: 0,
      observations: n,
    };
  const x = benchRet.slice(0, n);
  const y = posRet.slice(0, n);
  const reg = linregress(x, y);
  const r = pearsonR(x, y);
  return {
    beta: reg.slope,
    alpha: reg.intercept,
    r2: reg.r2,
    pValue: reg.pValue,
    stdErr: reg.stdErr,
    correlation: r,
    observations: n,
  };
}

// ─── Resolución de posiciones manuales ──────────────────────────────

const MANUAL_POSITION_SCHEMA = z.object({
  ticker: z.string().min(1).max(50),
  cantidad: z.number().min(0),
  precioPromedio: z.number().min(0).optional(),
});

export const resolveManualPositions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      items: z.array(MANUAL_POSITION_SCHEMA).min(1).max(30),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const results: HedgePosition[] = [];
    const errors: Array<{ ticker: string; motivo: string }> = [];
    const yf = await getYF();

    const NYSE_LIST = new Set(["GGAL", "BMA", "SUPV", "YPF", "PAM", "EDN", "TEO", "CEPU", "IRS", "LOMA", "CRESY", "BIOX"]);
    const NASDAQ_LIST = new Set(["MELI", "MERC", "DESK"]);

    for (const item of data.items) {
      try {
        const rawTicker = item.ticker.toUpperCase().trim();
        const hasBA = rawTicker.endsWith(".BA");
        const baseTicker = hasBA ? rawTicker.slice(0, -3) : rawTicker;

        // Intentar quote en Yahoo Finance
        let yfSymbol = rawTicker;
        let quote: any;
        try {
          quote = await yf.quote(yfSymbol);
          if (!quote?.regularMarketPrice) {
            // Fallback: intentar sin .BA o con .BA
            yfSymbol = hasBA ? baseTicker : `${baseTicker}.BA`;
            quote = await yf.quote(yfSymbol);
          }
        } catch {
          // Sin datos Yahoo → excludedTickers
          errors.push({ ticker: rawTicker, motivo: "Sin cotización disponible en Yahoo Finance" });
          continue;
        }

        if (!quote?.regularMarketPrice || (quote?.regularMarketPrice ?? 0) <= 0) {
          errors.push({ ticker: rawTicker, motivo: "Precio inválido o cero" });
          continue;
        }

        const precioUSD = quote.regularMarketPrice as number;
        const currency = (quote.currency as string) ?? "USD";
        const moneda: "ARS" | "USD" = currency === "ARS" ? "ARS" : "USD";

        // Inferir mercadoOrigen mediante registro canónico
        let mercadoOrigen: "BCBA-LOCAL" | "BCBA-CEDEAR" | "NYSE" | "NASDAQ" = "NYSE";
        if (hasBA) {
          const ratio = CEDEAR_RATIOS[baseTicker];
          mercadoOrigen = ratio ? "BCBA-CEDEAR" : "BCBA-LOCAL";
        } else if (NASDAQ_LIST.has(baseTicker)) {
          mercadoOrigen = "NASDAQ";
        } else if (!NYSE_LIST.has(baseTicker)) {
          mercadoOrigen = "NYSE";
        }

        const cantidad = item.cantidad;
        const CCL_FALLBACK = 1200;
        const precioEnMonedaLocal = precioUSD; // precio por acción en moneda local (ARS o USD)
        const precioUSDporAccion = moneda === "ARS"
          ? precioEnMonedaLocal / CCL_FALLBACK
          : precioEnMonedaLocal;
        const valorUSD = moneda === "ARS"
          ? (precioEnMonedaLocal * cantidad) / CCL_FALLBACK  // total ARS / CCL
          : precioEnMonedaLocal * cantidad;

        // Si el usuario proveyó precioPromedio (en USD), calcular plPct real
        const precioPromedioUSD = item.precioPromedio != null && item.precioPromedio > 0
          ? item.precioPromedio
          : 0;
        const ultimoPrecioUSD = precioUSDporAccion;
        const plPct = item.precioPromedio != null && item.precioPromedio > 0
          ? +(((ultimoPrecioUSD - precioPromedioUSD) / precioPromedioUSD) * 100).toFixed(4)
          : 0;
        const plUSD = item.precioPromedio != null && item.precioPromedio > 0
          ? +((ultimoPrecioUSD - precioPromedioUSD) * cantidad).toFixed(4)
          : 0;

        results.push({
          ticker: rawTicker,
          description: quote.shortName ?? quote.longName ?? rawTicker,
          cantidad,
          precioPromedio: +precioPromedioUSD.toFixed(4),
          ultimoPrecio: +ultimoPrecioUSD.toFixed(4),
          valorUSD: +valorUSD.toFixed(4),
          valorARS: moneda === "ARS" ? +(precioEnMonedaLocal * cantidad).toFixed(2) : 0,
          moneda,
          plPct,
          plUSD,
          selected: item.precioPromedio != null && item.precioPromedio > 0,
          mercadoOrigen,
        });
      } catch (e) {
        errors.push({ ticker: item.ticker, motivo: e instanceof Error ? e.message : "Error desconocido" });
      }
    }

    return { data: results, errors };
  });

const LIQUID_CEDEARS_CCL = ["AAPL", "MSFT", "KO", "GGAL"];

export const fetchAverageCCL = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const yf = await getYF();
    const ccls: number[] = [];
    for (const t of LIQUID_CEDEARS_CCL) {
      const ratio = CEDEAR_RATIOS[t];
      if (!ratio) continue;
      try {
        const q = await yf.quote(t);
        const qba = await yf.quote(t + ".BA");
        if (q?.regularMarketPrice && qba?.regularMarketPrice) {
          ccls.push(qba.regularMarketPrice / (q.regularMarketPrice / ratio));
        }
      } catch { /* skip ticker */ }
    }
    if (ccls.length === 0) return { ccl: 1200 };
    return { ccl: +(ccls.reduce((s, v) => s + v, 0) / ccls.length).toFixed(2) };
  } catch {
    return { ccl: 1200 };
  }
});

const positionSchema = z.object({
  ticker: z.string().min(1),
  description: z.string().default(""),
  valorUSD: z.number().min(0),
  moneda: z.string().default("USD"),
});

export const computeHedge = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        positions: z.array(positionSchema).min(1).max(30),
        benchmarks: z.array(z.string().min(1)).min(1).max(100),
        universe: z.enum(["todo-byma", "solo-cedears", "solo-etfs", "manual"]).default("todo-byma"),
        manualUniverseTickers: z.string().default(""),
        period: z.number().default(365),
        lambda: z.number().min(0).max(1).default(0.1),
        availableCash: z.number().min(0).default(1),
        hedgeType: z.enum(["delta-neutral", "beta-neutral", "ambas"]).default("ambas"),
        tasaCaucionAnual: z.number().min(0).max(1).default(0.35),
        hedgeMode: z.enum(["pure", "alpha"]).default("pure"),
        gamma: z.number().min(0).max(5).default(0),
        tickerClusters: z.array(z.object({
          ticker: z.string(),
          bestFactor: z.string(),
          bestFactorName: z.string(),
          bestR2: z.number(),
          bestBeta: z.number(),
          bestAlpha: z.number(),
          bestAlphaPValue: z.number(),
          fits: z.array(z.object({
            factor: z.string(),
            factorName: z.string(),
            beta: z.number(),
            correlation: z.number(),
            r2: z.number(),
            alpha: z.number(),
            alphaPValue: z.number(),
            observations: z.number(),
          })).optional(),
        })).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<HedgeResult> => {
    const {
      positions,
      benchmarks,
      universe,
      manualUniverseTickers,
      period,
      lambda,
      availableCash,
      tasaCaucionAnual,
      hedgeMode,
      gamma,
      tickerClusters,
    } = data;

    // Construir mapa ticker → cluster (bestFactor)
    const clusterMap = new Map<string, { bestFactor: string; bestAlpha: number; bestAlphaPValue: number }>();
    if (tickerClusters) {
      for (const c of tickerClusters) {
        clusterMap.set(c.ticker, { bestFactor: c.bestFactor, bestAlpha: c.bestAlpha, bestAlphaPValue: c.bestAlphaPValue });
      }
    }

    const allTickers = new Set<string>();
    for (const p of positions) allTickers.add(p.ticker);
    for (const b of benchmarks) allTickers.add(b);

    // Detectar monedas del portafolio y construir universo de cobertura por moneda
    const monedaPortafolio = detectarMonedaPosiciones(positions);
    let universeTickers: string[] = [];
    if (tickerClusters) {
      // Cluster-based universe: todos los tickers de todos los clusters relevantes
      const factorSet = new Set<string>();
      for (const p of positions) {
        const cl = clusterMap.get(p.ticker);
        if (cl?.bestFactor) factorSet.add(cl.bestFactor);
      }
      for (const c of tickerClusters) {
        if (factorSet.has(c.bestFactor)) universeTickers.push(c.ticker);
      }
      for (const b of benchmarks) universeTickers.push(b);
    } else if (universe === "manual") {
      universeTickers = manualUniverseTickers
        .split(/[\s,]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
    } else if (monedaPortafolio === "ARS") {
      universeTickers = getHedgeUniverseByCurrency("ARS", universe);
    } else if (monedaPortafolio === "USD") {
      universeTickers = getHedgeUniverseByCurrency("USD", universe);
    } else {
      universeTickers = [
        ...getHedgeUniverseByCurrency("ARS", universe),
        ...getHedgeUniverseByCurrency("USD", universe),
      ];
    }

    for (const ut of universeTickers) allTickers.add(ut);

    const tickerList = [...allTickers];
    const histories = await getHistories(tickerList, period + 60);

    // Fetch .BA equivalents for non-BA CEDEARs to compute CCL
    const baTickers = CEDEAR_HEDGE_TICKERS
      .filter((t) => allTickers.has(t) && !t.endsWith(".BA"))
      .map((t) => t + ".BA");
    if (baTickers.length > 0) {
      const baHistories = await getHistories(baTickers, period + 60);
      for (const [t, data] of Object.entries(baHistories)) {
        histories[t] = data;
      }
    }

    const excludedTickers: string[] = [];
    for (const t of tickerList) {
      if (!histories[t] || histories[t].length < 20) {
        excludedTickers.push(t);
      }
    }

    const validPositions = positions.filter(
      (p) => histories[p.ticker] && histories[p.ticker].length >= 20,
    );
    const existingUniverses = Object.keys(histories);

    const results: HedgeOptimizationResult[] = [];
    const universoTabla: HedgeUniverseAsset[] = [];
    const failedPositions: HedgeErrorPosicion[] = [];

    // Share availableCash equally across positions
    const budgetPerPosition = validPositions.length > 0 ? availableCash / validPositions.length : 0;

    // Mapeo sector→benchmark tentativo basado en FACTORS_MASTER_LIST
    const SECTOR_BENCHMARK_MAP: Record<string, string[]> = {
      Technology: ["XLK", "QQQ"],
      "Communication Services": ["XLC"],
      "Consumer Cyclical": ["XLY"],
      "Consumer Defensive": ["XLP"],
      Energy: ["XLE"],
      "Financial Services": ["XLF"],
      Industrials: ["XLI"],
      "Basic Materials": ["XLB"],
      Healthcare: ["XLV"],
      Utilities: ["XLU", "XLRE"],
    };

    for (const pos of validPositions) {
      let posResult: HedgeOptimizationResult | null = null;
      try {
        const posHist = histories[pos.ticker];
        const minLen = Math.max(20, Math.floor(period * 0.3));
        if (!posHist || posHist.length < minLen) throw new Error("Historial insuficiente para " + pos.ticker);

        const posPrices = alignDates({ [pos.ticker]: posHist })[pos.ticker];
        if (!posPrices || posPrices.length < 10) throw new Error("Datos alineados insuficientes para " + pos.ticker);
        const posRet = dailyReturns(posPrices);

        const benchResults = benchmarks
          .filter((b) => histories[b] && histories[b].length >= minLen)
          .map((b) => {
            const aligned = alignDates({ [pos.ticker]: posHist, [b]: histories[b] });
            const p = aligned[pos.ticker];
            const bp = aligned[b];
            if (!p || !bp || p.length < 10) return null;
            const pr = dailyReturns(p);
            const br = dailyReturns(bp);
            const betaRes = computeBeta(pr, br);
            return { benchmark: b, ...betaRes };
          })
          .filter(Boolean) as Array<{
          benchmark: string;
          beta: number;
          alpha: number;
          r2: number;
          pValue: number;
          stdErr: number;
          correlation: number;
          observations: number;
        }>;

        if (benchResults.length === 0) throw new Error("Ningún benchmark válido para " + pos.ticker);

        // Aplicar bonus sectorial: si el ticker pertenece a un sector conocido,
        // dar prioridad a benchmarks del mismo sector
        const factorInfo = FACTORS_MASTER_LIST[pos.ticker];
        const posibleSector = factorInfo?.cat ?? "";
        const bonusSector = SECTOR_BENCHMARK_MAP[posibleSector] ?? [];

        const benchResultsWithScore = benchResults
          .filter((b) => b.r2 >= 0.50)
          .map((b) => {
            let sectorBonus = 0;
            if (bonusSector.some((s) => b.benchmark === s || b.benchmark.includes(s))) {
              sectorBonus = 0.05;
            }
            const effectiveScore = b.r2 + sectorBonus;
            return { ...b, effectiveScore };
          })
          .filter((b) => b.effectiveScore > 0);

        if (benchResultsWithScore.length === 0) throw new Error("Benchmarks con R² insuficiente para " + pos.ticker);
        benchResultsWithScore.sort((a, b) => b.effectiveScore - a.effectiveScore);
        const best = benchResultsWithScore[0];

        const bestBenchPrices = alignDates({
          [pos.ticker]: posHist,
          [best.benchmark]: histories[best.benchmark],
        });
        const bestPosPrices = bestBenchPrices[pos.ticker];
        const bestBenchPricesArr = bestBenchPrices[best.benchmark];

        if (!bestPosPrices || !bestBenchPricesArr || bestPosPrices.length < 10)
          throw new Error("Error alinear con benchmark " + best.benchmark);
        const posRetFinal = dailyReturns(bestPosPrices);
        const benchRetFinal = dailyReturns(bestBenchPricesArr);
        const betaResFinal = computeBeta(posRetFinal, benchRetFinal);

        const confiabilidad = classifyHedgeReliability(best.r2);

        // Build equity curves (rebased to 100)
        const commonDates = posHist
          .map((r) => r.date)
          .filter((d) => histories[best.benchmark]?.some((h) => h.date === d));
        const firstPos = bestPosPrices[0];
        const firstBench = bestBenchPricesArr[0];
        const equityCurve = commonDates.map((d, i) => ({
          date: d,
          position: firstPos > 0 ? +((100 * bestPosPrices[i]) / firstPos).toFixed(4) : 100,
          benchmark: firstBench > 0 ? +((100 * bestBenchPricesArr[i]) / firstBench).toFixed(4) : 100,
        }));

        const hedgeType = data.hedgeType;
        // Si hay datos de clustering, restringir al cluster de la posición
        const posClusterFactor = clusterMap.get(pos.ticker)?.bestFactor;
        const clusterTickers = posClusterFactor && tickerClusters
          ? tickerClusters.filter((c) => c.bestFactor === posClusterFactor).map((c) => c.ticker)
          : null;

        let hedgeCandidates = existingUniverses
          .filter((t) => {
            if (t === pos.ticker) return false;
            if (benchmarks.includes(t)) return false;
            if (positions.some((p) => p.ticker === t)) return false;
            // Si estamos en modo cluster, el candidato debe estar en el mismo cluster
            if (clusterTickers) return clusterTickers.includes(t);
            return true;
          })
          .map((t) => {
            const aligned = alignDates({ [pos.ticker]: posHist, [t]: histories[t] });
            const p = aligned[pos.ticker];
            const hp = aligned[t];
            if (!p || !hp || p.length < 10) return null;
            const pr = dailyReturns(p);
            const hr = dailyReturns(hp);
            const res = computeBeta(pr, hr);
            if (Math.abs(res.beta) < 0.01) return null;
            const isCedearBA = CEDEARS_ARS_LIST.includes(t) || CEDEARS_USD_LIST.includes(t);
            const tipo = (CEDEAR_HEDGE_TICKERS.includes(t) || isCedearBA
              ? "CEDEAR"
              : ETF_HEDGE_UNIVERSE.includes(t)
                ? "ETF"
                : "BYMA") as "BYMA" | "CEDEAR" | "ETF";
            const baseTicker = t.replace(/\.BA$/, "");
            const ratio = CEDEAR_RATIOS[baseTicker] ?? CEDEAR_RATIOS[t];
            let cclImplicito: number | undefined;
            if (tipo === "CEDEAR" && ratio) {
              const baHist = t.endsWith(".BA") ? histories[t] : histories[t + ".BA"];
              const usHist = t.endsWith(".BA") ? histories[baseTicker] : histories[t];
              if (baHist && usHist && baHist.length > 0 && usHist.length > 0) {
                const usLatest = usHist[usHist.length - 1]?.close;
                const baLatest = baHist[baHist.length - 1]?.close;
                if (usLatest && baLatest) {
                  cclImplicito = baLatest / (usLatest / ratio);
                }
              }
            }
            const SHORT_WHITELIST = ["GGAL", "YPFD", "PAMP", "ALUA", "TXAR"];
            const shortDisponible = tipo === "BYMA" ? SHORT_WHITELIST.includes(t) : true;
            const baBaseTicker = t.replace(/\.BA$/, "");
            return {
              ticker: t,
              nombre: FACTORS_MASTER_LIST[t]?.name ?? FACTORS_MASTER_LIST[baBaseTicker]?.name ?? t,
              tipo,
              beta: res.beta,
              correlation: res.correlation,
              r2: res.r2,
              selected: false,
              ratio,
              cclImplicito,
              shortDisponible,
            };
          })
          .filter(Boolean) as HedgeUniverseAsset[];

        // Filtrar por moneda: la cobertura debe ser en la misma moneda que el activo
        const monedaPos = pos.moneda ?? "USD";
        hedgeCandidates = hedgeCandidates.filter((h) => {
          if (monedaPos === "ARS") return h.tipo === "BYMA";
          return h.tipo === "CEDEAR" || h.tipo === "ETF";
        });

        // Score each candidate: weighted by correlation, R², beta alignment, and alpha stability
        const posBeta = betaResFinal.beta;
        const scored = hedgeCandidates
          .map((h) => {
            const corrScore = Math.abs(h.correlation);
            const r2Score = h.r2;
            const betaScore = Math.max(0, 1 - Math.abs(h.beta - posBeta) / (Math.abs(posBeta) + 0.1));
            const alphaScore = Math.max(0, 1 - Math.abs(h.beta - 1) * 0.5);
            const totalScore = corrScore * 0.3 + r2Score * 0.25 + betaScore * 0.25 + alphaScore * 0.2;
            return { candidate: h, score: Math.round(totalScore * 1000) / 1000 };
          })
          .filter((s) => s.score > 0.1);
        scored.sort((a, b) => b.score - a.score);
        hedgeCandidates = scored.slice(0, 30).map((s) => s.candidate);

        // Excluir activos sin short disponible (BCBA-LOCAL fuera de whitelist)
        hedgeCandidates = hedgeCandidates.filter((h) => h.shortDisponible !== false);

        universoTabla.push(...hedgeCandidates);

        const positionDeltaUSD = pos.valorUSD;
        const positionBetaUSD = betaResFinal.beta * positionDeltaUSD;

        const posCluster = clusterMap.get(pos.ticker);
        const useAlphaMode = hedgeMode === "alpha" && gamma > 0 && posCluster != null;
        const weights = useAlphaMode
          ? hedgeGradientDescentWithAlpha(
              hedgeCandidates.map((h) => ({
                beta: h.beta,
                alpha: clusterMap.get(h.ticker)?.bestAlpha ?? 0,
              })),
              hedgeType === "beta-neutral" ? 0 : positionDeltaUSD,
              hedgeType === "delta-neutral" ? 0 : positionBetaUSD,
              budgetPerPosition,
              lambda,
              gamma,
            )
          : hedgeGradientDescent(
              hedgeCandidates.map((h) => ({ beta: h.beta })),
              hedgeType === "beta-neutral" ? 0 : positionDeltaUSD,
              hedgeType === "delta-neutral" ? 0 : positionBetaUSD,
              budgetPerPosition,
              lambda,
            );

        // Compute average CCL from CEDEAR candidates for BYMA conversion
        const ccls = hedgeCandidates.map((h) => h.cclImplicito).filter((c): c is number => c != null && c > 0);
        const avgCCL = ccls.length > 0 ? ccls.reduce((s, v) => s + v, 0) / ccls.length : 1200;

        const hedgeAssets = hedgeCandidates
          .map((h, i) => {
            const montoUSD = +(Math.abs(weights[i]) * 1).toFixed(4);
            let cantidadOperar: number | undefined;
            let mercadoEjecucion: "BYMA" | "NYSE" | "NASDAQ" = "NYSE";
            const baseTicker = h.ticker.replace(/\.BA$/, "");
            const baHist = h.ticker.endsWith(".BA") ? histories[h.ticker] : histories[h.ticker + ".BA"];
            const usHist = h.ticker.endsWith(".BA") ? histories[baseTicker] : histories[h.ticker];
            const isUsdCedear = h.ticker.endsWith(".BA") && baseTicker.endsWith("D");
            if (h.tipo === "CEDEAR") {
              mercadoEjecucion = "BYMA";
              const baPrice = baHist?.[baHist.length - 1]?.close;
              if (isUsdCedear) {
                if (baPrice && baPrice > 0) {
                  cantidadOperar = Math.round(montoUSD / baPrice);
                }
              } else {
                const ccl = h.cclImplicito ?? avgCCL;
                if (ccl > 0 && baPrice && baPrice > 0) {
                  cantidadOperar = Math.round((montoUSD * ccl) / baPrice);
                }
              }
            } else if (h.tipo === "BYMA") {
              mercadoEjecucion = "BYMA";
              const arsPrice = baHist?.[baHist.length - 1]?.close ?? usHist?.[usHist.length - 1]?.close;
              if (avgCCL > 0 && arsPrice && arsPrice > 0) {
                cantidadOperar = Math.round((montoUSD * avgCCL) / arsPrice);
              }
            } else if (h.tipo === "ETF") {
              mercadoEjecucion = (h.ticker.startsWith("QQQ") || h.ticker.startsWith("TECH"))
                ? "NASDAQ" : "NYSE";
              const etfPrice = usHist?.[usHist.length - 1]?.close;
              if (etfPrice && etfPrice > 0) {
                cantidadOperar = Math.round(montoUSD / etfPrice);
              }
            }
            const noEjecutable = (cantidadOperar ?? 0) === 0 && montoUSD > 0.001;
            return {
              ticker: h.ticker,
              nombre: h.nombre,
              tipo: h.tipo,
              montoUSD,
              beta: h.beta,
              correlation: h.correlation,
              cantidadOperar,
              mercadoEjecucion,
              noEjecutable,
            };
          })
          .filter((a) => a.montoUSD > 0.00001);

        const sumW = weights.reduce((s, v) => s + v, 0);
        const sumBetaW = weights.reduce((s, v, i) => s + v * hedgeCandidates[i].beta, 0);
        const totalCost = weights.reduce((s, v) => s + Math.abs(v), 0);

        const deltaNeto = sumW + positionDeltaUSD;
        const betaNeto = sumBetaW + positionBetaUSD;
        const deltaReductionPct =
          positionDeltaUSD > 0
            ? ((positionDeltaUSD - Math.abs(deltaNeto)) / positionDeltaUSD) * 100
            : 0;
        const betaReductionPct =
          Math.abs(positionBetaUSD) > 0
            ? ((Math.abs(positionBetaUSD) - Math.abs(betaNeto)) / Math.abs(positionBetaUSD)) * 100
            : 0;

        const leverageBrutoVal = totalCost / (availableCash || 1);
        const leverageNetoVal = Math.max(0, totalCost - 0) / (availableCash || 1);
        const depositoMinimo = computeMinimumViableCash(hedgeAssets);
        const ejecutableFlag = !hedgeAssets.some((a) => a.noEjecutable);

        posResult = {
          position: {
            ticker: pos.ticker,
            description: pos.description || pos.ticker,
            valorUSD: pos.valorUSD,
            bestBenchmark: best.benchmark,
            bestBenchmarkR2: best.r2,
            bestBenchmarkConfiabilidad: confiabilidad,
            beta: betaResFinal.beta,
            deltaUSD: positionDeltaUSD,
            betaUSD: positionBetaUSD,
            alpha: betaResFinal.alpha,
            pValue: betaResFinal.pValue,
            observations: betaResFinal.observations,
            equityCurve,
          },
          hedgeAssets,
          postHedge: {
            deltaNeto: +deltaNeto.toFixed(4),
            betaNeto: +betaNeto.toFixed(4),
            deltaReductionPct: +deltaReductionPct.toFixed(1),
            betaReductionPct: +betaReductionPct.toFixed(1),
            totalCostoUSD: +totalCost.toFixed(4),
            saldoRestante: +(budgetPerPosition - totalCost).toFixed(4),
            leverageBruto: +leverageBrutoVal.toFixed(2),
            leverageNeto: +leverageNetoVal.toFixed(2),
            costoFinanciamiento: totalCost > availableCash
              ? +((totalCost / (availableCash || 1) - 1) * availableCash * (tasaCaucionAnual ?? 0.35)).toFixed(2)
              : 0,
            ejecutable: ejecutableFlag,
            depositoMinimoSugerido: +depositoMinimo.toFixed(2),
          },
        };
      } catch (e) {
        failedPositions.push({
          ticker: pos.ticker,
          motivo: e instanceof Error ? e.message : "Error desconocido",
        });
        continue;
      }

      if (posResult) results.push(posResult);
    }

    const uniqueUniverseMap = new Map<string, HedgeUniverseAsset>();
    for (const u of universoTabla) {
      if (!uniqueUniverseMap.has(u.ticker)) uniqueUniverseMap.set(u.ticker, u);
    }
    const uniqueUniverso = [...uniqueUniverseMap.values()];

    const totalCosto = results.reduce((s, r) => s + r.postHedge.totalCostoUSD, 0);
    const coberturaParcial = totalCosto > availableCash;
    const coberturaPct =
      totalCosto > 0 && availableCash > 0
        ? Math.min(100, Math.round((availableCash / totalCosto) * 100))
        : 100;

    // Consolidar órdenes del mismo ticker a través de todas las posiciones
    type FlatHedgeAsset = {
      ticker: string;
      montoUSD: number;
      cantidadOperar?: number;
      tipo: string;
      mercadoEjecucion?: string;
      noEjecutable?: boolean;
    };
    const allHedgeAssets: (FlatHedgeAsset & { posTicker: string })[] = results.flatMap((r) =>
      r.hedgeAssets.map((a) => ({
        ticker: a.ticker,
        montoUSD: a.montoUSD,
        cantidadOperar: a.cantidadOperar,
        tipo: a.tipo,
        mercadoEjecucion: a.mercadoEjecucion,
        noEjecutable: a.noEjecutable,
        posTicker: r.position.ticker,
      })),
    );
    const ordenesConsolidadas = consolidateHedgeOrders(allHedgeAssets.map((a) => ({
      ticker: a.ticker,
      montoUSD: a.montoUSD,
      cantidadOperar: a.cantidadOperar,
      tipo: a.tipo,
      mercadoEjecucion: a.mercadoEjecucion ?? "NYSE",
      noEjecutable: a.noEjecutable,
      posicionesQueLoUsan: a.posTicker,
    })));

    // ── Portfolio equity curve (recomendación vs benchmark promedio) ──
    let portfolioEquityCurve: { date: string; portfolio: number; benchmark: number }[] | undefined;
    try {
      // Juntar todos los hedgeAssets únicos con sus montos
      const hedgeAssetTotals = new Map<string, number>();
      for (const a of allHedgeAssets) {
        hedgeAssetTotals.set(a.ticker, (hedgeAssetTotals.get(a.ticker) ?? 0) + a.montoUSD);
      }
      const uniqueHedgeTickers = [...hedgeAssetTotals.keys()].filter((t) => histories[t] && histories[t].length >= 20);
      if (uniqueHedgeTickers.length > 0) {
        // Obtener fechas comunes entre todos los activos de cobertura
        const dateSets = uniqueHedgeTickers.map((t) => new Set(histories[t].map((r) => r.date)));
        const firstSet = dateSets[0];
        const commonDates = firstSet ? [...firstSet].filter((d) => dateSets.every((s) => s.has(d))).sort() : [];
        // También incluir fechas del primer benchmark disponible
        const benchmarkDates = benchmarks
          .filter((b) => histories[b])
          .map((b) => new Set(histories[b].map((r) => r.date)));
        if (benchmarkDates.length > 0) {
          const bmDates = [...benchmarkDates[0]].filter((d) => benchmarkDates.every((s) => s.has(d)));
          // Intersect con commonDates
          const bmSet = new Set(bmDates);
          const merged = commonDates.filter((d) => bmSet.has(d));
          if (merged.length > 20) {
            // Portfolio value: weighted sum of prices
            const totalExposure = uniqueHedgeTickers.reduce((s, t) => s + Math.abs(hedgeAssetTotals.get(t) ?? 0), 0) || 1;
            const portValues = merged.map((date) => {
              let v = 0;
              for (const t of uniqueHedgeTickers) {
                const priceMap = new Map(histories[t].map((r) => [r.date, r.close]));
                const price = priceMap.get(date) ?? 0;
                const weight = (hedgeAssetTotals.get(t) ?? 0) / totalExposure;
                v += weight * price;
              }
              return v;
            });
            // Benchmark: promedio simple de benchmarks disponibles
            const validBenchmarks = benchmarks.filter((b) => histories[b]);
            const benchValues = merged.map((date) => {
              let v = 0;
              for (const b of validBenchmarks) {
                const priceMap = new Map(histories[b].map((r) => [r.date, r.close]));
                v += priceMap.get(date) ?? 0;
              }
              return v / (validBenchmarks.length || 1);
            });
            // Normalizar a base 100
            const p0 = portValues[0] || 1;
            const b0 = benchValues[0] || 1;
            portfolioEquityCurve = merged.map((date, i) => ({
              date,
              portfolio: +((portValues[i] / p0) * 100).toFixed(4),
              benchmark: +((benchValues[i] / b0) * 100).toFixed(4),
            }));
          }
        }
      }
    } catch { /* equity curve no crítica */ }

    return {
      results,
      universoTabla: uniqueUniverso.sort((a, b) => b.r2 - a.r2),
      totalCosto,
      totalSaldoDisponible: availableCash,
      coberturaParcial,
      coberturaPct: +coberturaPct.toFixed(1),
      excludedTickers,
      failedPositions,
      ordenesConsolidadas,
      alphaDisclaimer: hedgeMode === "alpha"
        ? "ATENCIÓN (CNV): La proyección de alfa en Modo 2 es una estimación estadística in-sample basada en datos históricos. No constituye promesa ni garantía de rendimiento futuro. Consulte con un asesor certificado antes de operar."
        : undefined,
      portfolioEquityCurve,
    };
  });

function hedgeGradientDescent(
  hedgeCandidates: Array<{ beta: number }>,
  positionDeltaUSD: number,
  positionBetaUSD: number,
  availableCash: number,
  lambda: number,
  maxIter = 1500,
): number[] {
  const n = hedgeCandidates.length;
  if (n === 0) return [];

  let w = new Array(n).fill(0);
  let lr = 0.05;
  const decay = lr / maxIter;

  for (let iter = 0; iter < maxIter; iter++) {
    const sumW = w.reduce((s, v) => s + v, 0);
    const sumBetaW = w.reduce((s, v, i) => s + v * hedgeCandidates[i].beta, 0);

    const grad = w.map((_, i) => {
      const deltaTerm = 2 * (sumW + positionDeltaUSD);
      const betaTerm = 2 * (sumBetaW + positionBetaUSD) * hedgeCandidates[i].beta;
      const regTerm = 2 * lambda * w[i];
      return deltaTerm + betaTerm + regTerm;
    });

    for (let i = 0; i < n; i++) {
      w[i] -= lr * grad[i];
    }

    w = projectSimplex(w, availableCash);
    lr -= decay;
  }

  return w;
}

export const getPlainLanguageHedgePlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        positions: z.array(positionSchema).min(1).max(30),
        benchmarks: z.array(z.string().min(1)).min(1).max(100),
        universe: z.enum(["todo-byma", "solo-cedears", "solo-etfs", "manual"]).default("todo-byma"),
        manualUniverseTickers: z.string().default(""),
        period: z.number().default(365),
        lambda: z.number().min(0).max(1).default(0.1),
        availableCash: z.number().min(0).default(1),
        hedgeType: z.enum(["delta-neutral", "beta-neutral", "ambas"]).default("ambas"),
        tasaCaucionAnual: z.number().min(0).max(1).default(0.35),
        portfolioValorizado: z.number().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<PlainLanguagePlan> => {
    const hedgeResult = await computeHedge({
      data: {
        positions: data.positions,
        benchmarks: data.benchmarks,
        universe: data.universe,
        manualUniverseTickers: data.manualUniverseTickers,
        period: data.period,
        lambda: data.lambda,
        availableCash: data.availableCash,
        hedgeType: data.hedgeType,
        tasaCaucionAnual: data.tasaCaucionAnual,
      },
    });
    return generatePlainLanguagePlan(hedgeResult, data.availableCash, data.portfolioValorizado);
  });
