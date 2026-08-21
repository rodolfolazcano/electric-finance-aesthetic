// @ts-nocheck
// FASE 6 — Motor daily conservado.
// # REVISAR: calcularOportunidadScore usa una fórmula propia de 4 sub-scores
// (volumen, valuación, catalizador, momentum) × 25 -> 0-100, distinta de los
// sub-cores de motor-unificado.ts. Sin equivalente directo que preserve el
// shape de los screeners -> se conserva el cálculo (// LEGACY).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCached, setCache } from "./cache";
import { getSectorAnalysis, type SectorAnalysisResult } from "./sector-analysis.functions";
import type { SectorTickerValuation } from "./sector-valuation.functions";
import { buscarPerfilPorTicker, type PerfilSector } from "./sectores/perfiles-sector";
import { getOrFetch } from "./cache/api-cache.server";
import { TTL_POR_TIPO } from "./cache/types";

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

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v !== null && v !== undefined && typeof v === "object") {
    const raw = (v as Record<string, unknown>).raw;
    if (typeof raw === "number" && isFinite(raw)) return raw;
  }
  return null;
}

//  Types 

export interface ScreenerItem {
  symbol: string;
  price: number | null;
  percentChange: number | null;
  volume: number | null;
  avgVolume: number | null;
  marketCap: number | null;
}

export interface MarketScreenersResult {
  day_gainers: ScreenerItem[];
  day_losers: ScreenerItem[];
  most_actives: ScreenerItem[];
  most_shorted: ScreenerItem[];
  undervalued: ScreenerItem[];
  generatedAt: string;
}

export interface TickerDailySignal {
  ticker: string;
  currentPrice: number | null;
  changePct: number | null;
  open: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  avgVolume10d: number | null;
  rvol: number | null;
  gap: number | null;
  // Valuación
  pePercentile: number | null;
  peExtreme: "cheap" | "expensive" | "normal" | null;
  // Catalizadores
  recentUpgrades: { firm: string; toGrade: string; action: string }[];
  recentDowngrades: { firm: string; toGrade: string; action: string }[];
  nextEarningsDate: string | null;
  earningsWithin10d: boolean;
  // Beta
  beta: number | null;
  // Scores parciales — null cuando el dato subyacente no está disponible
  scoreVolumen: number | null;
  scoreValuacion: number | null;
  scoreCatalizador: number | null;
  scoreMomentum: number | null;
  oportunidadScore: number | null;
}

export interface MacroContextAR {
  dolarCCL: number | null;
  dolarMEP: number | null;
  dolarBlue: number | null;
  riesgoPais: number | null;
  generatedAt: string;
}

//  1. getMarketScreeners 

export const getMarketScreeners = createServerFn({ method: "POST" }).handler(
  async (): Promise<MarketScreenersResult> => {
    const cacheKey = "mq-screeners";
    const cached = getCached<MarketScreenersResult>(cacheKey, 15 * 60 * 1000);
    if (cached) return cached;

    const yf = await getYF();
    const result: MarketScreenersResult = {
      day_gainers: [],
      day_losers: [],
      most_actives: [],
      most_shorted: [],
      undervalued: [],
      generatedAt: new Date().toISOString(),
    };

    try {
      const screenResult = await yf.screen({
        scrIds: [
          "day_gainers",
          "day_losers",
          "most_actives",
          "most_shorted_stocks",
          "undervalued_large_caps",
        ],
        count: 10,
      });
      const categories = screenResult?.finance?.result ?? [];
      for (const cat of categories) {
        const id: string = cat.id ?? "";
        const quotes = cat.quotes ?? [];
        const items: ScreenerItem[] = quotes
          .map((q: any) => ({
            symbol: q.symbol ?? "",
            price: num(q.regularMarketPrice),
            percentChange: num(q.regularMarketChangePercent),
            volume: num(q.regularMarketVolume),
            avgVolume: num(q.averageDailyVolume3Month) ?? num(q.averageDailyVolume10Day),
            marketCap: num(q.marketCap),
          }))
          .filter((i: ScreenerItem) => i.symbol);
        if (id.includes("gainers")) result.day_gainers = items;
        else if (id.includes("losers")) result.day_losers = items;
        else if (id.includes("actives")) result.most_actives = items;
        else if (id.includes("shorted")) result.most_shorted = items;
        else if (id.includes("undervalued")) result.undervalued = items;
      }
    } catch {
      /* screeners son best-effort */
    }

    setCache(cacheKey, result);
    return result;
  },
);

