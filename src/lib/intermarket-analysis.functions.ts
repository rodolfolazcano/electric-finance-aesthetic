// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "./cache";
import { yahooChartCloses } from "./yahoo-chart";
import { computePearsonCorrelation } from "@/lib/herramientas/intermarket-complete";
import {
  detectarSetupInflacionarioAgresivo,
  generarLecturaIntermarket,
  determinarEtapaCiclo,
  type LecturaIntermarket,
  type CicloEconomico,
} from "./intermarket-engine";

// ─── Tipos existentes ──────────────────────────────────────────

export interface RollingCorrelation {
  asset1: string;
  asset2: string;
  label: string;
  current: number | null;
  interpretation: string;
  correlacionEstructural?: number | null;
  leadLagText?: string | null;
}

export interface ArgentinaCorrelation {
  label: string;
  current: number | null;
  interpretation: string;
}

// ─── PASO 13 — Relative Strength Ratios ────────────────────────

export interface RelativeStrengthRatio {
  label: string;
  descripcion: string;
  valorActual: number | null;
  variacion30dPct: number | null;
  interpretacion: string;
  datos: { fecha: string; valor: number }[];
}

export interface LeadLagInfo {
  label: string;
  bestLag: number | null;
  bestCorrelation: number | null;
  text: string;
}

export interface Alerta1987 {
  activa: boolean;
  mensaje: string | null;
}

export interface DivergenciaCommoditySector {
  detectada: boolean;
  mensaje: string | null;
}

export interface EvaluacionLagDolar {
  correlacion60d: number | null;
  correlacion250d: number | null;
  correlacion500d: number | null;
  interpretacion: string;
}

export interface IntermarketResult {
  correlations: RollingCorrelation[];
  argentina: ArgentinaCorrelation[];
  relativeStrength: RelativeStrengthRatio[]; // PASO 13
  leadLag: LeadLagInfo[];
  alerta1987: Alerta1987;
  lecturaIntermarket: LecturaIntermarket;
  divergenciaOilXLE: DivergenciaCommoditySector;
  evaluacionLagDolar: EvaluacionLagDolar;
  indiceIndustrialTrend: number | null;
  ratioCommoditiesBonos: RelativeStrengthRatio | null;
  timestamp: string;
}

// ─── Helpers estadísticos ──────────────────────────────────────
// pearsonR y rollingCorrelation unificados via computePearsonCorrelation (intermarket-complete)

function rollingCorrelation(prices1: number[], prices2: number[], window = 60): number[] {
  const n = Math.min(prices1.length, prices2.length);
  const result: number[] = [];
  for (let i = window - 1; i < n; i++) {
    const slice1 = prices1.slice(i - window + 1, i + 1);
    const slice2 = prices2.slice(i - window + 1, i + 1);
    result.push(computePearsonCorrelation(slice1, slice2) ?? 0);
  }
  return result;
}

function dailyReturns(prices: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return rets;
}

function interpretCorrelation(value: number | null, relation: string): string {
  if (value == null) return `${relation}: datos insuficientes para calcular correlación.`;
  const isBondsStocks = relation.includes("Bonos") && relation.includes("Acciones");
  if (value < -0.3)
    return isBondsStocks
      ? `${relation}: correlación de ${value.toFixed(2)}. Relación inversa — patrón clásico de rotación entre bonos y acciones.`
      : `${relation}: correlación de ${value.toFixed(2)}. Relación inversa típica de entornos de aversión al riesgo.`;
  if (value > 0.3)
    return isBondsStocks
      ? `${relation}: correlación de ${value.toFixed(2)}. Relación directa — puede indicar régimen deflacionario si ambos caen simultáneamente (Murphy, Cap. 15).`
      : `${relation}: correlación de ${value.toFixed(2)}. Relación directa, atípica del comportamiento histórico.`;
  return `${relation}: correlación de ${value.toFixed(2)}. Relación débil o neutral entre activos.`;
}

// ─── LEAD-LAG ANALYSIS (nuevo) ─────────────────────────────────

interface CrossCorrelationResult {
  bestLag: number | null;
  bestCorrelation: number | null;
  text: string;
}

