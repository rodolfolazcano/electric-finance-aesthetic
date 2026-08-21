// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchYahooQuoteSummaryJson, fetchYahooChart } from "./yahoo-http";
import { getCached, setCache } from "./cache";
import sectoresData from "./sectores.json";

// ─── Exported types ───────────────────────────────────────────────────
export interface SectorValuationRow {
  sector: string;
  forwardPE: number | null;
  trailingPE: number | null;
  percentileTrailing: number | null;
  yearsHistory: number | null;
  constituentCount: number;
  validForwardCount: number;
  validTrailingCount: number;
  totalMarketCap: number | null;
}

export interface SectorValuationSnapshotResult {
  rows: SectorValuationRow[];
  generatedAt: string;
}

export interface SectorValuationPercentilesResult {
  percentiles: Record<string, { percentile: number; yearsHistory: number }>;
  generatedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────
const SNAPSHOT_CACHE_TTL = 15 * 60 * 1000;
const HISTORY_CACHE_TTL = 24 * 60 * 60 * 1000;
const BATCH = 4;
const MAX_TICKERS = 15;
const PE_CAP = 150;

type SectorsDict = Record<string, Record<string, { ticker: string; nombre: string }[]>>;
const DICT = sectoresData as SectorsDict;

// ─── Helpers ─────────────────────────────────────────────────────────

function raw(obj: any, ...keys: string[]): number | null {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[k];
  }
  if (cur != null && typeof cur === "object" && "raw" in cur) return (cur as any).raw;
  return typeof cur === "number" ? cur : null;
}

function capWeightedPE(data: { pe: number | null; mcap: number }[]): number | null {
  const valid = data.filter((d) => d.pe != null && d.pe > 0 && d.pe < PE_CAP && d.mcap > 0);
  if (valid.length < 2) return null;
  valid.sort((a, b) => a.pe! - b.pe!);
  const trim = valid.slice(0, Math.floor(valid.length * 0.99));
  if (trim.length < 2) return null;
  let num = 0,
    den = 0;
  for (const d of trim) {
    num += d.pe! * d.mcap;
    den += d.mcap;
  }
  return den > 0 ? num / den : null;
}

function pctRank(arr: number[], value: number): number {
  if (arr.length === 0) return 50;
  const s = [...arr].filter(Number.isFinite).sort((a, b) => a - b);
  let below = 0;
  for (const v of s) {
    if (v <= value) below++;
    else break;
  }
  return (below / s.length) * 100;
}

function wMedian(values: number[], weights: number[]): number | null {
  const pairs = values
    .map((v, i) => ({ v, w: Math.abs(weights[i]) }))
    .filter((p) => Number.isFinite(p.v) && p.v > 0 && Number.isFinite(p.w) && p.w > 0)
    .sort((a, b) => a.v - b.v);
  if (pairs.length === 0) return null;
  const total = pairs.reduce((s, p) => s + p.w, 0);
  let cum = 0;
  for (const p of pairs) {
    cum += p.w;
    if (cum >= total / 2) return p.v;
  }
  return pairs[pairs.length - 1].v;
}

function buildTTM(
  s: { endDate: { raw: number } | null; dilutedEPS: { raw: number } | null }[],
): { date: number; eps: number }[] {
  const v = s
    .map((x) => ({ date: x.endDate?.raw ?? 0, eps: x.dilutedEPS?.raw ?? 0 }))
    .filter((x) => x.date > 0 && x.eps > 0 && Number.isFinite(x.eps))
    .sort((a, b) => a.date - b.date);
  if (v.length < 4) return [];
  const out: { date: number; eps: number }[] = [];
  for (let i = 3; i < v.length; i++)
    out.push({ date: v[i].date, eps: v[i].eps + v[i - 1].eps + v[i - 2].eps + v[i - 3].eps });
  return out;
}

function alignPER(
  ts: number[],
  close: number[],
  ttm: { date: number; eps: number }[],
): { dates: number[]; per: number[] } {
  if (!ttm.length || !ts.length) return { dates: [], per: [] };
  const dates: number[] = [];
  const per: number[] = [];
  let ti = 0;
  for (let i = 0; i < ts.length; i++) {
    const p = close[i];
    if (!p || p <= 0) continue;
    while (ti < ttm.length - 1 && ttm[ti + 1].date <= ts[i]) ti++;
    if (ti >= ttm.length || ttm[ti].date > ts[i] || ttm[ti].eps <= 0) continue;
    const r = p / ttm[ti].eps;
    if (Number.isFinite(r) && r > 0 && r < PE_CAP) {
      dates.push(ts[i]);
      per.push(r);
    }
  }
  return { dates, per };
}