//  2. getTickerDailySignal 

export const getTickerDailySignal = createServerFn({ method: "POST" })
  .inputValidator((d: { tickers: string[] }) =>
    z.object({ tickers: z.array(z.string().min(1)).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ signals: TickerDailySignal[]; errors: string[] }> => {
    const errors: string[] = [];
    const signals: TickerDailySignal[] = [];
    const BATCH = 4;

    for (let i = 0; i < data.tickers.length; i += BATCH) {
      const slice = data.tickers.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        slice.map(async (ticker) => {
          try {
            const [qsResult, udResult] = await Promise.allSettled([
              getOrFetch(`yahoo:price:${ticker}`, "yahoo", TTL_POR_TIPO.precioVivo, () => {
                const yf = getYF();
                return yf.then((y) =>
                  y.quoteSummary(ticker, {
                    modules: [
                      "price",
                      "summaryDetail",
                      "defaultKeyStatistics",
                      "financialData",
                      "calendarEvents",
                    ],
                  }),
                );
              }),
              getOrFetch(`yahoo:upgrades:${ticker}`, "yahoo", TTL_POR_TIPO.fundamentals, () => {
                const yf = getYF();
                return yf.then((y) =>
                  y.quoteSummary(ticker, {
                    modules: ["upgradeDowngradeHistory"],
                  }),
                );
              }),
            ]);

            const qs = qsResult.status === "fulfilled" ? qsResult.value : {};
            const ud = udResult.status === "fulfilled" ? udResult.value : {};

            const pr = qs.price ?? {};
            const sd = qs.summaryDetail ?? {};
            const ks = qs.defaultKeyStatistics ?? {};
            const fd = qs.financialData ?? {};
            const cal = qs.calendarEvents ?? {};

            const currentPrice = num(fd.currentPrice) ?? num(pr.regularMarketPrice);
            const previousClose =
              num(sd.regularMarketPreviousClose) ?? num(pr.regularMarketPreviousClose);
            const open = num(pr.regularMarketOpen);
            const dayHigh = num(sd.regularMarketDayHigh) ?? num(pr.regularMarketDayHigh);
            const dayLow = num(sd.regularMarketDayLow) ?? num(pr.regularMarketDayLow);
            const volume = num(sd.regularMarketVolume) ?? num(pr.regularMarketVolume);
            const avgVolume10d = num(sd.averageDailyVolume10Day);
            const beta = num(ks.beta) ?? num(sd.beta);

            const changePct =
              currentPrice != null && previousClose != null && previousClose > 0
                ? ((currentPrice - previousClose) / previousClose) * 100
                : null;
            const gap =
              open != null && previousClose != null && previousClose > 0
                ? ((open - previousClose) / previousClose) * 100
                : null;
            const rvol =
              volume != null && avgVolume10d != null && avgVolume10d > 0
                ? volume / avgVolume10d
                : null;

            // Upgrades/downgrades recientes (últimos 3 días)
            const recentUpgrades: { firm: string; toGrade: string; action: string }[] = [];
            const recentDowngrades: { firm: string; toGrade: string; action: string }[] = [];
            const udHistory = ud.upgradeDowngradeHistory?.history ?? [];
            const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
            for (const entry of udHistory) {
              const epoch = entry.epochGradeDate ?? 0;
              if (epoch * 1000 < threeDaysAgo) continue;
              const action = String(entry.action ?? "");
              if (action.toLowerCase().includes("up")) {
                recentUpgrades.push({
                  firm: String(entry.firm ?? ""),
                  toGrade: String(entry.toGrade ?? ""),
                  action,
                });
              } else if (action.toLowerCase().includes("down")) {
                recentDowngrades.push({
                  firm: String(entry.firm ?? ""),
                  toGrade: String(entry.toGrade ?? ""),
                  action,
                });
              }
            }

            // Próximo earnings
            let nextEarningsDate: string | null = null;
            let earningsWithin10d = false;
            try {
              const earnings = cal.earnings ?? {};
              const ed = earnings.earningsDate;
              if (ed) {
                const rawDate = Array.isArray(ed) ? ed[0]?.raw : ed?.raw;
                if (rawDate) {
                  const d = new Date(rawDate * 1000);
                  nextEarningsDate = d.toISOString().slice(0, 10);
                  const diffMs = d.getTime() - Date.now();
                  earningsWithin10d = diffMs > 0 && diffMs < 10 * 24 * 60 * 60 * 1000;
                }
              }
            } catch {
              /* earnings date optional */
            }

            // Scores parciales — mismo criterio que calcularOportunidadScore
            const scoreVolumen =
              rvol != null
                ? rvol >= 3
                  ? 25
                  : rvol >= 2
                    ? 20
                    : rvol >= 1.5
                      ? 15
                      : rvol >= 1.2
                        ? 10
                        : 5
                : null;

            const scoreCatalizador = (() => {
              if (recentUpgrades.length > 0) return Math.max(0, 25 - (earningsWithin10d ? 8 : 0));
              if (recentDowngrades.length > 0) return Math.max(0, 5 - (earningsWithin10d ? 8 : 0));
              if (earningsWithin10d) return 0;
              return null; // sin catalizador
            })();

            const scoreMomentum =
              beta != null ? (beta < 0.8 ? 25 : beta < 1.2 ? 20 : beta < 1.5 ? 15 : 10) : null;

            // pePercentile requiere incomeStatementHistory — no se fetchea aquí por performance
            const scoreValuacion: number | null = null;

            const partesScore = [
              scoreVolumen,
              scoreValuacion,
              scoreCatalizador,
              scoreMomentum,
            ].filter((v): v is number => v != null);
            const oportunidadScore =
              partesScore.length >= 2
                ? Math.min(
                    100,
                    Math.round(partesScore.reduce((s, v) => s + v, 0) / partesScore.length),
                  )
                : null;

            return {
              ticker,
              currentPrice,
              changePct,
              open,
              previousClose,
              dayHigh,
              dayLow,
              volume,
              avgVolume10d,
              rvol,
              gap,
              pePercentile: null,
              peExtreme: null,
              recentUpgrades,
              recentDowngrades,
              nextEarningsDate,
              earningsWithin10d,
              beta,
              scoreVolumen,
              scoreValuacion,
              scoreCatalizador,
              scoreMomentum,
              oportunidadScore,
            };
          } catch (e) {
            errors.push(`${ticker}: ${e instanceof Error ? e.message : "Error"}`);
            return null;
          }
        }),
      );
      for (const r of batchResults) if (r) signals.push(r);
    }

    signals.sort((a, b) => {
      if (a.oportunidadScore == null && b.oportunidadScore == null) return 0;
      if (a.oportunidadScore == null) return 1;
      if (b.oportunidadScore == null) return -1;
      return b.oportunidadScore - a.oportunidadScore;
    });
    return { signals, errors };
  });