function crossCorrelationLagged(
  rets1: number[],
  rets2: number[],
  label1: string,
  label2: string,
  maxLagDays = 90,
  step = 5,
): CrossCorrelationResult {
  const n = Math.min(rets1.length, rets2.length);
  if (n < 30)
    return {
      bestLag: null,
      bestCorrelation: null,
      text: "Datos insuficientes para análisis lead-lag",
    };

  let bestCorr = 0;
  let bestLag = 0;

  for (let lag = -maxLagDays; lag <= maxLagDays; lag += step) {
    let x: number[], y: number[];
    if (lag >= 0) {
      x = rets1.slice(0, n - lag);
      y = rets2.slice(lag);
    } else {
      x = rets1.slice(-lag);
      y = rets2.slice(0, n + lag);
    }
    if (x.length < 10 || y.length < 10) continue;
    const corr = computePearsonCorrelation(x, y) ?? 0;
    if (Math.abs(corr) > Math.abs(bestCorr)) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  const absLag = Math.abs(bestLag);
  let text: string;
  if (absLag <= step) {
    text = "Sin liderazgo claro detectado (relación sincrónica)";
  } else if (bestLag > 0) {
    text = `${label1} lidera a ${label2} por ~${absLag} días (corr: ${bestCorr.toFixed(2)})`;
  } else {
    text = `${label2} lidera a ${label1} por ~${absLag} días (corr: ${bestCorr.toFixed(2)})`;
  }

  return { bestLag, bestCorrelation: bestCorr, text };
}

// ─── PARTE 4: EVALUAR LAG LARGO DEL DÓLAR (3 ventanas) ────────

function evaluarLagDolar(dxyPrices: number[], dbcPrices: number[]): EvaluacionLagDolar {
  if (dxyPrices.length < 60 || dbcPrices.length < 60) {
    return {
      correlacion60d: null,
      correlacion250d: null,
      correlacion500d: null,
      interpretacion: "Datos insuficientes",
    };
  }

  const retsDxy = dailyReturns(dxyPrices);
  const retsDbc = dailyReturns(dbcPrices);

  const corr60 = rollingCorrelation(retsDxy, retsDbc, 60);
  const c60 = corr60.length > 0 ? Math.round(corr60[corr60.length - 1] * 10000) / 10000 : null;

  let c250: number | null = null;
  if (dxyPrices.length > 250 && dbcPrices.length > 250) {
    const corr250 = rollingCorrelation(retsDxy, retsDbc, 250);
    c250 = corr250.length > 0 ? Math.round(corr250[corr250.length - 1] * 10000) / 10000 : null;
  }

  let c500: number | null = null;
  if (dxyPrices.length > 500 && dbcPrices.length > 500) {
    const corr500 = rollingCorrelation(retsDxy, retsDbc, 500);
    c500 = corr500.length > 0 ? Math.round(corr500[corr500.length - 1] * 10000) / 10000 : null;
  }

  let interpretacion: string;
  if (c60 != null && Math.abs(c60) < 0.2 && c250 != null && Math.abs(c250) > 0.4) {
    interpretacion =
      "Relación dólar-commodities estructuralmente intacta pero con lag; el efecto de movimientos recientes del dólar puede tardar meses en reflejarse (patrón 1985-87).";
  } else if (c60 != null && c250 != null && Math.sign(c60) !== Math.sign(c250)) {
    interpretacion =
      "Ventanas táctica y estructural divergen — posible cambio de régimen en curso, señales con menor confianza.";
  } else if (c60 != null && c60 < -0.3) {
    interpretacion =
      "Relación inversa dólar-commodities confirmada en todas las ventanas temporales.";
  } else {
    interpretacion = "Relación dólar-commodities débil o neutral en la ventana táctica.";
  }

  return { correlacion60d: c60, correlacion250d: c250, correlacion500d: c500, interpretacion };
}

// ─── PARTE 1 (Cap. 3): ÍNDICE INDUSTRIAL (proxy JOC-ECRI) ─────

function calcularIndiceIndustrial(
  copperCloses: number[],
  dbbCloses: number[],
): { indice: number[]; trend: number | null } {
  if (copperCloses.length < 20 && dbbCloses.length < 20) {
    return { indice: [], trend: null };
  }

  // Usar DBB si está disponible (más completo: Al+Zn+Cu), fallback a cobre solo
  const base = dbbCloses.length >= 20 ? dbbCloses : copperCloses;
  const base100 = base.map((v, _, arr) => (v / (arr[0] || 1)) * 100);

  let trend: number | null = null;
  if (base.length >= 21) {
    trend = ((base[base.length - 1] - base[base.length - 21]) / base[base.length - 21]) * 100;
  }

  return { indice: base100, trend };
}

function calcularRatioCommoditiesBonos(
  dbcCloses: number[],
  bondPriceCloses: number[],
): RelativeStrengthRatio | null {
  if (dbcCloses.length < 30 || bondPriceCloses.length < 30) return null;

  const minLen = Math.min(dbcCloses.length, bondPriceCloses.length);
  const datos: { fecha: string; valor: number }[] = [];
  for (let i = 0; i < minLen; i++) {
    if (bondPriceCloses[i] !== 0) {
      datos.push({ fecha: "", valor: dbcCloses[i] / Math.abs(bondPriceCloses[i]) });
    }
  }

  if (datos.length === 0) return null;

  const actual = datos[datos.length - 1].valor;
  const hace60d = datos.length >= 60 ? datos[datos.length - 60].valor : null;
  const var60d =
    actual != null && hace60d != null && hace60d > 0 ? ((actual - hace60d) / hace60d) * 100 : null;

  const hace120d = datos.length >= 120 ? datos[datos.length - 120].valor : null;
  const var120d =
    actual != null && hace120d != null && hace120d > 0
      ? ((actual - hace120d) / hace120d) * 100
      : null;

  let interpretacion: string;
  if (var60d != null && var60d > 5) {
    interpretacion = `Ratio commodities/bonos en alza (${var60d.toFixed(1)}% en 60d) — favorecer sectores de materiales/energía, des-favorecer utilities/financieras (Murphy, Cap. 3)`;
  } else if (var60d != null && var60d < -5) {
    interpretacion = `Ratio commodities/bonos en baja (${var60d.toFixed(1)}% en 60d) — favorecer sectores sensibles a tasas (Murphy, Cap. 3)`;
  } else {
    interpretacion =
      var60d != null
        ? `Ratio commodities/bonos lateral (${var60d.toFixed(1)}% en 60d) — sin sesgo sectorial claro`
        : "Datos insuficientes para evaluar tendencia del ratio";
  }

  return {
    label: "Commodities/Bonos",
    descripcion: `DBC / precio bono (proxy) — ${var120d != null ? `tendencia 120d: ${var120d.toFixed(1)}%` : "sube = materiales/energía, baja = rate-sensitive"} (Murphy, Cap. 3)`,
    valorActual: actual != null ? Math.round(actual * 1000) / 1000 : null,
    variacion30dPct: var60d != null ? Math.round(var60d * 100) / 100 : null,
    interpretacion,
    datos: datos.slice(-120),
  };
}

// ─── Server function ───────────────────────────────────────────

export const getIntermarketAnalysis = createServerFn({ method: "GET" }).handler(
  async (): Promise<IntermarketResult> => {
    const CACHE_KEY = "intermarket-analysis-v2";
    const cached = getCached<IntermarketResult>(CACHE_KEY, 15 * 60 * 1000);
    if (cached) return cached;

    // ── Parte 1: Correlaciones de Pearson (existente) ──
    const pairs = [
      { symbol1: "^TNX", symbol2: "^GSPC", label: "Bonos (UST 10Y) vs Acciones (S&P500)" },
      { symbol1: "DX-Y.NYB", symbol2: "DBC", label: "Dólar (DXY) vs Commodities (DBC)" },
      { symbol1: "GC=F", symbol2: "^TNX", label: "Oro (GC=F) vs Bonos (UST 10Y)" },
      { symbol1: "CL=F", symbol2: "DX-Y.NYB", label: "Petróleo (CL=F) vs Dólar (DXY)" },
    ];

    const results = await Promise.allSettled(
      pairs.map((p) =>
        Promise.all([yahooChartCloses(p.symbol1, "6mo"), yahooChartCloses(p.symbol2, "6mo")]),
      ),
    );

    // ── Fetch adicional: HG=F y DBB (metales industriales, Cap. 3) ──
    const [hgData, dbbData] = await Promise.allSettled([
      yahooChartCloses("HG=F", "6mo"),
      yahooChartCloses("DBB", "6mo"),
    ]);

    const correlations: RollingCorrelation[] = [];
    const leadLag: LeadLagInfo[] = [];
    let correlacionEstructural: number | null = null;

    // ── 5to gauge: Metales Industriales vs Bonos (Cap. 3) ──
    let indiceIndustrialTrend: number | null = null;
    if (hgData.status === "fulfilled" || dbbData.status === "fulfilled") {
      const copper = hgData.status === "fulfilled" ? hgData.value.map((c) => c.close) : [];
      const dbb = dbbData.status === "fulfilled" ? dbbData.value.map((c) => c.close) : [];
      const indice = calcularIndiceIndustrial(copper, dbb);
      indiceIndustrialTrend = indice.trend;

      // Correlación metales industriales vs bonos (usar TNX invertido como proxy)
      if (results[0].status === "fulfilled") {
        const tnxPrices = results[0].value[0].map((c) => c.close);
        const basePrices = dbb.length >= 20 ? dbb : copper;
        if (tnxPrices.length >= 60 && basePrices.length >= 60) {
          const bondProxy = tnxPrices.map((y) => -y);
          const retsBond = dailyReturns(bondProxy);
          const retsMetal = dailyReturns(basePrices);
          const rolling = rollingCorrelation(retsMetal, retsBond, 60);
          const current = rolling.length > 0 ? rolling[rolling.length - 1] : null;
          correlations.push({
            asset1: "HG=F/DBB",
            asset2: "^TNX (inv.)",
            label: "Metales Industriales vs Bonos",
            current: current != null ? Math.round(current * 10000) / 10000 : null,
            interpretation: interpretCorrelation(current, "Metales Industriales vs Bonos (precio)"),
            leadLagText: null,
          });
        }
      }
    }

    for (let i = 0; i < pairs.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled") {
        correlations.push({
          asset1: pairs[i].symbol1,
          asset2: pairs[i].symbol2,
          label: pairs[i].label,
          current: null,
          interpretation: interpretCorrelation(null, pairs[i].label),
        });
        continue;
      }
      const [p1, p2] = r.value;
      if (p1.length < 60 || p2.length < 60) {
        correlations.push({
          asset1: pairs[i].symbol1,
          asset2: pairs[i].symbol2,
          label: pairs[i].label,
          current: null,
          interpretation: interpretCorrelation(null, pairs[i].label),
        });
        continue;
      }
      const rets1 = dailyReturns(p1.map((c) => c.close));
      const rets2 = dailyReturns(p2.map((c) => c.close));
      const rolling = rollingCorrelation(rets1, rets2, 60);
      const current = rolling.length > 0 ? rolling[rolling.length - 1] : null;

      // Correlación estructural 250d específicamente para DXY vs DBC
      const isDxyDbc = pairs[i].symbol1 === "DX-Y.NYB" && pairs[i].symbol2 === "DBC";
      const llText = isDxyDbc && leadLag.length >= 2 ? leadLag[1].text : null;
      // Para Bonds vs Stocks (par 0), asociar leadLag[0]
      const isBondsStocks = pairs[i].symbol1 === "^TNX" && pairs[i].symbol2 === "^GSPC";
      const llTextBondsStocks = isBondsStocks && leadLag.length >= 1 ? leadLag[0].text : null;

      correlations.push({
        asset1: pairs[i].symbol1,
        asset2: pairs[i].symbol2,
        label: pairs[i].label,
        current: current != null ? Math.round(current * 10000) / 10000 : null,
        interpretation: interpretCorrelation(current, pairs[i].label),
        correlacionEstructural: isDxyDbc ? correlacionEstructural : undefined,
        leadLagText: llTextBondsStocks ?? llText ?? null,
      });
    }

    // ── Argentina (existente) ──
    let argentinaCorr: ArgentinaCorrelation[] = [];
    try {
      const [mervalData, rpData, cclData] = await Promise.allSettled([
        yahooChartCloses("^MERV", "6mo"),
        fetch("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais", {
          signal: AbortSignal.timeout(5000),
        }),
        fetch("https://api.argentinadatos.com/v1/finanzas/tipos-cambio/ccl", {
          signal: AbortSignal.timeout(5000),
        }),
      ]);

      if (mervalData.status === "fulfilled" && rpData.status === "fulfilled") {
        const merval = mervalData.value;
        const rpJson = await rpData.value.json();
        const rpArray = Array.isArray(rpJson)
          ? rpJson.map((r: any) => r.valor ?? r.riesgoPais ?? 0)
          : [];
        const mervalCloses = merval.map((m) => m.close);
        if (mervalCloses.length > 30 && rpArray.length > 30) {
          const alignedLen = Math.min(mervalCloses.length, rpArray.length);
          const mSlice = mervalCloses.slice(-alignedLen);
          const rSlice = rpArray.slice(-alignedLen);
          const r =
            Math.round(
              (computePearsonCorrelation(dailyReturns(mSlice), dailyReturns(rSlice)) ?? 0) * 10000,
            ) / 10000;
          argentinaCorr.push({
            label: "Riesgo País vs Merval",
            current: r,
            interpretation: interpretCorrelation(r, "Riesgo País vs Merval"),
          });
        }
      }
      if (mervalData.status === "fulfilled" && cclData.status === "fulfilled") {
        const merval = mervalData.value;
        const cclJson = await cclData.value.json();
        const cclArray = Array.isArray(cclJson)
          ? cclJson.map((r: any) => r.venta ?? r.valor ?? 0)
          : [];
        const mervalCloses = merval.map((m) => m.close);
        if (mervalCloses.length > 30 && cclArray.length > 30) {
          const alignedLen = Math.min(mervalCloses.length, cclArray.length);
          const mSlice = mervalCloses.slice(-alignedLen);
          const cSlice = cclArray.slice(-alignedLen);
          const r =
            Math.round(
              (computePearsonCorrelation(dailyReturns(mSlice), dailyReturns(cSlice)) ?? 0) * 10000,
            ) / 10000;
          argentinaCorr.push({
            label: "CCL vs Merval",
            current: r,
            interpretation: interpretCorrelation(r, "Tipo de cambio CCL vs Merval"),
          });
        }
      }
    } catch {
      argentinaCorr = [
        {
          label: "Riesgo País vs Merval",
          current: null,
          interpretation: "Riesgo País vs Merval: datos insuficientes.",
        },
        {
          label: "CCL vs Merval",
          current: null,
          interpretation: "CCL vs Merval: datos insuficientes.",
        },
      ];
    }

    // ── Lead-Lag: extraer TNX y GSPC del par 0 ──
    if (results[0].status === "fulfilled") {
      const tnxPrices = results[0].value[0].map((c) => c.close);
      const spxPrices = results[0].value[1].map((c) => c.close);
      if (tnxPrices.length > 60 && spxPrices.length > 60) {
        // Bond price proxy ≈ invertir yield TNX
        const bondPriceProxy = tnxPrices.map((y) => -y);
        const bondRets = dailyReturns(bondPriceProxy);
        const spxRets = dailyReturns(spxPrices);
        const llBondsStocks = crossCorrelationLagged(
          bondRets,
          spxRets,
          "Bonos (precio)",
          "Acciones",
          90,
          5,
        );
        leadLag.push({
          label: "Bonos vs Acciones",
          bestLag: llBondsStocks.bestLag,
          bestCorrelation: llBondsStocks.bestCorrelation,
          text: llBondsStocks.text,
        });
      }
    }
    // Lead-Lag: DBC (CRB proxy) vs Bonds
    if (results[0].status === "fulfilled" && results[1].status === "fulfilled") {
      const tnxPrices = results[0].value[0].map((c) => c.close);
      const dbcPrices = results[1].value[1].map((c) => c.close);
      if (tnxPrices.length > 60 && dbcPrices.length > 60) {
        const bondPriceProxy = tnxPrices.map((y) => -y);
        const bondRets = dailyReturns(bondPriceProxy);
        const dbcRets = dailyReturns(dbcPrices);
        const llCrbBonds = crossCorrelationLagged(
          dbcRets,
          bondRets,
          "Commodities (DBC)",
          "Bonos (precio)",
          90,
          5,
        );
        leadLag.push({
          label: "CRB (DBC) vs Bonos",
          bestLag: llCrbBonds.bestLag,
          bestCorrelation: llCrbBonds.bestCorrelation,
          text: llCrbBonds.text,
        });
      }
    }

    // ── Datos largos para correlación estructural y evaluación de lag ──
    const [dxy1y, dbc1y, dxy2y, dbc2y] = await Promise.allSettled([
      yahooChartCloses("DX-Y.NYB", "1y"),
      yahooChartCloses("DBC", "1y"),
      yahooChartCloses("DX-Y.NYB", "2y"),
      yahooChartCloses("DBC", "2y"),
    ]);

    let correlacion500d: number | null = null;
    const dxyParaEval: number[] = [];
    const dbcParaEval: number[] = [];

    if (dxy1y.status === "fulfilled" && dbc1y.status === "fulfilled") {
      const dxyLong = dxy1y.value.map((c) => c.close);
      const dbcLong = dbc1y.value.map((c) => c.close);
      if (dxyLong.length > 250 && dbcLong.length > 250) {
        const retsDxy = dailyReturns(dxyLong);
        const retsDbc = dailyReturns(dbcLong);
        const rollingLargo = rollingCorrelation(retsDxy, retsDbc, 250);
        correlacionEstructural =
          rollingLargo.length > 0
            ? Math.round(rollingLargo[rollingLargo.length - 1] * 10000) / 10000
            : null;
      }
    }

    if (dxy2y.status === "fulfilled" && dbc2y.status === "fulfilled") {
      const dxyVals = dxy2y.value.map((c) => c.close);
      const dbcVals = dbc2y.value.map((c) => c.close);
      dxyParaEval.push(...dxyVals);
      dbcParaEval.push(...dbcVals);
      if (dxyVals.length > 500 && dbcVals.length > 500) {
        const retsDxy = dailyReturns(dxyVals);
        const retsDbc = dailyReturns(dbcVals);
        const rolling500 = rollingCorrelation(retsDxy, retsDbc, 500);
        correlacion500d =
          rolling500.length > 0
            ? Math.round(rolling500[rolling500.length - 1] * 10000) / 10000
            : null;
      }
    }

    const evaluacionLagDolar = evaluarLagDolar(
      dxyParaEval.length > 0
        ? dxyParaEval
        : dxy1y.status === "fulfilled"
          ? dxy1y.value.map((c) => c.close)
          : [],
      dbcParaEval.length > 0
        ? dbcParaEval
        : dbc1y.status === "fulfilled"
          ? dbc1y.value.map((c) => c.close)
          : [],
    );

    // ── Alerta 1987 ──
    let alerta1987: Alerta1987 = { activa: false, mensaje: null };
    if (results[1].status === "fulfilled" && results[0].status === "fulfilled") {
      const dbcPrices = results[1].value[1].map((c) => c.close);
      const tnxPrices = results[0].value[0].map((c) => c.close);
      alerta1987 = detectarSetupInflacionarioAgresivo(dbcPrices, tnxPrices);
    }

    // ── Datos para Lectura Intermarket (gold, oil, XLE, Dow) ──
    const [goldLongData, oilLongData, xleData, dowLongData] = await Promise.allSettled([
      yahooChartCloses("GC=F", "1y"),
      yahooChartCloses("CL=F", "1y"),
      yahooChartCloses("XLE", "6mo"),
      yahooChartCloses("^DJI", "2y"),
    ]);

    // ── Dow/Gold ratio ──
    let dowGoldRatio: number | null = null;
    if (dowLongData.status === "fulfilled" && goldLongData.status === "fulfilled") {
      const dow = dowLongData.value;
      const gold = goldLongData.value;
      if (dow.length > 0 && gold.length > 0 && gold[gold.length - 1].close > 0) {
        dowGoldRatio =
          Math.round((dow[dow.length - 1].close / gold[gold.length - 1].close) * 100) / 100;
      }
    }

    // ── Divergencia Commodity-Sector: Oil vs XLE ──
    let divergenciaOilXLE: DivergenciaCommoditySector = { detectada: false, mensaje: null };
    if (results[3].status === "fulfilled" && xleData.status === "fulfilled") {
      const oilCloses = results[3].value[0].map((c) => c.close);
      const xleCloses = xleData.value.map((c) => c.close);
      if (oilCloses.length >= 20 && xleCloses.length >= 20) {
        const oilVar20d =
          ((oilCloses[oilCloses.length - 1] - oilCloses[oilCloses.length - 20]) /
            oilCloses[oilCloses.length - 20]) *
          100;
        const xleVar20d =
          ((xleCloses[xleCloses.length - 1] - xleCloses[xleCloses.length - 20]) /
            xleCloses[xleCloses.length - 20]) *
          100;
        if (oilVar20d > 5 && xleVar20d < -3) {
          divergenciaOilXLE = {
            detectada: true,
            mensaje: `Oil sube ${oilVar20d.toFixed(1)}% vs XLE cae ${xleVar20d.toFixed(1)}% en 20d — divergencia que anticipó giros del crudo en sep-1990.`,
          };
        } else if (oilVar20d < -5 && xleVar20d > 3) {
          divergenciaOilXLE = {
            detectada: true,
            mensaje: `Oil cae ${oilVar20d.toFixed(1)}% vs XLE sube ${xleVar20d.toFixed(1)}% en 20d — divergencia, posible giro del commodity.`,
          };
        }
      }
    }

    // ── Generar Lectura Intermarket ──
    let dxyTrend: number | null = null;
    let dbcTrend: number | null = null;
    let bondPriceTrend: number | null = null;
    let spxTrend: number | null = null;
    let goldTrend: number | null = null;
    let oilTrend: number | null = null;

    if (results[1].status === "fulfilled") {
      const dbcP = results[1].value[1].map((c) => c.close);
      if (dbcP.length >= 21)
        dbcTrend =
          ((dbcP[dbcP.length - 1] - dbcP[dbcP.length - 21]) / dbcP[dbcP.length - 21]) * 100;
    }
    if (results[0].status === "fulfilled") {
      const tnxP = results[0].value[0].map((c) => c.close);
      const spxP = results[0].value[1].map((c) => c.close);
      if (tnxP.length >= 21) {
        const bondProxy = tnxP.map((y) => -y);
        bondPriceTrend =
          ((bondProxy[bondProxy.length - 1] - bondProxy[bondProxy.length - 21]) /
            bondProxy[bondProxy.length - 21]) *
          100;
      }
      if (spxP.length >= 21)
        spxTrend =
          ((spxP[spxP.length - 1] - spxP[spxP.length - 21]) / spxP[spxP.length - 21]) * 100;
    }
    if (results[1].status === "fulfilled") {
      const dxyP = results[1].value[0].map((c) => c.close);
      if (dxyP.length >= 21)
        dxyTrend =
          ((dxyP[dxyP.length - 1] - dxyP[dxyP.length - 21]) / dxyP[dxyP.length - 21]) * 100;
    }
    if (oilLongData.status === "fulfilled") {
      const oilP = oilLongData.value.map((c) => c.close);
      if (oilP.length >= 21)
        oilTrend =
          ((oilP[oilP.length - 1] - oilP[oilP.length - 21]) / oilP[oilP.length - 21]) * 100;
    }
    if (goldLongData.status === "fulfilled") {
      const goldP = goldLongData.value.map((c) => c.close);
      if (goldP.length >= 21)
        goldTrend =
          ((goldP[goldP.length - 1] - goldP[goldP.length - 21]) / goldP[goldP.length - 21]) * 100;
    }

    const bondPriceCloses =
      results[0].status === "fulfilled" ? results[0].value[0].map((y) => -y) : [];
    let spxCloses: number[] = [];
    if (results[0].status === "fulfilled") {
      spxCloses = results[0].value[1].map((c) => c.close);
    }

    const dbcClosesFull =
      results[1].status === "fulfilled" ? results[1].value[1].map((c) => c.close) : [];
    const tnxClosesFull =
      results[0].status === "fulfilled" ? results[0].value[0].map((c) => c.close) : [];
    const oilClosesFull =
      oilLongData.status === "fulfilled" ? oilLongData.value.map((c) => c.close) : undefined;
    const goldClosesFull =
      goldLongData.status === "fulfilled" ? goldLongData.value.map((c) => c.close) : undefined;
    const dxyClosesFull =
      results[1].status === "fulfilled" ? results[1].value[0].map((c) => c.close) : undefined;

    // ── Ratio Commodities/Bonos (Cap. 3) ──
    const ratioCommoditiesBonos = calcularRatioCommoditiesBonos(dbcClosesFull, bondPriceCloses);

    const lecturaIntermarket = generarLecturaIntermarket({
      dxyTrend,
      dbcTrend,
      bondPriceTrend,
      spxTrend,
      goldTrend,
      oilTrend,
      industrialTrend: indiceIndustrialTrend,
      dbcCloses: dbcClosesFull,
      tnxCloses: tnxClosesFull,
      bondPriceCloses,
      spxCloses,
      oilCloses: oilClosesFull,
      goldCloses: goldClosesFull,
      dxyCloses: dxyClosesFull,
      dowGoldRatio,
    });

    // ── PASO 13: Relative Strength Ratios ──
    const [xlyData, xlpData, spyRatioData, dowData, goldData] = await Promise.allSettled([
      yahooChartCloses("XLY", "2y"), // Consumer Discretionary
      yahooChartCloses("XLP", "2y"), // Consumer Staples
      yahooChartCloses("SPY", "2y"), // S&P 500 ETF
      yahooChartCloses("^DJI", "2y"), // Dow Jones
      yahooChartCloses("GC=F", "2y"), // Gold futures
    ]);

    const relativeStrength: RelativeStrengthRatio[] = [];

    // Ratio 1: XLY/XLP (Consumer Discretionary / Consumer Staples)
    if (
      xlyData.status === "fulfilled" &&
      xlpData.status === "fulfilled" &&
      spyRatioData.status === "fulfilled"
    ) {
      const xly = xlyData.value.map((c) => c.close);
      const xlp = xlpData.value.map((c) => c.close);
      const spyCloses = spyRatioData.value.map((c) => c.close);
      const minLen = Math.min(xly.length, xlp.length, spyCloses.length);

      // Ratio vs S&P 500 (relative strength sobre índice de base)
      const ratio: { fecha: string; valor: number }[] = [];
      const spyVals = spyRatioData.value;
      for (let i = 0; i < minLen; i++) {
        if (spyVals[i].close > 0 && xlp[i] > 0) {
          ratio.push({ fecha: spyVals[i].date, valor: xly[i] / xlp[i] });
        }
      }

      const actual = ratio.length > 0 ? ratio[ratio.length - 1].valor : null;
      const hace30d = ratio.length >= 21 ? ratio[ratio.length - 21].valor : null;
      const var30d =
        actual != null && hace30d != null && hace30d > 0
          ? ((actual - hace30d) / hace30d) * 100
          : null;

      relativeStrength.push({
        label: "Consumer Disc./Staples ratio",
        descripcion:
          "XLY / XLP — sube = optimismo económico, baja = cautela (Murphy, Cap. 4, pág. 60-63)",
        valorActual: actual != null ? Math.round(actual * 1000) / 1000 : null,
        variacion30dPct: var30d != null ? Math.round(var30d * 100) / 100 : null,
        interpretacion:
          var30d != null
            ? var30d > 0
              ? `Sube ${var30d.toFixed(1)}% en 30d — optimismo económico, consumo discrecional lidera`
              : `Baja ${Math.abs(var30d).toFixed(1)}% en 30d — cautela, consumo defensivo lidera`
            : "Datos insuficientes para tendencia",
        datos: ratio.slice(-90),
      });
    }

    // Ratio 2: Dow/Gold (^DJI / GC=F)
    if (dowData.status === "fulfilled" && goldData.status === "fulfilled") {
      const dow = dowData.value.map((c) => c.close);
      const gold = goldData.value.map((c) => c.close);
      const minLen = Math.min(dow.length, gold.length);

      const ratio: { fecha: string; valor: number }[] = [];
      const dowVals = dowData.value;
      const goldVals = goldData.value;
      for (let i = 0; i < minLen; i++) {
        if (goldVals[i].close > 0) {
          ratio.push({ fecha: dowVals[i].date, valor: dowVals[i].close / goldVals[i].close });
        }
      }

      const actual = ratio.length > 0 ? ratio[ratio.length - 1].valor : null;
      const hace2y = ratio.length >= 500 ? ratio[0].valor : null;
      const var2y =
        actual != null && hace2y != null && hace2y > 0 ? ((actual - hace2y) / hace2y) * 100 : null;

      relativeStrength.push({
        label: "Dow/Gold ratio",
        descripcion:
          "^DJI / GC=F — sube = activos financieros superan a activos duros; baja = lo opuesto (Murphy, Cap. 11, pág. 162-163)",
        valorActual: actual != null ? Math.round(actual * 100) / 100 : null,
        variacion30dPct: null,
        interpretacion:
          var2y != null
            ? var2y > 0
              ? `Sube ${var2y.toFixed(1)}% en 2 años — activos financieros (papel) superan a activos duros (oro)`
              : `Baja ${Math.abs(var2y).toFixed(1)}% en 2 años — activos duros (oro) superan a activos financieros`
            : "Datos insuficientes para tendencia de largo plazo",
        datos: ratio,
      });
    }

    const result: IntermarketResult = {
      correlations,
      argentina: argentinaCorr,
      relativeStrength,
      leadLag,
      alerta1987,
      lecturaIntermarket,
      divergenciaOilXLE,
      evaluacionLagDolar,
      indiceIndustrialTrend,
      ratioCommoditiesBonos,
      timestamp: new Date().toISOString(),
    };

    setCache(CACHE_KEY, result);
    return result;
  },
);

