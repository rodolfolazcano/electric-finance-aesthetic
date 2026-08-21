// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeBeta, computeLogReturns, alignDates } from "./capm-hedge.math";
import { FACTORS_MASTER_LIST, AUTO_BENCHMARKS } from "./benchmarks-master";
import { optimize, type Strategy } from "./optimizer";
import { getRiskFreeRateSync } from "./risk-free-rate";
import { getHistories, getHistory, getQuotes } from "./history-cache.server";
import { clasificar } from "./diagnostico/clasificador";
import { agregarPortfolio } from "./diagnostico/agregador";
import type { PositionEnriquecida, PortfolioSummary, RentaVariableInfo } from "./diagnostico/types";

function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) out.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return out;
}

// ─── Sector lookup from sectores.json ────────────────────────────────

import sectoresData from "./sectores.json";

const _sectorLookup = new Map<string, { sector: string; industria: string }>();

function initSectorLookup() {
  if (_sectorLookup.size > 0) return;
  const data = sectoresData as Record<string, Record<string, { ticker: string; nombre: string }[]>>;
  for (const [sector, industrias] of Object.entries(data)) {
    for (const [industria, tickers] of Object.entries(industrias)) {
      for (const t of tickers) {
        const key = t.ticker.toUpperCase();
        if (!_sectorLookup.has(key)) _sectorLookup.set(key, { sector, industria });
        if (key.endsWith(".BA")) {
          const base = key.slice(0, -3);
          if (!_sectorLookup.has(base)) _sectorLookup.set(base, { sector, industria });
        }
      }
    }
  }
}

function lookupSector(ticker: string): { sector?: string; industria?: string } {
  initSectorLookup();
  const upper = ticker.toUpperCase();
  const direct = _sectorLookup.get(upper);
  if (direct) return direct;
  if (upper.endsWith(".BA")) {
    const base = upper.slice(0, -3);
    const baseResult = _sectorLookup.get(base);
    if (baseResult) return baseResult;
    const commonMap: Record<string, { sector: string; industria: string }> = {
      AAPL: { sector: "Technology", industria: "Consumer Electronics" },
      MSFT: { sector: "Technology", industria: "Software - Infrastructure" },
      GOOGL: { sector: "Communication Services", industria: "Internet Content & Information" },
      AMZN: { sector: "Consumer Cyclical", industria: "Internet Retail" },
      NVDA: { sector: "Technology", industria: "Semiconductors" },
      META: { sector: "Communication Services", industria: "Internet Content & Information" },
      TSLA: { sector: "Consumer Cyclical", industria: "Auto Manufacturers" },
      JPM: { sector: "Financial Services", industria: "Banks - Diversified" },
      V: { sector: "Financial Services", industria: "Credit Services" },
      KO: { sector: "Consumer Defensive", industria: "Beverages - Non-Alcoholic" },
      PEP: { sector: "Consumer Defensive", industria: "Beverages - Non-Alcoholic" },
      MELI: { sector: "Consumer Cyclical", industria: "Internet Retail" },
      NFLX: { sector: "Communication Services", industria: "Entertainment" },
      DIS: { sector: "Communication Services", industria: "Entertainment" },
      NU: { sector: "Financial Services", industria: "Banks - Regional" },
      XLE: { sector: "Energy", industria: "Oil & Gas Integrated" },
      XLF: { sector: "Financial Services", industria: "Financial Conglomerates" },
      XLK: { sector: "Technology", industria: "Technology Conglomerates" },
      QQQ: { sector: "Technology", industria: "Technology Conglomerates" },
      SPY: { sector: "Financial Services", industria: "Asset Management" },
    };
    if (commonMap[base]) return commonMap[base];
  }
  return {};
}

// ─── Currency detection ──────────────────────────────────────────────

// ─── Currency detection ──────────────────────────────────────────────