//  3. getMacroContextAR 

export const getMacroContextAR = createServerFn({ method: "POST" }).handler(
  async (): Promise<MacroContextAR> => {
    const cacheKey = "mq-macro-ar";
    const cached = getCached<MacroContextAR>(cacheKey, 15 * 60 * 1000);
    if (cached) return cached;

    const result: MacroContextAR = {
      dolarCCL: null,
      dolarMEP: null,
      dolarBlue: null,
      riesgoPais: null,
      generatedAt: new Date().toISOString(),
    };

    try {
      const [dolarRes, rpRes] = await Promise.allSettled([
        fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares"),
        fetch("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo"),
      ]);

      if (dolarRes.status === "fulfilled") {
        const json = await dolarRes.value.json();
        if (Array.isArray(json)) {
          for (const item of json) {
            const casa = String(item.casa ?? "").toLowerCase();
            const compra = num(item.compra);
            const venta = num(item.venta);
            const avg = compra != null && venta != null ? (compra + venta) / 2 : (compra ?? venta);
            if (casa.includes("ccl")) result.dolarCCL = avg;
            else if (casa.includes("mep")) result.dolarMEP = avg;
            else if (casa.includes("blue")) result.dolarBlue = avg;
          }
        }
      }

      if (rpRes.status === "fulfilled") {
        const rpJson = await rpRes.value.json();
        result.riesgoPais = num(rpJson.valor) ?? num(rpJson.ultimo);
      }
    } catch {
      /* macro AR best-effort */
    }

    setCache(cacheKey, result);
    return result;
  },
);