// ─── Sector data helpers ────────────────────────────────────────────

function getTickers(sector: string): { ticker: string; nombre: string }[] {
  const data = DICT[sector];
  if (!data) return [];
  const seen = new Set<string>(),
    out: { ticker: string; nombre: string }[] = [];
  for (const ind of Object.keys(data))
    for (const t of data[ind])
      if (!seen.has(t.ticker)) {
        seen.add(t.ticker);
        out.push(t);
      }
  return out;
}

function sectorNames(): string[] {
  return Object.keys(DICT)
    .filter((s) => s !== "No disponible")
    .sort();
}

// ─── Snapshot: fetch ticker fundamentals ───────────────────────────

async function snapOne(
  ticker: string,
): Promise<{ marketCap: number; forwardPE: number | null; trailingPE: number | null } | null> {
  try {
    const r = await fetchYahooQuoteSummaryJson<any>(ticker, [
      "price",
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
    ]);
    const d = r?.json?.quoteSummary?.result?.[0];
    if (!d) return null;
    const sd = d.summaryDetail ?? {},
      dks = d.defaultKeyStatistics ?? {},
      fd = d.financialData ?? {},
      pr = d.price ?? {};
    const mcap = raw(sd, "marketCap") ?? raw(fd, "marketCap") ?? raw(pr, "marketCap");
    if (!mcap || mcap <= 0) return null;
    return {
      marketCap: mcap,
      forwardPE: raw(sd, "forwardPE") ?? raw(dks, "forwardPE"),
      trailingPE: raw(sd, "trailingPE") ?? raw(dks, "trailingPE"),
    };
  } catch {
    return null;
  }
}

async function batchSnap(
  tickers: string[],
): Promise<
  { ticker: string; marketCap: number; forwardPE: number | null; trailingPE: number | null }[]
> {
  const out: {
    ticker: string;
    marketCap: number;
    forwardPE: number | null;
    trailingPE: number | null;
  }[] = [];
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const res = await Promise.all(
      batch.map(async (t) => {
        const d = await snapOne(t);
        return d ? { ticker: t, ...d } : null;
      }),
    );
    for (const r of res) if (r) out.push(r);
  }
  return out;
}

// ─── SERVER FN: getSectorValuationSnapshot ────────────────────────

export const getSectorValuationSnapshot = createServerFn({ method: "POST" }).handler(
  async (): Promise<SectorValuationSnapshotResult> => {
    const cacheKey = "sv-snapshot";
    const cached = getCached<SectorValuationSnapshotResult>(cacheKey, SNAPSHOT_CACHE_TTL);
    if (cached) return cached;

    const names = sectorNames();
    const rows: SectorValuationRow[] = [];

    for (const sector of names) {
      const tickers = getTickers(sector);
      if (tickers.length < 2) continue;
      const tData = await batchSnap(tickers.map((t) => t.ticker));
      if (tData.length < 2) continue;
      tData.sort((a, b) => b.marketCap - a.marketCap);
      const top = tData.slice(0, MAX_TICKERS);
      const totalMcap = top.reduce((s, d) => s + d.marketCap, 0);
      rows.push({
        sector,
        forwardPE: capWeightedPE(top.map((d) => ({ pe: d.forwardPE, mcap: d.marketCap }))),
        trailingPE: capWeightedPE(top.map((d) => ({ pe: d.trailingPE, mcap: d.marketCap }))),
        percentileTrailing: null,
        yearsHistory: null,
        constituentCount: tickers.length,
        validForwardCount: top.filter(
          (d) => d.forwardPE != null && d.forwardPE > 0 && d.forwardPE < PE_CAP,
        ).length,
        validTrailingCount: top.filter(
          (d) => d.trailingPE != null && d.trailingPE > 0 && d.trailingPE < PE_CAP,
        ).length,
        totalMarketCap: totalMcap,
      });
    }

    const result: SectorValuationSnapshotResult = { rows, generatedAt: new Date().toISOString() };
    setCache(cacheKey, result);
    return result;
  },
);

// ─── History: fetch PER series for one ticker ──────────────────────

