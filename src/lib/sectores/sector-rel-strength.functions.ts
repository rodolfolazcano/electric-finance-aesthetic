// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "../cache";

export interface SectorRSData {
  sectorKey: string;
  label: string;
  etf: string;
  ratio: number | null;
  slope20d: number | null;
  slope60d: number | null;
  slope120d: number | null;
  trend20d: "rising" | "falling" | "flat" | null;
  trend60d: "rising" | "falling" | "flat" | null;
  regimColor: string;
}

export type RegimeType = "growth" | "defensive" | "cyclical" | "inflation" | "mixed" | null;

export interface SectorRelStrengthResult {
  sectors: SectorRSData[];
  regime: RegimeType;
  regimeLabel: string;
  regimeDesc: string;
  spyReturn1y: number | null;
  topSectors: string[];
  bottomSectors: string[];
  generatedAt: string;
}

const CACHE_KEY = "sector-rel-strength";
const CACHE_TTL = 15 * 60 * 1000;

const SECTOR_ETF_MAP: { key: string; label: string; etf: string; color: string }[] = [
  { key: "Technology",             label: "Tecnología",             etf: "XLK",  color: "#3498db" },
  { key: "Financial Services",     label: "Financieras",            etf: "XLF",  color: "#2ecc71" },
  { key: "Energy",                 label: "Energía",                etf: "XLE",  color: "#f5a623" },
  { key: "Healthcare",             label: "Salud",                  etf: "XLV",  color: "#e74c3c" },
  { key: "Consumer Defensive",     label: "Consumo Básico",         etf: "XLP",  color: "#8e44ad" },
  { key: "Consumer Cyclical",      label: "Consumo Discrecional",   etf: "XLY",  color: "#e67e22" },
  { key: "Basic Materials",        label: "Materiales",             etf: "XLB",  color: "#16a085" },
  { key: "Industrials",            label: "Industriales",           etf: "XLI",  color: "#7f8c8d" },
  { key: "Utilities",              label: "Servicios Públicos",     etf: "XLU",  color: "#1abc9c" },
  { key: "Communication Services", label: "Comunicaciones",         etf: "XLC",  color: "#9b59d0" },
  { key: "Real Estate",            label: "Real Estate",            etf: "XLRE", color: "#e84393" },
];

function safeNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

import { getHistories } from "../history-cache.server";
import { fetchYahooChart } from "../yahoo-http";

/**
 * Historia robusta: primero el método HTTP directo con cookie/crumb
 * (el mismo motor que usa clarity-analysis y que sí funciona en prod),
 * con fallback al cache batch de yfinance.
 */
async function historiaUno(ticker: string): Promise<{ date: string; close: number }[]> {
  // 1) yahoo-http directo (robusto)
  try {
    const chart = await fetchYahooChart(ticker, "2y", "1d");
    const res = chart?.chart?.result?.[0];
    const ts = res?.timestamp ?? [];
    const closes = res?.indicators?.quote?.[0]?.close ?? [];
    const out: { date: string; close: number }[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && isFinite(c)) {
        out.push({ date: new Date(ts[i]! * 1000).toISOString().slice(0, 10), close: c });
      }
    }
    if (out.length > 60) return out;
  } catch {
    /* caer al fallback */
  }
  // 2) fallback batch cache
  try {
    const r = await getHistories([ticker], 400);
    if (r[ticker]?.length) return r[ticker];
  } catch {
    /* sin datos */
  }
  return [];
}

async function fetchHistoryMulti(tickers: string[]): Promise<Record<string, { date: string; close: number }[]>> {
  const result: Record<string, { date: string; close: number }[]> = {};
  await Promise.all(
    tickers.map(async (t) => {
      result[t] = await historiaUno(t);
    }),
  );
  return result;
}

function computeLinearSlope(data: { close: number }[], days: number): number | null {
  if (data.length < days) return null;
  const slice = data.slice(-days);
  const n = slice.length;
  if (n < 2) return null;
  const xs = Array.from({ length: n }, (_, i) => i);
  const ys = slice.map((d) => d.close);
  if (ys.some((y) => !Number.isFinite(y))) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denom = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    denom += (xs[i] - mx) ** 2;
  }
  return denom > 0 ? num / denom : null;
}

function trendFromSlope(slope: number | null): "rising" | "falling" | "flat" | null {
  if (slope == null) return null;
  if (slope > 0.0005) return "rising";
  if (slope < -0.0005) return "falling";
  return "flat";
}