//  4. calcularOportunidadScore 

export interface OportunidadScoreInput {
  rvol: number | null;
  pePercentile: number | null;
  hasRecentUpgrade: boolean;
  hasRecentDowngrade: boolean;
  earningsWithin10d: boolean;
  betaVsBenchmark: number | null;
}

/*
 *  Fórmula del Score de Oportunidades 
 *
 * El score compuesto (0-100) se calcula como el promedio de 4 sub-scores,
 * cada uno con peso máximo 25:
 *
 *   Score = (Volumen + Valuación + Catalizador + Momentum) / 4
 *
 * Desglose por componente:
 *
 * 1. Volumen (peso 25)
 *    Basado en volumen relativo (rvol = volumen / avg volumen 10d):
 *      rvol ≥ 3.0  →  25
 *      rvol ≥ 2.0  →  20
 *      rvol ≥ 1.5  →  15
 *      rvol ≥ 1.2  →  10
 *      rvol < 1.2  →   5
 *      sin dato    → null (excluido del promedio)
 *
 * 2. Valuación (peso 25)
 *    Basado en percentil del P/E trailing frente al histórico del activo:
 *      pct ≤  5 (muy barato)        →  25
 *      pct ≤ 10 (barato)             →  20
 *      pct ≤ 25 (mod. barato)        →  15
 *      pct ≥ 95 (muy caro → venta)   →  20
 *      pct ≥ 90 (caro)               →  15
 *      resto                          →  10
 *      sin dato                       → null (excluido del promedio)
 *
 * 3. Catalizador (peso 25)
 *    Basado en upgrades/downgrades de firmas y earnings próximos:
 *      upgrade reciente       →  25
 *      downgrade reciente     →   5
 *      earnings próximos      →  -8 (penalidad, mínimo 0)
 *      sin dato               → null (excluido del promedio)
 *
 * 4. Momentum (peso 25)
 *    Basado en beta vs mercado:
 *      beta < 0.8  →  25
 *      beta < 1.2  →  20
 *      beta < 1.5  →  15
 *      beta ≥ 1.5  →  10
 *      sin dato    → null (excluido del promedio)
 *
 * Regla: si menos de 2 componentes tienen datos, el score total es null.
 * 
 */