async function fetchPERHistory(ticker: string): Promise<{ dates: number[]; per: number[] } | null> {
  try {
    const [chartRaw, qsRaw] = await Promise.all([
      fetchYahooChart(ticker, "10y", "1wk"),
      fetchYahooQuoteSummaryJson<any>(ticker, ["incomeStatementHistoryQuarterly"]),
    ]);
    const cr = chartRaw?.chart?.result?.[0];
    const timestamps: number[] = cr?.timestamp ?? [];
    const closes: number[] = cr?.indicators?.quote?.[0]?.close ?? [];
    if (timestamps.length < 50) return null;
    const stmts =
      qsRaw?.json?.quoteSummary?.result?.[0]?.incomeStatementHistoryQuarterly
        ?.incomeStatementHistory ?? [];
    if (!Array.isArray(stmts) || stmts.length < 4) return null;
    const ttm = buildTTM(stmts);
    if (ttm.length < 2) return null;
    return alignPER(timestamps, closes, ttm);
  } catch {
    return null;
  }
}

async function sectorHistory(
  sector: string,
): Promise<{ percentile: number; yearsHistory: number } | null> {
  const tickers = getTickers(sector);
  if (tickers.length < 2) return null;
  const all: { ticker: string; dates: number[]; per: number[] }[] = [];
  for (let i = 0; i < Math.min(tickers.length, MAX_TICKERS); i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const res = await Promise.all(
      batch.map(async (t) => {
        const d = await fetchPERHistory(t.ticker);
        return d && d.dates.length > 0 ? { ticker: t.ticker, ...d } : null;
      }),
    );
    for (const r of res) if (r) all.push(r);
  }
  if (all.length < 2) return null;
  // Get market caps for weights
  const caps = await batchSnap(all.map((r) => r.ticker));
  const mcapMap = new Map<string, number>();
  for (const c of caps) mcapMap.set(c.ticker, c.marketCap);
  // Index PER by date per ticker
  const tickerMaps: Map<number, number>[] = [];
  const dateSet = new Set<number>();
  for (const r of all) {
    const m = new Map<number, number>();
    for (let i = 0; i < r.dates.length; i++) {
      m.set(r.dates[i], r.per[i]);
      dateSet.add(r.dates[i]);
    }
    tickerMaps.push(m);
  }
  const sortedDates = [...dateSet].sort((a, b) => a - b);
  const minValid = Math.ceil(all.length * 0.6);
  const sectorPER: number[] = [];
  for (const date of sortedDates) {
    const vals: number[] = [];
    const wts: number[] = [];
    for (let i = 0; i < all.length; i++) {
      const per = tickerMaps[i].get(date);
      if (per != null && per > 0 && per < PE_CAP) {
        vals.push(per);
        wts.push(mcapMap.get(all[i].ticker) ?? 0);
      }
    }
    if (vals.length >= minValid) {
      const wm = wMedian(vals, wts);
      if (wm != null) sectorPER.push(wm);
    }
  }
  if (sectorPER.length < 10) return null;
  const current = sectorPER[sectorPER.length - 1];
  const pc = pctRank(sectorPER, current);
  const years =
    Math.round(((sortedDates[sortedDates.length - 1] - sortedDates[0]) / (365.25 * 86400)) * 10) /
    10;
  return { percentile: Math.round(pc * 10) / 10, yearsHistory: years };
}

// ─── SERVER FN: getSectorValuationPercentiles ─────────────────────

export const getSectorValuationPercentiles = createServerFn({ method: "POST" }).handler(
  async (): Promise<SectorValuationPercentilesResult> => {
    const cacheKey = "sv-percentiles";
    const cached = getCached<SectorValuationPercentilesResult>(cacheKey, HISTORY_CACHE_TTL);
    if (cached) return cached;

    const names = sectorNames();
    const percentiles: Record<string, { percentile: number; yearsHistory: number }> = {};
    for (const sector of names) {
      try {
        const h = await sectorHistory(sector);
        if (h) percentiles[sector] = h;
      } catch {
        // skip sector on error
      }
    }

    const result: SectorValuationPercentilesResult = {
      percentiles,
      generatedAt: new Date().toISOString(),
    };
    if (Object.keys(percentiles).length > 0) setCache(cacheKey, result);
    return result;
  },
);

// ─── Per-ticker valuation data (reusing fundamental analysis method) ──

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

function numVal(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as any)) return (v as any).raw;
  return null;
}