// ─── Server fn ligera: devuelve etapa del ciclo + sectores líderes ──
export const getCicloEconomico = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    ciclo: CicloEconomico;
    bondTrend: number | null;
    spxTrend: number | null;
    commTrend: number | null;
  }> => {
    const CACHE_KEY = "ciclo-economico-v1";
    const cached = getCached<{
      ciclo: CicloEconomico;
      bondTrend: number | null;
      spxTrend: number | null;
      commTrend: number | null;
    }>(CACHE_KEY, 15 * 60 * 1000);
    if (cached) return cached;

    const [bondData, spxData, commData] = await Promise.allSettled([
      yahooChartCloses("^TNX", "2mo"),
      yahooChartCloses("^GSPC", "2mo"),
      yahooChartCloses("DBC", "2mo"),
    ]);

    const extraerTrend = (
      result: PromiseSettledResult<{ close: number }[]>,
      col: "close",
    ): number | null => {
      if (result.status !== "fulfilled") return null;
      const closes = result.value.map((c) => c[col]);
      if (closes.length < 20) return null;
      const pct = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
      return Math.round(pct * 100) / 100;
    };

    // Para bonos: TNX = yield; el trend de PRECIO de bonos es inverso al yield
    const tnxTrend = extraerTrend(bondData, "close");
    const bondPriceTrend = tnxTrend != null ? -tnxTrend : null;
    const spxTrend = extraerTrend(spxData, "close");
    const commTrend = extraerTrend(commData, "close");

    const ciclo = determinarEtapaCiclo({
      bondPriceTrend,
      spxTrend,
      commodityTrend: commTrend,
    });

    const result = { ciclo, bondTrend: bondPriceTrend, spxTrend, commTrend };
    setCache(CACHE_KEY, result);
    return result;
  },
);