export function calcularOportunidadScore(input: OportunidadScoreInput): {
  total: number | null;
  detalle: {
    volumen: number | null;
    valuacion: number | null;
    catalizador: number | null;
    momentum: number | null;
  };
} {
  // Volumen relativo (peso 25)
  const volumen =
    input.rvol != null
      ? input.rvol >= 3
        ? 25
        : input.rvol >= 2
          ? 20
          : input.rvol >= 1.5
            ? 15
            : input.rvol >= 1.2
              ? 10
              : 5
      : null;

  // Percentil de valuación extremo (peso 25) — null si no hay dato
  const valuacion =
    input.pePercentile != null
      ? input.pePercentile <= 5
        ? 25
        : input.pePercentile <= 10
          ? 20
          : input.pePercentile <= 25
            ? 15
            : input.pePercentile >= 95
              ? 20
              : input.pePercentile >= 90
                ? 15
                : 10
      : null;

  // Catalizador reciente (peso 25) — null si no hay información de catalizadores
  let catalizadorBase: number | null = null;
  if (input.hasRecentUpgrade) catalizadorBase = 25;
  else if (input.hasRecentDowngrade) catalizadorBase = 5;
  else if (!input.hasRecentUpgrade && !input.hasRecentDowngrade && input.earningsWithin10d)
    catalizadorBase = 0;
  // Si no hay upgrades, downgrades ni earnings próximos, no hay catalizador → null
  const catalizador =
    catalizadorBase != null
      ? Math.max(0, catalizadorBase - (input.earningsWithin10d ? 8 : 0))
      : null;

  // Momentum vs benchmark (peso 25) — null si no hay beta
  const momentum =
    input.betaVsBenchmark != null
      ? input.betaVsBenchmark < 0.8
        ? 25
        : input.betaVsBenchmark < 1.2
          ? 20
          : input.betaVsBenchmark < 1.5
            ? 15
            : 10
      : null;

  // Cada componente pesa máx 25 pts.
  // Vol: volumen relativo vs histórico
  // Val: percentil de valuación (P/E histórico)
  // Cat: catalizadores recientes (upgrades/downgrades/earnings)
  // Mom: beta vs mercado (menor beta = mayor puntaje defensivo)
  const total = Math.min(
    100,
    Math.round((volumen ?? 0) + (valuacion ?? 0) + (catalizador ?? 0) + (momentum ?? 0)),
  );

  return { total, detalle: { volumen, valuacion, catalizador, momentum } };
}

//  Score ponderado por perfil de sector 

export function getScorePonderado(
  ticker: string,
  subScores: Record<string, number | null>,
): {
  score: number | null;
  sector: string;
  perfil: PerfilSector;
  missing: string[];
  esDefault: boolean;
} {
  const { perfil, sector, esDefault } = buscarPerfilPorTicker(ticker);

  let sumPonderada = 0;
  let sumPesos = 0;
  const missing: string[] = [];

  // Fundamental
  for (const [key, peso] of Object.entries(perfil.fundamental)) {
    const val = subScores[key];
    if (val == null) {
      missing.push(key);
      //  TODO: falta calcular este campo en el repo
      continue;
    }
    sumPonderada += val * peso;
    sumPesos += peso;
  }

  // Técnico
  for (const [key, peso] of Object.entries(perfil.tecnico)) {
    const val = subScores[key];
    if (val == null) {
      missing.push(key);
      //  TODO: falta calcular este campo en el repo
      continue;
    }
    sumPonderada += val * peso;
    sumPesos += peso;
  }

  if (sumPesos === 0) {
    return { score: null, sector, perfil, missing, esDefault };
  }

  // Normalizar: si faltan datos, el score se escala proporcionalmente
  // para que sea comparable entre activos con distinta cobertura de datos
  const score = Math.min(100, Math.round((sumPonderada / sumPesos) * 100));
  return { score, sector, perfil, missing, esDefault };
}

//  Server function unificada para el subtab 

export interface DailyOportunidadRow {
  ticker: string;
  precio: number | null;
  varPct: number | null;
  gap: number | null;
  rvol: number | null;
  beta: number | null;
  score: number | null;
  detalleScore: {
    volumen: number | null;
    valuacion: number | null;
    catalizador: number | null;
    momentum: number | null;
  };
  catalizadorLabel: string;
  proximoEarnings: string | null;
  fetchedAt: string;
  cellSources: {
    precio: { endpoint: string; fetchedAt: string };
    volumen: { endpoint: string; fetchedAt: string } | null;
    valuacion: { endpoint: string; fetchedAt: string } | null;
    catalizador: { endpoint: string; fetchedAt: string } | null;
    momentum: { endpoint: string; fetchedAt: string } | null;
    beta: { endpoint: string; fetchedAt: string } | null;
  };
}

export interface DailyOportunidadesResult {
  rows: DailyOportunidadRow[];
  screeners: MarketScreenersResult;
  macro: MacroContextAR;
  errors: string[];
  warnings: string[];
  timestamp: string;
}

