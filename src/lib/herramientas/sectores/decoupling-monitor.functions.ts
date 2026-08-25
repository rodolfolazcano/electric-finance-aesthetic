// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "../cache";
import { computePearsonCorrelation } from "../intermarket-complete";

//  Tipos 

export type DecouplingLevel = "bajo" | "moderado" | "alto" | "critico";
export type CreditAlertLevel = "NONE" | "WARNING" | "CRITICAL";
export type RotationTrend = "up" | "down" | "flat" | null;

export interface DecouplingSignal {
  key: string;
  label: string;
  valor: number | null;
  umbral: string;
  nivel: DecouplingLevel;
  detalle: string;
  fuente: string;
}

export interface CreditSpreadData {
  igProxy: number | null;        // LQD/IEF
  hyProxy: number | null;        // HYG/IEF
  riskAppetite: number | null;   // HYG/LQD
  igPercentil: number | null;
  hyPercentil: number | null;
  raPercentil: number | null;
  igGFC: number | null;
  igCOVID: number | null;
  igNow: number | null;
  hyGFC: number | null;
  hyCOVID: number | null;
  hyNow: number | null;
  alertLevel: CreditAlertLevel;
}

export interface RotationSignal {
  key: string;
  label: string;
  trend: RotationTrend;
  valor: number | null;
  percentil: number | null;
  interpretacion: string;
}

export interface SectorMomentum {
  ticker: string;
  nombre: string;
  retorno6m: number | null;
  accion: "COMPRAR" | "VENDER" | "NEUTRAL";
}

export interface YieldCurveData {
  ust10y: number | null;
  ust5y: number | null;
  irx3m: number | null;
  spread10y3m: number | null;
  spread10y2y: number | null;
  invertida: boolean;
  senal: DecouplingSignal;
}

export interface CompositeScore {
  score: number;
  nivel: DecouplingLevel;
  senalesActivas: number;
  totalSenales: number;
}

export interface DecouplingResult {
  correlacionTLTSPY: DecouplingSignal;
  ratioCRBBonds: DecouplingSignal;
  yieldCurve: YieldCurveData;
  consumerCyclical: DecouplingSignal;
  argentinaIPC: DecouplingSignal;
  creditCycle: CreditSpreadData;
  rotationSignals: RotationSignal[];
  sectorMomentum: SectorMomentum[];
  compuesto: CompositeScore;
  /** Reciclado intermarket_cycle_detector.py §7: régimen deflacionario y FTQ. */
  riesgosRegimen?: {
    correlacionTLTSPY252: number | null;
    desacopleDeflacionario: boolean;
    correlacionHYGTLT126: number | null;
    flightToQuality: boolean;
  };
  generatedAt: string;
}

/** Correlación rolling entre dos series de cierres alineadas por cola. */
function corrRolling(a: number[], b: number[], ventana: number, minPeriodos: number): number | null {
  const n = Math.min(a.length, b.length);
  if (n < minPeriodos) return null;
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = n - Math.min(n, ventana); i < n; i++) {
    if (i < 1) continue;
    if (a[i - 1] > 0 && b[i - 1] > 0 && a[i] > 0 && b[i] > 0) {
      ra.push(a[i] / a[i - 1] - 1);
      rb.push(b[i] / b[i - 1] - 1);
    }
  }
  const m = Math.min(ra.length, rb.length);
  if (m < minPeriodos) return null;
  const xa = ra.slice(ra.length - m);
  const xb = rb.slice(rb.length - m);
  const ma = xa.reduce((s, v) => s + v, 0) / m;
  const mb = xb.reduce((s, v) => s + v, 0) / m;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < m; i++) {
    num += (xa[i]! - ma) * (xb[i]! - mb);
    da += (xa[i]! - ma) ** 2;
    db += (xb[i]! - mb) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : null;
}

//  Helpers 

const CACHE_TTL = 10 * 60 * 1000;
const CACHE_KEY = "decoupling-monitor";

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
    const yfRange = days > 365 ? "1y" : days > 180 ? "6mo" : "3mo";
    return await yahooChartCloses(ticker, yfRange);
  }
}

