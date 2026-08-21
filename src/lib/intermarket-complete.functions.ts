import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "./cache";
import { yahooChartCloses } from "./yahoo-chart";
import {
  computeCompleteAnalysis,
  type CompleteIntermarketResult,
  type RatioId,
  WINDOWS,
} from "./intermarket-complete";

const CACHE_TTL = 10 * 60 * 1000;
const CACHE_KEY = "intermarket-complete";

// ─── Ratio ticker mappings ──────────────────────────────────────────

interface RatioTickers {
  numerator: string;
  denominator: string;
  numRange: string;
  denRange: string;
  operation?: "ratio" | "difference";
}

const CONTEXT_TICKERS = {
  dxy: "DX-Y.NYB",
  commodities: "DBC",
  bonds: "TLT",
  stocks: "SPY",
  oil: "USO",
  oilShares: "XLE",
  dow: "^DJI",
  transports: "^DJT",
  japan: "EWJ",
  china: "FXI",
  emerging: "EEM",
  developed: "EFA",
  gold: "GLD",
} as const;

const RATIO_TICKERS: Record<string, RatioTickers> = {
  // ─── 12 ratios originales de Murphy ──
  CRB_BONDS: { numerator: "DBC", denominator: "TLT", numRange: "2y", denRange: "2y" },
  BONDS_STOCKS: { numerator: "TLT", denominator: "SPY", numRange: "2y", denRange: "2y" },
  COMMODITIES_STOCKS: { numerator: "DBC", denominator: "SPY", numRange: "2y", denRange: "2y" },
  COPPER_GOLD: { numerator: "HG=F", denominator: "GLD", numRange: "2y", denRange: "2y" },
  GOLD_OIL: { numerator: "GLD", denominator: "USO", numRange: "2y", denRange: "2y" },
  XLY_XLP: { numerator: "XLY", denominator: "XLP", numRange: "2y", denRange: "2y" },
  IWM_SPY: { numerator: "IWM", denominator: "SPY", numRange: "2y", denRange: "2y" },
  XLK_XLE: { numerator: "XLK", denominator: "XLE", numRange: "2y", denRange: "2y" },
  RSP_SPY: { numerator: "RSP", denominator: "SPY", numRange: "2y", denRange: "2y" },
  HYG_LQD: { numerator: "HYG", denominator: "LQD", numRange: "2y", denRange: "2y" },
  DOW_GOLD: { numerator: "^DJI", denominator: "GLD", numRange: "2y", denRange: "2y" },
  YIELD_CURVE: { numerator: "^TNX", denominator: "^IRX", numRange: "2y", denRange: "2y", operation: "difference" },
  // ─── Nuevos ratios (Cap. 2, 10, 14, 15) ──
  GOLD_SILVER: { numerator: "GLD", denominator: "SLV", numRange: "2y", denRange: "2y" },
  GDX_GLD: { numerator: "GDX", denominator: "GLD", numRange: "2y", denRange: "2y" },
};

// Helper to fetch and align two time series
async function fetchAlignedSeries(
  numTicker: string,
  denTicker: string,
  numRange: string,
  denRange: string,
  targetDays: number,
  operation: "ratio" | "difference" = "ratio",
): Promise<number[]> {
  let numData = await yahooChartCloses(numTicker, numRange);
  let denData = await yahooChartCloses(denTicker, denRange);

  // If we don't have enough data, try longer ranges
  if (numData.length < targetDays) {
    const longRange = targetDays > 500 ? "5y" : targetDays > 250 ? "2y" : "1y";
    numData = await yahooChartCloses(numTicker, longRange);
  }
  if (denData.length < targetDays) {
    const longRange = targetDays > 500 ? "5y" : targetDays > 250 ? "2y" : "1y";
    denData = await yahooChartCloses(denTicker, longRange);
  }

  // Align by date
  const numMap = new Map(numData.map((d) => [d.date, d.close]));
  const denMap = new Map(denData.map((d) => [d.date, d.close]));

  const allDates = new Set([...numMap.keys(), ...denMap.keys()]);
  const sortedDates = Array.from(allDates).sort();

  const ratios: number[] = [];
  for (const date of sortedDates) {
    const n = numMap.get(date);
    const d = denMap.get(date);
    if (n != null && d != null && Number.isFinite(n) && Number.isFinite(d)) {
      if (operation === "difference") ratios.push(n - d);
      else if (d > 0 && n > 0) ratios.push(n / d);
    }
  }

  return ratios;
}

// ─── Server function ────────────────────────────────────────────────

export const getCompleteIntermarketAnalysis = createServerFn({ method: "GET" }).handler(
  async (): Promise<CompleteIntermarketResult> => {
    try {
      const cached = getCached<CompleteIntermarketResult>(CACHE_KEY, CACHE_TTL);
      if (cached) return cached;

      const maxDays = Math.max(...WINDOWS) + 100; // ~604 days minimum

      const results = await Promise.allSettled(
        Object.entries(RATIO_TICKERS).map(async ([ratioId, tickers]) => {
          try {
            const series = await fetchAlignedSeries(
              tickers.numerator,
              tickers.denominator,
              tickers.numRange,
              tickers.denRange,
              maxDays,
              tickers.operation ?? "ratio",
            );
            return { ratioId: ratioId as RatioId, series };
          } catch {
            return { ratioId: ratioId as RatioId, series: [] };
          }
        }),
      );

      const ratioSeriesMap: Record<string, number[]> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          ratioSeriesMap[result.value.ratioId] = result.value.series;
        }
      }

      // ─── Fetch complementary indicators ──────────────────────────────
      const [vixResult, fedFundsResult, xlreResult, bilResult] = await Promise.allSettled([
        yahooChartCloses("^VIX", "2y"),
        yahooChartCloses("^FF", "2y"),
        yahooChartCloses("XLRE", "2y"),
        yahooChartCloses("BIL", "2y"),
      ]);

      const toCloses = (r: PromiseSettledResult<{ date: string; close: number }[]>) =>
        r.status === "fulfilled" ? r.value.map((d) => d.close) : [];

      const complementarySeries = {
        vix: toCloses(vixResult),
        fedFunds: toCloses(fedFundsResult),
        xlre: toCloses(xlreResult),
        bil: toCloses(bilResult),
      };

      // Direct market series are kept separate from ratios. Murphy's rules need
      // the raw direction of each asset (not a proxy ratio with SPY as pivot).
      const contextResults = await Promise.allSettled(
        Object.entries(CONTEXT_TICKERS).map(async ([key, ticker]) => {
          try {
            const data = await yahooChartCloses(ticker, "2y");
            return [key, data.map((point) => point.close)] as const;
          } catch {
            return [key, []] as [string, number[]];
          }
        }),
      );
      const marketSeries: Record<string, number[]> = {};
      for (const result of contextResults) {
        if (result.status === "fulfilled") marketSeries[result.value[0]] = result.value[1];
      }

      const analysis = computeCompleteAnalysis(
        ratioSeriesMap as Record<RatioId, number[]>,
        complementarySeries,
        marketSeries,
      );
      setCache(CACHE_KEY, analysis);
      return analysis;
    } catch (err) {
      // Si todo falla, devolver resultado vacío en lugar de 500
      // para que CyclePhaseBanner etc. no muestren datos incorrectos
      const empty = computeCompleteAnalysis({} as Record<RatioId, number[]>, { vix: [], fedFunds: [], xlre: [], bil: [] }, {});
      setCache(CACHE_KEY, empty);
      return empty;
    }
  },
);
