// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "../cache";
import { detectCyclePhase, diagnosePhase, type TrendArrow } from "../cycle-phase-detector";

// ─── Tipos ────────────────────────────────────────────────────────────────

export type MurphyTrend = "up" | "down" | "flat" | null;

export interface RatioSignal {
  ratioKey: "CRB_BOND" | "BOND_SPX" | "DOW_GOLD" | "CONS_CYCL";
  label: string;
  ratioActual: number | null;
  changePct1m: number | null;   // Murphy: cambio en 1 mes (~21 días)
  changePct3m: number | null;   // Murphy: cambio en 3 meses (~63 días)
  changePct6m: number | null;   // Murphy: cambio en 6 meses (~126 días)
  trend: MurphyTrend;
  percentil: number | null;
  signal: string;
  interpretacion: string;
  sectoresFavorecidos: string[];
  nivelConfianza: number;
}

export interface ArrowsPhase {
  bondsArrow: TrendArrow | null;     // TLT
  stocksArrow: TrendArrow | null;    // SPY
  commoditiesArrow: TrendArrow | null; // DBC
  stage: number;
  label: string;
  shortLabel: string;
  description: string;
  buy: string[];
  sell: string[];
  estilo: string;
  confianza: "alta" | "media" | "baja";
}

export interface IntermarketRatiosResult {
  ratios: RatioSignal[];
  arrows: ArrowsPhase;
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const CACHE_TTL = 10 * 60 * 1000;
const CACHE_KEY = "intermarket-ratios";

async function fetchYahooHistory(ticker: string, days: number): Promise<{ date: string; close: number }[]> {
  try {
    const mod: any = await import("yahoo-finance2");
    const YF = mod.default ?? mod;
    const yf = typeof YF === "function" ? new YF() : YF;
    try { yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]); } catch { }
    const period2 = new Date();
    const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await yf.chart(ticker, { period1, period2, interval: "1d" });
    return (rows?.quotes ?? [])
      .filter((q: any) => q.close != null && q.close > 0 && q.date != null)
      .map((q: any) => ({ date: new Date(q.date * 1000).toISOString().slice(0, 10), close: q.close }));
  } catch {
    const { yahooChartCloses } = await import("../yahoo-chart");
    const yfRange = days > 365 ? "2y" : days > 180 ? "1y" : "6mo";
    return await yahooChartCloses(ticker, yfRange);
  }
}

/** Align two series by date — Murphy exige precios sincronizados. */
function alignByDate(
  a: { date: string; close: number }[],
  b: { date: string; close: number }[],
): { closeA: number; closeB: number }[] {
  const mapA = new Map(a.map((d) => [d.date, d.close]));
  const mapB = new Map(b.map((d) => [d.date, d.close]));
  const out: { closeA: number; closeB: number }[] = [];
  for (const [date, closeA] of mapA) {
    const closeB = mapB.get(date);
    if (closeB != null && closeA > 0 && closeB > 0) out.push({ closeA, closeB });
  }
  return out.sort((x, y) => x.closeA - y.closeA); // sort by date doesn't matter, but preserves order
}

/** Compute change % over N trading days from the end of the array. */
function changePct(closes: number[], days: number): number | null {
  if (closes.length < days + 1) return null;
  const prev = closes[closes.length - 1 - days];
  const now = closes[closes.length - 1];
  if (prev <= 0 || now <= 0) return null;
  return ((now - prev) / prev) * 100;
}

/** Convert a numeric % change to a TrendArrow (up/down/flat). */
function pctToArrow(pct: number | null, threshold = 1.5): TrendArrow | null {
  if (pct == null) return null;
  if (pct > threshold) return "up";
  if (pct < -threshold) return "down";
  return "flat";
}

/** Arrow from changePct3m (Murphy usa ventanas de 3m como estándar). */
function arrowFrom3m(closes: number[]): TrendArrow | null {
  return pctToArrow(changePct(closes, 63), 3);
}

/** Safe number: NaN/Infinity → null. */
function safeNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function percentileRank(series: number[], currentValue: number | null): number | null {
  const vals = series.filter((v) => Number.isFinite(v));
  if (vals.length < 10 || currentValue == null || !Number.isFinite(currentValue)) return null;
  const countBelow = vals.filter((v) => v <= currentValue).length;
  return Math.round((countBelow / vals.length) * 100);
}