function computeReturns(closes: { date: string; close: number }[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1].close > 0) out.push((closes[i].close - closes[i - 1].close) / closes[i - 1].close);
  }
  return out;
}

// pearsonR unificado via computePearsonCorrelation (intermarket-complete)

function nivelDesdeScore(score: number): DecouplingLevel {
  if (score >= 75) return "critico";
  if (score >= 50) return "alto";
  if (score >= 25) return "moderado";
  return "bajo";
}

function buildSignal(key: string, label: string, valor: number | null, umbral: string, nivel: DecouplingLevel, detalle: string, fuente: string): DecouplingSignal {
  return { key, label, valor, umbral, nivel, detalle, fuente };
}

function percentileRank(series: number[], currentVal?: number): number | null {
  const sorted = [...series].sort((a, b) => a - b);
  const val = currentVal ?? series[series.length - 1];
  if (sorted.length < 10) return null;
  const count = sorted.filter((v) => v <= val).length;
  return (count / sorted.length) * 100;
}

function safeTrend(ser: number[]): RotationTrend {
  if (ser.length < 60) return null;
  const s = ser.slice(-Math.min(252, ser.length));
  const x = Array.from({ length: s.length }, (_, i) => i);
  const n = s.length;
  const mx = (n - 1) / 2;
  const my = s.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (s[i] - my);
    den += (i - mx) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const chg = s.length > 1 ? ((s[s.length - 1] / s[0]) - 1) * 100 : 0;
  if (slope > 0 && chg > 2) return "up";
  if (slope < 0 && chg < -2) return "down";
  return "flat";
}

function regimeAvgFromDates(closes: { date: string; close: number }[], start: string, end?: string): number | null {
  const s = closes.filter((c) => c.date >= start && (!end || c.date <= end)).map((c) => c.close);
  if (s.length < 5) return null;
  return s.reduce((a, b) => a + b, 0) / s.length;
}

//  Server function 