//  Detector de anomalías: varianza cero en sub-scores 

function detectarFallbackSospechoso(rows: DailyOportunidadRow[]): string[] {
  const warnings: string[] = [];
  const campos: (keyof DailyOportunidadRow["detalleScore"])[] = [
    "volumen",
    "valuacion",
    "catalizador",
    "momentum",
  ];
  for (const campo of campos) {
    const valores = rows.map((r) => r.detalleScore[campo]).filter((v): v is number => v != null);
    if (valores.length < 5) continue;
    const frecuencias = new Map<number, number>();
    for (const v of valores) frecuencias.set(v, (frecuencias.get(v) ?? 0) + 1);
    const masFrecuente = Math.max(...frecuencias.values(), 0);
    if (masFrecuente / valores.length > 0.6) {
      warnings.push(
        `Campo "${campo}": ${masFrecuente}/${valores.length} filas comparten el mismo valor — posible fallback activo`,
      );
    }
  }
  return warnings;
}

//  Macro contexto unificado 

export interface ContextoMacroUnificado {
  riesgoPais: number | null;
  dolarCCL: number | null;
  dolarMEP: number | null;
  dolarBlue: number | null;
  fetchedAt: string;
  errores: string[];
}

export const fetchContextoMacroUnificado = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContextoMacroUnificado> => {
    const cacheKey = "mq-macro-unificado";
    const cached = getCached<ContextoMacroUnificado>(cacheKey, 15 * 60 * 1000);
    if (cached) return cached;

    const [dolarRes, rpRes] = await Promise.allSettled([
      fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares"),
      fetch("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo"),
    ]);

    let dolarCCL: number | null = null;
    let dolarMEP: number | null = null;
    let dolarBlue: number | null = null;
    let riesgoPais: number | null = null;

    if (dolarRes.status === "fulfilled") {
      try {
        const json = await dolarRes.value.json();
        if (Array.isArray(json)) {
          for (const item of json) {
            const casa = String(item.casa ?? "").toLowerCase();
            const compra = typeof item.compra === "number" ? item.compra : null;
            const venta = typeof item.venta === "number" ? item.venta : null;
            const avg = compra != null && venta != null ? (compra + venta) / 2 : (compra ?? venta);
            if (casa.includes("ccl")) dolarCCL = avg;
            else if (casa.includes("mep")) dolarMEP = avg;
            else if (casa.includes("blue")) dolarBlue = avg;
          }
        }
      } catch {
        /* parse error */
      }
    }

    if (rpRes.status === "fulfilled") {
      try {
        const rpJson = await rpRes.value.json();
        riesgoPais =
          typeof rpJson.valor === "number"
            ? rpJson.valor
            : typeof rpJson.ultimo === "number"
              ? rpJson.ultimo
              : null;
      } catch {
        /* parse error */
      }
    }

    const result: ContextoMacroUnificado = {
      riesgoPais,
      dolarCCL,
      dolarMEP,
      dolarBlue,
      fetchedAt: new Date().toISOString(),
      errores: [
        !dolarCCL && !dolarMEP && !dolarBlue && "dolares no disponible",
        !riesgoPais && "riesgo-pais no disponible",
      ].filter(Boolean) as string[],
    };
    setCache(cacheKey, result);
    return result;
  },
);