// ─── Server function ──────────────────────────────────────────────────────

export const getIntermarketRatios = createServerFn({ method: "GET" }).handler(
  async (): Promise<IntermarketRatiosResult> => {
    const cached = getCached<IntermarketRatiosResult>(CACHE_KEY, CACHE_TTL);
    if (cached) return cached;

    const DAYS = 500;
    const [
      dbcData, tltData, spyData, diaData, gldData,
      xlpData, xlyData,
    ] = await Promise.all([
      fetchYahooHistory("DBC", DAYS),
      fetchYahooHistory("TLT", DAYS),
      fetchYahooHistory("SPY", DAYS),
      fetchYahooHistory("DIA", DAYS),
      fetchYahooHistory("GLD", DAYS),
      fetchYahooHistory("XLP", DAYS),
      fetchYahooHistory("XLY", DAYS),
    ]);

    // ─── 3 Arrows de Pring (para detectar la fase exacta del ciclo) ──
    // Murphy Cap 1-3: las tendencias ABSOLUTAS de bonos, acciones y commodities
    // determinan la etapa del ciclo económico.
    const tltCloses = tltData.map((d) => d.close);
    const spyCloses = spyData.map((d) => d.close);
    const dbcCloses = dbcData.map((d) => d.close);

    const bondsArrow = arrowFrom3m(tltCloses);
    const stocksArrow = arrowFrom3m(spyCloses);
    const commoditiesArrow = arrowFrom3m(dbcCloses);

    // Usar el detector exacto de cycle-phase-detector.ts (3 flechas → stage 0-5)
    const stage = detectCyclePhase({
      bondsTrend: bondsArrow,
      stocksTrend: stocksArrow,
      commoditiesTrend: commoditiesArrow,
    });

    const diagnosis = diagnosePhase(
      { bondsTrend: bondsArrow, stocksTrend: stocksArrow, commoditiesTrend: commoditiesArrow },
      {},
    );

    const arrows: ArrowsPhase = {
      bondsArrow,
      stocksArrow,
      commoditiesArrow,
      stage: diagnosis.phase.stage,
      label: diagnosis.phase.label,
      shortLabel: diagnosis.phase.shortLabel,
      description: diagnosis.phase.description,
      buy: diagnosis.rotation.buy,
      sell: diagnosis.rotation.sell,
      estilo: diagnosis.rotation.style,
      confianza: diagnosis.confidence,
    };

    // ─── 1. CRB / T-Bonds (DBC/TLT) — Murphy Cap 1 ─────────────────
    // La relación más importante. CRB↑/Bonds↓ = inflación. CRB↓/Bonds↑ = desinflación.
    const aligned_crb = alignByDate(dbcData, tltData);
    const crbBondSeries = aligned_crb.map((p) => p.closeA / p.closeB);
    const crbBond1m = changePct(crbBondSeries, 21);
    const crbBond3m = changePct(crbBondSeries, 63);
    const crbBond6m = changePct(crbBondSeries, 126);
    const crbBondTrend = pctToArrow(crbBond3m, 3);

    const ratio1: RatioSignal = {
      ratioKey: "CRB_BOND",
      label: "CRB / T-Bonds",
      ratioActual: safeNum(crbBondSeries.length > 0 ? crbBondSeries[crbBondSeries.length - 1] : null),
      changePct1m: safeNum(crbBond1m),
      changePct3m: safeNum(crbBond3m),
      changePct6m: safeNum(crbBond6m),
      percentil: percentileRank(crbBondSeries, crbBondSeries.length > 0 ? crbBondSeries[crbBondSeries.length - 1] : null),
      trend: crbBondTrend,
      signal: crbBondTrend === "up" ? "INFLACION" :
              crbBondTrend === "down" ? "DESINFLACION" : "NEUTRAL",
      interpretacion: crbBondTrend === "up"
        ? "CRB/Bonds en alza: commodities superan a bonos. Señal inflacionaria o de crecimiento fuerte (Murphy Cap 1). Rotar a Energy, Materials, Hard Assets."
        : crbBondTrend === "down"
        ? "CRB/Bonds en baja: bonos superan a commodities. Señal desinflacionaria o flight-to-quality. Rotar a Utilities, Consumer Defensive, Tasa Fija."
        : "CRB/Bonds estable sin sesgo direccional claro.",
      sectoresFavorecidos: crbBondTrend === "up"
        ? ["XLE (Energía)", "XLB (Materiales Básicos)"]
        : crbBondTrend === "down"
        ? ["XLF (Financieras)", "XLU (Utilities)", "XLP (Consumo Básico)"]
        : [],
      nivelConfianza: safeNum(crbBond3m) != null ? Math.min(Math.abs(crbBond3m!) * 10, 95) + 5 : 0,
    };

    // ─── 2. Bonds / S&P 500 (TLT/SPY) — Murphy Cap 3 ───────────────
    // Correlación positiva = normal. Correlación negativa = régimen anómalo (deflación).
    const aligned_bsp = alignByDate(tltData, spyData);
    const bondSpxSeries = aligned_bsp.map((p) => p.closeA / p.closeB);
    const bondSpx1m = changePct(bondSpxSeries, 21);
    const bondSpx3m = changePct(bondSpxSeries, 63);
    const bondSpx6m = changePct(bondSpxSeries, 126);
    const bondSpxTrend = pctToArrow(bondSpx3m, 3);

    const ratio2: RatioSignal = {
      ratioKey: "BOND_SPX",
      label: "Bonds / S&P 500",
      ratioActual: safeNum(bondSpxSeries.length > 0 ? bondSpxSeries[bondSpxSeries.length - 1] : null),
      changePct1m: safeNum(bondSpx1m),
      changePct3m: safeNum(bondSpx3m),
      changePct6m: safeNum(bondSpx6m),
      percentil: percentileRank(bondSpxSeries, bondSpxSeries.length > 0 ? bondSpxSeries[bondSpxSeries.length - 1] : null),
      trend: bondSpxTrend,
      signal: bondSpxTrend === "up" ? "FLIGHT_TO_QUALITY" :
              bondSpxTrend === "down" ? "RISK_ON" : "NEUTRAL",
      interpretacion: bondSpxTrend === "up"
        ? "TLT/SPY sube: flight-to-quality. Bonos superan a acciones — el mercado descuenta desaceleración o estrés. Rotar a defensivos (Murphy Cap 3)."
        : bondSpxTrend === "down"
        ? "TLT/SPY baja: risk-on. Acciones superan a bonos — apetito por riesgo en expansión. Rotar a Technology, Discrecional, Small Caps."
        : "Sin sesgo claro entre bonos y acciones.",
      sectoresFavorecidos: bondSpxTrend === "up"
        ? ["XLP (Consumo Básico)", "XLU (Utilities)", "XLV (Healthcare)"]
        : bondSpxTrend === "down"
        ? ["XLK (Tecnología)", "XLY (Consumo Discrecional)", "IWM (Small Caps)"]
        : [],
      nivelConfianza: safeNum(bondSpx3m) != null ? Math.min(Math.abs(bondSpx3m!) * 10, 95) + 5 : 0,
    };

    // ─── 3. Dow Jones / Gold (DIA/GLD) — Murphy Cap 11 ─────────────
    // Ratio de activos papel vs. activos tangibles. Sube = confianza.
    // Baja = rotación a tangibles (oro).
    const aligned_dg = alignByDate(diaData, gldData);
    const dowGoldSeries = aligned_dg.map((p) => p.closeA / p.closeB);
    const dowGold1m = changePct(dowGoldSeries, 21);
    const dowGold3m = changePct(dowGoldSeries, 63);
    const dowGold6m = changePct(dowGoldSeries, 126);
    const dowGoldTrend = pctToArrow(dowGold3m, 3);

    const ratio3: RatioSignal = {
      ratioKey: "DOW_GOLD",
      label: "Dow Jones / Gold",
      ratioActual: safeNum(dowGoldSeries.length > 0 ? dowGoldSeries[dowGoldSeries.length - 1] : null),
      changePct1m: safeNum(dowGold1m),
      changePct3m: safeNum(dowGold3m),
      changePct6m: safeNum(dowGold6m),
      percentil: percentileRank(dowGoldSeries, dowGoldSeries.length > 0 ? dowGoldSeries[dowGoldSeries.length - 1] : null),
      trend: dowGoldTrend,
      signal: dowGoldTrend === "up" ? "PAPER_ASSETS_STRONG" :
              dowGoldTrend === "down" ? "TANGIBLE_ASSETS_STRONG" : "NEUTRAL",
      interpretacion: dowGoldTrend === "up"
        ? "Dow/Gold sube: activos papel (acciones) superan al oro. Confianza financiera, dólar fuerte (Murphy Cap 11). Favorecer Financials, Tech."
        : dowGoldTrend === "down"
        ? "Dow/Gold baja: rotación a activos tangibles. Oro supera a acciones — señal de debilidad del dólar o incertidumbre. Favorecer GLD, Minería, Commodities."
        : "Relación Dow/Oro sin tendencia clara.",
      sectoresFavorecidos: dowGoldTrend === "up"
        ? ["XLF (Financieras)", "XLK (Tecnología)"]
        : dowGoldTrend === "down"
        ? ["GLD (Oro)", "XLE (Energía)", "XLB (Materiales)"]
        : [],
      nivelConfianza: safeNum(dowGold3m) != null ? Math.min(Math.abs(dowGold3m!) * 10, 95) + 5 : 0,
    };

    // ─── 4. Consumer Cyclicals / Consumer Staples (XLY/XLP) — Murphy Cap 6 ──
    // Murphy: ratio de consumo cíclico vs. defensivo.
    // Sube = confianza del consumidor, riesgo-on.
    // Baja = cautela, flight-to-safety.
    const aligned_cc = alignByDate(xlyData, xlpData);
    const consCyclSeries = aligned_cc.map((p) => p.closeA / p.closeB);
    const consCycl1m = changePct(consCyclSeries, 21);
    const consCycl3m = changePct(consCyclSeries, 63);
    const consCycl6m = changePct(consCyclSeries, 126);
    const consCyclTrend = pctToArrow(consCycl3m, 3);

    const ratio4: RatioSignal = {
      ratioKey: "CONS_CYCL",
      label: "Cons. Cíclico / Cons. Defensivo",
      ratioActual: safeNum(consCyclSeries.length > 0 ? consCyclSeries[consCyclSeries.length - 1] : null),
      changePct1m: safeNum(consCycl1m),
      changePct3m: safeNum(consCycl3m),
      changePct6m: safeNum(consCycl6m),
      percentil: percentileRank(consCyclSeries, consCyclSeries.length > 0 ? consCyclSeries[consCyclSeries.length - 1] : null),
      trend: consCyclTrend,
      signal: consCyclTrend === "up" ? "CYCLICAL_BIAS" :
              consCyclTrend === "down" ? "DEFENSIVE_BIAS" : "NEUTRAL",
      interpretacion: consCyclTrend === "up"
        ? "XLY/XLP sube: confianza del consumidor en expansión. Flujo a consumo discrecional, tecnología. Beta alta (Murphy Cap 6)."
        : consCyclTrend === "down"
        ? "XLY/XLP baja: los inversores buscan defensivos. Rotación a Staples, Healthcare, Utilities. Señal de desaceleración."
        : "Sin sesgo claro entre consumo cíclico y defensivo.",
      sectoresFavorecidos: consCyclTrend === "up"
        ? ["XLY (Consumo Discrecional)", "XLK (Tecnología)", "XLI (Industriales)"]
        : consCyclTrend === "down"
        ? ["XLP (Consumo Básico)", "XLV (Healthcare)", "XLU (Utilities)"]
        : [],
      nivelConfianza: safeNum(consCycl3m) != null ? Math.min(Math.abs(consCycl3m!) * 10, 95) + 5 : 0,
    };

    const ratios = [ratio2, ratio3, ratio4];

    const result: IntermarketRatiosResult = {
      ratios,
      arrows,
      generatedAt: new Date().toISOString(),
    };

    setCache(CACHE_KEY, result);
    return result;
  },
);