export interface SectorTickerValuation {
  ticker: string;
  nombre: string;
  companyName: string | null;
  industry: string | null;
  currentPrice: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  profitMargin: number | null;
  fcfYield: number | null;
  debtToEquity: number | null;
  dividendYield: number | null;
  targetMeanPrice: number | null;
  recommendationMean: number | null;
  numberOfAnalystOpinions: number | null;
  upsidePct: number | null;
  beta: number | null;
  fundScore: number | null;
  pePercentile: number | null;
  error: string | null;
}

export const getSectorValuationByTicker = createServerFn({ method: "POST" })
  .inputValidator((d: { sector: string; tickers: { ticker: string; nombre: string }[] }) =>
    z
      .object({
        sector: z.string().min(1),
        tickers: z
          .array(z.object({ ticker: z.string(), nombre: z.string() }))
          .min(1)
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ results: SectorTickerValuation[]; errors: string[] }> => {
    const results: SectorTickerValuation[] = [];
    const errors: string[] = [];
    const BATCH = 4;

    for (let i = 0; i < data.tickers.length; i += BATCH) {
      const slice = data.tickers.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        slice.map(async ({ ticker, nombre }) => {
          try {
            const yf = await getYF();
            const q = await yf.quoteSummary(ticker, {
              modules: [
                "assetProfile",
                "summaryDetail",
                "financialData",
                "defaultKeyStatistics",
                "price",
              ],
            });

            const ap = q.assetProfile ?? {};
            const sd = q.summaryDetail ?? {};
            const fd = q.financialData ?? {};
            const ks = q.defaultKeyStatistics ?? {};
            const pr = q.price ?? {};

            const currentPrice = numVal(fd.currentPrice) ?? numVal(sd.regularMarketPrice);
            const marketCap = numVal(ks.marketCap) ?? numVal(sd.marketCap) ?? numVal(pr.marketCap);
            const trailingPE = numVal(sd.trailingPE) ?? numVal(ks.trailingPE);
            const forwardPE = numVal(sd.forwardPE) ?? numVal(ks.forwardPE);
            const pegRatio = numVal(ks.pegRatio);
            let priceToBook = numVal(sd.priceToBook) ?? numVal(ks.priceToBook);
            const evToEbitda = numVal(ks.enterpriseToEbitda);
            const beta = numVal(ks.beta) ?? numVal(sd.beta);
            const returnOnEquity = numVal(fd.returnOnEquity);
            const revenueGrowth = numVal(fd.revenueGrowth);
            const earningsGrowth = numVal(fd.earningsGrowth);
            const profitMargin = numVal(fd.profitMargins) ?? numVal(ks.profitMargins);
            const freeCashflow = numVal(fd.freeCashflow);
            const fcfYield =
              freeCashflow != null && marketCap != null && marketCap > 0
                ? freeCashflow / marketCap
                : null;
            let debtToEquity = numVal(fd.debtToEquity);
            const dividendYield =
              numVal(sd.dividendYield) ?? numVal(sd.trailingAnnualDividendYield);
            // Sanity: si bookValuePerShare es despreciable frente al precio, P/B no es representativo
            if (priceToBook != null && currentPrice != null && currentPrice > 0) {
              const bookValuePerShare = currentPrice / priceToBook;
              if (bookValuePerShare <= currentPrice * 0.02) priceToBook = null;
            }
            // Sanity: si equity es despreciable frente a market cap, D/E no es representativo
            // debtToEquity viene como porcentaje (20.03 = 20.03%), convertir a decimal para la comparacion
            if (debtToEquity != null && marketCap != null && marketCap > 0) {
              if (debtToEquity / 100 > 10) debtToEquity = null;
            }
            const targetMeanPrice = numVal(fd.targetMeanPrice);
            const recommendationMean = numVal(fd.recommendationMean);
            const numberOfAnalystOpinions = numVal(fd.numberOfAnalystOpinions);
            const upsidePct =
              targetMeanPrice != null && currentPrice != null && currentPrice > 0
                ? ((targetMeanPrice - currentPrice) / currentPrice) * 100
                : null;

            // Fund score (same methodology as fundamental analysis)
            const scoreParts: { pts: number; max: number }[] = [];
            if (returnOnEquity != null) {
              const roe = returnOnEquity * 100;
              scoreParts.push({ pts: roe >= 20 ? 15 : roe >= 12 ? 10 : roe >= 5 ? 5 : 0, max: 15 });
            }
            if (revenueGrowth != null) {
              const g = revenueGrowth * 100;
              scoreParts.push({ pts: g >= 15 ? 15 : g >= 8 ? 10 : g >= 0 ? 5 : 0, max: 15 });
            }
            if (fcfYield != null) {
              const fy = fcfYield * 100;
              scoreParts.push({ pts: fy >= 6 ? 15 : fy >= 3 ? 10 : fy >= 0 ? 5 : 0, max: 15 });
            }
            if (profitMargin != null) {
              const pm = profitMargin * 100;
              scoreParts.push({ pts: pm >= 20 ? 15 : pm >= 10 ? 10 : pm >= 0 ? 5 : 0, max: 15 });
            }
            if (upsidePct != null) {
              scoreParts.push({
                pts: upsidePct >= 25 ? 15 : upsidePct >= 15 ? 10 : upsidePct >= 5 ? 5 : 0,
                max: 15,
              });
            }
            if (earningsGrowth != null) {
              const eg = earningsGrowth * 100;
              scoreParts.push({ pts: eg >= 20 ? 10 : eg >= 10 ? 7 : eg >= 0 ? 3 : 0, max: 10 });
            }
            const earned = scoreParts.reduce((s, p) => s + p.pts, 0);
            const maxPts = scoreParts.reduce((s, p) => s + p.max, 0);
            const fundScore = maxPts > 0 ? Math.round((earned / maxPts) * 100) : null;

            // PE percentile from income statement history
            let pePercentile: number | null = null;
            try {
              const ish = await yf.quoteSummary(ticker, { modules: ["incomeStatementHistory"] });
              const incomeRows = (ish.incomeStatementHistory?.incomeStatementHistory ??
                []) as Record<string, any>[];
              const sharesOutstanding = numVal(ks.sharesOutstanding);
              if (
                sharesOutstanding &&
                sharesOutstanding > 0 &&
                incomeRows.length >= 2 &&
                currentPrice != null
              ) {
                const peVals: number[] = [];
                for (const row of incomeRows) {
                  const ni = numVal(row.netIncome);
                  if (ni != null && ni > 0) {
                    const eps = ni / sharesOutstanding;
                    const pe = currentPrice / eps;
                    if (pe > 0 && pe < 500) peVals.push(pe);
                  }
                }
                if (peVals.length >= 2 && trailingPE != null) {
                  const below = peVals.filter((v) => v <= trailingPE).length;
                  pePercentile = Math.round((below / peVals.length) * 100);
                }
              }
            } catch {
              /* pe percentile optional */
            }

            // Safety: never emit NaN/Infinity to the UI
            const safe = (v: number | null | undefined): number | null =>
              v != null && isFinite(v) ? v : null;
            return {
              ticker,
              nombre,
              companyName: String(ap.longName ?? ap.shortName ?? nombre),
              industry: ap.industry ?? null,
              currentPrice: safe(currentPrice),
              marketCap: safe(marketCap),
              trailingPE: safe(trailingPE),
              forwardPE: safe(forwardPE),
              pegRatio: safe(pegRatio),
              priceToBook: safe(priceToBook),
              evToEbitda: safe(evToEbitda),
              returnOnEquity: safe(returnOnEquity),
              revenueGrowth: safe(revenueGrowth),
              earningsGrowth: safe(earningsGrowth),
              profitMargin: safe(profitMargin),
              fcfYield: safe(fcfYield),
              debtToEquity: safe(debtToEquity),
              dividendYield: safe(dividendYield),
              targetMeanPrice: safe(targetMeanPrice),
              recommendationMean: safe(recommendationMean),
              numberOfAnalystOpinions: safe(numberOfAnalystOpinions),
              upsidePct: safe(upsidePct),
              beta: safe(beta),
              fundScore: safe(fundScore),
              pePercentile: safe(pePercentile),
              error: null,
            };
          } catch (e) {
            errors.push(`${ticker}: ${e instanceof Error ? e.message : "Error"}`);
            return {
              ticker,
              nombre,
              companyName: null,
              industry: null,
              currentPrice: null,
              marketCap: null,
              trailingPE: null,
              forwardPE: null,
              pegRatio: null,
              priceToBook: null,
              evToEbitda: null,
              returnOnEquity: null,
              revenueGrowth: null,
              earningsGrowth: null,
              profitMargin: null,
              fcfYield: null,
              debtToEquity: null,
              dividendYield: null,
              targetMeanPrice: null,
              recommendationMean: null,
              numberOfAnalystOpinions: null,
              upsidePct: null,
              beta: null,
              fundScore: null,
              pePercentile: null,
              error: e instanceof Error ? e.message : "Error",
            };
          }
        }),
      );
      results.push(...batchResults);
    }

    return { results, errors };
  });