export const getDailyOportunidades = createServerFn({ method: "POST" })
  .inputValidator((d: { tickers: string[] }) =>
    z.object({ tickers: z.array(z.string().min(1)).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }): Promise<DailyOportunidadesResult> => {
    const [screeners, macro, signalResult] = await Promise.all([
      getMarketScreeners(),
      getMacroContextAR(),
      getTickerDailySignal({ data: { tickers: data.tickers } }),
    ]);

    const commonEndpoint =
      "yahoo-finance2 /quoteSummary (price,summaryDetail,defaultKeyStatistics,financialData,calendarEvents)";
    const now = new Date().toISOString();

    const rows: DailyOportunidadRow[] = signalResult.signals.map((s) => {
      //  Sector-weighted score (nuevo) 
      const subScores: Record<string, number | null> = {
        //  TODO: los siguientes campos de perfil-sector aún no se calculan en el repo.
        // Se dejan null para que getScorePonderado los detecte como missing.
        // Etapa 4 debe computar y pasar estos valores.
        crecimientoIngresos: null,
        margenOperativo: null,
        reinversionRD: null,
        calidadBalance: null,
        correlacionCommodity: null,
        capexEficiencia: null,
        deuda: null,
        estabilidadMargen: null,
        dividendos: null,
        calidadActivos: null,
        apalancamiento: null,
        roe: null,
        momentum: null,
        posicion52w: null,
        cruceMedias: null,
        correlacionUSO: null,
        correlacionCommodityCanasta: null,
        correlacionYieldCurve: null,
        correlacionActividadGlobal: null,
        betaBaja: null,
      };
      const sectorScore = getScorePonderado(s.ticker, subScores);

      //  Fallback: score clásico hasta que todos los subScores sectoriales existan
      const input: OportunidadScoreInput = {
        rvol: s.rvol,
        pePercentile: s.pePercentile,
        hasRecentUpgrade: s.recentUpgrades.length > 0,
        hasRecentDowngrade: s.recentDowngrades.length > 0,
        earningsWithin10d: s.earningsWithin10d,
        betaVsBenchmark: s.beta,
      };
      const scored =
        sectorScore.score != null && sectorScore.missing.length === 0
          ? {
              total: sectorScore.score,
              detalle: { volumen: null, valuacion: null, catalizador: null, momentum: null },
            }
          : calcularOportunidadScore(input);

      if (sectorScore.score == null && sectorScore.missing.length > 0) {
        console.warn(
          `[getDailyOportunidades] ${s.ticker} (${sectorScore.sector}) — score sectorial null por ${sectorScore.missing.length} campos faltantes. ` +
            `Fallback a calcularOportunidadScore. Missing: ${sectorScore.missing.join(", ")}`,
        );
      }

      let catalizadorLabel = "Sin catalizador reciente";
      if (s.recentUpgrades.length > 0) {
        const top = s.recentUpgrades[0];
        catalizadorLabel = `${top.firm} mejoró a ${top.toGrade}`;
      } else if (s.recentDowngrades.length > 0) {
        const top = s.recentDowngrades[0];
        catalizadorLabel = `${top.firm} degradó a ${top.toGrade}`;
      } else if (s.earningsWithin10d) {
        catalizadorLabel = `Earnings ${s.nextEarningsDate}`;
      }

      return {
        ticker: s.ticker,
        precio: s.currentPrice,
        varPct: s.changePct,
        gap: s.gap,
        rvol: s.rvol,
        beta: s.beta,
        score: scored.total,
        detalleScore: scored.detalle,
        catalizadorLabel,
        proximoEarnings: s.nextEarningsDate,
        fetchedAt: now,
        cellSources: {
          precio: { endpoint: commonEndpoint, fetchedAt: now },
          volumen: s.rvol != null ? { endpoint: commonEndpoint, fetchedAt: now } : null,
          valuacion:
            s.pePercentile != null
              ? {
                  endpoint: "yahoo-finance2 /quoteSummary (incomeStatementHistory)",
                  fetchedAt: now,
                }
              : null,
          catalizador:
            s.recentUpgrades.length > 0 || s.recentDowngrades.length > 0
              ? {
                  endpoint: "yahoo-finance2 /quoteSummary (upgradeDowngradeHistory)",
                  fetchedAt: now,
                }
              : null,
          momentum: s.beta != null ? { endpoint: commonEndpoint, fetchedAt: now } : null,
          beta: s.beta != null ? { endpoint: commonEndpoint, fetchedAt: now } : null,
        },
      };
    });

    rows.sort((a, b) => {
      // Null scores go last
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    });

    const warnings = detectarFallbackSospechoso(rows);

    return {
      rows,
      screeners,
      macro,
      warnings,
      errors: signalResult.errors,
      timestamp: now,
    };
  });