function detectCurrency(ticker: string): string {
  const t = ticker.toUpperCase();
  // Known CEDEARs traded in ARS
  const arsCEDEARs = new Set([
    "AAPL",
    "MSFT",
    "GOOGL",
    "AMZN",
    "NVDA",
    "META",
    "TSLA",
    "JPM",
    "V",
    "KO",
    "PEP",
    "MELI",
    "NFLX",
    "DIS",
    "NU",
    "SPY",
    "QQQ",
    "XLK",
    "XLF",
  ]);
  const base = t.endsWith(".BA") ? t.slice(0, -3) : t;
  return arsCEDEARs.has(base) ? "ARS" : "USD";
}

export interface RebalancePosition {
  ticker: string;
  nombre: string;
  cantidad: number;
  precioActual: number;
  valorizado: number;
  peso: number;
  precioPromedio?: number;
  plPct: number;
  plUSD: number;
  moneda: string;
  sector?: string;
  industria?: string;
  bestBenchmark?: string;
  bestBenchmarkR2?: number;
  bestBeta?: number;
}

export interface PortfolioMetrics {
  retornoRealAnual: number;
  volatilidadAnual: number;
  sharpe: number;
  maxDrawdown: number;
  var95: number;
  betaCartera: number;
  r2Cartera: number;
  correlacionPromedio: number;
  mejorBenchmark: string;
  equityCurve: { fecha: string; valor: number; benchmark?: number }[];
}

export interface Composicion {
  sectores: { nombre: string; peso: number; monto: number }[];
  monedas: { nombre: string; peso: number; monto: number }[];
  tipoActivo: { nombre: string; peso: number; monto: number }[];
}

export interface StrategyResult {
  name: string;
  weights: Record<string, number>;
  expectedReturn: number;
  volatility: number;
  sharpe: number;
}

export interface FrontierPoint {
  volatility: number;
  expectedReturn: number;
}

export interface EnrichedPosition {
  ticker: string;
  cantidad: number;
  valorizado: number;
  pesoPct: number;
  categoriaMacro: string;
  subtipo: string;
  sector?: string;
  industria?: string;
  precio: number;
  retornoAnual?: number;
  volatilidadAnual?: number;
  sharpe?: number;
  rsi?: number;
  sma50?: number;
  sma200?: number;
  beta?: number;
  score?: number;
  plPct?: number;
  escenarios?: {
    perdidaMax: number;
    perdidaEsperada: number;
    gananciaEsperada: number;
    gananciaMax: number;
    masProbable: number;
  };
}

export interface ScenarioData {
  perdidaMax: number;
  perdidaEsperada: number;
  gananciaEsperada: number;
  gananciaMax: number;
  masProbable: number;
}

export interface RebalanceResult {
  positions: RebalancePosition[];
  totalValorizado: number;
  capitalDisponible: number;
  portfolioMetrics?: PortfolioMetrics;
  composicion?: Composicion;
  enrichedPositions?: EnrichedPosition[];
  portfolioSummary?: PortfolioSummary;
  currentPortfolio?: { expectedReturn: number; volatility: number; sharpe: number };
  strategies: StrategyResult[];
  efficientFrontier?: FrontierPoint[];
  capmAnalysis?: {
    benchmark: string;
    beta: number;
    alpha: number;
    r2: number;
    correlation: number;
    observations: number;
  }[];
  correlationMatrix?: { tickers: string[]; values: number[][] };
  benchmarkDetails?: Record<string, { benchmark: string; r2: number; beta: number }>;
}