function classifyRegime(sectors: SectorRSData[]): { regime: RegimeType; label: string; desc: string } {
  const rising = sectors.filter((s) => s.trend60d === "rising").map((s) => s.sectorKey);
  const falling = sectors.filter((s) => s.trend60d === "falling").map((s) => s.sectorKey);
  if (rising.length === 0 && falling.length === 0) return { regime: null, label: "Indeterminado", desc: "No hay datos suficientes para clasificar el régimen." };

  const growth = ["Technology", "Communication Services", "Consumer Cyclical"];
  const defensive = ["Utilities", "Healthcare", "Consumer Defensive", "Real Estate"];
  const cyclical = ["Energy", "Basic Materials", "Industrials", "Financial Services"];
  const inflation = ["Energy", "Basic Materials", "Real Estate"];

  const growthRising = growth.filter((g) => rising.includes(g)).length;
  const defensiveRising = defensive.filter((d) => rising.includes(d)).length;
  const cyclicalRising = cyclical.filter((c) => rising.includes(c)).length;
  const inflationRising = inflation.filter((i) => rising.includes(i)).length;

  if (growthRising >= 2) {
    return { regime: "growth", label: "Crecimiento (Growth)", desc: "Lideran Technology y Comunicaciones. Rotación hacia activos de crecimiento." };
  }
  if (defensiveRising >= 3) {
    return { regime: "defensive", label: "Defensivo", desc: "Lideran Utilities, Salud y Consumo Básico. Aversión al riesgo." };
  }
  if (inflationRising >= 2 && growthRising === 0) {
    return { regime: "inflation", label: "Inflación / Commodities", desc: "Lideran Energía y Materiales. Mercado posicionándose para inflación." };
  }
  if (cyclicalRising >= 3) {
    return { regime: "cyclical", label: "Cíclico (Recuperación)", desc: "Lideran Financieras, Industriales y Materiales. Economía en expansión." };
  }
  return { regime: "mixed", label: "Mixto / Transición", desc: "Señales mixtas entre sectores. Mercado sin dirección clara." };
}

export const getSectorRelStrength = createServerFn({ method: "GET" }).handler(
  async (): Promise<SectorRelStrengthResult> => {
    const cached = getCached<SectorRelStrengthResult>(CACHE_KEY, CACHE_TTL);
    if (cached) return cached;

    const allTickers = [...SECTOR_ETF_MAP.map((s) => s.etf), "SPY"];
    const history = await fetchHistoryMulti(allTickers);
    const spyCloses = history["SPY"]?.map((d) => d.close) ?? [];

    const sectors: SectorRSData[] = SECTOR_ETF_MAP.map((s) => {
      const closes = history[s.etf] ?? [];
      if (closes.length === 0 || spyCloses.length === 0) {
        return { ...s, ratio: null, slope20d: null, slope60d: null, slope120d: null, trend20d: null, trend60d: null, regimColor: s.color };
      }

      // Alinear POR FECHA (bug previo: alineaba por índice y mezclaba fechas
      // cuando las series tenían longitudes distintas)
      const spyByDate = new Map(spyCloses.map((d) => [d.date, d.close]));
      const ratios: number[] = [];
      for (const d of closes) {
        const spy = spyByDate.get(d.date);
        if (spy != null && spy > 0 && d.close > 0) ratios.push(d.close / spy);
      }
      if (ratios.length < 25) {
        return { ...s, ratio: null, slope20d: null, slope60d: null, slope120d: null, trend20d: null, trend60d: null, regimColor: s.color };
      }

      const ratioData = ratios.map((r) => ({ close: r }));
      const slope20 = computeLinearSlope(ratioData, Math.min(20, ratioData.length));
      const slope60 = computeLinearSlope(ratioData, Math.min(60, ratioData.length));
      const slope120 = computeLinearSlope(ratioData, Math.min(120, ratioData.length));

      return {
        ...s,
        ratio: safeNum(ratios.length > 0 ? ratios[ratios.length - 1] : null),
        slope20d: safeNum(slope20),
        slope60d: safeNum(slope60),
        slope120d: safeNum(slope120),
        trend20d: trendFromSlope(safeNum(slope20)),
        trend60d: trendFromSlope(safeNum(slope60)),
        regimColor: s.color,
      };
    });

    const regime = classifyRegime(sectors);

    // Líderes/retrasos SOLO con datos reales (bug previo: con todo null mostraba
    // los 3 primeros del array como "líderes" falsos)
    const conSlope = sectors.filter((s) => s.slope60d != null);
    const sortedBySlope = [...conSlope].sort((a, b) => (b.slope60d ?? -999) - (a.slope60d ?? -999));
    const topSectors = sortedBySlope.slice(0, 3).map((s) => s.label);
    const bottomSectors = sortedBySlope.slice(-3).map((s) => s.label);

    const spyReturn1y = spyCloses.length > 1 && Number.isFinite(spyCloses[0])
      ? (spyCloses[spyCloses.length - 1] - spyCloses[0]) / spyCloses[0]
      : null;

    const result: SectorRelStrengthResult = {
      sectors,
      regime: regime.regime,
      regimeLabel: regime.label,
      regimeDesc: regime.desc,
      spyReturn1y,
      topSectors,
      bottomSectors,
      generatedAt: new Date().toISOString(),
    };

    setCache(CACHE_KEY, result);
    return result;
  },
);