export const getDecouplingMonitor = createServerFn({ method: "GET" }).handler(
  async (): Promise<DecouplingResult> => {
    const cached = getCached<DecouplingResult>(CACHE_KEY, CACHE_TTL);
    if (cached) return cached;

    const DAYS = 500;
    // Fetch more tickers for credit cycle + rotation signals
    const [
      tltData, spyData, dbcData, xlpData, xlyData,
      tnxData, fvxData, irxData,
      hygData, lqdData, iefData,
      copxData, gldData, rspData, iwmData, qqqData,
      xlkData, xleData, xliData, xluData, xlbData, xlfData,
      xlvData, xlcData, xlreData, dxyData, eemData,
    ] = await Promise.all([
      fetchYahooHistory("TLT", DAYS),
      fetchYahooHistory("SPY", DAYS),
      fetchYahooHistory("DBC", DAYS),
      fetchYahooHistory("XLP", DAYS),
      fetchYahooHistory("XLY", DAYS),
      fetchYahooHistory("^TNX", DAYS),
      fetchYahooHistory("^FVX", DAYS),
      fetchYahooHistory("^IRX", DAYS),
      fetchYahooHistory("HYG", DAYS),
      fetchYahooHistory("LQD", DAYS),
      fetchYahooHistory("IEF", DAYS),
      fetchYahooHistory("COPX", DAYS),
      fetchYahooHistory("GLD", DAYS),
      fetchYahooHistory("RSP", DAYS),
      fetchYahooHistory("IWM", DAYS),
      fetchYahooHistory("QQQ", DAYS),
      fetchYahooHistory("XLK", DAYS),
      fetchYahooHistory("XLE", DAYS),
      fetchYahooHistory("XLI", DAYS),
      fetchYahooHistory("XLU", DAYS),
      fetchYahooHistory("XLB", DAYS),
      fetchYahooHistory("XLF", DAYS),
      fetchYahooHistory("XLV", DAYS),
      fetchYahooHistory("XLC", DAYS),
      fetchYahooHistory("XLRE", DAYS),
      fetchYahooHistory("DX-Y.NYB", DAYS),
      fetchYahooHistory("EEM", DAYS),
    ]);

    //  1. Correlación TLT/SPY (60d) 
    const tltRets = computeReturns(tltData);
    const spyRets = computeReturns(spyData);
    const corr60 = tltRets.length > 60 && spyRets.length > 60
      ? computePearsonCorrelation(tltRets.slice(-60), spyRets.slice(-60))
      : null;

    const corrNivel: DecouplingLevel =
      corr60 != null && corr60 < -0.3 ? "critico" :
      corr60 != null && corr60 < -0.15 ? "alto" :
      corr60 != null && corr60 < 0 ? "moderado" : "bajo";

    const correlacionTLTSPY = buildSignal(
      "corr_tlt_spy", "Correlación TLT vs SPY (60d)",
      corr60 != null ? Math.round(corr60 * 10000) / 10000 : null,
      "< -0.3 = crítico, < -0.15 = alto, < 0 = moderado",
      corrNivel,
      corr60 != null && corr60 < -0.3
        ? "Correlación negativa y persistente entre bonos y acciones (TLT sube, SPY baja). Señal clásica de flight-to-quality y escenario deflacionario (Murphy Cap. 13)."
        : corr60 != null && corr60 < 0
        ? "Correlación negativa leve. Bonos y acciones están desconectados pero sin la intensidad de una deflación plena. Monitorear evolución."
        : corr60 != null && corr60 > 0.3
        ? "Correlación positiva normal. Bonos y acciones se mueven juntos. Sin señal de desacople deflacionario."
        : "Correlación neutral — dentro de rangos históricos normales.",
      "getBenchmarksMatrix (yahoo-finance2)",
    );

    //  2. Ratio CRB/Bonds 
    let crbSignal: DecouplingLevel = "bajo";
    if (dbcData.length > 20 && tltData.length > 20) {
      const minLen = Math.min(dbcData.length, tltData.length);
      const ratios: number[] = [];
      for (let i = 0; i < minLen; i++) {
        ratios.push(dbcData[dbcData.length - minLen + i].close / tltData[tltData.length - minLen + i].close);
      }
      const cambio1m = ratios.length > 21 ? ((ratios[ratios.length - 1] / ratios[ratios.length - 22]) - 1) : 0;
      crbSignal = cambio1m < -0.05 ? "critico" : cambio1m < -0.02 ? "alto" : cambio1m < 0 ? "moderado" : "bajo";
    }

    const ratioCRBBonds = buildSignal(
      "crb_bonds", "Ratio CRB / T-Bonds (1m)", null,
      "< -5% = crítico, < -2% = alto, < 0 = moderado",
      crbSignal,
      crbSignal === "critico" || crbSignal === "alto"
        ? "Commodities (DBC) cayendo frente a bonos (TLT). Señal de presión deflacionaria."
        : "Ratio CRB/Bonds sin señales deflacionarias. Commodities estables o subiendo frente a bonos.",
      "yahoo-finance2",
    );

    //  3. Curva de Rendimientos 
    const tnxLast = tnxData.length > 0 ? tnxData[tnxData.length - 1].close : null;
    const fvxLast = fvxData.length > 0 ? fvxData[fvxData.length - 1].close : null;
    const irxLast = irxData.length > 0 ? irxData[irxData.length - 1].close : null;
    const spread10y3m = tnxLast != null && irxLast != null ? Math.round((tnxLast - irxLast) * 100) / 100 : null;
    const spread10y2y = tnxLast != null && fvxLast != null ? Math.round((tnxLast - fvxLast) * 100) / 100 : null;
    const invertida = spread10y2y != null && spread10y2y < 0;
    const ycNivel: DecouplingLevel = invertida ? "critico" : (spread10y2y != null && spread10y2y < 0.5) ? "alto" : "bajo";

    const yieldCurveSignal = buildSignal(
      "yield_curve", "Curva de Rendimientos (10Y-2Y)", spread10y2y,
      "< 0 = invertida (crítico), < 0.5% = aplanada (alto)", ycNivel,
      invertida
        ? "CURVA INVERTIDA: Tasas cortas (2Y) más altas que largas (10Y). Señal histórica de recesión — precedió todas las recesiones en EEUU desde 1970."
        : spread10y2y != null && spread10y2y < 0.5
        ? "Curva aplanada — el spread 10Y-2Y está por debajo de 0.5%. Señal de warning: la curva se está invirtiendo. Históricamente precede a la recesión en 6-18 meses."
        : "Curva de rendimientos normal. Sin señal de recesión inminente.",
      "yahoo-finance2",
    );

    const yieldCurve: YieldCurveData = {
      ust10y: tnxLast != null ? Math.round(tnxLast * 100) / 100 : null,
      ust5y: fvxLast != null ? Math.round(fvxLast * 100) / 100 : null,
      irx3m: irxLast != null ? Math.round(irxLast * 100) / 100 : null,
      spread10y3m, spread10y2y, invertida, senal: yieldCurveSignal,
    };

    //  4. Consumer Staples / Cyclicals 
    const xlpRet = computeReturns(xlpData);
    const xlyRet = computeReturns(xlyData);
    const consCyclRatio = xlpData.length > 0 && xlyData.length > 0
      ? xlpData[xlpData.length - 1].close / xlyData[xlyData.length - 1].close : null;
    const cons60d = xlpRet.length > 60 && xlyRet.length > 60
      ? (xlpRet.slice(-60).reduce((a, b) => a + b, 0) / xlpRet.slice(-60).length) -
        (xlyRet.slice(-60).reduce((a, b) => a + b, 0) / xlyRet.slice(-60).length)
      : null;
    const consNivel: DecouplingLevel = cons60d != null && cons60d > 0.02 ? "alto" : cons60d != null && cons60d > 0.01 ? "moderado" : "bajo";

    const consumerCyclical = buildSignal(
      "consumer_cyclical", "Cons. Defensivo vs Cíclico (60d retorno relativo)",
      cons60d != null ? Math.round(cons60d * 10000) / 100 : null,
      "> +2% = alto (staples lideran), > +1% = moderado", consNivel,
      consNivel === "alto" || consNivel === "moderado"
        ? "Staples (XLP) superan a Cíclicos (XLY) — los inversores buscan defensivos. Comportamiento típico de contractación o deflación."
        : "Sin sesgo defensivo significativo. Consumo cíclico se mantiene competitivo frente a defensivos.",
      "yahoo-finance2",
    );

    //  5. CREDIT CYCLE (percentiles históricos desde 2007) 
    // IG Spread Proxy: LQD/IEF
    const lqdPrices = lqdData.map((c) => c.close);
    const iefPrices = iefData.map((c) => c.close);
    const igRatios: number[] = [];
    const minIG = Math.min(lqdData.length, iefData.length);
    for (let i = 0; i < minIG; i++) {
      if (iefPrices[iefPrices.length - minIG + i] > 0) {
        igRatios.push(lqdPrices[lqdPrices.length - minIG + i] / iefPrices[iefPrices.length - minIG + i]);
      }
    }
    const igCurrent = igRatios.length > 0 ? igRatios[igRatios.length - 1] : null;
    const igPct = igRatios.length > 50 ? percentileRank(igRatios) : null;

    // HY Spread Proxy: HYG/IEF
    const hygPrices = hygData.map((c) => c.close);
    const hyRatios: number[] = [];
    const minHY = Math.min(hygData.length, iefData.length);
    for (let i = 0; i < minHY; i++) {
      if (iefPrices[iefPrices.length - minHY + i] > 0) {
        hyRatios.push(hygPrices[hygPrices.length - minHY + i] / iefPrices[iefPrices.length - minHY + i]);
      }
    }
    const hyCurrent = hyRatios.length > 0 ? hyRatios[hyRatios.length - 1] : null;
    const hyPct = hyRatios.length > 50 ? percentileRank(hyRatios) : null;

    // Risk Appetite: HYG/LQD
    const lqdCloses = lqdData.map((c) => c.close);
    const hygCloses = hygData.map((c) => c.close);
    const raRatios: number[] = [];
    const minRA = Math.min(hygData.length, lqdData.length);
    for (let i = 0; i < minRA; i++) {
      if (lqdCloses[lqdCloses.length - minRA + i] > 0) {
        raRatios.push(hygCloses[hygCloses.length - minRA + i] / lqdCloses[lqdCloses.length - minRA + i]);
      }
    }
    const raCurrent = raRatios.length > 0 ? raRatios[raRatios.length - 1] : null;
    const raPct = raRatios.length > 50 ? percentileRank(raRatios) : null;

    // Historical comparison
    const igGFC = regimeAvgFromDates(iefData.length > lqdData.length ? lqdData : lqdData, "2007-09-01", "2009-06-30");
    const igCOVID = regimeAvgFromDates(lqdData, "2020-02-01", "2020-06-30");
    const igNow = lqdData.length > 20 ? lqdData.slice(-21).reduce((a, b) => a + b.close, 0) / 21 : null;
    const hyGFC = regimeAvgFromDates(hygData, "2007-09-01", "2009-06-30");
    const hyCOVID = regimeAvgFromDates(hygData, "2020-02-01", "2020-06-30");
    const hyNow = hygData.length > 20 ? hygData.slice(-21).reduce((a, b) => a + b.close, 0) / 21 : null;

    let creditAlertLevel: CreditAlertLevel = "NONE";
    if ((igPct != null && igPct >= 95) || (hyPct != null && hyPct >= 95)) creditAlertLevel = "CRITICAL";
    else if ((igPct != null && igPct >= 90) || (hyPct != null && hyPct >= 90)) creditAlertLevel = "WARNING";

    const creditCycle: CreditSpreadData = {
      igProxy: igCurrent != null ? Math.round(igCurrent * 10000) / 10000 : null,
      hyProxy: hyCurrent != null ? Math.round(hyCurrent * 10000) / 10000 : null,
      riskAppetite: raCurrent != null ? Math.round(raCurrent * 10000) / 10000 : null,
      igPercentil: igPct != null ? Math.round(igPct * 10) / 10 : null,
      hyPercentil: hyPct != null ? Math.round(hyPct * 10) / 10 : null,
      raPercentil: raPct != null ? Math.round(raPct * 10) / 10 : null,
      igGFC: igGFC != null ? Math.round(igGFC * 100) / 100 : null,
      igCOVID: igCOVID != null ? Math.round(igCOVID * 100) / 100 : null,
      igNow: igNow != null ? Math.round(igNow * 100) / 100 : null,
      hyGFC: hyGFC != null ? Math.round(hyGFC * 100) / 100 : null,
      hyCOVID: hyCOVID != null ? Math.round(hyCOVID * 100) / 100 : null,
      hyNow: hyNow != null ? Math.round(hyNow * 100) / 100 : null,
      alertLevel: creditAlertLevel,
    };

    //  6. ROTATION SIGNALS (5 Murphy leading indicators) 
    const rotationSignals: RotationSignal[] = [];

    // 6a. Copper/Gold (COPX/GLD) — Dr. Copper
    if (copxData.length > 20 && gldData.length > 20) {
      const minCx = Math.min(copxData.length, gldData.length);
      const cgRatios: number[] = [];
      for (let i = 0; i < minCx; i++) {
        const g = gldData[gldData.length - minCx + i].close;
        if (g > 0) cgRatios.push(copxData[copxData.length - minCx + i].close / g);
      }
      const cgTrend = cgRatios.length > 60 ? safeTrend(cgRatios) : null;
      const cgPct = cgRatios.length > 50 ? percentileRank(cgRatios) : null;
      rotationSignals.push({
        key: "copper_gold", label: "Cobre/Oro (COPX÷GLD) — Dr. Copper",
        trend: cgTrend, valor: cgRatios.length > 0 ? Math.round(cgRatios[cgRatios.length - 1] * 10000) / 10000 : null,
        percentil: cgPct != null ? Math.round(cgPct * 10) / 10 : null,
        interpretacion: cgTrend === "up"
          ? "[VERDE] Cobre > Oro: expansión industrial, demanda real. Dr. Copper confirma crecimiento."
          : cgTrend === "down"
          ? "[ROJO] Oro > Cobre: incertidumbre, contracción industrial anticipada. Adelanta recesión 3-6m."
          : " Sin tendencia clara.",
      });
    }

    // 6b. Equal/Cap (RSP/SPY) — Market breadth
    if (rspData.length > 20 && spyData.length > 20) {
      const minRs = Math.min(rspData.length, spyData.length);
      const rsRatios: number[] = [];
      for (let i = 0; i < minRs; i++) {
        const s = spyData[spyData.length - minRs + i].close;
        if (s > 0) rsRatios.push(rspData[rspData.length - minRs + i].close / s);
      }
      const rsTrend = rsRatios.length > 60 ? safeTrend(rsRatios) : null;
      const rsPct = rsRatios.length > 50 ? percentileRank(rsRatios) : null;
      rotationSignals.push({
        key: "equal_cap", label: "Equal/Cap (RSP÷SPY) — Amplitud de mercado",
        trend: rsTrend, valor: rsRatios.length > 0 ? Math.round(rsRatios[rsRatios.length - 1] * 10000) / 10000 : null,
        percentil: rsPct != null ? Math.round(rsPct * 10) / 10 : null,
        interpretacion: rsTrend === "up"
          ? "[VERDE] RSP > SPY: participación AMPLIA. Mercado saludable, líderes amplios."
          : rsTrend === "down"
          ? "[ROJO] SPY > RSP: mercado ANGOSTO. Solo mega-caps suben — señal de late cycle."
          : " Neutral.",
      });
    }

    // 6c. Tech/Energy (XLK/XLE) — Sector rotation
    if (xlkData.length > 20 && xleData.length > 20) {
      const minTe = Math.min(xlkData.length, xleData.length);
      const teRatios: number[] = [];
      for (let i = 0; i < minTe; i++) {
        const e = xleData[xleData.length - minTe + i].close;
        if (e > 0) teRatios.push(xlkData[xlkData.length - minTe + i].close / e);
      }
      const teTrend = teRatios.length > 60 ? safeTrend(teRatios) : null;
      rotationSignals.push({
        key: "tech_energy", label: "Tech/Energy (XLK÷XLE) — Rotación sectorial",
        trend: teTrend,
        valor: teRatios.length > 0 ? Math.round(teRatios[teRatios.length - 1] * 10000) / 10000 : null,
        percentil: null,
        interpretacion: teTrend === "up"
          ? "[VERDE] Tech > Energy: early/mid cycle. Innovación lidera."
          : teTrend === "down"
          ? "[ROJO] Energy > Tech: LATE CYCLE. Rotación clásica a inflación."
          : " Neutral.",
      });
    }

    // 6d. Cyclical/Defensive ((XLY+XLI)/(XLP+XLU))
    if (xlyData.length > 20 && xliData.length > 20 && xlpData.length > 20 && xluData.length > 20) {
      const minCd = Math.min(xlyData.length, xliData.length, xlpData.length, xluData.length);
      const cdRatios: number[] = [];
      for (let i = 0; i < minCd; i++) {
        const cycle = xlyData[xlyData.length - minCd + i].close + xliData[xliData.length - minCd + i].close;
        const def = xlpData[xlpData.length - minCd + i].close + xluData[xluData.length - minCd + i].close;
        if (def > 0) cdRatios.push(cycle / def);
      }
      const cdTrend = cdRatios.length > 60 ? safeTrend(cdRatios) : null;
      const cdPct = cdRatios.length > 50 ? percentileRank(cdRatios) : null;
      rotationSignals.push({
        key: "cyclical_defensive", label: "Cíclico/Defensivo ((XLY+XLI)÷(XLP+XLU))",
        trend: cdTrend, valor: cdRatios.length > 0 ? Math.round(cdRatios[cdRatios.length - 1] * 10000) / 10000 : null,
        percentil: cdPct != null ? Math.round(cdPct * 10) / 10 : null,
        interpretacion: cdTrend === "up"
          ? "[VERDE] Cíclicos > Defensivas: risk-on. Expansión."
          : cdTrend === "down"
          ? "[ROJO] Defensivas > Cíclicos: flight to safety. Contracción."
          : " Neutral.",
      });
    }

    // 6e. Bonds/Stocks (TLT/SPY) — Asset rotation
    if (tltData.length > 20 && spyData.length > 20) {
      const minBs = Math.min(tltData.length, spyData.length);
      const bsRatios: number[] = [];
      for (let i = 0; i < minBs; i++) {
        const s = spyData[spyData.length - minBs + i].close;
        if (s > 0) bsRatios.push(tltData[tltData.length - minBs + i].close / s);
      }
      const bsTrend = bsRatios.length > 60 ? safeTrend(bsRatios) : null;
      rotationSignals.push({
        key: "bonds_stocks", label: "Bonos/Stocks (TLT÷SPY) — Rotación activos",
        trend: bsTrend,
        valor: bsRatios.length > 0 ? Math.round(bsRatios[bsRatios.length - 1] * 10000) / 10000 : null,
        percentil: null,
        interpretacion: bsTrend === "up"
          ? "[VERDE] Bonos > Stocks: flight to quality. Riesgo-off."
          : bsTrend === "down"
          ? "[VERDE] Stocks > Bonos: risk-on. Expansión."
          : " Neutral.",
      });
    }

    // 6f. DXY (US Dollar Index) — Murphy Cap. 6, pp. 89-92
    if (dxyData.length > 20) {
      const dxyPrices = dxyData.map((c) => c.close);
      const dxyTrend = dxyPrices.length > 60 ? safeTrend(dxyPrices) : null;
      const dxyChg1m = dxyPrices.length > 21 ? ((dxyPrices[dxyPrices.length - 1] / dxyPrices[dxyPrices.length - 22]) - 1) * 100 : null;
      rotationSignals.push({
        key: "dxy", label: "DXY (US Dollar Index) — Murphy pp. 89-92",
        trend: dxyTrend, valor: dxyPrices.length > 0 ? Math.round(dxyPrices[dxyPrices.length - 1] * 100) / 100 : null,
        percentil: null,
        interpretacion: dxyTrend === "up"
          ? " DXY subiendo: dólar fuerte → commodities caen, presión deflacionaria, emergentes débiles. Bonos largos favorecidos (Murphy p. 93)."
          : dxyTrend === "down"
          ? "[AMARILLO] DXY cayendo: dólar débil → commodities suben, inflación importada, emergentes favorecidos. Bonos largos presionados (Murphy pp. 145-154)."
          : " DXY lateral — sin dirección clara.",
      });
    }

    // 6g. EEM (Emerging Markets) — Murphy Cap. 15, pp. 235-237
    if (eemData.length > 20) {
      const eemPrices = eemData.map((c) => c.close);
      const eemTrend = eemPrices.length > 60 ? safeTrend(eemPrices) : null;
      const eemVsSpy = eemPrices.length > 20 && spyData.length > 20
        ? eemPrices[eemPrices.length - 1] / spyData[spyData.length - 1].close : null;
      rotationSignals.push({
        key: "eem", label: "EEM (Emergentes) — Murphy Cap. 15, pp. 235-237",
        trend: eemTrend, valor: eemPrices.length > 0 ? Math.round(eemPrices[eemPrices.length - 1] * 100) / 100 : null,
        percentil: eemVsSpy != null ? Math.round(eemVsSpy * 10000) / 10000 : null,
        interpretacion: eemTrend === "up"
          ? "[VERDE] Emergentes subiendo: dólar débil + commodities fuertes = flujo a EM (Murphy p. 235). Confirma apetito por riesgo global."
          : eemTrend === "down"
          ? "[ROJO] Emergentes cayendo: dólar fuerte + commodities débiles = salida de EM. Señal de contracción global (Murphy pp. 236-237)."
          : " EEM lateral — sin dirección clara en emergentes.",
      });
    }

    //  7. SECTOR MOMENTUM 
    const sectorMap: Record<string, string> = {
      XLK: "Technology", XLF: "Financial Services", XLE: "Energy",
      XLV: "Healthcare", XLP: "Consumer Defensive", XLY: "Consumer Cyclical",
      XLB: "Basic Materials", XLI: "Industrials", XLU: "Utilities",
      XLC: "Communication Services", XLRE: "Real Estate",
    };
    const sectorData: Record<string, { close: number }[]> = {
      XLK: xlkData, XLF: xlfData, XLE: xleData, XLV: xlvData, XLP: xlpData,
      XLY: xlyData, XLB: xlbData, XLI: xliData, XLU: xluData, XLC: xlcData, XLRE: xlreData,
    };

    const sectorMomentum: SectorMomentum[] = [];
    for (const [ticker, nombre] of Object.entries(sectorMap)) {
      const data = sectorData[ticker];
      if (!data || data.length < 126) continue;
      const prices = data.map((c) => c.close);
      const ret6m = ((prices[prices.length - 1] / prices[prices.length - 126]) - 1) * 100;
      sectorMomentum.push({
        ticker, nombre,
        retorno6m: Math.round(ret6m * 100) / 100,
        accion: "NEUTRAL",
      });
    }
    sectorMomentum.sort((a, b) => (b.retorno6m ?? 0) - (a.retorno6m ?? 0));

    //  Score compuesto 
    const peso = { corr: 20, crb: 20, yc: 25, cons: 15, credito: 20 };
    const scoreMap: Record<DecouplingLevel, number> = { bajo: 0, moderado: 25, alto: 50, critico: 100 };
    const creditoNivel: DecouplingLevel = creditAlertLevel === "CRITICAL" ? "critico" : creditAlertLevel === "WARNING" ? "alto" : "bajo";

    const scoreCorr = scoreMap[corrNivel] * peso.corr / 100;
    const scoreCrb = scoreMap[crbSignal] * peso.crb / 100;
    const scoreYc = scoreMap[ycNivel] * peso.yc / 100;
    const scoreCons = scoreMap[consNivel] * peso.cons / 100;
    const scoreCredito = scoreMap[creditoNivel] * peso.credito / 100;

    const compositeScore = Math.round(scoreCorr + scoreCrb + scoreYc + scoreCons + scoreCredito);
    const senalesActivas = [corrNivel, crbSignal, ycNivel, consNivel, creditoNivel]
      .filter((s) => s === "alto" || s === "critico").length;

    const compuesto: CompositeScore = {
      score: compositeScore,
      nivel: nivelDesdeScore(compositeScore),
      senalesActivas,
      totalSenales: 5,
    };

    const argentinaIPC: DecouplingSignal = {
      key: "argentina_ipc",
      label: "IPC Argentina (Inflación)",
      valor: null,
      umbral: "> 5% mensual = crítico",
      nivel: "bajo",
      detalle: "Sin datos suficientes para calcular inflación argentina en tiempo real.",
      fuente: "INDEC / BCRA",
    };

    // Reciclado §7 intermarket_cycle_detector.py: régimen deflacionario (TLT-SPY
    // 252d < -0.3 invalida el modelo estándar) y flight-to-quality (HYG-TLT 126d).
    const tltCloses = tltData.map((c) => c.close);
    const spyCloses = spyData.map((c) => c.close);
    const hygClosesAll = hygData.map((c) => c.close);
    const corrTLTSPY252 = corrRolling(tltCloses, spyCloses, 252, 100);
    const corrHYGTLT126 = corrRolling(hygClosesAll, tltCloses, 126, 60);
    const riesgosRegimen = {
      correlacionTLTSPY252: corrTLTSPY252 != null ? Math.round(corrTLTSPY252 * 100) / 100 : null,
      desacopleDeflacionario: corrTLTSPY252 != null && corrTLTSPY252 < -0.3,
      correlacionHYGTLT126: corrHYGTLT126 != null ? Math.round(corrHYGTLT126 * 100) / 100 : null,
      flightToQuality: corrHYGTLT126 != null && corrHYGTLT126 < -0.3,
    };

    const result: DecouplingResult = {
      correlacionTLTSPY,
      ratioCRBBonds,
      yieldCurve,
      consumerCyclical,
      argentinaIPC,
      creditCycle,
      rotationSignals,
      sectorMomentum,
      compuesto,
      riesgosRegimen,
      generatedAt: new Date().toISOString(),
    };

    setCache(CACHE_KEY, result);
    return result;
  },
);