export const rebalanceAnalyze = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              ticker: z.string().min(1).max(50),
              cantidad: z.number().min(0),
              precioPromedio: z.number().min(0).optional(),
            }),
          )
          .min(1)
          .max(30),
        capitalAdicional: z.number().min(0).default(0),
        mode: z.enum(["all", "loss-only", "gain-only"]).default("all"),
        period: z.number().default(365),
        benchmarks: z.array(z.string().min(1)).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<RebalanceResult> => {
    const { items, capitalAdicional, mode, period } = data;

    // 1. Fetch live prices for all tickers (batched + cached)
    const positions: RebalancePosition[] = [];
    const allTickers = items.map((i) => {
      const t = i.ticker.trim().toUpperCase();
      return t.endsWith(".BA") ? t : t + ".BA";
    });

    const quotes = await getQuotes(allTickers);

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const rawTicker = item.ticker.trim().toUpperCase();
      const baTicker = rawTicker.endsWith(".BA") ? rawTicker : rawTicker + ".BA";
      const quote = quotes[baTicker];
      if (quote?.regularMarketPrice) {
        const precio = quote.regularMarketPrice as number;
        const nombre = quote?.shortName ?? quote?.longName ?? rawTicker;
        const cantidad = item.cantidad;
        const valorizado = precio * cantidad;
        const precioProm =
          item.precioPromedio && item.precioPromedio > 0 ? item.precioPromedio : undefined;
        const plPct = precioProm ? ((precio - precioProm) / precioProm) * 100 : 0;
        const plUSD = precioProm ? (precio - precioProm) * cantidad : 0;
        const { sector, industria } = lookupSector(baTicker);
        const moneda = detectCurrency(baTicker);
        positions.push({
          ticker: baTicker,
          nombre,
          cantidad,
          precioActual: precio,
          peso: 0,
          valorizado,
          precioPromedio: precioProm,
          plPct,
          plUSD,
          moneda,
          sector,
          industria,
        });
      } else {
        const { sector, industria } = lookupSector(baTicker);
        positions.push({
          ticker: baTicker,
          nombre: rawTicker,
          cantidad: item.cantidad,
          precioActual: 0,
          peso: 0,
          valorizado: 0,
          plPct: 0,
          plUSD: 0,
          moneda: "USD",
          sector,
          industria,
        });
      }
    }
    // Compute weights
    const totalValorizado = positions.reduce((s, p) => s + p.valorizado, 0);
    for (const p of positions) {
      p.peso = totalValorizado > 0 ? p.valorizado / totalValorizado : 0;
    }

    if (mode === "loss-only" || mode === "gain-only") {
      // Restrict the rebalance universe: only losing or only winning positions
      const filtered = positions.filter((p) => (mode === "loss-only" ? p.plPct < 0 : p.plPct >= 0));
      if (filtered.length === 0) {
        return {
          positions,
          totalValorizado,
          capitalDisponible: capitalAdicional,
          strategies: [],
        };
      }
      positions.length = 0;
      positions.push(...filtered);
      const restrictedTotal = positions.reduce((s, p) => s + p.valorizado, 0);
      for (const p of positions) {
        p.peso = restrictedTotal > 0 ? p.valorizado / restrictedTotal : 0;
      }
    }

    // 2. For each position, resolve .BA -> base ticker for Yahoo benchmark detection
    const benchTickers = AUTO_BENCHMARKS.filter((t) => !t.endsWith(".BA") && !t.startsWith("^"));
    const allHistoryTickers = [...allTickers, ...benchTickers.slice(0, 30)];

    const uniqueTickers = [...new Set(allHistoryTickers)];
    const histories = await getHistories(uniqueTickers, period + 60);

    // 3. Find best benchmark per position
    const benchmarkDetails: Record<string, { benchmark: string; r2: number; beta: number }> = {};
    for (const pos of positions) {
      const posHist = histories[pos.ticker];
      if (!posHist || posHist.length < 20) continue;
      const best = { benchmark: "", r2: 0, beta: 0 };
      for (const b of benchTickers) {
        const bHist = histories[b];
        if (!bHist || bHist.length < 20) continue;
        const aligned = alignDates({ [pos.ticker]: posHist, [b]: bHist });
        const p = aligned[pos.ticker];
        const bp = aligned[b];
        if (!p || !bp || p.length < 10) continue;
        const pr = dailyReturns(p);
        const br = dailyReturns(bp);
        const betaRes = computeBeta(pr, br);
        if (betaRes.r2 > best.r2) {
          best.benchmark = b;
          best.r2 = betaRes.r2;
          best.beta = betaRes.beta;
        }
      }
      if (best.benchmark) {
        pos.bestBenchmark = best.benchmark;
        pos.bestBenchmarkR2 = best.r2;
        pos.bestBeta = best.beta;
        benchmarkDetails[pos.ticker] = best;
      }
    }

    // Positions with enough history for optimization
    const validPosTickers = positions
      .filter((p) => histories[p.ticker] && histories[p.ticker].length >= 20)
      .map((p) => p.ticker);

    // Compute correlation matrix
    let correlationMatrix: { tickers: string[]; values: number[][] } | undefined;
    if (validPosTickers.length >= 2) {
      const returns: Record<string, number[]> = {};
      for (const t of validPosTickers) {
        const prices = alignDates({ [t]: histories[t] })[t];
        if (prices) returns[t] = dailyReturns(prices);
      }
      const tickers = Object.keys(returns);
      if (tickers.length >= 2) {
        const n = tickers.length;
        const values: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
        const minLen = Math.min(...tickers.map((t) => returns[t].length));
        for (let i = 0; i < n; i++) {
          for (let j = i; j < n; j++) {
            const ri = returns[tickers[i]].slice(0, minLen);
            const rj = returns[tickers[j]].slice(0, minLen);
            const betaRes = computeBeta(ri, rj);
            const corr = betaRes.correlation;
            values[i][j] = corr;
            values[j][i] = corr;
          }
        }
        correlationMatrix = { tickers, values };
      }
    }

    // 4. Portfolio-level composition
    const composicion: Composicion = { sectores: [], monedas: [], tipoActivo: [] };
    const sectorMap = new Map<string, number>();
    const monedaMap = new Map<string, number>();
    const tipoMap = new Map<string, number>();
    for (const p of positions) {
      if (p.sector) sectorMap.set(p.sector, (sectorMap.get(p.sector) || 0) + p.valorizado);
      monedaMap.set(p.moneda, (monedaMap.get(p.moneda) || 0) + p.valorizado);
      const tipo = p.ticker.endsWith(".BA") ? "CEDEAR" : "Directo";
      tipoMap.set(tipo, (tipoMap.get(tipo) || 0) + p.valorizado);
    }
    composicion.sectores = [...sectorMap.entries()]
      .map(([nombre, monto]) => ({
        nombre,
        monto,
        peso: totalValorizado > 0 ? monto / totalValorizado : 0,
      }))
      .sort((a, b) => b.peso - a.peso);
    composicion.monedas = [...monedaMap.entries()]
      .map(([nombre, monto]) => ({
        nombre,
        monto,
        peso: totalValorizado > 0 ? monto / totalValorizado : 0,
      }))
      .sort((a, b) => b.peso - a.peso);
    composicion.tipoActivo = [...tipoMap.entries()]
      .map(([nombre, monto]) => ({
        nombre,
        monto,
        peso: totalValorizado > 0 ? monto / totalValorizado : 0,
      }))
      .sort((a, b) => b.peso - a.peso);

    // 5. Portfolio metrics (risk/return from historical data)
    let portfolioMetrics: PortfolioMetrics | undefined;
    let currentPortfolio:
      | { expectedReturn: number; volatility: number; sharpe: number }
      | undefined;
    let efficientFrontier: FrontierPoint[] | undefined;
    let capmAnalysis:
      | {
          benchmark: string;
          beta: number;
          alpha: number;
          r2: number;
          correlation: number;
          observations: number;
        }[]
      | undefined;
    if (validPosTickers.length >= 2) {
      try {
        const dailyRets: number[][] = [];
        for (const t of validPosTickers) {
          const p = alignDates({ [t]: histories[t] })[t];
          if (p) dailyRets.push(dailyReturns(p));
        }
        if (dailyRets.length >= 2 && dailyRets[0].length >= 20) {
          const minLen = Math.min(...dailyRets.map((r) => r.length));
          const alignedRets = dailyRets.map((r) => r.slice(0, minLen));
          const weights = validPosTickers.map((t) => {
            const pos = positions.find((p) => p.ticker === t);
            return pos ? pos.peso : 0;
          });
          const totalWeight = weights.reduce((s, w) => s + w, 0);
          const normWeights = totalWeight > 0 ? weights.map((w) => w / totalWeight) : weights;

          // Portfolio daily returns: weighted sum
          const portDailyRets: number[] = [];
          for (let t = 0; t < minLen; t++) {
            let pr = 0;
            for (let i = 0; i < alignedRets.length; i++) pr += normWeights[i] * alignedRets[i][t];
            portDailyRets.push(pr);
          }

          const { mean, std } = await import("./optimizer");
          const meanDailyRet = mean(portDailyRets);
          const stdDailyRet = std(portDailyRets);
          const retAnual = (Math.pow(1 + meanDailyRet, 252) - 1) * 100;
          const volAnual = stdDailyRet * Math.sqrt(252) * 100;
          const rfAnual = 4.5; // tasa libre de riesgo aprox
          const sharpe = volAnual > 0 ? (retAnual - rfAnual) / volAnual : 0;

          // Max drawdown
          let cum = 1;
          let peak = 1;
          let maxDD = 0;
          for (const r of portDailyRets) {
            cum *= 1 + r;
            if (cum > peak) peak = cum;
            const dd = (cum - peak) / peak;
            if (dd < maxDD) maxDD = dd;
          }

          // VaR 95% (historical)
          const sorted = [...portDailyRets].sort((a, b) => a - b);
          const idx95 = Math.floor(sorted.length * 0.05);
          const var95 = sorted[Math.min(idx95, sorted.length - 1)] * Math.sqrt(252) * 100;

          // Portfolio beta vs best benchmark
          const bestBench = validPosTickers
            .map((t) => benchmarkDetails[t])
            .filter(Boolean)
            .reduce(
              (best, curr) => (curr!.r2 > (best?.r2 || 0) ? curr! : best!),
              null as { benchmark: string; r2: number; beta: number } | null,
            );

          let betaCartera = 0;
          let r2Cartera = 0;
          let mejorBenchmark = "";
          let correlacionPromedio = 0;

          if (bestBench) {
            // Compute portfolio return vs best benchmark
            const benchHist = histories[bestBench.benchmark];
            if (benchHist) {
              const aligned = alignDates({
                ...Object.fromEntries(validPosTickers.map((t) => [t, histories[t]])),
                [bestBench.benchmark]: benchHist,
              });
              const bp = aligned[bestBench.benchmark];
              if (bp && bp.length >= 20) {
                const br = dailyReturns(bp);
                const minB = Math.min(portDailyRets.length, br.length);
                const betaRes = computeBeta(portDailyRets.slice(0, minB), br.slice(0, minB));
                betaCartera = betaRes.beta;
                r2Cartera = betaRes.r2;
                mejorBenchmark = bestBench.benchmark;
              }
            }
          }

          // Avg pairwise correlation
          if (correlationMatrix && correlationMatrix.tickers.length >= 2) {
            let sumCorr = 0;
            let count = 0;
            for (let i = 0; i < correlationMatrix.tickers.length; i++) {
              for (let j = i + 1; j < correlationMatrix.tickers.length; j++) {
                sumCorr += correlationMatrix.values[i][j];
                count++;
              }
            }
            correlacionPromedio = count > 0 ? sumCorr / count : 0;
          }

          // Equity curve
          const equityCurve: { fecha: string; valor: number; benchmark?: number }[] = [];
          let cumVal = totalValorizado;
          const baseDate = (() => {
            const dates = validPosTickers
              .map((t) => {
                const h = histories[t];
                if (!h || h.length < minLen) return [];
                return h.slice(h.length - minLen).map((d) => d.date);
              })
              .flat();
            return dates.slice(0, minLen);
          })();
          let benchCum = 1;
          for (let t = 0; t < minLen; t++) {
            cumVal *= 1 + portDailyRets[t];
            const fecha = baseDate[t] || "";
            const entry: { fecha: string; valor: number; benchmark?: number } = {
              fecha,
              valor: Math.round(cumVal * 100) / 100,
            };
            // Add benchmark curve if available
            if (bestBench && histories[bestBench.benchmark]) {
              const bp = alignDates({ [bestBench.benchmark]: histories[bestBench.benchmark] })[
                bestBench.benchmark
              ];
              if (bp && bp.length > t + 1) {
                const bRet = (bp[t + 1] - bp[t]) / bp[t];
                benchCum *= 1 + bRet;
                entry.benchmark = Math.round(benchCum * totalValorizado * 100) / 100;
              }
            }
            equityCurve.push(entry);
          }

          portfolioMetrics = {
            retornoRealAnual: +retAnual.toFixed(2),
            volatilidadAnual: +volAnual.toFixed(2),
            sharpe: +sharpe.toFixed(2),
            maxDrawdown: +(maxDD * 100).toFixed(2),
            var95: +var95.toFixed(2),
            betaCartera: +betaCartera.toFixed(3),
            r2Cartera: +r2Cartera.toFixed(3),
            correlacionPromedio: +correlacionPromedio.toFixed(3),
            mejorBenchmark,
            equityCurve,
          };
        }
      } catch {}
    }

    // 6. Run portfolio optimization
    const strategyNames: Strategy[] = [
      "min-variance",
      "max-sharpe",
      "equal-weight",
      "inverse-vol",
      "markowitz",
    ];
    const strategies: RebalanceResult["strategies"] = [];

    if (validPosTickers.length >= 2) {
      const dailyRets: number[][] = [];
      for (const t of validPosTickers) {
        const p = alignDates({ [t]: histories[t] })[t];
        if (p) dailyRets.push(dailyReturns(p));
      }
      if (dailyRets.length >= 2 && dailyRets[0].length >= 10) {
        const minLen = Math.min(...dailyRets.map((r) => r.length));
        const alignedRets = dailyRets.map((r) => r.slice(0, minLen));
        // Transpose: returns[t][i] -> returnsByDay
        const returnsByDay: number[][] = [];
        for (let t = 0; t < minLen; t++) {
          const day: number[] = [];
          for (let i = 0; i < alignedRets.length; i++) day.push(alignedRets[i][t]);
          returnsByDay.push(day);
        }

        const { mean, std, covMatrix } = await import("./optimizer");
        const meanDaily = validPosTickers.map((_, i) => {
          const vals = alignedRets[i];
          return vals.reduce((s, v) => s + v, 0) / vals.length;
        });
        const volDaily = validPosTickers.map((_, i) => {
          const vals = alignedRets[i];
          return std(vals);
        });
        const cov = covMatrix(returnsByDay);

        for (const name of strategyNames) {
          try {
            const result = optimize(name, { meanDaily, volDaily, cov });
            const weights: Record<string, number> = {};
            for (let i = 0; i < validPosTickers.length; i++) {
              if (result.weights[i] > 0.005) weights[validPosTickers[i]] = result.weights[i];
            }
            strategies.push({
              name,
              weights,
              expectedReturn: result.expectedReturn,
              volatility: result.volatility,
              sharpe: result.sharpe,
            });
          } catch {}
        }

        // 7. Current portfolio risk/return point
        if (validPosTickers.length >= 2) {
          const weights = validPosTickers.map((t) => {
            const pos = positions.find((p) => p.ticker === t);
            return pos ? pos.peso : 0;
          });
          const totalW = weights.reduce((s, w) => s + w, 0);
          const normW = totalW > 0 ? weights.map((w) => w / totalW) : weights;
          // Portfolio variance = w^T * cov * w
          let pVar = 0;
          for (let i = 0; i < normW.length; i++) {
            for (let j = 0; j < normW.length; j++) {
              pVar += normW[i] * normW[j] * cov[i][j];
            }
          }
          const curVol = Math.sqrt(pVar) * Math.sqrt(252) * 100;
          const curRet = normW.reduce((s, w, i) => s + w * meanDaily[i], 0);
          const curRetAnual = (Math.pow(1 + curRet, 252) - 1) * 100;
          const curSharpe =
            curVol > 0 ? (curRetAnual - getRiskFreeRateSync("USD") * 100) / curVol : 0;
          currentPortfolio = {
            expectedReturn: +curRetAnual.toFixed(2),
            volatility: +curVol.toFixed(2),
            sharpe: +curSharpe.toFixed(2),
          };
        }

        // 8. Efficient frontier via Monte Carlo simulation
        const B = validPosTickers.length;
        const efficientFrontier: FrontierPoint[] = [];
        // Generate 2000 random portfolios
        for (let sim = 0; sim < 2000; sim++) {
          let raw = new Array(B).fill(0).map(() => Math.random());
          const s = raw.reduce((a, b) => a + b, 0);
          raw = raw.map((w) => w / s);
          // Apply min 0.5% weight constraint for realism
          const minW = 0.005;
          let adjusted = raw.map((w) => Math.max(w, minW));
          for (let iter = 0; iter < 10; iter++) {
            const adjS = adjusted.reduce((a, b) => a + b, 0);
            adjusted = adjusted.map((w) => w / adjS);
            adjusted = adjusted.map((w) => Math.max(w, minW));
          }
          // Portfolio variance
          let pv = 0;
          for (let i = 0; i < B; i++) {
            for (let j = 0; j < B; j++) {
              pv += adjusted[i] * adjusted[j] * cov[i][j];
            }
          }
          const vol = Math.sqrt(pv) * Math.sqrt(252) * 100;
          const ret = adjusted.reduce((s, w, i) => s + w * meanDaily[i], 0);
          const retAnual = (Math.pow(1 + ret, 252) - 1) * 100;
          efficientFrontier.push({
            volatility: +vol.toFixed(2),
            expectedReturn: +retAnual.toFixed(2),
          });
        }

        // 9. CAPM vs user-selected benchmarks
        const selectedBenches =
          data.benchmarks && data.benchmarks.length > 0 ? data.benchmarks : ["^MERV", "SPY"];
        if (validPosTickers.length >= 2) {
          capmAnalysis = [];
          const weights = validPosTickers.map((t) => {
            const pos = positions.find((p) => p.ticker === t);
            return pos ? pos.peso : 0;
          });
          const totalW = weights.reduce((s, w) => s + w, 0);
          const normW = totalW > 0 ? weights.map((w) => w / totalW) : weights;
          // Portfolio daily returns
          const minLen = Math.min(
            ...validPosTickers.map((t) => {
              const h = histories[t];
              if (!h) return 0;
              const p = alignDates({ [t]: h })[t];
              return p ? dailyReturns(p).length : 0;
            }),
          );
          const pRets: number[] = [];
          for (const t of validPosTickers) {
            const p = alignDates({ [t]: histories[t] })[t];
            if (p) {
              const dr = dailyReturns(p);
              for (let d = 0; d < minLen; d++) {
                if (pRets.length <= d) pRets[d] = 0;
                const idx = positions.findIndex((pos) => pos.ticker === t);
                if (idx >= 0) pRets[d] += normW[idx] * dr[d];
              }
            }
          }
          for (const b of selectedBenches) {
            const bHist = histories[b];
            if (!bHist || bHist.length < 20) continue;
            const bp = alignDates({ [b]: bHist })[b];
            if (!bp) continue;
            const br = dailyReturns(bp);
            const maxLen = Math.min(pRets.length, br.length);
            if (maxLen < 10) continue;
            const betaRes = computeBeta(pRets.slice(0, maxLen), br.slice(0, maxLen));
            capmAnalysis.push({
              benchmark: b,
              beta: +betaRes.beta.toFixed(3),
              alpha: +betaRes.alpha.toFixed(4),
              r2: +betaRes.r2.toFixed(4),
              correlation: +betaRes.correlation.toFixed(3),
              observations: betaRes.observations,
            });
          }
        }
      }
    }

    // 10. Enrich positions with classification + technical scores
    const enrichedPositions: EnrichedPosition[] = [];
    for (const pos of positions) {
      const cls = clasificar({
        id: pos.ticker,
        ticker: pos.ticker.replace(".BA", ""),
        cantidad: pos.cantidad,
        fuente: "Yahoo",
      });
      let score = 0;
      let rsi: number | undefined;
      let sma50: number | undefined;
      let sma200: number | undefined;
      const hist = histories[pos.ticker];
      if (hist && hist.length >= 50) {
        const prices = hist.map((h) => h.close);
        // SMA50, SMA200
        if (prices.length >= 50) {
          sma50 = prices.slice(-50).reduce((s, p) => s + p, 0) / 50;
        }
        if (prices.length >= 200) {
          sma200 = prices.slice(-200).reduce((s, p) => s + p, 0) / 200;
        }
        // RSI 14
        if (prices.length >= 15) {
          const recent14 = prices.slice(-15);
          let gains = 0,
            losses = 0;
          for (let i = 1; i < recent14.length; i++) {
            const diff = recent14[i] - recent14[i - 1];
            if (diff >= 0) gains += diff;
            else losses -= diff;
          }
          const avgGain = gains / 14,
            avgLoss = losses / 14;
          rsi = avgLoss > 0 ? 100 - 100 / (1 + avgGain / avgLoss) : 100;
        }
        // Score: RSI + trend + momentum
        const trendScore =
          sma50 && sma200
            ? (sma50 > sma200 ? 2 : -1) * (Math.abs(sma50 - sma200) / sma200) * 50
            : 0;
        const rsiScore = rsi ? (rsi > 70 ? -2 : rsi < 30 ? 2 : 0) + (rsi > 50 ? 1 : -1) * 0.5 : 0;
        const ret = dailyReturns(prices.slice(-60));
        const momScore = ret.length > 0 ? (ret.reduce((s, r) => s + r, 0) / ret.length) * 500 : 0;
        score = +Math.max(-10, Math.min(10, trendScore + rsiScore + momScore)).toFixed(1);
      }
      const betaVal = pos.bestBeta || 0;
      // Per-asset stats from historical returns
      let retornoAnual: number | undefined;
      let volatilidadAnual: number | undefined;
      let sharpe: number | undefined;
      let escenarios: EnrichedPosition["escenarios"];
      if (hist && hist.length >= 20) {
        const p = alignDates({ [pos.ticker]: hist })[pos.ticker];
        if (p && p.length >= 20) {
          const dr = dailyReturns(p);
          const { mean, std } = await import("./optimizer");
          const md = mean(dr);
          const sd = std(dr);
          retornoAnual = +((Math.pow(1 + md, 252) - 1) * 100).toFixed(2);
          volatilidadAnual = +(sd * Math.sqrt(252) * 100).toFixed(2);
          sharpe =
            volatilidadAnual && volatilidadAnual > 0
              ? +((retornoAnual - getRiskFreeRateSync("USD") * 100) / volatilidadAnual).toFixed(2)
              : 0;
          // Scenario analysis (percentiles of daily returns, annualized)
          const sorted = [...dr].sort((a, b) => a - b);
          const p5 = sorted[Math.floor(sorted.length * 0.05)] || 0;
          const p25 = sorted[Math.floor(sorted.length * 0.25)] || 0;
          const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
          const p75 = sorted[Math.floor(sorted.length * 0.75)] || 0;
          const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
          escenarios = {
            perdidaMax: +((Math.pow(1 + p5, 252) - 1) * 100).toFixed(2),
            perdidaEsperada: +((Math.pow(1 + p25, 252) - 1) * 100).toFixed(2),
            gananciaEsperada: +((Math.pow(1 + p75, 252) - 1) * 100).toFixed(2),
            gananciaMax: +((Math.pow(1 + p95, 252) - 1) * 100).toFixed(2),
            masProbable: +((Math.pow(1 + p50, 252) - 1) * 100).toFixed(2),
          };
        }
      }
      const { sector, industria } = lookupSector(pos.ticker);
      enrichedPositions.push({
        ticker: pos.ticker.replace(".BA", ""),
        cantidad: pos.cantidad,
        valorizado: pos.valorizado,
        pesoPct: pos.peso * 100,
        categoriaMacro: cls.categoriaMacro,
        subtipo: cls.subtipo,
        sector,
        industria,
        precio: pos.precioActual,
        retornoAnual,
        volatilidadAnual,
        sharpe,
        rsi,
        sma50,
        sma200,
        beta: betaVal,
        score,
        plPct: pos.plPct,
        escenarios,
      });
    }

    return {
      positions,
      totalValorizado,
      capitalDisponible: capitalAdicional,
      portfolioMetrics,
      composicion,
      enrichedPositions,
      currentPortfolio,
      strategies,
      efficientFrontier,
      capmAnalysis,
      correlationMatrix,
      benchmarkDetails,
    };
  });
